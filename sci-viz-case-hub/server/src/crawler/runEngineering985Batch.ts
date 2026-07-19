import { discoverLinks } from './discoverLinks.js';
import { processSingleUrl } from './runUrlCrawl.js';
import { prisma } from '../prisma.js';

type Target = { name: string; roots: string[] };

const TARGETS: Target[] = [
  { name: '西北工业大学理工科研与国际合作', roots: ['https://news.nwpu.edu.cn/', 'https://guoji.nwpu.edu.cn/'] },
  { name: '大连理工大学理工科研与国际合作', roots: ['https://news.dlut.edu.cn/index.htm', 'https://dutdice.dlut.edu.cn/'] },
  { name: '天津大学理工科研与国际合作', roots: ['https://news.tju.edu.cn/', 'https://kj.tju.edu.cn/', 'https://www.tju.edu.cn/gjjl.htm'] },
  { name: '电子科技大学理工科研与国际合作', roots: ['https://news.uestc.edu.cn/dcxy.htm', 'https://news.uestc.edu.cn/mtcd.htm', 'https://en.uestc.edu.cn/'] },
  { name: '华南理工大学理工科研与国际合作', roots: ['https://news.scut.edu.cn/'] },
  { name: '同济大学理工科研与国际合作', roots: ['https://www.tongji.edu.cn/index.htm', 'https://www.tongji.edu.cn/info/1154/20351.htm'] },
  { name: '重庆大学理工科研与国际合作', roots: ['https://www.cqu.edu.cn/zdxw/zhxw.htm', 'https://intex.cqu.edu.cn/', 'https://kjc.cqu.edu.cn/index/gjhz.htm'] },
  { name: '东北大学理工科研与国际合作', roots: ['https://neunews.neu.edu.cn/index.htm', 'https://www.neu.edu.cn/'] },
  { name: '南京大学理工科研与国际合作', roots: ['https://www.nju.edu.cn/', 'https://wb.nju.edu.cn/main.psp'] },
  { name: '武汉大学理工科研与国际合作', roots: ['https://news.whu.edu.cn/', 'https://www.whu.edu.cn/'] },
  { name: '厦门大学理工科研与国际合作', roots: ['https://news.xmu.edu.cn/'] },
  { name: '山东大学理工科研与国际合作', roots: ['https://www.sdu.edu.cn/'] },
  { name: '中国海洋大学理工科研与国际合作', roots: ['https://news.ouc.edu.cn/'] },
  { name: '四川大学理工科研与国际合作', roots: ['https://news.scu.edu.cn/'] },
  { name: '中南大学理工科研与国际合作', roots: ['https://news.csu.edu.cn/xxyw.htm'] },
  { name: '湖南大学理工科研与国际合作', roots: ['https://news.hnu.edu.cn/'] },
  { name: '华东师范大学理工科研与国际合作', roots: ['https://news.ecnu.edu.cn/'] },
  { name: '中国农业大学理工科研与国际合作', roots: ['https://news.cau.edu.cn/'] },
  { name: '西北农林科技大学理工科研与国际合作', roots: ['https://news.nwafu.edu.cn/'] },
];

const only = process.argv.find(a => a.startsWith('--only='))?.split('=').slice(1).join('=') || '';
const maxLinksPerRoot = Number(process.argv.find(a => a.startsWith('--max-links='))?.split('=')[1] || 80);
const maxPagesPerRoot = Number(process.argv.find(a => a.startsWith('--max-pages='))?.split('=')[1] || 4);
const maxCasesPerTarget = 500;

function selected(target: Target) {
  if (!only) return true;
  return only.split(',').some(term => target.name.includes(term.trim()));
}

async function main() {
  const targets = TARGETS.filter(selected);
  const summary: Array<Record<string, unknown>> = [];
  for (const target of targets) {
    const urls = new Set<string>();
    for (const root of target.roots) {
      try {
        const links = await discoverLinks(root, maxLinksPerRoot, maxPagesPerRoot);
        for (const link of links) urls.add(link.url);
        console.log(`[discover] ${target.name} ${root}: ${links.length}`);
      } catch (error) {
        console.log(`[discover-failed] ${target.name} ${root}: ${(error as Error).message}`);
      }
    }
    const before = await prisma.visualCase.count({ where: { userHint: { startsWith: target.name } } });
    let created = 0, processed = 0, failed = 0;
    const ordered = [...urls];
    for (const url of ordered) {
      if (before + created >= maxCasesPerTarget) break;
      try {
        const result = await processSingleUrl(url, target.name, 'university_research_international');
        processed++;
        created += result.createdCaseCount;
        console.log(`[crawl] ${target.name} ${processed}/${ordered.length} +${result.createdCaseCount}`);
      } catch (error) {
        failed++;
        console.log(`[crawl-failed] ${target.name} ${url}: ${(error as Error).message}`);
      }
    }
    const remaining = Math.max(0, ordered.length - processed);
    const capped = before + created >= maxCasesPerTarget;
    const item = { name: target.name, discovered: ordered.length, before, created, after: before + created, processed, failed, remaining, capped };
    summary.push(item);
    console.log(`[done] ${JSON.stringify(item)}`);
  }
  console.log('SUMMARY');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
