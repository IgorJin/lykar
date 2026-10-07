import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { Pool } from 'pg';
import { PostgresAnalyticsRepository } from '../repositories/postgres-analytics-repository';

const databaseUrl = process.env.LYKAR_TEST_DATABASE_URL;
test('conversion goal migration preserves legacy rollups and backfills retained named events transactionally', {
  skip: databaseUrl ? false : 'LYKAR_TEST_DATABASE_URL is not configured',
}, async () => {
  const admin = new Pool({ connectionString: databaseUrl });
  const schema = `analytics_${randomUUID().replace(/-/g, '')}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, max: 1 });
  try {
    const directory = path.resolve(__dirname, '../../migrations');
    const files = (await readdir(directory)).filter(name => /^0(0[1-9]|1[0-3])_/.test(name)).sort();
    assert.equal(files.length, 13);
    for (const file of files) await pool.query(await readFile(path.join(directory, file), 'utf8'));
    const user = randomUUID(), project = randomUUID(), page = randomUUID(), experiment = randomUUID();
    const variantA = randomUUID(), variantB = randomUUID(), assignment = randomUUID();
    await pool.query('BEGIN');
    await pool.query('INSERT INTO users (id,email) VALUES ($1,$2)', [user,'legacy-analytics@example.com']);
    await pool.query('INSERT INTO projects (id,name,public_key,created_by) VALUES ($1,$2,$3,$4)', [project,'Legacy','pk_legacy_analytics',user]);
    await pool.query("INSERT INTO project_memberships (id,project_id,user_id,role) VALUES ($1,$2,$3,'owner')", [randomUUID(),project,user]);
    await pool.query("INSERT INTO pages (id,project_id,name,pathname,created_by) VALUES ($1,$2,'Home','/',$3)", [page,project,user]);
    await pool.query("INSERT INTO experiments (id,project_id,page_id,name,status,created_by,first_activated_at) VALUES ($1,$2,$3,'Legacy','paused',$4,NOW())", [experiment,project,page,user]);
    await pool.query("INSERT INTO experiment_variants (id,experiment_id,variant_key) VALUES ($1,$3,'A'),($2,$3,'B')", [variantA,variantB,experiment]);
    await pool.query(`INSERT INTO experiment_assignments (id,experiment_id,variant_id,visitor_hash,first_exposed_at,first_converted_at,exposure_count,conversion_count)
      VALUES ($1,$2,$3,$4,NOW(),NOW(),1,7)`, [assignment,experiment,variantA,'a'.repeat(64)]);
    for (let index = 0; index < 2; index++) await pool.query("INSERT INTO analytics_events (id,client_event_id,assignment_id,event_type,event_name,occurred_at) VALUES ($1,$2,$3,'conversion','signup',NOW())", [randomUUID(),randomUUID(),assignment]);
    await pool.query('COMMIT');
    const sql = await readFile(path.join(directory, '014_conversion_goals_and_tests.sql'), 'utf8');
    await pool.query('BEGIN');
    await pool.query(sql);
    await pool.query('ROLLBACK');
    assert.equal((await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name='experiments' AND column_name='conversion_event_name'", [schema])).rowCount, 0);
    await pool.query('BEGIN');
    await pool.query(sql);
    await pool.query('COMMIT');
    const repository = new PostgresAnalyticsRepository(pool);
    const report = await repository.getReport(user,experiment);
    assert.equal(report.conversionEventName, null);
    assert.deepEqual([report.variants[0].visitors,report.variants[0].views,report.variants[0].conversions,report.variants[0].uniqueConversions], [1,1,7,1]);
    assert.equal(Number((await pool.query('SELECT conversion_count FROM analytics_conversion_totals WHERE assignment_id=$1 AND event_name=$2', [assignment,'signup'])).rows[0].conversion_count), 2);
    await pool.query('DELETE FROM analytics_events WHERE assignment_id=$1', [assignment]);
    assert.equal((await repository.getReport(user,experiment)).variants[0].conversions, 7);
    assert.equal(Number((await pool.query('SELECT conversion_count FROM analytics_conversion_totals WHERE assignment_id=$1', [assignment])).rows[0].conversion_count), 2);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
});
