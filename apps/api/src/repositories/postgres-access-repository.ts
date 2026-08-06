import type { Pool, PoolClient } from 'pg';

import { rolesWithPermission } from '../domain/memberships';
import { ForbiddenError, NotFoundError } from '../domain/versioning';
import type {
  AccessPage,
  AccessRepository,
  EditorLaunchTarget,
  EditorSessionGrant,
  ShareRecord,
  ShareTarget,
} from '../domain/access';

type PageAccessRow = {
  project_id: string;
  page_id: string;
  public_key: string;
  pathname: string;
  origin: string;
};
type ShareRow = {
  id: string;
  page_id: string;
  release_id: string;
  version: number;
  expires_at: Date | string | null;
  revoked_at: Date | string | null;
  created_at: Date | string;
};
type ShareTargetRow = PageAccessRow & {
  share_link_id: string;
  release_id: string;
  version: number;
  expires_at: Date | string | null;
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapPage(row: PageAccessRow): AccessPage {
  return {
    projectId: row.project_id,
    pageId: row.page_id,
    publicKey: row.public_key,
    pathname: row.pathname,
    origin: row.origin,
  };
}

function mapShare(row: ShareRow): ShareRecord {
  return {
    id: row.id,
    pageId: row.page_id,
    releaseId: row.release_id,
    version: Number(row.version),
    expiresAt: row.expires_at ? toIso(row.expires_at) : null,
    revokedAt: row.revoked_at ? toIso(row.revoked_at) : null,
    createdAt: toIso(row.created_at),
  };
}

function mapTarget(row: ShareTargetRow): ShareTarget {
  return {
    ...mapPage(row),
    shareLinkId: row.share_link_id,
    releaseId: row.release_id,
    version: Number(row.version),
    expiresAt: row.expires_at ? toIso(row.expires_at) : null,
  };
}

export class PostgresAccessRepository implements AccessRepository {
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

  async getEditorLaunchTarget(userId: string, pageId: string, draftId: string): Promise<EditorLaunchTarget> {
    const result = await this.pool.query<PageAccessRow & { draft_id: string; revision: string | number }>(
      `SELECT p.id AS project_id, pg.id AS page_id, p.public_key, pg.pathname, origin.origin,
              d.id AS draft_id, d.revision
       FROM pages pg
       JOIN projects p ON p.id = pg.project_id
       JOIN project_memberships m ON m.project_id = p.id AND m.user_id = $2 AND m.revoked_at IS NULL
         AND m.role = ANY($4::text[])
       JOIN drafts d ON d.id = $3 AND d.page_id = pg.id AND d.status = 'open'
       JOIN LATERAL (
         SELECT po.origin FROM project_origins po
         WHERE po.project_id = p.id
         ORDER BY po.verified_at DESC NULLS LAST, po.created_at ASC
         LIMIT 1
       ) origin ON TRUE
       WHERE pg.id = $1`,
      [pageId, userId, draftId, rolesWithPermission('edit')],
    );
    const page = result.rows[0];
    if (!page) throw new ForbiddenError();
    return { ...mapPage(page), draftId: page.draft_id, expectedRevision: Number(page.revision) };
  }

  async createEditorLaunchCode(input: Parameters<AccessRepository['createEditorLaunchCode']>[0]): Promise<void> {
    await this.pool.query(
      `INSERT INTO editor_launch_codes (id, project_id, page_id, draft_id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [input.id, input.target.projectId, input.target.pageId, input.target.draftId, input.userId, input.tokenHash, input.expiresAt],
    );
  }

  async consumeEditorLaunchCode(
    input: Parameters<AccessRepository['consumeEditorLaunchCode']>[0],
  ): Promise<EditorSessionGrant | null> {
    const result = await this.pool.query<PageAccessRow & {
      user_id: string; expires_at: Date | string; draft_id: string; revision: string | number;
    }>(
      `UPDATE editor_launch_codes c
       SET consumed_at = $3
       FROM pages pg, projects p, project_origins po, drafts d, project_memberships m
       WHERE c.token_hash = $1
         AND c.consumed_at IS NULL
         AND c.expires_at > $3
         AND pg.id = c.page_id
         AND p.id = c.project_id
         AND po.project_id = p.id
         AND d.id = c.draft_id AND d.page_id = pg.id AND d.status = 'open'
         AND m.project_id = c.project_id AND m.user_id = c.user_id
         AND m.revoked_at IS NULL AND m.role = ANY($4::text[])
         AND po.origin || pg.pathname = $2
       RETURNING p.id AS project_id, pg.id AS page_id, p.public_key, pg.pathname,
                 po.origin, c.user_id, c.expires_at, d.id AS draft_id, d.revision`,
      [input.tokenHash, input.pageUrl, input.now, rolesWithPermission('edit')],
    );
    const row = result.rows[0];
    return row ? {
      ...mapPage(row),
      userId: row.user_id,
      expiresAt: toIso(row.expires_at),
      draftId: row.draft_id,
      expectedRevision: Number(row.revision),
    } : null;
  }

  async createEditorSession(input: Parameters<AccessRepository['createEditorSession']>[0]): Promise<void> {
    await this.pool.query(
      `INSERT INTO editor_sessions (id, project_id, page_id, draft_id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [input.id, input.grant.projectId, input.grant.pageId, input.grant.draftId, input.grant.userId, input.tokenHash, input.expiresAt],
    );
  }

  async createShareLink(input: Parameters<AccessRepository['createShareLink']>[0]): Promise<ShareRecord> {
    const result = await this.pool.query<ShareRow>(
      `INSERT INTO share_links (id, page_id, release_id, created_by, token_hash, expires_at)
       SELECT $1, pg.id, r.id, $2, $5, $6
       FROM pages pg
       JOIN project_memberships m ON m.project_id = pg.project_id
         AND m.user_id = $2 AND m.revoked_at IS NULL AND m.role = ANY($7::text[])
       JOIN releases r ON r.id = $4 AND r.page_id = pg.id
       WHERE pg.id = $3
       RETURNING id, page_id, release_id,
                 (SELECT version FROM releases WHERE id = release_id) AS version,
                 expires_at, revoked_at, created_at`,
      [
        input.id, input.userId, input.pageId, input.releaseId, input.tokenHash, input.expiresAt,
        rolesWithPermission('publish'),
      ],
    );
    if (!result.rows[0]) throw new NotFoundError('Release was not found on this page');
    return mapShare(result.rows[0]);
  }

  async listShareLinks(userId: string, pageId: string): Promise<ShareRecord[]> {
    const result = await this.pool.query<ShareRow>(
      `SELECT s.id, s.page_id, s.release_id, r.version, s.expires_at, s.revoked_at, s.created_at
       FROM share_links s
       JOIN pages pg ON pg.id = s.page_id
       JOIN project_memberships m ON m.project_id = pg.project_id
         AND m.user_id = $2 AND m.revoked_at IS NULL AND m.role = ANY($3::text[])
       JOIN releases r ON r.id = s.release_id
       WHERE s.page_id = $1
       ORDER BY s.created_at DESC`,
      [pageId, userId, rolesWithPermission('view')],
    );
    return result.rows.map(mapShare);
  }

  async revokeShareLink(userId: string, shareLinkId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE share_links s SET revoked_at = NOW()
       FROM pages pg, project_memberships m
       WHERE s.id = $1 AND s.revoked_at IS NULL
         AND pg.id = s.page_id
         AND m.project_id = pg.project_id AND m.user_id = $2 AND m.revoked_at IS NULL
         AND m.role = ANY($3::text[])`,
      [shareLinkId, userId, rolesWithPermission('publish')],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getShareTarget(tokenHash: string, now: Date): Promise<ShareTarget | null> {
    const result = await this.pool.query<ShareTargetRow>(
      `${SHARE_TARGET_SELECT}
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL
         AND (s.expires_at IS NULL OR s.expires_at > $2)`,
      [tokenHash, now],
    );
    return result.rows[0] ? mapTarget(result.rows[0]) : null;
  }

  async createShareExchangeCode(input: Parameters<AccessRepository['createShareExchangeCode']>[0]): Promise<void> {
    await this.pool.query(
      `INSERT INTO share_exchange_codes (id, share_link_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [input.id, input.shareLinkId, input.tokenHash, input.expiresAt],
    );
  }

  async consumeShareExchangeCode(
    input: Parameters<AccessRepository['consumeShareExchangeCode']>[0],
  ): Promise<ShareTarget | null> {
    return this.transaction(async client => {
      const consumed = await client.query<{ share_link_id: string }>(
        `UPDATE share_exchange_codes c SET consumed_at = $3
         FROM share_links s, pages pg, projects p, project_origins po
         WHERE c.token_hash = $1 AND c.consumed_at IS NULL AND c.expires_at > $3
           AND s.id = c.share_link_id AND s.revoked_at IS NULL
           AND (s.expires_at IS NULL OR s.expires_at > $3)
           AND pg.id = s.page_id AND p.id = pg.project_id AND po.project_id = p.id
           AND po.origin || pg.pathname = $2
         RETURNING c.share_link_id`,
        [input.tokenHash, input.pageUrl, input.now],
      );
      const shareLinkId = consumed.rows[0]?.share_link_id;
      if (!shareLinkId) return null;
      const target = await client.query<ShareTargetRow>(
        `${SHARE_TARGET_SELECT} WHERE s.id = $1`,
        [shareLinkId],
      );
      return target.rows[0] ? mapTarget(target.rows[0]) : null;
    });
  }

  async createShareSession(input: Parameters<AccessRepository['createShareSession']>[0]): Promise<void> {
    await this.pool.query(
      `INSERT INTO share_sessions (id, share_link_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [input.id, input.shareLinkId, input.tokenHash, input.expiresAt],
    );
  }

  async authorizeRuntimeAccess(
    input: Parameters<AccessRepository['authorizeRuntimeAccess']>[0],
  ): Promise<'editor' | 'share' | null> {
    const editor = await this.pool.query(
      `SELECT 1
       FROM editor_sessions es
       JOIN projects p ON p.id = es.project_id
       JOIN pages pg ON pg.id = es.page_id
       JOIN project_memberships m ON m.project_id = es.project_id AND m.user_id = es.user_id
         AND m.revoked_at IS NULL AND m.role = ANY($5::text[])
       WHERE es.token_hash = $1 AND es.revoked_at IS NULL AND es.expires_at > $4
         AND p.public_key = $2 AND pg.pathname = $3`,
      [input.tokenHash, input.publicKey, input.pathname, input.now, rolesWithPermission('edit')],
    );
    if ((editor.rowCount ?? 0) > 0) return 'editor';

    const share = await this.pool.query(
      `SELECT 1
       FROM share_sessions ss
       JOIN share_links s ON s.id = ss.share_link_id
       JOIN releases r ON r.id = s.release_id
       JOIN pages pg ON pg.id = s.page_id
       JOIN projects p ON p.id = pg.project_id
       WHERE ss.token_hash = $1 AND ss.expires_at > $5
         AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > $5)
         AND p.public_key = $2 AND pg.pathname = $3 AND r.version = $4`,
      [input.tokenHash, input.publicKey, input.pathname, input.version, input.now],
    );
    return (share.rowCount ?? 0) > 0 ? 'share' : null;
  }

  async authorizeEditorDraft(
    input: Parameters<AccessRepository['authorizeEditorDraft']>[0],
  ): Promise<string | null> {
    const result = await this.pool.query<{ user_id: string }>(
      `SELECT es.user_id
       FROM editor_sessions es
       JOIN drafts d ON d.id = es.draft_id AND d.page_id = es.page_id
       JOIN project_memberships m ON m.project_id = es.project_id AND m.user_id = es.user_id
         AND m.revoked_at IS NULL AND m.role = ANY($4::text[])
       WHERE es.token_hash = $1 AND es.revoked_at IS NULL AND es.expires_at > $3
         AND d.id = $2 AND d.status = 'open'`,
      [input.tokenHash, input.draftId, input.now, rolesWithPermission('edit')],
    );
    return result.rows[0]?.user_id ?? null;
  }
}

const SHARE_TARGET_SELECT = `
  SELECT s.id AS share_link_id, s.release_id, s.expires_at, r.version,
         p.id AS project_id, pg.id AS page_id, p.public_key, pg.pathname,
         origin.origin
  FROM share_links s
  JOIN releases r ON r.id = s.release_id
  JOIN pages pg ON pg.id = s.page_id
  JOIN projects p ON p.id = pg.project_id
  JOIN LATERAL (
    SELECT po.origin FROM project_origins po
    WHERE po.project_id = p.id
    ORDER BY po.verified_at DESC NULLS LAST, po.created_at ASC
    LIMIT 1
  ) origin ON TRUE`;
