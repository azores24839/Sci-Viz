import test from 'node:test';
import assert from 'node:assert/strict';
import { inferSourceOwner } from '../src/services/sourceOwner.js';

test('groups university channels under one canonical owner', () => {
  assert.equal(inferSourceOwner({ name: 'MIT News - Research', url: 'https://news.mit.edu/topic/research', sourceType: 'university_news' }).ownerKey, 'mit');
  assert.equal(inferSourceOwner({ name: 'Harvard Gazette - Science', url: 'https://news.harvard.edu/gazette/section/science/', sourceType: 'university_news' }).ownerKey, 'harvard');
  assert.equal(inferSourceOwner({ name: 'Stanford Engineering - News Feed', url: 'https://engineering.stanford.edu/news', sourceType: 'university_news' }).ownerKey, 'stanford');
  assert.equal(inferSourceOwner({ name: 'CMU Robotics Institute News', url: 'https://www.ri.cmu.edu/news/', sourceType: 'research_institute' }).ownerKey, 'cmu');
  assert.equal(inferSourceOwner({ name: 'UZH RPG', url: 'https://rpg.ifi.uzh.ch/research.html', sourceType: 'visualization_gallery' }).ownerKind, 'university');
});

test('keeps independent institutes and third-party media separate', () => {
  assert.deepEqual(
    inferSourceOwner({ name: 'SLAC National Accelerator Laboratory', url: 'https://www6.slac.stanford.edu/news', sourceType: 'national_lab' }),
    { ownerName: 'SLAC National Accelerator Laboratory', ownerKey: 'slac', ownerDomain: 'stanford.edu', ownerKind: 'research_institute' },
  );
  const media = inferSourceOwner({ name: 'Medical Design Outsourcing', url: 'https://www.medicaldesignandoutsourcing.com/', category: 'ENT', sourceType: 'industry_media' });
  assert.notEqual(media.ownerKey, 'boston-scientific');
  assert.equal(media.ownerKind, 'publisher_media');
});

test('uses official domains instead of competitor mentions in notes', () => {
  const owner = inferSourceOwner({ name: 'Ecovacs', url: 'https://www.ecovacs.com/us', category: 'ENT', sourceType: 'enterprise' });
  assert.equal(owner.ownerKey, 'ecovacs');
  assert.equal(owner.ownerName, 'Ecovacs');
});
