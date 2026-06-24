# 科研影像 AI Studio MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个可本地运行、可持久化、可端到端验证的科研摄影阶段式 AI 工作台，以“长兴海洋实验室”为完整 Mock 项目。

**Architecture:** 在 `sci-viz-studio/` 中建立 npm workspace 模块化单体。React Web 通过 Fastify API 访问 PGlite；Server 与 Worker 共用领域、契约和数据访问代码，但使用不同进程入口。所有 Agent 通过结构化 `ModelGateway` 和持久 `AgentJob` 执行，MVP 默认使用确定性 Mock Gateway。

**Tech Stack:** TypeScript, React, Vite, React Router, TanStack Query, Fastify, Zod, PGlite, Drizzle ORM, Vitest, Testing Library, Playwright, npm workspaces

---

## File Map

```text
sci-viz-studio/
├── .gitignore
├── .nvmrc
├── package.json
├── tsconfig.base.json
├── README.md
├── db/
│   ├── drizzle.config.ts
│   ├── schema.ts
│   └── migrations/
├── packages/
│   ├── contracts/src/index.ts
│   ├── domain/src/{index,projectStage,reviewGate,progress}.ts
│   ├── fixtures/src/{index,changxing}.ts
│   ├── ai-workflows/src/{index,modelGateway,mockModelGateway,tasks}.ts
│   └── design-system/src/{index,tokens.css}.ts
├── apps/
│   ├── server/src/
│   │   ├── {app,index,worker}.ts
│   │   ├── db/{client,seed}.ts
│   │   ├── repositories/{project,review,artifact,shot,job}.ts
│   │   ├── services/{workflow,reviewLink,capture}.ts
│   │   └── routes/{projects,runs,reviews,artifacts,shots}.ts
│   └── web/src/
│       ├── {main,App}.tsx
│       ├── api/client.ts
│       ├── components/{AppShell,StageRail,AgentCard,EvidenceBadge,RunTimeline}.tsx
│       ├── features/understand/*
│       ├── features/review/*
│       ├── features/plan/*
│       ├── features/capture/*
│       ├── pages/{ProjectList,NewProject,Understand,Review,Plan,Capture,ExternalReview}.tsx
│       └── styles/{global,layout}.css
└── tests/e2e/studio.spec.ts
```

## Task 1: Scaffold the isolated workspace

**Files:**
- Create: `sci-viz-studio/package.json`
- Create: `sci-viz-studio/.nvmrc`
- Create: `sci-viz-studio/.gitignore`
- Create: `sci-viz-studio/tsconfig.base.json`
- Create: package manifests under `apps/*` and `packages/*`

- [ ] **Step 1: Assert isolation before writing**

Run:

```bash
git status --short sci-viz-studio sci-viz-case-hub
```

Expected: `sci-viz-studio` does not exist; existing `sci-viz-case-hub` changes remain untouched.

- [ ] **Step 2: Create root workspace manifest**

Use this root shape:

```json
{
  "name": "sci-viz-studio",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "concurrently -k -n api,worker,web \"npm run dev -w @studio/server\" \"npm run dev:worker -w @studio/server\" \"npm run dev -w @studio/web\"",
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "check": "npm run typecheck --workspaces --if-present",
    "db:generate": "drizzle-kit generate --config db/drizzle.config.ts",
    "db:seed": "npm run seed -w @studio/server"
  }
}
```

Set `.nvmrc` to `22`, ignore `node_modules/`, `dist/`, `data/`, `.env`, and Playwright artifacts.

- [ ] **Step 3: Install pinned-by-lock dependencies**

Run from `sci-viz-studio/`:

```bash
npm install -D concurrently typescript vitest @vitest/coverage-v8 drizzle-kit
npm install -w @studio/contracts zod
npm install -w @studio/server fastify @fastify/cors @electric-sql/pglite drizzle-orm zod
npm install -w @studio/web react react-dom react-router-dom @tanstack/react-query
npm install -D -w @studio/web vite @vitejs/plugin-react @types/react @types/react-dom @testing-library/react @testing-library/user-event jsdom
npm install -D -w @studio/server tsx @types/node
```

Expected: one `sci-viz-studio/package-lock.json`; no lockfile change under `sci-viz-case-hub`.

- [ ] **Step 4: Add strict shared TypeScript configuration**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 5: Verify manifests and commit**

Run `npm install`, `npm run check`, then commit only `sci-viz-studio/` scaffold files with `chore: scaffold sci-viz studio workspace`.

## Task 2: Define contracts and domain rules with tests

**Files:**
- Create: `packages/contracts/src/index.ts`
- Create: `packages/domain/src/projectStage.ts`
- Create: `packages/domain/src/reviewGate.ts`
- Create: `packages/domain/src/progress.ts`
- Test: `packages/domain/src/*.test.ts`

- [ ] **Step 1: Write failing stage transition tests**

```ts
import { describe, expect, it } from 'vitest';
import { canTransition } from './projectStage';

describe('canTransition', () => {
  it('allows the golden path', () => {
    expect(canTransition('UNDERSTANDING', 'REVIEWING')).toBe(true);
    expect(canTransition('REVIEWING', 'PLANNING')).toBe(true);
  });

  it('rejects skipping stages', () => {
    expect(canTransition('UNDERSTANDING', 'CAPTURING')).toBe(false);
  });
});
```

Run `npm test -w @studio/domain`; expected FAIL because the function does not exist.

- [ ] **Step 2: Implement explicit stage transitions**

```ts
export type ProjectStatus =
  | 'DRAFT' | 'UNDERSTANDING' | 'REVIEWING'
  | 'PLANNING' | 'CAPTURING' | 'COMPLETED';

const transitions: Record<ProjectStatus, ProjectStatus[]> = {
  DRAFT: ['UNDERSTANDING'],
  UNDERSTANDING: ['REVIEWING'],
  REVIEWING: ['PLANNING'],
  PLANNING: ['CAPTURING'],
  CAPTURING: ['COMPLETED'],
  COMPLETED: [],
};

export const canTransition = (from: ProjectStatus, to: ProjectStatus) =>
  transitions[from].includes(to);
```

- [ ] **Step 3: Write failing review gate and progress tests**

Cover blocker questions, accepted risk, must-shot coverage, and zero-item progress. Expected formulas:

```ts
canMarkPlanExecutable([{ severity: 'BLOCKER', status: 'OPEN' }]) === false
canMarkPlanExecutable([{ severity: 'BLOCKER', status: 'CONFIRMED' }]) === true
captureProgress([{ priority: 'MUST', status: 'CAPTURED' }]).mustPercent === 100
```

- [ ] **Step 4: Implement minimal pure functions**

No I/O, dates, or database imports are allowed in domain files. Run all domain tests and expected PASS.

- [ ] **Step 5: Define shared Zod contracts**

Define enums and schemas for `Project`, `SourceDocument`, `KnowledgeClaim`, `ReviewQuestion`, `Artifact`, `ShotCard`, `CaptureItem`, `AgentRun`, `AgentJob`, and API envelopes. Export inferred TypeScript types from the same file.

- [ ] **Step 6: Run `npm run test` and `npm run check`; commit**

Commit: `feat: define studio domain contracts`.

## Task 3: Add PGlite schema, migrations, and database boot

**Files:**
- Create: `db/schema.ts`
- Create: `db/drizzle.config.ts`
- Create: `apps/server/src/db/client.ts`
- Create: generated `db/migrations/*`
- Test: `apps/server/src/db/client.test.ts`

- [ ] **Step 1: Write a failing temporary-database test**

The test creates PGlite at `memory://`, runs migrations, inserts a workspace and project, then reads the project back. Expected FAIL before `createDatabase` exists.

- [ ] **Step 2: Define normalized Drizzle tables**

Create tables from spec section 8 with foreign keys and indexes. Required unique constraints:

```text
artifact(project_id, type)
artifact_version(artifact_id, version)
agent_job(idempotency_key)
capture_item(shot_card_id)
review_link(token_hash)
```

Store structured artifact bodies as `jsonb`; keep stage, status, severity, position, and timestamps as queryable columns.

- [ ] **Step 3: Implement database creation and migrations**

```ts
export async function createDatabase(path = process.env.DATABASE_PATH ?? './data/studio') {
  const client = new PGlite(path);
  const database = drizzle(client, { schema });
  await migrate(database, { migrationsFolder: migrationsPath });
  return { client, db: database };
}
```

- [ ] **Step 4: Generate and inspect migration SQL**

Run `npm run db:generate`. Verify foreign keys and indexes exist; run the temporary-database test and expect PASS.

- [ ] **Step 5: Commit**

Commit: `feat: add embedded postgres persistence`.

## Task 4: Seed the Changxing fixture

**Files:**
- Create: `packages/fixtures/src/changxing.ts`
- Create: `packages/fixtures/src/index.ts`
- Create: `apps/server/src/db/seed.ts`
- Test: `apps/server/src/db/seed.test.ts`

- [ ] **Step 1: Write the failing seed integrity test**

Assert exactly one default workspace and one `PHOTO` project, at least four source kinds, at least six claims spanning all confidence states, at least three review questions including one blocker, four Agent roles, at least six shot cards, and one capture item per shot card.

- [ ] **Step 2: Implement evidence-backed fixture content**

Use the official Changxing overview URL and the approved facts from the design. Include source excerpts. Mark operational availability, disclosure, safety, and superlative claims as `NEEDS_CONFIRMATION`; never convert them to supported facts.

- [ ] **Step 3: Make seed idempotent**

Use stable IDs prefixed with `demo-` and upsert semantics. Running seed twice must not change row counts.

- [ ] **Step 4: Run seed tests and commit**

Commit: `feat: seed changxing photography demo`.

## Task 5: Implement the structured Mock ModelGateway and job worker

**Files:**
- Create: `packages/ai-workflows/src/modelGateway.ts`
- Create: `packages/ai-workflows/src/mockModelGateway.ts`
- Create: `packages/ai-workflows/src/tasks.ts`
- Create: `apps/server/src/repositories/job.ts`
- Create: `apps/server/src/services/workflow.ts`
- Create: `apps/server/src/worker.ts`
- Test: `packages/ai-workflows/src/mockModelGateway.test.ts`
- Test: `apps/server/src/services/workflow.test.ts`

- [ ] **Step 1: Write failing gateway validation tests**

```ts
await expect(gateway.generateStructured('ANALYZE_PROJECT', input, UnderstandingSchema))
  .resolves.toMatchObject({ oneLineSummary: expect.any(String) });

await expect(invalidGateway.generateStructured('ANALYZE_PROJECT', input, UnderstandingSchema))
  .rejects.toThrow('Mock output failed schema validation');
```

- [ ] **Step 2: Implement the provider-neutral interface**

```ts
export interface ModelGateway {
  generateStructured<T>(args: {
    task: AgentTask;
    input: unknown;
    schema: ZodType<T>;
    context: { projectId: string; promptVersion: string };
  }): Promise<T>;
}
```

The mock implementation returns deterministic Changxing fixtures and always parses through the supplied schema.

- [ ] **Step 3: Write failing idempotency and retry tests**

Queueing the same `projectId + task + inputVersion` twice returns the same job. A failed run increments attempts, stores `lastError`, and becomes `QUEUED` until `maxAttempts`, then `FAILED`.

- [ ] **Step 4: Implement transactional job claiming**

Claim only one available job, set `lockedAt`, `lockedBy`, and `RUNNING`, then create/update `AgentRun`. Recover locks older than five minutes. Keep polling interval configurable and use 250 ms in development.

- [ ] **Step 5: Run tests and commit**

Commit: `feat: add durable mock agent workflow`.

## Task 6: Build the Fastify API shell and project endpoints

**Files:**
- Create: `apps/server/src/app.ts`
- Create: `apps/server/src/index.ts`
- Create: `apps/server/src/repositories/project.ts`
- Create: `apps/server/src/routes/projects.ts`
- Test: `apps/server/src/routes/projects.test.ts`

- [ ] **Step 1: Write failing Fastify injection tests**

Test `GET /api/v1/health`, `GET /api/v1/projects`, `GET /api/v1/projects/demo-changxing`, and `POST /api/v1/projects`. Assert API envelope and schema-safe errors.

- [ ] **Step 2: Create app factory with dependency injection**

```ts
export function buildApp(deps: AppDependencies) {
  const app = Fastify({ logger: deps.logger });
  app.setErrorHandler(toApiError);
  app.register(projectRoutes, { prefix: '/api/v1', deps });
  return app;
}
```

Tests inject temporary database and fake clock; production index creates PGlite and listens on `PORT` default `3011`.

- [ ] **Step 3: Implement repository and routes**

Controllers parse Zod input, call repository/use-case methods, and return shared contracts. Do not expose raw database rows.

- [ ] **Step 4: Run route tests and commit**

Commit: `feat: expose studio project api`.

## Task 7: Implement claims, review links, and external review

**Files:**
- Create: `apps/server/src/repositories/review.ts`
- Create: `apps/server/src/services/reviewLink.ts`
- Create: `apps/server/src/routes/reviews.ts`
- Test: `apps/server/src/services/reviewLink.test.ts`
- Test: `apps/server/src/routes/reviews.test.ts`

- [ ] **Step 1: Write token security tests**

Assert generated token has at least 32 random bytes, only SHA-256 hash is stored, valid token resolves, expired/revoked token returns `410`, and unrelated project data is absent from response.

- [ ] **Step 2: Implement link service**

Use `crypto.randomBytes(32).toString('base64url')`; store `sha256(token)`. Default expiry is seven days and clock is injectable.

- [ ] **Step 3: Write response workflow tests**

Submitting `CONFIRMED` marks the question resolved. Submitting `CORRECTED` stores response, updates the linked claim to `SUPPORTED`, records confirmer and timestamp, and appends an AuditEvent. Open blocker count must update in the same transaction.

- [ ] **Step 4: Implement public review routes**

Public payload contains project name, relevant claim excerpt, question, reason, response status, and reviewer fields only. No source document bodies, internal notes, run errors, or audit payloads.

- [ ] **Step 5: Run tests and commit**

Commit: `feat: add secure science review flow`.

## Task 8: Implement artifacts, shot cards, and capture APIs

**Files:**
- Create: `apps/server/src/repositories/artifact.ts`
- Create: `apps/server/src/repositories/shot.ts`
- Create: `apps/server/src/services/capture.ts`
- Create: `apps/server/src/routes/artifacts.ts`
- Create: `apps/server/src/routes/shots.ts`
- Test: corresponding `*.test.ts`

- [ ] **Step 1: Write failing version preservation tests**

Create version 1, simulate user edit, generate version 2, and assert version 1 remains current until explicit activation. Invalid structured body must be rejected by artifact-type schema.

- [ ] **Step 2: Implement artifact versioning**

Version creation and current-version activation are separate transactions. Every activation creates an AuditEvent with previous and new version IDs.

- [ ] **Step 3: Write failing shot/capture tests**

Assert shot position ordering, one capture item per shot, optimistic concurrency through `updatedAt`, allowed statuses, must-shot progress, and ad-hoc shot creation.

- [ ] **Step 4: Implement routes and progress response**

Return `overallPercent`, `mustPercent`, `captured`, `reshoot`, and `remaining`. A conflict returns `409` with current server object for UI rollback.

- [ ] **Step 5: Run tests and commit**

Commit: `feat: add plan and capture persistence`.

## Task 9: Create the design system and application shell

**Files:**
- Create: `packages/design-system/src/tokens.css`
- Create: `packages/design-system/src/index.ts`
- Create: `apps/web/src/styles/global.css`
- Create: `apps/web/src/styles/layout.css`
- Create: `apps/web/src/components/AppShell.tsx`
- Create: `apps/web/src/components/StageRail.tsx`
- Create: `apps/web/src/components/AgentCard.tsx`
- Create: `apps/web/public/agents/README.md`
- Test: component tests

- [ ] **Step 1: Write failing shell accessibility tests**

Assert one `main`, labelled navigation, current stage via `aria-current="step"`, keyboard-focusable stage links, and visible Mock AI badge.

- [ ] **Step 2: Implement token contract**

```css
:root {
  --color-black: #000000;
  --color-white: #ffffff;
  --color-primary: #2569ed;
  --color-gray-950: #111318;
  --color-gray-700: #454b57;
  --color-gray-500: #737b8c;
  --color-gray-300: #d4d8e1;
  --color-gray-100: #f2f4f7;
  --color-gray-50: #f8f9fb;
  --radius-sm: 6px;
  --radius-md: 10px;
  --shadow-panel: 0 8px 30px rgb(17 19 24 / 7%);
}
```

No gradients, neon glow, purple accents, or color-only status semantics.

- [ ] **Step 3: Build responsive three-column shell**

Desktop: 240 px StageRail, flexible main content, 300 px Agent panel. Below 1000 px, Agent panel becomes an expandable section. Capture route below 760 px uses single-column list and sticky progress header.

- [ ] **Step 4: Add avatar fallback contract**

Attempt the approved filenames; `onError` swaps to deterministic initial avatar. README states 512×512 PNG/WebP, ≤1 MB.

- [ ] **Step 5: Run component tests and commit**

Commit: `feat: build studio design system shell`.

## Task 10: Build project list and understanding stage

**Files:**
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/pages/ProjectList.tsx`
- Create: `apps/web/src/pages/NewProject.tsx`
- Create: `apps/web/src/pages/Understand.tsx`
- Create: `apps/web/src/features/understand/{SourceCard,ClaimCard,EvidenceDrawer}.tsx`
- Test: page/component tests

- [ ] **Step 1: Write failing UI tests**

Assert Changxing project card, PHOTO label, progress, four source types, one-line summary, all evidence confidence labels, and evidence drawer source excerpt.

- [ ] **Step 2: Implement typed API client**

Every response is parsed with contracts. Non-2xx responses become `ApiError` with status, code, message, and optional details. Components never call `fetch` directly.

- [ ] **Step 3: Implement project and understand pages**

Use TanStack Query keys `['projects']`, `['project', id]`, `['claims', id]`, and `['runs', id]`. Add visible loading, empty, error, and retry states.

- [ ] **Step 4: Verify keyboard and narrow viewport behavior**

Run tests and commit: `feat: add project understanding workspace`.

## Task 11: Build science review and external reviewer pages

**Files:**
- Create: `apps/web/src/pages/Review.tsx`
- Create: `apps/web/src/pages/ExternalReview.tsx`
- Create: `apps/web/src/features/review/{QuestionCard,ReviewLinkPanel,ReviewResponseForm}.tsx`
- Test: page/component tests

- [ ] **Step 1: Write failing interaction tests**

Cover filter by open/blocker, create link, copy visible URL, confirm question, correct question with required response, reviewer name, expired link, and post-submit success state.

- [ ] **Step 2: Implement internal review page**

Show unresolved count, blocker count, evidence state, Agent owner, and link expiry/revoke controls. Do not show a green/success color; use check icon, text, and border treatment.

- [ ] **Step 3: Implement public review page**

Use a focused single-column layout with project identity, progress, questions, source excerpt, response controls, and privacy explanation. No internal navigation.

- [ ] **Step 4: Run tests and commit**

Commit: `feat: build science review experience`.

## Task 12: Build photography plan and shot-card editor

**Files:**
- Create: `apps/web/src/pages/Plan.tsx`
- Create: `apps/web/src/features/plan/{PlanSection,ShotCardGrid,ShotCardEditor,VersionMenu}.tsx`
- Test: page/component tests

- [ ] **Step 1: Write failing plan tests**

Assert objective, audience, visual concept, narrative sequence, at least six shot cards, MUST/SHOULD/OPTIONAL labels, Agent ownership, edit modal, save mutation, version menu, and blocker gate messaging.

- [ ] **Step 2: Implement structured plan sections**

Render data sections, not Markdown blobs. Each section shows last edited time, source Agent, version, and edit action.

- [ ] **Step 3: Implement shot card editor**

Validate title, purpose, subject, scene, science message, and priority. Preserve optional camera and light fields as empty strings rather than inventing values.

- [ ] **Step 4: Implement version activation**

Show current and prior versions; switching requires confirmation and invalidates only artifact queries.

- [ ] **Step 5: Run tests and commit**

Commit: `feat: add photography plan workspace`.

## Task 13: Build the mobile-ready capture checklist

**Files:**
- Create: `apps/web/src/pages/Capture.tsx`
- Create: `apps/web/src/features/capture/{CaptureHeader,CaptureGroup,CaptureItem,AddShotForm}.tsx`
- Test: page/component tests

- [ ] **Step 1: Write failing capture tests**

Assert must coverage, scene grouping, status controls, file reference, notes, ad-hoc item, optimistic update, rollback on `409`, and reshoot aggregation.

- [ ] **Step 2: Implement capture interactions**

Use large touch targets ≥44 px. Status buttons use icon + label. Keep progress sticky and save notes on explicit action, not every keystroke.

- [ ] **Step 3: Add mobile CSS and test viewport semantics**

At 390 px, no horizontal scrolling; action controls remain visible; long science messages wrap; Agent panel is collapsed.

- [ ] **Step 4: Run tests and commit**

Commit: `feat: add field capture checklist`.

## Task 14: Integrate, document, and perform completion audit

**Files:**
- Create: `tests/e2e/studio.spec.ts`
- Create: `playwright.config.ts`
- Create: `README.md`
- Modify: root scripts as required for CI/test server

- [ ] **Step 1: Write the complete golden-path E2E test**

Automate the eleven steps from design section 13.4. Use stable `data-testid` only for elements lacking strong semantic roles. Seed a fresh temporary database before the run.

- [ ] **Step 2: Add failure-path E2E coverage**

Cover expired review token, visible Agent failure/retry, blocked plan gate, and capture update conflict rollback.

- [ ] **Step 3: Write operational README**

Document Node 22, `npm install`, `npm run dev`, PGlite data path, reset/seed, ports, tests, architecture, Mock AI limitation, production boundary, and exact avatar directory.

- [ ] **Step 4: Run all verification commands**

```bash
npm run check
npm run test
npm run build
npx playwright test
```

Expected: all exit 0; no TypeScript errors; all four workspaces build; golden path passes at desktop and mobile viewport.

- [ ] **Step 5: Perform browser visual QA**

Inspect project list, understand, review, external review, plan, and capture pages. Verify black/white/blue palette, readable hierarchy, no clipped content, and Agent responsibility visibility. Record and fix any console errors.

- [ ] **Step 6: Audit every acceptance criterion**

Create a checklist mapping each design section 15 requirement to file/test/runtime evidence. Treat missing or indirect evidence as incomplete and fix before claiming completion.

- [ ] **Step 7: Final commit**

Commit: `feat: complete sci-viz studio MVP`.

---

## Execution Mode

This plan will be executed inline in the current session. The repository instruction prohibits spawning subagents unless the user explicitly requests delegation. Implementation must preserve all unrelated dirty changes and commit only `sci-viz-studio/` plus the approved spec/plan documents.

