export type Project = { id:string; name:string; publicKey:string; origins:string[]; createdAt:string };
export type Page = { id:string; projectId:string; name:string; pathname:string; createdAt:string; updatedAt:string };
export type Draft = { id:string; projectId:string; pageId:string; status:'open'|'published'|'abandoned'; revision:number; baseReleaseId:string|null; publishedReleaseId:string|null; updatedAt:string };
export type SourceSnapshot = { algorithm:'lykar-dom-v1'; pageHash:string; capturedAt:string };
export type Release = { id:string; pageId:string; version:number; operationCount:number; manifestHash:string; sourceSnapshot:SourceSnapshot|null; createdAt:string };
export type Share = { id:string; pageId:string; releaseId:string; version:number; expiresAt:string|null; revokedAt:string|null; createdAt:string };
export type ExperimentStatus = 'draft'|'active'|'paused'|'completed';
export type ExperimentVariantKey = 'A'|'B';
export type ExperimentVariantLink = { id:string; variantId:string; tokenHint:string; revokedAt:string|null; createdAt:string };
export type ExperimentLink = { id:string; experimentId:string; tokenHint:string; revokedAt:string|null; createdAt:string };
export type ExperimentVariant = { id:string; key:ExperimentVariantKey; releaseId:string|null; releaseVersion:number|null; description:string|null; weightBps:number; links:ExperimentVariantLink[] };
export type Experiment = { id:string; projectId:string; pageId:string; name:string; status:ExperimentStatus; winnerVariantKey:ExperimentVariantKey|null; conversionEventName:string|null; firstActivatedAt:string|null; activatedAt:string|null; pausedAt:string|null; completedAt:string|null; createdAt:string; updatedAt:string; links:ExperimentLink[]; variants:[ExperimentVariant,ExperimentVariant] };
export type AnalyticsVariantReport = { key:ExperimentVariantKey; weightBps:number; visitors:number; views:number; uniqueConversions:number; conversions:number; conversionRate:number|null; upliftVsA:number|null };
export type ExperimentAnalyticsReport = { experimentId:string; conversionEventName:string|null; generatedAt:string; variants:[AnalyticsVariantReport,AnalyticsVariantReport] };
export type ProjectRole = 'owner'|'admin'|'editor'|'viewer';
export type ProjectPermissions = { view:boolean; edit:boolean; publish:boolean; manageMembers:boolean; transferOwnership:boolean };
export type ProjectMember = { id:string; projectId:string; userId:string; email:string; role:ProjectRole; createdAt:string; updatedAt:string };
export type ProjectInvitation = { id:string; projectId:string; email:string; role:Exclude<ProjectRole,'owner'>; invitedBy:string; expiresAt:string; acceptedAt:string|null; revokedAt:string|null; createdAt:string };
export type ProjectAccess = { actorRole:ProjectRole; permissions:ProjectPermissions; members:ProjectMember[]; invitations:ProjectInvitation[] };

export class ApiError extends Error { constructor(message:string, readonly status:number, readonly code?:string, readonly retryAfterSeconds?:number, readonly deliveryId?:string) { super(message); } }

export async function api<T>(path:string, init:RequestInit = {}):Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials:'same-origin',
    headers:{ ...(init.body ? {'Content-Type':'application/json'} : {}), ...init.headers },
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    let code: string | undefined;
    let retryAfterSeconds: number | undefined;
    let deliveryId: string | undefined;
    try {
      const error = ((await response.json()) as {error?:{message?:string;code?:string;details?:{retryAfterSeconds?:number;deliveryId?:string}}}).error;
      message = error?.message ?? message; code = error?.code;
      const delay = Number(response.headers.get('Retry-After') ?? error?.details?.retryAfterSeconds);
      if (Number.isFinite(delay) && delay > 0) retryAfterSeconds = Math.ceil(delay);
      deliveryId = error?.details?.deliveryId;
    } catch { /* noop */ }
    throw new ApiError(message, response.status, code, retryAfterSeconds, deliveryId);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const post = <T>(path:string, body:unknown) => api<T>(path, {method:'POST', body:JSON.stringify(body)});
export const patch = <T>(path:string, body:unknown) => api<T>(path, {method:'PATCH', body:JSON.stringify(body)});
export const del = (path:string) => api<void>(path, {method:'DELETE'});

export type DeploymentAction = 'deploy' | 'disable' | 'rollback';
export type DeploymentActivation = {id:string;pageId:string;revision:number;previousReleaseId:string|null;releaseId:string|null;action:DeploymentAction;reason:string;actorUserId:string;createdAt:string};
export type DeploymentState = {pageId:string;revision:number;activeReleaseId:string|null;activation:DeploymentActivation|null};
export type DeploymentHistory = {activations:DeploymentActivation[];nextBeforeRevision:number|null};

export type AnalyticsTest = { id:string; eventName:string; expiresAt:string; consent:'pending'|'granted'|'denied'|null; eventReceived:boolean; lastReceivedAt:string|null };
