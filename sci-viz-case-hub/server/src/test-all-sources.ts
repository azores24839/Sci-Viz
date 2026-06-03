import * as cheerio from 'cheerio';
type CheerioRoot = cheerio.CheerioAPI;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const SOURCES = [
  { name: 'MIT News', url: 'https://news.mit.edu/', category: 'A' },
  { name: 'MIT News - Research', url: 'https://news.mit.edu/topic/research', category: 'A' },
  { name: 'Stanford Report', url: 'https://news.stanford.edu/', category: 'A' },
  { name: 'Harvard Gazette', url: 'https://news.harvard.edu/gazette/', category: 'A' },
  { name: 'Berkeley Lab', url: 'https://newscenter.lbl.gov/', category: 'B' },
  { name: 'Max Planck Society', url: 'https://www.mpg.de/en/newsroom', category: 'B' },
  { name: 'NASA Image Library', url: 'https://images.nasa.gov/', category: 'C' },
  { name: 'CERN Photos', url: 'https://cds.cern.ch/collection/Photos?ln=en', category: 'C' },
  { name: 'Nature', url: 'https://www.nature.com/', category: 'D' },
  { name: 'Science', url: 'https://www.science.org/', category: 'D' },
  { name: 'Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/Main_Page', category: 'E' },
  { name: 'ScienceDaily', url: 'https://www.sciencedaily.com/', category: 'E' },
  { name: 'ESA Flickr', url: 'https://www.flickr.com/photos/europeanspaceagency/', category: 'F' },
];

interface TestResult {
  name: string;
  url: string;
  category: string;
  status: 'ok' | 'blocked_cf' | 'blocked_403' | 'blocked_auth' | 'redirect_auth' | 'network_error' | 'not_html' | 'unknown';
  httpStatus: number;
  finalUrl: string;
  contentType: string;
  htmlTitle: string;
  imageCount: number;
  imageUrlsSample: string[];
  errorMessage: string;
  diagnosis: string;
  solution: string;
}

function extractImages($: CheerioRoot, baseUrl: string): { count: number; samples: string[] } {
  const candidates: string[] = [];

  $('img[src]').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('src') || '';
    const dataSrc = $el.attr('data-src') || $el.attr('data-lazy-src') || '';
    const srcset = $el.attr('srcset') || '';

    let bestUrl = src;

    if (srcset) {
      const parts = srcset.split(',').map(s => s.trim());
      let maxW = 0;
      for (const part of parts) {
        const [url, desc] = part.split(/\s+/);
        const w = parseInt(desc?.replace('w', '') || '0');
        if (w > maxW) { maxW = w; bestUrl = url; }
      }
    }

    if (!bestUrl || bestUrl.startsWith('data:')) bestUrl = dataSrc;
    if (!bestUrl || bestUrl.startsWith('data:')) return;

    try {
      const resolved = new URL(bestUrl, baseUrl).href;
      const lower = resolved.toLowerCase();

      const skipPatterns = ['logo', 'icon', 'avatar', 'sprite', 'favicon', 'pixel', 'tracking', '1x1', 'spacer', 'blank', 'svg', '.ico'];
      if (skipPatterns.some(p => lower.includes(p))) return;

      candidates.push(resolved);
    } catch { /* skip invalid URLs */ }
  });

  const deduped = [...new Set(candidates)];
  return {
    count: deduped.length,
    samples: deduped.slice(0, 10),
  };
}

async function testUrl(source: typeof SOURCES[0]): Promise<TestResult> {
  const result: TestResult = {
    name: source.name,
    url: source.url,
    category: source.category,
    status: 'unknown',
    httpStatus: 0,
    finalUrl: '',
    contentType: '',
    htmlTitle: '',
    imageCount: 0,
    imageUrlsSample: [],
    errorMessage: '',
    diagnosis: '',
    solution: '',
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let response: Response;
    try {
      response = await fetch(source.url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': UA },
      });
    } catch (e: any) {
      clearTimeout(timeout);
      result.status = 'network_error';
      result.errorMessage = e.message;
      result.diagnosis = `网络请求失败: ${e.message}`;
      result.solution = '检查DNS/网络连通性，或网站已关闭';
      return result;
    }
    clearTimeout(timeout);

    result.httpStatus = response.status;
    result.contentType = response.headers.get('content-type') || '';
    result.finalUrl = response.url;

    // Check for Cloudflare challenge
    if (response.status === 403) {
      const bodyText = await response.text();
      if (bodyText.includes('_cf_chl_opt') || bodyText.includes('challenges.cloudflare.com') || bodyText.includes('Just a moment')) {
        result.status = 'blocked_cf';
        result.diagnosis = 'Cloudflare Bot Management / Turnstile JS挑战拦截';
        result.solution = '需使用无头浏览器(Puppeteer/Playwright)或已登录的Chrome Extension手动采集';
        return result;
      }
      if (bodyText.toLowerCase().includes('access denied') || bodyText.toLowerCase().includes('request blocked')) {
        result.status = 'blocked_403';
        result.diagnosis = `HTTP 403 禁止访问: ${bodyText.slice(0, 300)}`;
        result.solution = '检查是否需要IP白名单或特殊权限';
        return result;
      }
    }

    // Check for auth redirects
    const redirectUrl = response.url.toLowerCase();
    const AUTH_DOMAINS = ['idp.', 'login.', 'auth.', 'sso.', 'account.', 'signin.', 'cas.', 'oauth.'];
    if (AUTH_DOMAINS.some(d => redirectUrl.includes(d))) {
      result.status = 'redirect_auth';
      result.diagnosis = `重定向到认证页面: ${response.url}`;
      result.solution = '需要校园/机构账号登录，自动爬取不可行';
      return result;
    }

    if (response.status === 401) {
      result.status = 'blocked_auth';
      result.diagnosis = 'HTTP 401 需要认证';
      result.solution = '需要订阅或机构访问权限';
      return result;
    }

    if (!response.ok) {
      result.status = 'unknown';
      result.errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      result.diagnosis = `非2xx响应: ${response.status} ${response.statusText}`;
      result.solution = '检查HTTP状态码含义';
      return result;
    }

    const ct = result.contentType.toLowerCase();
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) {
      result.status = 'not_html';
      result.diagnosis = `非HTML响应: ${result.contentType}`;
      result.solution = 'URL可能是API端点或直接指向资源文件';
      return result;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    result.htmlTitle = $('title').text().trim();

    // Check for paywall/auth wall in HTML
    const bodyText = $('body').text().toLowerCase();
    const AUTH_KEYWORDS = ['sign in to access', 'subscribe to continue', 'please log in', 'you need a subscription', 'institutional access required'];
    if (AUTH_KEYWORDS.some(k => bodyText.includes(k))) {
      result.status = 'blocked_auth';
      result.diagnosis = '页面内容包含付费墙/认证墙';
      result.solution = '需订阅或机构访问';
      return result;
    }

    // Check for Cloudflare in HTML
    if (html.includes('_cf_chl_opt') || $('title').text().includes('Just a moment')) {
      result.status = 'blocked_cf';
      result.diagnosis = 'Cloudflare JS挑战(页面内嵌)';
      result.solution = '需使用无头浏览器';
      return result;
    }

    const images = extractImages($, response.url);
    result.imageCount = images.count;
    result.imageUrlsSample = images.samples;

    if (result.imageCount === 0) {
      result.status = 'ok';
      result.diagnosis = '页面可访问但未提取到图片(可能是SPA动态加载)';
      result.solution = '可能需要JS渲染或API采集';
    } else {
      result.status = 'ok';
      result.diagnosis = `可访问，提取到 ${result.imageCount} 张图片`;
      result.solution = '可直接采集';
    }

    return result;
  } catch (e: any) {
    result.status = 'network_error';
    result.errorMessage = e.message;
    result.diagnosis = `未知错误: ${e.message}`;
    result.solution = '排查网络或代码问题';
    return result;
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('Sci-Viz Case Hub - 全部源URL可采性测试');
  console.log('='.repeat(80));
  console.log('');

  const results: TestResult[] = [];

  for (const source of SOURCES) {
    process.stdout.write(`[测试中] ${source.name} (${source.url}) ... `);
    const result = await testUrl(source);
    results.push(result);

    const icon = result.status === 'ok' ? '✅' : '❌';
    console.log(`${icon} ${result.status} (HTTP ${result.httpStatus})`);

    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('测试汇总');
  console.log('='.repeat(80));
  console.log('');

  const okList = results.filter(r => r.status === 'ok');
  const failList = results.filter(r => r.status !== 'ok');

  console.log(`✅ 采集成功: ${okList.length}/${results.length}`);
  console.log(`❌ 采集失败: ${failList.length}/${results.length}`);
  console.log('');

  if (okList.length > 0) {
    console.log('--- 可采集源 ---');
    for (const r of okList) {
      console.log(`  [${r.category}] ${r.name}`);
      console.log(`    URL: ${r.finalUrl !== r.url ? r.finalUrl + ' ← ' + r.url : r.url}`);
      console.log(`    标题: ${r.htmlTitle || '(无)'}`);
      console.log(`    图片数: ${r.imageCount}`);
      if (r.imageUrlsSample.length > 0) {
        console.log(`    示例图片(${r.imageUrlsSample.length}):`);
        for (const img of r.imageUrlsSample.slice(0, 5)) {
          console.log(`      ${img}`);
        }
      }
      console.log(`    诊断: ${r.diagnosis}`);
      console.log('');
    }
  }

  if (failList.length > 0) {
    console.log('--- 不可采集源 ---');
    for (const r of failList) {
      console.log(`  [${r.category}] ${r.name}`);
      console.log(`    URL: ${r.url}`);
      console.log(`    HTTP状态: ${r.httpStatus}`);
      console.log(`    失败类型: ${r.status}`);
      console.log(`    诊断: ${r.diagnosis}`);
      console.log(`    解决方案: ${r.solution}`);
      if (r.errorMessage) console.log(`    错误: ${r.errorMessage}`);
      console.log('');
    }
  }

  // Print summary table
  console.log('='.repeat(80));
  console.log('解决方案分类汇总');
  console.log('='.repeat(80));
  console.log('');
  console.log('| 源 | 状态 | 失败原因 | 推荐方案 |');
  console.log('|-----|------|----------|----------|');
  for (const r of results) {
    const icon = r.status === 'ok' ? '✅' : '❌';
    console.log(`| ${r.name} | ${icon} ${r.status} | ${r.diagnosis.slice(0, 50)} | ${r.solution.slice(0, 40)} |`);
  }
}

main().catch(console.error);
