import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parent / 'backup_daily.sh'

class DailyBackupTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.data = self.root / 'data'
        for name in ['prisma', 'uploads', 'journal_covers']:
            (self.data / name).mkdir(parents=True)
        (self.data / 'uploads/image.png').write_bytes(b'image')
        with sqlite3.connect(self.data / 'prisma/dev.db') as c:
            c.execute('CREATE TABLE VisualCase (imagePath TEXT, thumbnailPath TEXT)')
            c.execute("INSERT INTO VisualCase VALUES ('/uploads/image.png','')")
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        for name, body in {'flock': 'exit 0', 'docker': '''printf '%s\\n' "$*" >> "$DOCKER_LOG"
case "$*" in *"ps --status running"*) echo fixture-container;; esac''', 'rsync': 'exit 9'}.items():
            p = self.bin / name
            p.write_text('#!/bin/sh\n' + body + '\n')
            p.chmod(0o755)
        self.log = self.root / 'docker.log'
        self.snapshots = self.root / 'snapshots'
        self.env = {**os.environ, 'PATH': str(self.bin)+':'+os.environ['PATH'],
                    'DOCKER_LOG': str(self.log), 'CASE_HUB_COMPOSE_DIR': str(self.root),
                    'CASE_HUB_DATA_DIR': str(self.data), 'CASE_HUB_SNAPSHOT_DIR': str(self.snapshots),
                    'CASE_HUB_WRITERS_MANAGED': 'true', 'CASE_HUB_SNAPSHOT_KEEP': '7', 'CASE_HUB_OFFSITE_DEST': ''}

    def run_backup(self, **env):
        return subprocess.run(['bash', str(SCRIPT)], env={**self.env, **env}, capture_output=True, text=True)

    def test_verified_backup_resumes_running_service(self):
        r = self.run_backup()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(len(list(self.snapshots.glob('*/manifest.json'))), 1)
        calls = self.log.read_text()
        self.assertIn('stop sci-viz-hub', calls)
        self.assertIn('start sci-viz-hub', calls)

    def test_failed_snapshot_resumes_service(self):
        (self.data / 'uploads/image.png').unlink()
        r = self.run_backup()
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('start sci-viz-hub', self.log.read_text())
        self.assertEqual(list(self.snapshots.glob('*/manifest.json')), [])

    def test_offsite_failure_keeps_local_snapshot_and_resumes_service(self):
        r = self.run_backup(CASE_HUB_OFFSITE_DEST='fixture:/private/backup')
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual(len(list(self.snapshots.glob('*/manifest.json'))), 1)
        self.assertIn('start sci-viz-hub', self.log.read_text())

    def test_external_writers_not_confirmed_refuses_to_stop(self):
        r = self.run_backup(CASE_HUB_WRITERS_MANAGED='false')
        self.assertNotEqual(r.returncode, 0)
        self.assertFalse(self.log.exists())

if __name__ == '__main__':
    unittest.main()
