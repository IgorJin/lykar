import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';

import { buildApp } from '../app';
import type { InvitationDelivery } from '../domain/memberships';

const databaseUrl = process.env.LYKAR_TEST_DATABASE_URL;

test(
  'project invitations enforce roles, revoke editor capabilities, and transfer ownership',
  { skip: databaseUrl ? false : 'LYKAR_TEST_DATABASE_URL is not configured' },
  async () => {
    const suffix = randomUUID().slice(0, 8);
    const ownerEmail = `roles-owner-${suffix}@example.com`;
    const editorEmail = `roles-editor-${suffix}@example.com`;
    const viewerEmail = `roles-viewer-${suffix}@example.com`;
    let magicLink = '';
    const invitations: InvitationDelivery[] = [];
    const app = buildApp({
      logger: false,
      connectionString: databaseUrl,
      appOrigin: 'http://localhost:3000',
      ownerEmail,
      magicLinkSender: { async send(input) { magicLink = input.url; } },
      invitationSender: { async send(input) { invitations.push(input); } },
    });

    try {
      const ownerCookie = await login(app, ownerEmail, () => magicLink);
      const ownerSession = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: ownerCookie } });
      const ownerId = ownerSession.json().user.id;
      const projectResponse = await app.inject({
        method: 'POST', url: '/api/admin/projects', headers: { cookie: ownerCookie },
        payload: { name: 'Roles project', origins: [`https://roles-${suffix}.example.com`] },
      });
      assert.equal(projectResponse.statusCode, 201, projectResponse.body);
      const project = projectResponse.json().project;
      const pages = await app.inject({
        method: 'GET', url: `/api/admin/projects/${project.id}/pages`, headers: { cookie: ownerCookie },
      });
      const page = pages.json().pages[0];

      const initialAccess = await access(app, ownerCookie, project.id);
      assert.equal(initialAccess.actorRole, 'owner');
      assert.equal(initialAccess.members.length, 1);
      assert.equal(initialAccess.permissions.transferOwnership, true);

      const firstInvite = await app.inject({
        method: 'POST', url: `/api/admin/projects/${project.id}/invitations`, headers: { cookie: ownerCookie },
        payload: { email: editorEmail, role: 'editor' },
      });
      assert.equal(firstInvite.statusCode, 201, firstInvite.body);
      assert.equal(invitations.length, 1);
      const firstInviteUrl = invitations[0].url;
      const resent = await app.inject({
        method: 'POST', url: `/api/admin/invitations/${firstInvite.json().invitation.id}/resend`,
        headers: { cookie: ownerCookie }, payload: {},
      });
      assert.equal(resent.statusCode, 201, resent.body);
      assert.equal(invitations.length, 2);
      const oldAcceptance = await app.inject({ method: 'GET', url: localPath(firstInviteUrl) });
      assert.equal(oldAcceptance.statusCode, 401);
      const editorAcceptance = await app.inject({ method: 'GET', url: localPath(invitations[1].url) });
      assert.equal(editorAcceptance.statusCode, 302, editorAcceptance.body);
      const editorCookie = cookieFrom(editorAcceptance);

      const afterEditor = await access(app, ownerCookie, project.id);
      const editor = afterEditor.members.find((member: { email: string }) => member.email === editorEmail);
      assert.ok(editor);
      assert.equal(editor.role, 'editor');

      const editorDraftResponse = await app.inject({
        method: 'POST', url: `/api/admin/pages/${page.id}/drafts`, headers: { cookie: editorCookie }, payload: {},
      });
      assert.equal(editorDraftResponse.statusCode, 201, editorDraftResponse.body);
      const draft = editorDraftResponse.json().draft;
      const editorLaunch = await app.inject({
        method: 'POST', url: `/api/admin/pages/${page.id}/editor-launch`, headers: { cookie: editorCookie },
        payload: { draftId: draft.id },
      });
      assert.equal(editorLaunch.statusCode, 201, editorLaunch.body);
      const editorTarget = new URL(editorLaunch.json().launchUrl);
      const editorExchange = await app.inject({
        method: 'POST', url: '/api/editor/exchange',
        payload: {
          code: new URLSearchParams(editorTarget.hash.slice(1)).get('lykar_edit'),
          pageUrl: `${editorTarget.origin}${editorTarget.pathname}`,
        },
      });
      assert.equal(editorExchange.statusCode, 200, editorExchange.body);
      const capability = editorExchange.json().capability;
      const operation = {
        schemaVersion: 1,
        id: `roles-title-${suffix}`,
        kind: 'setText',
        target: { marker: 'hero-title' },
        value: 'Edited by invited editor',
      };
      const editorAppend = await app.inject({
        method: 'POST', url: `/api/editor/drafts/${draft.id}/operations`,
        headers: { authorization: `Bearer ${capability.token}` },
        payload: { expectedRevision: 0, operations: [operation] },
      });
      assert.equal(editorAppend.statusCode, 200, editorAppend.body);
      const editorPublishDenied = await app.inject({
        method: 'POST', url: `/api/admin/drafts/${draft.id}/publish`, headers: { cookie: editorCookie },
        payload: { expectedRevision: 1 },
      });
      assert.equal(editorPublishDenied.statusCode, 403, editorPublishDenied.body);
      const editorInviteDenied = await app.inject({
        method: 'POST', url: `/api/admin/projects/${project.id}/invitations`, headers: { cookie: editorCookie },
        payload: { email: viewerEmail, role: 'viewer' },
      });
      assert.equal(editorInviteDenied.statusCode, 403, editorInviteDenied.body);

      const demoted = await app.inject({
        method: 'PATCH', url: `/api/admin/projects/${project.id}/members/${editor.id}`,
        headers: { cookie: ownerCookie }, payload: { role: 'viewer' },
      });
      assert.equal(demoted.statusCode, 200, demoted.body);
      const revokedCapability = await app.inject({
        method: 'POST', url: `/api/editor/drafts/${draft.id}/operations`,
        headers: { authorization: `Bearer ${capability.token}` },
        payload: {
          expectedRevision: 1,
          operations: [{ ...operation, id: `revoked-${suffix}`, value: 'must not persist' }],
        },
      });
      assert.equal(revokedCapability.statusCode, 401, revokedCapability.body);
      const viewerDraftDenied = await app.inject({
        method: 'POST', url: `/api/admin/pages/${page.id}/drafts`, headers: { cookie: editorCookie }, payload: {},
      });
      assert.equal(viewerDraftDenied.statusCode, 403, viewerDraftDenied.body);

      const promoted = await app.inject({
        method: 'PATCH', url: `/api/admin/projects/${project.id}/members/${editor.id}`,
        headers: { cookie: ownerCookie }, payload: { role: 'admin' },
      });
      assert.equal(promoted.statusCode, 200, promoted.body);
      const published = await app.inject({
        method: 'POST', url: `/api/admin/drafts/${draft.id}/publish`, headers: { cookie: editorCookie },
        payload: { expectedRevision: 1 },
      });
      assert.equal(published.statusCode, 201, published.body);

      const viewerInvite = await app.inject({
        method: 'POST', url: `/api/admin/projects/${project.id}/invitations`, headers: { cookie: editorCookie },
        payload: { email: viewerEmail, role: 'viewer' },
      });
      assert.equal(viewerInvite.statusCode, 201, viewerInvite.body);
      const viewerAcceptance = await app.inject({
        method: 'GET', url: localPath(invitations[invitations.length - 1].url),
      });
      const viewerCookie = cookieFrom(viewerAcceptance);
      const viewerPages = await app.inject({
        method: 'GET', url: `/api/admin/projects/${project.id}/pages`, headers: { cookie: viewerCookie },
      });
      assert.equal(viewerPages.statusCode, 200, viewerPages.body);
      const viewerCreateDenied = await app.inject({
        method: 'POST', url: `/api/admin/pages/${page.id}/drafts`, headers: { cookie: viewerCookie }, payload: {},
      });
      assert.equal(viewerCreateDenied.statusCode, 403, viewerCreateDenied.body);

      const beforeTransfer = await access(app, ownerCookie, project.id);
      const viewer = beforeTransfer.members.find((member: { email: string }) => member.email === viewerEmail);
      assert.ok(viewer);
      const transfer = await app.inject({
        method: 'POST', url: `/api/admin/projects/${project.id}/transfer-ownership`, headers: { cookie: ownerCookie },
        payload: { membershipId: editor.id },
      });
      assert.equal(transfer.statusCode, 200, transfer.body);
      assert.equal(transfer.json().owner.email, editorEmail);
      assert.equal(transfer.json().previousOwner.role, 'admin');
      const oldOwnerTransferDenied = await app.inject({
        method: 'POST', url: `/api/admin/projects/${project.id}/transfer-ownership`, headers: { cookie: ownerCookie },
        payload: { membershipId: viewer.id },
      });
      assert.equal(oldOwnerTransferDenied.statusCode, 403, oldOwnerTransferDenied.body);
      const originalOwnerMembership = (await access(app, editorCookie, project.id)).members
        .find((member: { userId: string }) => member.userId === ownerId);
      assert.ok(originalOwnerMembership);
      const transferBack = await app.inject({
        method: 'POST', url: `/api/admin/projects/${project.id}/transfer-ownership`, headers: { cookie: editorCookie },
        payload: { membershipId: originalOwnerMembership.id },
      });
      assert.equal(transferBack.statusCode, 200, transferBack.body);

      const revokedViewer = await app.inject({
        method: 'DELETE', url: `/api/admin/projects/${project.id}/members/${viewer.id}`, headers: { cookie: ownerCookie },
      });
      assert.equal(revokedViewer.statusCode, 204, revokedViewer.body);
      const viewerAfterRevoke = await app.inject({
        method: 'GET', url: `/api/admin/projects/${project.id}/pages`, headers: { cookie: viewerCookie },
      });
      assert.equal(viewerAfterRevoke.statusCode, 403, viewerAfterRevoke.body);

      magicLink = '';
      const acceptedMemberLogin = await app.inject({
        method: 'POST', url: '/api/auth/magic-link', payload: { email: editorEmail },
      });
      assert.equal(acceptedMemberLogin.statusCode, 202);
      assert.ok(magicLink);
      const acceptedMemberVerification = await app.inject({ method: 'GET', url: localPath(magicLink) });
      assert.equal(acceptedMemberVerification.statusCode, 302, acceptedMemberVerification.body);

      const verification = new Pool({ connectionString: databaseUrl });
      try {
        const audit = await verification.query<{
          project_author: string;
          operation_author: string;
          release_author: string;
        }>(
          `SELECT p.created_by AS project_author, o.created_by AS operation_author,
                  r.published_by AS release_author
           FROM projects p
           JOIN pages pg ON pg.project_id = p.id
           JOIN drafts d ON d.page_id = pg.id
           JOIN operations o ON o.draft_id = d.id
           JOIN releases r ON r.page_id = pg.id
           WHERE p.id = $1 AND o.operation_id = $2`,
          [project.id, operation.id],
        );
        assert.equal(audit.rows[0].project_author, ownerId);
        assert.equal(audit.rows[0].operation_author, editor.userId);
        assert.equal(audit.rows[0].release_author, editor.userId);
        const owners = await verification.query(
          `SELECT 1 FROM project_memberships
           WHERE project_id = $1 AND role = 'owner' AND revoked_at IS NULL`,
          [project.id],
        );
        assert.equal(owners.rowCount, 1);
        await assert.rejects(
          verification.query(
            `UPDATE project_memberships SET role = 'admin'
             WHERE project_id = $1 AND user_id = $2 AND role = 'owner'`,
            [project.id, ownerId],
          ),
          /must have exactly one active owner/,
        );
      } finally {
        await verification.end();
      }
    } finally {
      await app.close();
    }
  },
);

async function login(
  app: ReturnType<typeof buildApp>,
  email: string,
  readMagicLink: () => string,
): Promise<string> {
  const requested = await app.inject({ method: 'POST', url: '/api/auth/magic-link', payload: { email } });
  assert.equal(requested.statusCode, 202, requested.body);
  const link = readMagicLink();
  assert.ok(link);
  const verified = await app.inject({ method: 'GET', url: localPath(link) });
  assert.equal(verified.statusCode, 302, verified.body);
  return cookieFrom(verified);
}

async function access(app: ReturnType<typeof buildApp>, cookie: string, projectId: string) {
  const response = await app.inject({
    method: 'GET', url: `/api/admin/projects/${projectId}/members`, headers: { cookie },
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json();
}

function localPath(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const value = response.headers['set-cookie'];
  assert.equal(typeof value, 'string');
  return (value as string).split(';')[0];
}
