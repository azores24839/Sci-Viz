import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const seedData = [
  {
    title: '荧光显微镜下的神经元细胞',
    sourceUrl: 'https://example.com/research/neuron-imaging',
    sourceDomain: 'example.com',
    pageTitle: '神经元细胞成像研究 - 2024',
    caseTitle: '荧光标记神经元',
    imageUrl: 'https://picsum.photos/seed/neuron/800/600',
    imagePath: 'https://picsum.photos/seed/neuron/800/600',
    thumbnailPath: 'https://picsum.photos/seed/neuron/300/200',
    contextText: '小鼠海马体神经元，共聚焦显微镜拍摄，40x物镜',
    ocrText: 'Scale bar: 20μm, DAPI, NeuN, GFAP',
    captureType: 'image',
    mediaType: '显微图',
    contentType: '微观样本',
    discipline: '生命科学',
    technicalMethod: '渲染',
    composition: '中心式',
    colorTone: '冷调',
    useCase: JSON.stringify(['论文配图', '期刊封面']),
    aiSummary: '荧光标记的神经元细胞显微图像，展示树突和轴突结构',
    borrowablePoints: JSON.stringify(['荧光色彩搭配清晰', '比例尺标注位置合理', '多通道叠加效果突出']),
    riskNotes: JSON.stringify(['科学准确性需验证']),
    confidence: 0.85,
    reviewStatus: 'approved',
    rating: 4,
    manualNotes: '优秀的神经科学显微成像案例',
  },
  {
    title: 'COVID-19 病毒机制3D渲染图',
    sourceUrl: 'https://example.com/science/covid-mechanism',
    sourceDomain: 'example.com',
    pageTitle: 'SARS-CoV-2 入侵细胞机制图解',
    caseTitle: '新冠病毒3D渲染',
    imageUrl: 'https://picsum.photos/seed/covid/800/600',
    imagePath: 'https://picsum.photos/seed/covid/800/600',
    thumbnailPath: 'https://picsum.photos/seed/covid/300/200',
    contextText: '病毒刺突蛋白与ACE2受体结合示意图',
    ocrText: 'SARS-CoV-2, ACE2 Receptor, TMPRSS2, Cell Entry',
    captureType: 'image',
    mediaType: '3D渲染',
    contentType: '机制模型',
    discipline: '医学',
    technicalMethod: '渲染',
    composition: '多元素并列',
    colorTone: '暖调',
    useCase: JSON.stringify(['论文配图', '科普传播']),
    aiSummary: 'SARS-CoV-2病毒入侵人体细胞的3D渲染示意图',
    borrowablePoints: JSON.stringify(['分子结构渲染细节丰富', '信息层次清晰', '色彩分区明确']),
    riskNotes: JSON.stringify(['过度修饰风险']),
    confidence: 0.92,
    reviewStatus: 'approved',
    rating: 5,
    manualNotes: '顶刊级别的机制图，色彩和构图都值得学习',
  },
  {
    title: '量子计算实验装置摄影',
    sourceUrl: 'https://example.com/tech/quantum-lab',
    sourceDomain: 'example.com',
    pageTitle: '量子计算实验室实拍',
    caseTitle: '量子计算实验装置',
    imageUrl: 'https://picsum.photos/seed/quantum/800/600',
    imagePath: 'https://picsum.photos/seed/quantum/800/600',
    thumbnailPath: 'https://picsum.photos/seed/quantum/300/200',
    contextText: '稀释制冷机与量子处理器芯片',
    ocrText: 'Dilution Refrigerator, Quantum Processor, 10mK',
    captureType: 'image',
    mediaType: '摄影',
    contentType: '实验设备',
    discipline: '物理',
    technicalMethod: '拍摄',
    composition: '引导线',
    colorTone: '冷调',
    useCase: JSON.stringify(['官网宣传', '项目申报']),
    aiSummary: '量子计算实验室设备实拍，展示稀释制冷机和量子芯片',
    borrowablePoints: JSON.stringify(['设备质感表现好', '蓝紫色科技感灯光氛围', '构图引导线明确']),
    riskNotes: JSON.stringify(['版权风险']),
    confidence: 0.78,
    reviewStatus: 'needs_review',
    rating: 3,
    manualNotes: '风格不错，需要确认设备标注是否准确',
  },
];

async function seed() {
  console.log('Seeding database...');

  for (const data of seedData) {
    await prisma.visualCase.create({ data });
  }

  console.log(`Seeded ${seedData.length} test cases`);
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
