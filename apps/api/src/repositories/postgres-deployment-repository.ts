import { isSourceSnapshotV1, parseOperation } from '@lykar/protocol';
import type { Pool, PoolClient } from 'pg';

import type {
  DeploymentActivation, DeploymentHistory, DeploymentRepository, DeploymentResolution,
  DeploymentResult, DeploymentState,
} from '../domain/deployments';
import { rolesWithPermission } from '../domain/memberships';
import { ConflictError, ForbiddenError, NotFoundError, VersioningError } from '../domain/versioning';

type ActivationRow = {
  id: string; page_id: string; revision: string; previous_release_id: string | null;
  release_id: string | null; action: DeploymentActivation['action']; reason: string;
  actor_user_id: string; created_at: Date; payload_hash: string;
};
type Queryable = Pick<Pool | PoolClient, 'query'>;

function mapActivation(row: ActivationRow): DeploymentActivation {
  return {
    id: row.id, pageId: row.page_id, revision: Number(row.revision),
    previousReleaseId: row.previous_release_id, releaseId: row.release_id,
    action: row.action, reason: row.reason, actorUserId: row.actor_user_id,
    createdAt: row.created_at.toISOString(),
  };
}

function state(pageId: string, row?: ActivationRow): DeploymentState {
  const activation = row ? mapActivation(row) : null;
  return { pageId, revision: activation?.revision ?? 0, activeReleaseId: activation?.releaseId ?? null, activation };
}

async function requireAccess(database: Queryable, userId: string, pageId: string, mutate = false): Promise<void> {
  const result = await database.query(
    `SELECT pg.id FROM pages pg
     JOIN project_memberships m ON m.project_id = pg.project_id
     WHERE pg.id = $1 AND m.user_id = $2 AND m.revoked_at IS NULL AND m.role = ANY($3::text[])
     ${mutate ? 'FOR UPDATE OF pg FOR SHARE OF m' : ''}`,
    [pageId, userId, rolesWithPermission(mutate ? 'publish' : 'view')],
  );
  if (!result.rowCount) throw new ForbiddenError();
}

export class PostgresDeploymentRepository implements DeploymentRepository {
  constructor(private readonly pool: Pool, private readonly allowLocalVerification = false) {}

  async getState(userId: string, pageId: string): Promise<DeploymentState> {
    await requireAccess(this.pool, userId, pageId);
    const result = await this.pool.query<ActivationRow>(
      'SELECT * FROM page_deployment_activations WHERE page_id = $1 ORDER BY revision DESC LIMIT 1', [pageId],
    );
    return state(pageId, result.rows[0]);
  }

  async listHistory(input: Parameters<DeploymentRepository['listHistory']>[0]): Promise<DeploymentHistory> {
    await requireAccess(this.pool, input.userId, input.pageId);
    const result = await this.pool.query<ActivationRow>(
      `SELECT * FROM page_deployment_activations
       WHERE page_id = $1 AND ($2::bigint IS NULL OR revision < $2)
       ORDER BY revision DESC LIMIT $3`,
      [input.pageId, input.beforeRevision ?? null, input.limit + 1],
    );
    const activations = result.rows.slice(0, input.limit).map(mapActivation);
    return {
      activations,
      nextBeforeRevision: result.rows.length > input.limit ? activations[activations.length - 1].revision : null,
    };
  }

  async activate(input: Parameters<DeploymentRepository['activate']>[0]): Promise<DeploymentResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize activation and Release publishing on the Page. Keep membership valid until commit.
      await requireAccess(client, input.userId, input.pageId, true);
      const replay = await client.query<ActivationRow>(
        `SELECT * FROM page_deployment_activations
         WHERE page_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`,
        [input.pageId, input.userId, input.idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].payload_hash.trim() !== input.payloadHash) {
          throw new VersioningError('The idempotency key was used for a different deployment request', 'IDEMPOTENCY_CONFLICT', 409);
        }
        await client.query('COMMIT');
        return {deployment: state(input.pageId, replay.rows[0]), replayed: true};
      }
      if (input.action !== 'disable') {
        const origins = await client.query<{verified_at:Date|null;verification_method:string|null}>(`SELECT po.verified_at,po.verification_method FROM project_origins po
          JOIN pages pg ON pg.project_id=po.project_id WHERE pg.id=$1 FOR SHARE OF po`, [input.pageId]);
        if (!origins.rowCount || origins.rows.some(origin => !origin.verified_at || (origin.verification_method === 'local-development' && !this.allowLocalVerification))) {
          throw new VersioningError('Подтвердите все домены сайта перед публикацией.', 'ORIGIN_NOT_VERIFIED', 409);
        }
      }
      const current = await client.query<ActivationRow>(
        'SELECT * FROM page_deployment_activations WHERE page_id = $1 ORDER BY revision DESC LIMIT 1', [input.pageId],
      );
      const previous = state(input.pageId, current.rows[0]);
      if (previous.revision !== input.expectedRevision) {
        throw new VersioningError('Deployment revision does not match', 'DEPLOYMENT_REVISION_CONFLICT', 409, {
          expectedRevision: input.expectedRevision, actualRevision: previous.revision,
        });
      }
      if (previous.revision === Number.MAX_SAFE_INTEGER) throw new ConflictError('Deployment revision limit reached');
      if (input.releaseId) {
        const release = await client.query('SELECT id FROM releases WHERE id = $1 AND page_id = $2', [input.releaseId, input.pageId]);
        if (!release.rowCount) throw new NotFoundError('Release was not found on this page');
      }
      if (input.action === 'rollback') {
        const historic = await client.query(
          'SELECT id FROM page_deployment_activations WHERE page_id = $1 AND release_id = $2 AND revision < $3 LIMIT 1',
          [input.pageId, input.releaseId, previous.revision],
        );
        if (input.releaseId === previous.activeReleaseId || !historic.rowCount) {
          throw new ConflictError('Rollback requires a different release previously activated on this page');
        }
      }
      const inserted = await client.query<ActivationRow>(
        `INSERT INTO page_deployment_activations
         (id, page_id, revision, previous_release_id, release_id, action, reason, actor_user_id, idempotency_key, payload_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [input.id, input.pageId, previous.revision + 1, previous.activeReleaseId, input.releaseId,
          input.action, input.reason, input.userId, input.idempotencyKey, input.payloadHash],
      );
      await client.query('COMMIT');
      return {deployment: state(input.pageId, inserted.rows[0]), replayed: false};
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async resolve(input: Parameters<DeploymentRepository['resolve']>[0]): Promise<DeploymentResolution | null> {
    // Pointer and manifest are read in one snapshot, with origin verification on every request.
    const result = await this.pool.query<{
      project_id: string; page_id: string; pathname: string; revision: string | null; release_id: string | null;
      version: number | null; manifest: unknown; manifest_hash: string | null;
      source_snapshot: unknown; created_at: Date | null;
    }>(
      `SELECT p.id AS project_id, pg.id AS page_id, pg.pathname, a.revision, a.release_id,
              r.version, r.manifest, r.manifest_hash, r.source_snapshot, r.created_at
       FROM projects p
       JOIN project_origins po ON po.project_id = p.id AND po.origin = $3 AND po.verified_at IS NOT NULL
         AND (po.verification_method IS DISTINCT FROM 'local-development' OR $4::boolean)
       JOIN pages pg ON pg.project_id = p.id AND pg.pathname = $2
       LEFT JOIN LATERAL (
         SELECT revision, release_id FROM page_deployment_activations
         WHERE page_id = pg.id ORDER BY revision DESC LIMIT 1
       ) a ON TRUE
       LEFT JOIN releases r ON r.id = a.release_id AND r.page_id = pg.id
       WHERE p.public_key = $1`,
      [input.publicKey, input.pathname, input.origin, this.allowLocalVerification],
    );
    const row = result.rows[0];
    if (!row) return null;
    const selection: DeploymentResolution = {
      pageId: row.page_id, revision: Number(row.revision ?? 0), activeReleaseId: row.release_id, manifest: null,
    };
    if (row.release_id) {
      if (!Array.isArray(row.manifest) || !row.manifest_hash || !row.created_at || !row.version) {
        throw new Error('Active deployment has an invalid stored release');
      }
      if (row.source_snapshot !== null && !isSourceSnapshotV1(row.source_snapshot)) {
        throw new Error('Active deployment has an invalid source snapshot');
      }
      selection.manifest = {
        schemaVersion: 1, projectId: row.project_id, pageId: row.page_id, pathname: row.pathname,
        releaseId: row.release_id, version: row.version, manifestHash: row.manifest_hash.trim(),
        operations: row.manifest.map(parseOperation), createdAt: row.created_at.toISOString(),
        ...(isSourceSnapshotV1(row.source_snapshot) ? {sourceSnapshot: row.source_snapshot} : {}),
      };
    }
    return selection;
  }
}
