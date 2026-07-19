import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVisionRequestBody, parseVisionAnalysisContent } from '../src/services/vision.js';

const validResult = {
  media_type: '摄影',
  content_type: '实验设备',
  discipline: '工程',
  technical_method: '拍摄',
  composition: '中心式',
  color_tone: '中性',
  functional_purpose: '记录',
  distribution_medium: '静图',
  use_case: ['官网宣传'],
  ai_summary: '实验室中的精密仪器设备',
  case_title: '实验仪器',
  borrowable_points: ['主体突出'],
  risk_notes: [],
  confidence: 0.91,
};

test('vision response parser accepts a complete JSON object', () => {
  const parsed = parseVisionAnalysisContent(JSON.stringify(validResult));
  assert.equal(parsed.ai_summary, validResult.ai_summary);
  assert.equal(parsed.confidence, 0.91);
});

test('vision response parser extracts JSON from markdown or explanatory text', () => {
  const content = `分析结果如下：\n\`\`\`json\n${JSON.stringify(validResult)}\n\`\`\``;
  const parsed = parseVisionAnalysisContent(content);
  assert.equal(parsed.case_title, '实验仪器');
});

test('vision response parser preserves braces inside JSON strings', () => {
  const content = JSON.stringify({ ...validResult, ai_summary: '图中标签写有 {A-1} 的仪器' });
  const parsed = parseVisionAnalysisContent(content);
  assert.equal(parsed.ai_summary, '图中标签写有 {A-1} 的仪器');
});

test('vision response parser rejects truncated JSON so the caller can retry', () => {
  assert.throws(
    () => parseVisionAnalysisContent('{"media_type":"摄影","confidence":0.'),
    /JSON 不完整/,
  );
});

test('vision response parser rejects prose without JSON', () => {
  assert.throws(
    () => parseVisionAnalysisContent('这个任务需要我先分析图片。'),
    /没有返回 JSON 对象/,
  );
});

test('vision response parser rejects structurally incomplete results', () => {
  assert.throws(
    () => parseVisionAnalysisContent(JSON.stringify({ media_type: '摄影', confidence: 0.8 })),
    /缺少必要字段/,
  );
});

test('OpenRouter vision requests enforce structured output and suppress reasoning text', () => {
  const body = buildVisionRequestBody('qwen/test-model', [], 'openrouter', true);
  assert.equal(body.max_tokens, 2200);
  assert.deepEqual(body.reasoning, { effort: 'none', exclude: true });
  assert.deepEqual(body.plugins, [{ id: 'response-healing' }]);
  assert.deepEqual(body.provider, { require_parameters: true });
  assert.equal((body.response_format as { type: string }).type, 'json_schema');
});

test('vision requests can fall back to portable JSON mode', () => {
  const body = buildVisionRequestBody('custom/model', [], 'custom', false);
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.equal(body.reasoning, undefined);
  assert.equal(body.plugins, undefined);
});
