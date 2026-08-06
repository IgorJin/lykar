import { createHash, randomUUID } from 'node:crypto';

import { parseOperationV1 } from '@lykar/protocol';
import type { OperationV1 } from '@lykar/protocol';
import type { Pool, PoolClient } from 'pg';

import { rolesWithPermission, type ProjectPermission } from '../domain/memberships';
import {
  ConflictError,
  DEFAULT_ENVIRONMENT,
  ForbiddenError,
  NotFoundError,
  type ActivationResult,
  type AppendOperationsResult,
  type DraftDetails,
  type DraftRecord,
  type PageRecord,
  type ProjectRecord,
  type PublishResult,
  type ReleaseRecord,
  type RuntimeManifest,
  type VersioningRepository,
} from '../domain/versioning';

type Queryable = Pick<Pool | PoolClient, 'query'>;
type DraftRow = {
  id: string;
  project_id: string;
  page_id: string;
  base_release_id: string | null;
  published_release_id: string | null;
  status: DraftRecord['status'];
  revision: string | number;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};
type ReleaseRow = {
  id: string;
  project_id: string;
  page_id: string;
  version: number;
  base_release_id: string | null;
  manifest?: unknown;
  manifest_hash: string;
  operation_count?: number;
  published_by: string | null;
  created_at: Date | string;
};
type PageRow = {
  id: string;
  project_id: string;
  name: string;
  pathname: string;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapPage(row: PageRow): PageRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    pathname: row.pathname,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapDraft(row: DraftRow): DraftRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    pageId: row.page_id,
    baseReleaseId: row.base_release_id,
    publishedReleaseId: row.published_release_id,
    status: row.status,
    revision: Number(row.revision),
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapRelease(row: ReleaseRow): ReleaseRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    pageId: row.page_id,
    version: Number(row.version),
    baseReleaseId: row.base_release_id,
    manifestHash: row.manifest_hash.trim(),
    operationCount: Number(row.operation_count ?? (Array.isArray(row.manifest) ? row.manifest.length : 0)),
    publishedBy: row.published_by,
    createdAt: toIso(row.created_at),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

async function requireProjectAccess(
  database: Queryable,
  userId: string,
  projectId: string,
  permission: ProjectPermission = 'view',
): Promise<void> {
  const result = await database.query(
    `SELECT p.id
     FROM projects p
     JOIN project_memberships m ON m.project_id = p.id
     WHERE p.id = $1 AND m.user_id = $2 AND m.revoked_at IS NULL
       AND m.role = ANY($3::text[])`,
    [projectId, userId, rolesWithPermission(permission)],
  );
  if (result.rowCount === 0) throw new ForbiddenError();
}

async function requirePageAccess(
  database: Queryable,
  userId: string,
  pageId: string,
  permission: ProjectPermission = 'view',
): Promise<PageRow> {
  const result = await database.query<PageRow>(
    `SELECT pg.*
     FROM pages pg
     JOIN project_memberships m ON m.project_id = pg.project_id
     WHERE pg.id = $1 AND m.user_id = $2 AND m.revoked_at IS NULL
       AND m.role = ANY($3::text[])`,
    [pageId, userId, rolesWithPermission(permission)],
  );
  const page = result.rows[0];
  if (!page) throw new ForbiddenError();
  return page;
}

async function requireDraftAccess(
  database: Queryable,
  userId: string,
  draftId: string,
  permission: ProjectPermission = 'view',
  lock = false,
): Promise<DraftRow> {
  const result = await database.query<DraftRow>(
    `SELECT d.*
     FROM drafts d
     JOIN project_memberships m ON m.project_id = d.project_id
     WHERE d.id = $1 AND m.user_id = $2 AND m.revoked_at IS NULL
       AND m.role = ANY($3::text[])
     ${lock ? 'FOR UPDATE OF d' : ''}`,
    [draftId, userId, rolesWithPermission(permission)],
  );
  const draft = result.rows[0];
  if (!draft) throw new ForbiddenError();
  return draft;
}

export class PostgresVersioningRepository implements VersioningRepository {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createProject(input: Parameters<VersioningRepository['createProject']>[0]): Promise<ProjectRecord> {
    try {
      return await this.transaction(async client => {
        const projectResult = await client.query<{
          id: string; name: string; public_key: string; created_by: string | null; created_at: Date | string;
        }>(
          `INSERT INTO projects (id, name, public_key, created_by)
           VALUES ($1, $2, $3, $4)
           RETURNING id, name, public_key, created_by, created_at`,
          [input.id, input.name, input.publicKey, input.ownerUserId],
        );
        for (const origin of input.origins) {
          await client.query(
            'INSERT INTO project_origins (id, project_id, origin) VALUES ($1, $2, $3)',
            [origin.id, input.id, origin.origin],
          );
        }
        await client.query(
          `INSERT INTO project_memberships (id, project_id, user_id, role)
           VALUES ($1, $2, $3, 'owner')`,
          [randomUUID(), input.id, input.ownerUserId],
        );
        await client.query(
          `INSERT INTO pages (id, project_id, name, pathname, created_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [input.rootPage.id, input.id, input.rootPage.name, input.rootPage.pathname, input.ownerUserId],
        );
        await client.query(
          `INSERT INTO environments (id, project_id, page_id, name)
           VALUES ($1, $2, $3, $4)`,
          [input.rootPage.environmentId, input.id, input.rootPage.id, DEFAULT_ENVIRONMENT],
        );
        const project = projectResult.rows[0];
        return {
          id: project.id,
          name: project.name,
          publicKey: project.public_key,
          origins: input.origins.map(item => item.origin),
          createdBy: project.created_by,
          createdAt: toIso(project.created_at),
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('A project or origin already exists');
      throw error;
    }
  }

  async listProjects(userId: string): Promise<ProjectRecord[]> {
    const result = await this.pool.query<{
      id: string; name: string; public_key: string; origins: string[]; created_by: string | null; created_at: Date | string;
    }>(
      `SELECT p.id, p.name, p.public_key, p.created_by, p.created_at,
              COALESCE(json_agg(po.origin ORDER BY po.origin) FILTER (WHERE po.id IS NOT NULL), '[]'::json) AS origins
       FROM projects p
       JOIN project_memberships m ON m.project_id = p.id AND m.user_id = $1 AND m.revoked_at IS NULL
       LEFT JOIN project_origins po ON po.project_id = p.id
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [userId],
    );
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      publicKey: row.public_key,
      origins: row.origins,
      createdBy: row.created_by,
      createdAt: toIso(row.created_at),
    }));
  }

  async createPage(input: Parameters<VersioningRepository['createPage']>[0]): Promise<PageRecord> {
    try {
      return await this.transaction(async client => {
        await requireProjectAccess(client, input.userId, input.projectId, 'publish');
        const result = await client.query<PageRow>(
          `INSERT INTO pages (id, project_id, name, pathname, created_by)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [input.id, input.projectId, input.name, input.pathname, input.userId],
        );
        await client.query(
          `INSERT INTO environments (id, project_id, page_id, name)
           VALUES ($1, $2, $3, $4)`,
          [input.environmentId, input.projectId, input.id, DEFAULT_ENVIRONMENT],
        );
        return mapPage(result.rows[0]);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('This pathname already exists in the project');
      throw error;
    }
  }

  async listPages(userId: string, projectId: string): Promise<PageRecord[]> {
    await requireProjectAccess(this.pool, userId, projectId);
    const result = await this.pool.query<PageRow>(
      'SELECT * FROM pages WHERE project_id = $1 ORDER BY pathname ASC',
      [projectId],
    );
    return result.rows.map(mapPage);
  }

  async createDraft(input: Parameters<VersioningRepository['createDraft']>[0]): Promise<DraftRecord> {
    return this.transaction(async client => {
      const page = await requirePageAccess(client, input.userId, input.pageId, 'edit');
      let baseReleaseId = input.baseReleaseId ?? null;
      if (baseReleaseId) {
        const release = await client.query('SELECT id FROM releases WHERE id = $1 AND page_id = $2', [baseReleaseId, page.id]);
        if (release.rowCount === 0) throw new NotFoundError('Base release was not found on this page');
      } else {
        const environment = await client.query<{ active_release_id: string | null }>(
          'SELECT active_release_id FROM environments WHERE page_id = $1 AND name = $2',
          [page.id, DEFAULT_ENVIRONMENT],
        );
        baseReleaseId = environment.rows[0]?.active_release_id ?? null;
      }
      const result = await client.query<DraftRow>(
        `INSERT INTO drafts (id, project_id, page_id, base_release_id, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [input.id, page.project_id, page.id, baseReleaseId, input.userId],
      );
      return mapDraft(result.rows[0]);
    });
  }

  async listDrafts(userId: string, pageId: string, status?: DraftRecord['status']): Promise<DraftRecord[]> {
    await requirePageAccess(this.pool, userId, pageId);
    const parameters: unknown[] = [pageId];
    const statusClause = status ? 'AND status = $2' : '';
    if (status) parameters.push(status);
    const result = await this.pool.query<DraftRow>(
      `SELECT * FROM drafts WHERE page_id = $1 ${statusClause} ORDER BY updated_at DESC`,
      parameters,
    );
    return result.rows.map(mapDraft);
  }

  async getDraft(userId: string, draftId: string): Promise<DraftDetails> {
    const draft = await requireDraftAccess(this.pool, userId, draftId);
    const operationsResult = await this.pool.query<{ data: unknown }>(
      'SELECT data FROM operations WHERE draft_id = $1 ORDER BY ordinal ASC',
      [draftId],
    );
    return { draft: mapDraft(draft), operations: operationsResult.rows.map(row => parseOperationV1(row.data)) };
  }

  async appendOperations(input: Parameters<VersioningRepository['appendOperations']>[0]): Promise<AppendOperationsResult> {
    try {
      return await this.transaction(async client => {
        const draft = await requireDraftAccess(client, input.userId, input.draftId, 'edit', true);
        if (draft.status !== 'open') throw new ConflictError('Only an open draft can accept operations');
        const currentRevision = Number(draft.revision);
        if (currentRevision !== input.expectedRevision) {
          throw new ConflictError('Draft revision does not match', {
            expectedRevision: input.expectedRevision,
            actualRevision: currentRevision,
          });
        }
        const ordinalResult = await client.query<{ ordinal: string | number }>(
          'SELECT COALESCE(MAX(ordinal), 0) AS ordinal FROM operations WHERE draft_id = $1',
          [input.draftId],
        );
        const firstOrdinal = Number(ordinalResult.rows[0].ordinal) + 1;
        const nextRevision = currentRevision + 1;
        for (const [index, operation] of input.operations.entries()) {
          await client.query(
            `INSERT INTO operations (id, operation_id, draft_id, ordinal, draft_revision, data, created_by)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
            [
              randomUUID(), operation.id, input.draftId, firstOrdinal + index, nextRevision,
              JSON.stringify(operation), input.userId,
            ],
          );
        }
        await client.query('UPDATE drafts SET revision = $2, updated_at = NOW() WHERE id = $1', [input.draftId, nextRevision]);
        return { draftId: input.draftId, revision: nextRevision, appended: input.operations.length };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('An operation with this id already exists in the draft');
      throw error;
    }
  }

  async publishDraft(input: Parameters<VersioningRepository['publishDraft']>[0]): Promise<PublishResult> {
    return this.transaction(async client => {
      const draft = await requireDraftAccess(client, input.userId, input.draftId, 'publish', true);
      if (draft.status !== 'open') throw new ConflictError('Only an open draft can be published');
      const currentRevision = Number(draft.revision);
      if (currentRevision !== input.expectedRevision) {
        throw new ConflictError('Draft revision does not match', {
          expectedRevision: input.expectedRevision,
          actualRevision: currentRevision,
        });
      }
      await client.query('SELECT id FROM pages WHERE id = $1 FOR UPDATE', [draft.page_id]);

      let baseManifest: OperationV1[] = [];
      if (draft.base_release_id) {
        const baseResult = await client.query<{ manifest: unknown }>(
          'SELECT manifest FROM releases WHERE id = $1 AND page_id = $2',
          [draft.base_release_id, draft.page_id],
        );
        if (baseResult.rowCount === 0) throw new ConflictError('Draft base release no longer exists');
        if (!Array.isArray(baseResult.rows[0].manifest)) throw new Error('Stored release manifest is not an array');
        baseManifest = baseResult.rows[0].manifest.map(parseOperationV1);
      }
      const operationsResult = await client.query<{ data: unknown }>(
        'SELECT data FROM operations WHERE draft_id = $1 ORDER BY ordinal ASC',
        [input.draftId],
      );
      const draftOperations = operationsResult.rows.map(row => parseOperationV1(row.data));
      const operationIds = new Set(baseManifest.map(operation => operation.id));
      for (const operation of draftOperations) {
        if (operationIds.has(operation.id)) throw new ConflictError(`Operation id already exists in the base release: ${operation.id}`);
        operationIds.add(operation.id);
      }
      const manifest = [...baseManifest, ...draftOperations];
      const versionResult = await client.query<{ version: number }>(
        'SELECT COALESCE(MAX(version), 0) + 1 AS version FROM releases WHERE page_id = $1',
        [draft.page_id],
      );
      const version = Number(versionResult.rows[0].version);
      const manifestHash = createHash('sha256').update(JSON.stringify({
        schemaVersion: 1,
        projectId: draft.project_id,
        pageId: draft.page_id,
        releaseId: input.releaseId,
        version,
        operations: manifest,
      })).digest('hex');
      const releaseResult = await client.query<ReleaseRow>(
        `INSERT INTO releases
          (id, project_id, page_id, version, base_release_id, manifest, manifest_hash, published_by)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
         RETURNING *, jsonb_array_length(manifest) AS operation_count`,
        [
          input.releaseId, draft.project_id, draft.page_id, version, draft.base_release_id,
          JSON.stringify(manifest), manifestHash, input.userId,
        ],
      );

      const previousEnvironment = await client.query<{ id: string; active_release_id: string | null }>(
        'SELECT id, active_release_id FROM environments WHERE page_id = $1 AND name = $2 FOR UPDATE',
        [draft.page_id, input.environment],
      );
      const previousReleaseId = previousEnvironment.rows[0]?.active_release_id ?? null;
      const environmentResult = await client.query<{ id: string }>(
        `INSERT INTO environments (id, project_id, page_id, name, active_release_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (page_id, name)
         DO UPDATE SET active_release_id = EXCLUDED.active_release_id, updated_at = NOW()
         RETURNING id`,
        [input.environmentId, draft.project_id, draft.page_id, input.environment, input.releaseId],
      );
      await client.query(
        `INSERT INTO release_activations
          (id, project_id, page_id, environment_id, previous_release_id, release_id, reason, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'publish', $7)`,
        [
          input.activationId, draft.project_id, draft.page_id, environmentResult.rows[0].id,
          previousReleaseId, input.releaseId, input.userId,
        ],
      );
      const publishedDraftResult = await client.query<DraftRow>(
        `UPDATE drafts SET status = 'published', published_release_id = $2, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [input.draftId, input.releaseId],
      );
      return {
        draft: mapDraft(publishedDraftResult.rows[0]),
        release: mapRelease(releaseResult.rows[0]),
        environment: input.environment,
      };
    });
  }

  async activateRelease(input: Parameters<VersioningRepository['activateRelease']>[0]): Promise<ActivationResult> {
    return this.transaction(async client => {
      const page = await requirePageAccess(client, input.userId, input.pageId, 'publish');
      const release = await client.query('SELECT id FROM releases WHERE id = $1 AND page_id = $2', [input.releaseId, page.id]);
      if (release.rowCount === 0) throw new NotFoundError('Release was not found on this page');
      const previousEnvironment = await client.query<{ id: string; active_release_id: string | null }>(
        'SELECT id, active_release_id FROM environments WHERE page_id = $1 AND name = $2 FOR UPDATE',
        [page.id, input.environment],
      );
      const previousReleaseId = previousEnvironment.rows[0]?.active_release_id ?? null;
      const environmentResult = await client.query<{ id: string }>(
        `INSERT INTO environments (id, project_id, page_id, name, active_release_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (page_id, name)
         DO UPDATE SET active_release_id = EXCLUDED.active_release_id, updated_at = NOW()
         RETURNING id`,
        [input.environmentId, page.project_id, page.id, input.environment, input.releaseId],
      );
      await client.query(
        `INSERT INTO release_activations
          (id, project_id, page_id, environment_id, previous_release_id, release_id, reason, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'rollback', $7)`,
        [
          input.activationId, page.project_id, page.id, environmentResult.rows[0].id,
          previousReleaseId, input.releaseId, input.userId,
        ],
      );
      return {
        projectId: page.project_id,
        pageId: page.id,
        environment: input.environment,
        previousReleaseId,
        releaseId: input.releaseId,
        activatedBy: input.userId,
      };
    });
  }

  async listReleases(userId: string, pageId: string): Promise<ReleaseRecord[]> {
    await requirePageAccess(this.pool, userId, pageId);
    const result = await this.pool.query<ReleaseRow>(
      `SELECT id, project_id, page_id, version, base_release_id, manifest_hash, published_by, created_at,
              jsonb_array_length(manifest) AS operation_count
       FROM releases WHERE page_id = $1 ORDER BY version DESC`,
      [pageId],
    );
    return result.rows.map(mapRelease);
  }

  async resolveRuntimeManifest(input: Parameters<VersioningRepository['resolveRuntimeManifest']>[0]): Promise<RuntimeManifest> {
    const parameters: unknown[] = [input.publicKey, input.pathname];
    let sql: string;
    if (input.version !== undefined) {
      parameters.push(input.version);
      sql = `
        SELECT p.id AS project_id, pg.pathname, r.*
        FROM projects p
        JOIN pages pg ON pg.project_id = p.id AND pg.pathname = $2
        JOIN releases r ON r.page_id = pg.id AND r.version = $3
        WHERE p.public_key = $1`;
    } else {
      parameters.push(input.environment);
      sql = `
        SELECT p.id AS project_id, pg.pathname, r.*
        FROM projects p
        JOIN pages pg ON pg.project_id = p.id AND pg.pathname = $2
        JOIN environments e ON e.page_id = pg.id AND e.name = $3
        JOIN releases r ON r.id = e.active_release_id
        WHERE p.public_key = $1`;
    }
    const result = await this.pool.query<ReleaseRow & { pathname: string }>(sql, parameters);
    const release = result.rows[0];
    if (!release) throw new NotFoundError('Published release was not found for this page');
    if (!Array.isArray(release.manifest)) throw new Error('Stored release manifest is not an array');
    return {
      schemaVersion: 1,
      projectId: release.project_id,
      pageId: release.page_id,
      pathname: release.pathname,
      releaseId: release.id,
      version: Number(release.version),
      manifestHash: release.manifest_hash.trim(),
      operations: release.manifest.map(parseOperationV1),
      createdAt: toIso(release.created_at),
    };
  }
}
