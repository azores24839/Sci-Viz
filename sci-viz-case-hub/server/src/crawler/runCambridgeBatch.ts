import { discoverLinks } from './discoverLinks.js';
import { processSingleUrl } from './runUrlCrawl.js';
import { prisma } from '../prisma.js';
import { findDuplicateByUrl } from '../services/dedupe.js';
import pLimit from 'p-limit';

const SOURCES = [
  'Cambridge Research News','Cambridge Physics','Cambridge Chemistry','Cambridge Engineering',
  'Cambridge Zoology','Cambridge Earth Sciences','Cambridge Computer Science',
  'Cambridge Materials','Cambridge Plant Sciences','Cambridge Maths',
  'Cambridge Museums','Cambridge Botanic Garden',
];
const MAX_LINKS=80,MAX_PAGES=8,CONC=3;

async function main() {
  const exec=process.argv.includes('--execute');
  const verbose=process.argv.includes('--verbose');
  console.log(`=== Cambridge Crawl Batch ===`);
  console.log(`Mode: ${exec?'EXECUTE':'DRY-RUN'}`);

  const limit=pLimit(CONC);
  const queue:{name:string,sourceType:string,urls:string[]}[]=[];
  let totalEx=0;

  for(const name of SOURCES){
    const src=await prisma.crawlSource.findFirst({where:{name}});
    if(!src||!src.enabled){console.log(`[${name}] not found/disabled`);continue;}
    console.log(`\n[${name}] ${src.url}`);
    try{
      const links=await discoverLinks(src.url,MAX_LINKS,MAX_PAGES);
      let ex=0;const nw:string[]=[];
      for(const l of links){const d=await findDuplicateByUrl(l.url);d?ex++:nw.push(l.url);}
      totalEx+=ex;
      console.log(`  ${links.length} links, ${ex} dupes, ${nw.length} new`);
      if(verbose&&nw.length>0)for(const u of nw.slice(0,3))console.log(`    ${u}`);
      if(nw.length>0)queue.push({name:src.name,sourceType:src.sourceType,urls:nw});
    }catch(err:any){console.error(`  FAIL: ${err.message.substring(0,80)}`);}
  }

  const totalNew=queue.reduce((s,q)=>s+q.urls.length,0);
  if(!exec){console.log(`\n=== DRY-RUN: ${totalNew} new URLs ===`);queue.forEach(q=>console.log(`  ${q.name}: ${q.urls.length}`));console.log('Pass --execute to crawl.');return;}

  let proc=0,created=0,failed=0;
  for(const item of queue){
    console.log(`\n=== Crawling: ${item.name} (${item.urls.length} URLs) ===`);
    const results=await Promise.all(item.urls.map(url=>limit(async()=>{
      try{const r=await processSingleUrl(url,item.name,item.sourceType);proc++;created+=r.createdCaseCount;if(r.createdCaseCount>0)console.log(`  +${r.createdCaseCount} from ${new URL(url).pathname}`);return r;}
      catch(err:any){failed++;const m=(err as Error).message;if(failed<=20)console.error(`  FAIL: ${url?.substring(0,80)} — ${m.substring(0,80)}`);return null;}
    })));
    const sc=results.reduce((s,r)=>s+(r?.createdCaseCount||0),0);
    console.log(`  -> ${item.name}: ${sc} cases`);
  }
  console.log(`\n=== FINAL: ${proc} URLs, ${created} cases, ${failed} failed ===`);
}
main().catch(e=>{console.error(e);process.exit(1);}).finally(()=>prisma.$disconnect());
