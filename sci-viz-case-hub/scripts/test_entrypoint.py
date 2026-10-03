"""Exercise the real entrypoint's orchestration with failing/succeeding CLI adapters."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ENTRYPOINT = Path(__file__).resolve().parents[1] / 'docker-entrypoint.sh'

class EntrypointTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.server = self.root / 'server'
        (self.server / 'prisma').mkdir(parents=True)
        (self.server / 'prisma/schema.prisma').write_text('old schema')
        self.template = self.root / 'schema.prisma'
        self.template.write_text('new schema')
        bin_dir = self.root / 'bin'
        bin_dir.mkdir()
        node = bin_dir / 'node'
        node.write_text('''#!/bin/sh
printf '%s\\n' "$*" >> "$CALL_LOG"
if [ "$1" = dist/utils/backup.js ]; then exit "${BACKUP_EXIT:-0}"; fi
''')
        node.chmod(0o755)
        npx = bin_dir / 'npx'
        npx.write_text('''#!/bin/sh
printf '%s\\n' "$*" >> "$CALL_LOG"
[ "$(cat prisma/schema.prisma)" = "new schema" ] || exit 99
exit "${MIGRATE_EXIT:-0}"
''')
        npx.chmod(0o755)
        self.log = self.root / 'calls'
        self.env = {**os.environ, 'PATH': str(bin_dir) + ':' + os.environ['PATH'],
                    'CALL_LOG': str(self.log), 'NODE_ENV': 'production',
                    'CASE_HUB_SERVER_DIR': str(self.server),
                    'CASE_HUB_SCHEMA_TEMPLATE': str(self.template),
                    'CASE_HUB_ALLOW_DATABASE_INITIALIZATION': 'false'}

    def run_entrypoint(self, **env):
        return subprocess.run(['sh', str(ENTRYPOINT)], env={**self.env, **env}, capture_output=True, text=True)

    def calls(self):
        return self.log.read_text().splitlines() if self.log.exists() else []

    def test_updates_stale_schema_only_after_backup(self):
        (self.server / 'prisma/dev.db').write_bytes(b'existing')
        self.assertEqual(self.run_entrypoint().returncode, 0)
        self.assertEqual(self.calls(), ['dist/utils/backup.js', '--no-install prisma db push --skip-generate', 'dist/index.js'])
        self.assertEqual((self.server / 'prisma/schema.prisma').read_text(), 'new schema')

    def test_backup_failure_preserves_schema_and_blocks_start(self):
        (self.server / 'prisma/dev.db').write_bytes(b'existing')
        self.assertNotEqual(self.run_entrypoint(BACKUP_EXIT='7').returncode, 0)
        self.assertEqual(self.calls(), ['dist/utils/backup.js'])
        self.assertEqual((self.server / 'prisma/schema.prisma').read_text(), 'old schema')

    def test_missing_database_refused_without_mutation(self):
        self.assertNotEqual(self.run_entrypoint().returncode, 0)
        self.assertEqual(self.calls(), [])
        self.assertEqual((self.server / 'prisma/schema.prisma').read_text(), 'old schema')

    def test_migration_failure_blocks_server(self):
        (self.server / 'prisma/dev.db').write_bytes(b'existing')
        self.assertNotEqual(self.run_entrypoint(MIGRATE_EXIT='8').returncode, 0)
        self.assertNotIn('dist/index.js', self.calls())

    def test_explicit_empty_production_initialization_does_not_seed(self):
        self.assertEqual(self.run_entrypoint(CASE_HUB_ALLOW_DATABASE_INITIALIZATION='true').returncode, 0)
        self.assertEqual(self.calls(), ['--no-install prisma db push --skip-generate', 'dist/index.js'])

    def test_restart_never_reseeds_existing_database(self):
        (self.server / 'prisma/dev.db').write_bytes(b'existing')
        self.assertEqual(self.run_entrypoint(CASE_HUB_ALLOW_DATABASE_INITIALIZATION='true', NODE_ENV='development').returncode, 0)
        self.assertNotIn('dist/seed.js', self.calls())

if __name__ == '__main__':
    unittest.main()
