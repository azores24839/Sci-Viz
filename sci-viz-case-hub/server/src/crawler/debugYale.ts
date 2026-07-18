import { processSingleUrl } from './runUrlCrawl.js';
import { prisma } from '../prisma.js';

const result = await processSingleUrl(
  'https://news.yale.edu/2026/07/14/major-nsf-award-turbocharge-quantum-tech-innovation-conn',
  'YaleNews',
  'university_news'
);
console.log(JSON.stringify({
  status: result.status,
  candidateImageCount: result.candidateImageCount,
  filteredImageCount: result.filteredImageCount,
  createdCaseCount: result.createdCaseCount,
  errors: result.errors.slice(0, 10)
}, null, 2));
await prisma.$disconnect();
