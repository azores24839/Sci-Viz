"""Fault-inject the actual SSH deployment script without contacting a server."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

WORKFLOW = Path(__file__).resolve().parents[2] / '.github/workflows/docker-build-push.yml'
OLD_TAG = '1' * 40
NEW_TAG = '2' * 40

class ReleaseRollbackTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        # Extract the final literal shell block; no YAML package needed on the operator host.
        text = WORKFLOW.read_text().rsplit('          script: |\n', 1)[1]
        script = '\n'.join(line[12:] for line in text.splitlines())
        values = {'vars.CASE_HUB_COMPOSE_DIR': str(self.root), 'env.REGISTRY': 'ghcr.io',
                  'env.IMAGE_NAME': 'azores24839/sci-viz-case-hub',
                  'needs.build-and-push.outputs.image_version': NEW_TAG}
        for key, value in values.items():
            script = script.replace('${{ ' + key + ' }}', value)
        self.assertNotIn('${{', script)
        self.script = self.root / 'deploy.sh'
        self.script.write_text(script)
        bin_dir = self.root / 'bin'
        bin_dir.mkdir()
        docker = bin_dir / 'docker'
        docker.write_text('''#!/bin/sh
printf 'tag=%s %s\\n' "${CASE_HUB_IMAGE_TAG:-unset}" "$*" >> "$CALL_LOG"
if [ "$1" = inspect ]; then echo "ghcr.io/azores24839/sci-viz-case-hub:$OLD_TAG"; exit 0; fi
case "$*" in
 *"up -d"*) if [ "$CASE_HUB_IMAGE_TAG" = "$NEW_TAG" ]; then exit "${UP_EXIT:-0}"; fi ;;
 *"port sci-viz-hub"*) echo '127.0.0.1:3001' ;;
esac
''')
        docker.chmod(0o755)
        curl = bin_dir / 'curl'
        curl.write_text('#!/bin/sh\nexit "${CURL_EXIT:-0}"\n')
        curl.chmod(0o755)
        self.log = self.root / 'calls'
        self.env = {**os.environ, 'PATH': str(bin_dir) + ':' + os.environ['PATH'],
                    'CALL_LOG': str(self.log), 'OLD_TAG': OLD_TAG, 'NEW_TAG': NEW_TAG}

    def run_deploy(self, **env):
        return subprocess.run(['sh', str(self.script)], env={**self.env, **env}, capture_output=True, text=True)

    def assert_failed_release_restored_old_tag(self, result):
        self.assertEqual(result.returncode, 1, result.stderr)
        calls = self.log.read_text()
        self.assertIn('tag=' + OLD_TAG + ' compose -f docker-compose.prod.yml up -d --force-recreate --pull never', calls)
        self.assertNotIn('image tag', calls)

    def test_failed_container_start_rolls_back_without_retagging(self):
        self.assert_failed_release_restored_old_tag(self.run_deploy(UP_EXIT='1'))

    def test_failed_health_probe_rolls_back_without_retagging(self):
        self.assert_failed_release_restored_old_tag(self.run_deploy(CURL_EXIT='1'))

    def test_successful_release_keeps_new_tag_and_previous_image(self):
        result = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.log.read_text()
        self.assertNotIn('--force-recreate', calls)
        self.assertNotIn('image prune', calls)

if __name__ == '__main__':
    unittest.main()
