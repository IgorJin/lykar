import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { EmailRequestPolicy } from '../email/policy';
import { EmailDeliveryError } from '../email/delivery';
import { UnauthorizedError, ValidationError } from './versioning';

export type UserRecord = { id: string; email: string; createdAt: string };
export type AuthenticatedSession = {
  id: string;
  user: UserRecord;
  expiresAt: string;
};
export type IssuedSession = AuthenticatedSession & { token: string };

export interface AuthRepository {
  findOrCreateUser(input: { id: string; email: string }): Promise<UserRecord>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  createLoginToken(input: {
    id: string;
    email: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  consumeLoginToken(input: { tokenHash: string; now: Date }): Promise<UserRecord | null>;
  createSession(input: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  findSession(input: { tokenHash: string; now: Date }): Promise<AuthenticatedSession | null>;
  revokeSession(tokenHash: string): Promise<void>;
}

export interface MagicLinkSender {
  send(input: { email: string; url: string; expiresAt: string; deliveryId?: string }): Promise<void>;
}

export type AuthServiceOptions = {
  ownerEmail: string;
  appOrigin: string;
  loginTtlMs: number;
  sessionTtlMs: number;
  sender: MagicLinkSender;
  emailPolicy?: EmailRequestPolicy;
  now?: () => Date;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class AuthService {
  private readonly ownerEmail: string;
  private readonly appOrigin: string;
  private readonly now: () => Date;

  constructor(
    private readonly repository: AuthRepository,
    private readonly options: AuthServiceOptions,
  ) {
    this.ownerEmail = normalizeEmail(options.ownerEmail);
    this.appOrigin = new URL(options.appOrigin).origin;
    this.now = options.now ?? (() => new Date());
  }

  async requestMagicLink(emailValue: unknown, ip?: string): Promise<void> {
    const email = normalizeEmail(emailValue);
    await this.options.emailPolicy?.check('login', email, ip);
    // Registration and login have the same response. The account is created only
    // when the one-use email challenge is consumed, never from an unverified request.
    const token = issueOpaqueToken();
    const expiresAt = new Date(this.now().getTime() + this.options.loginTtlMs);
    const deliveryId = randomUUID();
    await this.repository.createLoginToken({
      id: deliveryId,
      email,
      tokenHash: hashToken(token),
      expiresAt,
    });
    const url = new URL('/api/auth/verify', this.appOrigin);
    url.searchParams.set('token', token);
    try {
      await this.options.sender.send({ email, url: url.toString(), expiresAt: expiresAt.toISOString(), deliveryId });
    } catch (error) {
      if (error instanceof EmailDeliveryError) throw error;
      throw new EmailDeliveryError(deliveryId, 'unknown');
    }
  }

  async verifyMagicLink(tokenValue: unknown): Promise<IssuedSession> {
    const token = requireToken(tokenValue, 'Magic link token');
    const now = this.now();
    const user = await this.repository.consumeLoginToken({ tokenHash: hashToken(token), now });
    if (!user) throw new UnauthorizedError('Magic link is invalid, expired, or already used');

    return this.createSessionForUser(user, now);
  }

  async createSessionForUser(user: UserRecord, now = this.now()): Promise<IssuedSession> {
    const sessionToken = issueOpaqueToken();
    const expiresAt = new Date(now.getTime() + this.options.sessionTtlMs);
    const id = randomUUID();
    await this.repository.createSession({ id, userId: user.id, tokenHash: hashToken(sessionToken), expiresAt });
    return { id, user, token: sessionToken, expiresAt: expiresAt.toISOString() };
  }

  async createDevelopmentSession(): Promise<IssuedSession> {
    const user = await this.repository.findOrCreateUser({ id: randomUUID(), email: this.ownerEmail });
    return this.createSessionForUser(user);
  }

  async authenticate(tokenValue: unknown): Promise<AuthenticatedSession> {
    const token = requireToken(tokenValue, 'Session token');
    const session = await this.repository.findSession({ tokenHash: hashToken(token), now: this.now() });
    if (!session) throw new UnauthorizedError();
    return session;
  }

  async logout(tokenValue: unknown): Promise<void> {
    if (typeof tokenValue !== 'string' || !tokenValue.trim()) return;
    await this.repository.revokeSession(hashToken(tokenValue));
  }
}

export class ConsoleMagicLinkSender implements MagicLinkSender {
  constructor(private readonly write: (message: string) => void = console.info) {}

  async send(input: { email: string; url: string; expiresAt: string; deliveryId?: string }): Promise<void> {
    this.write('[lykar] Console email delivery is disabled; configure a local file sender.');
    throw new EmailDeliveryError(input.deliveryId, 'unavailable');
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function issueOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

function requireToken(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length < 32 || value.length > 256) {
    throw new UnauthorizedError(`${label} is invalid`);
  }
  return value;
}

export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string' || !EMAIL_PATTERN.test(value.trim()) || value.trim().length > 254) {
    throw new ValidationError('email is invalid');
  }
  return value.trim().toLowerCase();
}
