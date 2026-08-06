export type Project = { id:string; name:string; publicKey:string; origins:string[]; createdAt:string };
export type Page = { id:string; projectId:string; name:string; pathname:string; createdAt:string; updatedAt:string };
export type Draft = { id:string; projectId:string; pageId:string; status:'open'|'published'|'abandoned'; revision:number; baseReleaseId:string|null; publishedReleaseId:string|null; updatedAt:string };
export type Release = { id:string; pageId:string; version:number; operationCount:number; manifestHash:string; createdAt:string };
export type Share = { id:string; pageId:string; releaseId:string; version:number; expiresAt:string|null; revokedAt:string|null; createdAt:string };
export type ProjectRole = 'owner'|'admin'|'editor'|'viewer';
export type ProjectPermissions = { view:boolean; edit:boolean; publish:boolean; manageMembers:boolean; transferOwnership:boolean };
export type ProjectMember = { id:string; projectId:string; userId:string; email:string; role:ProjectRole; createdAt:string; updatedAt:string };
export type ProjectInvitation = { id:string; projectId:string; email:string; role:Exclude<ProjectRole,'owner'>; invitedBy:string; expiresAt:string; acceptedAt:string|null; revokedAt:string|null; createdAt:string };
export type ProjectAccess = { actorRole:ProjectRole; permissions:ProjectPermissions; members:ProjectMember[]; invitations:ProjectInvitation[] };

export class ApiError extends Error { constructor(message:string, readonly status:number) { super(message); } }

export async function api<T>(path:string, init:RequestInit = {}):Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials:'same-origin',
    headers:{ ...(init.body ? {'Content-Type':'application/json'} : {}), ...init.headers },
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try { message = ((await response.json()) as {error?:{message?:string}}).error?.message ?? message; } catch { /* noop */ }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const post = <T>(path:string, body:unknown) => api<T>(path, {method:'POST', body:JSON.stringify(body)});
export const patch = <T>(path:string, body:unknown) => api<T>(path, {method:'PATCH', body:JSON.stringify(body)});
export const del = (path:string) => api<void>(path, {method:'DELETE'});
