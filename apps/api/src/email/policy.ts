import { createHmac } from 'node:crypto';
import { VersioningError } from '../domain/versioning';
import type { EmailBudget, EmailKind, EmailStore } from './store';

export class EmailRateLimitError extends VersioningError {
  readonly retryAfterSeconds: number;
  constructor(retryAt: Date, now: Date) {
    const retryAfterSeconds = Math.max(1, Math.ceil((retryAt.getTime() - now.getTime()) / 1000));
    super(`Слишком много запросов письма. Повторите через ${retryAfterSeconds} сек.`, 'EMAIL_RATE_LIMITED', 429, { retryAfterSeconds });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
export type EmailLimitOptions = { maxRequests: number; windowMs: number; cooldownMs: number; actorMax: number };
export const DEFAULT_EMAIL_LIMITS: EmailLimitOptions = { maxRequests: 3, windowMs: 3600000, cooldownMs: 60000, actorMax: 30 };
export interface EmailRequestPolicy { check(kind: EmailKind, normalizedEmail: string, actor?: string): Promise<void> }
export class EmailPolicy implements EmailRequestPolicy {
  private readonly limits: EmailLimitOptions;
  constructor(private readonly store: EmailStore, private readonly secret: string,
    limits: Partial<EmailLimitOptions> = {}, private readonly now: () => Date = () => new Date()) {
    this.limits = { ...DEFAULT_EMAIL_LIMITS, ...limits };
    if (secret.length < 32 || Object.values(this.limits).some(value => !Number.isSafeInteger(value) || value <= 0)
      || this.limits.cooldownMs > this.limits.windowMs) throw new Error('Invalid email limit configuration');
  }
  async check(kind: EmailKind, email: string, actor?: string): Promise<void> {
    const now = this.now();
    const digest = (value: string) => createHmac('sha256', this.secret).update(value).digest('hex');
    const budgets: EmailBudget[] = [{ key: `request:${kind}:recipient:${digest(email)}`, limit: this.limits.maxRequests,
      since: new Date(now.getTime() - this.limits.windowMs), expiresAt: new Date(now.getTime() + this.limits.windowMs),
      slidingWindowMs: this.limits.windowMs, cooldownMs: this.limits.cooldownMs }];
    if (actor) budgets.push({ key: `request:${kind}:actor:${digest(actor)}`, limit: this.limits.actorMax, slidingWindowMs: this.limits.windowMs,
      since: new Date(now.getTime() - this.limits.windowMs), expiresAt: new Date(now.getTime() + this.limits.windowMs) });
    const reservation = await this.store.reserve(budgets, now);
    if (!reservation.allowed) throw new EmailRateLimitError(reservation.retryAt, now);
  }
}
