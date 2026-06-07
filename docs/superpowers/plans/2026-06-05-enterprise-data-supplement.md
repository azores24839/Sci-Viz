# 企业组数据补充 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为9个数据量不足的企业组补充 CrawlSource 和适配器配置，目标 approved 数从当前水平提升到 20-30

**Architecture:** 在现有 `enterpriseSources.ts` ENTERPRISE_SOURCES 数组中添加补充来源条目，为新增域名在 `staticSourceAdapters.ts` 中添加/更新适配器选择器，更新 `insights.ts` COMPARISON_GROUPS.enterprise.domains 新增域名

**Tech Stack:** TypeScript, Prisma, SQLite, Playwright (for browser_render sources)

---

## 当前数据现状

| 来源 | 当前 approved | 目标 | 需增 | 当前状态 | 策略 |
|------|-------------|------|------|---------|------|
| ZEISS | 25 | 30 | +5 | active_static, 仅 SMT 产品页 | 补充更多 ZEISS 产品/技术页 |
| Boston Scientific | 13 | 20-30 | +7~17 | active_static, 仅 newsroom | 补充产品页、medical Solutions 子站 |
| NVIDIA | 10+5=15 | 30 | +15 | Tech blog=needs_adapter_tuning, Customer Stories=active_static | 合并策略补强，增加更多子入口 |
| Microsoft | 9 | 20-30 | +11~21 | 2条needs_adapter_tuning + 1条manual | 补充 Research Blog 人工采、Azure blog 入口 |
| ASML | 9 | 20-30 | +11~21 | needs_adapter_tuning + active_static(产品页) | 增加 technology/innovation 入口 |
| Airbus | 9 | 20-30 | +11~21 | active_static, 仅 newsroom | 补充 innovation/projects 入口 |
| Siemens Healthineers | 8 | 20-30 | +12~22 | active_static(产品页) + manual(新闻) | 补充 stories 入口 |
| Boston Dynamics | 8 | 20-30 | +12~22 | active_static, 仅 blog | 补充产品页、spot/stretch 入口 |
| Xylem | 9 | 20-30 | +11~21 | active_static, 仅 newsroom | 补充 applications/solutions 入口 |

---

## File Structure

**Modify:**
- `sci-viz-case-hub/server/src/crawler/enterpriseSources.ts` — 添加 ~20 条新 ENTERPRISE_SOURCES 条目
- `sci-viz-case-hub/server/src/crawler/staticSourceAdapters.ts` — 添加/更新 ZEISS 等域名的适配器选择器
- `sci-viz-case-hub/server/src/routes/insights.ts` — COMPARISON_GROUPS.enterprise.domains 添加新域名

---

## Task 1: ZEISS 补充 — +5 条目标

**Files:**
- Modify: `sci-viz-case-hub/server/src/crawler/enterpriseSources.ts`
- Modify: `sci-viz-case-hub/server/src/crawler/staticSourceAdapters.ts`

当前 ZEISS 适配器已覆盖 `www.zeiss.com`/`zeiss.com`，路径仅匹配 `/semiconductor-manufacturing-technology/`。需要扩展路径模式让适配器能发现更多页面。

- [ ] **Step 1: 更新 ZEISS 适配器的 articlePathPatterns**

在 `staticSourceAdapters.ts` 中, ZEISS 适配器 (约 line 1373-1382) 当前路径:
```
/\/semiconductor-manufacturing-technology\//i, /\/technology\//i, /\/products\//i, /\/solutions\//i
```

增加更多路径模式以覆盖 ZEISS 其他产品线:
```typescript
articlePathPatterns: [/\/semiconductor-manufacturing-technology\//i, /\/technology\//i, /\/products\//i, /\/solutions\//i, /\/innovation\//i, /\/industry\//i, /\/medical-technology\//i, /\/microscopy\//i],
```

- [ ] **Step 2: 添加 ZEISS 补充来源条目到 ENTERPRISE_SOURCES**

在 `enterpriseSources.ts` 的 ZEISS 条目之后（约 line 1382 之后），添加：

```typescript
{
  discipline: '集成电路学院（信息与电子工程学院）',
  name: 'ZEISS Microscopy Solutions',
  url: 'https://www.zeiss.com/microscopy/en/solutions.html',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: '显微镜、光学系统、科研成像、生命科学和工业检测产品场景图',
  strategyHint: '优先抓 microscopy 产品页和 solutions 列表；保留光学系统、成像系统和分辨率图',
  notes: 'discipline=集成电路学院（信息与电子工程学院）；ZEISS 光学与显微成像产品线补充',
},
{
  discipline: '生物医学工程学院',
  name: 'ZEISS Medical Technology',
  url: 'https://www.zeiss.com/medical-technology/en/products.html',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: '医学影像设备、眼科设备、手术显微镜、数字病理和医院场景图',
  strategyHint: '优先抓 medical-technology 产品页；保留手术导航、OCT 和显微镜临床应用图',
  notes: 'discipline=生物医学工程学院；ZEISS 医疗技术产品线补充；commercialIntent=product_page',
  commercialIntent: 'product_page',
  commercialPriority: 'primary',
},
```

---

## Task 2: Boston Scientific 补充 — +7~17 条目标

**Files:**
- Modify: `sci-viz-case-hub/server/src/crawler/enterpriseSources.ts`
- Modify: `sci-viz-case-hub/server/src/crawler/staticSourceAdapters.ts`

当前 Boston Scientific 适配器已定义 (line 1229-1250)，路径匹配 `news-releases` 和 `/news/`。需要扩展到产品页面。

- [ ] **Step 1: 更新 Boston Scientific 适配器**

在 `staticSourceAdapters.ts` 中 Boston Scientific 适配器 (line 1229-1250)，增加更多路径和链接选择器:

```typescript
{
  name: 'Boston Scientific Newsroom',
  hostPatterns: [/^news\.bostonscientific\.com$/i, /^www\.bostonscientific\.com$/i, /^bostonscientific\.com$/i],
  articleLinkSelectors: ['article a[href]', '.wd_item a[href]', '.card a[href]', 'h2 a[href], h3 a[href]', 'a[href*="/news-releases"]', 'a[href*="/press-releases"]', 'a[href*="/en-US/"]', 'a[href*="/products/"]'],
  articlePathPatterns: [/news-releases/i, /press-releases/i, /\/news\//i, /\/en-US\/[a-z-]+\/products\//i, /\/products\//i],
  excludeUrlPatterns: [
    /\.pdf$/i,
    /\/investors\//i,
    /\/news-releases\/?$/i,
    /\/press-releases\/?$/i,
    /share-repurchase/i,
    /strategic-investment/i,
    /accelerated-share/i,
    /\/Company-news\/?$/i,
    /quarter/i,
    /financial/i,
    /investment/i,
  ],
  contentSelectors: ['article', 'main', '.wd_body', '.article-content', '.content', '.product-detail'],
  titleSelectors: ['h1', '.wd_title', 'title'],
  imageSelectors: ['article figure img', 'article picture img', '.wd_body img', 'main img', '.product-detail img'],
  excludeSelectors: ENTERPRISE_EXCLUDE_SELECTORS,
},
```

- [ ] **Step 2: 添加 Boston Scientific 产品页补充条目**

```typescript
{
  discipline: '生物医学工程学院',
  name: 'Boston Scientific Electrophysiology',
  url: 'https://www.bostonscientific.com/en-US/products/electrophysiology.html',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: '电生理导管、心脏mapping 系统、介入器械产品图和临床应用场景',
  strategyHint: '优先抓产品页下的子产品线详情；保留设备图、导管图和心跳mapping图',
  notes: 'discipline=生物医学工程学院；Boston Scientific 心脏介入产品线补充；commercialIntent=product_page',
  commercialIntent: 'product_page',
  commercialPriority: 'primary',
},
{
  discipline: '生物医学工程学院',
  name: 'Boston Scientific Interventional Cardiology',
  url: 'https://www.bostonscientific.com/en-US/products/interventional-cardiology.html',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: '冠脉支架、球囊导管、影像导管、结构性心脏病修复设备图',
  strategyHint: '优先抓产品页下的子产品线详情；保留器械图和手术示意',
  notes: 'discipline=生物医学工程学院；Boston Scientific 介入心脏病学产品线补充；commercialIntent=product_page',
  commercialIntent: 'product_page',
  commercialPriority: 'primary',
},
{
  discipline: '生物医学工程学院',
  name: 'Boston Scientific Endoscopy',
  url: 'https://www.bostonscientific.com/en-US/products/endoscopy.html',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: '内窥镜、消化道支架、ERCP 器械、微创手术设备图',
  strategyHint: '优先抓产品页下的子产品线详情；保留内窥镜设备图和消化内镜临床图',
  notes: 'discipline=生物医学工程学院；Boston Scientific 内窥镜产品线补充；commercialIntent=product_page',
  commercialIntent: 'product_page',
  commercialPriority: 'secondary',
},
```

---

## Task 3: NVIDIA 合并策略补强 — +15 条目标

**Files:**
- Modify: `sci-viz-case-hub/server/src/crawler/enterpriseSources.ts`

当前有 Technical Blog (needs_adapter_tuning) + Customer Stories (active_static)。需要合并策略增加更多入口。

- [ ] **Step 1: 更新 NVIDIA Technical Blog 条目 crawlStatus 为 active_static**

在 `enterpriseSources.ts` 中将 NVIDIA Technical Blog 的 `crawlStatus` 从 `needs_adapter_tuning` 改为 `active_static`:

```typescript
{
  discipline: '电子信息与电气工程学院',
  name: 'NVIDIA Technical Blog',
  url: 'https://developer.nvidia.com/blog',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: 'GPU、AI 计算、通信加速、仿真、数据中心和技术架构图',
  strategyHint: '技术博客含有大量架构图和性能图；优先采含 figure/图表的博文详情页',
  notes: 'discipline=电子信息与电气工程学院；AI 计算与电子信息技术解释来源；commercialIntent=technical_explanation',
  commercialIntent: 'technical_explanation',
  commercialPriority: 'secondary',
},
```

- [ ] **Step 2: 添加 NVIDIA 补充来源条目**

```typescript
{
  discipline: '电子信息与电气工程学院',
  name: 'NVIDIA Data Center Solutions',
  url: 'https://www.nvidia.com/en-us/data-center/',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: '数据中心 GPU、AI 训练集群、推理平台、网络架构和机架系统图',
  strategyHint: '优先抓产品线和解决方案页面；保留架构图和硬件渲染图',
  notes: 'discipline=电子信息与电气工程学院；NVIDIA 数据中心产品线补充；commercialIntent=product_page',
  commercialIntent: 'product_page',
  commercialPriority: 'primary',
},
{
  discipline: '电子信息与电气工程学院',
  name: 'NVIDIA Autonomous Machines',
  url: 'https://www.nvidia.com/en-us/autonomous-machines/',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: '自主机器、AI 边缘计算、Jetson 平台、机器人感知和自动驾驶平台图',
  strategyHint: '优先抓产品页和解决方案页；保留边缘计算架构图、机器人平台图',
  notes: 'discipline=电子信息与电气工程学院；NVIDIA 自主机器产品线补充；commercialIntent=product_page',
  commercialIntent: 'product_page',
  commercialPriority: 'primary',
},
{
  discipline: '电子信息与电气工程学院',
  name: 'NVIDIA Healthcare Solutions',
  url: 'https://www.nvidia.com/en-us/industries/healthcare/',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: '医学影像 AI、数字病理、基因组分析、手术机器人和药物发现可视化',
  strategyHint: '优先抓行业解决方案页；保留医疗 AI 架构图和临床场景图',
  notes: 'discipline=电子信息与电气工程学院；NVIDIA 医疗行业方案补充；commercialIntent=case_study',
  commercialIntent: 'case_study',
  commercialPriority: 'primary',
},
{
  discipline: '电子信息与电气工程学院',
  name: 'NVIDIA Robotics',
  url: 'https://www.nvidia.com/en-us/industries/robotics/',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: '机器人平台、Isaac 平台、自主导航、仿真平台和感知pipeline图',
  strategyHint: '优先抓行业页和解决方案页；保留机器人技术图和仿真截图',
  notes: 'discipline=电子信息与电气工程学院；NVIDIA 机器人行业方案补充；commercialIntent=case_study',
  commercialIntent: 'case_study',
  commercialPriority: 'primary',
},
```

---

## Task 4: Microsoft 补充 — +11~21 条目标

**Files:**
- Modify: `sci-viz-case-hub/server/src/crawler/enterpriseSources.ts`

当前 Microsoft 有 AI Customer Stories (needs_adapter_tuning) + AI Co-Innovation Labs (needs_adapter_tuning) + Research Blog (manual)。核心问题是静态采集失败。策略：添加可用静态采集的入口。

- [ ] **Step 1: 添加 Microsoft 补充来源条目**

```typescript
{
  discipline: '计算机学院（网络空间安全学院、密码学院）',
  name: 'Microsoft Azure Blog',
  url: 'https://azure.microsoft.com/en-us/blog/',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: 'Azure 云架构、AI 服务、数据可视化、云原生技术和开发平台配图',
  strategyHint: 'Azure blog 是 WordPress 站；静态发现可靠，优先抓含架构图和技术插图的博文',
  notes: 'discipline=计算机学院（网络空间安全学院、密码学院）；Microsoft Azure 技术博客补充；commercialIntent=technical_explanation',
  commercialIntent: 'technical_explanation',
  commercialPriority: 'primary',
},
{
  discipline: '计算机学院（网络空间安全学院、密码学院）',
  name: 'Microsoft Industry Stories',
  url: 'https://www.microsoft.com/en-us/industry',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: 'Microsoft 行业解决方案、数字转型、AI 应用案例和企业技术场景图',
  strategyHint: '行业页可静态抓取；保留行业应用案例和解决方案架构图',
  notes: 'discipline=计算机学院（网络空间安全学院、密码学院）；Microsoft 行业解决方案补充；commercialIntent=customer_story',
  commercialIntent: 'customer_story',
  commercialPriority: 'primary',
},
{
  discipline: '计算机学院（网络空间安全学院、密码学院）',
  name: 'Microsoft Xbox News',
  url: 'https://news.xbox.com/en-us/',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: '游戏硬件、主机设计、游戏截图、UI 界面和娱乐场景图',
  strategyHint: 'Xbox news 是 WordPress；可静态抓取含产品图和游戏概念图的新闻',
  notes: 'discipline=计算机学院（网络空间安全学院、密码学院）；Microsoft 游戏与消费硬件补充；commercialIntent=customer_story',
  commercialIntent: 'customer_story',
  commercialPriority: 'fallback',
},
```

- [ ] **Step 2: 添加 Azure 域名适配器到 staticSourceAdapters.ts**

在 `staticSourceAdapters.ts` ENTERPRISE_EXCLUDE_SELECTORS 之后添加:

```typescript
{
  name: 'Microsoft Azure Blog',
  hostPatterns: [/^azure\.microsoft\.com$/i, /^news\.xbox\.com$/i],
  articleLinkSelectors: ['article a[href]', '.post a[href]', '.card a[href]', 'h2 a[href], h3 a[href]', 'a[href*="/blog/"]', 'a[href*="/blog/post/"]'],
  articlePathPatterns: [/\/blog\/(post|entry)\//i, /\/blog\//i],
  excludeUrlPatterns: [/\/blog\/?$/i, /\/blog\/page\//i, /\/tag\//i, /\/category\//i],
  contentSelectors: ['article', 'main', '.post-content', '.entry-content', '.content'],
  titleSelectors: ['h1', '.entry-title', '.post-title', 'title'],
  imageSelectors: ['article figure img', 'article picture img', '.post-content img', '.entry-content img', 'main img'],
  excludeSelectors: ENTERPRISE_EXCLUDE_SELECTORS,
},
```

---

## Task 5: ASML 补充 — +11~21 条目标

**Files:**
- Modify: `sci-viz-case-hub/server/src/crawler/enterpriseSources.ts`
- Modify: `sci-viz-case-hub/server/src/crawler/staticSourceAdapters.ts`

当前已有 ASML News (needs_adapter_tuning) + 半导体产品页 (active_static)。ASML 适配器路径模式仅 `/en/news/` 和 `/en/technology/`。

- [ ] **Step 1: 更新 ASML 适配器路径模式**

在 `staticSourceAdapters.ts` 中 ASML 适配器 (line 1055-1065)，增加更多路径:

```typescript
{
  name: 'ASML News',
  hostPatterns: [/^www\.asml\.com$/i, /^asml\.com$/i],
  articleLinkSelectors: ['article a[href]', '.card a[href]', '.teaser a[href]', 'h2 a[href], h3 a[href]', 'a[href*="/en/news/"]', 'a[href*="/en/products/"]', 'a[href*="/en/technology/"]', 'a[href*="/en/about/"]'],
  articlePathPatterns: [/\/en\/news\//i, /\/en\/technology\//i, /\/en\/products\//i, /\/en\/about\//i, /\/technology\//i, /\/products\//i],
  excludeUrlPatterns: [/\.pdf$/i, /\/investors\//i, /\/support\//i, /\/resources\/press-releases\/?\?/i, /\/about-xylem\/newsroom\/?$/i, /\/en\/news\/?$/i, /\/en\/technology\/?$/i],
  contentSelectors: ['article', 'main', '.article-content', '.content', '.rich-text'],
  titleSelectors: ['h1', '.page-title', 'title'],
  imageSelectors: ['article figure img', 'article picture img', 'main figure img', 'main picture img', 'main img'],
  excludeSelectors: ENTERPRISE_EXCLUDE_SELECTORS,
},
```

- [ ] **Step 2: 添加 ASML 补充来源条目**

```typescript
{
  discipline: '集成电路学院（信息与电子工程学院）',
  name: 'ASML Technology Deep Dives',
  url: 'https://www.asml.com/en/technology',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: 'EUV 光刻技术、极紫外光源、光学投影系统、纳米级制程技术解释图',
  strategyHint: '技术页含丰富架构图和原理图；优先抓 lithography、EUV、numerical aperture 等技术详情页',
  notes: 'discipline=集成电路学院（信息与电子工程学院）；ASML 技术深度内容补充；commercialIntent=technical_explanation',
  commercialIntent: 'technical_explanation',
  commercialPriority: 'primary',
},
{
  discipline: '集成电路学院（信息与电子工程学院）',
  name: 'ASML Products EUV',
  url: 'https://www.asml.com/en/products/euv-lithography-systems',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: 'EUV 光刻机、 Twinscan 系统、光刻模块、晶圆传输和洁净室场景图',
  strategyHint: '产品页含丰富渲染图和实景图；保留产品渲染、洁净室和系统工程图',
  notes: 'discipline=集成电路学院（信息与电子工程学院）；ASML 产品系统补充；此URL已入库9条但可深采子页面；commercialIntent=product_page',
  commercialIntent: 'product_page',
  commercialPriority: 'primary',
},
```

---

## Task 6: Airbus 补充 — +11~21 条目标

**Files:**
- Modify: `sci-viz-case-hub/server/src/crawler/enterpriseSources.ts`
- Modify: `sci-viz-case-hub/server/src/crawler/staticSourceAdapters.ts`

当前 Airbus 适配器路径仅匹配 newsroom 和 innovation。需要增加 projects 等路径。

- [ ] **Step 1: 更新 Airbus 适配器路径和链接选择器**

在 `staticSourceAdapters.ts` 中 Airbus 适配器 (line 1252-1261):

```typescript
{
  name: 'Airbus Newsroom',
  hostPatterns: [/^www\.airbus\.com$/i, /^airbus\.com$/i],
  articleLinkSelectors: ['article a[href]', '.card a[href]', '.teaser a[href]', 'h2 a[href], h3 a[href]', 'a[href*="/en/newsroom/"]', 'a[href*="/en/innovation/"]', 'a[href*="/en/products/"]'],
  articlePathPatterns: [/\/en\/newsroom\//i, /\/newsroom\//i, /\/innovation\//i, /\/products\//i, /\/en\/products\//i],
  excludeUrlPatterns: [/\.pdf$/i, /\/investors\//i, /\/en\/newsroom\/?$/i, /\/en\/innovation\/?$/i],
  contentSelectors: ['article', 'main', '.article-content', '.content', '.rich-text'],
  titleSelectors: ['h1', '.page-title', 'title'],
  imageSelectors: ['article figure img', 'article picture img', 'main figure img', 'main picture img', 'main img'],
  excludeSelectors: ENTERPRISE_EXCLUDE_SELECTORS,
},
```

- [ ] **Step 2: 添加 Airbus 补充来源条目**

```typescript
{
  discipline: '航空航天学院',
  name: 'Airbus Innovation',
  url: 'https://www.airbus.com/en/innovation',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: '航空创新、ZEROe 零排放飞机、氢动力、城市空中交通和未来概念图',
  strategyHint: 'innovation 页面有丰富概念图和技术渲染图；保留 ZEROe、hydrogen、UAM 等创新子页面',
  notes: 'discipline=航空航天学院；Airbus 创新技术补充',
},
{
  discipline: '航空航天学院',
  name: 'Airbus Commercial Aircraft',
  url: 'https://www.airbus.com/en/products/commercial-aircraft',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: '客机产品线、A320/A350/A380 渲染图、客舱设计、机翼工程和飞行场景图',
  strategyHint: '产品页可静态采；保留机型渲染图、客舱布局图和工程细节图',
  notes: 'discipline=航空航天学院；Airbus 商用飞机产品线补充；commercialIntent=product_page',
  commercialIntent: 'product_page',
  commercialPriority: 'primary',
},
{
  discipline: '航空航天学院',
  name: 'Airbus Helicopters',
  url: 'https://www.airbus.com/en/products/helicopters',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: '直升机产品线、H160/H175 渲染图、旋翼工程、搜救场景和飞行场景图',
  strategyHint: '直升机产品页含丰富产品图和场景图；保留机型渲染和运营场景图',
  notes: 'discipline=航空航天学院；Airbus 直升机产品线补充；commercialIntent=product_page',
  commercialIntent: 'product_page',
  commercialPriority: 'primary',
},
{
  discipline: '航空航天学院',
  name: 'Airbus Defence and Space',
  url: 'https://www.airbus.com/en/products/space',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: '卫星、空间系统、地球观测、通信卫星和航天器工程图',
  strategyHint: '空间产品页含卫星渲染和轨道场景图；保留航天器技术和系统工程图',
  notes: 'discipline=航空航天学院；Airbus 防务与航天补充；commercialIntent=product_page',
  commercialIntent: 'product_page',
  commercialPriority: 'secondary',
},
```

---

## Task 7: Siemens Healthineers 补充 — +12~22 条目标

**Files:**
- Modify: `sci-viz-case-hub/server/src/crawler/enterpriseSources.ts`

当前有 medical-imaging 产品页 (active_static, 8条) + press-room 手动采集。需要补充更多产品线入口。

- [ ] **Step 1: 添加 Siemens Healthineers 补充来源条目**

```typescript
{
  discipline: '生物医学工程学院',
  name: 'Siemens Healthineers MRI',
  url: 'https://www.siemens-healthineers.com/magnetic-resonance-imaging',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: 'MRI 设备渲染图、磁共振系统、扫描场景、临床应用和 1.5T/3T 系统图',
  strategyHint: '优先抓产品详情子页面；保留设备渲染、临床场景和技术参数可视化',
  notes: 'discipline=生物医学工程学院；Siemens Healthineers MRI 产品线补充；commercialIntent=product_page',
  commercialIntent: 'product_page',
  commercialPriority: 'primary',
},
{
  discipline: '生物医学工程学院',
  name: 'Siemens Healthineers CT',
  url: 'https://www.siemens-healthineers.com/computed-tomography',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: 'CT 设备渲染图、双源 CT、能谱成像、心脏 CT 和系统架构图',
  strategyHint: '优先抓 CT 产品详情；保留设备渲染图和临床应用场景图',
  notes: 'discipline=生物医学工程学院；Siemens Healthineers CT 产品线补充；commercialIntent=product_page',
  commercialIntent: 'product_page',
  commercialPriority: 'primary',
},
{
  discipline: '生物医学工程学院',
  name: 'Siemens Healthineers Ultrasound',
  url: 'https://www.siemens-healthineers.com/ultrasound',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: '超声设备、探头设计、临床成像示例、妇幼健康和POC超声场景图',
  strategyHint: '优先抓超声产品详情；保留设备图和临床成像示例',
  notes: 'discipline=生物医学工程学院；Siemens Healthineers 超声产品线补充；commercialIntent=product_page',
  commercialIntent: 'product_page',
  commercialPriority: 'primary',
},
{
  discipline: '生物医学工程学院',
  name: 'Siemens Healthineers Stories',
  url: 'https://www.siemens-healthineers.com/stories',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: '医学影像临床案例、患者故事、技术突破、AI 医疗应用和医院创新场景图',
  strategyHint: '优先抓 stories 列表下的临床案例和技术创新故事；含丰富实景和设备使用图',
  notes: 'discipline=生物医学工程学院；Siemens Healthineers 故事内容补充；commercialIntent=customer_story',
  commercialIntent: 'customer_story',
  commercialPriority: 'primary',
},
```

---

## Task 8: Boston Dynamics 补充 — +12~22 条目标

**Files:**
- Modify: `sci-viz-case-hub/server/src/crawler/enterpriseSources.ts`

当前仅有 Blog (active_static, 8条)。补充产品页入口。

- [ ] **Step 1: 更新 Boston Dynamics 适配器**

在 `staticSourceAdapters.ts` 中 Boston Dynamics 适配器 (line 1012-1021)，增加更多路径：

```typescript
{
  name: 'Boston Dynamics Blog',
  hostPatterns: [/^bostondynamics\.com$/i, /^www\.bostondynamics\.com$/i],
  articleLinkSelectors: ['article a[href]', '.card a[href]', '.post a[href]', 'h2 a[href], h3 a[href]', 'a[href*="/blog/"]', 'a[href*="/spot/"]', 'a[href*="/stretch/"]', 'a[href*="/atlas/"]'],
  articlePathPatterns: [/\/blog\//i, /\/news\//i, /\/spot\//i, /\/stretch\//i, /\/atlas\//i, /\/robots\//i],
  excludeUrlPatterns: [/\/careers\//i, /\/support\//i],
  contentSelectors: ['article', 'main', '.post-content', '.entry-content', '.content'],
  titleSelectors: ['h1', '.entry-title', 'title'],
  imageSelectors: ['article figure img', 'article picture img', '.entry-content img', 'main img', '.hero img'],
  excludeSelectors: ENTERPRISE_EXCLUDE_SELECTORS,
},
```

- [ ] **Step 2: 添加 Boston Dynamics 补充来源条目**

```typescript
{
  discipline: '自动化与感知学院',
  name: 'Boston Dynamics Spot',
  url: 'https://bostondynamics.com/products/spot',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: 'Spot 四足机器人、工业检测、遥控操作、自主导航和现场部署场景图',
  strategyHint: '产品页含大量产品渲染和实景图；保留产品特写和场景化应用图',
  notes: 'discipline=自动化与感知学院；Boston Dynamics Spot 四足机器人产品补充；commercialIntent=product_page',
  commercialIntent: 'product_page',
  commercialPriority: 'primary',
},
{
  discipline: '自动化与感知学院',
  name: 'Boston Dynamics Stretch',
  url: 'https://bostondynamics.com/products/stretch',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: 'Stretch 仓储机器人、箱搬运、物流自动化、机械臂和仓库场景图',
  strategyHint: '产品页含实景和系统图；保留仓储场景和机器人技术图',
  notes: 'discipline=自动化与感知学院；Boston Dynamics Stretch 仓储机器人补充；commercialIntent=product_page',
  commercialIntent: 'product_page',
  commercialPriority: 'primary',
},
```

---

## Task 9: Xylem 补充 — +11~21 条目标

**Files:**
- Modify: `sci-viz-case-hub/server/src/crawler/enterpriseSources.ts`

当前仅有 newsroom (active_static, 9-10条)。补充应用场景和解决方案入口。

- [ ] **Step 1: 更新 Xylem 适配器路径**

在 `staticSourceAdapters.ts` 中 Xylem 适配器 (line 1146-1163)，增加更多路径:

```typescript
{
  name: 'Xylem Newsroom',
  hostPatterns: [/^www\.xylem\.com$/i, /^xylem\.com$/i],
  articleLinkSelectors: ['article a[href]', '.card a[href]', '.news-card a[href]', 'h2 a[href], h3 a[href]', 'a[href*="/about-xylem/newsroom/press-releases/"]', 'a[href*="/solutions/"]', 'a[href*="/applications/"]'],
  articlePathPatterns: [/\/about-xylem\/newsroom\/press-releases\//i, /\/solutions\//i, /\/applications\//i],
  excludeUrlPatterns: [
    /\.pdf$/i,
    /\/investors\//i,
    /\/support\//i,
    /\/resources\//i,
    /\/about-xylem\/newsroom\/?$/i,
    /\/about-xylem\/newsroom\/press-releases\/?$/i,
  ],
  contentSelectors: ['article', 'main', '.article-content', '.content', '.rich-text'],
  titleSelectors: ['h1', '.page-title', 'title'],
  imageSelectors: ['article figure img', 'article picture img', 'main figure img', 'main picture img', 'main img'],
  excludeSelectors: ENTERPRISE_EXCLUDE_SELECTORS,
},
```

- [ ] **Step 2: 添加 Xylem 补充来源条目**

```typescript
{
  discipline: '环境科学与工程学院',
  name: 'Xylem Solutions',
  url: 'https://www.xylem.com/en-us/solutions/',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: '水处理解决方案、泵站系统、智能水务、管网管理和水基础设施场景图',
  strategyHint: '优先抓 solutions 下的水处理、管网、监测和智能水务子页面；含丰富系统架构图和场景图',
  notes: 'discipline=环境科学与工程学院；Xylem 解决方案页面补充；commercialIntent=product_page',
  commercialIntent: 'product_page',
  commercialPriority: 'primary',
},
{
  discipline: '环境科学与工程学院',
  name: 'Xylem Applications',
  url: 'https://www.xylem.com/en-us/applications/',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: '市政供水、工业水处理、建筑排水、农业灌溉和水务数字化应用场景图',
  strategyHint: '优先抓 applications 下的行业应用页面；保留场景化工程图和基础设施图',
  notes: 'discipline=环境科学与工程学院；Xylem 行业应用页面补充；commercialIntent=case_study',
  commercialIntent: 'case_study',
  commercialPriority: 'primary',
},
```

---

## Task 10: 更新 COMPARISON_GROUPS enterprise domains

**Files:**
- Modify: `sci-viz-case-hub/server/src/routes/insights.ts`

需要在 COMPARISON_GROUPS.enterprise.domains 中添加新的域名:
- `azure.microsoft.com`
- `news.xbox.com`

- [ ] **Step 1: 添加新域名到 enterprise.domains 数组**

在 `insights.ts` 约 line 617-632 的 enterprise.domains 数组中添加:

```typescript
'azure.microsoft.com', 'news.xbox.com',
```

完整更新后的 enterprise 域名列表应该包含：
```typescript
domains: [
  'www.kongsberg.com', 'www.arup.com', 'www.autodesk.com',
  'www.siemens-energy.com', 'www.rolls-royce.com', 'www.cat.com',
  'www.huawei.com', 'www.qualcomm.com', 'developer.nvidia.com', 'www.nvidia.com',
  'new.abb.com', 'www.se.com', 'www.eaton.com',
  'bostondynamics.com', 'www.fanucamerica.com',
  'research.google', 'www.microsoft.com', 'aiotlabs.microsoft.com',
  'azure.microsoft.com', 'news.xbox.com',
  'www.asml.com', 'pr.tsmc.com', 'newsroom.arm.com', 'www.arm.com',
  'www.basf.com', 'www.corning.com', 'corporate.dow.com',
  'www.xylem.com', 'www.veolia.com', 'orsted.com',
  'www.siemens-healthineers.com', 'www.gehealthcare.com', 'news.bostonscientific.com',
  'www.bostonscientific.com',
  'www.airbus.com', 'boeing.mediaroom.com',
  'www.zeiss.com',
],
```

注意: `www.bostonscientific.com` 是新增的（之前只有 `news.bostonscientific.com`）；`www.zeiss.com` 已存在。

---

## Task 11: Seed 新来源并验证

**Files:** 无代码变更，仅运行验证

- [ ] **Step 1: 运行 seedEnterpriseSources 更新数据库**

```bash
cd sci-viz-case-hub/server && npx tsx src/crawler/enterpriseSources.ts
```

- [ ] **Step 2: 验证新来源已正确插入数据库**

```bash
cd sci-viz-case-hub/server && sqlite3 prisma/dev.db "SELECT name, url, crawlStatus, adapterType FROM CrawlSource WHERE sourceType = 'enterprise' ORDER BY name" | head -80
```

- [ ] **Step 3: 对于 active_static 新来源，运行静态采集验证**

选择1-2个关键新来源进行试采，验证适配器选择器能正确发现链接:
```bash
cd sci-viz-case-hub/server && npx tsx src/crawler/runEnterpriseActiveBatch.ts
```

---

## 执行顺序

建议按以下优先级执行:
1. Task 1 (ZEISS) — 快速补充，只需5条
2. Task 8 (Boston Dynamics) — 产品页补充，效果最直接
3. Task 6 (Airbus) — 产品线扩展充足
4. Task 7 (Siemens Healthineers) — 多产品线补充
5. Task 9 (Xylem) — Solutions/Applications 入口明确
6. Task 5 (ASML) — 需要扩展现有适配器
7. Task 2 (Boston Scientific) — 需要扩展适配器
8. Task 3 (NVIDIA) — 需要更新状态+补充入口
9. Task 4 (Microsoft) — 需要新域名适配器
10. Task 10 (COMPARISON_GROUPS) — 配套更新
11. Task 11 (验证) — 最终验证