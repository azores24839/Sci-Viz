import { prisma } from '../prisma.js';

type Decision = {
  status: 'approved' | 'rejected' | 'needs_review';
  reason: string;
};

const LOW_VALUE_PATTERNS = [
  /考研|真题|复试|初试|招生|录取|保研|高分|经验分享|专业课|估分|资料|网学天地/i,
  /精品课|公开课|课程|老师精讲|知识点|补课|学长学姐/i,
  /婚礼|收藏备份|住培|讲座|方案汇报|答辩|开题|校园生活|文艺晚会|院系杯|冠军赛|宿舍|读研的日常/i,
  /话题|董小姐|F小姐|男生|五百块|没毛病/i,
  /中国科学技术大学|中南大学|南方科技大学|南京航空航天大学金城学院/i,
  /email-alerts|media-contacts|press\s+room|contact\s+us/i,
];

const STRONG_POSITIVE_PATTERNS = [
  /tableau|dashboard|visualization|viz of the day|data\s+visual/i,
  /stanford.*research|research.*stanford|science|engineering|visualization/i,
  /工程机器人|机器人取矿|机甲大师|robomaster|机器人|航天|航空|无人机/i,
  /实验|实验室|科研成果|研究成果|科学研究|可视化|仿真|模拟|显微|材料|船舶|海洋/i,
  /computer\s+science|artificial\s+intelligence|machine\s+learning|medical\s+device|animation/i,
];

const GENERIC_SEARCH_PATTERNS = [
  /哔哩哔哩_bilibili/i,
  /bilibili是国内知名/i,
  /youtube/i,
  /视频播放量/i,
  /public supplement/i,
];

const QUERY_LINE_PATTERNS = [
  /科研.*视频/i,
  /research.*visualization/i,
  /product animation/i,
  /dashboard scientific visualization/i,
];

function compactText(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function signalText(c: {
  title: string | null;
  caseTitle: string | null;
  pageTitle: string | null;
  contextText: string | null;
  sourceUrl: string | null;
}): string {
  const rawLines = [
    c.title,
    c.caseTitle,
    c.pageTitle,
    ...(c.contextText || '').split('\n'),
    c.sourceUrl,
  ];

  return rawLines
    .map(compactText)
    .filter(Boolean)
    .filter(line => !GENERIC_SEARCH_PATTERNS.some(pattern => pattern.test(line)))
    .join(' ');
}

function evidenceText(c: {
  pageTitle: string | null;
  contextText: string | null;
}): string {
  const pageTitle = compactText(c.pageTitle);
  const lines = (c.contextText || '')
    .split('\n')
    .map(compactText)
    .filter(Boolean)
    .filter((_, index) => index > 0)
    .filter(line => line !== pageTitle)
    .filter(line => !GENERIC_SEARCH_PATTERNS.some(pattern => pattern.test(line)))
    .filter(line => !QUERY_LINE_PATTERNS.some(pattern => pattern.test(line)));

  return lines.join(' ');
}

function isBilibiliSearch(c: { sourceDomain: string | null; sourceUrl: string | null }) {
  return /search\.bilibili\.com/i.test(c.sourceDomain || '') || /search\.bilibili\.com/i.test(c.sourceUrl || '');
}

function hasTargetSignal(userHint: string | null, evidence: string): boolean {
  if (!userHint) return true;
  if (userHint.includes('SJTU CS')) return /上海交大|上海交通大学|SJTU|计算机|人工智能|AI|机器人/i.test(evidence);
  if (userHint.includes('HIT')) return /哈工大|哈尔滨工业大学|HIT|I Hiter|航天|机器人|RoboMaster/i.test(evidence);
  if (userHint.includes('SEU')) return /东南大学|SEU|建筑学院|建筑|机器人|数字|仿真/i.test(evidence);
  if (userHint.includes('SJTU ME')) return /上海交大|上海交通大学|机械|动力|机器人|工程/i.test(evidence);
  if (userHint.includes('SJTU SMSE')) return /上海交大|上海交通大学|材料|显微|实验/i.test(evidence);
  if (userHint.includes('SJTU OCE')) return /上海交大|上海交通大学|船舶|海洋|建筑|工程/i.test(evidence);
  return true;
}

function decide(c: {
  userHint: string | null;
  collectionScore: number | null;
  sourceDomain: string | null;
  title: string | null;
  caseTitle: string | null;
  pageTitle: string | null;
  contextText: string | null;
  sourceUrl: string | null;
}): Decision {
  const text = signalText(c);
  const evidence = evidenceText(c);
  const allText = [
    c.userHint,
    c.title,
    c.caseTitle,
    c.pageTitle,
    c.contextText,
    c.sourceUrl,
  ].map(compactText).join(' ');
  const score = c.collectionScore || 0;

  if (c.userHint?.includes('Boston Scientific')) {
    if (/retained as video fallback/i.test(allText)) {
      return { status: 'needs_review', reason: 'public_review:manual_needed: Boston Scientific video fallback retained for quota only' };
    }
    return { status: 'rejected', reason: 'public_review:auto_reject: official target already supplemented; public video-search thumbnails were low-signal' };
  }

  const lowValueHit = LOW_VALUE_PATTERNS.find(pattern => pattern.test(allText));
  if (lowValueHit) {
    return { status: 'rejected', reason: `public_review:auto_reject: low-value/search-noise pattern ${lowValueHit}` };
  }

  if (score > 0 && score < 35) {
    return { status: 'rejected', reason: `public_review:auto_reject: collectionScore ${score} below public supplement threshold` };
  }

  if (isBilibiliSearch(c)) {
    if (!evidence) {
      return { status: 'rejected', reason: 'public_review:auto_reject: bilibili search result has no item-level evidence beyond query/platform text' };
    }
    if (!hasTargetSignal(c.userHint, evidence)) {
      return { status: 'rejected', reason: 'public_review:auto_reject: bilibili item evidence does not match target institution/domain' };
    }
  }

  const hasStrongSignal = STRONG_POSITIVE_PATTERNS.some(pattern => pattern.test(isBilibiliSearch(c) ? evidence : text));

  if (c.userHint?.includes('Tableau public gallery') && score >= 50 && hasStrongSignal) {
    return { status: 'approved', reason: 'public_review:auto_approve: Tableau public visualization/gallery signal' };
  }

  if (score >= 65 && hasStrongSignal) {
    return { status: 'approved', reason: 'public_review:auto_approve: high score with target research/visualization signal' };
  }

  if (score >= 50 && hasStrongSignal && !/bilibili|youtube/i.test(c.sourceDomain || '')) {
    return { status: 'approved', reason: 'public_review:auto_approve: public non-video page with target visualization signal' };
  }

  return { status: 'needs_review', reason: 'public_review:manual_needed: ambiguous public-search/video result' };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--execute');
  const revisit = process.argv.includes('--revisit');

  const cases = await prisma.visualCase.findMany({
    where: {
      userHint: { contains: 'public_supplement' },
      reviewStatus: revisit ? { in: ['approved', 'needs_review', 'low_confidence_review'] } : 'needs_review',
      ...(revisit ? {} : { manualNotes: { not: { contains: 'public_review:' } } }),
    },
    select: {
      id: true,
      title: true,
      caseTitle: true,
      pageTitle: true,
      contextText: true,
      sourceUrl: true,
      sourceDomain: true,
      userHint: true,
      collectionScore: true,
      manualNotes: true,
    },
    orderBy: [{ userHint: 'asc' }, { collectionScore: 'desc' }],
  });

  const decisions = cases.map(c => ({ c, decision: decide(c) }));
  const summary = new Map<string, number>();
  for (const row of decisions) {
    const key = `${row.c.userHint || '(unknown)'} -> ${row.decision.status}`;
    summary.set(key, (summary.get(key) || 0) + 1);
  }

  console.log(`[reviewPublicSupplements] mode=${dryRun ? 'dry-run' : 'execute'} revisit=${revisit} candidates=${cases.length}`);
  for (const [key, count] of [...summary.entries()].sort()) {
    console.log(`  ${key}: ${count}`);
  }

  const samples = decisions
    .filter(row => row.decision.status !== 'approved')
    .slice(0, 12)
    .map(row => ({
      id: row.c.id,
      target: row.c.userHint,
      status: row.decision.status,
      score: row.c.collectionScore,
      title: row.c.caseTitle || row.c.title,
      reason: row.decision.reason,
    }));
  console.log('\nSamples needing caution/reject:');
  console.log(JSON.stringify(samples, null, 2));

  if (dryRun) {
    console.log('\nDry run only. Re-run with --execute to update database.');
    return;
  }

  let updated = 0;
  for (const row of decisions) {
    const notes = [row.c.manualNotes, row.decision.reason].filter(Boolean).join('\n');
    await prisma.visualCase.update({
      where: { id: row.c.id },
      data: {
        reviewStatus: row.decision.status,
        manualNotes: notes,
      },
    });
    updated += 1;
  }

  console.log(`\nUpdated ${updated} public supplement cases.`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
