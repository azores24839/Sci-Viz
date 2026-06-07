import { prisma } from '../prisma.js';

async function main() {
  console.log('[markPendingReview] Marking suspicious cases for human review...\n');

  const BATCH_SIZE = 100;
  let marked = 0;

  // Category 1: Meeting/conference/personnel photos → likely low information
  // Functional purpose = 记录 AND (contentSubType contains portrait/team/group keywords)
  const meetingKeywords = ['会议', '合影', '论坛', '考察', '参观', '访问', '签约', '揭牌', '颁奖', '庆典'];
  const personKeywords = ['肖像', '团队', '人物', '合影'];

  const allCases = await prisma.visualCase.findMany({
    select: {
      id: true,
      title: true,
      caseTitle: true,
      contextText: true,
      pageTitle: true,
      contentSubType: true,
      functionalPurpose: true,
      mediaType: true,
      confidence: true,
      collectionScore: true,
      sourceDomain: true,
      manualNotes: true,
    },
  });

  console.log(`Total cases to review: ${allCases.length}\n`);

  const flags: Array<{ id: string; reason: string }> = [];

  for (const c of allCases) {
    const text = [c.title, c.caseTitle, c.contextText, c.pageTitle].filter(Boolean).join(' ');
    const existingNotes = c.manualNotes || '';

    // Skip already marked cases
    if (existingNotes.includes('pending_review:')) continue;

    // Category 1: Possible meeting/conference photos
    if (c.functionalPurpose === '记录' && meetingKeywords.some(kw => text.includes(kw))) {
      if (!text.includes('研究') && !text.includes('实验') && !text.includes('成果')) {
        flags.push({ id: c.id, reason: 'pending_review:可能是会议照片，缺少科研内容' });
        continue;
      }
    }

    // Category 2: Possible personnel photos (portrait/team)
    if (c.functionalPurpose === '记录' && personKeywords.some(kw => (c.contentSubType || '').includes(kw))) {
      flags.push({ id: c.id, reason: 'pending_review:可能是人物/团队照片，待确认科研价值' });
      continue;
    }

    // Category 3: Very low confidence + broadcast purpose (likely over-classified)
    if (c.confidence < 0.5 && c.functionalPurpose === '传播') {
      flags.push({ id: c.id, reason: 'pending_review:低置信度+传播归类，功能分类可能需要人工复核' });
      continue;
    }

    // Category 4: Low collection score (likely decorative/logo)
    if (c.collectionScore > 0 && c.collectionScore <= 10) {
      flags.push({ id: c.id, reason: 'pending_review:采集评分极低，可能是装饰图/logo' });
      continue;
    }

    // Category 5: Empty functional purpose still remaining
    if (!c.functionalPurpose || c.functionalPurpose === '不确定') {
      flags.push({ id: c.id, reason: 'pending_review:功能用途未标注或不确定，需要人工分类' });
      continue;
    }

    // Category 6: Empty distribution medium
    if (!c.functionalPurpose || c.functionalPurpose === '') {
      // Already caught above, skip
    }
  }

  console.log(`Flagged ${flags.length} cases for human review\n`);

  // Category distribution
  const categoryCounts: Record<string, number> = {};
  for (const f of flags) {
    const cat = f.reason.replace(/pending_review:/, '').split('，')[0];
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }
  console.log('Category distribution:');
  for (const [cat, count] of Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }

  // Write flags to manualNotes (append to existing)
  console.log(`\nWriting flags to manualNotes...`);

  for (let i = 0; i < flags.length; i += BATCH_SIZE) {
    const batch = flags.slice(i, i + BATCH_SIZE);
    for (const { id, reason } of batch) {
      const existing = await prisma.visualCase.findUnique({
        where: { id },
        select: { manualNotes: true },
      });
      const notes = existing?.manualNotes || '';
      const newNotes = notes ? `${notes}; ${reason}` : reason;
      await prisma.visualCase.update({
        where: { id },
        data: { manualNotes: newNotes },
      });
    }
    marked += batch.length;
    if (marked % 200 === 0) {
      console.log(`  Marked ${marked}/${flags.length}...`);
    }
  }

  console.log(`\nDone! Marked ${marked} cases for human review.`);
  console.log('These cases are NOT deleted — only flagged for human review.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });