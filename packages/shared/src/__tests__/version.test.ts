import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJECT_RELEASE_TAG,
  compareReleaseVersions,
  formatReleaseTag,
  getBuildMetadata,
} from '../version';

test('formats release tags from the single version source', () => {
  assert.equal(PROJECT_RELEASE_TAG, 'v0.1.0');
  assert.equal(formatReleaseTag('0.2.0'), 'v0.2.0');
  assert.equal(formatReleaseTag('v0.2.0'), 'v0.2.0');
});

test('compares SemVer-style release tags', () => {
  assert.equal(compareReleaseVersions('v0.2.0', 'v0.1.9') > 0, true);
  assert.equal(compareReleaseVersions('0.1.0', 'v0.1.0'), 0);
  assert.equal(compareReleaseVersions('v1.0.0', 'v1.0.1') < 0, true);
});

test('reads build metadata from release constants and commit environment', () => {
  const metadata = getBuildMetadata({ GITCHALERTS_COMMIT_SHA: '1234567890abcdef' });

  assert.equal(metadata.releaseVersion, '0.1.0');
  assert.equal(metadata.releaseTag, 'v0.1.0');
  assert.equal(metadata.commitSha, '1234567890abcdef');
  assert.equal(metadata.shortCommitSha, '1234567890ab');
  assert.equal(metadata.serviceVersions.web, '0.1.0');
});
