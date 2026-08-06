import type { Pool } from 'pg';

import type { AuthRepository, AuthenticatedSession, UserRecord } from '../domain/auth';

type UserRow = { id: string; email: string; created_at: Date | string };

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapUser(row: UserRow): UserRecord {
  return { id: row.id, email: row.email, createdAt: toIso(row.created_at) };
}

export class PostgresAuthRepository implements AuthRepository {
  constructor(private readonly pool: Pool) {}

  async findOrCreateUser(input: { id: string; email: string }): Promise<UserRecord> {
    const result = await this.pool.query<UserRow>(
      `INSERT INTO users (id, email) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id, email, created_at`,
      [input.id, input.email],
    );
    return mapUser(result.rows[0]);
  }

  async createLoginToken(input: Parameters<AuthRepository['createLoginToken']>[0]): Promise<void> {
    await this.pool.query(
      `INSERT INTO login_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [input.id, input.userId, input.tokenHash, input.expiresAt],
    );
  }

  async consumeLoginToken(input: Parameters<AuthRepository['consumeLoginToken']>[0]): Promise<UserRecord | null> {
    const result = await this.pool.query<UserRow>(
      `UPDATE login_tokens lt
       SET consumed_at = $2
       FROM users u
       WHERE lt.token_hash = $1
         AND lt.user_id = u.id
         AND lt.consumed_at IS NULL
         AND lt.expires_at > $2
       RETURNING u.id, u.email, u.created_at`,
      [input.tokenHash, input.now],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async createSession(input: Parameters<AuthRepository['createSession']>[0]): Promise<void> {
    await this.pool.query(
      `INSERT INTO admin_sessions (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [input.id, input.userId, input.tokenHash, input.expiresAt],
    );
  }

  async findSession(input: Parameters<AuthRepository['findSession']>[0]): Promise<AuthenticatedSession | null> {
    const result = await this.pool.query<UserRow & { session_id: string; expires_at: Date | string }>(
      `UPDATE admin_sessions s
       SET last_seen_at = $2
       FROM users u
       WHERE s.token_hash = $1
         AND s.user_id = u.id
         AND s.revoked_at IS NULL
         AND s.expires_at > $2
       RETURNING s.id AS session_id, s.expires_at, u.id, u.email, u.created_at`,
      [input.tokenHash, input.now],
    );
    const row = result.rows[0];
    return row ? { id: row.session_id, user: mapUser(row), expiresAt: toIso(row.expires_at) } : null;
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await this.pool.query(
      'UPDATE admin_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
      [tokenHash],
    );
  }
}
