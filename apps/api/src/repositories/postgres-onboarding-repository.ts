import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

import { ForbiddenError, NotFoundError, VersioningError, type PageRecord } from '../domain/versioning';
import type { OriginRecord } from '../domain/onboarding';

type OriginRow = {id: string; origin: string; verified_at: Date | null; verification_method: string | null};
type PageRow = {id: string; project_id: string; name: string; pathname: string; created_by: string | null; created_at: Date; updated_at: Date};
const mapOrigin = (row: OriginRow): OriginRecord => ({id: row.id, origin: row.origin,
  verifiedAt: row.verified_at?.toISOString() ?? null, verificationMethod: row.verification_method});
const mapPage = (row: PageRow): PageRecord => ({id: row.id, projectId: row.project_id, name: row.name,
  pathname: row.pathname, createdBy: row.created_by, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString()});

export class PostgresOnboardingRepository {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(callback: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await this.pool.connect();
    try { await db.query('BEGIN'); const result = await callback(db); await db.query('COMMIT'); return result; }
    catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }

  private async access(db: Pool | PoolClient, user: string, project: string, mutate = false) {
    const result = await db.query(`SELECT p.id FROM projects p JOIN project_memberships m ON m.project_id=p.id
      AND m.user_id=$1 AND m.revoked_at IS NULL WHERE p.id=$2 AND m.role=ANY($3::text[])
      ${mutate ? 'FOR UPDATE OF p FOR SHARE OF m' : ''}`,
    [user, project, mutate ? ['owner', 'admin'] : ['owner', 'admin', 'editor', 'viewer']]);
    if (!result.rows[0]) throw new ForbiddenError();
  }

  async origins(user: string, project: string): Promise<OriginRecord[]> {
    await this.access(this.pool, user, project);
    const result = await this.pool.query<OriginRow>(
      'SELECT * FROM project_origins WHERE project_id=$1 ORDER BY created_at,id', [project]);
    return result.rows.map(mapOrigin);
  }

  async addOrigin(user: string, project: string, origin: string) {
    return this.transaction(async db => {
      await this.access(db, user, project, true);
      const current = await db.query<OriginRow>('SELECT * FROM project_origins WHERE project_id=$1 ORDER BY created_at,id', [project]);
      const existing = current.rows.find(row => row.origin === origin);
      if (existing) return {origin: mapOrigin(existing), created: false};
      if (current.rows.length >= 20) throw new VersioningError('Сайт может содержать не более 20 разрешённых origins.', 'ORIGIN_LIMIT_REACHED', 409);
      const result = await db.query<OriginRow>(
        'INSERT INTO project_origins(id,project_id,origin) VALUES($1,$2,$3) RETURNING *', [randomUUID(), project, origin]);
      return {origin: mapOrigin(result.rows[0]), created: true};
    });
  }

  async removeOrigin(user: string, project: string, origin: string) {
    return this.transaction(async db => {
      await this.access(db, user, project, true);
      const current = await db.query<OriginRow>('SELECT * FROM project_origins WHERE project_id=$1 FOR UPDATE', [project]);
      const target = current.rows.find(row => row.origin === origin);
      if (!target) throw new NotFoundError('Origin не найден.');
      if (current.rows.length <= 1) throw new VersioningError('Добавьте другой origin перед удалением последнего.', 'LAST_ORIGIN_REQUIRED', 409);
      // Cascading foreign keys remove every proof and probe. Runtime deployment access
      // joins the current verified origin rows, so a deleted origin loses access immediately.
      await db.query('DELETE FROM project_origins WHERE id=$1', [target.id]);
    });
  }

  async importPages(user: string, project: string, selected: string[], validate: (url: string, origins: string[]) => string) {
    return this.transaction(async db => {
      await this.access(db, user, project, true);
      const origins = await db.query<{origin: string}>('SELECT origin FROM project_origins WHERE project_id=$1 FOR SHARE', [project]);
      // Revalidate the full selection against the current allowlist before inserting any row.
      const paths = selected.map(url => validate(url, origins.rows.map(row => row.origin)));
      const uniquePaths = [...new Set(paths)];
      const inserted = await db.query<PageRow>(`INSERT INTO pages(id,project_id,name,pathname,created_by)
        SELECT entry.id,$1,entry.name,entry.pathname,$2
        FROM UNNEST($3::uuid[],$4::text[],$5::text[]) AS entry(id,name,pathname)
        ON CONFLICT(project_id,pathname) DO NOTHING RETURNING *`,
      [project, user, uniquePaths.map(() => randomUUID()), uniquePaths.map(path => path.slice(0, 120)), uniquePaths]);
      const pages = inserted.rows.map(mapPage);
      return {pages, imported: pages.length, duplicates: selected.length - pages.length};
    });
  }
}
