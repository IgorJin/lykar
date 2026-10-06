import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { DeliveryReservation, EmailBudget, EmailDeliveryRecord, EmailReservation, EmailStore } from '../email/store';
import { emailBudgetRetryAt, validateEmailBudgets, validateEmailDelivery, validateEmailOutcome } from '../email/memory-store';

type DeliveryRow = {
  id: string; kind: EmailDeliveryRecord['kind']; provider_id: string | null;
  status: EmailDeliveryRecord['status']; provider_message_id: string | null; safe_code: string | null;
};
function mapDelivery(row: DeliveryRow): EmailDeliveryRecord {
  return { id: row.id, kind: row.kind, providerId: row.provider_id, status: row.status,
    providerMessageId: row.provider_message_id, safeCode: row.safe_code };
}

export class PostgresEmailStore implements EmailStore {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  private async lock(client: PoolClient, names: string[]): Promise<void> {
    // Sort the actual lock ids, rather than input keys, so even a hash collision
    // cannot invert the acquisition order across independent transactions.
    const ids = [...new Set(names.map(name => createHash('sha256').update(name).digest().readBigInt64BE().toString()))].sort();
    for (const id of ids) await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [id]);
  }

  private async reserveLocked(client: PoolClient, budgets: EmailBudget[], now: Date): Promise<EmailReservation> {
    const keys = [...new Set(budgets.map(budget => budget.key))];
    // Only the buckets locked by this request are pruned. No global cleanup is
    // performed on the hot path or under request advisory locks.
    await client.query('DELETE FROM email_budget_reservations WHERE bucket_key = ANY($1::text[]) AND expires_at <= $2', [keys, now]);
    const rows = await client.query<{ bucket_key: string; reserved_at: Date; expires_at: Date }>(
      'SELECT bucket_key, reserved_at, expires_at FROM email_budget_reservations WHERE bucket_key = ANY($1::text[]) AND expires_at > $2', [keys, now]);
    const reservations = new Map<string, { reservedAt: number; expiresAt: number }[]>();
    for (const row of rows.rows) {
      const bucket = reservations.get(row.bucket_key) ?? [];
      bucket.push({ reservedAt: row.reserved_at.getTime(), expiresAt: row.expires_at.getTime() });
      reservations.set(row.bucket_key, bucket);
    }
    let retryAt = now.getTime();
    const expiryByKey = new Map<string, number>();
    for (const budget of budgets) {
      retryAt = Math.max(retryAt, emailBudgetRetryAt(budget, reservations.get(budget.key) ?? [], now.getTime()));
      expiryByKey.set(budget.key, Math.max(expiryByKey.get(budget.key) ?? -Infinity, budget.expiresAt.getTime()));
    }
    if (retryAt > now.getTime()) return { allowed: false, retryAt: new Date(retryAt) };
    for (const [key, expiry] of expiryByKey) {
      await client.query('INSERT INTO email_budget_reservations (bucket_key, reserved_at, expires_at) VALUES ($1, $2, $3)', [key, now, new Date(expiry)]);
    }
    return { allowed: true, retryAt: new Date(now.getTime()) };
  }

  async reserve(budgets: EmailBudget[], now: Date): Promise<EmailReservation> {
    validateEmailBudgets(budgets, now);
    return this.transaction(async client => {
      await this.lock(client, budgets.map(budget => `email:budget:${budget.key}`));
      return this.reserveLocked(client, budgets, now);
    });
  }

  async beginDelivery(input: Parameters<EmailStore['beginDelivery']>[0]): Promise<DeliveryReservation> {
    validateEmailDelivery(input.id, input.kind, input.providerId);
    return this.transaction(async client => {
      await this.lock(client, [`email:delivery:${input.id}`, ...input.budgets.map(budget => `email:budget:${budget.key}`)]);
      const existing = await client.query<DeliveryRow>('SELECT id, kind, provider_id, status, provider_message_id, safe_code FROM email_deliveries WHERE id = $1', [input.id]);
      if (existing.rows[0]) return { state: 'existing', delivery: mapDelivery(existing.rows[0]) };
      validateEmailBudgets(input.budgets, input.now);
      const reservation = await this.reserveLocked(client, input.budgets, input.now);
      if (!reservation.allowed) return { state: 'limited', retryAt: reservation.retryAt };
      await client.query('INSERT INTO email_deliveries (id, kind, provider_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)',
        [input.id, input.kind, input.providerId, input.now]);
      return { state: 'reserved' };
    });
  }

  async finishDelivery(id: string, status: 'accepted' | 'rejected' | 'unknown', providerMessageId: string | null, safeCode: string | null): Promise<void> {
    validateEmailDelivery(id);
    validateEmailOutcome(status, providerMessageId, safeCode);
    await this.pool.query(`UPDATE email_deliveries
      SET status = $2, provider_message_id = $3, safe_code = $4,
        updated_at = GREATEST(clock_timestamp(), created_at), finished_at = GREATEST(clock_timestamp(), created_at)
      WHERE id = $1 AND status = 'pending'`, [id, status, providerMessageId, safeCode]);
  }
}
