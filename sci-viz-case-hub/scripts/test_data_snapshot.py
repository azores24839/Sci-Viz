import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from data_snapshot import snapshot, verify, restore


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.db = self.root / 'source.db'
        self.uploads = self.root / 'uploads'
        self.covers = self.root / 'journal_covers'
        self.uploads.mkdir(); self.covers.mkdir()
        (self.uploads / 'original.jpg').write_bytes(b'original')
        (self.uploads / 'thumb.jpg').write_bytes(b'thumbnail')
        (self.covers / 'cover.jpg').write_bytes(b'cover')
        with sqlite3.connect(self.db) as c:
            c.execute('PRAGMA journal_mode=WAL')
            c.execute('CREATE TABLE VisualCase (imagePath TEXT, thumbnailPath TEXT)')
            c.execute('INSERT INTO VisualCase VALUES (?, ?)', ('/uploads/original.jpg', '/uploads/thumb.jpg'))
            c.execute('INSERT INTO VisualCase VALUES (?, ?)', ('/journal_covers/cover.jpg', ''))
        self.snap = self.root / 'snapshot'

    def make(self):
        return snapshot(self.db, self.uploads, self.covers, self.snap, True)

    def test_roundtrip(self):
        self.make()
        target = self.root / 'restored'
        result = restore(self.snap, target)
        self.assertEqual(result['case_count'], 2)
        self.assertEqual(result['local_image_references'], 3)
        self.assertEqual(result, verify(self.snap, target))
        self.assertTrue((target / 'backups').is_dir())
        self.assertEqual((target / 'journal_covers/cover.jpg').read_bytes(), b'cover')

    def test_wal_committed_rows(self):
        connection = sqlite3.connect(self.db)
        try:
            connection.execute('PRAGMA journal_mode=WAL')
            connection.execute('INSERT INTO VisualCase VALUES (?, ?)', ('/uploads/original.jpg', ''))
            connection.commit()
            self.assertTrue(Path(str(self.db) + '-wal').exists())
            self.make()
            self.assertEqual(verify(self.snap)['case_count'], 3)
            self.assertFalse((self.snap / 'prisma/dev.db-wal').exists())
        finally:
            connection.close()

    def test_verify_restored_corruption(self):
        self.make()
        target = self.root / 'restored'
        restore(self.snap, target)
        (target / 'uploads/thumb.jpg').write_bytes(b'corrupt')
        with self.assertRaisesRegex(ValueError, 'Checksum'):
            verify(self.snap, target)

    def test_stop_required(self):
        with self.assertRaises(ValueError):
            snapshot(self.db, self.uploads, self.covers, self.snap)
        self.assertFalse(self.snap.exists())

    def test_tamper_and_missing(self):
        self.make()
        p = self.snap / 'uploads/original.jpg'
        p.write_bytes(b'modified')
        with self.assertRaisesRegex(ValueError, 'Checksum'):
            restore(self.snap, self.root / 'restored')
        p.unlink()
        with self.assertRaisesRegex(ValueError, 'inventory'):
            verify(self.snap)

    def test_refuse_overwrite(self):
        self.make()
        target = self.root / 'restored'
        target.mkdir()
        (target / 'important').write_text('preserve')
        with self.assertRaises(ValueError):
            restore(self.snap, target)
        self.assertEqual((target / 'important').read_text(), 'preserve')
        with self.assertRaises(ValueError):
            self.make()

    def test_symlink(self):
        (self.uploads / 'link').symlink_to(self.db)
        with self.assertRaisesRegex(ValueError, 'unsafe|Symlink'):
            self.make()
        self.assertFalse(self.snap.exists())

    def test_traversal_manifest(self):
        self.make()
        p = self.snap / 'manifest.json'
        m = json.loads(p.read_text())
        m['files']['uploads/../../source.db'] = m['files']['prisma/dev.db']
        p.write_text(json.dumps(m))
        with self.assertRaises(ValueError):
            verify(self.snap)

    def test_missing_reference(self):
        (self.uploads / 'thumb.jpg').unlink()
        with self.assertRaisesRegex(ValueError, 'Missing image'):
            self.make()
        self.assertFalse(self.snap.exists())


if __name__ == '__main__':
    unittest.main()
