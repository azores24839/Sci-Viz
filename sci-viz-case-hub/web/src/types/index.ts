export interface VisualCase {
  id: string;
  title: string;
  sourceUrl: string;
  sourceDomain: string;
  pageTitle: string;
  caseTitle: string;
  imageUrl: string;
  imagePath: string;
  thumbnailPath: string;
  imageHash: string;
  videoUrl: string;
  videoPlatform: string;
  videoDuration: number;
  contextText: string;
  ocrText: string;
  captureType: string;
  userHint: string;
  collectionScore: number;
  collectionReasons: string;
  mediaType: string;
  contentType: string;
  discipline: string;
  technicalMethod: string;
  composition: string;
  colorTone: string;
  useCase: string;
  functionalPurpose: string;
  distributionMedium: string;
  mediaSubType: string;
  contentSubType: string;
  aiSummary: string;
  borrowablePoints: string;
  riskNotes: string;
  confidence: number;
  reviewStatus: ReviewStatus;
  rating: number;
  manualNotes: string;
  createdAt: string;
  updatedAt: string;
}

export type ReviewStatus =
  | 'pending_ai_analysis'
  | 'needs_review'
  | 'low_confidence_review'
  | 'approved'
  | 'rejected'
  | 'analysis_failed'
  | 'source_missing';

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  pagination?: Pagination;
  error?: string;
}

export interface InsightDistributionItem {
  label: string;
  count: number;
  percentage: number;
}

export interface CrossMatrixCell {
  columnLabel: string;
  count: number;
  percentage: number;
}

export interface CrossMatrixRow {
  rowLabel: string;
  total: number;
  cells: CrossMatrixCell[];
}

export interface CrossMatrix {
  rowDimension: string;
  columnDimension: string;
  rowLabel: string;
  columnLabel: string;
  columns: string[];
  rows: CrossMatrixRow[];
}

export interface DimensionOption {
  key: string;
  label: string;
}

export interface InsightFilters {
  sourceDomain: string;
  sourceName: string;
  enterpriseCompany?: string;
  mediaType: string;
  contentType: string;
  discipline: string;
  technicalMethod: string;
  composition: string;
  colorTone: string;
  functionalPurpose: string;
  distributionMedium: string;
  reviewStatus: string;
}

export interface InsightSummary {
  filters: InsightFilters;
  filterOptions: Record<string, InsightDistributionItem[]>;
  totalCases: number;
  sourceCount: number;
  leadingMediaType: string;
  leadingDiscipline: string;
  leadingVisualStyle: string;
  leadingTechnicalMethod: string;
  distributions: Record<string, InsightDistributionItem[]>;
  crossMatrix: CrossMatrix;
  ratingDistribution: InsightDistributionItem[];
  allDimensions: DimensionOption[];
  generatedInsights: string[];
}

export interface CrawlResult {
  url: string;
  status: 'success' | 'failed' | 'auth_required';
  pageTitle: string;
  candidateImageCount: number;
  filteredImageCount: number;
  createdCaseCount: number;
  errors: string[];
}

export interface CrawlSummary {
  inputUrlCount: number;
  fetchedPageCount: number;
  failedPageCount: number;
  candidateImageCount: number;
  filteredImageCount: number;
  createdCaseCount: number;
  failedImageCount: number;
}

export interface CrawlResponse {
  success: boolean;
  summary: CrawlSummary;
  results: CrawlResult[];
}

export interface NetworkTestResponse {
  success: boolean;
  status: number;
  message: string;
}

export interface CollectionKpiProgress {
  id: number;
  dimension: 'mediaType' | 'contentType' | 'discipline' | 'technicalMethod' | 'functionalPurpose' | 'distributionMedium';
  category: string;
  targetCount: number;
  currentCount: number;
  approvedCount: number;
  highValueCount: number;
  remainingCount: number;
  progress: number;
  isReached: boolean;
  priority: number;
  enabled: boolean;
  notes: string;
}

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending_ai_analysis: '待识别',
  needs_review: '待确认',
  low_confidence_review: '重点复核',
  approved: '已入库',
  rejected: '已丢弃',
  analysis_failed: '处理失败',
  source_missing: '缺少来源',
};

export const MEDIA_TYPES = [
  '摄影', '手绘图', '3D渲染', '信息图', '显微图',
  '数据可视化', '混合媒介', '不确定',
] as const;

export const CONTENT_TYPES = [
  '单人肖像', '群体肖像', '绘画肖像', '实验设备', '实验过程',
  '微观样本', '机制模型', '数据结果', '空间环境', '团队场景',
  '科普传播', '不确定',
] as const;

export const DISCIPLINES = [
  '生命科学', '材料', '医学', '工程', '物理',
  '化学', '信息科学', '环境科学', '综合交叉', '不确定',
] as const;

export const TECHNICAL_METHODS = [
  '拍摄', '成像', '绘设', '数据', '渲染', '生成',
] as const;

export const FUNCTIONAL_PURPOSES = [
  '记录', '解释', '数据', '展示', '传播', '交互',
] as const;

export const DISTRIBUTION_MEDIUMS = [
  '静图', '动图', '视频', '图组', '交互', '实体',
] as const;

export const RATING_LABELS: Record<number, string> = {
  1: '无参考价值',
  2: '普通参考',
  3: '可保留',
  4: '值得拆解',
  5: '标杆案例',
};

export const CAPTURE_TYPE_LABELS: Record<string, string> = {
  image: '插件采集',
  screenshot: '截图',
  page_selection: '选中文字',
  crawler: '自动采集',
  video: '视频',
};

export const SOURCE_TYPE_OPTIONS = [
  { value: '', label: '不指定' },
  { value: 'journal_cover', label: '期刊封面' },
  { value: 'research_institution', label: '研究机构' },
  { value: 'lab_website', label: '实验室网站' },
  { value: 'visualization_company', label: '可视化公司' },
  { value: 'media', label: '媒体' },
  { value: 'other', label: '其他' },
];

export interface CrawlSource {
  id: number;
  name: string;
  url: string;
  sourceDomain?: string;
  enterpriseCompany?: string;
  enterpriseCompanyKey?: string;
  sourcePageType?: string;
  category: string;
  sourceType: string;
  adapterType: string;
  crawlStatus: string;
  crawlAvailability?: 'auto' | 'needs_adapter' | 'blocked' | 'dead';
  crawlTier: string;
  lastDiagnosis: string;
  visualValue: string;
  strategyHint: string;
  enabled: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
  lastJob: CrawlJob | null;
  existingCases: number;
}

export interface CrawlJob {
  id: number;
  sourceId: number;
  status: 'pending' | 'discovering' | 'crawling' | 'completed' | 'failed';
  discoveredUrls: string;
  crawledUrls: string;
  totalCount: number;
  crawledCount: number;
  newCases: number;
  error: string;
  createdAt: string;
  updatedAt: string;
}

export const CATEGORY_LABELS: Record<string, string> = {
  '00-CHANGXING': '长兴海洋实验室',
  'A': '高校科研新闻',
  'B': '国家实验室/机构',
  'C': '官方图库/API',
  'D': '期刊/出版机构',
  'E': '开放公共库',
  'F': '第三方/社交',
  'G': '中国科学院',
  'H': '国内顶尖高校',
  'I': '科学媒体与科普',
  'J': '中国期刊',
  'K': '国家重点机构',
  'L': '国际补缺来源',
  'ENT': '头部企业',
  'SJTU': '交大院系来源',
  'SJTU-VIS': '交大工科对标来源',
  'SJTU-NATLAB': '国家级科研平台',
};

export type ComparisonGroupId = 'ime' | 'sjtu' | 'domestic' | 'overseasUniversity' | 'international' | 'enterprise';

export interface ComparisonDistributionItem {
  label: string;
  count: number;
  percentage: number;
}

export interface ComparisonSample {
  id: string;
  title: string;
  thumbnail: string;
  sourceUrl: string;
  sourceDomain: string;
  mediaType: string;
  contentType: string;
  discipline?: string;
  technicalMethod: string;
  functionalPurpose?: string;
  distributionMedium?: string;
  rating?: number;
}

export interface ComparisonGroup {
  id: ComparisonGroupId;
  label: string;
  sourceDomains: string[];
  rawTotal?: number;
  total: number;
  distribution: ComparisonDistributionItem[];
  samples: ComparisonSample[];
}

export interface SubtypeCrossCell {
  col: string;
  count: number;
}

export interface SubtypeCrossRow {
  row: string;
  cells: SubtypeCrossCell[];
}

export interface SubtypeCross {
  rows: string[];
  columns: string[];
  matrix: SubtypeCrossRow[];
}

export interface Finding {
  groupId: ComparisonGroupId;
  groupLabel: string;
  topLabel: string;
  topPercentage: number;
  summary: string;
}

export interface EnterpriseCommercialSignal {
  key: string;
  label: string;
  count: number;
  percentage: number;
}

export interface EnterpriseCommercialSignals {
  total: number;
  signals: EnterpriseCommercialSignal[];
  sourceBreakdown?: ComparisonDistributionItem[];
  summary: string;
}

export interface ComparisonData {
  discipline: string;
  school?: string;
  dimension: string;
  dimensionLabel: string;
  parentDimension?: string;
  parentValue?: string;
  sampleMode?: 'live' | 'balanced';
  balancedSampleSize?: number;
  groups: ComparisonGroup[];
  findings: Finding[];
  subtypeCross: SubtypeCross | null;
  enterpriseCommercialSignals?: EnterpriseCommercialSignals;
  schools: { id: string; label: string; discipline: string }[];
}

export interface SpectrumDimension {
  axis: string;
  label: string;
  values: string[];
}

export interface SpectrumCell {
  x: string;
  y: string;
  z: string;
  count: number;
  percentage: number;
}

export interface ThreeAxisSpectrum {
  dimensions: [SpectrumDimension, SpectrumDimension, SpectrumDimension];
  cells: SpectrumCell[];
  total: number;
  note: string;
}

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  'university_news': '大学新闻',
  'university_research_news': '研究新闻',
  'university_department_news': '院系新闻',
  'university_topic_news': '专题新闻',
  'university_research_portal': '研究门户',
  'university_research_series': '研究系列',
  'medical_school_news': '医学院',
  'national_lab_news': '国家实验室',
  'national_lab_news_list': '实验室列表',
  'research_institute_news': '研究机构新闻',
  'research_institute_portal': '研究机构门户',
  'life_science_research_institute': '生命科学机构',
  'bioinformatics_research_institute': '生物信息机构',
  'biomedical_research_institute_news': '生物医学机构',
  'biomedical_research_and_education_institute': '生物医学教育',
  'official_media_library': '官方媒体库',
  'official_api': '官方API',
  'official_media_collection': '官方媒体',
  'official_video_library': '视频库',
  'official_image_archive': '图像档案',
  'official_science_image_gallery': '科学图库',
  'official_photo_gallery_index': '照片目录',
  'official_media_resource': '媒体资源',
  'official_flickr_gallery': 'Flickr',
  'official_science_illustration_library': '插画库',
  'official_digital_collection': '数字馆藏',
  'official_historical_medical_image_collection': '医学史',
  'official_public_health_image_library': '公卫图库',
  'official_photo_collection': '照片集藏',
  'official_image_gallery': '图片展示',
  'medical_cultural_collection': '医学文化',
  'official_api_documentation': 'API文档',
  'official_iiif_documentation': 'IIIF',
  'official_press_resource': '新闻资源',
  'journal_publisher': '期刊',
  'journal_news': '期刊新闻',
  'journal_news_listing': '新闻列表',
  'journal': '期刊',
  'journal_article_listing': '文章列表',
  'journal_news_index': '新闻索引',
  'press_resource': '媒体资源',
  'publisher_guideline': '出版指南',
  'open_media_repository': '开放媒体库',
  'open_media_category': '开放分类',
  'curated_open_media_gallery': '精选媒体',
  'science_news_aggregator': '新闻聚合',
  'science_magazine': '科学杂志',
  'national_lab': '国家实验室',
  'major_infrastructure': '重大基础设施',
  'engineering_center': '工程研究中心',
  'engineering_lab': '工程实验室',
  'rd_center': '研发中心',
  'collaborative_innovation': '协同创新中心',
  'entrepreneurship_base': '双创基地',
  'international_cooperation': '国际合作基地',
  'who_center': 'WHO合作中心',
  'no_independent_site': '无独立网站',
};
