import { chromium } from 'playwright';

async function main() {
  const context = await chromium.launchPersistentContext('/tmp/tesla_chrome_profile', {
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-first-run', '--no-default-browser-check'],
  });

  const page = await context.newPage();
  await page.goto('https://www.tesla.com/modely', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);

  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 300) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 200));
    }
  });
  await page.waitForTimeout(2000);

  const title = await page.title();
  console.log('Title:', title);

  const imgs = await page.$$eval('img', els => els.length);
  console.log('IMG count:', imgs);

  if (imgs > 0) {
    const samples = await page.$$eval('img', els => els.slice(0, 8).map(e => ({
      src: (e as HTMLImageElement).currentSrc || (e as HTMLImageElement).src,
      w: (e as HTMLImageElement).naturalWidth,
      h: (e as HTMLImageElement).naturalHeight,
    })));
    for (const s of samples) console.log(`  ${s.w}x${s.h} ${s.src?.substring(0,120)}`);
  }

  await context.close();
}
main().catch(err => { console.error('ERR:', err.message); process.exit(1); });
