import { prisma } from '../prisma.js';

const SOURCES = [
  { n:'Cambridge Research News', u:'https://www.cam.ac.uk/research/news', t:'university_news', c:'C', tier:'A', v:'科研新闻配图、实验室照片、研究数据可视化、科学示意图' },
  { n:'Cambridge Physics', u:'https://www.phy.cam.ac.uk', t:'university_news', c:'C', tier:'A', v:'天体物理图像、量子实验照片、凝聚态模拟图、纳米科学配图' },
  { n:'Cambridge Chemistry', u:'https://www.ch.cam.ac.uk', t:'university_news', c:'C', tier:'A', v:'分子结构图、纳米材料照片、光谱图像、电池研究配图' },
  { n:'Cambridge Engineering', u:'https://www.eng.cam.ac.uk', t:'university_news', c:'C', tier:'A', v:'机器人照片、AI成像示意图、工程设计图、实验设备' },
  { n:'Cambridge Zoology', u:'https://www.zoo.cam.ac.uk', t:'university_news', c:'C', tier:'A', v:'动物生态照片、显微图像、进化树、野外研究场景' },
  { n:'Cambridge Earth Sciences', u:'https://www.esc.cam.ac.uk', t:'university_news', c:'C', tier:'A', v:'地质构造图、火山喷发照片、气候模型可视化、化石图像' },
  { n:'Cambridge Computer Science', u:'https://www.cst.cam.ac.uk', t:'university_news', c:'C', tier:'A', v:'AI研究配图、芯片设计图、计算机视觉输出、机器人系统图' },
  { n:'Cambridge Materials', u:'https://www.msm.cam.ac.uk', t:'university_news', c:'C', tier:'A', v:'电子显微镜图像、材料显微结构、电池材料图、半导体器件' },
  { n:'Cambridge Plant Sciences', u:'https://www.plantsci.cam.ac.uk', t:'university_news', c:'C', tier:'A', v:'植物显微图像、生态野外照片、作物研究配图、基因表达图' },
  { n:'Cambridge Maths', u:'https://www.maths.cam.ac.uk', t:'university_news', c:'C', tier:'B', v:'数学可视化、物理模拟图、统计图表' },
  { n:'Cambridge Museums', u:'https://www.museums.cam.ac.uk', t:'museum_portal', c:'C', tier:'B', v:'博物馆藏品照片、展览宣传图、博物馆建筑和历史影像' },
  { n:'Cambridge Botanic Garden', u:'https://www.botanic.cam.ac.uk', t:'museum_portal', c:'C', tier:'B', v:'植物特写照片、花园景观、植物科学插图' },
];

export async function seedCambridgeSources(): Promise<{created:number;skipped:number}> {
  let created=0, skipped=0;
  for (const s of SOURCES) {
    const ex = await prisma.crawlSource.findFirst({where:{name:s.n,url:s.u}});
    if(ex){skipped++;continue;}
    await prisma.crawlSource.create({data:{name:s.n,url:s.u,sourceType:s.t,category:s.c,crawlTier:s.tier,crawlStatus:'active_static',adapterType:'static_html',visualValue:s.v,strategyHint:'',notes:'University of Cambridge',enabled:true}});
    created++;
  }
  return {created,skipped};
}

async function main() {
  console.log('Seeding Cambridge sources...');
  const r = await seedCambridgeSources();
  console.log(`Done. Created: ${r.created}, Skipped: ${r.skipped}`);
}
const isMain = process.argv[1]?.endsWith('cambridgeSources.ts')||process.argv[1]?.endsWith('cambridgeSources.js');
if(isMain){main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});}
