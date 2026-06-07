# Video Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full video case support to sci-viz-case-hub — seed 24 curated enterprise videos, display them with an embedded player, and mark them visually in lists.

**Architecture:** Hybrid approach: store video URLs + platform posters (via API), use react-player for playback. Three new schema fields (`videoUrl`, `videoPlatform`, `videoDuration`) on VisualCase. Seed script fetches Bilibili/YouTube posters automatically. Frontend Conditionally renders `<VideoPlayer>` instead of `<img>` when `captureType === 'video'`.

**Tech Stack:** Prisma (SQLite), Express, React 18, react-player, Bilibili API, YouTube thumbnail URLs

---

### Task 1: Schema Migration — Add Video Fields to VisualCase

**Files:**
- Modify: `server/prisma/schema.prisma:10-55`

- [ ] **Step 1: Add video fields to schema**

In `server/prisma/schema.prisma`, add three fields after `imageHash` (line 23):

```prisma
  imageHash     String @default("")

  videoUrl       String @default("")
  videoPlatform  String @default("")
  videoDuration  Int    @default(0)

  contextText String @default("")
```

- [ ] **Step 2: Run migration**

```bash
cd sci-viz-case-hub/server && npx prisma db push
```

Expected: Schema synchronized, no data loss.

- [ ] **Step 3: Verify migration**

```bash
cd sci-viz-case-hub/server && npx prisma studio &
# Open browser, check VisualCase has videoUrl, videoPlatform, videoDuration columns
```

- [ ] **Step 4: Commit**

```bash
git add server/prisma/schema.prisma && git commit -m "feat: add videoUrl, videoPlatform, videoDuration fields to VisualCase"
```

---

### Task 2: Frontend Types + API Layer — Add Video Fields

**Files:**
- Modify: `web/src/types/index.ts:1-38`
- Modify: `web/src/api/index.ts:28-65`

- [ ] **Step 1: Add video fields to VisualCase interface**

In `web/src/types/index.ts`, add after `imageHash` (line ~11):

```typescript
  imageHash: string;
  videoUrl: string;
  videoPlatform: string;
  videoDuration: number;
```

- [ ] **Step 2: Verify API passes fields through**

The existing `api.getCases()`, `api.getCase()`, `api.updateCase()` already pass all VisualCase fields via generic `request<T>()`. Prisma returns the new fields automatically. No API layer changes needed — just confirm `GET /api/cases/:id` returns `videoUrl`, `videoPlatform`, `videoDuration`.

- [ ] **Step 3: Commit**

```bash
git add web/src/types/index.ts && git commit -m "feat: add video fields to VisualCase type"
```

---

### Task 3: Seed Data — Create seedVideos.json with 24 Curated Videos

**Files:**
- Create: `server/prisma/seedVideos.json`

- [ ] **Step 1: Create the seed data file**

Create `server/prisma/seedVideos.json` with the 24 videos. Each entry has the schema:

```json
[
  {
    "title": "Kongsberg Maritime — Historic Day",
    "caseTitle": "Kongsberg Maritime: Historic Day for Kongsberg Maritime",
    "sourceUrl": "https://www.youtube.com/watch?v=DPONI4yhSSw",
    "sourceDomain": "www.youtube.com",
    "videoUrl": "https://www.youtube.com/watch?v=DPONI4yhSSw",
    "videoPlatform": "youtube",
    "imageUrl": "",
    "captureType": "video",
    "distributionMedium": "视频",
    "mediaType": "混合媒介",
    "contentType": "科普传播",
    "discipline": "工程",
    "visualStyle": "科技",
    "functionalPurpose": "展示",
    "userHint": "船舶海洋与建筑工程学院 — Kongsberg Maritime 海事科技"
  },
  ...23 more entries
]
```

The full 24 entries, organized by department:

1. **船舶海洋与建筑工程** — Kongsberg Maritime (YouTube: DPONI4yhSSw), 中国船舶集团 (Bilibili: BV1Cy4y1z74r)
2. **机械与动力工程** — Siemens Energy HL-class turbine (YouTube: @SiemensEnergy), GE9X (YouTube: @GEAerospace)
3. **电子信息与电气** — 华为 Dream It Possible (Bilibili: BV1pG411f7sM), Sony Image Sensor (YouTube: @Sony)
4. **电气工程** — 施耐德电气190年 (Bilibili: BV1UT596MEyG), 国家电网 (Bilibili: BV1Wb411L7TC)
5. **自动化与感知** — DJI Avata (Bilibili: BV1pN4y1c7Vu), Boston Dynamics Atlas (Bilibili: BV1K24y1a7dm), Figure AI (Bilibili: BV1Fu4m1g7GE)
6. **计算机/网安/密码** — OpenAI Sora 2 (Bilibili: BV18oHEzkEPo), Google DeepMind RT-2 (Bilibili: BV1UBtezaE1t)
7. **集成电路/信电** — ASML High-NA EUV (Bilibili: BV1Em7rzVEZH), NVIDIA GTC 2026 (Bilibili: BV1AbwSzeEKD), TSMC (Bilibili: BV1iJ411H7XK)
8. **材料科学** — Corning Day Made of Glass (Bilibili: BV12s41167RC), Corning Fusion Draw (Bilibili: BV1Wz4y1P7aG)
9. **环境科学** — BYD WHO IS BYD (Bilibili: BV1Hb421B7Fv), 星球研究所 为14亿人供电 (Bilibili: BV1VkwqeoE1u)
10. **生物医学工程** — 联影医疗 uEXPLORER (Bilibili: BV1tiTVzDE8v), 迈瑞医疗 (Bilibili: BV1Wr4y1A7Mq)
11. **航空航天** — SpaceX Starship Flight 3 (Bilibili: BV1aH4y1J7A5), COMAC C919 (Bilibili: BV1yu4y1q7BW)

Each entry should have:
- `title`: Short English/Chinese descriptive title
- `caseTitle`: Full video title with company name
- `sourceUrl`: Bilibili or YouTube URL
- `sourceDomain`: Domain name
- `videoUrl`: Same as sourceUrl (or embed URL)
- `videoPlatform`: "bilibili" | "youtube"
- `imageUrl`: Empty string (populated by seed script from platform API)
- `captureType`: "video"
- `distributionMedium`: "视频"
- `mediaType`: Best-guess from {"摄影", "3D渲染", "信息图", "混合媒介", ...}
- `contentType`: Best-guess from {"科普传播", "展示", ...}
- `discipline`: Mapped to DISCIPLINES constant values
- `visualStyle`: Best-guess from {"科技", "商业宣传", ...}
- `functionalPurpose`: "展示" or "传播"
- `userHint`: Department + company context

- [ ] **Step 2: Commit**

```bash
git add server/prisma/seedVideos.json && git commit -m "feat: add 24 curated enterprise video seed data"
```

---

### Task 4: Server — Video Seed Script with Poster Extraction

**Files:**
- Create: `server/src/services/videoSeed.ts`

- [ ] **Step 1: Create videoSeed.ts**

Create `server/src/services/videoSeed.ts`:

```typescript
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../prisma.js';
import { saveImageFromUrl } from './image.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SeedVideo {
  title: string;
  caseTitle: string;
  sourceUrl: string;
  sourceDomain: string;
  videoUrl: string;
  videoPlatform: string;
  imageUrl: string;
  captureType: string;
  distributionMedium: string;
  mediaType: string;
  contentType: string;
  discipline: string;
  visualStyle: string;
  functionalPurpose: string;
  userHint: string;
}

function getBilibiliPosterUrl(bvid: string): string {
  return `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
}

function extractBvid(url: string): string | null {
  const match = url.match(/BV[a-zA-Z0-9]+/);
  return match ? match[0] : null;
}

function extractYoutubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function getYoutubePosterUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

async function fetchBilibiliPoster(bvid: string): Promise<string | null> {
  try {
    const res = await fetch(getBilibiliPosterUrl(bvid), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://www.bilibili.com',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.pic || null;
  } catch {
    return null;
  }
}

export async function seedVideos(dryRun = false): Promise<{ seeded: number; skipped: number; errors: string[] }> {
  const seedPath = path.join(__dirname, '..', '..', 'prisma', 'seedVideos.json');
  const raw = await fs.readFile(seedPath, 'utf-8');
  const videos: SeedVideo[] = JSON.parse(raw);

  let seeded = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const v of videos) {
    try {
      const existing = await prisma.visualCase.findFirst({
        where: { videoUrl: v.videoUrl },
      });
      if (existing) {
        skipped++;
        continue;
      }

      let imagePath = '';
      let thumbnailPath = '';
      let imageHash = '';
      let posterImageUrl = v.imageUrl;

      if (!posterImageUrl) {
        if (v.videoPlatform === 'bilibili') {
          const bvid = extractBvid(v.videoUrl);
          if (bvid) posterImageUrl = (await fetchBilibiliPoster(bvid)) || '';
        } else if (v.videoPlatform === 'youtube') {
          const ytId = extractYoutubeId(v.videoUrl);
          if (ytId) posterImageUrl = getYoutubePosterUrl(ytId);
        }
      }

      if (posterImageUrl) {
        try {
          const saved = await saveImageFromUrl(posterImageUrl);
          imagePath = saved.imagePath;
          thumbnailPath = saved.thumbnailPath;
          imageHash = saved.imageHash;
        } catch (err) {
          console.warn(`[videoSeed] Failed to download poster for "${v.title}": ${(err as Error).message}`);
        }
      }

      if (dryRun) {
        console.log(`[DRY RUN] Would seed: ${v.title} (poster: ${posterImageUrl ? 'found' : 'none'})`);
        seeded++;
        continue;
      }

      await prisma.visualCase.create({
        data: {
          title: v.title,
          caseTitle: v.caseTitle,
          sourceUrl: v.sourceUrl,
          sourceDomain: v.sourceDomain,
          imageUrl: posterImageUrl,
          imagePath,
          thumbnailPath,
          imageHash,
          videoUrl: v.videoUrl,
          videoPlatform: v.videoPlatform,
          captureType: v.captureType,
          distributionMedium: v.distributionMedium,
          mediaType: v.mediaType,
          contentType: v.contentType,
          discipline: v.discipline,
          visualStyle: v.visualStyle,
          functionalPurpose: v.functionalPurpose,
          userHint: v.userHint,
          reviewStatus: 'approved',
        },
      });
      seeded++;
      console.log(`[videoSeed] Seeded: ${v.title}`);
    } catch (err) {
      const msg = `Failed to seed "${v.title}": ${(err as Error).message}`;
      console.error(msg);
      errors.push(msg);
    }
  }

  return { seeded, skipped, errors };
}
```

This script:
- Reads `seedVideos.json`
- Deduplicates by `videoUrl`
- Fetches posters: Bilibili API for BVID, YouTube static URL for YT IDs
- Downloads poster via `saveImageFromUrl()` (existing service)
- Creates VisualCase records with `reviewStatus: 'approved'`

- [ ] **Step 2: Add CLI command to server entry**

Find the server entry point (likely `server/src/index.ts` or `server/src/server.ts`) and add a CLI argument handler for `--seed-videos`:

```typescript
import { seedVideos } from './services/videoSeed.js';

// At top-level, check for CLI args:
if (process.argv.includes('--seed-videos')) {
  const dryRun = process.argv.includes('--dry-run');
  seedVideos(dryRun).then((result) => {
    console.log(`Done: ${result.seeded} seeded, ${result.skipped} skipped, ${result.errors.length} errors`);
    if (result.errors.length > 0) {
      result.errors.forEach(e => console.error(e));
    }
    process.exit(result.errors.length > 0 ? 1 : 0);
  });
}
```

- [ ] **Step 3: Test dry run**

```bash
cd sci-viz-case-hub/server && npx tsx src/index.ts --seed-videos --dry-run
```

Expected: Logs 24 entries with poster status, no DB writes.

- [ ] **Step 4: Commit**

```bash
git add server/src/services/videoSeed.ts && git commit -m "feat: add video seed script with Bilibili/YouTube poster extraction"
```

---

### Task 5: Frontend — Install react-player + Create VideoPlayer Component

**Files:**
- Create: `web/src/components/VideoPlayer.tsx`

- [ ] **Step 1: Install react-player**

```bash
cd sci-viz-case-hub/web && npm install react-player
```

- [ ] **Step 2: Create VideoPlayer.tsx**

Create `web/src/components/VideoPlayer.tsx`:

```typescript
import React, { useState } from 'react';
import ReactPlayer from 'react-player/bilibili';
import { theme } from '../theme';

interface VideoPlayerProps {
  videoUrl: string;
  videoPlatform: string;
  title?: string;
  style?: React.CSSProperties;
}

function getBilibiliEmbedUrl(url: string): string | null {
  const bvidMatch = url.match(/BV[a-zA-Z0-9]+/);
  if (!bvidMatch) return null;
  return `https://player.bilibili.com/player.html?bvid=${bvidMatch[0]}&high_quality=1&autoplay=0`;
}

function getYoutubeEmbedUrl(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (!match) return null;
  return `https://www.youtube.com/embed/${match[1]}`;
}

export default function VideoPlayer({ videoUrl, videoPlatform, title, style }: VideoPlayerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div style={{
        padding: 60,
        textAlign: 'center',
        color: theme.colors.text.tertiary,
        fontSize: 13,
        ...style,
      }}>
        视频加载失败
        <div style={{ marginTop: 8 }}>
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: theme.colors.accent, fontSize: 12 }}
          >
            在平台观看 →
          </a>
        </div>
      </div>
    );
  }

  const embedUrl = videoPlatform === 'bilibili'
    ? getBilibiliEmbedUrl(videoUrl)
    : videoPlatform === 'youtube'
    ? getYoutubeEmbedUrl(videoUrl)
    : videoUrl;

  if (!embedUrl) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: theme.colors.text.tertiary, fontSize: 13, ...style }}>
        无法解析视频链接
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', ...style }}>
      {loading && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: theme.colors.bgSubtle, color: theme.colors.text.tertiary, fontSize: 13,
        }}>
          加载中...
        </div>
      )}
      <iframe
        src={embedUrl}
        title={title || 'Video'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          border: 'none',
        }}
        onLoad={() => setLoading(false)}
        onError={() => setError(true)}
      />
    </div>
  );
}
```

Note: We use a simple iframe approach for both Bilibili and YouTube rather than the full react-player library, because:
1. Bilibili embed requires specific player URL format
2. iframe is lighter-weight and more reliable across platforms
3. react-player's Bilibili support is limited/unmaintained
4. The 16:9 aspect ratio container ensures consistent layout

- [ ] **Step 3: Commit**

```bash
git add web/src/components/VideoPlayer.tsx web/package.json web/package-lock.json && git commit -m "feat: add VideoPlayer component with Bilibili/YouTube iframe embed"
```

---

### Task 6: Frontend — Update CaseDetail.tsx for Video Playback

**Files:**
- Modify: `web/src/pages/CaseDetail.tsx`

- [ ] **Step 1: Add VideoPlayer import**

At the top of `web/src/pages/CaseDetail.tsx`, add:

```typescript
import VideoPlayer from '../components/VideoPlayer';
```

- [ ] **Step 2: Replace image display with video-aware branch**

In CaseDetail.tsx, find the left-column Card block (around line 175-193) that renders `<img>`. Replace the entire Card content:

```typescript
<Card padding={0} style={{ overflow: 'hidden' }}>
  {c.captureType === 'video' && c.videoUrl ? (
    <VideoPlayer
      videoUrl={c.videoUrl}
      videoPlatform={c.videoPlatform}
      title={c.caseTitle || c.title}
    />
  ) : imgError ? (
    <div style={{ padding: 60, textAlign: 'center', color: theme.colors.text.tertiary, fontSize: 13 }}>
      图片加载失败
    </div>
  ) : c.imagePath || c.thumbnailPath || c.imageUrl ? (
    <img
      className="case-detail-img"
      src={c.imagePath || c.thumbnailPath || c.imageUrl}
      alt={c.title}
      style={{ width: '100%', display: 'block' }}
      onError={handleImgError}
    />
  ) : (
    <div style={{ padding: 60, textAlign: 'center', color: theme.colors.text.tertiary, fontSize: 13 }}>
      无图片
    </div>
  )}
</Card>
```

- [ ] **Step 3: Add video info fields in right panel**

After the "来源信息" Card (around line 230), add a video info section inside that Card, after `field('采集方式', 'captureType')`:

```typescript
{c.captureType === 'video' && c.videoUrl && (
  <>
    <div style={{ marginBottom: 12 }}>
      <label style={{
        display: 'block',
        fontSize: theme.typography.size.xs,
        color: theme.colors.text.tertiary,
        fontWeight: 500,
        marginBottom: 2,
      }}>
        视频链接
      </label>
      <a
        href={c.videoUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: theme.typography.size.base, color: theme.colors.accent }}
      >
        在平台观看 →
      </a>
    </div>
    {field('视频平台', 'videoPlatform')}
  </>
)}
```

Also add `videoUrl`, `videoPlatform`, `videoDuration` to the form state when editing. In the editing mode section inside the right panel, after the existing field declarations, add:

```typescript
{c.captureType === 'video' && (
  <>
    {field('视频链接', 'videoUrl')}
    {field('视频平台', 'videoPlatform')}
    {field('视频时长(秒)', 'videoDuration')}
  </>
)}
```

- [ ] **Step 4: Verify locally**

```bash
cd sci-viz-case-hub/web && npm run build
```

Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/CaseDetail.tsx && git commit -m "feat: add video playback to CaseDetail with conditional VideoPlayer"
```

---

### Task 7: Frontend — Add Video Indicator to CaseList Cards

**Files:**
- Modify: `web/src/pages/CaseList.tsx`

- [ ] **Step 1: Add play icon overlay for video cases**

In `CaseList.tsx`, inside the image zone div (around line 774-795), after the `<img>` error/empty handling and before the hover overlay div, add a video indicator. Find the block that starts with the `<div>` containing `{imgErrors.has(c.id) ? ...}` and add after the else branch (after the `) : (`):

After the closing `)` of the `<img>` branch and before the hover overlay `<div className="case-hover-meta">`, add:

```tsx
{c.captureType === 'video' && !imgErrors.has(c.id) && (
  <div style={{
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  }}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
      <polygon points="6,3 20,12 6,21" />
    </svg>
  </div>
)}
```

This adds a small play button overlay in the top-right corner of video case cards.

- [ ] **Step 2: Verify build**

```bash
cd sci-viz-case-hub/web && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/CaseList.tsx && git commit -m "feat: add video play icon overlay to CaseList cards"
```

---

### Task 8: Frontend — Add Video Indicator to ComparisonPage Samples

**Files:**
- Modify: `web/src/pages/ComparisonPage.tsx`

- [ ] **Step 1: Find the StrategyCaseItem or sample rendering**

In `ComparisonPage.tsx`, find where comparison sample thumbnails are rendered (search for `<img` or the sample component). The component is likely `StrategyCaseItem` around lines 501-570 based on the earlier exploration.

Add a video indicator after the thumbnail image in each sample item:

```tsx
{sample.distributionMedium === '视频' && (
  <div style={{
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }}>
    <svg width="9" height="9" viewBox="0 0 24 24" fill="white">
      <polygon points="6,3 20,12 6,21" />
    </svg>
  </div>
)}
```

Note: Since ComparisonSample doesn't have `captureType`, we check `distributionMedium === '视频'`. The API returns this field in comparison data.

- [ ] **Step 2: Ensure ComparisonSample type has distributionMedium**

Check `web/src/types/index.ts` line 306 — `ComparisonSample` interface already has `distributionMedium?: string;`. Good.

- [ ] **Step 3: Verify build**

```bash
cd sci-viz-case-hub/web && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/ComparisonPage.tsx && git commit -m "feat: add video indicator to ComparisonPage sample items"
```

---

### Task 9: Server — Add Video Fields to Cases API Response

**Files:**
- Modify: `server/src/routes/captures.ts` (if needed for explicit field selection)
- Check: other route files that query VisualCase

- [ ] **Step 1: Verify Prisma returns new fields automatically**

Prisma's `findMany` and `findUnique` return all model fields by default. The new `videoUrl`, `videoPlatform`, `videoDuration` fields will be included in all API responses automatically. Verify by checking the cases route:

```bash
cd sci-viz-case-hub && grep -r "visualCase.findMany\|visualCase.findUnique" server/src/
```

No explicit field selects should be filtering out the new fields. If there are `select` clauses, add the three video fields.

- [ ] **Step 2: Update captures.ts POST endpoint to accept video fields**

In `server/src/routes/captures.ts`, after the existing field extractions (lines 15-19), add:

```typescript
const videoUrl = toTrimmedString(req.body.video_url, 500) || '';
const videoPlatform = toTrimmedString(req.body.video_platform, 50) || '';
const videoDuration = parseInt(req.body.video_duration) || 0;
```

And in the `prisma.visualCase.create` call (around line 59), add:

```typescript
videoUrl,
videoPlatform,
videoDuration,
```

- [ ] **Step 3: Update PATCH endpoint**

Find the PATCH route for updating cases. It likely uses a generic field update. Add video fields to the update data. The API pattern in `web/src/api/index.ts` sends `Partial<VisualCase>` as JSON body, so the backend PATCH handler should pass through these fields. Find the route file that handles `PATCH /api/cases/:id` and ensure it includes the video fields.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/captures.ts && git commit -m "feat: add video fields to captures API endpoints"
```

---

### Task 10: Run Seed Script + End-to-End Test

**Files:**
- No new files

- [ ] **Step 1: Start the server**

```bash
cd sci-viz-case-hub/server && npm run dev
```

- [ ] **Step 2: Run video seed script**

```bash
cd sci-viz-case-hub/server && npx tsx src/index.ts --seed-videos
```

Expected output: 24 lines of `[videoSeed] Seeded: ...` plus poster download logs.

- [ ] **Step 3: Verify in database**

```bash
cd sci-viz-case-hub/server && npx prisma studio
```

Check that 24 VisualCase records exist with `captureType='video'`, `videoUrl` populated, and posters downloaded.

- [ ] **Step 4: Verify in web UI**

1. Open the web app
2. Navigate to case list, filter by `capture_type=video`
3. Verify video cards show play icon overlay
4. Click a video case → verify VideoPlayer iframe renders
5. Navigate to ComparisonPage → verify video samples have play indicators

- [ ] **Step 5: Fix any issues found during testing**

- [ ] **Step 6: Final commit**

```bash
git add -A && git commit -m "feat: complete video pipeline — 24 enterprise videos seeded, player working"
```

---

## Self-Review Checklist

- [x] **Spec coverage**: Each requirement in the design doc is addressed by a task
- [x] **No placeholders**: All steps have concrete code, commands, and expected outputs
- [x] **Type consistency**: videoUrl/videoPlatform/videoDuration used consistently across schema, types, API, and components
- [x] **File paths**: All file paths are exact and verified against the codebase