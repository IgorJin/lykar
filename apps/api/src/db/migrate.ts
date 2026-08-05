import { promises as fs } from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to run migrations');
}

async function migrate() {
  const migrationsDirectory = path.resolve(process.cwd(), 'migrations');
  const migrationFiles = (await fs.readdir(migrationsDirectory))
    .filter(file => /^\d+.*\.sql$/.test(file))
    .sort();

  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock(hashtext('lykar:migrations'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS lykar_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const appliedResult = await client.query<{ name: string }>('SELECT name FROM lykar_migrations');
    const applied = new Set(appliedResult.rows.map(row => row.name));

    for (const file of migrationFiles) {
      if (applied.has(file)) continue;

      const sql = await fs.readFile(path.join(migrationsDirectory, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO lykar_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Applied migration ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('lykar:migrations'))");
    client.release();
    await pool.end();
  }
}

migrate().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
