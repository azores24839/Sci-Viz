import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyEnterpriseCase,
  classifyEnterpriseSource,
  makeEnterpriseCompanyWhere,
} from '../src/services/enterpriseTaxonomy.js';

test('recognizes Johnson & Johnson sources as enterprise', () => {
  const taxonomy = classifyEnterpriseSource({
    name: 'Johnson & Johnson',
    url: 'https://www.jnj.com/',
    category: 'ENT',
    sourceType: 'enterprise',
  });

  assert.equal(taxonomy?.companyName, 'Johnson & Johnson');
  assert.equal(taxonomy?.companyKey, 'johnson-and-johnson');
});

test('recognizes jnj.com cases and builds a company filter', () => {
  const taxonomy = classifyEnterpriseCase({
    sourceDomain: 'www.jnj.com',
    sourceUrl: 'https://www.jnj.com/innovativemedicine/',
  });

  assert.equal(taxonomy?.companyName, 'Johnson & Johnson');
  assert.ok(makeEnterpriseCompanyWhere(['Johnson & Johnson']));
});
