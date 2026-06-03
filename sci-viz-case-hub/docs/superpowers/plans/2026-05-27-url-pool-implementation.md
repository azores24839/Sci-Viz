# URL Pool & Smart Discovery 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 URL 来源池管理页面，支持按分类浏览/管理采集来源，一键触发"列表页自动发现文章链接 → 逐篇采集"的端到端工作流。

**Architecture:** 前端两栏布局（左分类树 + 右来源卡片），后端新增 pool 路由（CRUD + 采集触发 + 进度轮询），发现器和采集器分离执行。

**Tech Stack:** TypeScript, Express, Prisma/SQLite, React, cheerio

---

## 文件结构

```
创建:
  server/src/crawler/discoverLinks.ts    # 链接发现算法
  server/src/routes/pool.ts              # Pool CRUD + 采集触发 + 进度
  server/src/seedPool.ts                 # 从 CRAWL_SOURCE_TARGETS.md 导入
  web/src/pages/PoolPage.tsx             # 来源池页面

修改:
  server/prisma/schema.prisma            # +CrawlSource, +CrawlJob 模型
  server/src/crawler/runUrlCrawl.ts      # 导出 processSingleUrl
  server/src/index.ts                    # 注册 pool 路由
  server/package.json                    # +seed:pool 脚本
  web/src/types/index.ts                 # +CrawlSource, +CrawlJob 类型
  web/src/api/index.ts                   # +pool API 方法
  web/src/App.tsx                        # +/pool 路由和导航
```

---

### Task 1: 数据库 Schema

**Files:**
- Modify: `sci-viz-case-hub/server/prisma/schema.prisma`

- [ ] **Step 1: 添加 CrawlSource 和 CrawlJob 模型**

在 `schema.prisma` 的 VisualCase 模型之后追加：

```prisma
model CrawlSource {
  id          Int      @id @default(autoincrement())
  name        String
  url         String
  category    String   @default("")
  sourceType  String   @default("")
  visualValue String   @default("")
  strategyHint String  @default("")
  enabled     Boolean  @default(true)
  notes       String   @default("")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  jobs        CrawlJob[]
}

model CrawlJob {
  id             Int      @id @default(autoincrement())
  sourceId       Int
  status         String   @default("pending")
  discoveredUrls String   @default("[]")
  crawledUrls    String   @default("[]")
  totalCount     Int      @default(0)
  crawledCount   Int      @default(0)
  newCases       Int      @default(0)
  error          String   @default("")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  source         CrawlSource @relation(fields: [sourceId], references: [id])
}
```

- [ ] **Step 2: 生成 Prisma Client 并推送 Schema**

```bash
cd sci-viz-case-hub/server && npx prisma db push
```

Expected: `Your database is now in sync with your schema.`

- [ ] **Step 3: 验证表已创建**

```bash
cd sci-viz-case-hub/server && npx prisma studio --port 5556 &
```

在 browser 检查 CrawlSource 和 CrawlJob 表已存在。

- [ ] **Step 4: Commit**

```bash
git add sci-viz-case-hub/server/prisma/schema.prisma
git commit -m "feat: add CrawlSource and CrawlJob models"
```

---

### Task 2: 链接发现算法

**Files:**
- Create: `sci-viz-case-hub/server/src/crawler/discoverLinks.ts`

- [ ] **Step 1: 创建 discoverLinks.ts**

```typescript
import * as cheerio from 'cheerio';

interface DiscoveredLink {
  url: string;
  title: string;
  score: number;
}

const ARTICLE_PATH_PATTERNS = [
  /\/\d{4}\/\d{2}\/\d{2}\//,
  /\/news\//,
  /\/article\//,
  /\/story\//,
  /\/stories\//,
  /\/research\//,
  /\/science\//,
  /\/blog\//,
  /\/posts\//,
  /\/features\//,
  /\/topics\//,
  /\/press\//,
  /\/releases\//,
  /\/publications\//,
  /\/discoveries\//,
  /\/briefs\//,
  /\/spotlight\//,
  /\/announcement\//,
];

const GENERIC_LINK_TEXTS = [
  'read more', 'click here', 'learn more', 'more',
  'continue reading', 'view more', 'see more',
  'home', 'about', 'contact', 'search', 'menu',
  'subscribe', 'sign up', 'log in', 'login',
  'privacy', 'terms', 'accessibility',
  'next', 'previous', 'back', 'top',
  'share', 'print', 'email', 'rss',
];

const EXCLUDED_PATH_PATTERNS = [
  /^#/,
  /^javascript:/i,
  /^mailto:/i,
  /\.pdf$/i,
  /\.zip$/i,
  /\.docx?$/i,
  /\.pptx?$/i,
  /^tel:/i,
];

function excludeUrl(url: string): boolean {
  for (const pat of EXCLUDED_PATH_PATTERNS) {
    if (pat.test(url)) return true;
  }
  return false;
}

function scoreUrl(url: string): number {
  let score = 0;
  const normalized = url.toLowerCase();
  for (const pat of ARTICLE_PATH_PATTERNS) {
    if (pat.test(normalized)) {
      score += 20;
    }
  }
  if (/\/\d{4}\/\d{2}\//.test(normalized)) score += 30;
  if (/\/\d{4}\/\d{2}\/\d{2}\//.test(normalized)) score += 40;
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  if (segments.length >= 3) score += 10;
  if (segments.length >= 4) score += 5;
  if (/[a-z]{2,}-[a-z]{2,}-/.test(normalized)) score += 15;
  return score;
}

function scoreLinkText(text: string): number {
  if (!text || text.length < 10) return 0;
  let score = 10;
  if (text.length > 20) score += 10;
  if (text.length > 40) score += 10;
  const lower = text.toLowerCase();
  for (const generic of GENERIC_LINK_TEXTS) {
    if (lower === generic || lower.startsWith(generic)) {
      return 0;
    }
  }
  if (/^\d+$/.test(text)) return 0;
  return score;
}

function scorePosition(parentTag: string): number {
  if (['article', 'main', 'section'].includes(parentTag)) return 15;
  if (['h2', 'h3', 'h4'].includes(parentTag)) return 20;
  if (['nav', 'footer', 'header'].includes(parentTag)) return -50;
  return 0;
}

export async function discoverLinks(listPageUrl: string, maxLinks: number = 30): Promise<DiscoveredLink[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  let html: string;
  try {
    const res = await fetch(listPageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      throw new Error(`Not an HTML page: ${contentType}`);
    }
    html = await res.text();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }

  const $ = cheerio.load(html);
  const baseUrl = $('base[href]').first().attr('href') || listPageUrl;

  const seen = new Set<string>();
  const links: DiscoveredLink[] = [];

  $('a[href]').each((_, el) => {
    const $el = $(el);
    let href = ($el.attr('href') || '').trim();
    if (!href) return;

    if (excludeUrl(href)) return;

    try {
      href = new URL(href, baseUrl).href;
    } catch {
      return;
    }

    const parsed = new URL(href);
    if (parsed.hash && parsed.pathname === new URL(listPageUrl).pathname) return;

    const dedupeKey = parsed.origin + parsed.pathname;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    const text = $el.text().replace(/\s+/g, ' ').trim();
    const parentTag = $el.parent().get(0)?.tagName?.toLowerCase() || '';
    const grandParentTag = $el.parent().parent().get(0)?.tagName?.toLowerCase() || '';

    let score = scoreUrl(href) + scoreLinkText(text) + scorePosition(parentTag) + scorePosition(grandParentTag) * 0.5;
    if (score < 0) score = 0;

    if (score > 0) {
      links.push({ url: href, title: text, score });
    }
  });

  links.sort((a, b) => b.score - a.score);
  const top = links.slice(0, maxLinks);
  const finalUrls = new Set<string>();
  const deduped: DiscoveredLink[] = [];
  for (const l of top) {
    const key = new URL(l.url).origin + new URL(l.url).pathname;
    if (!finalUrls.has(key)) {
      finalUrls.add(key);
      deduped.push(l);
    }
  }

  return deduped;
}
```

- [ ] **Step 2: 验证发现器可运行**

```bash
cd sci-viz-case-hub/server && npx tsx -e "
import { discoverLinks } from './src/crawler/discoverLinks.js';
discoverLinks('https://news.mit.edu/topic/research', 5).then(links => {
  console.log('Found', links.length, 'links:');
  links.forEach(l => console.log(' ', l.score, l.url.substring(0, 80)));
}).catch(console.error);
"
```

Expected: 输出 5 个 MIT 研究新闻链接及其分数。

- [ ] **Step 3: Commit**

```bash
git add sci-viz-case-hub/server/src/crawler/discoverLinks.ts
git commit -m "feat: add link discovery algorithm for list pages"
```

---

### Task 3: 导出 processSingleUrl

**Files:**
- Modify: `sci-viz-case-hub/server/src/crawler/runUrlCrawl.ts`

- [ ] **Step 1: 导出 processSingleUrl 函数**

将 `async function processSingleUrl` 改为 `export async function processSingleUrl`。

在 `runUrlCrawl.ts` 第 106 行，将：
```typescript
async function processSingleUrl(
```
改为：
```typescript
export async function processSingleUrl(
```

- [ ] **Step 2: 验证编译无报错**

```bash
cd sci-viz-case-hub/server && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add sci-viz-case-hub/server/src/crawler/runUrlCrawl.ts
git commit -m "refactor: export processSingleUrl for pool crawl pipeline"
```

---

### Task 4: Pool 路由

**Files:**
- Create: `sci-viz-case-hub/server/src/routes/pool.ts`

- [ ] **Step 1: 创建 pool.ts 路由文件**

```typescript
import { Router, Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { discoverLinks } from '../crawler/discoverLinks.js';
import { processSingleUrl } from '../crawler/runUrlCrawl.js';

export const poolRouter = Router();

poolRouter.get('/pool/sources', async (req: Request, res: Response) => {
  try {
    const { category } = req.query;
    const sources = await prisma.crawlSource.findMany({
      where: category && typeof category === 'string' ? { category } : undefined,
      orderBy: { category: 'asc' },
      include: {
        jobs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const result = [];
    for (const source of sources) {
      const existingCount = await prisma.visualCase.count({
        where: { sourceDomain: { contains: new URL(source.url).hostname } },
      });
      result.push({
        ...source,
        lastJob: source.jobs[0] || null,
        existingCases: existingCount,
        jobs: undefined,
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

poolRouter.get('/pool/sources/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const source = await prisma.crawlSource.findUnique({
      where: { id },
      include: {
        jobs: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    if (!source) {
      res.status(404).json({ success: false, error: 'Source not found' });
      return;
    }
    res.json({ success: true, data: source });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

poolRouter.post('/pool/sources', async (req: Request, res: Response) => {
  try {
    const { name, url, category, sourceType, visualValue, strategyHint, notes } = req.body;
    const source = await prisma.crawlSource.create({
      data: {
        name: name || '',
        url: url || '',
        category: category || '',
        sourceType: sourceType || '',
        visualValue: visualValue || '',
        strategyHint: strategyHint || '',
        notes: notes || '',
      },
    });
    res.json({ success: true, data: source });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

poolRouter.patch('/pool/sources/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, url, category, sourceType, visualValue, strategyHint, enabled, notes } = req.body;
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (url !== undefined) updateData.url = url;
    if (category !== undefined) updateData.category = category;
    if (sourceType !== undefined) updateData.sourceType = sourceType;
    if (visualValue !== undefined) updateData.visualValue = visualValue;
    if (strategyHint !== undefined) updateData.strategyHint = strategyHint;
    if (enabled !== undefined) updateData.enabled = enabled;
    if (notes !== undefined) updateData.notes = notes;

    const source = await prisma.crawlSource.update({ where: { id }, data: updateData });
    res.json({ success: true, data: source });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

poolRouter.delete('/pool/sources/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.crawlJob.deleteMany({ where: { sourceId: id } });
    await prisma.crawlSource.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

poolRouter.post('/pool/sources/:id/crawl', async (req: Request, res: Response) => {
  try {
    const sourceId = parseInt(req.params.id, 10);
    const source = await prisma.crawlSource.findUnique({ where: { id: sourceId } });
    if (!source) {
      res.status(404).json({ success: false, error: 'Source not found' });
      return;
    }

    const job = await prisma.crawlJob.create({
      data: { sourceId, status: 'pending' },
    });

    void (async () => {
      try {
        await prisma.crawlJob.update({ where: { id: job.id }, data: { status: 'discovering' } });

        let articleUrls: string[] = [];
        try {
          const discovered = await discoverLinks(source.url, 30);
          articleUrls = discovered.map(d => d.url);
        } catch (err) {
          await prisma.crawlJob.update({
            where: { id: job.id },
            data: {
              status: 'failed',
              error: `Discovery failed: ${(err as Error).message}`,
            },
          });
          return;
        }

        if (articleUrls.length === 0) {
          await prisma.crawlJob.update({
            where: { id: job.id },
            data: { status: 'completed', totalCount: 0, crawledCount: 0, newCases: 0 },
          });
          return;
        }

        await prisma.crawlJob.update({
          where: { id: job.id },
          data: {
            status: 'crawling',
            discoveredUrls: JSON.stringify(articleUrls),
            totalCount: articleUrls.length,
          },
        });

        let newCases = 0;
        const crawledUrls: string[] = [];

        for (const url of articleUrls) {
          try {
            const existing = await prisma.visualCase.findFirst({
              where: { sourceUrl: url },
              select: { id: true },
            });
            if (existing) {
              crawledUrls.push(url);
              await prisma.crawlJob.update({
                where: { id: job.id },
                data: {
                  crawledCount: crawledUrls.length,
                  crawledUrls: JSON.stringify(crawledUrls),
                  newCases: newCases,
                },
              });
              continue;
            }

            const result = await processSingleUrl(url, source.name, source.sourceType);
            crawledUrls.push(url);
            newCases += result.createdCaseCount;

            await prisma.crawlJob.update({
              where: { id: job.id },
              data: {
                crawledCount: crawledUrls.length,
                crawledUrls: JSON.stringify(crawledUrls),
                newCases: newCases,
              },
            });
          } catch {
            crawledUrls.push(url);
            await prisma.crawlJob.update({
              where: { id: job.id },
              data: {
                crawledCount: crawledUrls.length,
                crawledUrls: JSON.stringify(crawledUrls),
                newCases: newCases,
              },
            });
          }
        }

        await prisma.crawlJob.update({
          where: { id: job.id },
          data: { status: 'completed', crawledCount: crawledUrls.length, newCases },
        });
      } catch (err) {
        await prisma.crawlJob.update({
          where: { id: job.id },
          data: { status: 'failed', error: (err as Error).message },
        });
      }
    })();

    res.json({ success: true, data: { jobId: job.id } });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

poolRouter.get('/pool/jobs/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const job = await prisma.crawlJob.findUnique({ where: { id } });
    if (!job) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }
    res.json({ success: true, data: job });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});
```

- [ ] **Step 2: 注册路由到 index.ts**

在 `server/src/index.ts` 中：

第 6 行后添加：
```typescript
import { poolRouter } from './routes/pool.js';
```

第 23 行后（`app.use('/api', crawlRouter);` 之后）添加：
```typescript
app.use('/api', poolRouter);
```

- [ ] **Step 3: 验证编译**

```bash
cd sci-viz-case-hub/server && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add sci-viz-case-hub/server/src/routes/pool.ts sci-viz-case-hub/server/src/index.ts
git commit -m "feat: add pool routes for source CRUD and crawl trigger"
```

---

### Task 5: Seed 脚本

**Files:**
- Create: `sci-viz-case-hub/server/src/seedPool.ts`
- Modify: `sci-viz-case-hub/server/package.json`

- [ ] **Step 1: 创建 seedPool.ts**

```typescript
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

function parseYamlBlock(block: string): Record<string, string> | null {
  const result: Record<string, string> = {};
  const lines = block.split('\n');
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.*)/);
    if (match) {
      result[match[1]] = match[2].trim().replace(/^"|"$/g, '');
    }
  }
  if (!result.name || !result.url) return null;
  return result;
}

async function seedPool() {
  const filePath = path.resolve(__dirname, '..', '..', 'CRAWL_SOURCE_TARGETS.md');

  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    console.log('Skipping pool seed.');
    return;
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  const yamlRegex = /```yaml\n([\s\S]*?)```/g;
  let currentCategory = '';

  const entries: Array<{
    name: string;
    url: string;
    category: string;
    sourceType: string;
    visualValue: string;
    strategyHint: string;
    notes: string;
  }> = [];

  for (const match of content.matchAll(yamlRegex)) {
    const pos = match.index || 0;
    const before = content.substring(0, pos);
    const beforeLines = before.split('\n');
    for (let i = beforeLines.length - 1; i >= 0; i--) {
      const secMatch = beforeLines[i].match(/^# ([A-F])\./);
      if (secMatch) {
        currentCategory = secMatch[1];
        break;
      }
    }

    const fields = parseYamlBlock(match[1]);
    if (!fields) continue;

    entries.push({
      name: fields.name || '',
      url: fields.url || '',
      category: currentCategory,
      sourceType: fields.source_type || '',
      visualValue: fields.visual_value || '',
      strategyHint: fields.strategy_hint || '',
      notes: fields.recommended_page_type
        ? `recommended_page_type: ${fields.recommended_page_type}`
        : '',
    });
  }

  console.log(`Parsed ${entries.length} source entries from CRAWL_SOURCE_TARGETS.md`);

  const existing = await prisma.crawlSource.count();
  if (existing > 0) {
    console.log(`Found ${existing} existing sources. Skipping seed.`);
    return;
  }

  for (const entry of entries) {
    await prisma.crawlSource.create({ data: entry });
  }

  console.log(`Seeded ${entries.length} crawl sources`);
}

seedPool()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: 添加 package.json 脚本**

在 `server/package.json` 的 scripts 中添加：

```json
"db:seed:pool": "tsx src/seedPool.ts"
```

- [ ] **Step 3: 运行 seed**

```bash
cd sci-viz-case-hub/server && npm run db:seed:pool
```

Expected: `Parsed XX source entries from CRAWL_SOURCE_TARGETS.md` + `Seeded XX crawl sources`

- [ ] **Step 4: Commit**

```bash
git add sci-viz-case-hub/server/src/seedPool.ts sci-viz-case-hub/server/package.json
git commit -m "feat: add pool seed script from CRAWL_SOURCE_TARGETS.md"
```

---

### Task 6: 前端 Types & API

**Files:**
- Modify: `sci-viz-case-hub/web/src/types/index.ts`
- Modify: `sci-viz-case-hub/web/src/api/index.ts`

- [ ] **Step 1: 添加类型定义**

在 `web/src/types/index.ts` 末尾追加：

```typescript
export interface CrawlSource {
  id: number;
  name: string;
  url: string;
  category: string;
  sourceType: string;
  visualValue: string;
  strategyHint: string;
  enabled: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
  lastJob: CrawlJob | null;
  existingCases: number;
}

export interface CrawlJob {
  id: number;
  sourceId: number;
  status: 'pending' | 'discovering' | 'crawling' | 'completed' | 'failed';
  discoveredUrls: string;
  crawledUrls: string;
  totalCount: number;
  crawledCount: number;
  newCases: number;
  error: string;
  createdAt: string;
  updatedAt: string;
}

export const CATEGORY_LABELS: Record<string, string> = {
  'A': '高校科研新闻',
  'B': '国家实验室/机构',
  'C': '官方图库/API',
  'D': '期刊/出版机构',
  'E': '开放公共库',
  'F': '第三方/社交',
};

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  'university_news': '大学新闻',
  'university_research_news': '研究新闻',
  'university_department_news': '院系新闻',
  'university_topic_news': '专题新闻',
  'university_research_portal': '研究门户',
  'university_research_series': '研究系列',
  'medical_school_news': '医学院',
  'national_lab_news': '国家实验室',
  'national_lab_news_list': '实验室列表',
  'research_institute_news': '研究机构新闻',
  'research_institute_portal': '研究机构门户',
  'life_science_research_institute': '生命科学机构',
  'bioinformatics_research_institute': '生物信息机构',
  'biomedical_research_institute_news': '生物医学机构',
  'biomedical_research_and_education_institute': '生物医学教育',
  'official_media_library': '官方媒体库',
  'official_api': '官方API',
  'official_media_collection': '官方媒体',
  'official_video_library': '视频库',
  'official_image_archive': '图像档案',
  'official_science_image_gallery': '科学图库',
  'official_photo_gallery_index': '照片目录',
  'official_media_resource': '媒体资源',
  'official_flickr_gallery': 'Flickr',
  'official_science_illustration_library': '插画库',
  'official_digital_collection': '数字馆藏',
  'official_historical_medical_image_collection': '医学史',
  'official_public_health_image_library': '公卫图库',
  'official_photo_collection': '照片集藏',
  'official_image_gallery': '图片展示',
  'medical_cultural_collection': '医学文化',
  'official_api_documentation': 'API文档',
  'official_iiif_documentation': 'IIIF',
  'official_press_resource': '新闻资源',
  'journal_publisher': '期刊',
  'journal_news': '期刊新闻',
  'journal_news_listing': '新闻列表',
  'journal': '期刊',
  'journal_article_listing': '文章列表',
  'journal_news_index': '新闻索引',
  'press_resource': '媒体资源',
  'publisher_guideline': '出版指南',
  'open_media_repository': '开放媒体库',
  'open_media_category': '开放分类',
  'curated_open_media_gallery': '精选媒体',
  'science_news_aggregator': '新闻聚合',
  'science_magazine': '科学杂志',
};
```

- [ ] **Step 2: 添加 API 方法**

在 `web/src/api/index.ts` 的 `api` 对象内，`testNetwork` 方法之前追加：

```typescript
getPoolSources(category?: string) {
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  return request<CrawlSource[]>(`/pool/sources${qs}`);
},

getPoolSource(id: number) {
  return request<CrawlSource>(`/pool/sources/${id}`);
},

createPoolSource(data: Partial<CrawlSource>) {
  return request<CrawlSource>('/pool/sources', {
    method: 'POST',
    body: JSON.stringify(data),
  });
},

updatePoolSource(id: number, data: Partial<CrawlSource>) {
  return request<CrawlSource>(`/pool/sources/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
},

deletePoolSource(id: number) {
  return request<void>(`/pool/sources/${id}`, { method: 'DELETE' });
},

triggerCrawl(sourceId: number) {
  return request<{ jobId: number }>(`/pool/sources/${sourceId}/crawl`, { method: 'POST' });
},

getCrawlJob(jobId: number) {
  return request<CrawlJob>(`/pool/jobs/${jobId}`);
},
```

在文件顶部的 import 中添加 CrawlSource 和 CrawlJob：
```typescript
import type { ApiResponse, VisualCase, CrawlResponse, NetworkTestResponse, CrawlSource, CrawlJob } from '../types';
```

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
cd sci-viz-case-hub/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add sci-viz-case-hub/web/src/types/index.ts sci-viz-case-hub/web/src/api/index.ts
git commit -m "feat: add pool types and API client methods"
```

---

### Task 7: PoolPage 组件

**Files:**
- Create: `sci-viz-case-hub/web/src/pages/PoolPage.tsx`

- [ ] **Step 1: 创建 PoolPage.tsx**

```typescript
import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { theme } from '../theme';
import { Card } from '../components';
import type { CrawlSource, CrawlJob } from '../types';
import { CATEGORY_LABELS, SOURCE_TYPE_LABELS } from '../types';

function sourceTypeLabel(st: string): string {
  return SOURCE_TYPE_LABELS[st] || st.replace(/_/g, ' ');
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

export default function PoolPage() {
  const [sources, setSources] = useState<CrawlSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [crawlState, setCrawlState] = useState<{
    sourceId: number;
    sourceName: string;
    jobId: number;
    status: string;
    totalCount: number;
    crawledCount: number;
    newCases: number;
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadSources = async () => {
    setLoading(true);
    try {
      const res = await api.getPoolSources(activeCategory || undefined);
      setSources(res.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { loadSources(); }, [activeCategory]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startCrawl = async (source: CrawlSource) => {
    try {
      const res = await api.triggerCrawl(source.id);
      const jobId = res.data?.jobId;
      if (!jobId) return;

      setCrawlState({
        sourceId: source.id,
        sourceName: source.name,
        jobId,
        status: 'pending',
        totalCount: 0,
        crawledCount: 0,
        newCases: 0,
      });

      pollRef.current = setInterval(async () => {
        try {
          const jobRes = await api.getCrawlJob(jobId);
          const job = jobRes.data as CrawlJob;
          setCrawlState(prev => prev ? {
            ...prev,
            status: job.status,
            totalCount: job.totalCount,
            crawledCount: job.crawledCount,
            newCases: job.newCases,
          } : null);

          if (job.status === 'completed' || job.status === 'failed') {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            setTimeout(() => {
              setCrawlState(null);
              loadSources();
            }, 3000);
          }
        } catch {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          setCrawlState(null);
        }
      }, 2000);
    } catch { /* ignore */ }
  };

  const filteredSources = activeCategory
    ? sources.filter(s => s.category === activeCategory)
    : sources;

  const categories = [...new Set(sources.map(s => s.category))].sort();

  const cardStyle: React.CSSProperties = {
    background: theme.colors.bgCard,
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.colors.border}`,
    boxShadow: theme.shadow.card,
    padding: 16,
  };

  return (
    <div>
      <h1 style={{
        fontSize: theme.typography.size['3xl'],
        fontWeight: 600,
        color: theme.colors.text.primary,
        letterSpacing: '-0.03em',
        marginBottom: 24,
      }}>
        来源池
      </h1>

      {crawlState && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            background: theme.colors.bgCard,
            borderRadius: theme.radius.xl,
            padding: 28,
            minWidth: 360,
            maxWidth: 420,
            boxShadow: theme.shadow.popover,
          }}>
            <h3 style={{
              fontSize: theme.typography.size.lg,
              fontWeight: 600,
              color: theme.colors.text.primary,
              marginBottom: 8,
            }}>
              {crawlState.sourceName}
            </h3>
            <div style={{
              fontSize: theme.typography.size.sm,
              color: theme.colors.text.secondary,
              marginBottom: 16,
            }}>
              {crawlState.status === 'discovering' && '正在发现文章链接...'}
              {crawlState.status === 'crawling' && `正在采集 ${crawlState.crawledCount}/${crawlState.totalCount} 篇文章`}
              {crawlState.status === 'completed' && `采集完成！入库 ${crawlState.newCases} 张图片`}
              {crawlState.status === 'failed' && '采集失败'}
              {crawlState.status === 'pending' && '准备中...'}
            </div>
            {(crawlState.status === 'discovering' || crawlState.status === 'crawling' || crawlState.status === 'pending') && (
              <div style={{
                width: '100%',
                height: 4,
                background: theme.colors.borderLight,
                borderRadius: 2,
                overflow: 'hidden',
                marginBottom: 12,
              }}>
                <div style={{
                  height: '100%',
                  width: crawlState.totalCount > 0
                    ? `${(crawlState.crawledCount / crawlState.totalCount) * 100}%`
                    : '30%',
                  background: theme.colors.accent,
                  borderRadius: 2,
                  transition: 'width 0.3s',
                }} />
              </div>
            )}
            {(crawlState.status === 'completed' || crawlState.status === 'failed') && (
              <button
                onClick={() => setCrawlState(null)}
                style={{
                  width: '100%',
                  padding: '8px 0',
                  borderRadius: theme.radius.md,
                  border: `1px solid ${theme.colors.border}`,
                  background: theme.colors.bgSubtle,
                  color: theme.colors.text.secondary,
                  fontSize: theme.typography.size.sm,
                  cursor: 'pointer',
                }}
              >
                关闭
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{
          width: 160,
          flexShrink: 0,
          background: theme.colors.bgCard,
          borderRadius: theme.radius.lg,
          border: `1px solid ${theme.colors.border}`,
          padding: 12,
          alignSelf: 'flex-start',
          position: 'sticky',
          top: 72,
        }}>
          <button
            onClick={() => setActiveCategory(null)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '6px 10px',
              borderRadius: theme.radius.sm,
              border: 'none',
              background: activeCategory === null ? theme.colors.bgSubtle : 'transparent',
              color: activeCategory === null ? theme.colors.text.primary : theme.colors.text.secondary,
              fontSize: theme.typography.size.sm,
              fontWeight: activeCategory === null ? 600 : 400,
              cursor: 'pointer',
              marginBottom: 2,
            }}
          >
            全部 ({sources.length})
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 10px',
                borderRadius: theme.radius.sm,
                border: 'none',
                background: activeCategory === cat ? theme.colors.bgSubtle : 'transparent',
                color: activeCategory === cat ? theme.colors.text.primary : theme.colors.text.secondary,
                fontSize: theme.typography.size.sm,
                fontWeight: activeCategory === cat ? 600 : 400,
                cursor: 'pointer',
                marginBottom: 2,
              }}
            >
              {cat}. {CATEGORY_LABELS[cat] || cat}
              <span style={{ color: theme.colors.text.tertiary, marginLeft: 4 }}>
                ({sources.filter(s => s.category === cat).length})
              </span>
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <Card style={{ textAlign: 'center', padding: 48, color: theme.colors.text.tertiary }}>
              加载中...
            </Card>
          ) : filteredSources.length === 0 ? (
            <Card style={{ textAlign: 'center', padding: 48, color: theme.colors.text.tertiary }}>
              暂无来源
            </Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
              {filteredSources.map(source => (
                <div key={source.id} style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: theme.typography.size.base,
                        fontWeight: 600,
                        color: theme.colors.text.primary,
                        marginBottom: 2,
                      }}>
                        {source.name}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{
                          display: 'inline-flex',
                          padding: '1px 6px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 500,
                          background: '#f0f0f5',
                          color: '#6f6f7b',
                        }}>
                          {sourceTypeLabel(source.sourceType)}
                        </span>
                        <span style={{
                          fontSize: 11,
                          color: theme.colors.text.tertiary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {new URL(source.url).hostname}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{
                    fontSize: theme.typography.size.xs,
                    color: theme.colors.text.tertiary,
                    marginTop: 8,
                  }}>
                    {source.lastJob
                      ? `上次采集: ${timeAgo(source.lastJob.createdAt)} · 已入库 ${source.existingCases} 张`
                      : `从未采集${source.existingCases > 0 ? ` · 已有 ${source.existingCases} 张历史记录` : ''}`
                    }
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      onClick={() => setExpandedId(expandedId === source.id ? null : source.id)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: theme.radius.sm,
                        border: `1px solid ${theme.colors.border}`,
                        background: 'transparent',
                        color: theme.colors.text.secondary,
                        fontSize: theme.typography.size.xs,
                        cursor: 'pointer',
                      }}
                    >
                      {expandedId === source.id ? '收起' : '详情'}
                    </button>
                    <button
                      onClick={() => startCrawl(source)}
                      disabled={crawlState !== null}
                      style={{
                        padding: '4px 10px',
                        borderRadius: theme.radius.sm,
                        border: 'none',
                        background: crawlState !== null ? theme.colors.border : theme.colors.text.primary,
                        color: theme.colors.bgCard,
                        fontSize: theme.typography.size.xs,
                        fontWeight: 500,
                        cursor: crawlState !== null ? 'not-allowed' : 'pointer',
                        opacity: crawlState !== null ? 0.5 : 1,
                      }}
                    >
                      采集
                    </button>
                  </div>

                  {expandedId === source.id && (
                    <div style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: `1px solid ${theme.colors.borderLight}`,
                      fontSize: theme.typography.size.xs,
                      color: theme.colors.text.secondary,
                      lineHeight: 1.6,
                    }}>
                      {source.visualValue && (
                        <div style={{ marginBottom: 6 }}>
                          <span style={{ color: theme.colors.text.tertiary, fontWeight: 600 }}>视觉价值 </span>
                          {source.visualValue}
                        </div>
                      )}
                      {source.strategyHint && (
                        <div style={{ marginBottom: 6 }}>
                          <span style={{ color: theme.colors.text.tertiary, fontWeight: 600 }}>策略 </span>
                          {source.strategyHint}
                        </div>
                      )}
                      {source.notes && (
                        <div>
                          <span style={{ color: theme.colors.text.tertiary, fontWeight: 600 }}>备注 </span>
                          {source.notes}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add sci-viz-case-hub/web/src/pages/PoolPage.tsx
git commit -m "feat: add PoolPage with category sidebar and source cards"
```

---

### Task 8: App 路由和导航

**Files:**
- Modify: `sci-viz-case-hub/web/src/App.tsx`

- [ ] **Step 1: 添加路由和导航项**

修改 `web/src/App.tsx` 第 6 行后添加 import：
```typescript
import PoolPage from './pages/PoolPage';
```

修改第 9-14 行的 `navItems`，追加一项：
```typescript
const navItems = [
  { path: '/', label: '案例列表' },
  { path: '/crawl', label: '自动采集' },
  { path: '/review', label: '复核' },
  { path: '/export', label: '导出' },
  { path: '/pool', label: '来源池' },
];
```

在第 80 行 `</Routes>` 之前添加：
```typescript
          <Route path="/pool" element={<PoolPage />} />
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd sci-viz-case-hub/web && npx tsc --noEmit
```

- [ ] **Step 3: 验证前端可启动**

启动 server 和 web:
```bash
cd sci-viz-case-hub && npm run dev
```

打开 http://localhost:5173/pool，确认：
- 页面正确渲染
- 左侧分类列表能点击筛选
- "详情"按钮能展开/收起
- "采集"按钮显示进度浮层

- [ ] **Step 4: Commit**

```bash
git add sci-viz-case-hub/web/src/App.tsx
git commit -m "feat: add /pool route and nav item"
```

---

## 首次使用流程

1. 导入来源数据：
```bash
cd sci-viz-case-hub/server && npm run db:seed:pool
```

2. 启动开发服务器：
```bash
cd sci-viz-case-hub && npm run dev
```

3. 打开 http://localhost:5173/pool
4. 点击任意来源的"采集"按钮
5. 观察进度浮层 → 发现链接 → 逐篇采集 → 完成
6. 前往"复核"页面查看新增案例
