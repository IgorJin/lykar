import type { Pool, PoolClient } from 'pg';

import type { UserRecord } from '../domain/auth';
import {
  assertCanManage,
  type MembershipRepository,
  type ProjectInvitationRecord,
  type ProjectMemberRecord,
  type ProjectRole,
} from '../domain/memberships';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../domain/versioning';

type MembershipRow = {
  id: string;
  project_id: string;
  user_id: string;
  email: string;
  role: ProjectRole;
  created_at: Date | string;
  updated_at: Date | string;
};

type InvitationRow = {
  id: string;
  project_id: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  invited_by: string;
  expires_at: Date | string;
  accepted_at: Date | string | null;
  revoked_at: Date | string | null;
  created_at: Date | string;
};

type UserRow = { id: string; email: string; created_at: Date | string };

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapMember(row: MembershipRow): ProjectMemberRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    email: row.email,
    role: row.role,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapInvitation(row: InvitationRow): ProjectInvitationRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    email: row.email,
    role: row.role,
    invitedBy: row.invited_by,
    expiresAt: toIso(row.expires_at),
    acceptedAt: row.accepted_at ? toIso(row.accepted_at) : null,
    revokedAt: row.revoked_at ? toIso(row.revoked_at) : null,
    createdAt: toIso(row.created_at),
  };
}

function mapUser(row: UserRow): UserRecord {
  return { id: row.id, email: row.email, createdAt: toIso(row.created_at) };
}

export class PostgresMembershipRepository implements MembershipRepository {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listProjectAccess(actorUserId: string, projectId: string): ReturnType<MembershipRepository['listProjectAccess']> {
    const actorRole = await requireActorRole(this.pool, actorUserId, projectId);
    const [members, invitations] = await Promise.all([
      this.pool.query<MembershipRow>(
        `${MEMBER_SELECT}
         WHERE m.project_id = $1 AND m.revoked_at IS NULL
         ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'editor' THEN 2 ELSE 3 END, u.email`,
        [projectId],
      ),
      this.pool.query<InvitationRow>(
        `SELECT id, project_id, email, role, invited_by, expires_at, accepted_at, revoked_at, created_at
         FROM project_invitations
         WHERE project_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL
         ORDER BY created_at DESC`,
        [projectId],
      ),
    ]);
    return {
      actorRole,
      members: members.rows.map(mapMember),
      invitations: invitations.rows.map(mapInvitation),
    };
  }

  async createInvitation(
    input: Parameters<MembershipRepository['createInvitation']>[0],
  ): ReturnType<MembershipRepository['createInvitation']> {
    return this.transaction(async client => {
      assertCanManage(await requireActorRole(client, input.actorUserId, input.projectId, true));
      await ensureEmailIsNotActiveMember(client, input.projectId, input.email);
      await client.query(
        `UPDATE project_invitations SET revoked_at = NOW()
         WHERE project_id = $1 AND email = $2 AND accepted_at IS NULL AND revoked_at IS NULL`,
        [input.projectId, input.email],
      );
      const result = await client.query<InvitationRow & { project_name: string }>(
        `INSERT INTO project_invitations
          (id, project_id, email, role, invited_by, token_hash, expires_at)
         SELECT $1, p.id, $3, $4, $2, $5, $6
         FROM projects p WHERE p.id = $7
         RETURNING *, (SELECT name FROM projects WHERE id = project_id) AS project_name`,
        [input.id, input.actorUserId, input.email, input.role, input.tokenHash, input.expiresAt, input.projectId],
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundError('Project was not found');
      return { invitation: mapInvitation(row), projectName: row.project_name };
    });
  }

  async resendInvitation(
    input: Parameters<MembershipRepository['resendInvitation']>[0],
  ): ReturnType<MembershipRepository['resendInvitation']> {
    return this.transaction(async client => {
      const current = await client.query<InvitationRow & { project_name: string }>(
        `SELECT i.*, p.name AS project_name
         FROM project_invitations i
         JOIN projects p ON p.id = i.project_id
         WHERE i.id = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL
         FOR UPDATE OF i`,
        [input.invitationId],
      );
      const invitation = current.rows[0];
      if (!invitation) throw new NotFoundError('Active invitation was not found');
      assertCanManage(await requireActorRole(client, input.actorUserId, invitation.project_id, true));
      await ensureEmailIsNotActiveMember(client, invitation.project_id, invitation.email);
      await client.query('UPDATE project_invitations SET revoked_at = NOW() WHERE id = $1', [invitation.id]);
      const replacement = await client.query<InvitationRow>(
        `INSERT INTO project_invitations
          (id, project_id, email, role, invited_by, token_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          input.id,
          invitation.project_id,
          invitation.email,
          invitation.role,
          input.actorUserId,
          input.tokenHash,
          input.expiresAt,
        ],
      );
      return { invitation: mapInvitation(replacement.rows[0]), projectName: invitation.project_name };
    });
  }

  async revokeInvitation(actorUserId: string, invitationId: string): Promise<boolean> {
    return this.transaction(async client => {
      const current = await client.query<{ project_id: string }>(
        `SELECT project_id FROM project_invitations
         WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL
         FOR UPDATE`,
        [invitationId],
      );
      const projectId = current.rows[0]?.project_id;
      if (!projectId) return false;
      assertCanManage(await requireActorRole(client, actorUserId, projectId, true));
      const result = await client.query(
        'UPDATE project_invitations SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL',
        [invitationId],
      );
      return (result.rowCount ?? 0) > 0;
    });
  }

  async acceptInvitation(
    input: Parameters<MembershipRepository['acceptInvitation']>[0],
  ): ReturnType<MembershipRepository['acceptInvitation']> {
    return this.transaction(async client => {
      const invitationResult = await client.query<InvitationRow>(
        `SELECT * FROM project_invitations
         WHERE token_hash = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > $2
         FOR UPDATE`,
        [input.tokenHash, input.now],
      );
      const invitation = invitationResult.rows[0];
      if (!invitation) return null;
      const userResult = await client.query<UserRow>(
        `INSERT INTO users (id, email) VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
         RETURNING id, email, created_at`,
        [input.userId, invitation.email],
      );
      const user = userResult.rows[0];
      await client.query(
        `INSERT INTO project_memberships (id, project_id, user_id, role, invited_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (project_id, user_id) DO UPDATE
         SET role = CASE
               WHEN project_memberships.revoked_at IS NULL THEN project_memberships.role
               ELSE EXCLUDED.role
             END,
             invited_by = EXCLUDED.invited_by,
             revoked_at = NULL,
             updated_at = NOW()`,
        [input.membershipId, invitation.project_id, user.id, invitation.role, invitation.invited_by],
      );
      await client.query(
        `UPDATE project_invitations
         SET accepted_by = $2, accepted_at = $3
         WHERE id = $1`,
        [invitation.id, user.id, input.now],
      );
      return { user: mapUser(user), projectId: invitation.project_id };
    });
  }

  async updateMemberRole(
    input: Parameters<MembershipRepository['updateMemberRole']>[0],
  ): ReturnType<MembershipRepository['updateMemberRole']> {
    return this.transaction(async client => {
      assertCanManage(await requireActorRole(client, input.actorUserId, input.projectId, true));
      const target = await requireMutableMember(client, input.actorUserId, input.projectId, input.membershipId);
      const result = await client.query<MembershipRow>(
        `UPDATE project_memberships m
         SET role = $2, updated_at = NOW()
         FROM users u
         WHERE m.id = $1 AND u.id = m.user_id
         RETURNING m.id, m.project_id, m.user_id, u.email, m.role, m.created_at, m.updated_at`,
        [target.id, input.role],
      );
      if (input.role === 'viewer') await revokeEditorAccess(client, input.projectId, target.user_id);
      return mapMember(result.rows[0]);
    });
  }

  async revokeMember(actorUserId: string, projectId: string, membershipId: string): Promise<boolean> {
    return this.transaction(async client => {
      assertCanManage(await requireActorRole(client, actorUserId, projectId, true));
      const target = await requireMutableMember(client, actorUserId, projectId, membershipId);
      const result = await client.query(
        `UPDATE project_memberships
         SET revoked_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND revoked_at IS NULL`,
        [target.id],
      );
      await revokeEditorAccess(client, projectId, target.user_id);
      return (result.rowCount ?? 0) > 0;
    });
  }

  async transferOwnership(
    input: Parameters<MembershipRepository['transferOwnership']>[0],
  ): ReturnType<MembershipRepository['transferOwnership']> {
    return this.transaction(async client => {
      const actorRole = await requireActorRole(client, input.actorUserId, input.projectId, true);
      if (actorRole !== 'owner') throw new ForbiddenError('Only the project owner can transfer ownership');
      const target = await requireMutableMember(client, input.actorUserId, input.projectId, input.membershipId);
      await client.query(
        `UPDATE project_memberships SET role = 'admin', updated_at = NOW()
         WHERE project_id = $1 AND user_id = $2 AND role = 'owner' AND revoked_at IS NULL`,
        [input.projectId, input.actorUserId],
      );
      await client.query(
        `UPDATE project_memberships SET role = 'owner', updated_at = NOW()
         WHERE id = $1 AND project_id = $2 AND revoked_at IS NULL`,
        [target.id, input.projectId],
      );
      const changed = await client.query<MembershipRow>(
        `${MEMBER_SELECT}
         WHERE m.project_id = $1 AND m.user_id IN ($2, $3)
         ORDER BY CASE WHEN m.user_id = $3 THEN 0 ELSE 1 END`,
        [input.projectId, input.actorUserId, target.user_id],
      );
      const owner = changed.rows.find(row => row.user_id === target.user_id);
      const previousOwner = changed.rows.find(row => row.user_id === input.actorUserId);
      if (!owner || !previousOwner) throw new ConflictError('Ownership transfer did not update both memberships');
      return { owner: mapMember(owner), previousOwner: mapMember(previousOwner) };
    });
  }
}

async function requireActorRole(
  client: Pool | PoolClient,
  userId: string,
  projectId: string,
  lock = false,
): Promise<ProjectRole> {
  const result = await client.query<{ role: ProjectRole }>(
    `SELECT role FROM project_memberships
     WHERE project_id = $1 AND user_id = $2 AND revoked_at IS NULL
     ${lock ? 'FOR UPDATE' : ''}`,
    [projectId, userId],
  );
  const role = result.rows[0]?.role;
  if (!role) throw new ForbiddenError();
  return role;
}

async function ensureEmailIsNotActiveMember(client: PoolClient, projectId: string, email: string): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM project_memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.project_id = $1 AND u.email = $2 AND m.revoked_at IS NULL`,
    [projectId, email],
  );
  if ((result.rowCount ?? 0) > 0) throw new ConflictError('This email is already an active project member');
}

async function requireMutableMember(
  client: PoolClient,
  actorUserId: string,
  projectId: string,
  membershipId: string,
): Promise<MembershipRow> {
  const result = await client.query<MembershipRow>(
    `${MEMBER_SELECT}
     WHERE m.id = $1 AND m.project_id = $2 AND m.revoked_at IS NULL
     FOR UPDATE OF m`,
    [membershipId, projectId],
  );
  const member = result.rows[0];
  if (!member) throw new NotFoundError('Active member was not found');
  if (member.user_id === actorUserId) throw new ValidationError('You cannot change or revoke your own membership');
  if (member.role === 'owner') throw new ConflictError('Transfer ownership before changing the owner membership');
  return member;
}

async function revokeEditorAccess(client: PoolClient, projectId: string, userId: string): Promise<void> {
  await client.query(
    `UPDATE editor_launch_codes SET consumed_at = COALESCE(consumed_at, NOW())
     WHERE project_id = $1 AND user_id = $2 AND consumed_at IS NULL`,
    [projectId, userId],
  );
  await client.query(
    `UPDATE editor_sessions SET revoked_at = NOW()
     WHERE project_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [projectId, userId],
  );
}

const MEMBER_SELECT = `
  SELECT m.id, m.project_id, m.user_id, u.email, m.role, m.created_at, m.updated_at
  FROM project_memberships m
  JOIN users u ON u.id = m.user_id`;
