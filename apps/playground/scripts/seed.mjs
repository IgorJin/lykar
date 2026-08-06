import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import pg from 'pg';

import {
  DEV_SESSION_TOKEN,
  OWNER_EMAIL,
  PRICING_DRAFT_ID,
  PRICING_PAGE_ID,
  PROJECT_ID,
  PROJECT_KEY,
  ROOT_DRAFT_ID,
  ROOT_PAGE_ID,
} from './fixture.mjs';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '10000000-0000-4000-8000-000000000002';
const MEMBERSHIP_ID = '20000000-0000-4000-8000-000000000002';

export async function seedPlayground(options) {
  const pool = new pg.Pool({ connectionString: options.databaseUrl });
  const origin = new URL(options.playgroundOrigin).origin;
  const localhostOrigin = origin.replace('127.0.0.1', 'localhost');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO users (id, email) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
      [USER_ID, OWNER_EMAIL],
    );
    await client.query(
      `INSERT INTO projects (id, name, public_key, created_by) VALUES ($1, 'Northstar E2E', $2, $3)
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name, public_key = EXCLUDED.public_key,
           created_by = COALESCE(projects.created_by, EXCLUDED.created_by), updated_at = NOW()`,
      [PROJECT_ID, PROJECT_KEY, USER_ID],
    );
    await client.query(
      `INSERT INTO project_memberships (id, project_id, user_id, role)
       VALUES ($1, $2, $3, 'owner')
       ON CONFLICT (project_id, user_id) DO UPDATE
       SET role = 'owner', revoked_at = NULL, updated_at = NOW()`,
      [MEMBERSHIP_ID, PROJECT_ID, USER_ID],
    );
    for (const [id, value] of [
      ['21000000-0000-4000-8000-000000000001', origin],
      ['21000000-0000-4000-8000-000000000002', localhostOrigin],
    ]) {
      await client.query(
        `INSERT INTO project_origins (id, project_id, origin, verified_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (id) DO UPDATE SET origin = EXCLUDED.origin, verified_at = NOW()`,
        [id, PROJECT_ID, value],
      );
    }
    for (const page of [
      { id: ROOT_PAGE_ID, name: 'Home', pathname: '/' },
      { id: PRICING_PAGE_ID, name: 'Pricing', pathname: '/pricing' },
    ]) {
      await client.query(
        `INSERT INTO pages (id, project_id, name, pathname, created_by) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name, pathname = EXCLUDED.pathname,
             created_by = COALESCE(pages.created_by, EXCLUDED.created_by), updated_at = NOW()`,
        [page.id, PROJECT_ID, page.name, page.pathname, USER_ID],
      );
    }
    for (const draft of [
      { id: ROOT_DRAFT_ID, pageId: ROOT_PAGE_ID },
      { id: PRICING_DRAFT_ID, pageId: PRICING_PAGE_ID },
    ]) {
      await client.query(
        `INSERT INTO drafts (id, project_id, page_id, created_by) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [draft.id, PROJECT_ID, draft.pageId, USER_ID],
      );
    }
    await client.query(
      `INSERT INTO admin_sessions (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '365 days')
       ON CONFLICT (id) DO UPDATE
       SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at,
           revoked_at = NULL, last_seen_at = NOW()`,
      [SESSION_ID, USER_ID, createHash('sha256').update(DEV_SESSION_TOKEN).digest('hex')],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
  return { ownerEmail: OWNER_EMAIL, projectId: PROJECT_ID, projectKey: PROJECT_KEY, origin };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const seeded = await seedPlayground({
    databaseUrl,
    playgroundOrigin: process.env.LYKAR_PLAYGROUND_ORIGIN ?? 'http://127.0.0.1:4173',
  });
  console.log(`Seeded ${seeded.projectKey} for ${seeded.origin}`);
}
