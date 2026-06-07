import fs from 'node:fs/promises';
import path from 'node:path';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const root = process.env.SCI_VIZ_ROOT || path.resolve(process.cwd(), '..');
const docsDir = path.join(root, 'docs');
const outputDir = path.join(root, 'docs');
const today = new Date().toISOString().slice(0, 10);

const statsReport = await fs.readFile(path.join(docsDir, `sampling-statistical-analysis-${today}.md`), 'utf8');
const weightsCsv = await fs.readFile(path.join(docsDir, `sampling-domain-weights-${today}.csv`), 'utf8');
const axisCsv = await fs.readFile(path.join(docsDir, `sampling-axis-distributions-${today}.csv`), 'utf8');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function markdownTable(title, headers) {
  const lines = statsReport.split('\n');
  const idx = lines.findIndex(line => line.trim() === title);
  if (idx < 0) return [headers];
  const rows = [headers];
  for (let i = idx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('## ') && i > idx + 1) break;
    if (!line.startsWith('|') || line.includes('---')) continue;
    const cells = line.slice(1, -1).split('|').map(cell => cell.trim());
    if (cells.join('|') === headers.join('|')) continue;
    rows.push(cells);
  }
  return rows;
}

function writeMatrix(sheet, startRow, startCol, matrix) {
  const colLetter = String.fromCharCode('A'.charCodeAt(0) + startCol - 1);
  const block = sheet.getRange(`${colLetter}${startRow}`).write(matrix);
  block.format.autofitColumns();
  block.format.wrapText = true;
}

const workbook = Workbook.create();
const dashboard = workbook.worksheets.add('Dashboard');
const concentration = workbook.worksheets.add('Concentration');
const effects = workbook.worksheets.add('Effect Sizes');
const drift = workbook.worksheets.add('Distribution Drift');
const replenishment = workbook.worksheets.add('Replenishment');
const weights = workbook.worksheets.add('Domain Weights');
const axis = workbook.worksheets.add('Axis Distributions');

writeMatrix(dashboard, 1, 1, [
  ['Sampling Rigor Statistical Pack', today],
  ['Approved cases', '3898'],
  ['Minimum balanced sample', '25 domains x 23 = 575 cases'],
  ['Standard balanced sample', '20 domains x 30 = 600 cases'],
  ['Main decision', 'Use standard-balanced for formal comparison; retain full pool as context.'],
  ['Highest bias risk', 'International group is Nature-dominated: HHI 0.668, effective source count 1.5.'],
  ['Enterprise status', 'Broad coverage but thin per source; treat as strategy examples until core domains reach 20-30 approved cases.'],
]);

writeMatrix(concentration, 1, 1, markdownTable('## 来源集中度', ['来源组', 'approved', '域名数', '最大来源', 'HHI', '有效来源数', '均匀度']));
writeMatrix(effects, 1, 1, markdownTable('## 组间差异效应量', ['分类轴', '全库N', '全库V', '均衡N', '均衡V', '解释']));
writeMatrix(drift, 1, 1, markdownTable('## 全库与均衡样本分布偏移', ['分类轴', 'minimum TVD', 'standard TVD', '全库前三', 'standard前三']));
writeMatrix(replenishment, 1, 1, markdownTable('## 补采优先级', ['来源组', 'sourceDomain', 'approved', '状态', '补到20', '补到30', '补到50']));
writeMatrix(weights, 1, 1, parseCsv(weightsCsv));
writeMatrix(axis, 1, 1, parseCsv(axisCsv));

await fs.mkdir(outputDir, { recursive: true });
const out = await SpreadsheetFile.exportXlsx(workbook);
await out.save(path.join(outputDir, `sampling-statistical-pack-${today}.xlsx`));
console.log(path.join(outputDir, `sampling-statistical-pack-${today}.xlsx`));
