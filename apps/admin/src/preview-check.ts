import {isPreviewCheckReport, type PreviewCheckReport} from '@lykar/protocol';
import {post, type Page, type Project, type Release} from './api';

export function checkReleasePreview(project: Project, page: Page, release: Release, signal: AbortSignal): Promise<PreviewCheckReport> {
  const popup = window.open('about:blank', '_blank');
  if (!popup) return Promise.reject(new Error('Разрешите всплывающие окна для проверки сайта.'));
  popup.opener = null;
  const origins = new Set(project.origins.map(origin => new URL(origin).origin));
  const nonce = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    let settled = false;
    let polling: ReturnType<typeof setInterval> | undefined;
    const finish = (error?: Error, report?: PreviewCheckReport) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (polling) clearInterval(polling);
      window.removeEventListener('message', receive);
      signal.removeEventListener('abort', aborted);
      if (error) { popup.close(); reject(error); }
      else resolve(report!);
    };
    const receive = (event: MessageEvent) => {
      if (event.source !== popup || !origins.has(event.origin) || !isPreviewCheckReport(event.data)) return;
      const report = event.data;
      if (report.nonce !== nonce || report.projectKey !== project.publicKey || report.pageId !== page.id
        || report.releaseId !== release.id || report.version !== release.version) return;
      finish(undefined, report);
    };
    const aborted = () => finish(new Error('Проверка отменена.'));
    const timeout = setTimeout(() => finish(new Error('Сайт не вернул отчёт. Версия не проверена: проверьте SDK, доступ и окно предпросмотра.')), 30_000);
    window.addEventListener('message', receive);
    signal.addEventListener('abort', aborted, {once: true});
    if (signal.aborted) { aborted(); return; }
    void post<{url: string}>(`/api/admin/pages/${page.id}/shares`, {releaseId: release.id, expiresInSeconds: 1800}).then(({url}) => {
      if (settled) return;
      popup.location.replace(url);
      polling = setInterval(() => {
        if (popup.closed) { finish(new Error('Окно закрыто до получения отчёта. Версия не проверена.')); return; }
        for (const origin of origins) popup.postMessage({type: 'lykar:preview-check', schemaVersion: 1, nonce, pageId: page.id, releaseId: release.id}, origin);
      }, 250);
    }, error => finish(error instanceof Error ? error : new Error(String(error))));
  });
}
