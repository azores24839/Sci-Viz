import { discoverLinks } from './discoverLinks.js';
import { extractImagesFromPage } from './extractImagesFromPage.js';
import { ENTERPRISE_SOURCES } from './enterpriseSources.js';

interface EnterpriseDryRunResult {
  discipline: string;
  name: string;
  url: string;
  configuredStatus: string;
  adapterType: string;
  discoveredLinks: number;
  sampledPages: number;
  imageCandidates: number;
  likelyLogoIcons: number;
  suggestedStatus: string;
  error: string;
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

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) throw new Error(`Not HTML: ${contentType}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function likelyLogoIconCount(images: Array<{ src: string; alt: string; width: number | null; height: number | null }>): number {
  return images.filter((img) => {
    const haystack = `${img.src} ${img.alt}`.toLowerCase();
    if (/(logo|icon|sprite|favicon|social|share|avatar)/.test(haystack)) return true;
    if (img.width !== null && img.height !== null && (img.width < 160 || img.height < 120)) return true;
    return false;
  }).length;
}

function suggestStatus(result: EnterpriseDryRunResult): string {
  if (/HTTP 403|cloudflare/i.test(result.error)) return 'blocked_cloudflare';
  if (result.configuredStatus === 'manual' || result.adapterType === 'manual') return result.configuredStatus;
  if (result.discoveredLinks === 0 || result.sampledPages === 0) return 'needs_adapter_tuning';
  if (result.imageCandidates === 0) return 'needs_adapter_tuning';
  const logoRatio = result.imageCandidates > 0 ? result.likelyLogoIcons / result.imageCandidates : 0;
  if (logoRatio > 0.5) return 'needs_adapter_tuning';
  return 'active_static';
}

async function dryRunSource(source: (typeof ENTERPRISE_SOURCES)[number], maxLinks: number, samplePages: number): Promise<EnterpriseDryRunResult> {
  const result: EnterpriseDryRunResult = {
    discipline: source.discipline,
    name: source.name,
    url: source.url,
    configuredStatus: source.crawlStatus,
    adapterType: source.adapterType,
    discoveredLinks: 0,
    sampledPages: 0,
    imageCandidates: 0,
    likelyLogoIcons: 0,
    suggestedStatus: source.crawlStatus,
    error: '',
  };

  try {
    const links = await discoverLinks(source.url, maxLinks, 1);
    result.discoveredLinks = links.length;

    for (const link of links.slice(0, samplePages)) {
      try {
        const html = await fetchHtml(link.url);
        const page = await extractImagesFromPage(link.url, html);
        result.sampledPages++;
        result.imageCandidates += page.images.length;
        result.likelyLogoIcons += likelyLogoIconCount(page.images);
      } catch (err) {
        if (!result.error) result.error = `sample failed: ${(err as Error).message}`;
      }
    }
  } catch (err) {
    result.error = (err as Error).message;
  }

  result.suggestedStatus = suggestStatus(result);
  return result;
}

function printSummary(results: EnterpriseDryRunResult[]) {
  const byStatus = results.reduce<Record<string, number>>((acc, result) => {
    acc[result.suggestedStatus] = (acc[result.suggestedStatus] || 0) + 1;
    return acc;
  }, {});

  console.log('\nSummary');
  console.log(JSON.stringify(byStatus, null, 2));

  const disciplines = new Map<string, EnterpriseDryRunResult[]>();
  for (const result of results) {
    disciplines.set(result.discipline, [...(disciplines.get(result.discipline) || []), result]);
  }

  console.log('\nDiscipline coverage');
  for (const [discipline, items] of disciplines) {
    const activeCount = items.filter(item => item.suggestedStatus === 'active_static').length;
    console.log(`${discipline}: ${activeCount}/${items.length} active_static`);
  }
}

async function main() {
  const maxLinks = getNumberArg('max-links', 5);
  const samplePages = getNumberArg('sample-pages', 2);
  const jsonOnly = process.argv.includes('--json');
  const only = getStringArg('only');
  const results: EnterpriseDryRunResult[] = [];

  for (const source of ENTERPRISE_SOURCES.filter(source => matchesOnly(source.name, only))) {
    const result = await dryRunSource(source, maxLinks, samplePages);
    results.push(result);
    console.log(JSON.stringify(result));
  }

  if (!jsonOnly) printSummary(results);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
