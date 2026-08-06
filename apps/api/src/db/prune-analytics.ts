import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required to prune analytics');

const retentionDays = Number(process.env.LYKAR_ANALYTICS_RETENTION_DAYS ?? 90);
if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
  throw new Error('LYKAR_ANALYTICS_RETENTION_DAYS must be an integer between 1 and 3650');
}

async function pruneAnalytics(): Promise<void> {
  const pool = new Pool({ connectionString });
  try {
    const result = await pool.query(
      `DELETE FROM analytics_events
       WHERE received_at < NOW() - make_interval(days => $1::integer)`,
      [retentionDays],
    );
    console.log(`Deleted ${result.rowCount ?? 0} analytics events older than ${retentionDays} days`);
  } finally {
    await pool.end();
  }
}

pruneAnalytics().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
