import assert from 'node:assert/strict';
import test from 'node:test';
import { toPublicCaseDto } from '../src/services/publicCase.js';

test('public case DTO exposes presentation fields and strips internal evidence and notes', () => {
  const result = toPublicCaseDto({
    id: 'case-1',
    title: 'Public title',
    thumbnailPath: '/uploads/thumbnails/case-1.jpg',
    functionalPurpose: '解释',
    ocrText: 'private OCR text',
    contextText: 'internal source context',
    manualNotes: 'reviewer note',
    riskNotes: 'internal risk',
    collectionReasons: 'crawler scoring details',
    imageHash: 'private-hash',
    userHint: 'internal hint',
  });

  assert.equal(result.id, 'case-1');
  assert.equal(result.functionalPurpose, '解释');
  for (const internalField of ['ocrText', 'contextText', 'manualNotes', 'riskNotes', 'collectionReasons', 'imageHash', 'userHint']) {
    assert.equal(Object.hasOwn(result, internalField), false, `${internalField} must not be public`);
  }
});
