import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

function parseYamlBlock(block: string): Record<string, string> | null {
  const result: Record<string, string> = {};
  const lines = block.split('\n');
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.*)/);
    if (match) {
      result[match[1]] = match[2].trim().replace(/^"|"$/g, '');
    }
  }
  if (!result.name || !result.url) return null;
  return result;
}

async function seedPool() {
  const filePath = path.resolve(__dirname, '..', '..', '..', 'CRAWL_SOURCE_TARGETS.md');

  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    console.log('Skipping pool seed.');
    return;
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  const yamlRegex = /```yaml\n([\s\S]*?)```/g;
  let currentCategory = '';

  const entries: Array<{
    name: string;
    url: string;
    category: string;
    sourceType: string;
    visualValue: string;
    strategyHint: string;
    notes: string;
  }> = [];

  for (const match of content.matchAll(yamlRegex)) {
    const pos = match.index || 0;
    const before = content.substring(0, pos);
    const beforeLines = before.split('\n');
    for (let i = beforeLines.length - 1; i >= 0; i--) {
      const secMatch = beforeLines[i].match(/^# ([A-F])\./);
      if (secMatch) {
        currentCategory = secMatch[1];
        break;
      }
    }

    const fields = parseYamlBlock(match[1]);
    if (!fields) continue;

    entries.push({
      name: fields.name || '',
      url: fields.url || '',
      category: currentCategory,
      sourceType: fields.source_type || '',
      visualValue: fields.visual_value || '',
      strategyHint: fields.strategy_hint || '',
      notes: fields.recommended_page_type
        ? `recommended_page_type: ${fields.recommended_page_type}`
        : '',
    });
  }

  console.log(`Parsed ${entries.length} source entries from CRAWL_SOURCE_TARGETS.md`);

  const existing = await prisma.crawlSource.count();
  if (existing > 0) {
    console.log(`Found ${existing} existing sources. Skipping seed.`);
    return;
  }

  for (const entry of entries) {
    await prisma.crawlSource.create({ data: entry });
  }

  console.log(`Seeded ${entries.length} crawl sources`);
}

seedPool()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
