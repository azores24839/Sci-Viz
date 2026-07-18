import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { ImageValidationError, validateImageBuffer } from '../src/services/image.js';

test('image validation rejects undersized and oversized payloads before decoding', async () => {
  await assert.rejects(() => validateImageBuffer(Buffer.alloc(100)), ImageValidationError);
  await assert.rejects(() => validateImageBuffer(Buffer.alloc(15 * 1024 * 1024 + 1)), ImageValidationError);
});

test('image validation converts decoder failures into a safe validation error', async () => {
  await assert.rejects(() => validateImageBuffer(Buffer.alloc(12 * 1024, 1)), ImageValidationError);
});

test('image validation keeps useful narrow banners', async () => {
  const banner = await sharp({
    create: { width: 1200, height: 60, channels: 3, background: '#6172a4' },
  }).png().toBuffer();
  const dimensions = await validateImageBuffer(banner);
  assert.deepEqual(dimensions, { width: 1200, height: 60 });
});
