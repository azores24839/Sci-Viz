import type { SourceKind } from '@studio/contracts';

export interface QwenResult { summary: string; ocrText?: string; imageDescription?: string; model: string; provider: 'dashscope' | 'openrouter' }

function config(env: NodeJS.ProcessEnv) {
  const useDashScope = Boolean(env.DASHSCOPE_API_KEY);
  return {
    key: useDashScope ? env.DASHSCOPE_API_KEY! : env.OPENROUTER_API_KEY ?? '',
    endpoint: useDashScope
      ? env.DASHSCOPE_API_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
      : env.OPENROUTER_API_URL ?? 'https://openrouter.ai/api/v1/chat/completions',
    model: useDashScope
      ? env.QWEN_VISION_MODEL ?? 'qwen3.6-plus'
      : env.OPENROUTER_QWEN_MODEL ?? env.VISION_MODEL ?? 'qwen/qwen2.5-vl-72b-instruct',
    provider: useDashScope ? 'dashscope' as const : 'openrouter' as const,
  };
}

export async function summarizeWithQwen(params: {
  env: NodeJS.ProcessEnv;
  kind: SourceKind;
  title: string;
  text: string;
  image?: { mimeType: string; buffer: Buffer };
}): Promise<QwenResult | undefined> {
  const { key, endpoint, model, provider } = config(params.env);
  if (!key) return undefined;
  const instruction = params.image
    ? `分析这张科研资料图片。输出三段纯文本，严格使用以下标题：\nOCR文字：图片中可辨认文字，没有则写“无”\n图片描述：客观描述画面主体、人物、设备、环境和可见关系，不推测未提供的科研事实\n内容摘要：用80-150字总结这份资料对科研视觉策划可能提供的信息，不确定处标“待确认”`
    : `请用中文总结这份${params.kind}资料。输出120-220字，覆盖主题、关键事实、可用于科研视觉策划的信息和待确认项。不要编造原文之外的事实。`;
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: `${instruction}\n\n标题：${params.title}\n\n正文：${params.text.slice(0, 30_000)}` }];
  if (params.image) content.push({ type: 'image_url', image_url: { url: `data:${params.image.mimeType};base64,${params.image.buffer.toString('base64')}` } });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content }], temperature: 0.1, max_tokens: 1200 }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`QWEN_${response.status}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const answer = payload.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error('QWEN_EMPTY_RESPONSE');
    if (!params.image) return { summary: answer, model, provider };
    const ocrText = answer.match(/OCR文字：([\s\S]*?)(?=\n图片描述：|$)/)?.[1]?.trim();
    const imageDescription = answer.match(/图片描述：([\s\S]*?)(?=\n内容摘要：|$)/)?.[1]?.trim();
    const summary = answer.match(/内容摘要：([\s\S]*)$/)?.[1]?.trim() ?? answer;
    return { summary, ...(ocrText && ocrText !== '无' ? { ocrText } : {}), ...(imageDescription ? { imageDescription } : {}), model, provider };
  } finally {
    clearTimeout(timer);
  }
}
