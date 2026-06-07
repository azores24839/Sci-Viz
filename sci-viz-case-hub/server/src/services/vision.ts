import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getVisionConfig, getVisionHeaders } from './visionConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ORIGINALS_DIR = path.join(__dirname, '..', '..', 'uploads', 'originals');
const REPO_ROOT = path.join(__dirname, '..', '..', '..');

export interface VisionAnalysisResult {
  media_type: string;
  content_type: string;
  discipline: string;
  technical_method: string;
  composition: string;
  color_tone: string;
  use_case: string[];
  functional_purpose: string;
  distribution_medium: string;
  ai_summary: string;
  case_title: string;
  borrowable_points: string[];
  risk_notes: string[];
  confidence: number;
}

const SYSTEM_PROMPT = `你是一个科研视觉分析专家。仔细观察图片内容，输出结构化JSON分类结果。

关键规则：
1. 先看图片，写ai_summary描述你看到的视觉内容（20-50字）
2. 再结合\"网页标题\"和\"来源\"推断学科和内容类型
3. 从固定选项中为每个字段选最匹配的一项，不可自创选项
4. 不确定的字段填\"不确定\"，但必须有合理依据才能确定

学科推断提示（网页标题关键词→学科）：
- quantum/physics/particle/astrophysics/planet/galaxy/telescope/star → 物理
- cell/neuron/protein/DNA/gene/bacteria/virus/microbe/brain → 生命科学
- material/crystal/polymer/atom/nanoparticle/composite → 材料
- robot/AI/algorithm/computing/semiconductor/chip/data → 信息科学
- climate/atmosphere/ocean/ecosystem/pollution → 环境科学
- chemistry/molecule/catalyst/reaction → 化学
- surgery/tumor/cancer/patient/clinical/medical → 医学
- engineering/device/machine/turbine/structural → 工程
- 无明确学科线索 → 综合交叉

内容类型推断：
- 单个科研人员真实照片/单人半身或头像 → 单人肖像
- 多位科研人员合影/团队人物照 → 群体肖像
- 绘画、插画、素描、水彩等非真实拍摄的人物肖像 → 绘画肖像
- 主体是机器/仪器 → 实验设备  
- 天体/星空/行星 → 空间环境
- 微观结构/细胞 → 微观样本
- 图表/流程 → 机制模型 或 数据结果
- 实验室场景多人 → 团队场景

输出JSON（仅JSON，不含其他文字）：
{
  "media_type": "从 [摄影, 手绘图, 3D渲染, 信息图, 显微图, 数据可视化, 混合媒介, 不确定] 选一项",
  "content_type": "从 [单人肖像, 群体肖像, 绘画肖像, 实验设备, 实验过程, 微观样本, 机制模型, 数据结果, 空间环境, 团队场景, 科普传播, 不确定] 选一项",
  "discipline": "从 [生命科学, 材料, 医学, 工程, 物理, 化学, 信息科学, 环境科学, 综合交叉, 不确定] 选一项",
  "technical_method": "从 [拍摄, 成像, 绘设, 数据, 渲染, 生成] 选一项",
  "composition": "从 [中心式, 对称式, 引导线, 特写局部, 多元素并列, 开放式, 不确定] 选一项",
  "color_tone": "从 [冷调, 暖调, 中性, 低饱和, 高饱和, 黑白, 单色系, 不确定] 选一项",
  "functional_purpose": "从 [记录, 解释, 数据, 展示, 传播, 交互] 选一项",
  "distribution_medium": "从 [静图, 动图, 视频, 图组, 交互, 实体] 选一项",
  "use_case": "从 [官网宣传, 论文配图, 期刊封面, 项目申报, 招生宣传, 科普传播, 展览, 教学材料] 选适用的",
  "ai_summary": "一句话描述这张图的视觉内容",
  "case_title": "10字内精炼标题",
  "borrowable_points": [],
  "risk_notes": [],
  "confidence": 0.0
}

三轴分类规则（这是最重要的分类体系，三个维度相互独立）：

轴一：功能用途——这张影像是用来干什么的？
- 记录：保存真实对象、事件、人物或过程（实验现场、设备外观、人物肖像、会议照片）
- 解释：说明复杂机制、结构、流程和原理（工作原理图、系统架构图、流程步骤图）
- 数据：呈现研究结果、模型和变化趋势（性能对比图、统计图表、趋势曲线）
- 展示：呈现成果、产品、空间或项目形象（产品照片、成果外观、空间展示、项目主视觉）
- 传播：面向公众、品牌和科普传播（Nature封面、科普信息图、新闻配图、招生海报）
- 交互：支持用户操作、浏览、筛选和决策（数据仪表盘、可交互地图、可旋转3D模型）
判断要点：
- Nature封面图的主功能是传播，不是展示
- 产品实拍如果强调"看我们做出了什么"→展示，如果只是存档→记录
- 原理解释图即使包含数据元素，主功能仍是解释
- 可交互的界面截图→传播（因为截图本身不能交互），真正的交互页面→交互

轴二：传播媒介——这张影像以什么形式存在？
- 静图：单张静态图像（照片、插图、图表、渲染图）
- 动图：带有简单运动或循环效果的图像（GIF、循环动效）
- 视频：连续影像内容（实验视频、讲解视频、动画）
- 图组：多张图像有逻辑地组合在一起（论文多子图、步骤对比图、信息图长图）
- 交互：可被用户操作和探索的视觉界面（仪表盘、可缩放地图、交互可视化）
- 实体：转化到现实空间中的视觉媒介（海报、展板、印刷物）
判断要点：
- 看形式而不是内容——一张照片内容再丰富，媒介维度仍是静图
- 论文中包含(a)(b)(c)(d)多子图的Figure→图组
- 信息图如果由多组件组合→图组

轴三：技术手段——这张影像是怎么生产出来的？
- 拍摄：通过相机、摄像机等获取现实影像
- 成像：通过专业设备获取不可见或微观影像（显微镜、CT/MRI、遥感、热成像）
- 绘设：通过人工绘制和视觉设计方法生成（插画、图标、流程图、排版）
- 数据：通过数据处理与可视化生成（图表、数据地图、网络图）
- 渲染：通过三维建模、仿真和工程软件生成（3D产品渲染、3D机制图、仿真场景）
- 生成：通过AI或算法生成、增强或转化
判断要点：
- 看核心生产方式——照片经过后期PS仍是拍摄，3D渲染后排版仍是渲染

confidence说明：
- 0.9+：非常确定，图片清晰、类别明确、与网页标题高度一致
- 0.7-0.89：比较确定，图片较清晰，有一两点不确定但总体把握大
- 0.4-0.69：不太确定，图片模糊或难以归类，部分字段猜的
- 0-0.39：基本不确定，图片极度模糊或多字段不确定`;

function getMimeType(imagePath: string): string {
  const ext = imagePath.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'svg': return 'image/svg+xml';
    case 'bmp': return 'image/bmp';
    case 'tiff':
    case 'tif': return 'image/tiff';
    default: return 'image/jpeg';
  }
}

async function imagePathToBase64(imagePath: string): Promise<string> {
  const mime = getMimeType(imagePath);

  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    try {
      const res = await fetch(imagePath);
      if (!res.ok) return '';
      const buffer = Buffer.from(await res.arrayBuffer());
      return `data:${mime};base64,${buffer.toString('base64')}`;
    } catch {
      return '';
    }
  }

  if (imagePath.startsWith('/journal_covers/')) {
    const filePath = path.join(REPO_ROOT, '..', imagePath);
    try {
      const buffer = await fs.readFile(filePath);
      return `data:${mime};base64,${buffer.toString('base64')}`;
    } catch {
      console.warn('[Vision] Cannot read journal cover:', filePath);
      return '';
    }
  }

  const filename = imagePath.replace('/uploads/originals/', '');
  const filePath = path.join(ORIGINALS_DIR, filename);
  try {
    const buffer = await fs.readFile(filePath);
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    console.warn('[Vision] Cannot read image file:', filePath);
    return '';
  }
}

export async function analyzeImage(params: {
  imagePath: string;
  ocrText: string;
  pageTitle: string;
  sourceUrl: string;
  contextText: string;
}): Promise<VisionAnalysisResult> {
  const { url: apiUrl, key: apiKey, model, provider } = getVisionConfig();
  const isPlaceholder = !apiUrl || !apiKey
    || apiKey.includes('your-');
  if (isPlaceholder) {
    console.warn('[Vision] API not configured, returning mock analysis');
    return mockResult('等待AI分析');
  }

  try {
    const base64 = await imagePathToBase64(params.imagePath);
    if (!base64) {
      return mockResult('无法读取图片文件');
    }

    const userMessage = [
      `请分析这张科研图片。`,
      params.ocrText ? `\n图中文字: ${params.ocrText}` : '',
      params.pageTitle ? `\n网页标题: ${params.pageTitle}` : '',
      params.contextText ? `\n上下文: ${params.contextText}` : '',
      params.sourceUrl ? `\n来源: ${params.sourceUrl}` : '',
    ].filter(Boolean).join('\n');

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: getVisionHeaders(apiKey),
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: userMessage },
              { type: 'image_url', image_url: { url: base64 } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`${provider} API ${response.status}: ${errText}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content?: string | null; reasoning?: string } }>;
    };
    const msg = data.choices?.[0]?.message;
    let content = msg?.content || msg?.reasoning || '';
    if (!content) {
      throw new Error(`Empty response from ${provider}`);
    }

    // Extract JSON from the response (handle possible markdown code fences)
    const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(jsonStr) as VisionAnalysisResult;

    const rawResult: VisionAnalysisResult = {
      media_type: result.media_type || '不确定',
      content_type: result.content_type || '不确定',
      discipline: result.discipline || '不确定',
      technical_method: result.technical_method || '不确定',
      composition: result.composition || '不确定',
      color_tone: result.color_tone || '不确定',
      functional_purpose: result.functional_purpose || '',
      distribution_medium: result.distribution_medium || '',
      use_case: result.use_case || [],
      ai_summary: result.ai_summary || '',
      case_title: result.case_title || '',
      borrowable_points: result.borrowable_points || [],
      risk_notes: result.risk_notes || [],
      confidence: typeof result.confidence === 'number' ? result.confidence : 0.0,
    };
    return sanitizeResult(rawResult);
  } catch (error) {
    console.error('[Vision] Error:', error);
    return mockResult('AI分析失败');
  }
}

function sanitizeResult(result: VisionAnalysisResult): VisionAnalysisResult {
  const mediaTypes = ['摄影', '手绘图', '3D渲染', '信息图', '显微图', '数据可视化', '期刊封面', '混合媒介', '不确定'];
  const contentTypes = ['单人肖像', '群体肖像', '绘画肖像', '实验设备', '实验过程', '微观样本', '机制模型', '数据结果', '空间环境', '团队场景', '科普传播', '不确定'];
  const disciplines = ['生命科学', '材料', '医学', '工程', '物理', '化学', '信息科学', '环境科学', '综合交叉', '不确定'];
  const technicalMethods = ['拍摄', '成像', '绘设', '数据', '渲染', '生成'];

  const normalize = (value: string, valid: string[]): string => {
    const trimmed = (value || '').trim();
    if (valid.includes(trimmed)) return trimmed;
    if (valid.includes('单人肖像') && /^(科研人员|研究人员|科学家|人物|人物肖像)$/.test(trimmed)) return '单人肖像';
    if (valid.includes('群体肖像') && /^(团队|团队场景|团队合影|多人肖像|群体人物)$/.test(trimmed)) return '群体肖像';
    if (valid.includes('绘画肖像') && /^(手绘人物|人物插画|肖像插画|插画肖像|绘画人物)$/.test(trimmed)) return '绘画肖像';
    const partial = valid.find(v => trimmed.includes(v) || v.includes(trimmed));
    if (partial && trimmed.length >= 2) return partial;
    return '不确定';
  };

  result.media_type = normalize(result.media_type, mediaTypes);
  result.content_type = normalize(result.content_type, contentTypes);
  result.discipline = normalize(result.discipline, disciplines);
  result.technical_method = normalize(result.technical_method, technicalMethods);

  const functionalPurposes = ['记录', '解释', '数据', '展示', '传播', '交互'];
  const distributionMediums = ['静图', '动图', '视频', '图组', '交互', '实体'];
  if (!functionalPurposes.includes((result.functional_purpose || '').trim())) {
    result.functional_purpose = '';
  }
  if (!distributionMediums.includes((result.distribution_medium || '').trim())) {
    result.distribution_medium = '';
  }

  if (result.media_type === '不确定' && result.content_type === '不确定' && result.discipline === '不确定') {
    result.confidence = Math.min(result.confidence || 0, 0.3);
  }

  const placeholderPatterns = [
    /^可借鉴点\d*$/, /^借鉴点\d*$/, /^参考点\d*$/,
    /^优化点\d*$/, /^设计点\d*$/, /^关键点\d*$/,
    /^版权风险$/, /^科学准确性不明$/, /^过度修饰风险$/,
    /^风险点\d*$/, /^潜在问题\d*$/,
    /^版权$/i, /^风险$/i,
  ];

  const isPlaceholder = (text: unknown): boolean => {
    if (typeof text !== 'string') return true;
    const trimmed = text.trim();
    if (trimmed.length === 0) return true;
    if (trimmed.length <= 2 && /^[\d、.]*$/.test(trimmed)) return true;
    return placeholderPatterns.some(p => p.test(trimmed));
  };

  const rawBorrow = Array.isArray(result.borrowable_points) ? result.borrowable_points : [];
  const rawRisk = Array.isArray(result.risk_notes) ? result.risk_notes : [];

  const cleanedBorrow = rawBorrow.filter(p => !isPlaceholder(p));
  const cleanedRisk = rawRisk.filter(r => !isPlaceholder(r));

  const borrowedAllPlaceholder = rawBorrow.length > 0 && cleanedBorrow.length === 0;
  const riskAllPlaceholder = rawRisk.length > 0 && cleanedRisk.length === 0;

  let confidence = result.confidence;
  if (borrowedAllPlaceholder || riskAllPlaceholder) {
    confidence = Math.min(confidence, 0.45);
  }

  return {
    ...result,
    borrowable_points: cleanedBorrow,
    risk_notes: cleanedRisk,
    confidence,
  };
}

function mockResult(summary: string): VisionAnalysisResult {
  return {
    media_type: '不确定',
    content_type: '不确定',
    discipline: '不确定',
    technical_method: '不确定',
    composition: '不确定',
    color_tone: '不确定',
    functional_purpose: '',
    distribution_medium: '',
    use_case: [],
    ai_summary: summary,
    case_title: '',
    borrowable_points: [],
    risk_notes: [],
    confidence: 0.0,
  };
}

const MEDIA_TYPE_SYSTEM = `你是一位视觉媒介分类专家。仔细观察图片的内容和制作方式，判断这张图的视觉媒介类型。

你的任务是从以下选项中选择最匹配的一个。但凡有一点判断依据就不要选"不确定"。

选项：摄影 / 手绘图 / 3D渲染 / 信息图 / 显微图 / 数据可视化 / 混合媒介 / 不确定

判断标准：
- 摄影：真实拍摄的照片（显微镜下拍摄也属于摄影）
- 手绘图：手绘插画、水彩、素描等传统绘画
- 3D渲染：计算机生成的三维渲染图
- 信息图：图表+文字的信息传达
- 显微图：SEM/TEM/共聚焦等仪器生成的微观影像
- 数据可视化：数据图表、热力图
- 混合媒介：多种媒介明显融合
- 不确定：极度模糊，完全无法判断

只输出JSON，不含其他文字：{"media_type":"你的判断"}`;

export async function classifyMediaType(params: {
  imagePath: string;
  ocrText: string;
  pageTitle: string;
  contextText: string;
}): Promise<string> {
  const { url: apiUrl, key: apiKey, model } = getVisionConfig();
  const isPlaceholder = !apiUrl || !apiKey || apiKey.includes('your-');
  if (isPlaceholder) return '不确定';

  const base64 = await imagePathToBase64(params.imagePath);
  if (!base64) return '不确定';

  const userMessage = [
    '请判断这张图的视觉媒介类型。',
    params.ocrText ? `图中文字: ${params.ocrText}` : '',
    params.pageTitle ? `标题: ${params.pageTitle}` : '',
    params.contextText ? `上下文: ${params.contextText}` : '',
  ].filter(Boolean).join('\n');

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: getVisionHeaders(apiKey),
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: MEDIA_TYPE_SYSTEM },
          {
            role: 'user',
            content: [
              { type: 'text', text: userMessage },
              { type: 'image_url', image_url: { url: base64 } },
            ],
          },
        ],
        temperature: 0.3,
        max_tokens: 80,
      }),
    });

    if (!response.ok) {
      throw new Error(`API ${response.status}`);
    }
    const data = await response.json() as {
      choices: Array<{ message: { content?: string | null } }>;
    };
    const content = data.choices?.[0]?.message?.content || '';
    const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(jsonStr) as { media_type?: string };
    return result.media_type || '不确定';
  } catch {
    return '不确定';
  }
}
