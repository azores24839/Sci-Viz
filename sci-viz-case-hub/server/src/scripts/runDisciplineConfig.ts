import { getAllDisciplineConfigs } from '../services/disciplineConfig.js';
import { prisma } from '../prisma.js';

async function main() {
  const configs = await getAllDisciplineConfigs();
  for (const c of configs) {
    const f = c.currentConfig.functional;
    const cs = c.completenessScore;
    console.log(`${c.discipline} | ${c.totalCases} | ${c.imbalanceType} | 功能=${cs.functional} 媒介=${cs.medium} 技术=${cs.technical} 总=${cs.overall}`);
    console.log(`  功能: 记录${f['记录']} 解释${f['解释']} 数据${f['数据']} 展示${f['展示']} 传播${f['传播']} 交互${f['交互']}`);
  }
  await prisma.$disconnect();
  process.exit(0);
}
main();