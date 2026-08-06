import { randomUUID } from 'node:crypto';

import { hashToken, issueOpaqueToken } from './auth';
import { NotFoundError, UnauthorizedError, ValidationError, normalizeProjectOrigin, requireUuid } from './versioning';

export type AccessPage = {
  projectId: string;
  pageId: string;
  publicKey: string;
  pathname: string;
  origin: string;
};
export type EditorLaunchTarget = AccessPage & { draftId: string; expectedRevision: number };
export type EditorSessionGrant = EditorLaunchTarget & { userId: string; expiresAt: string };
export type ShareTarget = AccessPage & {
  shareLinkId: string;
  releaseId: string;
  version: number;
  expiresAt: string | null;
};
export type ShareRecord = {
  id: string;
  pageId: string;
  releaseId: string;
  version: number;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export interface AccessRepository {
  getEditorLaunchTarget(userId: string, pageId: string, draftId: string): Promise<EditorLaunchTarget>;
  createEditorLaunchCode(input: {
    id: string; target: EditorLaunchTarget; userId: string; tokenHash: string; expiresAt: Date;
  }): Promise<void>;
  consumeEditorLaunchCode(input: { tokenHash: string; pageUrl: string; now: Date }): Promise<EditorSessionGrant | null>;
  createEditorSession(input: {
    id: string; grant: EditorSessionGrant; tokenHash: string; expiresAt: Date;
  }): Promise<void>;
  createShareLink(input: {
    id: string; userId: string; pageId: string; releaseId: string; tokenHash: string; expiresAt: Date | null;
  }): Promise<ShareRecord>;
  listShareLinks(userId: string, pageId: string): Promise<ShareRecord[]>;
  revokeShareLink(userId: string, shareLinkId: string): Promise<boolean>;
  getShareTarget(tokenHash: string, now: Date): Promise<ShareTarget | null>;
  createShareExchangeCode(input: {
    id: string; shareLinkId: string; tokenHash: string; expiresAt: Date;
  }): Promise<void>;
  consumeShareExchangeCode(input: { tokenHash: string; pageUrl: string; now: Date }): Promise<ShareTarget | null>;
  createShareSession(input: {
    id: string; shareLinkId: string; tokenHash: string; expiresAt: Date;
  }): Promise<void>;
  authorizeRuntimeAccess(input: {
    tokenHash: string; publicKey: string; pathname: string; version: number; now: Date;
  }): Promise<'editor' | 'share' | null>;
  authorizeEditorDraft(input: { tokenHash: string; draftId: string; now: Date }): Promise<string | null>;
}

export type AccessServiceOptions = {
  appOrigin: string;
  editorCodeTtlMs: number;
  editorSessionTtlMs: number;
  shareCodeTtlMs: number;
  shareSessionTtlMs: number;
  now?: () => Date;
};

export class AccessService {
  private readonly appOrigin: string;
  private readonly now: () => Date;

  constructor(
    private readonly repository: AccessRepository,
    private readonly options: AccessServiceOptions,
  ) {
    this.appOrigin = normalizeProjectOrigin(options.appOrigin);
    this.now = options.now ?? (() => new Date());
  }

  async createEditorLaunch(userIdValue: unknown, pageIdValue: unknown, draftIdValue: unknown): Promise<{
    launchUrl: string; expiresAt: string;
  }> {
    const userId = requireUuid(userIdValue, 'userId');
    const target = await this.repository.getEditorLaunchTarget(
      userId,
      requireUuid(pageIdValue, 'pageId'),
      requireUuid(draftIdValue, 'draftId'),
    );
    const code = issueOpaqueToken();
    const expiresAt = new Date(this.now().getTime() + this.options.editorCodeTtlMs);
    await this.repository.createEditorLaunchCode({
      id: randomUUID(), target, userId, tokenHash: hashToken(code), expiresAt,
    });
    const url = new URL(target.pathname, target.origin);
    url.hash = new URLSearchParams({ lykar_edit: code }).toString();
    return { launchUrl: url.toString(), expiresAt: expiresAt.toISOString() };
  }

  async exchangeEditor(codeValue: unknown, pageUrlValue: unknown): Promise<{
    token: string; expiresAt: string; projectId: string; pageId: string; pageUrl: string;
    draftId: string; expectedRevision: number;
  }> {
    const code = requireOpaque(codeValue, 'Editor launch code');
    const pageUrl = normalizePageUrl(pageUrlValue);
    const now = this.now();
    const grant = await this.repository.consumeEditorLaunchCode({ tokenHash: hashToken(code), pageUrl, now });
    if (!grant) throw new UnauthorizedError('Editor launch code is invalid, expired, or already used');
    const token = issueOpaqueToken();
    const expiresAt = new Date(now.getTime() + this.options.editorSessionTtlMs);
    await this.repository.createEditorSession({
      id: randomUUID(), grant, tokenHash: hashToken(token), expiresAt,
    });
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      projectId: grant.projectId,
      pageId: grant.pageId,
      pageUrl: `${grant.origin}${grant.pathname}`,
      draftId: grant.draftId,
      expectedRevision: grant.expectedRevision,
    };
  }

  async createShare(
    userIdValue: unknown,
    pageIdValue: unknown,
    releaseIdValue: unknown,
    expiresInSecondsValue?: unknown,
  ): Promise<{ share: ShareRecord; url: string }> {
    const expiresAt = optionalExpiry(expiresInSecondsValue, this.now());
    const token = issueOpaqueToken();
    const share = await this.repository.createShareLink({
      id: randomUUID(),
      userId: requireUuid(userIdValue, 'userId'),
      pageId: requireUuid(pageIdValue, 'pageId'),
      releaseId: requireUuid(releaseIdValue, 'releaseId'),
      tokenHash: hashToken(token),
      expiresAt,
    });
    return { share, url: `${this.appOrigin}/share/${token}` };
  }

  listShares(userIdValue: unknown, pageIdValue: unknown): Promise<ShareRecord[]> {
    return this.repository.listShareLinks(
      requireUuid(userIdValue, 'userId'),
      requireUuid(pageIdValue, 'pageId'),
    );
  }

  async revokeShare(userIdValue: unknown, shareIdValue: unknown): Promise<void> {
    const revoked = await this.repository.revokeShareLink(
      requireUuid(userIdValue, 'userId'),
      requireUuid(shareIdValue, 'shareId'),
    );
    if (!revoked) throw new NotFoundError('Active share link was not found');
  }

  async beginShare(tokenValue: unknown): Promise<string> {
    const token = requireOpaque(tokenValue, 'Share token');
    const now = this.now();
    const target = await this.repository.getShareTarget(hashToken(token), now);
    if (!target) throw new NotFoundError('Share link was not found, has expired, or was revoked');
    const code = issueOpaqueToken();
    const expiresAt = new Date(now.getTime() + this.options.shareCodeTtlMs);
    await this.repository.createShareExchangeCode({
      id: randomUUID(), shareLinkId: target.shareLinkId, tokenHash: hashToken(code), expiresAt,
    });
    const url = new URL(target.pathname, target.origin);
    url.searchParams.set('version', String(target.version));
    url.hash = new URLSearchParams({ lykar_share: code }).toString();
    return url.toString();
  }

  async exchangeShare(codeValue: unknown, pageUrlValue: unknown): Promise<{
    token: string; expiresAt: string; projectId: string; pageId: string; releaseId: string; version: number;
  }> {
    const code = requireOpaque(codeValue, 'Share exchange code');
    const pageUrl = normalizePageUrl(pageUrlValue);
    const now = this.now();
    const target = await this.repository.consumeShareExchangeCode({ tokenHash: hashToken(code), pageUrl, now });
    if (!target) throw new UnauthorizedError('Share exchange code is invalid, expired, or already used');
    const token = issueOpaqueToken();
    const linkExpiry = target.expiresAt ? Date.parse(target.expiresAt) : Number.POSITIVE_INFINITY;
    const expiresAt = new Date(Math.min(linkExpiry, now.getTime() + this.options.shareSessionTtlMs));
    await this.repository.createShareSession({
      id: randomUUID(), shareLinkId: target.shareLinkId, tokenHash: hashToken(token), expiresAt,
    });
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      projectId: target.projectId,
      pageId: target.pageId,
      releaseId: target.releaseId,
      version: target.version,
    };
  }

  async authorizeRuntime(
    tokenValue: unknown,
    publicKeyValue: unknown,
    pathnameValue: unknown,
    versionValue: unknown,
  ): Promise<'editor' | 'share'> {
    const token = requireOpaque(tokenValue, 'Preview access token');
    if (typeof publicKeyValue !== 'string' || !publicKeyValue.startsWith('pk_')) throw new UnauthorizedError();
    const pathname = normalizeRuntimePath(pathnameValue);
    const version = typeof versionValue === 'string' ? Number(versionValue) : versionValue;
    if (!Number.isSafeInteger(version) || (version as number) <= 0) throw new UnauthorizedError();
    const access = await this.repository.authorizeRuntimeAccess({
      tokenHash: hashToken(token),
      publicKey: publicKeyValue,
      pathname,
      version: version as number,
      now: this.now(),
    });
    if (!access) throw new UnauthorizedError('Version preview requires an editor or share session');
    return access;
  }

  async authorizeEditorDraft(tokenValue: unknown, draftIdValue: unknown): Promise<string> {
    const userId = await this.repository.authorizeEditorDraft({
      tokenHash: hashToken(requireOpaque(tokenValue, 'Editor access token')),
      draftId: requireUuid(draftIdValue, 'draftId'),
      now: this.now(),
    });
    if (!userId) throw new UnauthorizedError('Editor session cannot access this draft');
    return userId;
  }
}

function requireOpaque(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length < 32 || value.length > 256) {
    throw new UnauthorizedError(`${label} is invalid`);
  }
  return value;
}

function normalizePageUrl(value: unknown): string {
  if (typeof value !== 'string') throw new ValidationError('pageUrl is invalid');
  let url: URL;
  try { url = new URL(value); } catch { throw new ValidationError('pageUrl is invalid'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ValidationError('pageUrl is invalid');
  return `${url.origin}${normalizeRuntimePath(url.pathname)}`;
}

function normalizeRuntimePath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/')) throw new ValidationError('pathname must start with /');
  return value.length > 1 ? value.replace(/\/+$/, '') : '/';
}

function optionalExpiry(value: unknown, now: Date): Date | null {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 60 || (value as number) > 31_536_000) {
    throw new ValidationError('expiresInSeconds must be between 60 and 31536000');
  }
  return new Date(now.getTime() + (value as number) * 1000);
}
