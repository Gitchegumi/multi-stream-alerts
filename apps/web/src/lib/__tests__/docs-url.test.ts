import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_DOCS_URL, getDocsUrl } from '../docs-url';

describe('getDocsUrl', () => {
  it('defaults to the repository documentation index', () => {
    assert.equal(getDocsUrl(undefined), DEFAULT_DOCS_URL);
  });

  it('uses a configured documentation URL', () => {
    assert.equal(
      getDocsUrl('https://docs.example.com/gitchalerts'),
      'https://docs.example.com/gitchalerts',
    );
  });

  it('ignores empty configured values', () => {
    assert.equal(getDocsUrl('   '), DEFAULT_DOCS_URL);
  });
});
