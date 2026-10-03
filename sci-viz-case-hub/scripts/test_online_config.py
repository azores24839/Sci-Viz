from pathlib import Path
import tempfile
import unittest
from check_online_config import validate

class OnlineSettingsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.file = Path(self.tmp.name)/'online.env'
        self.text = f'CASE_HUB_IMAGE_TAG={"a"*40}\nCASE_HUB_DATA_DIR=/srv/case-hub/data\nJWT_SECRET={"b"*40}\nSTUDIO_SERVICE_KEY={"c"*40}\nCORS_ORIGINS=https://library.school.edu\n'
    def check(self, text):
        self.file.write_text(text)
        return validate(self.file)
    def test_actual_values_pass(self): self.assertEqual(self.check(self.text)['CASE_HUB_DATA_DIR'],'/srv/case-hub/data')
    def test_http_and_placeholder_origins_refused(self):
        for origin in ['http://library.school.edu','https://case-hub.example.edu.cn','https://library.school.edu/','https://user:password@library.school.edu']:
            with self.assertRaises(ValueError): self.check(self.text.replace('https://library.school.edu',origin))
    def test_shared_or_demo_secrets_refused(self):
        for secret in ['b'*40,'local-demo-only-not-for-production']:
            with self.assertRaises(ValueError): self.check(self.text.replace('c'*40,secret))
    def test_relative_data_or_mutable_tag_refused(self):
        for old,new in [('/srv/case-hub/data','./data'),('a'*40,'latest')]:
            with self.assertRaises(ValueError): self.check(self.text.replace(old,new))

if __name__=='__main__': unittest.main()
