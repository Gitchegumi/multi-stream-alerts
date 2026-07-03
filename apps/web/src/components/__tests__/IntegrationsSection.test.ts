import test from 'node:test';
import assert from 'node:assert/strict';

// Test that the IntegrationsSection component is exported and that
// its module structure matches the expected contract. Full React
// rendering is not feasible under the repo's node:test + tsx setup
// (no jsdom / RTL), so we verify the module exports and that the
// NavBar no longer includes Integrations (covered in NavBar.test.ts).

test('IntegrationsSection module exports a named function', async () => {
  const mod = await import('../IntegrationsSection.tsx');
  assert.ok(
    typeof mod.IntegrationsSection === 'function',
    'IntegrationsSection should be a named export and a function (React component)',
  );
});

test('DangerZone module exports a named function', async () => {
  const mod = await import('../DangerZone.tsx');
  assert.ok(
    typeof mod.DangerZone === 'function',
    'DangerZone should be a named export and a function (React component)',
  );
});

test('WorkspaceSettingsForm no longer renders Danger Zone (no confirmDelete state)', async () => {
  // The refactored WorkspaceSettingsForm should NOT export any
  // danger-zone-related logic — that was extracted to DangerZone.
  const mod = await import('../WorkspaceSettingsForm.tsx');
  assert.ok(
    typeof mod.WorkspaceSettingsForm === 'function',
    'WorkspaceSettingsForm should be a named export',
  );
  // Verify the source does not contain 'Danger zone' or 'confirmDelete'
  // by checking the function's toString() — it should only contain
  // the workspace-name editing logic.
  const fnSource = mod.WorkspaceSettingsForm.toString();
  assert.ok(
    !fnSource.includes('Danger zone'),
    'WorkspaceSettingsForm should not contain Danger zone (extracted to DangerZone)',
  );
  assert.ok(
    !fnSource.includes('confirmDelete'),
    'WorkspaceSettingsForm should not contain confirmDelete (extracted to DangerZone)',
  );
});
