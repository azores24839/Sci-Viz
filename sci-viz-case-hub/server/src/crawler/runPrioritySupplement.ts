import { prisma } from '../prisma.js';
import { discoverLinks } from './discoverLinks.js';
import { processSingleUrl } from './runUrlCrawl.js';
import { findDuplicateByUrl } from '../services/dedupe.js';

type Target = {
  label: string;
  goal: number;
  domains: string[];
  sourceNames: string[];
  maxLinks: number;
  maxPages: number;
  sourceType?: string;
};

const TARGETS: Target[] = [
  { label: 'LBNL', goal: 20, domains: ['newscenter.lbl.gov'], sourceNames: ['Berkeley Lab News Center', 'Berkeley Lab News - Research', 'Berkeley Lab - Computing Sciences', 'Berkeley Lab - Energy', 'Berkeley Lab - Physical Sciences'], maxLinks: 24, maxPages: 2, sourceType: 'national_lab_news' },
  { label: 'MPG', goal: 20, domains: ['www.mpg.de'], sourceNames: ['Max Planck Society Newsroom', 'Max Planck Research Highlights', 'Max Planck - Physics', 'Max Planck - Biology Medicine', 'Max Planck - Chemistry'], maxLinks: 24, maxPages: 2, sourceType: 'research_institute_news' },
  { label: 'Stanford Engineering', goal: 20, domains: ['engineering.stanford.edu'], sourceNames: ['Stanford Engineering News', 'Stanford Engineering - News Feed'], maxLinks: 24, maxPages: 2, sourceType: 'university_department_news' },
  { label: 'Stanford News', goal: 30, domains: ['news.stanford.edu'], sourceNames: ['Stanford Report', 'Stanford Report - Science', 'Stanford Report - Health', 'Stanford Report - Technology'], maxLinks: 12, maxPages: 1, sourceType: 'university_research_news' },
  { label: 'Tableau', goal: 30, domains: ['public.tableau.com'], sourceNames: ['Tableau Viz Gallery', 'Tableau Public Gallery'], maxLinks: 20, maxPages: 2, sourceType: 'visualization_gallery' },

  { label: 'ZEISS', goal: 20, domains: ['www.zeiss.com'], sourceNames: ['ZEISS 蔡司半导体制造技术'], maxLinks: 20, maxPages: 2, sourceType: 'enterprise_technology_pages' },
  { label: 'Boston Scientific', goal: 20, domains: ['news.bostonscientific.com', 'www.bostonscientific.com'], sourceNames: ['Boston Scientific Newsroom', 'Boston Scientific Electrophysiology', 'Boston Scientific Interventional Cardiology', 'Boston Scientific Endoscopy', 'Boston Scientific Newsroom P2', 'Boston Scientific Newsroom P3', 'Boston Scientific Newsroom P4'], maxLinks: 20, maxPages: 2, sourceType: 'enterprise' },
  { label: 'NVIDIA', goal: 20, domains: ['developer.nvidia.com', 'www.nvidia.com'], sourceNames: ['NVIDIA Technical Blog', 'NVIDIA Customer Stories', 'NVIDIA Data Center Solutions', 'NVIDIA Autonomous Machines', 'NVIDIA Healthcare Solutions', 'NVIDIA Robotics'], maxLinks: 18, maxPages: 2, sourceType: 'enterprise' },
  { label: 'Microsoft', goal: 20, domains: ['www.microsoft.com', 'azure.microsoft.com', 'aiotlabs.microsoft.com'], sourceNames: ['Microsoft Azure Blog', 'Microsoft Industry Stories', 'Microsoft AI Customer Stories', 'Microsoft AI Co-Innovation Labs'], maxLinks: 18, maxPages: 2, sourceType: 'enterprise' },
  { label: 'ASML', goal: 20, domains: ['www.asml.com'], sourceNames: ['ASML 半导体光刻系统'], maxLinks: 20, maxPages: 2, sourceType: 'enterprise_technology_pages' },
  { label: 'Airbus', goal: 20, domains: ['www.airbus.com'], sourceNames: ['Airbus Newsroom', 'Airbus Innovation', 'Airbus Commercial Aircraft', 'Airbus Helicopters', 'Airbus Defence and Space'], maxLinks: 18, maxPages: 2, sourceType: 'enterprise' },
  { label: 'Siemens Healthineers', goal: 20, domains: ['www.siemens-healthineers.com'], sourceNames: ['Siemens Healthineers', 'Siemens Healthineers MRI', 'Siemens Healthineers CT', 'Siemens Healthineers Ultrasound', 'Siemens Healthineers Stories'], maxLinks: 20, maxPages: 2, sourceType: 'enterprise' },
  { label: 'Xylem', goal: 20, domains: ['www.xylem.com'], sourceNames: ['Xylem Newsroom', 'Xylem Applications', 'Xylem Solutions', 'Xylem Products Services', 'Xylem Newsroom Overview'], maxLinks: 18, maxPages: 2, sourceType: 'enterprise' },

  { label: 'SJTU me', goal: 20, domains: ['me.sjtu.edu.cn'], sourceNames: ['上海交大-机械与动力工程学院'], maxLinks: 24, maxPages: 2, sourceType: 'university_department_news' },
  { label: 'SJTU seiee', goal: 20, domains: ['www.seiee.sjtu.edu.cn', 'seiee.sjtu.edu.cn'], sourceNames: ['上海交大-电子信息与电气工程学院'], maxLinks: 24, maxPages: 2, sourceType: 'university_department_news' },
  { label: 'SJTU cs', goal: 20, domains: ['cs.sjtu.edu.cn'], sourceNames: ['上海交大-计算机学院'], maxLinks: 24, maxPages: 2, sourceType: 'university_department_news' },
  { label: 'SJTU bme', goal: 20, domains: ['bme.sjtu.edu.cn'], sourceNames: ['上海交大-生物医学工程学院'], maxLinks: 24, maxPages: 2, sourceType: 'university_department_news' },
  { label: 'SJTU aero', goal: 20, domains: ['www.aero.sjtu.edu.cn', 'aero.sjtu.edu.cn'], sourceNames: ['上海交大-航空航天学院'], maxLinks: 24, maxPages: 2, sourceType: 'university_department_news' },
  { label: 'SJTU smse', goal: 20, domains: ['smse.sjtu.edu.cn'], sourceNames: ['上海交大-材料科学与工程学院'], maxLinks: 24, maxPages: 2, sourceType: 'university_department_news' },
  { label: 'SJTU sese', goal: 20, domains: ['sese.sjtu.edu.cn'], sourceNames: ['上海交大-环境科学与工程学院'], maxLinks: 24, maxPages: 2, sourceType: 'university_department_news' },
  { label: 'SJTU oce', goal: 20, domains: ['oce.sjtu.edu.cn'], sourceNames: ['上海交大-船舶海洋与建筑工程学院'], maxLinks: 24, maxPages: 2, sourceType: 'university_department_news' },

  { label: 'HIT', goal: 20, domains: ['news.hit.edu.cn'], sourceNames: ['哈尔滨工业大学-新闻网'], maxLinks: 24, maxPages: 2, sourceType: 'university_news' },
  { label: 'SEU', goal: 20, domains: ['news.seu.edu.cn'], sourceNames: ['东南大学-新闻网'], maxLinks: 24, maxPages: 2, sourceType: 'university_news' },
  { label: 'BUAA', goal: 20, domains: ['news.buaa.edu.cn'], sourceNames: ['北京航空航天大学-新闻网'], maxLinks: 24, maxPages: 2, sourceType: 'university_news' },
  { label: 'XJTU', goal: 20, domains: ['news.xjtu.edu.cn'], sourceNames: ['西安交通大学-新闻网'], maxLinks: 24, maxPages: 2, sourceType: 'university_news' },
  { label: 'HUST', goal: 20, domains: ['news.hust.edu.cn'], sourceNames: ['华中科技大学-新闻网'], maxLinks: 24, maxPages: 2, sourceType: 'university_news' },
  { label: 'BIT', goal: 20, domains: ['www.bit.edu.cn'], sourceNames: ['北京理工大学-新闻网'], maxLinks: 24, maxPages: 2, sourceType: 'university_news' },
];

function getStringArg(name: string): string {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return raw ? raw.split('=').slice(1).join('=') : '';
}

function wanted(target: Target, only: string): boolean {
  if (!only) return true;
  const terms = only.split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
  const haystack = `${target.label} ${target.domains.join(' ')} ${target.sourceNames.join(' ')}`.toLowerCase();
  return terms.some(term => haystack.includes(term));
}

async function countTarget(target: Target, statuses?: string[]) {
  return prisma.visualCase.count({
    where: {
      sourceDomain: { in: target.domains },
      ...(statuses ? { reviewStatus: { in: statuses } } : { reviewStatus: { not: 'rejected' } }),
    },
  });
}

async function sourcesFor(target: Target) {
  return prisma.crawlSource.findMany({
    where: {
      enabled: true,
      OR: target.sourceNames.map(name => ({ name })),
    },
    orderBy: { id: 'asc' },
  });
}

async function discoverForTarget(target: Target) {
  const sources = await sourcesFor(target);
  const urls: Array<{ url: string; sourceName: string; sourceType: string }> = [];

  for (const source of sources) {
    try {
      const links = await discoverLinks(source.url, target.maxLinks, target.maxPages);
      for (const link of links) {
        urls.push({ url: link.url, sourceName: source.name, sourceType: source.sourceType || target.sourceType || 'web' });
      }
      console.log(`[discover] ${target.label} / ${source.name}: ${links.length}`);
    } catch (err) {
      console.log(`[discover] ${target.label} / ${source.name}: failed: ${(err as Error).message}`);
    }
  }

  return Array.from(new Map(urls.map(item => [item.url, item])).values());
}

async function runTarget(target: Target, execute: boolean) {
  const current = await countTarget(target);
  const approved = await countTarget(target, ['approved']);
  const gap = Math.max(0, target.goal - current);

  if (gap === 0) {
    console.log(`[skip] ${target.label}: current=${current}, approved=${approved}, goal=${target.goal}`);
    return { label: target.label, current, approved, goal: target.goal, discovered: 0, processed: 0, created: 0, skipped: true };
  }

  const discovered = await discoverForTarget(target);
  let processed = 0;
  let created = 0;
  let duplicates = 0;
  let failed = 0;

  if (!execute) {
    console.log(`[dry-run] ${target.label}: current=${current}, approved=${approved}, goal=${target.goal}, gap=${gap}, newCandidates=${discovered.length}`);
    return { label: target.label, current, approved, goal: target.goal, discovered: discovered.length, processed, created, duplicates, failed };
  }

  for (const item of discovered) {
    if (created >= gap) break;
    try {
      const duplicate = await findDuplicateByUrl(item.url);
      if (duplicate) {
        duplicates++;
        continue;
      }
      const result = await processSingleUrl(item.url, item.sourceName, item.sourceType);
      processed++;
      created += result.createdCaseCount;
      console.log(`[crawl] ${target.label}: +${result.createdCaseCount} ${item.url}`);
    } catch (err) {
      failed++;
      console.log(`[crawl] ${target.label}: failed ${item.url}: ${(err as Error).message}`);
    }
  }

  const after = await countTarget(target);
  const approvedAfter = await countTarget(target, ['approved']);
  console.log(`[done] ${target.label}: current ${current}->${after}, approved ${approved}->${approvedAfter}, created=${created}, processed=${processed}, dupes=${duplicates}, failed=${failed}`);
  return { label: target.label, current, after, approved, approvedAfter, goal: target.goal, discovered: discovered.length, processed, created, duplicates, failed };
}

async function main() {
  const execute = process.argv.includes('--execute');
  const only = getStringArg('only');
  const selected = TARGETS.filter(target => wanted(target, only));
  if (!selected.length) throw new Error(`No targets matched --only=${only}`);

  console.log(`Priority supplement: ${execute ? 'EXECUTE' : 'DRY-RUN'} (${selected.length} targets)`);
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
