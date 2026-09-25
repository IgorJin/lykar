import { isSourceSnapshotV1, parseOperationV1 } from '@lykar/protocol';
import type { Pool, PoolClient } from 'pg';

import type {
  ExperimentRecord,
  ExperimentRepository,
  ExperimentLinkRecord,
  ExperimentStatus,
  ExperimentVariantKey,
  ExperimentVariantLinkRecord,
  VariantRuntimeResolution,
} from '../domain/experiments';
import { rolesWithPermission, type ProjectPermission } from '../domain/memberships';
import { ConflictError, ForbiddenError, NotFoundError } from '../domain/versioning';

type Queryable = Pick<Pool | PoolClient, 'query'>;
type ExperimentRow = {
  id: string;
  project_id: string;
  page_id: string;
  name: string;
  status: ExperimentStatus;
  first_activated_at: Date | string | null;
  activated_at: Date | string | null;
  paused_at: Date | string | null;
  completed_at: Date | string | null;
  winner_variant_key: ExperimentVariantKey | null;
  created_at: Date | string;
  updated_at: Date | string;
};
type VariantRow = {
  id: string;
  experiment_id: string;
  variant_key: ExperimentVariantKey;
  release_id: string | null;
  release_version: number | null;
  description: string | null;
  weight_bps: number;
};
type LinkRow = {
  id: string;
  variant_id: string;
  token_hint: string;
  revoked_at: Date | string | null;
  created_at: Date | string;
};
type ExperimentLinkRow = {
  id: string;
  experiment_id: string;
  token_hint: string;
  revoked_at: Date | string | null;
  created_at: Date | string;
};

export class PostgresExperimentRepository implements ExperimentRepository {
  constructor(private readonly pool: Pool) {}

  async createExperiment(input: Parameters<ExperimentRepository['createExperiment']>[0]): Promise<ExperimentRecord> {
    return this.transaction(async client => {
      const page = await requirePageAccess(client, input.userId, input.pageId, 'edit');
      for (const variant of input.variants) {
        if (variant.releaseId) await requireReleaseOnPage(client, variant.releaseId, page.id);
      }
      await client.query(
        `INSERT INTO experiments (id, project_id, page_id, name, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [input.id, page.project_id, page.id, input.name, input.userId],
      );
      for (const variant of input.variants) {
        await client.query(
          `INSERT INTO experiment_variants (id, experiment_id, variant_key, release_id, description, weight_bps)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [variant.id, input.id, variant.key, variant.releaseId, variant.description, variant.weightBps],
        );
      }
      return loadExperiment(client, input.userId, input.id);
    });
  }

  async listExperiments(userId: string, pageId: string): Promise<ExperimentRecord[]> {
    await requirePageAccess(this.pool, userId, pageId, 'view');
    const result = await this.pool.query<{ id: string }>(
      'SELECT id FROM experiments WHERE page_id = $1 ORDER BY created_at DESC',
      [pageId],
    );
    return Promise.all(result.rows.map(row => loadExperiment(this.pool, userId, row.id)));
  }

  async updateVariant(input: Parameters<ExperimentRepository['updateVariant']>[0]): Promise<ExperimentRecord> {
    return this.transaction(async client => {
      const experiment = await requireExperimentAccess(client, input.userId, input.experimentId, 'edit', true);
      if (experiment.status !== 'draft') throw new ConflictError('Variants are immutable after the experiment starts');
      if (input.releaseId) await requireReleaseOnPage(client, input.releaseId, experiment.page_id);
      const updated = await client.query(
        `UPDATE experiment_variants
         SET release_id = CASE WHEN $3 THEN $4::uuid ELSE release_id END,
             description = CASE WHEN $5 THEN $6::text ELSE description END,
             weight_bps = COALESCE($7, weight_bps), updated_at = NOW()
         WHERE experiment_id = $1 AND variant_key = $2`,
        [
          input.experimentId,
          input.key,
          input.releaseId !== undefined,
          input.releaseId,
          input.description !== undefined,
          input.description,
          input.weightBps,
        ],
      );
      if (updated.rowCount === 0) throw new NotFoundError('Experiment variant was not found');
      if (input.weightBps !== undefined) {
        await client.query(
          `UPDATE experiment_variants
           SET weight_bps = $3, updated_at = NOW()
           WHERE experiment_id = $1 AND variant_key <> $2`,
          [input.experimentId, input.key, 10000 - input.weightBps],
        );
      }
      const configured = await client.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM experiment_variants WHERE experiment_id = $1 AND release_id IS NOT NULL',
        [input.experimentId],
      );
      if (Number(configured.rows[0].count) === 0) {
        throw new ConflictError('At least one experiment variant must reference a release');
      }
      await client.query('UPDATE experiments SET updated_at = NOW() WHERE id = $1', [input.experimentId]);
      return loadExperiment(client, input.userId, input.experimentId);
    });
  }

  async transition(input: Parameters<ExperimentRepository['transition']>[0]): Promise<ExperimentRecord> {
    try {
      return await this.transaction(async client => {
        const experiment = await requireExperimentAccess(client, input.userId, input.experimentId, 'publish', true);
        if (input.action === 'activate') {
          if (experiment.status !== 'draft' && experiment.status !== 'paused') {
            throw new ConflictError('Only draft or paused experiments can be activated');
          }
          const variants = await client.query<{ count: string; configured: string; total_weight: string }>(
            `SELECT COUNT(*) AS count, COUNT(release_id) AS configured,
                    SUM(weight_bps)::text AS total_weight
             FROM experiment_variants WHERE experiment_id = $1`,
            [input.experimentId],
          );
          if (Number(variants.rows[0].count) !== 2 || Number(variants.rows[0].configured) === 0) {
            throw new ConflictError('Experiment requires variants A and B and at least one release');
          }
          if (Number(variants.rows[0].total_weight) !== 10000) {
            throw new ConflictError('Variant weights must add up to 10000 basis points');
          }
          await client.query(
            `UPDATE experiments
             SET status = 'active', activated_by = $2, activated_at = NOW(),
                 first_activated_at = COALESCE(first_activated_at, NOW()), paused_at = NULL, updated_at = NOW()
             WHERE id = $1`,
            [input.experimentId, input.userId],
          );
        } else if (input.action === 'pause') {
          if (experiment.status !== 'active') throw new ConflictError('Only an active experiment can be paused');
          await client.query(
            `UPDATE experiments
             SET status = 'paused', paused_by = $2, paused_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [input.experimentId, input.userId],
          );
        } else {
          if (experiment.status !== 'active' && experiment.status !== 'paused') {
            throw new ConflictError('Only active or paused experiments can be completed');
          }
          await client.query(
            `UPDATE experiments
             SET status = 'completed', completed_by = $2, completed_at = NOW(),
                 winner_variant_key = $3, updated_at = NOW()
             WHERE id = $1`,
            [input.experimentId, input.userId, input.winnerVariantKey],
          );
        }
        return loadExperiment(client, input.userId, input.experimentId);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('Another experiment is already active on this page');
      throw error;
    }
  }

  async createExperimentLink(
    input: Parameters<ExperimentRepository['createExperimentLink']>[0],
  ): Promise<{ link: ExperimentLinkRecord; origin: string; pathname: string }> {
    return this.transaction(async client => {
      const experiment = await requireExperimentAccess(client, input.userId, input.experimentId, 'publish', true);
      if (experiment.status !== 'active') {
        throw new ConflictError('Experiment links can only be created for an active experiment');
      }
      const link = await client.query<ExperimentLinkRow>(
        `INSERT INTO experiment_links (id, experiment_id, token_hash, token_hint, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [input.id, input.experimentId, input.tokenHash, input.tokenHint, input.userId],
      );
      const target = await client.query<{ pathname: string; origin: string }>(
        `SELECT pg.pathname, MIN(po.origin) AS origin
         FROM pages pg
         JOIN project_origins po ON po.project_id = pg.project_id
         WHERE pg.id = $1
         GROUP BY pg.pathname`,
        [experiment.page_id],
      );
      const row = target.rows[0];
      if (!row) throw new ConflictError('Experiment page has no configured project origin');
      return { link: mapExperimentLink(link.rows[0]), origin: row.origin, pathname: row.pathname };
    });
  }

  async revokeExperimentLink(userId: string, linkId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE experiment_links link SET revoked_at = NOW()
       FROM experiments experiment, project_memberships membership
       WHERE link.id = $1 AND link.revoked_at IS NULL
         AND experiment.id = link.experiment_id
         AND membership.project_id = experiment.project_id
         AND membership.user_id = $2 AND membership.revoked_at IS NULL
         AND membership.role = ANY($3::text[])`,
      [linkId, userId, rolesWithPermission('publish')],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async createVariantLink(
    input: Parameters<ExperimentRepository['createVariantLink']>[0],
  ): Promise<{ link: ExperimentVariantLinkRecord; origin: string; pathname: string }> {
    return this.transaction(async client => {
      const experiment = await requireExperimentAccess(client, input.userId, input.experimentId, 'publish', true);
      if (experiment.status !== 'active') throw new ConflictError('Variant links can only be created for an active experiment');
      const variant = await client.query<{ id: string }>(
        'SELECT id FROM experiment_variants WHERE experiment_id = $1 AND variant_key = $2',
        [input.experimentId, input.key],
      );
      const variantId = variant.rows[0]?.id;
      if (!variantId) throw new NotFoundError('Experiment variant was not found');
      const link = await client.query<LinkRow>(
        `INSERT INTO experiment_variant_links (id, variant_id, token_hash, token_hint, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [input.id, variantId, input.tokenHash, input.tokenHint, input.userId],
      );
      const target = await client.query<{ pathname: string; origin: string }>(
        `SELECT pg.pathname, MIN(po.origin) AS origin
         FROM pages pg
         JOIN project_origins po ON po.project_id = pg.project_id
         WHERE pg.id = $1
         GROUP BY pg.pathname`,
        [experiment.page_id],
      );
      const row = target.rows[0];
      if (!row) throw new ConflictError('Experiment page has no configured project origin');
      return { link: mapLink(link.rows[0]), origin: row.origin, pathname: row.pathname };
    });
  }

  async revokeVariantLink(userId: string, linkId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE experiment_variant_links link SET revoked_at = NOW()
       FROM experiment_variants variant, experiments experiment, project_memberships membership
       WHERE link.id = $1 AND link.revoked_at IS NULL
         AND variant.id = link.variant_id
         AND experiment.id = variant.experiment_id
         AND membership.project_id = experiment.project_id
         AND membership.user_id = $2 AND membership.revoked_at IS NULL
         AND membership.role = ANY($3::text[])`,
      [linkId, userId, rolesWithPermission('publish')],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async resolveVariant(
    input: Parameters<ExperimentRepository['resolveVariant']>[0],
  ): Promise<VariantRuntimeResolution | null> {
    const result = await this.pool.query<{
      experiment_id: string;
      variant_key: ExperimentVariantKey;
      release_id: string | null;
      project_id: string;
      page_id: string;
      pathname: string;
      version: number | null;
      manifest: unknown;
      manifest_hash: string | null;
      source_snapshot: unknown | null;
      created_at: Date | string | null;
    }>(
      `SELECT experiment.id AS experiment_id, variant.variant_key, variant.release_id,
              project.id AS project_id, page.id AS page_id, page.pathname,
              release.version, release.manifest, release.manifest_hash,
              release.source_snapshot, release.created_at
       FROM experiment_variant_links link
       JOIN experiment_variants variant ON variant.id = link.variant_id
       JOIN experiments experiment ON experiment.id = variant.experiment_id AND experiment.status = 'active'
       JOIN pages page ON page.id = experiment.page_id
       JOIN projects project ON project.id = experiment.project_id
       LEFT JOIN releases release ON release.id = variant.release_id
       WHERE link.token_hash = $1 AND link.revoked_at IS NULL
         AND project.public_key = $2 AND page.pathname = $3`,
      [input.tokenHash, input.publicKey, input.pathname],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (!row.release_id) return { experimentId: row.experiment_id, variantKey: row.variant_key, manifest: null };
    if (!Array.isArray(row.manifest) || !row.manifest_hash || !row.created_at || row.version === null) {
      throw new Error('Stored experiment release is invalid');
    }
    const sourceSnapshot = row.source_snapshot === null ? null : row.source_snapshot;
    if (sourceSnapshot !== null && !isSourceSnapshotV1(sourceSnapshot)) {
      throw new Error('Stored source snapshot is invalid');
    }
    return {
      experimentId: row.experiment_id,
      variantKey: row.variant_key,
      manifest: {
        schemaVersion: 1,
        projectId: row.project_id,
        pageId: row.page_id,
        pathname: row.pathname,
        releaseId: row.release_id,
        version: Number(row.version),
        manifestHash: row.manifest_hash.trim(),
        ...(sourceSnapshot ? { sourceSnapshot } : {}),
        operations: row.manifest.map(parseOperationV1),
        createdAt: toIso(row.created_at),
      },
    };
  }

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
}

async function requirePageAccess(
  database: Queryable,
  userId: string,
  pageId: string,
  permission: ProjectPermission,
): Promise<{ id: string; project_id: string }> {
  const result = await database.query<{ id: string; project_id: string }>(
    `SELECT page.id, page.project_id
     FROM pages page
     JOIN project_memberships membership ON membership.project_id = page.project_id
     WHERE page.id = $1 AND membership.user_id = $2 AND membership.revoked_at IS NULL
       AND membership.role = ANY($3::text[])`,
    [pageId, userId, rolesWithPermission(permission)],
  );
  const page = result.rows[0];
  if (!page) throw new ForbiddenError();
  return page;
}

async function requireExperimentAccess(
  database: Queryable,
  userId: string,
  experimentId: string,
  permission: ProjectPermission,
  lock = false,
): Promise<ExperimentRow> {
  const result = await database.query<ExperimentRow>(
    `SELECT experiment.*
     FROM experiments experiment
     JOIN project_memberships membership ON membership.project_id = experiment.project_id
     WHERE experiment.id = $1 AND membership.user_id = $2 AND membership.revoked_at IS NULL
       AND membership.role = ANY($3::text[])
     ${lock ? 'FOR UPDATE OF experiment' : ''}`,
    [experimentId, userId, rolesWithPermission(permission)],
  );
  const experiment = result.rows[0];
  if (!experiment) throw new ForbiddenError();
  return experiment;
}

async function requireReleaseOnPage(database: Queryable, releaseId: string, pageId: string): Promise<void> {
  const result = await database.query('SELECT id FROM releases WHERE id = $1 AND page_id = $2', [releaseId, pageId]);
  if (result.rowCount === 0) throw new NotFoundError('Release was not found on this experiment page');
}

async function loadExperiment(database: Queryable, userId: string, experimentId: string): Promise<ExperimentRecord> {
  const experiment = await requireExperimentAccess(database, userId, experimentId, 'view');
  const variants = await database.query<VariantRow>(
    `SELECT variant.*, release.version AS release_version
     FROM experiment_variants variant
     LEFT JOIN releases release ON release.id = variant.release_id
     WHERE variant.experiment_id = $1
     ORDER BY variant.variant_key`,
    [experimentId],
  );
  if (variants.rows.length !== 2) throw new Error('Experiment must contain exactly two variants');
  const links = await database.query<LinkRow>(
    `SELECT link.*
     FROM experiment_variant_links link
     JOIN experiment_variants variant ON variant.id = link.variant_id
     WHERE variant.experiment_id = $1
     ORDER BY link.created_at DESC`,
    [experimentId],
  );
  const experimentLinks = await database.query<ExperimentLinkRow>(
    `SELECT * FROM experiment_links
     WHERE experiment_id = $1
     ORDER BY created_at DESC`,
    [experimentId],
  );
  const mappedVariants = variants.rows.map(variant => ({
    id: variant.id,
    key: variant.variant_key,
    releaseId: variant.release_id,
    releaseVersion: variant.release_version === null ? null : Number(variant.release_version),
    description: variant.description,
    weightBps: Number(variant.weight_bps),
    links: links.rows.filter(link => link.variant_id === variant.id).map(mapLink),
  })) as [ExperimentRecord['variants'][0], ExperimentRecord['variants'][1]];
  return {
    id: experiment.id,
    projectId: experiment.project_id,
    pageId: experiment.page_id,
    name: experiment.name,
    status: experiment.status,
    winnerVariantKey: experiment.winner_variant_key,
    firstActivatedAt: optionalIso(experiment.first_activated_at),
    activatedAt: optionalIso(experiment.activated_at),
    pausedAt: optionalIso(experiment.paused_at),
    completedAt: optionalIso(experiment.completed_at),
    createdAt: toIso(experiment.created_at),
    updatedAt: toIso(experiment.updated_at),
    links: experimentLinks.rows.map(mapExperimentLink),
    variants: mappedVariants,
  };
}

function mapExperimentLink(row: ExperimentLinkRow): ExperimentLinkRecord {
  return {
    id: row.id,
    experimentId: row.experiment_id,
    tokenHint: row.token_hint,
    revokedAt: optionalIso(row.revoked_at),
    createdAt: toIso(row.created_at),
  };
}

function mapLink(row: LinkRow): ExperimentVariantLinkRecord {
  return {
    id: row.id,
    variantId: row.variant_id,
    tokenHint: row.token_hint,
    revokedAt: optionalIso(row.revoked_at),
    createdAt: toIso(row.created_at),
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function optionalIso(value: Date | string | null): string | null {
  return value === null ? null : toIso(value);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
