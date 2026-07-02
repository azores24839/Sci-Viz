import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { fileTypeFromBuffer } from 'file-type';
import {
  CompleteUploadRequestSchema,
  CreateTextSourceRequestSchema,
  CreateUploadRequestSchema,
  CreateWebSourceRequestSchema,
  UpdateSourceSelectionRequestSchema,
  type SourceDocument,
  type SourceKind,
} from '@studio/contracts';
import type { SourceRepository } from './repository.js';
import type { ObjectStorage } from './storage.js';
import type { SourceProcessor } from './processor.js';
import { canonicalizeUrl } from './webFetcher.js';

const MAX_FILES_PER_PROJECT = 50;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const allowed = new Map<string, SourceKind>([
  ['application/pdf', 'PDF'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'DOCX'],
  ['image/png', 'IMAGE'], ['image/jpeg', 'IMAGE'],
]);
const now = () => new Date().toISOString();

function publicSource(source: SourceDocument, previewUrl?: string): SourceDocument {
  const { objectKey: _objectKey, ...safe } = source;
  return { ...safe, ...(previewUrl ? { previewUrl } : {}) };
}

async function withPreview(source: SourceDocument, storage: ObjectStorage) {
  const preview = source.objectKey ? await storage.signedGetUrl(source.objectKey) : undefined;
  return publicSource(source, preview);
}

async function assertCapacity(repo: SourceRepository, projectId: string) {
  if ((await repo.list(projectId)).length >= MAX_FILES_PER_PROJECT) throw new Error('SOURCE_LIMIT_REACHED');
}

export async function registerSourceRoutes(app: FastifyInstance, deps: { repo: SourceRepository; storage: ObjectStorage; processor: SourceProcessor }) {
  const { repo, storage, processor } = deps;

  app.get('/api/v1/projects/:projectId/sources', async (request) => {
    const { projectId } = request.params as { projectId: string };
    return { success: true, data: await Promise.all((await repo.list(projectId)).map((source) => withPreview(source, storage))) };
  });

  app.post('/api/v1/sources/text', async (request, reply) => {
    const parsed = CreateTextSourceRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ success: false, error: { code: 'INVALID_TEXT_SOURCE', message: '文字资料不能为空。' } });
    try { await assertCapacity(repo, parsed.data.projectId); } catch { return reply.code(409).send({ success: false, error: { code: 'SOURCE_LIMIT_REACHED', message: '每个项目最多添加 50 份资料。' } }); }
    const stamp = now();
    const source: SourceDocument = { id: randomUUID(), projectId: parsed.data.projectId, kind: 'TEXT', status: 'QUEUED', selected: true, title: parsed.data.title?.trim() || `文字资料 ${new Date().toLocaleDateString('zh-CN')}`, rawText: parsed.data.text, truncated: false, createdAt: stamp, updatedAt: stamp };
    await repo.save(source); processor.enqueue(source.id);
    return reply.code(201).send({ success: true, data: publicSource(source) });
  });

  app.post('/api/v1/sources/web', async (request, reply) => {
    const parsed = CreateWebSourceRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ success: false, error: { code: 'INVALID_WEB_SOURCE', message: '请输入有效的公开网页地址。' } });
    try { await assertCapacity(repo, parsed.data.projectId); } catch { return reply.code(409).send({ success: false, error: { code: 'SOURCE_LIMIT_REACHED', message: '每个项目最多添加 50 份资料。' } }); }
    const canonicalUrl = canonicalizeUrl(parsed.data.url);
    if ((await repo.list(parsed.data.projectId)).some((item) => item.canonicalUrl === canonicalUrl)) return reply.code(409).send({ success: false, error: { code: 'SOURCE_DUPLICATE_URL', message: '这个网页已经添加过。' } });
    const stamp = now();
    const source: SourceDocument = { id: randomUUID(), projectId: parsed.data.projectId, kind: 'WEB', status: 'QUEUED', selected: true, title: new URL(parsed.data.url).hostname, sourceUrl: parsed.data.url, canonicalUrl, truncated: false, createdAt: stamp, updatedAt: stamp };
    await repo.save(source); processor.enqueue(source.id);
    return reply.code(201).send({ success: true, data: publicSource(source) });
  });

  app.post('/api/v1/source-uploads', async (request, reply) => {
    const parsed = CreateUploadRequestSchema.safeParse(request.body);
    if (!parsed.success || !allowed.has(parsed.data?.mimeType ?? '')) return reply.code(400).send({ success: false, error: { code: 'UNSUPPORTED_FILE', message: '仅支持 PDF、DOCX、PNG 和 JPG。' } });
    try { await assertCapacity(repo, parsed.data.projectId); } catch { return reply.code(409).send({ success: false, error: { code: 'SOURCE_LIMIT_REACHED', message: '每个项目最多添加 50 份资料。' } }); }
    const id = randomUUID();
    const extension = parsed.data.fileName.split('.').pop()?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
    const objectKey = `projects/${parsed.data.projectId}/sources/${id}/original.${extension}`;
    const stamp = now();
    const source: SourceDocument = { id, projectId: parsed.data.projectId, kind: allowed.get(parsed.data.mimeType)!, status: 'UPLOADING', selected: true, title: parsed.data.fileName.replace(/\.[^.]+$/, ''), originalName: parsed.data.fileName, mimeType: parsed.data.mimeType, sizeBytes: parsed.data.sizeBytes, objectKey, truncated: false, createdAt: stamp, updatedAt: stamp };
    await repo.save(source);
    const uploadUrl = await storage.signedPutUrl(objectKey, parsed.data.mimeType);
    return reply.code(201).send({ success: true, data: { source: publicSource(source), storageMode: storage.mode, uploadUrl } });
  });

  app.post('/api/v1/source-uploads/local', async (request, reply) => {
    if (storage.mode !== 'local') return reply.code(404).send({ success: false, error: { code: 'LOCAL_UPLOAD_DISABLED', message: '生产环境请使用 OSS 直传。' } });
    const file = await request.file({ limits: { fileSize: MAX_FILE_BYTES, files: 1 } });
    const projectId = file?.fields.projectId && 'value' in file.fields.projectId ? String(file.fields.projectId.value) : '';
    const sourceId = file?.fields.sourceId && 'value' in file.fields.sourceId ? String(file.fields.sourceId.value) : '';
    if (!file || !projectId || !sourceId) return reply.code(400).send({ success: false, error: { code: 'INVALID_UPLOAD', message: '缺少文件或项目标识。' } });
    const pendingSource = await repo.get(sourceId);
    if (!pendingSource || pendingSource.projectId !== projectId || pendingSource.status !== 'UPLOADING' || !pendingSource.objectKey) return reply.code(404).send({ success: false, error: { code: 'SOURCE_NOT_FOUND', message: '没有找到待上传的资料记录。' } });
    const buffer = await file.toBuffer();
    const detected = await fileTypeFromBuffer(buffer);
    const mimeType = detected?.mime === 'application/zip' && file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ? file.mimetype
      : detected?.mime ?? file.mimetype;
    const kind = allowed.get(mimeType);
    if (!kind) return reply.code(400).send({ success: false, error: { code: 'UNSUPPORTED_FILE', message: '文件真实类型不受支持。' } });
    const hash = createHash('sha256').update(buffer).digest('hex');
    if ((await repo.list(projectId)).some((item) => item.id !== sourceId && item.contentHash === hash)) { await repo.remove(sourceId); return reply.code(409).send({ success: false, error: { code: 'SOURCE_DUPLICATE_FILE', message: '相同文件已经上传过。' } }); }
    await storage.put(pendingSource.objectKey, buffer, mimeType);
    const stamp = now();
    const source: SourceDocument = { ...pendingSource, kind, status: 'QUEUED', title: file.filename.replace(/\.[^.]+$/, ''), originalName: file.filename, mimeType, sizeBytes: buffer.length, contentHash: hash, updatedAt: stamp };
    await repo.save(source); processor.enqueue(sourceId);
    return reply.code(201).send({ success: true, data: await withPreview(source, storage) });
  });

  app.post('/api/v1/source-uploads/complete', async (request, reply) => {
    const parsed = CompleteUploadRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ success: false, error: { code: 'INVALID_UPLOAD_COMPLETION', message: '上传确认信息无效。' } });
    const source = await repo.get(parsed.data.sourceId);
    if (!source || source.projectId !== parsed.data.projectId || !source.objectKey) return reply.code(404).send({ success: false, error: { code: 'SOURCE_NOT_FOUND', message: '没有找到待确认的资料。' } });
    const buffer = await storage.get(source.objectKey);
    const detected = await fileTypeFromBuffer(buffer);
    const mimeType = detected?.mime === 'application/zip' && source.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ? source.mimeType
      : detected?.mime ?? source.mimeType ?? '';
    const kind = allowed.get(mimeType);
    if (!kind || buffer.length > MAX_FILE_BYTES) { await storage.remove(source.objectKey); return reply.code(400).send({ success: false, error: { code: 'UNSUPPORTED_FILE', message: '上传文件的真实类型或大小不符合要求。' } }); }
    const hash = createHash('sha256').update(buffer).digest('hex');
    const duplicate = (await repo.list(source.projectId)).find((item) => item.id !== source.id && item.contentHash === hash);
    if (duplicate) { await storage.remove(source.objectKey); await repo.remove(source.id); return reply.code(409).send({ success: false, error: { code: 'SOURCE_DUPLICATE_FILE', message: '相同文件已经上传过。' } }); }
    const queued = { ...source, kind, status: 'QUEUED' as const, mimeType, sizeBytes: buffer.length, contentHash: hash, updatedAt: now() };
    await repo.save(queued); processor.enqueue(queued.id);
    return { success: true, data: await withPreview(queued, storage) };
  });

  app.patch('/api/v1/sources/:id/selection', async (request, reply) => {
    const parsed = UpdateSourceSelectionRequestSchema.safeParse(request.body); const { id } = request.params as { id: string }; const source = await repo.get(id);
    if (!parsed.success || !source) return reply.code(404).send({ success: false, error: { code: 'SOURCE_NOT_FOUND', message: '资料不存在。' } });
    const updated = { ...source, selected: parsed.data.selected, updatedAt: now() }; await repo.save(updated); return { success: true, data: await withPreview(updated, storage) };
  });

  app.post('/api/v1/sources/:id/retry', async (request, reply) => {
    const { id } = request.params as { id: string }; const source = await repo.get(id);
    if (!source) return reply.code(404).send({ success: false, error: { code: 'SOURCE_NOT_FOUND', message: '资料不存在。' } });
    const queued = { ...source, status: 'QUEUED' as const, updatedAt: now() }; await repo.save(queued); processor.enqueue(id); return { success: true, data: await withPreview(queued, storage) };
  });

  app.delete('/api/v1/sources/:id', async (request, reply) => {
    const { id } = request.params as { id: string }; const source = await repo.get(id);
    if (!source) return reply.code(404).send({ success: false, error: { code: 'SOURCE_NOT_FOUND', message: '资料不存在。' } });
    if (source.objectKey) await storage.remove(source.objectKey); await repo.remove(id); return reply.code(204).send();
  });

  app.get('/api/v1/source-objects/*', async (request, reply) => {
    if (storage.mode !== 'local') return reply.code(404).send();
    const key = decodeURIComponent((request.params as { '*': string })['*']);
    const extension = key.split('.').pop()?.toLowerCase();
    const mimeType = extension === 'png' ? 'image/png' : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : extension === 'pdf' ? 'application/pdf' : 'application/octet-stream';
    try { const body = await storage.get(key); return reply.type(mimeType).send(body); } catch { return reply.code(404).send(); }
  });
}
