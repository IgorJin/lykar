import { isSourceSnapshotV1, parseOperation } from '@lykar/protocol';
import type { Pool, PoolClient } from 'pg';

import {
  assignmentBucket,
  type AnalyticsRepository,
  type AnalyticsTest,
  type AnalyticsVariantReport,
  type ExperimentAssignment,
  type ExperimentAnalyticsReport,
  type ResolvedExperimentAssignment,
} from '../domain/analytics';
import type { ExperimentVariantKey } from '../domain/experiments';
import { rolesWithPermission } from '../domain/memberships';
import { ConflictError, ForbiddenError, UnauthorizedError, ValidationError } from '../domain/versioning';

type RuntimeVariantRow = {
  experiment_link_id: string;
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
  ): Promise<ResolvedExperimentAssignment | null> {
    return this.transaction(async client => {
      const variants = await client.query<RuntimeVariantRow>(
        `SELECT link.id AS experiment_link_id, experiment.id AS experiment_id, variant.id AS variant_id,
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
        experimentLinkId: selected.experiment_link_id,
        experimentId,
        variantKey: selected.variant_key,
        manifest: manifestFromRow(selected),
      };
    });
  }

  async recordEvent(
    input: Parameters<AnalyticsRepository['recordEvent']>[0],
  ): Promise<{ duplicate: boolean }> {
    return this.transaction(async client => {
      const assignment = await client.query<{ first_exposed_at: Date | null }>(
        `SELECT assignment.first_exposed_at FROM experiment_assignments assignment
         JOIN experiments experiment ON experiment.id = assignment.experiment_id AND experiment.status = 'active'
         JOIN experiment_links link ON link.id = $2 AND link.experiment_id = experiment.id AND link.revoked_at IS NULL
         WHERE assignment.id = $1 FOR UPDATE OF assignment`, [input.assignmentId, input.experimentLinkId]);
      if (!assignment.rows[0]) throw new UnauthorizedError('Analytics assignment is unavailable');
      const existing = await client.query<{ assignment_id: string; event_type: string; event_name: string }>('SELECT assignment_id, event_type, event_name FROM analytics_events WHERE client_event_id = $1', [input.clientEventId]);
      if (existing.rows[0]) {
        if (existing.rows[0].assignment_id !== input.assignmentId || existing.rows[0].event_type !== input.eventType || existing.rows[0].event_name !== input.eventName) throw new UnauthorizedError('Analytics event does not match its assignment');
        return { duplicate: true };
      }
      if (input.eventType === 'conversion' && (!assignment.rows[0].first_exposed_at || input.occurredAt < assignment.rows[0].first_exposed_at)) throw new ConflictError('Conversion requires an exposure first');
      const inserted = await client.query(`INSERT INTO analytics_events (id, client_event_id, assignment_id, event_type, event_name, properties, occurred_at)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT (client_event_id) DO NOTHING`,
        [input.id,input.clientEventId,input.assignmentId,input.eventType,input.eventName,JSON.stringify(input.properties),input.occurredAt]);
      if (!inserted.rowCount) throw new UnauthorizedError('Analytics event does not match its assignment');
      await client.query(`UPDATE experiment_assignments SET
        first_exposed_at = CASE WHEN $2 = 'exposure' THEN COALESCE(first_exposed_at,$3) ELSE first_exposed_at END,
        first_converted_at = CASE WHEN $2 = 'conversion' THEN COALESCE(first_converted_at,$3) ELSE first_converted_at END,
        exposure_count = exposure_count + CASE WHEN $2 = 'exposure' THEN 1 ELSE 0 END,
        conversion_count = conversion_count + CASE WHEN $2 = 'conversion' THEN 1 ELSE 0 END,
        last_seen_at = NOW(), updated_at = NOW() WHERE id = $1`, [input.assignmentId,input.eventType,input.occurredAt]);
      if (input.eventType === 'conversion') await client.query(`INSERT INTO analytics_conversion_totals (assignment_id,event_name,conversion_count)
        VALUES ($1,$2,1) ON CONFLICT (assignment_id,event_name) DO UPDATE SET conversion_count = analytics_conversion_totals.conversion_count + 1`, [input.assignmentId,input.eventName]);
      return { duplicate: false };
    });
  }

  async getReport(userId: string, experimentId: string): Promise<ExperimentAnalyticsReport> {
    const allowed = await this.pool.query(
      `SELECT experiment.id, experiment.conversion_event_name
       FROM experiments experiment
       JOIN project_memberships membership ON membership.project_id = experiment.project_id
       WHERE experiment.id = $1 AND membership.user_id = $2
         AND membership.revoked_at IS NULL
         AND membership.role = ANY($3::text[])`,
      [experimentId, userId, rolesWithPermission('publish')],
    );
    if ((allowed.rowCount ?? 0) === 0) throw new ForbiddenError();

    const conversionEventName = allowed.rows[0].conversion_event_name as string | null;
    const result = await this.pool.query<ReportRow>(
      `WITH assignment_totals AS (
         SELECT variant_id,
                COUNT(*) FILTER (WHERE first_exposed_at IS NOT NULL) AS visitors,
                COALESCE(SUM(exposure_count), 0) AS views,
                COUNT(*) FILTER (
                  WHERE first_exposed_at IS NOT NULL AND (CASE WHEN $2::text IS NULL THEN first_converted_at IS NOT NULL ELSE totals.conversion_count > 0 END)
                ) AS unique_conversions,
                COALESCE(SUM(CASE WHEN $2::text IS NULL THEN assignment.conversion_count ELSE COALESCE(totals.conversion_count, 0) END) FILTER (WHERE first_exposed_at IS NOT NULL), 0) AS conversions
         FROM experiment_assignments assignment
         LEFT JOIN analytics_conversion_totals totals ON totals.assignment_id = assignment.id AND totals.event_name = $2
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
      [experimentId, conversionEventName],
    );
    if (result.rows.length !== 2) throw new Error('Experiment report requires exactly two variants');
    const variants = result.rows.map(mapReportRow) as [AnalyticsVariantReport, AnalyticsVariantReport];
    const baseline = variants[0].conversionRate;
    variants[1].upliftVsA = baseline && variants[1].conversionRate !== null
      ? (variants[1].conversionRate - baseline) / baseline
      : null;
    return { experimentId, conversionEventName, generatedAt: new Date().toISOString(), variants };
  }

  async createTest(input: Parameters<AnalyticsRepository['createTest']>[0]) {
    const target = await this.pool.query(`SELECT experiment.conversion_event_name, page.pathname, MIN(origin.origin) AS origin
      FROM experiments experiment JOIN pages page ON page.id = experiment.page_id
      JOIN project_origins origin ON origin.project_id = experiment.project_id
      JOIN project_memberships membership ON membership.project_id = experiment.project_id
      WHERE experiment.id = $1 AND membership.user_id = $2 AND membership.revoked_at IS NULL AND membership.role = ANY($3::text[])
      GROUP BY experiment.id, page.pathname`, [input.experimentId, input.userId, rolesWithPermission('edit')]);
    if (!target.rows[0]) throw new ForbiddenError();
    if (!target.rows[0].conversion_event_name) throw new ConflictError('Select a conversion goal before testing');
    const result = await this.pool.query(`INSERT INTO analytics_tests (id,experiment_id,event_name,token_hash,expires_at)
      VALUES ($1,$2,$3,$4,$5) RETURNING *`, [input.id,input.experimentId,target.rows[0].conversion_event_name,input.tokenHash,input.expiresAt]);
    return { test: mapTest(result.rows[0]), origin: target.rows[0].origin as string, pathname: target.rows[0].pathname as string };
  }

  async getTest(userId: string, experimentId: string, testId: string): Promise<AnalyticsTest> {
    const result = await this.pool.query(`SELECT test.* FROM analytics_tests test
      JOIN experiments experiment ON experiment.id = test.experiment_id
      JOIN project_memberships membership ON membership.project_id = experiment.project_id
      WHERE test.id = $1 AND experiment.id = $2 AND membership.user_id = $3
      AND membership.revoked_at IS NULL AND membership.role = ANY($4::text[])`, [testId,experimentId,userId,rolesWithPermission('edit')]);
    if (!result.rows[0]) throw new ForbiddenError();
    return mapTest(result.rows[0]);
  }

  async recordTest(input: Parameters<AnalyticsRepository['recordTest']>[0]): Promise<{ eventReceived: boolean }> {
    return this.transaction(async client => {
      const result = await client.query(`SELECT test.* FROM analytics_tests test
        JOIN experiments experiment ON experiment.id = test.experiment_id AND experiment.conversion_event_name = test.event_name
        JOIN pages page ON page.id = experiment.page_id
        JOIN projects project ON project.id = experiment.project_id
        WHERE test.token_hash = $1 AND test.revoked_at IS NULL AND test.expires_at > NOW() AND project.public_key = $2 AND page.pathname = $3
        FOR UPDATE OF test`, [input.tokenHash,input.publicKey,input.pathname]);
      const test = result.rows[0];
      if (!test) throw new UnauthorizedError('Analytics test is unavailable or expired');
      if (input.name !== undefined && input.name !== test.event_name) throw new ValidationError('Test event does not match the conversion goal');
      if (input.clientEventId) {
        const event = await client.query('INSERT INTO analytics_test_events (client_event_id,test_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING test_id', [input.clientEventId,test.id]);
        if (!event.rowCount) {
          const existing = await client.query('SELECT test_id FROM analytics_test_events WHERE client_event_id = $1', [input.clientEventId]);
          if (existing.rows[0]?.test_id !== test.id) throw new UnauthorizedError('Test event belongs to another test');
        }
      }
      const updated = await client.query(`UPDATE analytics_tests SET consent = $2, event_received = event_received OR $3,
        last_received_at = NOW() WHERE id = $1 RETURNING event_received`, [test.id,input.consent,input.name !== undefined]);
      return { eventReceived: updated.rows[0].event_received as boolean };
    });
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
    operations: row.manifest.map(parseOperation),
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

function mapTest(row: { id: string; event_name: string; expires_at: Date | string; consent: AnalyticsTest['consent']; event_received: boolean; last_received_at: Date | string | null }): AnalyticsTest {
  return { id: row.id, eventName: row.event_name, expiresAt: toIso(row.expires_at), consent: row.consent, eventReceived: row.event_received, lastReceivedAt: row.last_received_at ? toIso(row.last_received_at) : null };
}
