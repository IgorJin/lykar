import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { Pool, type PoolClient } from 'pg';

const databaseUrl = process.env.LYKAR_TEST_DATABASE_URL;
const skip = databaseUrl ? false : 'LYKAR_TEST_DATABASE_URL is not configured';
const migrationsDirectory = path.resolve(__dirname, '../../migrations');
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PAGE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const RELEASE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OTHER_PAGE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const OTHER_RELEASE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

async function isolatedSchema(run: (client: PoolClient) => Promise<void>): Promise<void> {
  const pool = new Pool({connectionString: databaseUrl, max: 1});
  const client = await pool.connect();
  // Identifiers are locally generated, never derived from a database URL or existing schema.
  const schema = `lykar_deployment_test_${randomUUID().replace(/-/g, '')}`;
  let created = false;
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`CREATE TABLE lykar_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await run(client);
  } finally {
    try {
      await client.query('ROLLBACK');
      await client.query('SET search_path TO pg_catalog');
      if (created) await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      client.release();
      await pool.end();
    }
  }
}

async function migrations(): Promise<string[]> {
  return (await fs.readdir(migrationsDirectory)).filter(file => /^00[1-9].*\.sql$|^010.*\.sql$/.test(file)).sort();
}

// migrate.ts is a CLI with a global DATABASE_URL and advisory lock. This helper
// faithfully exercises its SQL + ledger BEGIN/COMMIT/ROLLBACK boundary on one
// isolated connection; it does not claim to test CLI startup or locking behavior.
async function applyMigration(client: PoolClient, file: string, suffix = ''): Promise<void> {
  const sql = await fs.readFile(path.join(migrationsDirectory, file), 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(sql + suffix);
    await client.query('INSERT INTO lykar_migrations (name) VALUES ($1)', [file]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function installThrough009(client: PoolClient): Promise<string> {
  const files = await migrations();
  assert.equal(files.length, 10, 'expected the complete 001..010 migration sequence');
  for (const file of files.slice(0, 9)) await applyMigration(client, file);
  return files[9];
}

async function seed(client: PoolClient): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [USER, 'migration@example.com']);
    await client.query('INSERT INTO projects (id, name, public_key, created_by) VALUES ($1, $2, $3, $4)', [PROJECT, 'Existing project', 'pk_migration', USER]);
    await client.query(`INSERT INTO project_memberships (id, project_id, user_id, role) VALUES ($1, $2, $3, 'owner')`, [randomUUID(), PROJECT, USER]);
    await client.query(`INSERT INTO pages (id, project_id, name, pathname, created_by)
      VALUES ($1, $3, 'Home', '/', $4), ($2, $3, 'Pricing', '/pricing', $4)`, [PAGE, OTHER_PAGE, PROJECT, USER]);
    await client.query(`INSERT INTO releases (id, project_id, page_id, version, manifest, manifest_hash, source_snapshot, published_by)
      VALUES ($1, $3, $4, 1, '[{"id":"existing-operation"}]', $6, '{"pageHash":"existing-hash"}', $7),
             ($2, $3, $5, 1, '[]', $6, NULL, $7)`, [RELEASE, OTHER_RELEASE, PROJECT, PAGE, OTHER_PAGE, 'a'.repeat(64), USER]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function hasCode(code: string) {
  return (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

async function insertActivation(client: PoolClient, releaseId: string, previousReleaseId: string | null = null): Promise<void> {
  await client.query(`INSERT INTO page_deployment_activations
    (id, page_id, revision, previous_release_id, release_id, action, reason, actor_user_id, idempotency_key, payload_hash)
    VALUES ($1, $2, 1, $3, $4, 'deploy', 'Explicit deploy', $5, 'migration-deploy-01', $6)`,
  [randomUUID(), PAGE, previousReleaseId, releaseId, USER, 'b'.repeat(64)]);
}

test('001..010 installs fresh and deployment history is immutable with same-page release references', {skip}, async () => {
  await isolatedSchema(async client => {
    const deploymentMigration = await installThrough009(client);
    await applyMigration(client, deploymentMigration);
    assert.equal((await client.query('SELECT name FROM lykar_migrations')).rowCount, 10);
    assert.equal((await client.query('SELECT * FROM page_deployment_activations')).rowCount, 0);
    await seed(client);
    await assert.rejects(insertActivation(client, OTHER_RELEASE), hasCode('23503'));
    await assert.rejects(insertActivation(client, RELEASE, OTHER_RELEASE), hasCode('23503'));
    await insertActivation(client, RELEASE);
    await assert.rejects(client.query(`UPDATE page_deployment_activations SET reason = 'Changed' WHERE page_id = $1`, [PAGE]), hasCode('P0001'));
    await assert.rejects(client.query('DELETE FROM page_deployment_activations WHERE page_id = $1', [PAGE]), hasCode('P0001'));
    const history = await client.query('SELECT release_id, reason, revision FROM page_deployment_activations');
    assert.deepEqual(history.rows, [{release_id: RELEASE, reason: 'Explicit deploy', revision: '1'}]);
  });
});

test('010 upgrade preserves existing pages and releases without deploying them', {skip}, async () => {
  await isolatedSchema(async client => {
    const deploymentMigration = await installThrough009(client);
    await seed(client);
    // Migration 006 already drops the original environments table; genuine
    // 001..009 upgrades therefore contain pages/releases but no legacy pointers.
    assert.equal((await client.query("SELECT to_regclass('environments') AS table_name")).rows[0].table_name, null);
    const pagesBefore = (await client.query('SELECT * FROM pages ORDER BY id')).rows;
    const releasesBefore = (await client.query('SELECT * FROM releases ORDER BY id')).rows;
    await applyMigration(client, deploymentMigration);
    assert.deepEqual((await client.query('SELECT * FROM pages ORDER BY id')).rows, pagesBefore);
    assert.deepEqual((await client.query('SELECT * FROM releases ORDER BY id')).rows, releasesBefore);
    // The append-only history is the deployment pointer, so no rows means native.
    assert.equal((await client.query('SELECT * FROM page_deployment_activations')).rowCount, 0);
  });
});

test('a transactional 010 failure rolls back its table, unique constraint and migration ledger entry', {skip}, async () => {
  await isolatedSchema(async client => {
    const deploymentMigration = await installThrough009(client);
    await seed(client);
    const releasesBefore = (await client.query('SELECT * FROM releases ORDER BY id')).rows;
    // Fail after every 010 DDL statement so rollback must undo all its effects.
    await assert.rejects(applyMigration(client, deploymentMigration, '\nSELECT * FROM deliberately_missing_deployment_test_table;'), hasCode('42P01'));
    assert.equal((await client.query("SELECT to_regclass('page_deployment_activations') AS table_name")).rows[0].table_name, null);
    assert.equal((await client.query(`SELECT 1 FROM pg_constraint WHERE conrelid = 'releases'::regclass AND conname = 'releases_page_id_id_key'`)).rowCount, 0);
    assert.equal((await client.query('SELECT name FROM lykar_migrations WHERE name = $1', [deploymentMigration])).rowCount, 0);
    assert.deepEqual((await client.query('SELECT * FROM releases ORDER BY id')).rows, releasesBefore);
    // Retrying the original SQL succeeds after rollback, with no partial state.
    await applyMigration(client, deploymentMigration);
    assert.equal((await client.query('SELECT name FROM lykar_migrations')).rowCount, 10);
    assert.equal((await client.query('SELECT * FROM page_deployment_activations')).rowCount, 0);
  });
});
