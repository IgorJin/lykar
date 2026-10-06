import type { DeliveryReservation, EmailBudget, EmailDeliveryRecord, EmailReservation, EmailStore } from './store';

export type StoredEmailReservation = { reservedAt: number; expiresAt: number };

export function validateEmailBudgets(budgets: EmailBudget[], now: Date): void {
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid email reservation time');
  for (const budget of budgets) {
    if (!/^[A-Za-z0-9_:-]{1,256}$/.test(budget.key)
      || !Number.isSafeInteger(budget.limit) || budget.limit < 0
      || !Number.isFinite(budget.since.getTime()) || budget.since.getTime() > now.getTime()
      || !Number.isFinite(budget.expiresAt.getTime()) || budget.expiresAt.getTime() <= now.getTime()
      || (budget.slidingWindowMs !== undefined && (!Number.isSafeInteger(budget.slidingWindowMs) || budget.slidingWindowMs <= 0))
      || (budget.cooldownMs !== undefined && (!Number.isSafeInteger(budget.cooldownMs) || budget.cooldownMs < 0))) {
      throw new Error('Invalid email budget');
    }
  }
}

export function validateEmailDelivery(id: string, kind?: string, providerId?: string | null): void {
  if (!/^[A-Za-z0-9_/-]{1,256}$/.test(id)
    || (kind !== undefined && kind !== 'login' && kind !== 'invitation')
    || (providerId != null && !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(providerId))) {
    throw new Error('Invalid email delivery metadata');
  }
}

export function validateEmailOutcome(status: string, providerMessageId: string | null, safeCode: string | null): void {
  if (!['accepted', 'rejected', 'unknown'].includes(status)
    || (providerMessageId !== null && !/^[A-Za-z0-9_-]{1,128}$/.test(providerMessageId))
    || (safeCode !== null && !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(safeCode))) {
    throw new Error('Invalid email delivery outcome');
  }
}

/** Returns the first time every constraint can permit another reservation. */
export function emailBudgetRetryAt(budget: EmailBudget, reservations: StoredEmailReservation[], now: number): number {
  const active = reservations.filter(row => row.expiresAt > now);
  const inWindow = active.filter(row => row.reservedAt > budget.since.getTime());
  let retryAt = now;
  if (budget.limit === 0) retryAt = budget.expiresAt.getTime();
  else if (inWindow.length >= budget.limit) {
    const releases = inWindow.map(row => budget.slidingWindowMs === undefined
      ? row.expiresAt
      : Math.min(row.expiresAt, row.reservedAt + budget.slidingWindowMs)).sort((a, b) => a - b);
    retryAt = releases[inWindow.length - budget.limit];
  }
  if (budget.cooldownMs && active.length) {
    const latest = active.reduce((last, row) => Math.max(last, row.reservedAt), -Infinity);
    retryAt = Math.max(retryAt, latest + budget.cooldownMs);
  }
  return retryAt;
}

export class MemoryEmailStore implements EmailStore {
  private readonly reservations = new Map<string, StoredEmailReservation[]>();
  private readonly deliveries = new Map<string, EmailDeliveryRecord>();

  // All reads/checks/writes execute before the promise is returned, so concurrent
  // calls cannot interleave between checking a budget and reserving it.
  async reserve(budgets: EmailBudget[], now: Date): Promise<EmailReservation> {
    return this.reserveImmediately(budgets, now);
  }

  private reserveImmediately(budgets: EmailBudget[], now: Date): EmailReservation {
    validateEmailBudgets(budgets, now);
    const timestamp = now.getTime();
    let retryAt = timestamp;
    const expiryByKey = new Map<string, number>();
    for (const budget of budgets) {
      const active = (this.reservations.get(budget.key) ?? []).filter(row => row.expiresAt > timestamp);
      this.reservations.set(budget.key, active);
      retryAt = Math.max(retryAt, emailBudgetRetryAt(budget, active, timestamp));
      expiryByKey.set(budget.key, Math.max(expiryByKey.get(budget.key) ?? -Infinity, budget.expiresAt.getTime()));
    }
    if (retryAt > timestamp) return { allowed: false, retryAt: new Date(retryAt) };
    for (const [key, expiresAt] of expiryByKey) {
      this.reservations.get(key)!.push({ reservedAt: timestamp, expiresAt });
    }
    return { allowed: true, retryAt: new Date(timestamp) };
  }

  async beginDelivery(input: Parameters<EmailStore['beginDelivery']>[0]): Promise<DeliveryReservation> {
    validateEmailDelivery(input.id, input.kind, input.providerId);
    const existing = this.deliveries.get(input.id);
    if (existing) return { state: 'existing', delivery: { ...existing } };
    const reservation = this.reserveImmediately(input.budgets, input.now);
    if (!reservation.allowed) return { state: 'limited', retryAt: reservation.retryAt };
    this.deliveries.set(input.id, { id: input.id, kind: input.kind, providerId: input.providerId,
      status: 'pending', providerMessageId: null, safeCode: null });
    return { state: 'reserved' };
  }

  async finishDelivery(id: string, status: 'accepted' | 'rejected' | 'unknown', providerMessageId: string | null, safeCode: string | null): Promise<void> {
    validateEmailDelivery(id);
    validateEmailOutcome(status, providerMessageId, safeCode);
    const delivery = this.deliveries.get(id);
    if (delivery?.status === 'pending') Object.assign(delivery, { status, providerMessageId, safeCode });
  }
}
