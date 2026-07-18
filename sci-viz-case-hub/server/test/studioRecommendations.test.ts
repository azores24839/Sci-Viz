import assert from 'node:assert/strict';
import test from 'node:test';
import type { Prisma, VisualCase } from '@prisma/client';
import {
  buildStudioCandidateQueries,
  findStudioRecommendationCandidates,
  STUDIO_RECOMMENDATION_CONTRACT_VERSION,
} from '../src/services/studioRecommendations.js';

function visualCase(id: string) {
  return { id } as VisualCase;
}

test('publishes the version negotiated by the Studio recommendation endpoint', () => {
  assert.equal(STUDIO_RECOMMENDATION_CONTRACT_VERSION, 1);
});

test('searches exact and related matches before the quality fallback pool', () => {
  const queries = buildStudioCandidateQueries({
    discipline: '生命科学',
    purposes: ['解释'],
    technicalMethods: ['成像'],
  });

  assert.equal(queries.length, 3);
  assert.equal(queries[0].take, 200);
  assert.deepEqual(queries[0].where, {
    reviewStatus: 'approved',
    AND: [
      {
        OR: [
          { distributionMedium: '静图' },
          { distributionMedium: '' },
          { captureType: 'image' },
        ],
      },
      { discipline: '生命科学', functionalPurpose: { in: ['解释'] } },
    ],
  });
  assert.equal(queries[1].take, 300);
  assert.equal(queries[2].take, 300);
});

test('keeps a low-ranked exact match even when it is absent from the global top 300', async () => {
  const calls: Prisma.VisualCaseFindManyArgs[] = [];
  const exactMatch = visualCase('exact-low-ranked');
  const fallbackCases = Array.from({ length: 300 }, (_, index) => visualCase(`fallback-${index}`));
  const database = {
    visualCase: {
      async findMany(args: Prisma.VisualCaseFindManyArgs) {
        calls.push(args);
        if (calls.length === 1) return [exactMatch];
        if (calls.length === 2) return [exactMatch, visualCase('related')];
        return fallbackCases;
      },
    },
  };

  const candidates = await findStudioRecommendationCandidates(database, {
    discipline: '生命科学',
    purposes: ['解释'],
  });

  assert.equal(calls.length, 3);
  assert.ok(candidates.some((entry) => entry.id === exactMatch.id));
  assert.equal(new Set(candidates.map((entry) => entry.id)).size, candidates.length);
});
