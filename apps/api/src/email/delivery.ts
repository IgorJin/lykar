import { randomUUID } from 'node:crypto';
import { VersioningError } from '../domain/versioning';
import type { InvitationDelivery } from '../domain/memberships';
import type { EmailProvider } from './providers';
import { ProviderSendError } from './providers';
import { magicLinkMessage, invitationMessage } from './templates';
import type { EmailBudget, EmailKind, EmailStore } from './store';

export type EmailPeriod = { anchor: string; kind: 'calendar-month' } | { anchor: string; kind: 'days'; days: number };
export type BudgetedEmailProvider = {
  provider: EmailProvider;
  dailyLimit: number;
  periodLimit: number;
  period: EmailPeriod;
  // Capacity permanently held aside for external/manual sends and safety headroom.
  reservedDaily?: number;
  reservedPeriod?: number;
};
export class EmailDeliveryError extends VersioningError {
  constructor(readonly deliveryId: string | undefined, outcome: 'unavailable' | 'unknown' | 'rejected', retryAfterSeconds?: number) {
    super(outcome === 'unknown'
      ? 'Результат отправки пока неизвестен. Проверьте почту перед повторным запросом.'
      : 'Отправка писем временно недоступна. Попробуйте позже.',
    outcome === 'unknown' ? 'EMAIL_DELIVERY_UNKNOWN' : 'EMAIL_UNAVAILABLE', 503,
    { ...(deliveryId ? { deliveryId } : {}), ...(retryAfterSeconds ? { retryAfterSeconds } : {}) });
  }
}
export const unavailableSender = { async send(): Promise<void> { throw new EmailDeliveryError(undefined, 'unavailable'); } };

export function periodWindow(period: EmailPeriod, now: Date): { start: Date; end: Date } | null {
  const anchor = new Date(period.anchor);
  if (now < anchor) return null;
  if (period.kind === 'days') {
    const length = period.days * 86400000;
    const start = anchor.getTime() + Math.floor((now.getTime() - anchor.getTime()) / length) * length;
    return { start: new Date(start), end: new Date(start + length) };
  }
  const at = (offset: number) => {
    const month = anchor.getUTCMonth() + offset;
    const lastDay = new Date(Date.UTC(anchor.getUTCFullYear(), month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(anchor.getUTCFullYear(), month, Math.min(anchor.getUTCDate(), lastDay),
      anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds()));
  };
  let offset = (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + now.getUTCMonth() - anchor.getUTCMonth();
  if (at(offset) > now) offset--;
  return { start: at(offset), end: at(offset + 1) };
}
export function validateEmailProviders(providers: BudgetedEmailProvider[]): void {
  const ids = new Set<string>();
  for (const p of providers) {
    if (!/^[a-z0-9-]{1,40}$/.test(p.provider.id) || ids.has(p.provider.id)
      || ![p.dailyLimit, p.periodLimit].every(n => Number.isSafeInteger(n) && n > 0)
      || ![p.reservedDaily ?? 0, p.reservedPeriod ?? 0].every(n => Number.isSafeInteger(n) && n >= 0)
      || (p.reservedDaily ?? 0) >= p.dailyLimit || (p.reservedPeriod ?? 0) >= p.periodLimit
      || !p.period || !['calendar-month', 'days'].includes(p.period.kind)
      || typeof p.period.anchor !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(p.period.anchor)
      || !Number.isFinite(Date.parse(p.period.anchor))
      || (p.period.kind === 'days' && (!Number.isSafeInteger(p.period.days) || p.period.days < 1 || p.period.days > 366))) {
      throw new Error('Invalid email provider budget configuration');
    }
    ids.add(p.provider.id);
  }
}

type LoginDelivery = { email: string; url: string; expiresAt: string; deliveryId?: string };
export class EmailDeliveryService {
  constructor(private readonly store: EmailStore, private readonly providers: BudgetedEmailProvider[],
    private readonly now: () => Date = () => new Date()) { validateEmailProviders(providers); }

  async send(input: LoginDelivery | InvitationDelivery): Promise<void> {
    const id = input.deliveryId ?? randomUUID();
    const kind: EmailKind = 'projectName' in input ? 'invitation' : 'login';
    const message = 'projectName' in input ? invitationMessage(input) : magicLinkMessage(input);
    const now = this.now();
    for (const p of this.providers) {
      const period = periodWindow(p.period, now);
      if (!period) continue;
      const budgets: EmailBudget[] = [
        // Rolling 24h is conservative even when a provider's daily reset timezone differs.
        { key: `provider:${p.provider.id}:day`, limit: p.dailyLimit - (p.reservedDaily ?? 0), slidingWindowMs: 86400000,
          since: new Date(now.getTime() - 86400000), expiresAt: new Date(now.getTime() + 86400000) },
        { key: `provider:${p.provider.id}:period:${period.start.getTime()}`, limit: p.periodLimit - (p.reservedPeriod ?? 0),
          since: new Date(period.start.getTime() - 1), expiresAt: period.end },
      ];
      const reservation = await this.store.beginDelivery({ id, kind, providerId: p.provider.id, budgets, now });
      if (reservation.state === 'limited') continue;
      if (reservation.state === 'existing') {
        if (reservation.delivery.status === 'accepted') return;
        throw new EmailDeliveryError(id, reservation.delivery.status === 'rejected' ? 'rejected' : 'unknown');
      }
      let result: { providerMessageId: string };
      try { result = await p.provider.send(message, id); }
      catch (error) {
        const outcome = error instanceof ProviderSendError ? error.outcome : 'unknown';
        const safeCode = error instanceof ProviderSendError ? error.safeCode : 'PROVIDER_UNKNOWN';
        try { await this.store.finishDelivery(id, outcome, null, safeCode); } catch { /* pending remains non-retryable */ }
        throw new EmailDeliveryError(id, outcome, error instanceof ProviderSendError ? error.retryAfterSeconds : undefined);
      }
      try { await this.store.finishDelivery(id, 'accepted', result.providerMessageId, null); }
      catch { throw new EmailDeliveryError(id, 'unknown'); }
      return; // Accepted by provider is not proof of inbox delivery.
    }
    // Persist a safe diagnostic even when no provider has capacity. Never send without a reservation.
    const final = await this.store.beginDelivery({ id, kind, providerId: null, budgets: [], now });
    if (final.state === 'existing' && final.delivery.status === 'accepted') return;
    if (final.state === 'existing' && final.delivery.status !== 'rejected') throw new EmailDeliveryError(id, 'unknown');
    if (final.state === 'reserved') await this.store.finishDelivery(id, 'rejected', null, 'QUOTA_EXHAUSTED');
    throw new EmailDeliveryError(id, 'unavailable');
  }
}
