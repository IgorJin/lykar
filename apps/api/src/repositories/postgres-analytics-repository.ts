import { isSourceSnapshotV1, parseOperationV1 } from '@lykar/protocol';
import type { Pool, PoolClient } from 'pg';

import {
  assignmentBucket,
  type AnalyticsRepository,
  type AnalyticsVariantReport,
  type ExperimentAssignment,
  type ExperimentAnalyticsReport,
} from '../domain/analytics';
import type { ExperimentVariantKey } from '../domain/experiments';
import { rolesWithPermission } from '../domain/memberships';
import { ForbiddenError, UnauthorizedError } from '../domain/versioning';

type RuntimeVariantRow = {
  experiment_id: string;
  variant_id: string;
  variant_key: ExperimentVariantKey;
  weight_bps: number;
  release_id: string | null;
  project_id: string;
  page_id: string;
  pathname: string;
  version: number | null;
  manifest: unknown | null;
  manifest_hash: string | null;
  source_snapshot: unknown | null;
  release_created_at: Date | string | null;
};

type AssignmentRow = {
  id: string;
  variant_id: string;
};

type ReportRow = {
  variant_key: ExperimentVariantKey;
  weight_bps: number;
  visitors: string;
  views: string;
  unique_conversions: string;
  conversions: string;
};

export class PostgresAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly pool: Pool) {}

  async resolveAssignment(
    input: Parameters<AnalyticsRepository['resolveAssignment']>[0],
  ): Promise<ExperimentAssignment | null> {
    return this.transaction(async client => {
      const variants = await client.query<RuntimeVariantRow>(
        `SELECT experiment.id AS experiment_id, variant.id AS variant_id,
                variant.variant_key, variant.weight_bps, variant.release_id,
                project.id AS project_id, page.id AS page_id, page.pathname,
                release.version, release.manifest, release.manifest_hash,
                release.source_snapshot, release.created_at AS release_created_at
         FROM experiment_links link
         JOIN experiments experiment
           ON experiment.id = link.experiment_id AND experiment.status = 'active'
         JOIN experiment_variants variant ON variant.experiment_id = experiment.id
         JOIN pages page ON page.id = experiment.page_id
         JOIN projects project ON project.id = experiment.project_id
         LEFT JOIN releases release ON release.id = variant.release_id
         WHERE link.token_hash = $1 AND link.revoked_at IS NULL
           AND project.public_key = $2 AND page.pathname = $3
         ORDER BY variant.variant_key`,
        [input.tokenHash, input.publicKey, input.pathname],
      );
      if (variants.rows.length !== 2) return null;
      const experimentId = variants.rows[0].experiment_id;

      let assignment = (await client.query<AssignmentRow>(
        `SELECT id, variant_id FROM experiment_assignments
         WHERE experiment_id = $1 AND visitor_hash = $2
         FOR UPDATE`,
        [experimentId, input.visitorHash],
      )).rows[0];

      if (!assignment) {
        const bucket = assignmentBucket(experimentId, input.visitorHash);
        const variant = bucket < Number(variants.rows[0].weight_bps) ? variants.rows[0] : variants.rows[1];
        await client.query(
          `INSERT INTO experiment_assignments
             (id, experiment_id, variant_id, visitor_hash)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (experiment_id, visitor_hash) DO NOTHING`,
          [input.assignmentId, experimentId, variant.variant_id, input.visitorHash],
        );
        assignment = (await client.query<AssignmentRow>(
          `SELECT id, variant_id FROM experiment_assignments
           WHERE experiment_id = $1 AND visitor_hash = $2`,
          [experimentId, input.visitorHash],
        )).rows[0];
      }
      if (!assignment) throw new Error('Experiment assignment could not be created');
      await client.query(
        'UPDATE experiment_assignments SET last_seen_at = NOW(), updated_at = NOW() WHERE id = $1',
        [assignment.id],
      );
      const selected = variants.rows.find(variant => variant.variant_id === assignment.variant_id);
      if (!selected) throw new Error('Stored experiment assignment references an invalid variant');
      return {
        assignmentId: assignment.id,
        experimentId,
        variantKey: selected.variant_key,
        manifest: manifestFromRow(selected),
      };
    });
  }

  async recordEvent(
    input: Parameters<AnalyticsRepository['recordEvent']>[0],
  ): Promise<{ duplicate: boolean }> {
    const inserted = await this.pool.query(
      `WITH inserted AS (
         INSERT INTO analytics_events
           (id, client_event_id, assignment_id, event_type, event_name, properties, occurred_at)
         SELECT $1, $2, assignment.id, $4, $5, $6::jsonb, $7
         FROM experiment_assignments assignment
         WHERE assignment.id = $3
         ON CONFLICT (client_event_id) DO NOTHING
         RETURNING assignment_id, event_type
       )
       UPDATE experiment_assignments assignment
       SET first_exposed_at = CASE
             WHEN inserted.event_type = 'exposure'
               THEN COALESCE(assignment.first_exposed_at, $7)
             ELSE assignment.first_exposed_at
           END,
           first_converted_at = CASE
             WHEN inserted.event_type = 'conversion'
               THEN COALESCE(assignment.first_converted_at, $7)
             ELSE assignment.first_converted_at
           END,
           exposure_count = assignment.exposure_count
             + CASE WHEN inserted.event_type = 'exposure' THEN 1 ELSE 0 END,
           conversion_count = assignment.conversion_count
             + CASE WHEN inserted.event_type = 'conversion' THEN 1 ELSE 0 END,
           last_seen_at = NOW(), updated_at = NOW()
       FROM inserted
       WHERE assignment.id = inserted.assignment_id`,
      [
        input.id,
        input.clientEventId,
        input.assignmentId,
        input.eventType,
        input.eventName,
        JSON.stringify(input.properties),
        input.occurredAt,
      ],
    );
    if ((inserted.rowCount ?? 0) > 0) return { duplicate: false };
    const existing = await this.pool.query(
      'SELECT id FROM analytics_events WHERE client_event_id = $1',
      [input.clientEventId],
    );
    if ((existing.rowCount ?? 0) > 0) return { duplicate: true };
    throw new UnauthorizedError('Analytics assignment is unavailable');
  }

  async getReport(userId: string, experimentId: string): Promise<ExperimentAnalyticsReport> {
    const allowed = await this.pool.query(
      `SELECT experiment.id
       FROM experiments experiment
       JOIN project_memberships membership ON membership.project_id = experiment.project_id
       WHERE experiment.id = $1 AND membership.user_id = $2
         AND membership.revoked_at IS NULL
         AND membership.role = ANY($3::text[])`,
      [experimentId, userId, rolesWithPermission('publish')],
    );
    if ((allowed.rowCount ?? 0) === 0) throw new ForbiddenError();

    const result = await this.pool.query<ReportRow>(
      `WITH assignment_totals AS (
         SELECT variant_id,
                COUNT(*) FILTER (WHERE first_exposed_at IS NOT NULL) AS visitors,
                COALESCE(SUM(exposure_count), 0) AS views,
                COUNT(*) FILTER (
                  WHERE first_exposed_at IS NOT NULL AND first_converted_at IS NOT NULL
                ) AS unique_conversions,
                COALESCE(SUM(conversion_count) FILTER (WHERE first_exposed_at IS NOT NULL), 0) AS conversions
         FROM experiment_assignments
         WHERE experiment_id = $1
         GROUP BY variant_id
       )
       SELECT variant.variant_key, variant.weight_bps,
              COALESCE(assignment_totals.visitors, 0)::text AS visitors,
              COALESCE(assignment_totals.views, 0)::text AS views,
              COALESCE(assignment_totals.unique_conversions, 0)::text AS unique_conversions,
              COALESCE(assignment_totals.conversions, 0)::text AS conversions
       FROM experiment_variants variant
       LEFT JOIN assignment_totals ON assignment_totals.variant_id = variant.id
       WHERE variant.experiment_id = $1
       ORDER BY variant.variant_key`,
      [experimentId],
    );
    if (result.rows.length !== 2) throw new Error('Experiment report requires exactly two variants');
    const variants = result.rows.map(mapReportRow) as [AnalyticsVariantReport, AnalyticsVariantReport];
    const baseline = variants[0].conversionRate;
    variants[1].upliftVsA = baseline && variants[1].conversionRate !== null
      ? (variants[1].conversionRate - baseline) / baseline
      : null;
    return { experimentId, generatedAt: new Date().toISOString(), variants };
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

function manifestFromRow(row: RuntimeVariantRow): ExperimentAssignment['manifest'] {
  if (!row.release_id) return null;
  if (!Array.isArray(row.manifest) || !row.manifest_hash || !row.release_created_at || row.version === null) {
    throw new Error('Stored experiment release is invalid');
  }
  const sourceSnapshot = row.source_snapshot === null ? null : row.source_snapshot;
  if (sourceSnapshot !== null && !isSourceSnapshotV1(sourceSnapshot)) {
    throw new Error('Stored source snapshot is invalid');
  }
  return {
    schemaVersion: 1,
    projectId: row.project_id,
    pageId: row.page_id,
    pathname: row.pathname,
    releaseId: row.release_id,
    version: Number(row.version),
    manifestHash: row.manifest_hash.trim(),
    ...(sourceSnapshot ? { sourceSnapshot } : {}),
    operations: row.manifest.map(parseOperationV1),
    createdAt: toIso(row.release_created_at),
  };
}

function mapReportRow(row: ReportRow): AnalyticsVariantReport {
  const visitors = Number(row.visitors);
  const uniqueConversions = Number(row.unique_conversions);
  return {
    key: row.variant_key,
    weightBps: Number(row.weight_bps),
    visitors,
    views: Number(row.views),
    uniqueConversions,
    conversions: Number(row.conversions),
    conversionRate: visitors === 0 ? null : uniqueConversions / visitors,
    upliftVsA: null,
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
