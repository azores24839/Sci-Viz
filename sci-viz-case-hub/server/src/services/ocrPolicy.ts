export function isAppleVisionOcrEnabled(value = process.env.ENABLE_APPLE_VISION_OCR): boolean {
  return value === 'true';
}
