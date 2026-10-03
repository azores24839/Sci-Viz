#!/usr/bin/env python3
"""Offline case-hub snapshot/restore. Stop all writers before snapshot.

snapshot --db DB --uploads DIR --journal-covers DIR --output DIR --writers-stopped
verify --snapshot DIR [--target RESTORED_DIR]
restore --snapshot DIR --target EMPTY_DIR
Source directories are copied to uploads/ and journal_covers/; SQLite is backed up
using SQLite's backup API to prisma/dev.db. Never copies a live SQLite file.
"""
from contextlib import closing
import argparse
import hashlib
import json
import shutil
import sqlite3
from pathlib import Path, PurePosixPath


def safe_path(root, name):
    p = PurePosixPath(name)
    if p.is_absolute() or '..' in p.parts or '\\' in name or not p.parts:
        raise ValueError(f'Unsafe path: {name}')
    result = root.joinpath(*p.parts)
    for node in [root, *result.parents, result]:
        if node.is_symlink():
            raise ValueError(f'Symlink forbidden: {node}')
    if not result.resolve().is_relative_to(root.resolve()):
        raise ValueError(f'Path escapes root: {name}')
    return result


def files(root):
    if root.is_symlink():
        raise ValueError(f'Symlink forbidden: {root}')
    for p in sorted(root.rglob('*')):
        if p.is_symlink():
            raise ValueError(f'Symlink forbidden: {p}')
        if p.is_file():
            yield p
        elif not p.is_dir():
            raise ValueError(f'Unsupported file: {p}')


def digest(p):
    h = hashlib.sha256()
    with p.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def database_info(db, root):
    with closing(sqlite3.connect(db.resolve().as_uri() + '?mode=ro', uri=True)) as conn:
        if conn.execute('PRAGMA quick_check').fetchall() != [('ok',)]:
            raise ValueError('SQLite quick_check failed')
        count = conn.execute('SELECT COUNT(*) FROM VisualCase').fetchone()[0]
        refs = 0
        for row in conn.execute('SELECT imagePath, thumbnailPath FROM VisualCase'):
            for value in row:
                if not value or value.startswith(('https://', 'http://')):
                    continue
                name = value.lstrip('/')
                if not name.startswith(('uploads/', 'journal_covers/')):
                    raise ValueError(f'Unrecognized local image reference: {value}')
                if not safe_path(root, name).is_file():
                    raise ValueError(f'Missing image reference: {value}')
                refs += 1
    return {'case_count': count, 'local_image_references': refs, 'quick_check': 'ok'}


def empty_target(target):
    if target.is_symlink() or (target.exists() and (not target.is_dir() or any(target.iterdir()))):
        raise ValueError(f'Target must be absent or empty; refusing overwrite: {target}')
    # Check ancestors as well, including paths through a symlink.
    for parent in target.parents:
        if parent.is_symlink():
            raise ValueError(f'Symlink forbidden: {parent}')


def snapshot(db, uploads, covers, output, writers_stopped=False):
    if not writers_stopped:
        raise ValueError('Stop application, crawlers and every database/image writer; pass --writers-stopped only after stopping them')
    empty_target(output)
    for source in (db, uploads, covers):
        if not source.exists() or source.is_symlink() or any(p.is_symlink() for p in source.parents):
            raise ValueError(f'Missing or unsafe source: {source}')
        if output.resolve().is_relative_to(source.resolve()):
            raise ValueError('Snapshot output cannot be inside a source')
    # Enumerate before writing, rejecting symlinks before shutil can follow them.
    list(files(uploads)); list(files(covers))
    output.mkdir(parents=True, exist_ok=True)
    try:
        (output / 'prisma').mkdir()
        (output / 'backups').mkdir()
        with closing(sqlite3.connect(db.resolve().as_uri() + '?mode=ro', uri=True)) as source:
            with closing(sqlite3.connect(output / 'prisma/dev.db')) as dest:
                source.backup(dest)
                dest.execute('PRAGMA journal_mode=DELETE')
        shutil.copytree(uploads, output / 'uploads')
        shutil.copytree(covers, output / 'journal_covers')
        info = database_info(output / 'prisma/dev.db', output)
        entries = {p.relative_to(output).as_posix(): {'size': p.stat().st_size, 'sha256': digest(p)} for p in files(output)}
        manifest = {'version': 1, 'consistency': 'caller confirmed all writers stopped', 'database': info, 'files': entries}
        (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    except Exception:
        shutil.rmtree(output)
        raise
    return manifest


def verify(snapshot_dir, target=None):
    manifest_path = safe_path(snapshot_dir, 'manifest.json')
    manifest = json.loads(manifest_path.read_text())
    if manifest.get('version') != 1 or 'prisma/dev.db' not in manifest.get('files', {}):
        raise ValueError('Invalid snapshot manifest')
    root = target if target is not None else snapshot_dir
    expected = manifest['files']
    for name in ('prisma', 'uploads', 'journal_covers', 'backups'):
        if not safe_path(root, name).is_dir():
            raise ValueError(f'Missing data directory: {name}')
    for name in expected:
        safe_path(root, name)
    actual = {p.relative_to(root).as_posix() for p in files(root)} - {'manifest.json'}
    if actual != set(expected):
        raise ValueError(f'File inventory mismatch: missing={set(expected)-actual}, extra={actual-set(expected)}')
    for name, entry in expected.items():
        if not name.startswith(('prisma/', 'uploads/', 'journal_covers/')):
            raise ValueError(f'Unexpected manifest path: {name}')
        p = safe_path(root, name)
        if p.stat().st_size != entry['size'] or digest(p) != entry['sha256']:
            raise ValueError(f'Checksum mismatch: {name}')
    info = database_info(safe_path(root, 'prisma/dev.db'), root)
    if info != manifest['database']:
        raise ValueError('Database counts do not match manifest')
    return info


def restore(snapshot_dir, target):
    empty_target(target)
    verify(snapshot_dir)
    target.mkdir(parents=True, exist_ok=True)
    try:
        for name in ('prisma', 'uploads', 'journal_covers', 'backups'):
            shutil.copytree(snapshot_dir / name, target / name)
        shutil.copy2(snapshot_dir / 'manifest.json', target / 'manifest.json')
        return verify(snapshot_dir, target)
    except Exception:
        shutil.rmtree(target)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('snapshot')
    for name in ('db', 'uploads', 'journal-covers', 'output'):
        p.add_argument('--' + name, type=Path, required=True)
    p.add_argument('--writers-stopped', action='store_true')
    for command in ('verify', 'restore'):
        p = sub.add_parser(command)
        p.add_argument('--snapshot', type=Path, required=True)
        p.add_argument('--target', type=Path, required=command == 'restore')
    args = parser.parse_args()
    try:
        if args.command == 'snapshot':
            result = snapshot(args.db, args.uploads, args.journal_covers, args.output, args.writers_stopped)
        elif args.command == 'verify':
            result = verify(args.snapshot, args.target)
        else:
            result = restore(args.snapshot, args.target)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (ValueError, OSError, sqlite3.Error, KeyError) as error:
        parser.exit(1, f'ERROR: {error}\n')


if __name__ == '__main__':
    main()
