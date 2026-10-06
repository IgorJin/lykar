import {useEffect, useRef, useState} from 'preact/hooks';
import {api, type Project} from './api';
import {errorMessage} from './use-async-action';

type Assets = {mode: 'development' | 'versioned'; sdkVersion: string; sdkUrl: string; runtimeAssetUrl: string; editorAssetUrl: string; assetManifestUrl: string; editorAssetOrigin: string};
type Config = {status: 'configured' | 'unavailable'; apiBaseUrl: string; assets: Assets | null; reason?: string};
type Framework = 'static' | 'react' | 'vue';
const js = (value: string) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const html = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function installationSnippet(project: Project, config: Config, framework: Framework): string {
  if (config.status !== 'configured' || !config.assets) return '';
  const a = config.assets;
  const options = `  projectKey: ${js(project.publicKey)},\n  apiBaseUrl: ${js(config.apiBaseUrl)},\n  delivery: 'deployment',\n  runtimeAssetUrl: ${js(a.runtimeAssetUrl)},\n  editorAssetUrl: ${js(a.editorAssetUrl)},\n  assetManifestUrl: ${js(a.assetManifestUrl)},\n  editorAssetOrigin: ${js(a.editorAssetOrigin)},${framework === 'static' ? "\n  frameworkMode: 'static'," : ''}`;
  if (framework === 'static') return `<script src="${html(a.sdkUrl)}" crossorigin="anonymous"></script>\n<script>\nconst lykar = new window.Lykar({\n${options}\n});\nvoid lykar.start();\n</script>`;
  return `// vite.config.ts — добавьте плагин к существующим plugins\nimport {lykarVitePlugin} from '@lykar/frameworks/build';\n// plugins: [/* существующие плагины */, lykarVitePlugin()]\n\n// browser entry — инициализируйте SDK один раз\nimport {Lykar} from '@lykar/sdk';\nconst lykar = new Lykar({\n${options}\n});\nvoid lykar.start();`;
}

export function InstallationPanel({project}: {project: Project}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [framework, setFramework] = useState<Framework>('static');
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [retry, setRetry] = useState(0);
  const snippetRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setConfig(null); setError(''); setCopyStatus('');
    try {
      const saved = localStorage.getItem(`lykar:installation:${project.id}`);
      setFramework(saved === 'react' || saved === 'vue' ? saved : 'static');
    } catch { setFramework('static'); }
    void api<Config>('/api/admin/installation', {signal: controller.signal}).then(value => {
      if (!controller.signal.aborted) setConfig(value);
    }).catch(reason => {if (!controller.signal.aborted) setError(errorMessage(reason));});
    return () => controller.abort();
  }, [project.id, retry]);
  const snippet = config ? installationSnippet(project, config, framework) : '';
  function choose(value: Framework) {
    setFramework(value); setCopyStatus('');
    try { localStorage.setItem(`lykar:installation:${project.id}`, value); } catch { /* Optional preference persistence. */ }
  }
  async function copy() {
    if (!snippet) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(snippet);
      setCopyStatus('Инструкция скопирована. Передайте её разработчику сайта.');
    } catch {
      const area = snippetRef.current;
      if (!area) return;
      const previous = document.activeElement;
      area.focus(); area.select();
      let copied = false;
      try {copied = document.execCommand('copy');} catch { /* Manual selection remains available. */ }
      if (copied && previous instanceof HTMLElement) previous.focus();
      setCopyStatus(copied ? 'Инструкция скопирована.' : 'Текст выделен. Нажмите Ctrl+C или ⌘C, чтобы скопировать.');
    }
  }
  return <section class="installation-panel" aria-labelledby="installation-heading">
    <h3 id="installation-heading">Установка на сайт</h3>
    <p>Разработчик подключает Lykar один раз в общий шаблон или браузерную сборку сайта. После установки вы сможете открывать редактор из панели.</p>
    <div class="card">
      <h4>Что можно менять</h4>
      <p>Текст и оформление безопасно найденных элементов. Для React/Vue условие правки связано с исходным текстом элемента: скрытые состояния с одинаковым текстом не различаются.</p>
      <p>Произвольная перестройка компонентов, Shadow DOM, порталы, Next.js/RSC, streaming и selective hydration не поддержаны. Неоднозначные цели и конфликтующие inline !important отклоняются.</p>
      <p>Если на сайте действует CSP, разработчик должен разрешить API и manifest в connect-src, SDK/runtime/editor в script-src и создание стилей в style-src. Встроенному коду из инструкции нужен разрешённый nonce/hash или перенос в разрешённый внешний файл. Не ослабляйте политику сайта целиком.</p>
    </div>
    <label>Тип сайта <select value={framework} onChange={event => choose(event.currentTarget.value as Framework)} aria-label="Тип установки Lykar">
      <option value="static">Обычный HTML / статический сайт</option>
      <option value="react">React 19.2.8</option>
      <option value="vue">Vue 3.5.18</option>
    </select></label>
    {framework !== 'static' && <div class="card">
      <p>Поддержаны {framework === 'react' ? 'React 19.2.8 + react-dom 19.2.8' : 'Vue 3.5.18'}: CSR и обычный SSR с non-streaming hydration в element root. Установка требует изменения browser build; существующие компоненты менять не нужно.</p>
      <p><code>@lykar/sdk</code> и <code>@lykar/frameworks</code> сейчас private packages. Получите согласованный комплект npm pack tarballs у оператора сервиса вместе с нужными пакетами <code>@lykar/runtime</code> и <code>@lykar/protocol</code>. Установите локальные tarballs; публичный npm install для Lykar пока недоступен. Доставка beta-пакетов ещё требует выполнения этапа 12.</p>
      <p>Сохраните React/Vue плагины и добавьте <code>lykarVitePlugin()</code> из <code>@lykar/frameworks/build</code>. Проверена production-сборка Vite 8.2; dev/HMR не покрыты. Для esbuild 0.28.1 используйте <code>lykarEsbuildPlugin()</code> из того же пакета в browser build.</p>
      <p>Инициализацию запускайте только в браузере; обычные createRoot/hydrateRoot или createApp/createSSRApp остаются в приложении. При удалении root вызывайте штатный unmount.</p>
    </div>}
    {error && <p class="inline-error" role="alert">Не удалось загрузить инструкцию: {error}</p>}
    {!config && !error && <p role="status">Загружаем адреса установки…</p>}
    {(error || config?.status === 'unavailable') && <>
      {config?.status === 'unavailable' && <p role="alert">{config.reason === 'DEVELOPMENT_ASSETS_NOT_BUILT'
        ? 'Локальные файлы SDK ещё не собраны. Оператору нужно собрать @lykar/sdk и повторить загрузку инструкции.'
        : 'Оператор сервиса ещё не настроил адреса согласованного выпуска SDK. Установка станет доступна после настройки versioned assets; обратитесь к оператору.'}</p>}
      <button onClick={() => setRetry(value => value + 1)}>Повторить загрузку инструкции</button>
    </>}
    {config?.assets && snippet && <>
      <p class="small muted">SDK {config.assets.sdkVersion} · {config.assets.mode === 'development' ? 'локальные файлы разработки; для production нужен отдельный versioned выпуск' : 'настроенный versioned выпуск'}</p>
      <p>API: <code style={{overflowWrap: 'anywhere'}}>{config.apiBaseUrl}</code>. Файлы: <code style={{overflowWrap: 'anywhere'}}>{config.assets.editorAssetOrigin}</code>. Ключ проекта уже подставлен.</p>
      <label>{framework === 'static' ? 'Код перед закрывающим тегом body' : 'Настройка сборки и browser entry'}
        <textarea ref={snippetRef} value={snippet} readOnly rows={framework === 'static' ? 16 : 20} spellcheck={false}
          aria-label="Персональная инструкция установки Lykar" style={{width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '13px'}}/>
      </label>
      <button onClick={() => void copy()}>Скопировать {framework === 'static' ? 'код установки' : 'инструкцию'}</button>
      <p role="status" aria-live="polite">{copyStatus}</p>
      <p>Установите SDK один раз. Для обычных посетителей <code>delivery: 'deployment'</code> показывает только выбранный Deploy выпуск; до Deploy страница остаётся исходной. Затем откройте нужную страницу и запустите «Проверить подключение».</p>
    </>}
    <p class="muted">Save сохраняет черновик. Release фиксирует его версию для preview. Deploy отдельно включает выбранный выпуск для обычных посетителей; создание Release само по себе сайт не меняет.</p>
  </section>;
}
