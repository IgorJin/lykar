import type { EmailMessage } from './providers';

type LinkInput = { email: string; url: string; expiresAt: string | Date };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

function safeUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error('Invalid email link'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || /[\u0000-\u0020\u007f]/.test(value)) {
    throw new Error('Invalid email link');
  }
  return url.toString();
}

function expiry(value: string | Date): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid email link expiry');
  return `${date.toISOString().slice(0, 10).split('-').reverse().join('.')} в ${date.toISOString().slice(11, 16)} UTC`;
}

function htmlDocument(title: string, paragraphs: string[], url: string, action: string): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>`
    + paragraphs.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('')
    + `<p><a href="${escapeHtml(url)}" rel="noreferrer">${escapeHtml(action)}</a></p>`
    + '<p>Если вы не запрашивали это письмо, проигнорируйте его.</p></body></html>';
}

export function magicLinkMessage(input: LinkInput): EmailMessage {
  const url = safeUrl(input.url);
  const paragraphs = [
    'Вход в LYKAR',
    `Используйте ссылку, чтобы войти в аккаунт ${input.email}.`,
    `Ссылка действует до ${expiry(input.expiresAt)} и может быть использована только один раз.`,
    'Не пересылайте это письмо: ссылка открывает доступ к вашему аккаунту.',
  ];
  const subject = 'Ссылка для входа в LYKAR';
  return {
    to: input.email, subject,
    text: `${paragraphs.join('\n\n')}\n\nВойти в LYKAR: ${url}\n\nЕсли вы не запрашивали это письмо, проигнорируйте его.`,
    html: htmlDocument(subject, paragraphs, url, 'Войти в LYKAR'),
  };
}

export function invitationMessage(input: LinkInput & { projectName: string; role: string }): EmailMessage {
  const url = safeUrl(input.url);
  const roleNames = new Map([['admin', 'администратор'], ['editor', 'редактор'], ['viewer', 'наблюдатель']]);
  const paragraphs = [
    'Приглашение в проект LYKAR',
    `Вас пригласили в проект «${input.projectName}» с ролью «${roleNames.get(input.role) ?? input.role}».`,
    `Приглашение предназначено для аккаунта ${input.email}.`,
    `Ссылка действует до ${expiry(input.expiresAt)}. Для принятия войдите в аккаунт с этим адресом.`,
    'Не пересылайте это письмо: приглашение предназначено только вам.',
  ];
  const subject = 'Приглашение в проект LYKAR';
  return {
    to: input.email, subject,
    text: `${paragraphs.join('\n\n')}\n\nПринять приглашение: ${url}\n\nЕсли вы не запрашивали это письмо, проигнорируйте его.`,
    html: htmlDocument(subject, paragraphs, url, 'Принять приглашение'),
  };
}
