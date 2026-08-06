import { randomUUID } from 'node:crypto';

import type { UserRecord } from './auth';
import { hashToken, issueOpaqueToken, normalizeEmail } from './auth';
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError, requireUuid } from './versioning';

export const PROJECT_ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;
export const INVITABLE_PROJECT_ROLES = ['admin', 'editor', 'viewer'] as const;

export type ProjectRole = typeof PROJECT_ROLES[number];
export type InvitableProjectRole = typeof INVITABLE_PROJECT_ROLES[number];
export type ProjectPermission = 'view' | 'edit' | 'publish' | 'manageMembers' | 'transferOwnership';

export type ProjectMemberRecord = {
  id: string;
  projectId: string;
  userId: string;
  email: string;
  role: ProjectRole;
  createdAt: string;
  updatedAt: string;
};

export type ProjectInvitationRecord = {
  id: string;
  projectId: string;
  email: string;
  role: InvitableProjectRole;
  invitedBy: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type ProjectAccessView = {
  actorRole: ProjectRole;
  permissions: Record<ProjectPermission, boolean>;
  members: ProjectMemberRecord[];
  invitations: ProjectInvitationRecord[];
};

export type InvitationDelivery = {
  email: string;
  projectName: string;
  role: InvitableProjectRole;
  url: string;
  expiresAt: string;
};

export interface InvitationSender {
  send(input: InvitationDelivery): Promise<void>;
}

export interface MembershipRepository {
  listProjectAccess(actorUserId: string, projectId: string): Promise<{
    actorRole: ProjectRole;
    members: ProjectMemberRecord[];
    invitations: ProjectInvitationRecord[];
  }>;
  createInvitation(input: {
    id: string;
    actorUserId: string;
    projectId: string;
    email: string;
    role: InvitableProjectRole;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<{ invitation: ProjectInvitationRecord; projectName: string }>;
  resendInvitation(input: {
    id: string;
    actorUserId: string;
    invitationId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<{ invitation: ProjectInvitationRecord; projectName: string }>;
  revokeInvitation(actorUserId: string, invitationId: string): Promise<boolean>;
  acceptInvitation(input: {
    tokenHash: string;
    now: Date;
    userId: string;
    membershipId: string;
  }): Promise<{ user: UserRecord; projectId: string } | null>;
  updateMemberRole(input: {
    actorUserId: string;
    projectId: string;
    membershipId: string;
    role: InvitableProjectRole;
  }): Promise<ProjectMemberRecord>;
  revokeMember(actorUserId: string, projectId: string, membershipId: string): Promise<boolean>;
  transferOwnership(input: {
    actorUserId: string;
    projectId: string;
    membershipId: string;
  }): Promise<{ previousOwner: ProjectMemberRecord; owner: ProjectMemberRecord }>;
}

export type MembershipServiceOptions = {
  appOrigin: string;
  invitationTtlMs: number;
  sender: InvitationSender;
  now?: () => Date;
};

export class MembershipService {
  private readonly appOrigin: string;
  private readonly now: () => Date;

  constructor(
    private readonly repository: MembershipRepository,
    private readonly options: MembershipServiceOptions,
  ) {
    this.appOrigin = new URL(options.appOrigin).origin;
    this.now = options.now ?? (() => new Date());
  }

  async listProjectAccess(actorUserIdValue: unknown, projectIdValue: unknown): Promise<ProjectAccessView> {
    const access = await this.repository.listProjectAccess(
      requireUuid(actorUserIdValue, 'userId'),
      requireUuid(projectIdValue, 'projectId'),
    );
    return { ...access, permissions: permissionsForRole(access.actorRole) };
  }

  async invite(
    actorUserIdValue: unknown,
    projectIdValue: unknown,
    emailValue: unknown,
    roleValue: unknown,
  ): Promise<ProjectInvitationRecord> {
    const token = issueOpaqueToken();
    const expiresAt = new Date(this.now().getTime() + this.options.invitationTtlMs);
    const result = await this.repository.createInvitation({
      id: randomUUID(),
      actorUserId: requireUuid(actorUserIdValue, 'userId'),
      projectId: requireUuid(projectIdValue, 'projectId'),
      email: normalizeEmail(emailValue),
      role: requireInvitableRole(roleValue),
      tokenHash: hashToken(token),
      expiresAt,
    });
    await this.deliver(result.invitation, result.projectName, token);
    return result.invitation;
  }

  async resend(
    actorUserIdValue: unknown,
    invitationIdValue: unknown,
  ): Promise<ProjectInvitationRecord> {
    const token = issueOpaqueToken();
    const expiresAt = new Date(this.now().getTime() + this.options.invitationTtlMs);
    const result = await this.repository.resendInvitation({
      id: randomUUID(),
      actorUserId: requireUuid(actorUserIdValue, 'userId'),
      invitationId: requireUuid(invitationIdValue, 'invitationId'),
      tokenHash: hashToken(token),
      expiresAt,
    });
    await this.deliver(result.invitation, result.projectName, token);
    return result.invitation;
  }

  async revokeInvitation(actorUserIdValue: unknown, invitationIdValue: unknown): Promise<void> {
    const revoked = await this.repository.revokeInvitation(
      requireUuid(actorUserIdValue, 'userId'),
      requireUuid(invitationIdValue, 'invitationId'),
    );
    if (!revoked) throw new NotFoundError('Active invitation was not found');
  }

  async accept(tokenValue: unknown): Promise<{ user: UserRecord; projectId: string }> {
    const token = requireInvitationToken(tokenValue);
    const accepted = await this.repository.acceptInvitation({
      tokenHash: hashToken(token),
      now: this.now(),
      userId: randomUUID(),
      membershipId: randomUUID(),
    });
    if (!accepted) throw new UnauthorizedError('Invitation is invalid, expired, revoked, or already used');
    return accepted;
  }

  updateMemberRole(
    actorUserIdValue: unknown,
    projectIdValue: unknown,
    membershipIdValue: unknown,
    roleValue: unknown,
  ): Promise<ProjectMemberRecord> {
    return this.repository.updateMemberRole({
      actorUserId: requireUuid(actorUserIdValue, 'userId'),
      projectId: requireUuid(projectIdValue, 'projectId'),
      membershipId: requireUuid(membershipIdValue, 'membershipId'),
      role: requireInvitableRole(roleValue),
    });
  }

  async revokeMember(
    actorUserIdValue: unknown,
    projectIdValue: unknown,
    membershipIdValue: unknown,
  ): Promise<void> {
    const revoked = await this.repository.revokeMember(
      requireUuid(actorUserIdValue, 'userId'),
      requireUuid(projectIdValue, 'projectId'),
      requireUuid(membershipIdValue, 'membershipId'),
    );
    if (!revoked) throw new NotFoundError('Active member was not found');
  }

  transferOwnership(
    actorUserIdValue: unknown,
    projectIdValue: unknown,
    membershipIdValue: unknown,
  ): Promise<{ previousOwner: ProjectMemberRecord; owner: ProjectMemberRecord }> {
    return this.repository.transferOwnership({
      actorUserId: requireUuid(actorUserIdValue, 'userId'),
      projectId: requireUuid(projectIdValue, 'projectId'),
      membershipId: requireUuid(membershipIdValue, 'membershipId'),
    });
  }

  private async deliver(invitation: ProjectInvitationRecord, projectName: string, token: string): Promise<void> {
    const url = new URL('/api/invitations/accept', this.appOrigin);
    url.searchParams.set('token', token);
    await this.options.sender.send({
      email: invitation.email,
      projectName,
      role: invitation.role,
      url: url.toString(),
      expiresAt: invitation.expiresAt,
    });
  }
}

export class ConsoleInvitationSender implements InvitationSender {
  constructor(private readonly write: (message: string) => void = console.info) {}

  async send(input: InvitationDelivery): Promise<void> {
    this.write(
      `[lykar] Invitation for ${input.email} to ${input.projectName} as ${input.role} `
      + `(expires ${input.expiresAt}): ${input.url}`,
    );
  }
}

export function permissionsForRole(role: ProjectRole): Record<ProjectPermission, boolean> {
  return {
    view: true,
    edit: role === 'owner' || role === 'admin' || role === 'editor',
    publish: role === 'owner' || role === 'admin',
    manageMembers: role === 'owner' || role === 'admin',
    transferOwnership: role === 'owner',
  };
}

export function requireInvitableRole(value: unknown): InvitableProjectRole {
  if (!INVITABLE_PROJECT_ROLES.includes(value as InvitableProjectRole)) {
    throw new ValidationError('role must be admin, editor, or viewer');
  }
  return value as InvitableProjectRole;
}

export function rolesWithPermission(permission: ProjectPermission): ProjectRole[] {
  return PROJECT_ROLES.filter(role => permissionsForRole(role)[permission]);
}

export function assertCanManage(actorRole: ProjectRole): void {
  if (!permissionsForRole(actorRole).manageMembers) throw new ForbiddenError('This role cannot manage project members');
}

function requireInvitationToken(value: unknown): string {
  if (typeof value !== 'string' || value.length < 32 || value.length > 256) {
    throw new UnauthorizedError('Invitation token is invalid');
  }
  return value;
}
