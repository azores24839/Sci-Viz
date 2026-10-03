import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { getStoragePaths, localImagePath } from '../src/config/storage.js';

test('one configured data root maps original, thumbnail, cover, backups and actual database', () => {
  const root = path.resolve('/tmp/test-library');
  const paths = getStoragePaths({ CASE_HUB_STORAGE_ROOT: root, DATABASE_URL: `file:${root}/prisma/custom.db` });
  assert.equal(paths.databasePath, path.join(root,'prisma/custom.db'));
  assert.equal(paths.backupsDir,path.join(root,'backups'));
  assert.equal(localImagePath('/uploads/originals/test.png',paths),path.join(root,'uploads/originals/test.png'));
  assert.equal(localImagePath('/uploads/thumbnails/test.jpg',paths),path.join(root,'uploads/thumbnails/test.jpg'));
  assert.equal(localImagePath('/journal_covers/nature/test.jpg',paths),path.join(root,'journal_covers/nature/test.jpg'));
});

test('local image paths cannot escape either configured storage root', () => {
  const paths = getStoragePaths({CASE_HUB_STORAGE_ROOT:'/tmp/library'});
  for(const input of ['/uploads/../../private', '/journal_covers/../secret', '/uploads//etc/passwd', '/uploads/../uploads-extra/test', '/uploads/..\\secret', 'https://example.com/image.png']) assert.equal(localImagePath(input,paths),null,input);
});
