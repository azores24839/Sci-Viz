import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanDocument, ShotCard, StudioProject } from '@studio/contracts';
import type { PlanRepository } from '../plans/repository.js';
import type { WorkspaceRepository } from '../workspace/repository.js';
import { FileReviewRepository } from './repository.js';
import { registerReviewRoutes } from './routes.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const ownerUserId = 'user-owner';
const stamp = '2026-07-03T00:00:00.000Z';
const project: StudioProject = { id: projectId, ownerUserId, name: '量子实验室', teamType: '实验室', researchDirection: '量子材料', primaryAudience: '科研同行', projectType: 'PHOTO', status: 'ACTIVE', createdAt: stamp, updatedAt: stamp };
const plan: PlanDocument = { projectId, title: '摄影方案', currentVersion: 2, createdAt: stamp, updatedAt: stamp, content: { executiveSummary: '摘要', goals: '目标', visualDiagnosis: '诊断', benchmarkSummary: '对标', curationStrategy: '策略', shootingApproach: '拍法', sourceIds: ['private-source-url'], risks: [{ id: '22222222-2222-4222-8222-222222222222', category: 'SAFETY', severity: 'WARNING', description: '激光风险', resolved: false, resolution: '', sourceIds: ['private-source-id'] }] } };
const card: ShotCard = { id: '33333333-3333-4333-8333-333333333333', projectId, title: '设备全景', purpose: '说明环境', subject: '设备', scene: '实验室', peopleEquipmentMaterials: ['设备'], shotSize: '全景', cameraAngle: '平拍', composition: '居中', lighting: '顶光', colorTone: '', action: '运行', scienceInfo: '信息', priority: 'MUST', risks: [], referenceCaseIds: ['private-case'], referenceImageUrls: ['https://private/image.jpg'], sortOrder: 0, revision: 1, createdAt: stamp, updatedAt: stamp };

describe('review routes', () => {
  let directory: string; let filePath: string; let reviews: FileReviewRepository;
  beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-review-')); filePath = path.join(directory, 'reviews.json'); reviews = new FileReviewRepository(filePath); });
  afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });

  async function createApp() {
    const app = Fastify();
    app.addHook('onRequest', async (request) => { if (!request.url.startsWith('/api/v1/review/')) request.authUserId = ownerUserId; });
    const workspace = { getProject: vi.fn(async (id: string) => id === projectId ? project : undefined) } as unknown as WorkspaceRepository;
    const plans = { getPlan: vi.fn(async (id: string) => id === projectId ? plan : undefined), listShotCards: vi.fn(async (id: string) => id === projectId ? [card] : []) } as unknown as PlanRepository;
    await registerReviewRoutes(app, { reviews, plans, workspace, env: { REVIEW_TOKEN_SECRET: 'test-secret', PUBLIC_WEB_URL: 'https://studio.example' } });
    return app;
  }

  async function issue(app: Awaited<ReturnType<typeof createApp>>, expiresInHours = 24) {
    const response = await app.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/review-links`, payload: { label: '科研负责人', expiresInHours } });
    expect(response.statusCode).toBe(201); return response.json().data as { token: string; id: string; reviewUrl: string };
  }

  it('returns raw token once but stores only its hash', async () => {
    const app = await createApp(); const issued = await issue(app); const raw = await fs.readFile(filePath, 'utf8');
    expect(issued.reviewUrl).toContain(issued.token); expect(raw).not.toContain(issued.token); expect(raw).not.toContain(ownerUserId + issued.token); await app.close();
  });

  it('returns a minimized public snapshot without owner, sources or private image URLs', async () => {
    const app = await createApp(); const issued = await issue(app); const response = await app.inject({ method: 'GET', url: `/api/v1/review/${issued.token}` });
    expect(response.statusCode).toBe(200); const raw = response.body; const body = response.json().data;
    expect(body.project.name).toBe('量子实验室'); expect(body.readiness.executable).toBe(true); expect(raw).not.toContain(ownerUserId); expect(raw).not.toContain('private-source'); expect(raw).not.toContain('https://private/image.jpg'); await app.close();
  });

  it('rejects tampered, expired and revoked links', async () => {
    const app = await createApp(); const issued = await issue(app);
    expect((await app.inject({ method: 'GET', url: `/api/v1/review/${issued.token.slice(0, -1)}x` })).statusCode).toBe(404);
    const expired = await issue(app, 1); const state = JSON.parse(await fs.readFile(filePath, 'utf8')); state.links.find((item: { id: string }) => item.id === expired.id).expiresAt = '2020-01-01T00:00:00.000Z'; await fs.writeFile(filePath, JSON.stringify(state));
    expect((await app.inject({ method: 'GET', url: `/api/v1/review/${expired.token}` })).statusCode).toBe(410);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/projects/${projectId}/review-links/${issued.id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/api/v1/review/${issued.token}` })).statusCode).toBe(410); await app.close();
  });

  it('stores feedback as pending and prevents duplicate submission', async () => {
    const app = await createApp(); const issued = await issue(app); const payload = { reviewerName: '王老师', overallDecision: 'CHANGES_REQUESTED', items: [{ targetType: 'RISK', targetId: plan.content.risks[0]!.id, decision: 'CHANGE_REQUESTED', suggestion: '补充防护说明', comment: '' }], generalComment: '请修改' };
    const first = await app.inject({ method: 'POST', url: `/api/v1/review/${issued.token}/responses`, payload }); expect(first.statusCode).toBe(201); expect(first.json().data.status).toBe('PENDING');
    expect((await app.inject({ method: 'POST', url: `/api/v1/review/${issued.token}/responses`, payload })).statusCode).toBe(409);
    const owner = await app.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/review-responses` }); expect(owner.json().data.responses[0].status).toBe('PENDING'); expect(plan.content.risks[0]!.description).toBe('激光风险'); await app.close();
  });

  it('lets only the project owner mark a suggestion as adopted', async () => {
    const app = await createApp(); const issued = await issue(app); const submitted = await app.inject({ method: 'POST', url: `/api/v1/review/${issued.token}/responses`, payload: { reviewerName: '王老师', overallDecision: 'CHANGES_REQUESTED', items: [], generalComment: '建议增加样本特写' } });
    const responseId = submitted.json().data.id;
    const updated = await app.inject({ method: 'PATCH', url: `/api/v1/projects/${projectId}/review-responses/${responseId}`, payload: { status: 'ADOPTED' } });
    expect(updated.statusCode).toBe(200); expect(updated.json().data.status).toBe('ADOPTED');
    const owner = await app.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/review-responses` }); expect(owner.json().data.responses[0].status).toBe('ADOPTED'); await app.close();
  });
});
