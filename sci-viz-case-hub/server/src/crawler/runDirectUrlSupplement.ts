import { prisma } from '../prisma.js';
import { findDuplicateByUrl } from '../services/dedupe.js';
import { processSingleUrl } from './runUrlCrawl.js';

type DirectTarget = {
  label: string;
  goal: number;
  domains: string[];
  sourceName: string;
  sourceType: string;
  urls: string[];
};

const TARGETS: DirectTarget[] = [
  {
    label: 'Boston Scientific',
    goal: 20,
    domains: ['news.bostonscientific.com', 'www.bostonscientific.com'],
    sourceName: 'Boston Scientific direct product pages',
    sourceType: 'enterprise_direct_page',
    urls: [
      'https://www.bostonscientific.com/en-US/medical-specialties/neurological-surgery/deep-brain-stimulation-system/image-guided-programming.html',
      'https://news.bostonscientific.com/2022-04-12-Boston-Scientific-Receives-FDA-Approval-for-Next-Generation-Image-Guided-Programming-Software-for-Deep-Brain-Stimulation-Therapy',
      'https://www.bostonscientific.com/en-US/products/catheters--mapping/rhythmia-hdx-mapping-system.html',
      'https://www.bostonscientific.com/en-US/products/laac-system/watchman-flx.html',
      'https://www.bostonscientific.com/en-US/products/stents--coronary/synergy-xd-everolimus-eluting-platinum-chromium-coronary-stent-system.html',
    ],
  },
  {
    label: 'SJTU cs',
    goal: 20,
    domains: ['cs.sjtu.edu.cn', 'www.cs.sjtu.edu.cn'],
    sourceName: '上海交大-计算机学院直达科研页',
    sourceType: 'university_department_direct_page',
    urls: [
      'https://www.cs.sjtu.edu.cn/yjjg/822.html',
      'https://www.cs.sjtu.edu.cn/en/yjjg/822.html',
      'https://cs.sjtu.edu.cn/cse/InstituteDetail.aspx?id=4',
      'https://cs.sjtu.edu.cn/cse/InstituteDetail.aspx?id=6',
      'https://cs.sjtu.edu.cn/cse/InstituteDetail.aspx?id=7',
    ],
  },
  {
    label: 'SJTU smse',
    goal: 20,
    domains: ['smse.sjtu.edu.cn'],
    sourceName: '上海交大-材料学院直达科研成果页',
    sourceType: 'university_department_direct_page',
    urls: [
      'https://smse.sjtu.edu.cn/post/detail/5079',
      'https://smse.sjtu.edu.cn/post/detail/5118',
      'https://smse.sjtu.edu.cn/post/detail/5339',
      'https://smse.sjtu.edu.cn/post/detail/4944',
      'https://smse.sjtu.edu.cn/post/detail/3932',
      'https://smse.sjtu.edu.cn/post/detail/2941',
      'https://smse.sjtu.edu.cn/post/detail/4113',
      'https://smse.sjtu.edu.cn/kxyj/kygk',
      'https://smse.sjtu.edu.cn/about',
    ],
  },
  {
    label: 'SJTU oce',
    goal: 20,
    domains: ['oce.sjtu.edu.cn'],
    sourceName: '上海交大-船建学院直达科研成果页',
    sourceType: 'university_department_direct_page',
    urls: [
      'https://oce.sjtu.edu.cn/cg_js/13822.html',
      'https://oce.sjtu.edu.cn/zzjg_yx/3104.html',
      'https://oce.sjtu.edu.cn/sys1.html',
      'https://oce.sjtu.edu.cn/zzjg_sys/12954.html',
    ],
  },
  {
    label: 'HIT',
    goal: 20,
    domains: ['news.hit.edu.cn'],
    sourceName: '哈尔滨工业大学-直达科研成果页',
    sourceType: 'university_news_direct_page',
    urls: [
      'https://news.hit.edu.cn/2026/0512/c11819a242220/page.htm',
      'https://news.hit.edu.cn/2026/0429/c11819a242085/page.htm',
      'https://news.hit.edu.cn/2026/0126/c11819a241007/page.htm',
      'https://news.hit.edu.cn/2026/0511/c11508a242211/page.htm',
      'https://news.hit.edu.cn/2026/0311/c11508a241436/page.htm',
      'https://news.hit.edu.cn/2026/0311/c11819a241453/page.htm',
      'https://news.hit.edu.cn/2025/0818/c11508a239122/page.htm',
      'https://news.hit.edu.cn/2025/0707/c11819a238475/page.htm',
      'https://news.hit.edu.cn/2025/0625/c11819a238407/page.htm',
      'https://news.hit.edu.cn/2025/0618/c11819a238366/page.htm',
      'https://news.hit.edu.cn/2025/0110/c11819a237230/page.htm',
      'https://news.hit.edu.cn/2024/1205/c11819a236969/page.htm',
      'https://news.hit.edu.cn/2024/0624/c1510a236096/page.htm',
      'https://news.hit.edu.cn/2024/0810/c1510a236347/page.htm',
      'https://news.hit.edu.cn/2023/0623/c1510a233659/page.htm',
      'https://news.hit.edu.cn/2022/1011/c1510a232302/page.htm',
    ],
  },
  {
    label: 'SEU',
    goal: 20,
    domains: ['news.seu.edu.cn', 'kjc.seu.edu.cn', 'me.seu.edu.cn', 'automation.seu.edu.cn', 'arch.seu.edu.cn'],
    sourceName: '东南大学-直达科研成果页',
    sourceType: 'university_news_direct_page',
    urls: [
      'https://kjc.seu.edu.cn/2026/0207/c29280a555594/page.htm',
      'https://kjc.seu.edu.cn/2024/0508/c29280a489896/page.htm',
      'https://kjc.seu.edu.cn/2023/0915/c29280a464503/page.htm',
      'https://kjc.seu.edu.cn/2024/0626/c29280a495428/page.htm',
      'https://kjc.seu.edu.cn/2026/0207/c29280a555591/page.htm',
      'https://automation.seu.edu.cn/2026/0324/c24459a559189/page.htm',
      'https://me.seu.edu.cn/2024/0613/c12307a493760/page.htm',
      'https://me.seu.edu.cn/2017/0721/c1298a193077/page.htm',
      'https://me.seu.edu.cn/2026/0106/c61623a551347/pagem.htm',
      'https://arch.seu.edu.cn/2022/0425/c9122a406013/page.htm',
      'https://news.seu.edu.cn/2024/0508/c5527a489872/page.htm',
      'https://news.seu.edu.cn/2023/0402/c5485a440608/page.htm',
      'https://news.seu.edu.cn/2026/0519/c5495a568069/page.htm',
      'https://news.seu.edu.cn/2025/0626/c5485a534500/page.htm',
    ],
  },
];

function getStringArg(name: string): string {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return raw ? raw.split('=').slice(1).join('=') : '';
}

function wanted(target: DirectTarget, only: string): boolean {
  if (!only) return true;
  const terms = only.split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
  const haystack = `${target.label} ${target.sourceName} ${target.domains.join(' ')}`.toLowerCase();
  return terms.some(term => haystack.includes(term));
}

async function countTarget(target: DirectTarget) {
  return prisma.visualCase.count({
    where: {
      sourceDomain: { in: target.domains },
      reviewStatus: { not: 'rejected' },
    },
  });
}

async function markDirectCases(sourceName: string) {
  const updated = await prisma.visualCase.updateMany({
    where: {
      userHint: { startsWith: sourceName },
      reviewStatus: { in: ['pending_ai_analysis', 'analysis_failed'] },
    },
    data: {
      reviewStatus: 'needs_review',
      manualNotes: 'direct_url_supplement: exact official/direct page; AI analysis unavailable, queued for human review',
    },
  });
  return updated.count;
}

async function runTarget(target: DirectTarget, execute: boolean) {
  const before = await countTarget(target);
  const gap = Math.max(0, target.goal - before);
  let processed = 0;
  let created = 0;
  let duplicates = 0;
  let failed = 0;

  if (!gap) {
    console.log(`[skip] ${target.label}: current=${before}, goal=${target.goal}`);
    return { label: target.label, before, after: before, goal: target.goal, processed, created, duplicates, failed, marked: 0 };
  }

  for (const url of target.urls) {
    if (created >= gap) break;
    try {
      const duplicate = await findDuplicateByUrl(url);
      if (duplicate) {
        duplicates++;
        continue;
      }
      if (!execute) {
        console.log(`[dry-run] ${target.label}: ${url}`);
        continue;
      }
      const result = await processSingleUrl(url, target.sourceName, target.sourceType);
      processed++;
      created += result.createdCaseCount;
      console.log(`[crawl] ${target.label}: +${result.createdCaseCount} ${url}`);
      for (const err of result.errors.slice(0, 3)) {
        console.log(`  [warn] ${err}`);
      }
    } catch (err) {
      failed++;
      console.log(`[crawl] ${target.label}: failed ${url}: ${(err as Error).message}`);
    }
  }

  const marked = execute ? await markDirectCases(target.sourceName) : 0;
  const after = await countTarget(target);
  console.log(`[done] ${target.label}: ${before}->${after}, created=${created}, marked=${marked}, dupes=${duplicates}, failed=${failed}`);
  return { label: target.label, before, after, goal: target.goal, processed, created, duplicates, failed, marked };
}

async function main() {
  const execute = process.argv.includes('--execute');
  const only = getStringArg('only');
  const selected = TARGETS.filter(target => wanted(target, only));
  if (!selected.length) throw new Error(`No targets matched --only=${only}`);

  console.log(`Direct URL supplement: ${execute ? 'EXECUTE' : 'DRY-RUN'} (${selected.length} targets)`);
  const results = [];
  for (const target of selected) {
    results.push(await runTarget(target, execute));
  }
  console.log('SUMMARY');
  console.log(JSON.stringify(results, null, 2));
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
