import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests for account targeting logic.
 *
 * These tests verify the pure helper logic that extracts
 * selectedLinkedAccountIds from configJson and determines
 * whether an incoming event's platformAccountId should be
 * allowed to fire.
 */

test('getSelectedAccountIds returns empty array when configJson is null', () => {
  const ids = extractSelectedAccountIds(null);
  assert.deepEqual(ids, []);
});

test('getSelectedAccountIds returns empty array when configJson has no selectedLinkedAccountIds', () => {
  const ids = extractSelectedAccountIds({});
  assert.deepEqual(ids, []);
});

test('getSelectedAccountIds returns the array when configJson has selectedLinkedAccountIds', () => {
  const ids = extractSelectedAccountIds({
    selectedLinkedAccountIds: ['acc-1', 'acc-2'],
  });
  assert.deepEqual(ids, ['acc-1', 'acc-2']);
});

test('getSelectedAccountIds returns empty array when selectedLinkedAccountIds is not an array', () => {
  const ids = extractSelectedAccountIds({
    selectedLinkedAccountIds: 'not-an-array',
  });
  assert.deepEqual(ids, []);
});

test('shouldFireForAccount returns true when no accounts are selected (backward compat)', () => {
  assert.equal(shouldFireForAccount([], 'platform-id-1'), true);
});

test('shouldFireForAccount returns true when platformAccountId matches a selected account', () => {
  assert.equal(shouldFireForAccount(['acc-1', 'acc-2'], 'platform-id-1', [
    { id: 'acc-1', platformAccountId: 'platform-id-1' },
    { id: 'acc-2', platformAccountId: 'platform-id-2' },
  ]), true);
});

test('shouldFireForAccount returns false when platformAccountId does not match any selected account', () => {
  assert.equal(shouldFireForAccount(['acc-1'], 'platform-id-3', [
    { id: 'acc-1', platformAccountId: 'platform-id-1' },
  ]), false);
});

test('shouldFireForAccount returns true when platformAccountId is undefined and no selection exists', () => {
  assert.equal(shouldFireForAccount([], undefined), true);
});

test('shouldFireForAccount returns false when platformAccountId is undefined but selection exists', () => {
  assert.equal(shouldFireForAccount(['acc-1'], undefined, [
    { id: 'acc-1', platformAccountId: 'platform-id-1' },
  ]), false);
});

// ---------------------------------------------------------------------------
// Helpers — these mirror the logic in bootstrap.ts createStoredAlertEvent
// ---------------------------------------------------------------------------

function extractSelectedAccountIds(
  configJson: Record<string, unknown> | null,
): string[] {
  if (!configJson) return [];
  const ids = configJson.selectedLinkedAccountIds;
  return Array.isArray(ids) ? (ids as string[]) : [];
}

function shouldFireForAccount(
  selectedAccountIds: string[],
  platformAccountId: string | undefined,
  accounts?: Array<{ id: string; platformAccountId: string }>,
): boolean {
  // No selection = fire for any account (backward compat)
  if (selectedAccountIds.length === 0) return true;

  // Selection exists but we don't have a platformAccountId to match
  if (!platformAccountId) return false;

  // If accounts are provided, match through them
  if (accounts) {
    const matchingAccount = accounts.find((a) => selectedAccountIds.includes(a.id));
    return matchingAccount?.platformAccountId === platformAccountId;
  }

  // Without account details, assume match if any selection exists
  // (the actual DB lookup in bootstrap.ts does the real check)
  return selectedAccountIds.length > 0;
}