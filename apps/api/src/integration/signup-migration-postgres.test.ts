import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { Pool } from 'pg';
import { hashToken } from '../domain/auth';
import { PostgresAuthRepository } from '../repositories/postgres-auth-repository';

const databaseUrl = process.env.LYKAR_TEST_DATABASE_URL;
test('signup migration preserves legacy users, active sessions, old challenges and rollback', {
  skip: databaseUrl ? false : 'LYKAR_TEST_DATABASE_URL is not configured',
}, async () => {
  const admin = new Pool({ connectionString: databaseUrl });
  const schema = `signup_${randomUUID().replace(/-/g, '')}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, max: 1 });
  try {
    const directory = path.resolve(__dirname, '../../migrations');
    const oldMigrations = (await readdir(directory)).filter(name => /^00[1-9]|^010/.test(name)).sort();
    assert.equal(oldMigrations.length, 10);
    for (const name of oldMigrations) await pool.query(await readFile(path.join(directory, name), 'utf8'));
    const user = randomUUID(), login = randomUUID(), session = randomUUID();
    await pool.query('INSERT INTO users (id,email) VALUES ($1,$2)', [user, 'legacy@example.com']);
    await pool.query("INSERT INTO login_tokens (id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,NOW()+INTERVAL '1 hour')", [login, user, hashToken('legacy-login')]);
    await pool.query("INSERT INTO admin_sessions (id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,NOW()+INTERVAL '1 day')", [session, user, hashToken('legacy-session')]);
    const sql = await readFile(path.join(directory, '011_customer_signup.sql'), 'utf8');
    await pool.query('BEGIN');
    await pool.query(sql);
    await pool.query('ROLLBACK');
    assert.equal((await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name='login_tokens' AND column_name='email'", [schema])).rowCount, 0);
    await pool.query('BEGIN');
    await pool.query(sql);
    await pool.query('COMMIT');
    const repository = new PostgresAuthRepository(pool);
    assert.equal((await repository.findSession({ tokenHash: hashToken('legacy-session'), now: new Date() }))?.user.id, user);
    assert.equal((await repository.consumeLoginToken({ tokenHash: hashToken('legacy-login'), now: new Date() }))?.id, user);
    assert.equal(await repository.consumeLoginToken({ tokenHash: hashToken('legacy-login'), now: new Date() }), null);
    await repository.createLoginToken({ id: randomUUID(), email: 'new@example.com', tokenHash: hashToken('new-challenge'), expiresAt: new Date(Date.now() + 60000) });
    assert.equal(await repository.findUserByEmail('new@example.com'), null);
    assert.equal((await repository.consumeLoginToken({ tokenHash: hashToken('new-challenge'), now: new Date() }))?.email, 'new@example.com');
    assert.equal((await pool.query('SELECT 1 FROM users')).rowCount, 2);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
});
