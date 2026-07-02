import { saveImageFromUrl, deleteSavedImage } from '../services/image.js';
import { findDuplicateCase } from '../services/dedupe.js';
import { runAnalysis } from '../services/analysisRunner.js';
import { prisma } from '../prisma.js';

const CDN_BASE = 'https://digitalassets.tesla.com/tesla-contents/image/upload';

const TESLA_IMAGES: Array<{ path: string; pageTitle: string; pageUrl: string }> = [
  { path: '/f_auto,q_auto/Homepage-Model-Y-Desktop-Global.png', pageTitle: 'Model Y', pageUrl: 'https://www.tesla.com/modely' },
  { path: '/f_auto,q_auto/Model-Y-Order-Hero-Desktop-Global.png', pageTitle: 'Model Y Design', pageUrl: 'https://www.tesla.com/modely/design' },
  { path: '/f_auto,q_auto/Homepage-Model-3-Desktop-LHD.png', pageTitle: 'Model 3', pageUrl: 'https://www.tesla.com/model3' },
  { path: '/f_auto,q_auto/Model-3-Order-Hero-Desktop-LHD.png', pageTitle: 'Model 3 Design', pageUrl: 'https://www.tesla.com/model3/design' },
  { path: '/f_auto,q_auto/Homepage-Model-S-Desktop-v2.png', pageTitle: 'Model S', pageUrl: 'https://www.tesla.com/models' },
  { path: '/f_auto,q_auto/Homepage-Model-X-Desktop-v2.png', pageTitle: 'Model X', pageUrl: 'https://www.tesla.com/modelx' },
  { path: '/f_auto,q_auto/Homepage-Cybertruck-Desktop-v3.png', pageTitle: 'Cybertruck', pageUrl: 'https://www.tesla.com/cybertruck' },
  { path: '/f_auto,q_auto/Cybertruck-Order-Hero-Desktop.png', pageTitle: 'Cybertruck Design', pageUrl: 'https://www.tesla.com/cybertruck/design' },
  { path: '/f_auto,q_auto/Homepage-Optimus-Desktop.png', pageTitle: 'Optimus Robot', pageUrl: 'https://www.tesla.com/optimus' },
  { path: '/f_auto,q_auto/Homepage-Solar-Panels-Desktop.png', pageTitle: 'Solar Panels', pageUrl: 'https://www.tesla.com/solarpanels' },
  { path: '/f_auto,q_auto/Homepage-Solar-Roof-Desktop-Global.png', pageTitle: 'Solar Roof', pageUrl: 'https://www.tesla.com/solarroof' },
  { path: '/f_auto,q_auto/Homepage-Powerwall-Desktop.png', pageTitle: 'Powerwall', pageUrl: 'https://www.tesla.com/powerwall' },
  { path: '/f_auto,q_auto/Homepage-Megapack-Desktop.png', pageTitle: 'Megapack', pageUrl: 'https://www.tesla.com/megapack' },
  { path: '/f_auto,q_auto/Homepage-Energy-Desktop.png', pageTitle: 'Energy', pageUrl: 'https://www.tesla.com/energy' },
];

const PRODUCT_PAGES = [
  { name: 'Model Y', slug: 'modely' },
  { name: 'Model 3', slug: 'model3' },
  { name: 'Model S', slug: 'models' },
  { name: 'Model X', slug: 'modelx' },
  { name: 'Cybertruck', slug: 'cybertruck' },
  { name: 'Optimus', slug: 'optimus' },
  { name: 'Solar Panels', slug: 'solarpanels' },
  { name: 'Solar Roof', slug: 'solarroof' },
  { name: 'Powerwall', slug: 'powerwall' },
  { name: 'Megapack', slug: 'megapack' },
];

const GALLERY_PATTERNS: Array<{ product: string; paths: string[] }> = [
  { product: 'Model Y', paths: ['/f_auto,q_auto/MY', '/f_auto,q_auto/Model-Y', '/f_auto,q_auto/Model_Y', '/c_scale,w_2880/f_auto,q_auto/Model-Y'] },
  { product: 'Model 3', paths: ['/f_auto,q_auto/M3', '/f_auto,q_auto/Model-3', '/f_auto,q_auto/Model_3', '/c_scale,w_2880/f_auto,q_auto/Model-3'] },
  { product: 'Model S', paths: ['/f_auto,q_auto/MS-', '/f_auto,q_auto/Model-S', '/f_auto,q_auto/Model_S'] },
  { product: 'Model X', paths: ['/f_auto,q_auto/MX-', '/f_auto,q_auto/Model-X', '/f_auto,q_auto/Model_X'] },
  { product: 'Cybertruck', paths: ['/f_auto,q_auto/Cybertruck', '/c_scale,w_2880/f_auto,q_auto/Cybertruck'] },
  { product: 'Optimus', paths: ['/f_auto,q_auto/Optimus'] },
  { product: 'Megapack', paths: ['/f_auto,q_auto/Megapack'] },
  { product: 'Powerwall', paths: ['/f_auto,q_auto/Powerwall'] },
  { product: 'Solar', paths: ['/f_auto,q_auto/Solar', '/f_auto,q_auto/Panels'] },
];

async function tryDownload(url: string, title: string, pageUrl: string): Promise<boolean> {
  try {
    const imageResult = await saveImageFromUrl(url);
    const dupe = await findDuplicateCase(imageResult.imageHash);
    if (dupe) {
      await deleteSavedImage(imageResult.imagePath, imageResult.thumbnailPath);
      return false;
    }
    const isGif = /\.gif/i.test(url);
    await prisma.visualCase.create({
      data: {
        sourceUrl: pageUrl,
        sourceDomain: 'www.tesla.com',
        pageTitle: title,
        imageUrl: url,
        imagePath: imageResult.imagePath,
        thumbnailPath: imageResult.thumbnailPath,
        imageHash: imageResult.imageHash,
        contextText: title,
        captureType: 'crawler',
        userHint: 'Tesla / enterprise_product',
        collectionScore: 60,
        collectionReasons: JSON.stringify(['CDN direct fetch', 'known product image']),
        reviewStatus: 'pending_ai_analysis',
        distributionMedium: isGif ? '动图' : undefined,
      },
    }).then(c => {
      console.log(`  +1 ${title}: ${url.substring(0, 80)}...`);
      runAnalysis(c.id, imageResult.imagePath, title, pageUrl, title).catch(() => {});
    });
    return true;
  } catch (err) {
    console.log(`  skip ${url.substring(0, 60)}... - ${(err as Error).message.substring(0, 40)}`);
    return false;
  }
}

async function main() {
  let created = 0;

  for (const img of TESLA_IMAGES) {
    const url = `${CDN_BASE}${img.path}`;
    if (await tryDownload(url, img.pageTitle, img.pageUrl)) created++;
  }

  for (const [i, fmt] of ['.jpg', '.jpeg', '.png', '.webp'].entries()) {
    for (const pp of PRODUCT_PAGES) {
      for (let n = 1; n <= 5; n++) {
        const url = `${CDN_BASE}/f_auto,q_auto/${pp.name.replace(/\s/g, '-')}-${['Hero', 'Interior', 'Exterior', 'Performance', 'Gallery'][n - 1]}-Desktop${fmt}`;
        if (await tryDownload(url, `${pp.name} ${['Hero', 'Interior', 'Exterior', 'Performance', 'Gallery'][n - 1]}`, `https://www.tesla.com/${pp.slug}`)) created++;
      }
    }
  }

  for (const gp of GALLERY_PATTERNS) {
    for (const prefix of gp.paths) {
      for (let n = 1; n <= 8; n++) {
        const url = `${CDN_BASE}${prefix}-${String(n).padStart(2, '0')}.jpg`;
        if (await tryDownload(url, `${gp.product} Gallery ${n}`, `https://www.tesla.com/${gp.product.toLowerCase().replace(/\s/g, '')}`)) created++;
      }
      for (let n = 1; n <= 8; n++) {
        const url = `${CDN_BASE}${prefix}_${String(n).padStart(2, '0')}.jpg`;
        if (await tryDownload(url, `${gp.product} Gallery ${n}`, `https://www.tesla.com/${gp.product.toLowerCase().replace(/\s/g, '')}`)) created++;
      }
    }
  }

  console.log(`\nCreated: ${created}`);
  const count = await prisma.visualCase.count({ where: { sourceDomain: 'www.tesla.com' } });
  console.log(`Total Tesla cases: ${count}`);
}

main().catch(err => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
