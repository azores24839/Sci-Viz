export type SourceOwnerInput = {
  name?: string | null;
  url?: string | null;
  category?: string | null;
  sourceType?: string | null;
};

export type SourceOwnerKind = 'university' | 'company' | 'research_institute' | 'government' | 'publisher_media' | 'platform' | 'other';

export type SourceOwner = {
  ownerName: string;
  ownerKey: string;
  ownerDomain: string;
  ownerKind: SourceOwnerKind;
};

type OwnerRule = {
  ownerName: string;
  ownerKey: string;
  domains: string[];
  namePatterns?: RegExp[];
};

const OWNER_RULES: OwnerRule[] = [
  { ownerName: 'SLAC National Accelerator Laboratory', ownerKey: 'slac', domains: ['slac.stanford.edu', 'slac.gov'] },
  { ownerName: 'MIT', ownerKey: 'mit', domains: ['mit.edu'] },
  { ownerName: 'Harvard University', ownerKey: 'harvard', domains: ['harvard.edu'] },
  { ownerName: 'Stanford University', ownerKey: 'stanford', domains: ['stanford.edu'] },
  { ownerName: 'Yale University', ownerKey: 'yale', domains: ['yale.edu'] },
  { ownerName: 'University of Oxford', ownerKey: 'oxford', domains: ['ox.ac.uk'] },
  { ownerName: 'University of Cambridge', ownerKey: 'cambridge', domains: ['cam.ac.uk'] },
  { ownerName: 'Imperial College London', ownerKey: 'imperial-college-london', domains: ['imperial.ac.uk'] },
  { ownerName: 'ETH Zurich', ownerKey: 'eth-zurich', domains: ['ethz.ch'] },
  { ownerName: 'National University of Singapore', ownerKey: 'nus', domains: ['nus.edu.sg'] },
  { ownerName: 'Carnegie Mellon University', ownerKey: 'cmu', domains: ['cmu.edu'] },
  { ownerName: 'University of Zurich', ownerKey: 'university-of-zurich', domains: ['uzh.ch'] },
  { ownerName: '上海交通大学', ownerKey: 'sjtu', domains: ['sjtu.edu.cn'] },
  { ownerName: '清华大学', ownerKey: 'tsinghua', domains: ['tsinghua.edu.cn'] },
  { ownerName: '北京大学', ownerKey: 'pku', domains: ['pku.edu.cn'] },
  { ownerName: '复旦大学', ownerKey: 'fudan', domains: ['fudan.edu.cn'] },
  { ownerName: '中国科学技术大学', ownerKey: 'ustc', domains: ['ustc.edu.cn'] },
  { ownerName: '浙江大学', ownerKey: 'zju', domains: ['zju.edu.cn'] },
  { ownerName: '哈尔滨工业大学', ownerKey: 'hit', domains: ['hit.edu.cn'] },
  { ownerName: '华中科技大学', ownerKey: 'hust', domains: ['hust.edu.cn'] },
  { ownerName: '北京航空航天大学', ownerKey: 'buaa', domains: ['buaa.edu.cn'] },
  { ownerName: '西安交通大学', ownerKey: 'xjtu', domains: ['xjtu.edu.cn'] },
  { ownerName: '东南大学', ownerKey: 'seu', domains: ['seu.edu.cn'] },
  { ownerName: '北京理工大学', ownerKey: 'bit', domains: ['bit.edu.cn'] },
  { ownerName: '中国科学院', ownerKey: 'cas', domains: ['cas.cn'] },
  { ownerName: 'NASA', ownerKey: 'nasa', domains: ['nasa.gov'] },
  { ownerName: 'NIH', ownerKey: 'nih', domains: ['nih.gov'] },
  { ownerName: 'NOAA', ownerKey: 'noaa', domains: ['noaa.gov'] },
  { ownerName: 'USGS', ownerKey: 'usgs', domains: ['usgs.gov'] },
  { ownerName: 'U.S. Department of Energy', ownerKey: 'us-doe', domains: ['energy.gov'] },
  { ownerName: 'NREL', ownerKey: 'nrel', domains: ['nrel.gov'] },
  { ownerName: 'Lawrence Berkeley National Laboratory', ownerKey: 'berkeley-lab', domains: ['lbl.gov'] },
  { ownerName: 'Max Planck Society', ownerKey: 'max-planck-society', domains: ['mpg.de', 'mpie.de'] },
  { ownerName: 'HHMI Janelia Research Campus', ownerKey: 'hhmi-janelia', domains: ['janelia.org'] },
  { ownerName: 'CERN', ownerKey: 'cern', domains: ['cern.ch'] },
  { ownerName: 'MARIN', ownerKey: 'marin', domains: ['marin.nl'] },
  { ownerName: 'Fraunhofer-Gesellschaft', ownerKey: 'fraunhofer', domains: ['fraunhofer.de'] },
  { ownerName: 'EPRI', ownerKey: 'epri', domains: ['epri.com'] },
  { ownerName: 'DLR', ownerKey: 'dlr', domains: ['dlr.de'] },
  { ownerName: 'JAMSTEC', ownerKey: 'jamstec', domains: ['jamstec.go.jp'] },
  { ownerName: 'Centre for Quantum Technologies', ownerKey: 'cqt', domains: ['cqt.sg'] },
  { ownerName: 'Springer Nature', ownerKey: 'springer-nature', domains: ['nature.com'] },
  { ownerName: 'IEEE', ownerKey: 'ieee', domains: ['ieee.org', 'ieee-pes.org'] },
  { ownerName: 'Science', ownerKey: 'science-aaas', domains: ['science.org'] },
  { ownerName: 'ScienceDaily', ownerKey: 'science-daily', domains: ['sciencedaily.com'] },
  { ownerName: 'Physics World', ownerKey: 'physics-world', domains: ['physicsworld.com'] },
  { ownerName: 'Optics.org', ownerKey: 'optics-org', domains: ['optics.org'] },
  { ownerName: 'Semiconductor Engineering', ownerKey: 'semiconductor-engineering', domains: ['semiengineering.com'] },
  { ownerName: 'Medical Design & Outsourcing', ownerKey: 'medical-design-outsourcing', domains: ['medicaldesignandoutsourcing.com'] },
  { ownerName: 'WaterWorld', ownerKey: 'waterworld', domains: ['waterworld.com'] },
  { ownerName: 'Water Technology', ownerKey: 'water-technology', domains: ['watertechonline.com'] },
  { ownerName: 'Laser Focus World', ownerKey: 'laser-focus-world', domains: ['laserfocusworld.com'] },
  { ownerName: 'SPIE', ownerKey: 'spie', domains: ['spie.org'] },
  { ownerName: 'Tableau', ownerKey: 'tableau', domains: ['tableau.com'] },
  { ownerName: 'Wikimedia Commons', ownerKey: 'wikimedia-commons', domains: ['wikimedia.org'] },
  { ownerName: 'Flickr', ownerKey: 'flickr', domains: ['flickr.com'] },
  { ownerName: 'Observable', ownerKey: 'observable', domains: ['observablehq.com'] },
  { ownerName: 'Microsoft', ownerKey: 'microsoft', domains: ['microsoft.com', 'xbox.com'] },
  { ownerName: 'Google', ownerKey: 'google', domains: ['google.com', 'research.google'] },
  { ownerName: 'NVIDIA', ownerKey: 'nvidia', domains: ['nvidia.com', 'nvidia.cn'] },
  { ownerName: 'Apple', ownerKey: 'apple', domains: ['apple.com'] },
  { ownerName: 'SpaceX', ownerKey: 'spacex', domains: ['spacex.com', 'starlink.com'] },
  { ownerName: 'Tesla', ownerKey: 'tesla', domains: ['tesla.com'] },
  { ownerName: 'Boston Scientific', ownerKey: 'boston-scientific', domains: ['bostonscientific.com'] },
  { ownerName: 'Boston Dynamics', ownerKey: 'boston-dynamics', domains: ['bostondynamics.com'] },
  { ownerName: 'Siemens Healthineers', ownerKey: 'siemens-healthineers', domains: ['siemens-healthineers.com'] },
  { ownerName: 'Siemens Energy', ownerKey: 'siemens-energy', domains: ['siemens-energy.com'] },
  { ownerName: 'Kongsberg Maritime', ownerKey: 'kongsberg-maritime', domains: ['kongsbergmaritime.com', 'kongsberg.com'] },
  { ownerName: 'Airbus', ownerKey: 'airbus', domains: ['airbus.com'] },
  { ownerName: 'ASML', ownerKey: 'asml', domains: ['asml.com'] },
  { ownerName: 'ZEISS', ownerKey: 'zeiss', domains: ['zeiss.com'] },
  { ownerName: 'Xylem', ownerKey: 'xylem', domains: ['xylem.com'] },
  { ownerName: 'ABB', ownerKey: 'abb', domains: ['abb.com'] },
  { ownerName: 'BASF', ownerKey: 'basf', domains: ['basf.com'] },
  { ownerName: 'Unitree', ownerKey: 'unitree', domains: ['unitree.com'] },
  { ownerName: 'Xiaomi', ownerKey: 'xiaomi', domains: ['mi.com'] },
  { ownerName: 'Dreame', ownerKey: 'dreame', domains: ['dreametech.com'] },
  { ownerName: 'Meta', ownerKey: 'meta', domains: ['meta.com'] },
  { ownerName: 'Roborock', ownerKey: 'roborock', domains: ['roborock.com'] },
  { ownerName: 'Ecovacs', ownerKey: 'ecovacs', domains: ['ecovacs.com'] },
  { ownerName: 'Johnson & Johnson', ownerKey: 'johnson-and-johnson', domains: ['jnj.com'] },
  { ownerName: 'ASUS', ownerKey: 'asus', domains: ['asus.com'] },
  { ownerName: 'Arup', ownerKey: 'arup', domains: ['arup.com'] },
  { ownerName: 'Autodesk', ownerKey: 'autodesk', domains: ['autodesk.com', 'adsknews.autodesk.com'] },
];

const MULTIPART_SUFFIXES = ['ac.uk', 'co.uk', 'edu.cn', 'edu.sg', 'com.cn', 'org.cn', 'gov.cn', 'go.jp'];
const UNIVERSITY_OWNER_KEYS = new Set([
  'mit', 'harvard', 'stanford', 'yale', 'oxford', 'cambridge', 'imperial-college-london', 'eth-zurich', 'nus',
  'cmu', 'university-of-zurich',
  'sjtu', 'tsinghua', 'pku', 'fudan', 'ustc', 'zju', 'hit', 'hust', 'buaa', 'xjtu', 'seu', 'bit',
]);
const GOVERNMENT_OWNER_KEYS = new Set(['nasa', 'nih', 'noaa', 'usgs', 'us-doe', 'nrel']);
const RESEARCH_OWNER_KEYS = new Set([
  'slac', 'cas', 'berkeley-lab', 'max-planck-society', 'hhmi-janelia', 'cern', 'marin', 'fraunhofer', 'epri', 'dlr',
  'jamstec', 'cqt',
]);
const PUBLISHER_OWNER_KEYS = new Set([
  'springer-nature', 'ieee', 'science-aaas', 'science-daily', 'physics-world', 'optics-org',
  'semiconductor-engineering', 'medical-design-outsourcing', 'waterworld', 'water-technology', 'laser-focus-world', 'spie',
]);
const PLATFORM_OWNER_KEYS = new Set(['tableau', 'wikimedia-commons', 'flickr', 'observable']);

function inferOwnerKind(ownerKey: string, source: SourceOwnerInput): SourceOwnerKind {
  if (UNIVERSITY_OWNER_KEYS.has(ownerKey)) return 'university';
  if (GOVERNMENT_OWNER_KEYS.has(ownerKey)) return 'government';
  if (RESEARCH_OWNER_KEYS.has(ownerKey)) return 'research_institute';
  if (PUBLISHER_OWNER_KEYS.has(ownerKey)) return 'publisher_media';
  if (PLATFORM_OWNER_KEYS.has(ownerKey)) return 'platform';

  const type = String(source.sourceType || '').toLowerCase();
  const category = String(source.category || '').toUpperCase();
  if (type.startsWith('university') || type === 'medical_school') return 'university';
  if (/(journal|publisher|media|news_portal|professional_society|academic_org)/.test(type)) return 'publisher_media';
  if (/(gallery|platform|video|visualization)/.test(type)) return 'platform';
  if (/(institute|laboratory|research_center|national_lab|government_research)/.test(type)) return 'research_institute';
  if (category === 'ENT' || type.startsWith('enterprise') || type === 'rd_center') return 'company';
  return 'other';
}

function normalizeDomain(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\d*\./, '');
  } catch {
    return '';
  }
}

function matchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function registrableDomain(hostname: string): string {
  if (!hostname) return '';
  const multipart = MULTIPART_SUFFIXES.find(suffix => hostname.endsWith(`.${suffix}`));
  const labels = hostname.split('.');
  if (multipart) return labels.slice(-(multipart.split('.').length + 1)).join('.');
  return labels.length > 1 ? labels.slice(-2).join('.') : hostname;
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

function fallbackOwnerName(name: string, domain: string): string {
  const cleaned = name
    .replace(/\s+-\s+(Research|Science|Engineering|Biology|Physics|Health|Nation|Technology|News Feed|All)$/i, '')
    .replace(/\s+(Newsroom|News|Blog|Homepage|Gallery|Press Releases?|News Releases?)$/i, '')
    .trim();
  if (cleaned) return cleaned;
  const token = domain.split('.')[0] || '未知来源';
  return token.charAt(0).toUpperCase() + token.slice(1);
}

export function inferSourceOwner(source: SourceOwnerInput): SourceOwner {
  const name = String(source.name || '').trim();
  const hostname = normalizeDomain(String(source.url || ''));
  const rule = OWNER_RULES.find(candidate =>
    candidate.domains.some(domain => matchesDomain(hostname, domain))
    || candidate.namePatterns?.some(pattern => pattern.test(name))
  );
  if (rule) return {
    ownerName: rule.ownerName,
    ownerKey: rule.ownerKey,
    ownerDomain: registrableDomain(hostname),
    ownerKind: inferOwnerKind(rule.ownerKey, source),
  };

  const domain = registrableDomain(hostname);
  return {
    ownerName: fallbackOwnerName(name, domain),
    ownerKey: domain ? `domain:${domain}` : `name:${slugify(name)}`,
    ownerDomain: domain,
    ownerKind: inferOwnerKind('', source),
  };
}
