import type { Pool, PoolClient } from 'pg';
import { ForbiddenError, VersioningError } from '../domain/versioning';
import type { ConnectionReport } from '@lykar/protocol';

type DB = Pool | PoolClient;
export type SiteOrigin = { id: string; project_id: string; origin: string; verified_at: Date | null; verification_method: string | null };
export class PostgresSiteRepository {
  constructor(private readonly pool: Pool) {}
  private async tx<T>(fn: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await this.pool.connect();
    try { await db.query('BEGIN'); const result = await fn(db); await db.query('COMMIT'); return result; }
    catch (e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
  }
  private async origin(db: DB, user: string, project: string, origin: string, lock = false): Promise<SiteOrigin> {
    const result = await db.query<SiteOrigin>(`SELECT po.* FROM project_origins po
      JOIN project_memberships m ON m.project_id=po.project_id AND m.user_id=$1 AND m.revoked_at IS NULL
      WHERE po.project_id=$2 AND po.origin=$3 AND m.role=ANY($4::text[])
      ${lock ? 'FOR UPDATE OF po FOR SHARE OF m' : ''}`, [user, project, origin, lock ? ['owner','admin'] : ['owner','admin','editor','viewer']]);
    if (!result.rows[0]) throw new ForbiddenError();
    return result.rows[0];
  }
  async page(user: string, page: string, mutate = false, db: DB = this.pool) {
    const result = await db.query<{project_id:string; pathname:string; public_key:string}>(`SELECT pg.project_id,pg.pathname,p.public_key
      FROM pages pg JOIN projects p ON p.id=pg.project_id
      JOIN project_memberships m ON m.project_id=pg.project_id AND m.user_id=$1 AND m.revoked_at IS NULL
      WHERE pg.id=$2 AND m.role=ANY($3::text[]) ${db !== this.pool ? 'FOR SHARE OF m' : ''}`,
    [user, page, mutate ? ['owner','admin','editor'] : ['owner','admin','editor','viewer']]);
    if (!result.rows[0]) throw new ForbiddenError();
    return result.rows[0];
  }
  async state(user: string, page: string, now: Date, freshMs: number) {
    const target = await this.page(user, page);
    const result = await this.pool.query(`SELECT po.id,po.origin,po.verified_at,po.verification_method,
      pr.created_at,pr.finished_at,pr.expires_at,pr.revoked_at,pr.code,pr.report
      FROM project_origins po LEFT JOIN LATERAL (
        SELECT * FROM site_connection_probes WHERE page_id=$1 AND origin_id=po.id ORDER BY (revoked_at IS NULL) DESC,created_at DESC,id DESC LIMIT 1
      ) pr ON TRUE WHERE po.project_id=$2 ORDER BY po.created_at,po.id`, [page, target.project_id]);
    return {pageId:page, publicKey:target.public_key, pathname:target.pathname, origins:result.rows.map(row => ({
      id:row.id,origin:row.origin,verifiedAt:row.verified_at?.toISOString() ?? null,verificationMethod:row.verification_method,
      connection: !row.created_at ? {status:'unchecked',code:'NOT_CHECKED',checkedAt:null,report:null}
        : {status:row.revoked_at ? 'unchecked' : !row.finished_at ? (row.expires_at <= now ? 'inconclusive' : 'checking')
          : row.finished_at.getTime()+freshMs <= now.getTime() ? 'stale' : row.code === 'OK' ? 'checked' : row.code === 'NO_SIGNAL' || row.code === 'CANCELLED' ? 'inconclusive' : 'attention',
          code:row.revoked_at ? 'NOT_CHECKED' : !row.finished_at && row.expires_at <= now ? 'NO_SIGNAL' : row.code ?? 'AWAITING_SIGNAL',
          checkedAt:row.finished_at?.toISOString() ?? null, report:row.revoked_at ? null : row.report},
    }))};
  }
  async challenge(input: {user:string;project:string;origin:string;id:string;hash:string;now:Date;expires:Date}) {
    return this.tx(async db => {
      const target = await this.origin(db,input.user,input.project,input.origin,true);
      await db.query('UPDATE origin_verification_challenges SET revoked_at=$2 WHERE origin_id=$1 AND revoked_at IS NULL',[target.id,input.now]);
      await db.query('INSERT INTO origin_verification_challenges(id,origin_id,token_hash,created_at,expires_at) VALUES($1,$2,$3,$4,$5)',[input.id,target.id,input.hash,input.now,input.expires]);
    });
  }
  async prepareVerification(input: {user:string;project:string;origin:string;id:string;hash:string;now:Date}) {
    return this.tx(async db => {
      const target=await this.origin(db,input.user,input.project,input.origin,true);
      const current=await db.query(`SELECT * FROM origin_verification_challenges WHERE id=$1 AND origin_id=$2 AND token_hash=$3
        AND revoked_at IS NULL AND consumed_at IS NULL AND expires_at>$4 FOR UPDATE`,[input.id,target.id,input.hash,input.now]);
      if (!current.rows[0]) throw new VersioningError('Код подтверждения истёк, отозван или уже использован.','VERIFICATION_CHALLENGE_INVALID',409);
      if (current.rows[0].checked_at && input.now.getTime()-current.rows[0].checked_at.getTime()<5000)
        throw new VersioningError('Повторите DNS-проверку через 5 секунд.','DNS_CHECK_COOLDOWN',429,{retryAfterSeconds:5});
      await db.query('UPDATE origin_verification_challenges SET checked_at=$2 WHERE id=$1',[input.id,input.now]);
      return target;
    });
  }
  async verify(input: {user:string;project:string;origin:string;id:string;hash:string;now:Date}) {
    return this.tx(async db => {
      const target=await this.origin(db,input.user,input.project,input.origin,true);
      const consumed=await db.query(`UPDATE origin_verification_challenges SET consumed_at=$4 WHERE id=$1 AND origin_id=$2 AND token_hash=$3
        AND revoked_at IS NULL AND consumed_at IS NULL AND expires_at>$4 RETURNING id`,[input.id,target.id,input.hash,input.now]);
      if (!consumed.rowCount) throw new VersioningError('Код подтверждения больше не действителен.','VERIFICATION_CHALLENGE_INVALID',409);
      await db.query("UPDATE project_origins SET verified_at=$2,verification_method='dns-txt' WHERE id=$1",[target.id,input.now]);
    });
  }
  async local(user:string,project:string,origin:string,now:Date) {
    return this.tx(async db => { const target=await this.origin(db,user,project,origin,true);
      await db.query("UPDATE project_origins SET verified_at=$2,verification_method='local-development' WHERE id=$1",[target.id,now]); });
  }
  async revoke(user:string,project:string,origin:string,now:Date) {
    return this.tx(async db => { const target=await this.origin(db,user,project,origin,true);
      await db.query('UPDATE project_origins SET verified_at=NULL,verification_method=NULL WHERE id=$1',[target.id]);
      await db.query('UPDATE origin_verification_challenges SET revoked_at=$2 WHERE origin_id=$1 AND revoked_at IS NULL',[target.id,now]);
      await db.query('UPDATE site_connection_probes SET revoked_at=$2 WHERE origin_id=$1 AND revoked_at IS NULL',[target.id,now]); });
  }
  async probe(input: {user:string;page:string;origin:string;id:string;hash:string;now:Date;expires:Date}) {
    return this.tx(async db => {
      const page=await this.page(input.user,input.page,true,db);
      const origin=await this.origin(db,input.user,page.project_id,input.origin);
      // Per-page/origin serialisation makes the most recent probe authoritative.
      await db.query('SELECT id FROM project_origins WHERE id=$1 FOR UPDATE',[origin.id]);
      await db.query('UPDATE site_connection_probes SET revoked_at=$3 WHERE page_id=$1 AND origin_id=$2 AND revoked_at IS NULL',[input.page,origin.id,input.now]);
      await db.query('INSERT INTO site_connection_probes(id,page_id,origin_id,requested_by,token_hash,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[input.id,input.page,origin.id,input.user,input.hash,input.now,input.expires]);
      return {pageUrl:origin.origin+page.pathname,publicKey:page.public_key};
    });
  }
  async finish(input:{user:string;page:string;id:string;hash:string;now:Date;report:ConnectionReport|null;reason:'NO_SIGNAL'|'CANCELLED'}) {
    return this.tx(async db => {
      const page=await this.page(input.user,input.page,true,db);
      const probe=await db.query(`SELECT pr.*,po.origin FROM site_connection_probes pr JOIN project_origins po ON po.id=pr.origin_id
        WHERE pr.id=$1 AND pr.page_id=$2 AND pr.requested_by=$3 AND pr.token_hash=$4
        AND pr.revoked_at IS NULL AND pr.finished_at IS NULL AND pr.expires_at>$5 FOR UPDATE OF pr`,[input.id,input.page,input.user,input.hash,input.now]);
      if (!probe.rows[0]) throw new VersioningError('Проверка истекла, заменена или уже завершена.','CONNECTION_PROBE_INVALID',409);
      const report=input.report;
      if (report && report.pageUrl!==probe.rows[0].origin+page.pathname) throw new ForbiddenError('Отчёт относится к другой странице.');
      const code=!report ? input.reason : report.projectKey!==page.public_key ? 'WRONG_PROJECT_KEY'
        : report.csp.length ? 'CSP_BLOCKED' : report.api!=='reachable' ? 'API_UNAVAILABLE' : report.readiness==='unsupported' ? 'UNSUPPORTED_FRAMEWORK'
        : report.runtimeAsset==='unavailable' ? 'RUNTIME_ASSET_UNAVAILABLE' : report.editorAsset==='unavailable' ? 'EDITOR_ASSET_UNAVAILABLE'
        : report.readiness!=='ready' ? 'READINESS_PENDING' : report.runtimeAsset!=='ready' || report.editorAsset!=='ready' ? 'ASSETS_UNCHECKED' : 'OK';
      // Drop nonce, page URL and unknown fields; persist only bounded diagnostics.
      const safe=report ? {sdkVersion:report.sdkVersion,api:report.api,runtimeAsset:report.runtimeAsset,editorAsset:report.editorAsset,readiness:report.readiness,csp:report.csp} : null;
      await db.query('UPDATE site_connection_probes SET finished_at=$2,code=$3,report=$4 WHERE id=$1',[input.id,input.now,code,safe]);
      return {code,checkedAt:input.now.toISOString()};
    });
  }
}
