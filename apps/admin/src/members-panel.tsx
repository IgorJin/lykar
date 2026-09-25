import { useState } from 'preact/hooks';

import { del, patch, post } from './api';
import type { ProjectAccess, ProjectInvitation, ProjectMember, ProjectRole } from './api';
import { errorMessage, useAsyncAction } from './use-async-action';

type InvitableRole = Exclude<ProjectRole, 'owner'>;

export function MembersPanel({ access, currentUserId, projectId, reload }: {
  access: ProjectAccess;
  currentUserId: string;
  projectId: string;
  reload: () => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitableRole>('editor');
  const [status, setStatus] = useState('');
  const { pendingAction, actionError, setActionError, runAction } = useAsyncAction(reload, true, 'Список участников изменился.');
  const pending = Boolean(pendingAction);
  async function retry() {
    try {
      await reload();
      setActionError('');
    } catch (reason) {
      setActionError(`Не удалось обновить данные: ${errorMessage(reason)}`);
    }
  }
  async function invite(event: Event) {
    event.preventDefault();
    await runAction('invite', async () => {
      await post(`/api/admin/projects/${projectId}/invitations`, { email, role });
      setStatus(`Приглашение для ${email} создано.`);
      setEmail('');
    });
  }
  async function changeRole(member: ProjectMember, nextRole: InvitableRole) {
    await runAction('role', () => patch(`/api/admin/projects/${projectId}/members/${member.id}`, { role: nextRole }));
  }
  async function revokeMember(member: ProjectMember) {
    if (!confirm(`Отозвать доступ у ${member.email}?`)) return;
    await runAction('revoke', () => del(`/api/admin/projects/${projectId}/members/${member.id}`));
  }
  async function transfer(member: ProjectMember) {
    if (!confirm(`Передать ownership пользователю ${member.email}? Вы станете Admin.`)) return;
    await runAction('transfer', () => post(`/api/admin/projects/${projectId}/transfer-ownership`, { membershipId: member.id }));
  }
  async function resend(invitation: ProjectInvitation) {
    await runAction('resend', async () => {
      await post(`/api/admin/invitations/${invitation.id}/resend`, {});
      setStatus(`Новая ссылка для ${invitation.email} создана.`);
    });
  }
  async function cancel(invitation: ProjectInvitation) {
    if (!confirm(`Отозвать приглашение для ${invitation.email}?`)) return;
    await runAction('cancel', () => del(`/api/admin/invitations/${invitation.id}`));
  }
  return <div class="members-panel">
    {actionError && <div class="inline-error" role="alert">
      {actionError} <button type="button" disabled={pending} onClick={() => void retry()}>Повторить</button>
    </div>}
    {access.permissions.manageMembers && <form class="member-invite" onSubmit={event => void invite(event)}>
      <h3>Пригласить участника</h3>
      <div class="row">
        <input type="email" required disabled={pending} value={email} onInput={event => setEmail(event.currentTarget.value)} placeholder="member@example.com" aria-label="Email участника" />
        <select disabled={pending} value={role} onChange={event => setRole(event.currentTarget.value as InvitableRole)} aria-label="Роль приглашения">
          <option value="admin">Admin</option><option value="editor">Editor</option><option value="viewer">Viewer</option>
        </select>
        <button class="primary" disabled={pending}>Пригласить</button>
      </div>
      {status && <p class="success">{status}</p>}
    </form>}
    <h3>Активные участники</h3>
    <div class="member-list">{access.members.map(member => {
      const mutable = access.permissions.manageMembers && member.userId !== currentUserId && member.role !== 'owner';
      return <div class="member-row" key={member.id}>
        <div><b>{member.email}</b>{member.userId === currentUserId && <span class="muted small"> · вы</span>}</div>
        {mutable ? <select
          value={member.role}
          disabled={pending}
          onChange={event => void changeRole(member, event.currentTarget.value as InvitableRole)}
          aria-label={`Роль ${member.email}`}
        ><option value="admin">Admin</option><option value="editor">Editor</option><option value="viewer">Viewer</option></select> : <span class={`badge role-${member.role}`}>{roleLabel(member.role)}</span>}
        <div class="member-actions">
          {access.permissions.transferOwnership && member.userId !== currentUserId && <button disabled={pending} onClick={() => void transfer(member)}>Передать ownership</button>}
          {mutable && <button class="danger" disabled={pending} onClick={() => void revokeMember(member)}>Отозвать доступ</button>}
        </div>
      </div>;
    })}</div>
    <h3>Ожидают принятия</h3>
    {access.invitations.length === 0 ? <p class="muted">Активных приглашений нет.</p> : <div class="member-list">{access.invitations.map(invitation => <div class="member-row" key={invitation.id}>
      <div><b>{invitation.email}</b><div class="small muted">{new Date(invitation.expiresAt) <= new Date() ? 'Истекло' : `Действует до ${new Date(invitation.expiresAt).toLocaleString()}`}</div></div>
      <span class={`badge role-${invitation.role}`}>{roleLabel(invitation.role)}</span>
      {access.permissions.manageMembers && <div class="member-actions"><button disabled={pending} onClick={() => void resend(invitation)}>Отправить повторно</button><button class="danger" disabled={pending} onClick={() => void cancel(invitation)}>Отозвать</button></div>}
    </div>)}</div>}
  </div>;
}

export function roleLabel(role: ProjectRole): string {
  return ({ owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Viewer' })[role];
}
