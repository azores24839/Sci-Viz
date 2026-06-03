import { discoverLinks } from './discoverLinks.js';
import { ENTERPRISE_SOURCES, getActiveStaticEnterpriseSources } from './enterpriseSources.js';
import { processSingleUrl, type CrawlPageResult } from './runUrlCrawl.js';

interface EnterpriseBatchSourceResult {
  discipline: string;
  name: string;
  url: string;
  mode: 'dry-run' | 'execute';
  discoveredLinks: number;
  selectedLinks: string[];
  processedPages: number;
  createdCases: number;
  candidateImages: number;
  filteredImages: number;
  failedPages: number;
  errors: string[];
}

function getNumberArg(name: string, fallback: number): number {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const parsed = parseInt(raw.split('=')[1] || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getStringArg(name: string): string | null {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return raw ? raw.split('=').slice(1).join('=') : null;
}

function matchesOnly(sourceName: string, only: string | null): boolean {
  if (!only) return true;
  const wanted = only.split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
  if (wanted.length === 0) return true;
  return wanted.some(item => sourceName.toLowerCase().includes(item));
}

function getStatusesArg(): string[] | null {
  const raw = getStringArg('statuses');
  if (!raw) return null;
  const statuses = raw.split(',').map(item => item.trim()).filter(Boolean);
  return statuses.length > 0 ? statuses : null;
}

function summarizePage(result: CrawlPageResult): string[] {
  const lines = [
    `${result.url} -> ${result.status}`,
    `title=${result.pageTitle || '(none)'}`,
    `candidates=${result.candidateImageCount}`,
    `filtered=${result.filteredImageCount}`,
    `created=${result.createdCaseCount}`,
  ];
  if (result.errors.length) {
    lines.push(`errors=${result.errors.slice(0, 3).join(' | ')}`);
  }
  return lines;
}

const LOW_VALUE_BATCH_URL_PATTERNS = [
  /\/investors?\//i,
  /investor-relations/i,
  /financial/i,
  /earnings/i,
  /quarter/i,
  /dividend/i,
  /share-repurchase/i,
  /strategic-investment/i,
  /press-contacts?/i,
  /media-gallery/i,
  /contact-us/i,
  /media-contacts?/i,
  /email-alerts?/i,
  /careers?/i,
  /inclusion-and-diversity/i,
  /global-citizenship/i,
  /employee-engagement/i,
  /grants-investments/i,
  /awards?/i,
  /pickleball/i,
  /sustainable-sports/i,
  /young-leaders/i,
  /stakeholders-assembly/i,
];

const COMMERCIAL_VALUE_URL_PATTERNS = [
  /case-stud(y|ies)/i,
  /customer-stor(y|ies)/i,
  /success-stor(y|ies)/i,
  /solutions?/i,
  /industr(y|ies)/i,
  /applications?/i,
  /use-cases?/i,
  /products?/i,
  /product-demo/i,
  /technology/i,
  /innovation/i,
  /white-?papers?/i,
  /application-notes?/i,
  /customer/i,
  /markets?/i,
];

const NEWSROOM_VALUE_URL_PATTERNS = [
  /\/news(room)?\//i,
  /press-releases?/i,
  /\/blog\//i,
  /media-centre/i,
  /media-center/i,
];

function isLowValueBatchUrl(url: string): boolean {
  return LOW_VALUE_BATCH_URL_PATTERNS.some(pattern => pattern.test(url));
}

function scoreEnterpriseBatchUrl(url: string): number {
  let score = 0;
  for (const pattern of COMMERCIAL_VALUE_URL_PATTERNS) {
    if (pattern.test(url)) score += 20;
  }
  for (const pattern of NEWSROOM_VALUE_URL_PATTERNS) {
    if (pattern.test(url)) score -= 8;
  }
  if (/research|technical|developer/i.test(url)) score += 4;
  if (/investor|financial|earnings|careers|contact/i.test(url)) score -= 50;
  return score;
}

async function runSource(
  source: ReturnType<typeof getActiveStaticEnterpriseSources>[number],
  options: { execute: boolean; maxLinks: number; maxPages: number },
): Promise<EnterpriseBatchSourceResult> {
  const mode = options.execute ? 'execute' : 'dry-run';
  const result: EnterpriseBatchSourceResult = {
    discipline: source.discipline,
    name: source.name,
    url: source.url,
    mode,
    discoveredLinks: 0,
    selectedLinks: [],
    processedPages: 0,
    createdCases: 0,
    candidateImages: 0,
    filteredImages: 0,
    failedPages: 0,
    errors: [],
  };

  try {
    const links = await discoverLinks(source.url, options.maxLinks, options.maxPages);
    result.discoveredLinks = links.length;
    result.selectedLinks = links
      .map(link => link.url)
      .filter(url => !isLowValueBatchUrl(url))
      .sort((a, b) => scoreEnterpriseBatchUrl(b) - scoreEnterpriseBatchUrl(a))
      .slice(0, options.maxLinks);
  } catch (err) {
    result.errors.push(`discovery failed: ${(err as Error).message}`);
    return result;
  }

  if (!options.execute) return result;

  for (const url of result.selectedLinks) {
    try {
      const page = await processSingleUrl(url, source.name, source.sourceType);
      result.processedPages++;
      result.createdCases += page.createdCaseCount;
      result.candidateImages += page.candidateImageCount;
      result.filteredImages += page.filteredImageCount;
      if (page.status !== 'success') result.failedPages++;
      result.errors.push(...summarizePage(page));
    } catch (err) {
      result.failedPages++;
      result.errors.push(`${url} -> failed: ${(err as Error).message}`);
    }
  }

  return result;
}

function printSummary(results: EnterpriseBatchSourceResult[]) {
  const total = results.reduce((acc, result) => ({
    sources: acc.sources + 1,
    discoveredLinks: acc.discoveredLinks + result.discoveredLinks,
    processedPages: acc.processedPages + result.processedPages,
    createdCases: acc.createdCases + result.createdCases,
    candidateImages: acc.candidateImages + result.candidateImages,
    filteredImages: acc.filteredImages + result.filteredImages,
    failedPages: acc.failedPages + result.failedPages,
  }), {
    sources: 0,
    discoveredLinks: 0,
    processedPages: 0,
    createdCases: 0,
    candidateImages: 0,
    filteredImages: 0,
    failedPages: 0,
  });

  console.log('\nSummary');
  console.log(JSON.stringify(total, null, 2));
}

async function main() {
  const execute = process.argv.includes('--execute');
  const maxLinks = getNumberArg('max-links', 3);
  const maxPages = getNumberArg('max-pages', 1);
  const only = getStringArg('only');
  const statuses = getStatusesArg();
  const sourcePool = statuses
    ? ENTERPRISE_SOURCES.filter(source =>
      source.sourceType === 'enterprise'
      && source.category === 'ENT'
      && source.crawlTier === 'B'
      && statuses.includes(source.crawlStatus)
    )
    : getActiveStaticEnterpriseSources();
  const sources = sourcePool.filter(source => matchesOnly(source.name, only));

  if (sources.length === 0) {
    console.error('No active_static enterprise sources matched the requested filter.');
    process.exit(1);
  }

  if (execute) {
    console.warn('Executing real enterprise crawl: this will download images, write VisualCase rows, and run analysis.');
  } else {
    console.warn('Dry-run mode: discovering article URLs only. Pass --execute to ingest pages.');
  }

  const results: EnterpriseBatchSourceResult[] = [];
  for (const source of sources) {
    const result = await runSource(source, { execute, maxLinks, maxPages });
    results.push(result);
    console.log(JSON.stringify(result));
  }

  printSummary(results);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
