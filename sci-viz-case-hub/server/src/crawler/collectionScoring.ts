import type { ImageCandidate } from './extractImagesFromPage.js';

export interface CollectionScoreInput {
  image: ImageCandidate;
  pageTitle: string;
  pageUrl: string;
  sourceName?: string;
  sourceType?: string;
  metaDescription?: string;
  bodyText?: string;
}

export interface CollectionScoreResult {
  score: number;
  reasons: string[];
  shouldKeep: boolean;
}

const HIGH_VALUE_HOSTS = [
  'news.mit.edu',
  'news.harvard.edu',
  'www.harvard.edu',
  'harvard.edu',
  'newscenter.lbl.gov',
  'www.mpg.de',
  'www.nature.com',
  'images-assets.nasa.gov',
  'images.nasa.gov',
  'cds.cern.ch',
  'www.asml.com',
  'www.zeiss.com',
  'www.nrel.gov',
  'www.mpie.de',
  'thermocalc.com',
  'www.asminternational.org',
  'www.basf.com',
  'battery-materials.basf.com',
  'www.cas.cn',
  'news.sciencenet.cn',
  'www.tsinghua.edu.cn',
  'news.pku.edu.cn',
  // Yale
  'news.yale.edu',
  'environment.yale.edu',
  'seas.yale.edu',
  'engineering.yale.edu',
  'www.yale.edu',
  'yale.edu',
  // ETH Zurich
  'ethz.ch',
  'www.ethz.ch',
  'ai.ethz.ch',
  'library.ethz.ch',
  'focusterra.ethz.ch',
  // NUS
  'news.nus.edu.sg',
  'nuspress.nus.edu.sg',
  'nus.edu.sg',
  'enterprise.nus.edu.sg',
  'www.cqt.sg',
  'cqt.sg',
  'www.mbi.nus.edu.sg',
  'mbi.nus.edu.sg',
  'csi.nus.edu.sg',
  'ifim.nus.edu.sg',
  // Stanford new
  'www.stanford.edu',
  'stanford.edu',
  'med.stanford.edu',
  'sustainability.stanford.edu',
  'hai.stanford.edu',
  'www6.slac.stanford.edu',
  'slac.stanford.edu',
];

const SCIENCE_KEYWORDS = [
  'research', 'science', 'study', 'discovery', 'experiment', 'laboratory', 'lab',
  'microscopy', 'microscope', 'cell', 'protein', 'neuron', 'quantum', 'material',
  'climate', 'space', 'telescope', 'particle', 'physics', 'chemistry', 'biology',
  'visualization', 'model', 'simulation', 'data', 'device', 'instrument',
  '研究', '科学', '实验', '显微', '细胞', '量子', '材料', '气候', '空间', '模型', '数据',
];

const LOW_VALUE_PATTERNS = [
  'logo', 'icon', 'avatar', 'profile', 'headshot', 'author',
  'banner', 'ad-', 'advert', 'social', 'share', 'facebook', 'twitter',
  'linkedin', 'instagram', 'youtube', 'placeholder', 'tracking',
];

const CEREMONY_PATTERNS = [
  '捐赠', '签约', '授予', '仪式', '典礼', '奖学金', '颁奖',
  '合影', '校企合作毕业设计', '校友会成立',
  'ceremony', 'donation', 'signing ceremony', 'award ceremony',
];

const VISUAL_VALUE_PATTERNS = [
  'figure', 'figcaption', 'microscopy', 'microscope', 'visualization',
  'render', 'model', 'diagram', 'illustration', 'cover', 'experiment',
  'instrument', 'device', 'sample', 'telescope', 'detector', 'lab',
  '显微', '图解', '模型', '机制', '封面', '实验', '设备', '仪器', '样本',
];

const ENTERPRISE_COMMERCIAL_PATTERNS = [
  'case study', 'case studies', 'customer story', 'customer stories', 'success story',
  'solution', 'solutions', 'industry', 'industries', 'application', 'applications',
  'use case', 'use cases', 'product', 'products', 'demo', 'white paper', 'whitepaper',
  'performance', 'efficiency', 'outcome', 'impact', 'customer', 'market',
  '案例', '客户', '解决方案', '行业', '应用', '产品', '演示', '白皮书', '性能', '效率', '成果',
];

function add(points: number, reason: string, state: { score: number; reasons: string[] }) {
  state.score += points;
  state.reasons.push(`${points > 0 ? '+' : ''}${points} ${reason}`);
}

function containsAny(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some(pattern => lower.includes(pattern.toLowerCase()));
}

export function scoreImageCandidate(input: CollectionScoreInput): CollectionScoreResult {
  const { image } = input;
  const state = { score: 40, reasons: ['+40 base candidate'] };
  const isEnterpriseSource = Boolean(input.sourceType?.includes('enterprise'));
  const joinedText = [
    image.src,
    image.alt,
    image.contextText,
    input.pageTitle,
    input.metaDescription,
    input.sourceName,
    input.sourceType,
  ].filter(Boolean).join(' ');

  let hostname = '';
  try {
    hostname = new URL(input.pageUrl).hostname;
  } catch {
    hostname = '';
  }

  if (HIGH_VALUE_HOSTS.includes(hostname)) {
    add(15, `trusted source ${hostname}`, state);
  }

  if (image.width !== null && image.height !== null) {
    const area = image.width * image.height;
    if (image.width >= 1000 || image.height >= 800 || area >= 800000) {
      add(12, 'large image dimensions', state);
    } else if (image.width < 400 || image.height < 300) {
      add(-20, 'small image dimensions', state);
    }
  } else if (image.sizeUnknown) {
    add(-3, 'unknown image dimensions', state);
  }

  if (image.contextText.length >= 30) {
    add(15, 'has useful nearby context/caption', state);
  } else if (!image.contextText.trim()) {
    add(-15, 'missing nearby context', state);
  }

  if (image.alt && image.alt.length >= 12) {
    add(8, 'has descriptive alt text', state);
  }

  if (containsAny(joinedText, VISUAL_VALUE_PATTERNS)) {
    add(15, 'matches scientific visual value keywords', state);
  }

  if (isEnterpriseSource && containsAny(joinedText, ENTERPRISE_COMMERCIAL_PATTERNS)) {
    add(15, 'matches enterprise commercial translation keywords', state);
  }

  if (isEnterpriseSource && containsAny(input.pageUrl, [
    'case-stud', 'customer-stor', 'success-stor', 'solutions', 'industries',
    'applications', 'use-cases', 'products', 'technology', 'innovation',
  ])) {
    add(12, 'enterprise commercial page path', state);
  }

  if (containsAny([input.pageTitle, input.metaDescription, input.bodyText?.slice(0, 500)].filter(Boolean).join(' '), SCIENCE_KEYWORDS)) {
    add(8, 'page has research/science context', state);
  }

  if (containsAny(joinedText, LOW_VALUE_PATTERNS)) {
    add(-35, 'matches low-value image pattern', state);
  }

  if (containsAny([input.pageTitle, input.bodyText?.slice(0, 500)].filter(Boolean).join(' '), CEREMONY_PATTERNS)) {
    add(-12, 'page describes ceremony/ritual/donation activity', state);
  }

  const score = Math.max(0, Math.min(100, state.score));
  return {
    score,
    reasons: state.reasons,
    shouldKeep: score >= 35,
  };
}

/**
 * Survey-mode ranking. This measures how much descriptive metadata is
 * available for human review; it never decides whether an image is collected.
 */
export function scoreSurveyImage(input: CollectionScoreInput): CollectionScoreResult {
  const { image } = input;
  const state = { score: 50, reasons: ['+50 survey candidate'] };
  if (image.width !== null && image.height !== null) {
    const area = image.width * image.height;
    add(area >= 800_000 ? 20 : 10, area >= 800_000 ? 'large dimensions' : 'known dimensions', state);
  }
  if (image.contextText.trim().length >= 30) add(15, 'has nearby text/caption', state);
  if (image.alt?.trim().length >= 12) add(10, 'has descriptive alt text', state);
  if (input.metaDescription?.trim()) add(5, 'page has description', state);
  const score = Math.max(0, Math.min(100, state.score));
  return { score, reasons: state.reasons, shouldKeep: true };
}
