import { createHash, randomUUID } from 'node:crypto';

import { parseOperationV1 } from '@lykar/protocol';
import type { OperationV1 } from '@lykar/protocol';
import type { Pool, PoolClient } from 'pg';

import {
  ConflictError,
  DEFAULT_ENVIRONMENT,
  NotFoundError,
  type ActivationResult,
  type AppendOperationsResult,
  type DraftDetails,
  type DraftRecord,
  type ProjectRecord,
  type PublishResult,
  type ReleaseRecord,
  type RuntimeManifest,
  type VersioningRepository,
} from '../domain/versioning';

type DraftRow = {
  id: string;
  project_id: string;
  base_release_id: string | null;
  published_release_id: string | null;
  status: DraftRecord['status'];
  revision: string | number;
  created_at: Date | string;
  updated_at: Date | string;
};

type ReleaseRow = {
  id: string;
  project_id: string;
  version: number;
  base_release_id: string | null;
  manifest?: unknown;
  manifest_hash: string;
  operation_count?: number;
  created_at: Date | string;
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapDraft(row: DraftRow): DraftRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    baseReleaseId: row.base_release_id,
    publishedReleaseId: row.published_release_id,
    status: row.status,
    revision: Number(row.revision),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapRelease(row: ReleaseRow): ReleaseRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    version: row.version,
    baseReleaseId: row.base_release_id,
    manifestHash: row.manifest_hash.trim(),
    operationCount: Number(row.operation_count ?? (Array.isArray(row.manifest) ? row.manifest.length : 0)),
    createdAt: toIso(row.created_at),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
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

  async createProject(input: {
    id: string;
    name: string;
    publicKey: string;
    origins: Array<{ id: string; origin: string }>;
    environmentId: string;
  }): Promise<ProjectRecord> {
    return this.transaction(async client => {
      const projectResult = await client.query<{
        id: string;
        name: string;
        public_key: string;
        created_at: Date | string;
      }>(
        `INSERT INTO projects (id, name, public_key)
         VALUES ($1, $2, $3)
         RETURNING id, name, public_key, created_at`,
        [input.id, input.name, input.publicKey],
      );

      for (const origin of input.origins) {
        await client.query(
          `INSERT INTO project_origins (id, project_id, origin)
           VALUES ($1, $2, $3)`,
          [origin.id, input.id, origin.origin],
        );
      }

      await client.query(
        `INSERT INTO environments (id, project_id, name)
         VALUES ($1, $2, $3)`,
        [input.environmentId, input.id, DEFAULT_ENVIRONMENT],
      );

      const project = projectResult.rows[0];
      return {
        id: project.id,
        name: project.name,
        publicKey: project.public_key,
        origins: input.origins.map(item => item.origin),
        createdAt: toIso(project.created_at),
      };
    });
  }

  async listProjects(): Promise<ProjectRecord[]> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      public_key: string;
      origins: string[];
      created_at: Date | string;
    }>(
      `SELECT p.id, p.name, p.public_key, p.created_at,
              COALESCE(
                json_agg(po.origin ORDER BY po.origin) FILTER (WHERE po.id IS NOT NULL),
                '[]'::json
              ) AS origins
       FROM projects p
       LEFT JOIN project_origins po ON po.project_id = p.id
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
    );

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      publicKey: row.public_key,
      origins: row.origins,
      createdAt: toIso(row.created_at),
    }));
  }

  async createDraft(input: {
    id: string;
    projectId: string;
    baseReleaseId?: string;
  }): Promise<DraftRecord> {
    return this.transaction(async client => {
      const project = await client.query('SELECT id FROM projects WHERE id = $1 FOR UPDATE', [input.projectId]);
      if (project.rowCount === 0) throw new NotFoundError('Project was not found');

      let baseReleaseId = input.baseReleaseId ?? null;
      if (baseReleaseId) {
        const release = await client.query(
          'SELECT id FROM releases WHERE id = $1 AND project_id = $2',
          [baseReleaseId, input.projectId],
        );
        if (release.rowCount === 0) throw new NotFoundError('Base release was not found in this project');
      } else {
        const environment = await client.query<{ active_release_id: string | null }>(
          `SELECT active_release_id FROM environments
           WHERE project_id = $1 AND name = $2`,
          [input.projectId, DEFAULT_ENVIRONMENT],
        );
        baseReleaseId = environment.rows[0]?.active_release_id ?? null;
      }

      const result = await client.query<DraftRow>(
        `INSERT INTO drafts (id, project_id, base_release_id)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [input.id, input.projectId, baseReleaseId],
      );

      return mapDraft(result.rows[0]);
    });
  }

  async listDrafts(projectId: string, status?: DraftRecord['status']): Promise<DraftRecord[]> {
    const project = await this.pool.query('SELECT id FROM projects WHERE id = $1', [projectId]);
    if (project.rowCount === 0) throw new NotFoundError('Project was not found');

    const parameters: unknown[] = [projectId];
    const statusClause = status ? 'AND status = $2' : '';
    if (status) parameters.push(status);

    const result = await this.pool.query<DraftRow>(
      `SELECT * FROM drafts
       WHERE project_id = $1 ${statusClause}
       ORDER BY updated_at DESC`,
      parameters,
    );
    return result.rows.map(mapDraft);
  }

  async getDraft(draftId: string): Promise<DraftDetails> {
    const draftResult = await this.pool.query<DraftRow>('SELECT * FROM drafts WHERE id = $1', [draftId]);
    const draft = draftResult.rows[0];
    if (!draft) throw new NotFoundError('Draft was not found');

    const operationsResult = await this.pool.query<{ data: unknown }>(
      'SELECT data FROM operations WHERE draft_id = $1 ORDER BY ordinal ASC',
      [draftId],
    );

    return {
      draft: mapDraft(draft),
      operations: operationsResult.rows.map(row => parseOperationV1(row.data)),
    };
  }

  async appendOperations(input: {
    draftId: string;
    expectedRevision: number;
    operations: OperationV1[];
  }): Promise<AppendOperationsResult> {
    try {
      return await this.transaction(async client => {
        const draftResult = await client.query<DraftRow>(
          'SELECT * FROM drafts WHERE id = $1 FOR UPDATE',
          [input.draftId],
        );
        const draft = draftResult.rows[0];
        if (!draft) throw new NotFoundError('Draft was not found');
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
            `INSERT INTO operations
              (id, operation_id, draft_id, ordinal, draft_revision, data)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
            [
              randomUUID(),
              operation.id,
              input.draftId,
              firstOrdinal + index,
              nextRevision,
              JSON.stringify(operation),
            ],
          );
        }

        await client.query(
          `UPDATE drafts
           SET revision = $2, updated_at = NOW()
           WHERE id = $1`,
          [input.draftId, nextRevision],
        );

        return { draftId: input.draftId, revision: nextRevision, appended: input.operations.length };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('An operation with this id already exists in the draft');
      }
      throw error;
    }
  }

  async publishDraft(input: {
    draftId: string;
    expectedRevision: number;
    environment: string;
    releaseId: string;
    environmentId: string;
    activationId: string;
  }): Promise<PublishResult> {
    return this.transaction(async client => {
      const draftResult = await client.query<DraftRow>(
        'SELECT * FROM drafts WHERE id = $1 FOR UPDATE',
        [input.draftId],
      );
      const draft = draftResult.rows[0];
      if (!draft) throw new NotFoundError('Draft was not found');
      if (draft.status !== 'open') throw new ConflictError('Only an open draft can be published');

      const currentRevision = Number(draft.revision);
      if (currentRevision !== input.expectedRevision) {
        throw new ConflictError('Draft revision does not match', {
          expectedRevision: input.expectedRevision,
          actualRevision: currentRevision,
        });
      }

      await client.query('SELECT id FROM projects WHERE id = $1 FOR UPDATE', [draft.project_id]);

      let baseManifest: OperationV1[] = [];
      if (draft.base_release_id) {
        const baseResult = await client.query<{ manifest: unknown }>(
          'SELECT manifest FROM releases WHERE id = $1 AND project_id = $2',
          [draft.base_release_id, draft.project_id],
        );
        if (baseResult.rowCount === 0) throw new ConflictError('Draft base release no longer exists');
        const rawManifest = baseResult.rows[0].manifest;
        if (!Array.isArray(rawManifest)) throw new Error('Stored release manifest is not an array');
        baseManifest = rawManifest.map(parseOperationV1);
      }

      const operationsResult = await client.query<{ data: unknown }>(
        'SELECT data FROM operations WHERE draft_id = $1 ORDER BY ordinal ASC',
        [input.draftId],
      );
      const draftOperations = operationsResult.rows.map(row => parseOperationV1(row.data));
      const operationIds = new Set(baseManifest.map(operation => operation.id));
      for (const operation of draftOperations) {
        if (operationIds.has(operation.id)) {
          throw new ConflictError(`Operation id already exists in the base release: ${operation.id}`);
        }
        operationIds.add(operation.id);
      }
      const manifest = [...baseManifest, ...draftOperations];
      const manifestHash = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');

      const versionResult = await client.query<{ version: number }>(
        'SELECT COALESCE(MAX(version), 0) + 1 AS version FROM releases WHERE project_id = $1',
        [draft.project_id],
      );
      const version = Number(versionResult.rows[0].version);

      const releaseResult = await client.query<ReleaseRow>(
        `INSERT INTO releases
          (id, project_id, version, base_release_id, manifest, manifest_hash)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         RETURNING *, jsonb_array_length(manifest) AS operation_count`,
        [input.releaseId, draft.project_id, version, draft.base_release_id, JSON.stringify(manifest), manifestHash],
      );

      const previousEnvironment = await client.query<{ id: string; active_release_id: string | null }>(
        `SELECT id, active_release_id FROM environments
         WHERE project_id = $1 AND name = $2
         FOR UPDATE`,
        [draft.project_id, input.environment],
      );
      const previousReleaseId = previousEnvironment.rows[0]?.active_release_id ?? null;

      const environmentResult = await client.query<{ id: string }>(
        `INSERT INTO environments (id, project_id, name, active_release_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (project_id, name)
         DO UPDATE SET active_release_id = EXCLUDED.active_release_id, updated_at = NOW()
         RETURNING id`,
        [input.environmentId, draft.project_id, input.environment, input.releaseId],
      );

      await client.query(
        `INSERT INTO release_activations
          (id, project_id, environment_id, previous_release_id, release_id, reason)
         VALUES ($1, $2, $3, $4, $5, 'publish')`,
        [input.activationId, draft.project_id, environmentResult.rows[0].id, previousReleaseId, input.releaseId],
      );

      const publishedDraftResult = await client.query<DraftRow>(
        `UPDATE drafts
         SET status = 'published', published_release_id = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [input.draftId, input.releaseId],
      );

      return {
        draft: mapDraft(publishedDraftResult.rows[0]),
        release: mapRelease(releaseResult.rows[0]),
        environment: input.environment,
      };
    });
  }

  async activateRelease(input: {
    projectId: string;
    releaseId: string;
    environment: string;
    environmentId: string;
    activationId: string;
  }): Promise<ActivationResult> {
    return this.transaction(async client => {
      const project = await client.query('SELECT id FROM projects WHERE id = $1 FOR UPDATE', [input.projectId]);
      if (project.rowCount === 0) throw new NotFoundError('Project was not found');

      const release = await client.query(
        'SELECT id FROM releases WHERE id = $1 AND project_id = $2',
        [input.releaseId, input.projectId],
      );
      if (release.rowCount === 0) throw new NotFoundError('Release was not found in this project');

      const previousEnvironment = await client.query<{ id: string; active_release_id: string | null }>(
        `SELECT id, active_release_id FROM environments
         WHERE project_id = $1 AND name = $2
         FOR UPDATE`,
        [input.projectId, input.environment],
      );
      const previousReleaseId = previousEnvironment.rows[0]?.active_release_id ?? null;

      const environmentResult = await client.query<{ id: string }>(
        `INSERT INTO environments (id, project_id, name, active_release_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (project_id, name)
         DO UPDATE SET active_release_id = EXCLUDED.active_release_id, updated_at = NOW()
         RETURNING id`,
        [input.environmentId, input.projectId, input.environment, input.releaseId],
      );

      await client.query(
        `INSERT INTO release_activations
          (id, project_id, environment_id, previous_release_id, release_id, reason)
         VALUES ($1, $2, $3, $4, $5, 'rollback')`,
        [input.activationId, input.projectId, environmentResult.rows[0].id, previousReleaseId, input.releaseId],
      );

      return {
        projectId: input.projectId,
        environment: input.environment,
        previousReleaseId,
        releaseId: input.releaseId,
      };
    });
  }

  async listReleases(projectId: string): Promise<ReleaseRecord[]> {
    const project = await this.pool.query('SELECT id FROM projects WHERE id = $1', [projectId]);
    if (project.rowCount === 0) throw new NotFoundError('Project was not found');

    const result = await this.pool.query<ReleaseRow>(
      `SELECT id, project_id, version, base_release_id, manifest_hash, created_at,
              jsonb_array_length(manifest) AS operation_count
       FROM releases
       WHERE project_id = $1
       ORDER BY version DESC`,
      [projectId],
    );
    return result.rows.map(mapRelease);
  }

  async resolveRuntimeManifest(input: {
    publicKey: string;
    version?: number;
    environment: string;
  }): Promise<RuntimeManifest> {
    const parameters: unknown[] = [input.publicKey];
    let sql: string;

    if (input.version !== undefined) {
      parameters.push(input.version);
      sql = `
        SELECT p.id AS project_id, r.*
        FROM projects p
        JOIN releases r ON r.project_id = p.id
        WHERE p.public_key = $1 AND r.version = $2
      `;
    } else {
      parameters.push(input.environment);
      sql = `
        SELECT p.id AS project_id, r.*
        FROM projects p
        JOIN environments e ON e.project_id = p.id AND e.name = $2
        JOIN releases r ON r.id = e.active_release_id
        WHERE p.public_key = $1
      `;
    }

    const result = await this.pool.query<ReleaseRow & { project_id: string }>(sql, parameters);
    const release = result.rows[0];
    if (!release) throw new NotFoundError('Published release was not found');
    if (!Array.isArray(release.manifest)) throw new Error('Stored release manifest is not an array');

    return {
      schemaVersion: 1,
      projectId: release.project_id,
      releaseId: release.id,
      version: release.version,
      manifestHash: release.manifest_hash.trim(),
      operations: release.manifest.map(parseOperationV1),
      createdAt: toIso(release.created_at),
    };
  }
}
