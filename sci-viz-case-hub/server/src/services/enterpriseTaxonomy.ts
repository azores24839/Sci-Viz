import type { Prisma } from '@prisma/client';

export type EnterprisePageType =
  | 'technical_blog'
  | 'customer_story'
  | 'product_page'
  | 'solution_page'
  | 'newsroom'
  | 'industry_media'
  | 'brand_product'
  | 'research_blog'
  | 'unknown';

export type EnterpriseTaxonomy = {
  companyName: string;
  sourcePageType: EnterprisePageType;
  companyKey: string;
};

type SourceLike = {
  name?: string | null;
  url?: string | null;
  sourceType?: string | null;
  category?: string | null;
  notes?: string | null;
};

type CaseLike = {
  sourceDomain?: string | null;
  sourceUrl?: string | null;
  userHint?: string | null;
  pageTitle?: string | null;
  caseTitle?: string | null;
  contextText?: string | null;
};

type CompanyRule = {
  companyName: string;
  companyKey: string;
  patterns: RegExp[];
};

const COMPANY_RULES: CompanyRule[] = [
  { companyName: 'Boston Scientific', companyKey: 'boston-scientific', patterns: [/boston\s+scientific/i, /bostonscientific\.com/i] },
  { companyName: 'Boston Dynamics', companyKey: 'boston-dynamics', patterns: [/boston\s+dynamics/i, /bostondynamics\.com/i] },
  { companyName: 'Siemens Healthineers', companyKey: 'siemens-healthineers', patterns: [/siemens\s+healthineers/i, /siemens-healthineers\.com/i] },
  { companyName: 'Siemens Energy', companyKey: 'siemens-energy', patterns: [/siemens\s+energy/i, /siemens-energy\.com/i] },
  { companyName: 'Schneider Electric', companyKey: 'schneider-electric', patterns: [/schneider\s+electric/i, /\bse\.com/i] },
  { companyName: 'Kongsberg Maritime', companyKey: 'kongsberg-maritime', patterns: [/kongsberg\s+maritime/i, /kongsbergmaritime\.com/i, /kongsberg\.com\/maritime/i] },
  { companyName: 'Rolls-Royce', companyKey: 'rolls-royce', patterns: [/rolls-royce/i] },
  { companyName: 'Caterpillar', companyKey: 'caterpillar', patterns: [/caterpillar/i, /\bcat\.com/i] },
  { companyName: 'NVIDIA', companyKey: 'nvidia', patterns: [/nvidia/i] },
  { companyName: 'Microsoft', companyKey: 'microsoft', patterns: [/microsoft/i, /azure\.microsoft\.com/i, /aiotlabs\.microsoft\.com/i, /news\.xbox\.com/i] },
  { companyName: 'Google', companyKey: 'google', patterns: [/google/i, /research\.google/i] },
  { companyName: 'Huawei', companyKey: 'huawei', patterns: [/huawei/i] },
  { companyName: 'Qualcomm', companyKey: 'qualcomm', patterns: [/qualcomm/i] },
  { companyName: 'ABB', companyKey: 'abb', patterns: [/\babb\b/i, /new\.abb\.com/i] },
  { companyName: 'Eaton', companyKey: 'eaton', patterns: [/eaton/i] },
  { companyName: 'FANUC', companyKey: 'fanuc', patterns: [/fanuc/i] },
  { companyName: 'ASML', companyKey: 'asml', patterns: [/asml/i] },
  { companyName: 'TSMC', companyKey: 'tsmc', patterns: [/tsmc/i] },
  { companyName: 'Arm', companyKey: 'arm', patterns: [/\barm\b/i, /newsroom\.arm\.com/i] },
  { companyName: 'BASF', companyKey: 'basf', patterns: [/basf/i] },
  { companyName: 'Corning', companyKey: 'corning', patterns: [/corning/i] },
  { companyName: 'Dow', companyKey: 'dow', patterns: [/\bdow\b/i, /corporate\.dow\.com/i] },
  { companyName: 'Xylem', companyKey: 'xylem', patterns: [/xylem/i] },
  { companyName: 'Veolia', companyKey: 'veolia', patterns: [/veolia/i] },
  { companyName: 'Orsted', companyKey: 'orsted', patterns: [/orsted/i] },
  { companyName: 'GE HealthCare', companyKey: 'ge-healthcare', patterns: [/ge\s+healthcare/i, /gehealthcare\.com/i] },
  { companyName: 'Airbus', companyKey: 'airbus', patterns: [/airbus/i] },
  { companyName: 'Boeing', companyKey: 'boeing', patterns: [/boeing/i] },
  { companyName: 'ZEISS', companyKey: 'zeiss', patterns: [/zeiss|蔡司/i] },
  { companyName: 'Sony', companyKey: 'sony', patterns: [/sony/i] },
  { companyName: 'Apple', companyKey: 'apple', patterns: [/apple/i] },
  { companyName: 'Tesla', companyKey: 'tesla', patterns: [/tesla/i] },
  { companyName: 'SpaceX', companyKey: 'spacex', patterns: [/spacex|starlink/i] },
  { companyName: 'Unitree', companyKey: 'unitree', patterns: [/unitree/i] },
  { companyName: 'Xiaomi', companyKey: 'xiaomi', patterns: [/xiaomi|\bmi\.com/i] },
  { companyName: 'Samsung', companyKey: 'samsung', patterns: [/samsung/i] },
  { companyName: 'DJI', companyKey: 'dji', patterns: [/\bdji\b/i] },
  { companyName: 'BYD', companyKey: 'byd', patterns: [/\bbyd\b/i] },
  { companyName: 'NIO', companyKey: 'nio', patterns: [/\bnio\b/i] },
  { companyName: 'XPeng', companyKey: 'xpeng', patterns: [/xpeng/i] },
  { companyName: 'Rivian', companyKey: 'rivian', patterns: [/rivian/i] },
  { companyName: 'Meta', companyKey: 'meta', patterns: [/\bmeta\b|ray-ban/i] },
  { companyName: 'Garmin', companyKey: 'garmin', patterns: [/garmin/i] },
  { companyName: 'Oura', companyKey: 'oura', patterns: [/oura/i] },
  { companyName: 'Whoop', companyKey: 'whoop', patterns: [/whoop/i] },
  { companyName: 'Dyson', companyKey: 'dyson', patterns: [/dyson/i] },
  { companyName: 'Roborock', companyKey: 'roborock', patterns: [/roborock/i] },
  { companyName: 'Ecovacs', companyKey: 'ecovacs', patterns: [/ecovacs/i] },
  { companyName: 'Dreame', companyKey: 'dreame', patterns: [/dreame/i] },
  { companyName: 'Agility Robotics', companyKey: 'agility-robotics', patterns: [/agility\s+robotics/i] },
  { companyName: 'Figure AI', companyKey: 'figure-ai', patterns: [/figure\s+ai/i] },
];

const INDUSTRY_MEDIA_RULES: CompanyRule[] = [
  { companyName: 'ZEISS', companyKey: 'zeiss', patterns: [/physics\s+world.*zeiss|optics.*zeiss|spie.*zeiss|laser\s+focus.*zeiss/i] },
  { companyName: 'Xylem', companyKey: 'xylem', patterns: [/waterworld|water\s+tech|water\s+online|wef\s+water/i] },
  { companyName: 'ASML', companyKey: 'asml', patterns: [/semiconductor\s+engineering|semiengineering/i] },
  { companyName: 'Boston Scientific', companyKey: 'boston-scientific', patterns: [/medical\s+design\s+outsourcing/i] },
];

function normalizeText(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function inferFromText(text: string): CompanyRule | null {
  const industryMatch = INDUSTRY_MEDIA_RULES.find(rule => rule.patterns.some(pattern => pattern.test(text)));
  if (industryMatch) return industryMatch;
  return COMPANY_RULES.find(rule => rule.patterns.some(pattern => pattern.test(text))) || null;
}

function companyFromRawName(name: string): string {
  return name
    .replace(/\s*\/\s*enterprise.*$/i, '')
    .replace(/\s+(Technical Blog|Customer Stories|Data Center Solutions|Autonomous Machines|Healthcare Solutions|Robotics|AI Customer Stories|AI Co-Innovation Labs|Azure Blog|Industry Stories|Xbox News|Newsroom|News|Products|Solutions|Applications|Stories|Innovation|Commercial Aircraft|Helicopters|Defence and Space|Medical Technology|Microscopy Solutions|Semiconductor Manufacturing).*$/i, '')
    .trim();
}

export function isEnterpriseSource(source: SourceLike): boolean {
  return source.category === 'ENT' || String(source.sourceType || '').startsWith('enterprise');
}

export function inferEnterpriseCompany(input: SourceLike | CaseLike): { companyName: string; companyKey: string } | null {
  const text = normalizeText([
    'name' in input ? input.name : undefined,
    'url' in input ? input.url : undefined,
    'notes' in input ? input.notes : undefined,
    'sourceDomain' in input ? input.sourceDomain : undefined,
    'sourceUrl' in input ? input.sourceUrl : undefined,
    'userHint' in input ? input.userHint : undefined,
    'pageTitle' in input ? input.pageTitle : undefined,
    'caseTitle' in input ? input.caseTitle : undefined,
    'contextText' in input ? input.contextText : undefined,
  ]);

  const matched = inferFromText(text);
  if (matched) return { companyName: matched.companyName, companyKey: matched.companyKey };

  if ('userHint' in input && input.userHint) {
    const raw = companyFromRawName(input.userHint);
    if (raw) return { companyName: raw, companyKey: raw.toLowerCase().replace(/[^a-z0-9]+/g, '-') };
  }
  if ('name' in input && input.name) {
    const raw = companyFromRawName(input.name);
    if (raw) return { companyName: raw, companyKey: raw.toLowerCase().replace(/[^a-z0-9]+/g, '-') };
  }
  return null;
}

export function inferEnterprisePageType(input: SourceLike | CaseLike): EnterprisePageType {
  const text = normalizeText([
    'name' in input ? input.name : undefined,
    'url' in input ? input.url : undefined,
    'notes' in input ? input.notes : undefined,
    'sourceDomain' in input ? input.sourceDomain : undefined,
    'sourceUrl' in input ? input.sourceUrl : undefined,
    'userHint' in input ? input.userHint : undefined,
    'pageTitle' in input ? input.pageTitle : undefined,
    'caseTitle' in input ? input.caseTitle : undefined,
    'contextText' in input ? input.contextText : undefined,
  ]);

  if (/industry\s+media|third-party|第三方|physics\s+world|optics\.org|spie|waterworld|semiconductor\s+engineering|medical\s+design/i.test(text)) return 'industry_media';
  if (/research\s+blog|research\.google|microsoft\s+research/i.test(text)) return 'research_blog';
  if (/technical\s+blog|azure\s+blog|developer\.|technology|deep\s+dives|技术博客|technical_explanation/i.test(text)) return 'technical_blog';
  if (/customer\s+stor(y|ies)|case-stud(y|ies)|success\s+stor(y|ies)|co-innovation|客户|案例|success_story|case_study/i.test(text)) return 'customer_story';
  if (/solutions?|industr(y|ies)|applications?|markets?|行业|解决方案|solution_page/i.test(text)) return 'solution_page';
  if (/products?|product-list|medical-imaging|computed-tomography|magnetic-resonance|ultrasound|产品|product_page/i.test(text)) return 'product_page';
  if (/iphone|watch|pixel|phone|quest|ray-ban|model\s+y|cybertruck|optimus|g1|go2|global|electronics|mobile|ring|vacuum|产品视觉参照/i.test(text)) return 'brand_product';
  if (/newsroom|press|news|blog|新闻|press-releases/i.test(text)) return 'newsroom';
  return 'unknown';
}

export function classifyEnterpriseSource(source: SourceLike): EnterpriseTaxonomy | null {
  if (!isEnterpriseSource(source)) return null;
  const company = inferEnterpriseCompany(source);
  if (!company) return null;
  return {
    ...company,
    sourcePageType: inferEnterprisePageType(source),
  };
}

export function classifyEnterpriseCase(c: CaseLike): EnterpriseTaxonomy | null {
  const text = normalizeText([
    c.sourceDomain,
    c.sourceUrl,
    c.userHint,
    c.pageTitle,
    c.caseTitle,
    c.contextText,
  ]);
  const matched = inferFromText(text);
  if (!matched) return null;
  const company = { companyName: matched.companyName, companyKey: matched.companyKey };
  return {
    ...company,
    sourcePageType: inferEnterprisePageType(c),
  };
}

export function makeEnterpriseCompanyWhere(companyNames: string[]): Prisma.VisualCaseWhereInput | null {
  const rules = companyNames
    .map(name => {
      const normalized = name.trim();
      return COMPANY_RULES.find(rule => rule.companyName.toLowerCase() === normalized.toLowerCase())
        || INDUSTRY_MEDIA_RULES.find(rule => rule.companyName.toLowerCase() === normalized.toLowerCase())
        || null;
    })
    .filter((rule): rule is CompanyRule => Boolean(rule));

  if (rules.length === 0) return null;

  const clauses: Prisma.VisualCaseWhereInput[] = [];
  for (const rule of rules) {
    clauses.push({ userHint: { contains: rule.companyName } });
    clauses.push({ caseTitle: { contains: rule.companyName } });
    clauses.push({ pageTitle: { contains: rule.companyName } });
    for (const pattern of rule.patterns) {
      const raw = pattern.source
        .replace(/\\b/g, '')
        .replace(/\\s\+/g, ' ')
        .replace(/\\\./g, '.')
        .replace(/\\-/g, '-')
        .replace(/\(\?:?/g, '')
        .replace(/[()^$+?[\]{}|]/g, ' ')
        .replace(/\.\*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const tokens = raw
        .split(/\s+/)
        .map(token => token.replace(/^www\./, '').trim())
        .filter(token => token.length >= 3 && !['com', 'org', 'net', 'new', 'blog', 'news'].includes(token));
      for (const token of tokens) {
        clauses.push({ userHint: { contains: token } });
        clauses.push({ sourceDomain: { contains: token } });
        clauses.push({ sourceUrl: { contains: token } });
        clauses.push({ caseTitle: { contains: token } });
        clauses.push({ pageTitle: { contains: token } });
      }
    }
  }

  if (clauses.length === 0) return null;
  return clauses.length === 1 ? clauses[0] : { OR: clauses };
}
