# Sci-Viz Case Hub URL 池 / CRAWL_SOURCE_TARGETS.md

# A. 高校科研新闻

## A1. MIT

```yaml
name: MIT News
url: https://news.mit.edu/
source_type: university_news
recommended_page_type: specific_article_page
visual_value: 科研新闻、实验图、科研人员、机制图、工程图、AI/材料/生命科学内容
strategy_hint: 通用静态抓取 + og:image + figure caption + article body context
```

```yaml
name: MIT News - Research
url: https://news.mit.edu/topic/research
source_type: university_research_news
recommended_page_type: specific_article_page
visual_value: 研究成果新闻、科研图像、研究人员、实验图
strategy_hint: 先从列表页收集文章 URL，再抓具体文章页
```

## A2. Stanford

```yaml
name: Stanford Report
url: https://news.stanford.edu/
source_type: university_news
recommended_page_type: specific_article_page
visual_value: 科研新闻、人物图、实验图、科学传播图
strategy_hint: 通用静态抓取；注意专题页和普通文章页结构可能不同
```

## A3. Harvard

```yaml
name: Harvard Gazette
url: https://news.harvard.edu/gazette/
source_type: university_news
recommended_page_type: specific_article_page
visual_value: 科研新闻、医学、社会科学、人物、校园科研图像
strategy_hint: 抓具体 story 页面；提取文章标题、主图、caption、credit
```

# B. 国家实验室

## B1. Berkeley Lab

```yaml
name: Berkeley Lab News Center
url: https://newscenter.lbl.gov/
source_type: national_lab_news
recommended_page_type: specific_article_page
visual_value: 能源、材料、化学、物理、宇宙学、实验设备图
strategy_hint: 适合第一轮和第二轮
```

## B2. Max Planck Society

```yaml
name: Max Planck Society Newsroom
url: https://www.mpg.de/en/newsroom
source_type: research_institute_news
recommended_page_type: specific_article_page
visual_value: 基础科学、生命科学、物理、天文、社会科学研究图像
strategy_hint: 适合欧洲权威科研机构新闻采集
```

# C. 官方科研图库

## C1. NASA

```yaml
name: NASA Image and Video Library
url: https://images.nasa.gov/
source_type: official_media_library
recommended_page_type: API_or_asset_detail_page
visual_value: 航天、天文、地球观测、任务图像
strategy_hint: 优先走 API；网页爬取作为辅助
```

## C2. CERN

```yaml
name: CERN Photos
url: https://cds.cern.ch/collection/Photos?ln=en
source_type: official_media_library
recommended_page_type: image_detail_page
visual_value: 粒子物理、LHC、大型实验设备
strategy_hint: 适合做 source-specific extractor
```

# D. 期刊/出版机构

## D1. Nature

```yaml
name: Nature
url: https://www.nature.com/
source_type: journal_publisher
recommended_page_type: article_or_news_page
visual_value: 顶级科研论文、新闻、机制图、封面
strategy_hint: 先分析公开新闻页和文章页
```

## D2. Science

```yaml
name: Science
url: https://www.science.org/
source_type: journal_publisher
recommended_page_type: article_or_news_page
visual_value: 顶级科研论文、新闻、政策、图像和封面
strategy_hint: 后续重点分析权限、图片 URL、版权字段
```

# E. 开放公共图像库

## E1. Wikimedia Commons

```yaml
name: Wikimedia Commons
url: https://commons.wikimedia.org/wiki/Main_Page
source_type: open_media_repository
recommended_page_type: category_or_file_page
visual_value: 科学插图、显微图、历史图、公共领域/CC 图片
strategy_hint: 后续建议通过 MediaWiki API；必须保留 license / author
```

## E2. ScienceDaily

```yaml
name: ScienceDaily
url: https://www.sciencedaily.com/
source_type: science_news_aggregator
recommended_page_type: specific_news_page
visual_value: 科学新闻配图、研究成果传播图像
strategy_hint: 权威性不如原始机构；建议作为补充来源
```

# F. 第三方图库

```yaml
name: ESA on Flickr
url: https://www.flickr.com/photos/europeanspaceagency/
source_type: official_flickr_gallery
recommended_page_type: flickr_photo_or_album_page
visual_value: ESA 官方 Flickr 图片
strategy_hint: 后续考虑 Flickr API；保留 license / credit
```

# G. 中国科学院

## G1. 中国科学院科研进展 ✅ 已采集

```yaml
name: 中国科学院科研进展
url: https://www.cas.cn/syky/
source_type: national_academy_news
recommended_page_type: specific_article_page
crawl_tier: S
crawl_status: active_static
collected_cases: 73
collection_date: 2026-05-28
visual_value: 中国最高科研机构、涵盖基础科学全学科、实验设备图、科研人员、机制图、显微图、数据可视化
strategy_hint: 列表页+翻页(index_1~6.shtml)；另辟cg/zh成果转化频道(index_1~3.shtml)；每页15篇，成功率约62%
```

## G2. 科学网

```yaml
name: 科学网
url: https://news.sciencenet.cn/
source_type: science_news_aggregator
recommended_page_type: specific_article_page
crawl_tier: A
crawl_status: active_static
visual_value: 中国最大科学新闻平台、中国科学报社主办、覆盖高校/中科院/国际科研动态、学科分类清晰
strategy_hint: 每天更新大量科研新闻；按学科频道（生命/医学/化学/工程/信息/地球/数理/管理）抓取；保留中国科学报的图片标注
```

# H. 国内顶尖高校科研新闻

## H1. 清华大学 ✅ 已采集

```yaml
name: 清华大学科学研究
url: https://www.tsinghua.edu.cn/kxyj.htm
source_type: university_research_news
recommended_page_type: specific_article_page
crawl_tier: S
crawl_status: active_static
collected_cases: 123
collection_date: 2026-05-29
visual_value: 清华各院系前沿科研成果新闻、实验室照片、机制图、3D渲染、设备图、科研人员肖像
strategy_hint: 列表页news/xsky.htm；文章URL格式info/1175/NUM.htm；每篇3-5张高质量图
```

## H2. 北京大学 ✅ 已采集

```yaml
name: 北京大学学术科研
url: https://news.pku.edu.cn/xwzh/kyxw.htm
source_type: university_research_news
recommended_page_type: specific_article_page
crawl_tier: S
crawl_status: active_static
collected_cases: 143
collection_date: 2026-05-29
visual_value: 北大新闻网学术科研频道、科研突破新闻、实验室照片、科研人员、科普配图
strategy_hint: 列表页jxky/index.htm；文章URL格式jxky/UUID.htm；每篇5-7张高质量图（芯片显微图、机制图等）
```

## H3. 复旦大学 ✅ 已采集

```yaml
name: 复旦大学新闻
url: https://news.fudan.edu.cn/
source_type: university_research_news
crawl_tier: A
crawl_status: active_static
collected_cases: 106
collection_date: 2026-05-29
visual_value: 复旦科研动态、医学/生命科学/物理/化学等研究进展新闻配图
strategy_hint: 列表页news.fudan.edu.cn；每篇3-4张图
```

## H4. 上海交通大学 ✅ 已采集

```yaml
name: 上海交通大学新闻
url: https://news.sjtu.edu.cn/
source_type: university_research_news
crawl_tier: A
crawl_status: active_static
collected_cases: 97
collection_date: 2026-05-29
visual_value: 上交科研新闻、工程技术/材料/生科领域成果配图
strategy_hint: 列表页news.sjtu.edu.cn；每篇3-4张图
```

## H4a. 上海交通大学-学院二级网站（新增）

> 适配日期：2026-06-02
> 适配器：staticSourceAdapters.ts 中 23 个 SJTU 子域名适配器
> 种子数据：sjtuSources.ts 中 23 条 CrawlSource 配置
> 测试结果：3 个来源 dry-run，发现 76 条文章链接，8/9 页面含图片，共 46 张图片

### 高优先级（工科）✅ 已适配并测试

```yaml
- name: "上海交大-材料科学与工程学院"
  url: "https://smse.sjtu.edu.cn"
  source_type: "university_department_news"
  crawl_tier: "A"
  crawl_status: "active_static"
  adapter_type: "static_html"
  test_links: 16 条
  test_pages_with_images: 2/3
  test_images: 16
  visual_value: "科研成果配图（Nature/Science论文图）、实验室设备、科研人员照片"
  strategy_hint: "/post/detail/NNNN 文章格式；内容在 .article-wrapper 内；CMS-A 类型"

- name: "上海交大-环境科学与工程学院"
  url: "https://sese.sjtu.edu.cn"
  source_type: "university_department_news"
  crawl_tier: "A"
  crawl_status: "active_static"
  adapter_type: "static_html"
  test_links: 30 条
  test_pages_with_images: 3/3
  test_images: 14
  visual_value: "Science/Nature Sustainability等顶刊论文配图、学术会议照片"
  strategy_hint: "/post/detail/NNNN 文章格式；CMS-A 类型"

- name: "上海交大-化学化工学院"
  url: "https://scce.sjtu.edu.cn"
  source_type: "university_department_news"
  crawl_tier: "A"
  crawl_status: "active_static"
  adapter_type: "static_html"
  test_links: 30 条
  test_pages_with_images: 3/3
  test_images: 16
  visual_value: "Nature Chemistry/JACS等顶刊论文配图、实验室照片、院士照片"
  strategy_hint: "/index_news/NNNN.html 文章格式；内容在 .ab_nr 内；CMS-B 类型"

- name: "上海交大-机械与动力工程学院"
  url: "https://me.sjtu.edu.cn"
  source_type: "university_department_news"
  crawl_tier: "A"
  crawl_status: "active_static"
  adapter_type: "static_html"

- name: "上海交大-电子信息与电气工程学院"
  url: "https://www.seiee.sjtu.edu.cn"
  source_type: "university_department_news"
  crawl_tier: "A"
  crawl_status: "active_static"
  adapter_type: "static_html"

- name: "上海交大-船舶海洋与建筑工程学院"
  url: "https://oce.sjtu.edu.cn"
  source_type: "university_department_news"
  crawl_tier: "A"
  crawl_status: "active_static"
  adapter_type: "static_html"

- name: "上海交大-航空航天学院"
  url: "https://www.aero.sjtu.edu.cn"
  source_type: "university_department_news"
  crawl_tier: "A"
  crawl_status: "active_static"
  adapter_type: "static_html"

- name: "上海交大-生物医学工程学院"
  url: "https://bme.sjtu.edu.cn"
  source_type: "university_department_news"
  crawl_tier: "A"
  crawl_status: "active_static"
  adapter_type: "static_html"

- name: "上海交大-计算机学院"
  url: "https://cs.sjtu.edu.cn"
  source_type: "university_department_news"
  crawl_tier: "A"
  crawl_status: "active_static"
  adapter_type: "static_html"
```

### 中优先级（理科）✅ 已适配

```yaml
- name: "上海交大-物理与天文学院"
  url: "https://www.physics.sjtu.edu.cn"

- name: "上海交大-数学科学学院"
  url: "https://math.sjtu.edu.cn"

- name: "上海交大-生命科学技术学院"
  url: "https://life.sjtu.edu.cn"
```

### 低优先级（人文社科等）✅ 已适配

```yaml
- name: "上海交大-设计学院"
  url: "https://design.sjtu.edu.cn"

- name: "上海交大-媒体与传播学院"
  url: "https://smc.sjtu.edu.cn"
```

### 补充高视觉价值来源 ✅ 已适配

```yaml
- name: "上海交大-海洋学院"
  url: "https://soo.sjtu.edu.cn"
  note: "视觉内容丰富度TOP1；极地科考、深海装备照片"

- name: "上海交大-药学院"
  url: "https://pharm.sjtu.edu.cn"

- name: "上海交大-农业与生物学院"
  url: "https://www.agri.sjtu.edu.cn"
  note: "视觉内容丰富度TOP6；农作物、实验田照片"

- name: "上海交大-李政道研究所"
  url: "https://tdli.sjtu.edu.cn"
  note: "视觉内容丰富度TOP7；大科学装置、暗物质探测"

- name: "上海交大-医疗机器人研究院"
  url: "https://imr.sjtu.edu.cn"
  note: "视觉内容丰富度TOP2；机器人实物照片"

- name: "上海交大-金属基复合材料国家重点实验室"
  url: "https://sklcm.sjtu.edu.cn"
  note: "国家重点实验室；实验装备、仪器照片"

- name: "上海交大-密西根学院（全球学院）"
  url: "https://www.ji.sjtu.edu.cn"
  note: "中美合作办学；英文为主"

- name: "上海交大-巴黎卓越工程师学院"
  url: "https://speit.sjtu.edu.cn"
  note: "中法合作办学"
```

### 适配技术说明

SJTU 学院网站主要使用两种 CMS：
- **CMS-A**（材料学院、环境学院等）：文章 URL 格式 `/post/detail/NNNN`，内容在 `.article-wrapper` / `.article-container` 内
- **CMS-B**（化学化工学院等）：文章 URL 格式 `/index_news/NNNN.html`，内容在 `.ab_nr` / `.ny_k3` 内，标题在 `.sbt`

所有适配器均包含两种 CMS 的选择器外加通用中文高校 CMS 回退选择器，图像选择器末位包含 `body img` 作为兜底。

## H5. 中国科学技术大学 ✅ 已采集

```yaml
name: 中国科学技术大学新闻
url: https://news.ustc.edu.cn/
source_type: university_research_news
crawl_tier: A
crawl_status: active_static
collected_cases: 51
collection_date: 2026-05-29
visual_value: 中科大基础科学/量子/物理/化学/生命科学研究成果配图
strategy_hint: 列表页news.ustc.edu.cn；每篇1-2张图
```

## H6. 浙江大学（URL需更新）

# I. 科学媒体与科普

## I1. 知识分子

```yaml
name: 知识分子
url: https://www.zhishifenzi.com/
source_type: science_media
recommended_page_type: specific_article_page
visual_value: 中国顶级科学媒体、饶毅/鲁白/谢宇创办、深度科研报道、学科覆盖全、文章配图质量高
strategy_hint: 文章多为微信公众号转码；主图通常来自科研论文或机构；结构适合通用抓取
```

## I2. 科普中国

```yaml
name: 科普中国
url: https://www.kepuchina.cn/
source_type: science_communication_platform
recommended_page_type: specific_article_page
visual_value: 中国科协主办官方科普平台、前沿科技/应急科普/天文地理/健康/军事/科教等丰富专题、图解和科普图片
strategy_hint: 内容类型多样，需筛选与科研视觉相关的文章（前沿科技/天文地理频道优先）；不适合泛抓
```

## I3. 果壳

```yaml
name: 果壳网
url: https://www.guokr.com/
source_type: science_communication_platform
recommended_page_type: specific_article_page
visual_value: 中国最大科普社区、科学传播和科技生活内容、图解、信息图、数据可视化
strategy_hint: 结合科研类文章频道；HTML结构适配电爬；图片以科普信息图为主
```

# J. 中国主办高影响期刊

## J1. Cell Research ✅ 已采集

```yaml
name: Cell Research
url: https://www.nature.com/cr/
source_type: academic_journal
crawl_tier: S
crawl_status: active_pw
collected_cases: 30
collection_date: 2026-05-29
visual_value: 中国最高IF期刊、生命科学分子机制图、论文封面、显微图
strategy_hint: RSS: nature.com/cr.rss；需Playwright渲染（有此反爬墙）；每篇4-5张图
```

## J2. Light: Science & Applications ✅ 已采集

```yaml
name: Light: Science & Applications
url: https://www.nature.com/lsa/
source_type: academic_journal
crawl_tier: S
crawl_status: active_pw
collected_cases: 62
collection_date: 2026-05-29
visual_value: 中科院长春光机所主办、光学顶刊、高质量光学设计图和实验结果图
strategy_hint: RSS: nature.com/lsa.rss；Playwright渲染；每篇8-10张图（图片密度最高来源）
```

## J3. National Science Review (NSR)

```yaml
name: National Science Review
url: https://academic.oup.com/nsr
source_type: academic_journal
recommended_page_type: article_or_cover_page
visual_value: 中国科学院主办综合性英文学术期刊、封面设计出色、地学/物理/化学/材料/生命科学机制图
strategy_hint: Oxford Academic 平台托管；优先收集封面和亮点文章配图
```

## J3. Science Bulletin

```yaml
name: Science Bulletin
url: https://www.sciencedirect.com/journal/science-bulletin
source_type: academic_journal
recommended_page_type: article_page
visual_value: 中科院和国家自然科学基金委主管的综合性期刊、工程/材料/化学/物理/医学等学科配图
strategy_hint: ScienceDirect 平台；文章页图片质量高但可能有付费墙
```

# K. 国家重点机构

## K1. 国家自然科学基金委员会

```yaml
name: 国家自然科学基金委
url: https://www.nsfc.gov.cn/publish/portal0/tab434/
source_type: government_science_agency
recommended_page_type: specific_article_page
visual_value: 基金资助成果展示、各学科科研成果新闻、项目照片和实验图
strategy_hint: 需注意反爬策略；建议走成果展示和资助成果页面；优先抓取图文报道
```

## K2. 中国工程院

```yaml
name: 中国工程院
url: https://www.cae.cn/cae/html/main/col84/column_84_1.html
source_type: national_academy_news
recommended_page_type: specific_article_page
visual_value: 工程科技成果新闻、工程项目现场照片、工程设备图、科研团队照片
strategy_hint: 静态HTML结构；工程视觉案例重要来源
```

# L. 国际非 Nature 补缺专项

本组来源用于定向补足医学、工程、环境科学三个弱学科。采集原则是少量、权威、多样，单一来源控制在约 15-30 条，优先补实验过程、实验设备、空间环境、科研人员、医学影像、公共卫生现场、工程原型、测试平台、遥感图、野外采样、气候/生态监测等薄弱内容类型。

## L1. 医学与公共卫生

```yaml
name: NIH Photo Galleries
url: https://www.nih.gov/about-nih/nih-almanac/photo-galleries
source_type: official_photo_gallery_index
recommended_page_type: gallery_or_flickr_album_page
crawl_tier: S
crawl_status: dry_run_required
target_discipline: 医学
target_new_cases: 15-25
visual_value: NIH 官方图库入口，覆盖 NIH 各研究所图片、园区、历史科研人员和医学研究场景
strategy_hint: 入口页主要指向 Flickr 相册；先 dry-run 外链和相册可访问性，再少量人工/接口补入
```

```yaml
name: NIGMS Image and Video Gallery
url: https://www.nigms.nih.gov/image-gallery/list?page=0
source_type: official_science_image_gallery
recommended_page_type: media_detail_page
crawl_tier: S
crawl_status: active_static
target_discipline: 医学
target_new_cases: 25-30
visual_value: NIH/NIGMS 官方科学图片与视频库，包含细胞、结构生物学、疾病机制、工具与技术
strategy_hint: 列表页可分页；优先抓 View Media 详情页，控制主题分布，避免只收显微图
```

```yaml
name: NCI Visuals Online
url: https://visualsonline.cancer.gov/
source_type: official_science_image_gallery
recommended_page_type: search_result_or_media_detail_page
crawl_tier: A
crawl_status: dry_run_required
target_discipline: 医学
target_new_cases: 20-25
visual_value: 美国国家癌症研究所官方视觉库，适合补癌症研究、医学插画、临床与基础医学视觉
strategy_hint: 先测试搜索页和详情页结构；必要时改为人工精选 URL 后入库
```

```yaml
name: CDC Public Health Image Library
url: https://wwwn.cdc.gov/phil/
source_type: official_public_health_image_library
recommended_page_type: search_result_or_media_detail_page
crawl_tier: A
crawl_status: dry_run_required
target_discipline: 医学
target_new_cases: 15-20
visual_value: CDC 官方公共卫生图库，覆盖病原体、电镜、实验室、公共卫生现场和防控传播
strategy_hint: 只收科研与公共卫生视觉价值高的条目，避开过度敏感、过度临床或展示风险较高的图片
```

## L2. 工程与能源技术

```yaml
name: DOE R&D Image Gallery
url: https://www.energy.gov/eere/water/photos/rd-image-gallery
source_type: official_image_gallery
recommended_page_type: gallery_page
crawl_tier: S
crawl_status: active_static
target_discipline: 工程
target_new_cases: 20-25
visual_value: DOE 官方研发图库，包含海洋能源、水能、工程测试、设备部署、实验平台和现场操作
strategy_hint: 当前页直接含图片与 caption；优先补实验过程、工程原型、测试平台、野外工程现场
```

```yaml
name: DOE CMEI Photographs
url: https://www.energy.gov/eere/cmei-photographs
source_type: official_photo_gallery_index
recommended_page_type: gallery_or_lab_album_page
crawl_tier: A
crawl_status: dry_run_required
target_discipline: 工程
target_new_cases: 15-20
visual_value: DOE Critical Materials and Energy Innovation 图片入口，链接多个国家实验室与能源技术图库
strategy_hint: 先 dry-run 外链和具体图库；优先 Argonne、Berkeley Lab、NREL、ORNL、PNNL、Sandia 等权威实验室
```

```yaml
name: NREL SWS Image Gallery
url: https://sws.nrel.gov/image-search
source_type: official_image_gallery
recommended_page_type: search_result_or_image_detail_page
crawl_tier: A
crawl_status: dry_run_required
target_discipline: 工程
target_new_cases: 20-25
visual_value: NREL 相关标准工作图库，适合补建筑能源、设备安装、工程现场和应用技术图像
strategy_hint: 先测试搜索页分页和图片详情；只采集科研/工程视觉价值高的条目
```

```yaml
name: Stanford Engineering News
url: https://engineering.stanford.edu/magazine
source_type: university_department_news
recommended_page_type: specific_article_page
crawl_tier: B
crawl_status: manual_or_static
target_discipline: 工程
target_new_cases: 10-15
visual_value: 国际顶尖工程学院新闻，适合少量补芯片、机器人、材料、能源、AI 工程研究图像
strategy_hint: 不作为自动主力；优先人工选择高价值文章 URL 后小批量入库
```

## L3. 环境、气候与地球观测

```yaml
name: NOAA PMEL Climate-Weather Research Photos
url: https://www.pmel.noaa.gov/gallery/climate-weather-research-photos
source_type: official_photo_collection
recommended_page_type: gallery_page
crawl_tier: S
crawl_status: active_static
target_discipline: 环境科学
target_new_cases: 25-30
visual_value: NOAA PMEL 官方气候与海洋研究图库，包含浮标、船载采样、滑翔机、无人平台和气候观测现场
strategy_hint: 当前页含图片和文件链接；优先补野外采样、气候监测设备、空间环境、科研人员/团队现场
```

```yaml
name: NASA Earth Observatory
url: https://science.nasa.gov/earth/earth-observatory/
source_type: official_media_collection
recommended_page_type: image_or_article_page
crawl_tier: S
crawl_status: dry_run_required
target_discipline: 环境科学
target_new_cases: 25-30
visual_value: NASA Earth Observatory 官方地球观测入口，适合补遥感、气候、极端天气、地表变化和环境数据视觉
strategy_hint: 优先从 Image of the Day、Topics、Earth Observatory 文章页收集；避免与已有 NASA 宇航图重复
```

```yaml
name: USGS Landsat Multimedia
url: https://www.usgs.gov/landsat-missions/multimedia
source_type: official_media_collection
recommended_page_type: image_or_multimedia_detail_page
crawl_tier: A
crawl_status: dry_run_required
target_discipline: 环境科学
target_new_cases: 20-25
visual_value: USGS Landsat 官方多媒体，覆盖土地变化、遥感图像、环境监测和地球观测传播图
strategy_hint: 先 dry-run 列表页与详情页；优先遥感图、变化对比、观测任务和数据可视化
```

```yaml
name: NOAA Digital Collections Photo Library
url: https://www.noaa.gov/digital-collections/photo-library
source_type: official_photo_collection
recommended_page_type: gallery_or_collection_page
crawl_tier: B
crawl_status: needs_adapter_tuning
target_discipline: 环境科学
target_new_cases: 15-20
visual_value: NOAA 官方图片库入口，覆盖海洋、气候、气象、生态、历史科学观测和野外工作
strategy_hint: 主站可能出现 403 或跳转；若 dry-run 不稳定，改用 PMEL、专题图库或人工精选 URL
```
# M. 对标科技企业

> 适配日期：2026-06-02
> 适配器：`sci-viz-case-hub/server/src/crawler/staticSourceAdapters.ts` 中企业 benchmark sources
> 种子数据：`sci-viz-case-hub/server/src/crawler/enterpriseSources.ts`
> 运营说明：`sci-viz-case-hub/docs/C1_ENTERPRISE_BENCHMARK_SYSTEM.md`
> Dry-run 基线：`sci-viz-case-hub/docs/C1_ENTERPRISE_DRY_RUN_2026-06-02.md`
> 运营命令：`npm run db:seed:enterprise-sources` / `npm run enterprise:dry-run`
> 筛选口径：围绕 11 个学院/学科方向，每个方向沉淀 2-3 家头部企业；当前正式池以 `ENTERPRISE_SOURCES` 为准，为 32 条启用企业来源，其中 10 家通过 dry-run/active-batch 链接质量检查保留为 active_static。

## M1. 船舶海洋与建筑工程学院

```yaml
- name: Kongsberg Maritime
  url: https://www.kongsbergmaritime.com/products/
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: active_static
  adapter_type: static_html
  visual_value: 船舶海洋装备、自动化船桥、声呐、海洋工程系统和海试场景图
  strategy_hint: 优先抓 products 入口；已验证可静态发现 bridge systems、propulsion、simulation 等产品页并入库

- name: Arup Projects
  url: https://www.arup.com/projects/all-projects/
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: manual
  adapter_type: browser_render
  visual_value: 建筑工程、基础设施、桥梁、城市韧性和工程项目案例图
  strategy_hint: 静态 fetch 返回 500；使用 enterprise:browser-batch 渲染 projects 列表可入库项目图

- name: Autodesk Construction Blog
  url: https://www.autodesk.com/blogs/construction/
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: needs_adapter_tuning
  adapter_type: static_html
  visual_value: 建筑工程数字化、BIM、施工管理、工程项目案例和软件工作流配图
  strategy_hint: 优先抓 construction blog；重点保留项目案例、工程流程和数字化建造图
```

## M2. 机械与动力工程学院

```yaml
- name: Siemens Energy
  url: https://www.siemens-energy.com/global/en/home/press-releases.html
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: active_static
  adapter_type: static_html
  visual_value: 燃机、氢能、储能、电网设备、能源系统工程图和工厂场景
  strategy_hint: 静态发现当前为 0 链接；需改 stories/solutions 入口或 browser_render

- name: Rolls-Royce
  url: https://www.rolls-royce.com/media/press-releases.aspx
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: needs_adapter_tuning
  adapter_type: static_html
  visual_value: 航空发动机、船舶动力、核动力、小型模块堆和工程制造场景图
  strategy_hint: 优先抓 press releases；创新和产品服务页面作为补充入口

- name: Caterpillar News
  url: https://www.cat.com/en_US/news/machine-press-releases.html
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: active_static
  adapter_type: static_html
  visual_value: 工程机械、动力系统、矿山设备、施工装备和自动化作业场景图
  strategy_hint: 优先抓 machine press releases；单篇常含产品主图和高分辨率下载入口
```

## M3. 电子信息与电气工程学院

```yaml
- name: Huawei News
  url: https://www.huawei.com/en/news
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: needs_adapter_tuning
  adapter_type: static_html
  visual_value: 通信设备、网络基础设施、终端产品、ICT 技术图和研发场景
  strategy_hint: news 列表静态抓取不足；可用人工提供的 consumer wearable / 产品营销页作为受控 URL 清单补充

- name: Qualcomm OnQ
  url: https://www.qualcomm.com/news/onq
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: needs_adapter_tuning
  adapter_type: static_html
  visual_value: 移动通信、射频、芯片平台、AI 终端和无线技术解释图
  strategy_hint: OnQ 列表静态发现不足；可用 AI research / Snapdragon 产品详情页做受控 URL 清单入库

- name: NVIDIA Technical Blog
  url: https://developer.nvidia.com/blog
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: active_static
  adapter_type: static_html
  visual_value: GPU、AI 计算、通信加速、仿真、数据中心和技术架构图
  strategy_hint: 优先抓 developer technical blog；保留模型图、架构图、性能图和硬件平台图
```

## M4. 电气工程学院

```yaml
- name: ABB News
  url: https://new.abb.com/news
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: needs_adapter_tuning
  adapter_type: static_html
  visual_value: 电气化、变频器、机器人、工业自动化、电网和工厂场景图
  strategy_hint: 优先抓 news；按 electrification / robotics 主题页细分二阶段优化

- name: Schneider Electric Newsroom
  url: https://www.se.com/us/en/about-us/newsroom/news/
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: needs_adapter_tuning
  adapter_type: static_html
  visual_value: 配电、能效管理、楼宇电气、数据中心基础设施和工业能源图
  strategy_hint: 优先抓 newsroom press releases；已通过真实小批量采集，继续保留工程设备、电气基础设施和楼宇系统图

- name: Eaton News Releases
  url: https://www.eaton.com/us/en-us/company/news-insights/news-releases.html
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: active_static
  adapter_type: static_html
  visual_value: 配电、储能、数据中心电气、工业电气设备和能源管理场景图
  strategy_hint: 优先抓 news releases；保留电气设备、能源基础设施和应用案例图
```

## M5. 自动化与感知学院

```yaml
- name: Boston Dynamics Blog
  url: https://bostondynamics.com/blog/
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: active_static
  adapter_type: static_html
  visual_value: 机器人实物、移动感知、控制系统、产品演示和视频封面图
  strategy_hint: 优先抓 blog；视频页面仅取 poster/og:image，不抓视频本体

- name: FANUC America News
  url: https://www.fanucamerica.com/news-resources/news
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: needs_adapter_tuning
  adapter_type: static_html
  visual_value: 工业机器人、自动化产线、机床控制、工厂应用案例图
  strategy_hint: 优先抓 news-resources/news；若列表分页动态化则标注 browser_render
```

## M6. 计算机学院（网络空间安全学院、密码学院）

```yaml
- name: Google Research Blog
  url: https://research.google/blog/
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: active_static
  adapter_type: static_html
  visual_value: AI 研究图、模型示意、数据可视化、交互系统和计算机视觉案例
  strategy_hint: 优先抓 research blog；保留论文图、模型图和产品研究示意

- name: Microsoft Research Blog
  url: https://www.microsoft.com/en-us/research/blog/
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: active_static
  adapter_type: static_html
  visual_value: AI、系统、HCI、安全、量子计算研究图和技术博客配图
  strategy_hint: 优先抓 research blog；项目页作为二阶段补充入口
```

## M7. 集成电路学院（信息与电子工程学院）

```yaml
- name: ASML News
  url: https://www.asml.com/en/news
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: needs_adapter_tuning
  adapter_type: static_html
  visual_value: 光刻机、洁净室、半导体制造设备、技术解释图和工业摄影
  strategy_hint: 优先抓 news；technology 页面作为二阶段补充

- name: TSMC Newsroom
  url: https://pr.tsmc.com/english/news
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: blocked_cloudflare
  adapter_type: manual
  visual_value: 晶圆厂、先进制程、封装、半导体制造和研发新闻图
  strategy_hint: 优先抓 PR newsroom；若静态列表不足，后续改 browser_render

- name: Arm Newsroom
  url: https://newsroom.arm.com/
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: active_static
  adapter_type: static_html
  visual_value: 芯片 IP、AI 计算、边缘处理器、半导体生态和技术博客配图
  strategy_hint: 优先抓 newsroom news/blog；保留芯片架构、AI 计算和开发者生态图
```

## M8. 材料科学与工程学院

```yaml
- name: BASF News
  url: https://www.basf.com/global/en/media/news-releases
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: needs_adapter_tuning
  adapter_type: static_html
  visual_value: 化工材料、实验室、工厂、分子材料和应用产品图
  strategy_hint: 优先抓 news releases；research press 图文适合作为材料视觉案例

- name: Corning News
  url: https://www.corning.com/worldwide/en/about-us/news-events/news-releases.html
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: needs_adapter_tuning
  adapter_type: static_html
  visual_value: 玻璃、陶瓷、光纤、先进材料、实验制造和产品微观结构图
  strategy_hint: 优先抓 news releases；innovation 页面作为二阶段补充

- name: Dow Press Releases
  url: https://corporate.dow.com/en-us/news/press-releases.html
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: blocked_cloudflare
  adapter_type: manual
  visual_value: 材料科学、低碳材料、包装材料、热管理材料、实验室和应用场景图
  strategy_hint: 官网静态入口真实采集会落到 HTTP 403 或品牌页；不绕过，后续改用人工采集或替代材料企业入口
```

## M9. 环境科学与工程学院

```yaml
- name: Xylem Newsroom
  url: https://www.xylem.com/en-us/about-xylem/newsroom/press-releases/
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: active_static
  adapter_type: static_html
  visual_value: 水处理、水资源监测、泵站、传感器和环境工程案例图
  strategy_hint: 优先抓 applications / watermark 等可静态入库页面；press releases 作为二阶段入口继续调优

- name: Veolia Newsroom
  url: https://www.veolia.com/en/newsroom/news
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: active_static
  adapter_type: static_html
  visual_value: 水处理、废弃物资源化、环境服务、资源循环、低碳基础设施和工程案例图
  strategy_hint: 已通过 dry-run；active-batch 过滤年报、ESG评级、奖项和赞助新闻，优先保留环境工程与供热/水务等工程项目图

- name: Orsted News
  url: https://orsted.com/en/media-centre/news
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: blocked_cloudflare
  adapter_type: manual
  visual_value: 海上风电、可再生能源、低碳基础设施和能源工程场景图
  strategy_hint: 优先抓 media-centre/news；注意筛掉投资者关系纯文本新闻
```

环境方向调优记录：Arcadis News、WSP Insights、SUEZ Press Releases、Vestas News、Pentair News Releases、Ecolab Newsroom、Jacobs Newsroom、Tetra Tech News、WM Newsroom、Climeworks Newsroom 均已做小批量尝试，但当前静态抓取存在 0 链接、fetch failed、403 或 active-batch URL 质量不足问题，不进入正式 seed 来源池；后续可作为替代候选重测。

## M10. 生物医学工程学院

```yaml
- name: Siemens Healthineers
  url: https://www.siemens-healthineers.com/medical-imaging
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: active_static
  adapter_type: static_html
  visual_value: 医学影像设备、诊断系统、医院场景、AI 医疗和设备渲染图
  strategy_hint: 优先抓 medical-imaging 入口；可静态发现 CT、MRI、超声和数字医疗产品页

- name: GE HealthCare Press Releases
  url: https://www.gehealthcare.com/en-us/about/newsroom/press-releases
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: needs_adapter_tuning
  adapter_type: static_html
  visual_value: 医学影像设备、AI 医疗、核医学、MR/CT/超声系统、临床研究和医院场景图
  strategy_hint: dry-run 可提图，但 active-batch 静态发现不足；后续需改用 browser_render 或更细新闻 API

- name: Boston Scientific Newsroom
  url: https://news.bostonscientific.com/
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: active_static
  adapter_type: static_html
  visual_value: 介入医疗器械、植入设备、临床应用、产品细节和医疗技术新闻图
  strategy_hint: 已通过 2 页 dry-run；active-batch 过滤回购、投资、财报和栏目页，真实采集必须人工复核
```

## M11. 航空航天学院

```yaml
- name: Airbus Newsroom
  url: https://www.airbus.com/en/newsroom
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: active_static
  adapter_type: static_html
  visual_value: 飞机、直升机、卫星、航天系统、飞行测试和工业制造图
  strategy_hint: 优先抓 newsroom；innovation 页面作为二阶段补充

- name: Boeing Newsroom
  url: https://boeing.mediaroom.com/news-releases-statements
  source_type: enterprise
  category: ENT
  crawl_tier: B
  crawl_status: needs_adapter_tuning
  adapter_type: static_html
  visual_value: 飞机、航天器、防务系统、制造装配、飞行测试和工程新闻图
  strategy_hint: 优先抓 mediaroom releases；产品图库和视频页不纳入第一轮
```
