import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import type { SourceDocument } from '@studio/contracts';
import type { ObjectStorage } from './storage.js';
import type { SourceRepository } from './repository.js';
import { fetchWebSource } from './webFetcher.js';
import { summarizeWithQwen } from './qwen.js';

const MAX_TEXT = 50_000;
const clipped = (text: string) => ({ text: text.slice(0, MAX_TEXT), truncated: text.length > MAX_TEXT });

export class SourceProcessor {
  private running = 0;
  private pending: string[] = [];
  private scheduled = new Set<string>();
  constructor(private repo: SourceRepository, private storage: ObjectStorage, private env: NodeJS.ProcessEnv, private concurrency = 2) {}

  async resume() { for (const source of await this.repo.listPending()) this.enqueue(source.id); }
  enqueue(id: string) { if (this.scheduled.has(id)) return; this.scheduled.add(id); this.pending.push(id); this.pump(); }
  private pump() { while (this.running < this.concurrency && this.pending.length) { const id = this.pending.shift()!; this.running += 1; void this.process(id).finally(() => { this.running -= 1; this.scheduled.delete(id); this.pump(); }); } }

  private async process(id: string) {
    const source = await this.repo.get(id);
    if (!source) return;
    try {
      await this.repo.save({ ...source, status: 'PARSING', updatedAt: new Date().toISOString(), errorCode: undefined, errorMessage: undefined });
      let current = await this.parse(source);
      await this.repo.save(current);
      const text = current.extractedText ?? current.rawText ?? current.ocrText ?? '';
      current = { ...current, status: 'SUMMARIZING', updatedAt: new Date().toISOString() };
      await this.repo.save(current);
      const image = current.kind === 'IMAGE' && current.objectKey
        ? { mimeType: current.mimeType ?? 'image/jpeg', buffer: await this.storage.get(current.objectKey) }
        : undefined;
      let result;
      try { result = await summarizeWithQwen({ env: this.env, kind: current.kind, title: current.title, text, ...(image ? { image } : {}) }); }
      catch (error) { console.warn('[sources] Qwen summary failed', error); }
      const completed: SourceDocument = {
        ...current,
        status: result ? 'READY' : 'READY_WITHOUT_SUMMARY',
        ...(result ? { aiSummary: result.summary, summaryProvider: result.provider, summaryModel: result.model } : {}),
        ...(result?.ocrText ? { ocrText: result.ocrText } : {}),
        ...(result?.imageDescription ? { imageDescription: result.imageDescription } : {}),
        updatedAt: new Date().toISOString(),
      };
      await this.repo.save(completed);
    } catch (error) {
      const latest = await this.repo.get(id) ?? source;
      await this.repo.save({ ...latest, status: 'FAILED', errorCode: error instanceof Error ? error.message.split(':')[0] : 'SOURCE_PARSE_FAILED', errorMessage: error instanceof Error ? error.message : '资料解析失败', updatedAt: new Date().toISOString() });
    }
  }

  private async parse(source: SourceDocument): Promise<SourceDocument> {
    let extractedText = source.rawText ?? '';
    let pageCount: number | undefined;
    let truncated = source.truncated;
    if (source.kind === 'WEB' && source.sourceUrl) {
      const result = await fetchWebSource(source.sourceUrl);
      if (result.type === 'pdf') {
        const objectKey = source.objectKey ?? `${source.projectId}/${source.id}.pdf`;
        await this.storage.put(objectKey, result.buffer, 'application/pdf');
        source = { ...source, kind: 'PDF', objectKey, mimeType: 'application/pdf', sizeBytes: result.buffer.length, sourceUrl: result.finalUrl, fetchedAt: new Date().toISOString() };
      } else {
        const value = clipped(result.text); extractedText = value.text; truncated = value.truncated;
        source = { ...source, title: result.title, sourceUrl: result.finalUrl, fetchedAt: new Date().toISOString() };
      }
    }
    if ((source.kind === 'PDF' || source.kind === 'DOCX') && source.objectKey) {
      const buffer = await this.storage.get(source.objectKey);
      if (source.kind === 'DOCX') extractedText = (await mammoth.extractRawText({ buffer })).value.trim();
      else {
        const parser = new PDFParse({ data: buffer });
        try {
          const result = await parser.getText();
          extractedText = result.pages.map((page) => `[第${page.num}页]\n${page.text}`).join('\n\n').trim();
          pageCount = result.total;
          if (extractedText.replace(/\[第\d+页\]/g, '').trim().length < 80) {
            const pagesToRead = Math.min(result.total, Number(this.env.PDF_OCR_MAX_PAGES ?? 12));
            const screenshots = await parser.getScreenshot({ first: pagesToRead, scale: 1.4, imageBuffer: true });
            const pageTexts: string[] = [];
            for (const page of screenshots.pages) {
              const ocr = await summarizeWithQwen({
                env: this.env,
                kind: 'IMAGE',
                title: `${source.title} 第 ${page.pageNumber} 页`,
                text: '',
                image: { mimeType: 'image/png', buffer: Buffer.from(page.data) },
              });
              if (ocr?.ocrText) pageTexts.push(`[第${page.pageNumber}页]\n${ocr.ocrText}`);
            }
            if (pageTexts.length === 0) throw new Error('SCANNED_PDF_OCR_UNAVAILABLE');
            extractedText = pageTexts.join('\n\n');
            if (result.total > pagesToRead) truncated = true;
          }
        } finally { await parser.destroy(); }
      }
      const value = clipped(extractedText); extractedText = value.text; truncated = value.truncated;
    }
    return { ...source, extractedText, ...(pageCount ? { pageCount } : {}), truncated, updatedAt: new Date().toISOString() };
  }
}
