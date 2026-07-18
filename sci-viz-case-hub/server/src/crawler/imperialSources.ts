import { prisma } from '../prisma.js';

const SRC=[
  {n:'Imperial News (all)',u:'https://www.imperial.ac.uk/news/',t:'university_news',c:'I',tier:'A',v:'全校科研新闻配图、实验室照片、医学影像' },
  {n:'Imperial News - Science',u:'https://www.imperial.ac.uk/news/?topic=science',t:'university_news',c:'I',tier:'A',v:'自然科学新闻：物理/化学/生命科学配图' },
  {n:'Imperial News - Engineering',u:'https://www.imperial.ac.uk/news/?topic=engineering',t:'university_news',c:'I',tier:'A',v:'工程新闻：航空/材料/电子/机器人配图' },
  {n:'Imperial News - Health',u:'https://www.imperial.ac.uk/news/?topic=health',t:'university_news',c:'I',tier:'A',v:'医学新闻：药物/神经科学/公共卫生配图' },
  {n:'Imperial Physics',u:'https://www.imperial.ac.uk/physics/',t:'university_news',c:'I',tier:'A',v:'物理系研究配图：量子/光子/宇宙学/等离子体' },
  {n:'Imperial Life Sciences',u:'https://www.imperial.ac.uk/life-sciences/',t:'university_news',c:'I',tier:'A',v:'生命科学配图：分子生物/生态/基因组学' },
  {n:'Imperial Chemistry',u:'https://www.imperial.ac.uk/chemistry/',t:'university_news',c:'I',tier:'A',v:'化学系配图：分子结构/催化/材料化学' },
  {n:'Imperial Computing',u:'https://www.imperial.ac.uk/computing/',t:'university_news',c:'I',tier:'A',v:'计算机系配图：AI/视觉计算/安全/系统' },
  {n:'Imperial Bioengineering',u:'https://www.imperial.ac.uk/bioengineering/',t:'university_news',c:'I',tier:'A',v:'生物工程配图：神经科技/机器人/生物材料' },
  {n:'Imperial Chemical Eng',u:'https://www.imperial.ac.uk/chemical-engineering/',t:'university_news',c:'I',tier:'A',v:'化工系配图：过程工程/碳捕获/多尺度建模' },
  {n:'Imperial Materials',u:'https://www.imperial.ac.uk/materials/',t:'university_news',c:'I',tier:'A',v:'材料系配图：纳米材料/合金/复合材料' },
  {n:'Imperial Earth Science',u:'https://www.imperial.ac.uk/earth-science/',t:'university_news',c:'I',tier:'A',v:'地球科学配图：地质/地球物理/气候' },
  {n:'Imperial EEE',u:'https://www.imperial.ac.uk/electrical-engineering/',t:'university_news',c:'I',tier:'A',v:'电气电子配图：芯片/电路/信号处理' },
  {n:'Imperial Maths',u:'https://www.imperial.ac.uk/mathematics/',t:'university_news',c:'I',tier:'A',v:'数学系配图：理论物理/统计/计算数学' },
  {n:'Imperial Aeronautics',u:'https://www.imperial.ac.uk/aeronautics/',t:'university_news',c:'I',tier:'B',v:'航空系配图：飞机设计/风洞/流体力学' },
];

export async function seed() {
  let c=0,s=0;
  for(const x of SRC){
    const e=await prisma.crawlSource.findFirst({where:{name:x.n,url:x.u}});
    if(e){s++;continue;}
    await prisma.crawlSource.create({data:{name:x.n,url:x.u,sourceType:x.t,category:x.c,crawlTier:x.tier,crawlStatus:'active_static',adapterType:'static_html',visualValue:x.v,strategyHint:'',notes:'Imperial College London',enabled:true}});
    c++;
  }
  return {created:c,skipped:s};
}
async function main(){console.log('Seeding IC...');const r=await seed();console.log(`Done: ${r.created} created, ${r.skipped} skipped`);}
const isM=process.argv[1]?.includes('imperialSources');
if(isM)main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
