import assert from 'node:assert/strict';
import test from 'node:test';

import { permissionsForRole, requireInvitableRole } from './memberships';

test('project roles map to the agreed permission boundaries', () => {
  assert.deepEqual(permissionsForRole('owner'), {
    view: true, edit: true, publish: true, manageMembers: true, transferOwnership: true,
  });
  assert.deepEqual(permissionsForRole('admin'), {
    view: true, edit: true, publish: true, manageMembers: true, transferOwnership: false,
  });
  assert.deepEqual(permissionsForRole('editor'), {
    view: true, edit: true, publish: false, manageMembers: false, transferOwnership: false,
  });
  assert.deepEqual(permissionsForRole('viewer'), {
    view: true, edit: false, publish: false, manageMembers: false, transferOwnership: false,
  });
});

test('owner can only be assigned through ownership transfer', () => {
  assert.equal(requireInvitableRole('admin'), 'admin');
  assert.throws(() => requireInvitableRole('owner'), /role must be admin, editor, or viewer/);
});
