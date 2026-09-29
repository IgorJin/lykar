#!/usr/bin/env node
// Render with the installed skill, then improve only this sprint's HTML presentation.
import {readFileSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {basename, dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const optionIndex = process.argv.indexOf('--skill-dir');
const optionValue = optionIndex < 0 ? undefined : process.argv[optionIndex + 1];
if (!optionValue || optionValue.startsWith('--')) {
  throw new Error('Usage: node tasks/s4/render-plan.mjs --skill-dir <plan-sprint skill directory>');
}
const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../..');
const sprint = basename(directory);
const generator = join(resolve(optionValue), 'scripts/generate_sprint_plan_html.mjs');
const generated = spawnSync(process.execPath, [generator, '--root', root, '--sprint', sprint], {stdio: 'inherit'});
if (generated.error) throw generated.error;
if (generated.status !== 0) process.exit(generated.status ?? 1);

const output = join(directory, 'plan.html');
let html = readFileSync(output, 'utf8');
html = html.replace(/(?:<p class="source-line">\|[^\n]*<\/p>\s*)+/g, block => {
  const lines = [...block.matchAll(/<p class="source-line">(.*?)<\/p>/g)].map(match => match[1]);
  const rows = lines.map(line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim()));
  if (rows.length < 2 || !rows[1].every(cell => /^:?-{3,}:?$/.test(cell))) return block;
  const header = rows[0].map(cell => '<th scope="col">' + cell + '</th>').join('');
  const body = rows.slice(2).map(row => '<tr>' + row.map(cell => '<td>' + cell + '</td>').join('') + '</tr>').join('');
  return '<div class="table-wrap readable-matrix"><table><thead><tr>' + header + '</tr></thead><tbody>' + body + '</tbody></table></div>\n';
});
html = html.replace(/\[([^\]\n]+)\]\((\.[^)\n]+)\)/g, (_, label, href) => '<a href="' + href.replace(/"/g, '&quot;') + '">' + label + '</a>');
html = html.replace(/<svg class="dependency-graph" viewBox="0 0 (\d+) (\d+)"([^>]*)>([\s\S]*?)<\/svg>/, (_, width, height, attributes, content) =>
  '<p class="muted">Граф можно прокручивать по горизонтали. Параллельный набор только в W2.</p><div class="table-wrap graph-wrap" tabindex="0" aria-label="Зависимости задач и волны выполнения"><svg class="dependency-graph" style="width:' + width + 'px;min-width:' + width + 'px" viewBox="0 0 ' + width + ' ' + height + '"' + attributes + '>' + content + '</svg></div>');
html = html.replace(/(W\d+) · parallel/g, (_, wave) => wave + (wave === 'W2' ? ' · параллельно' : ' · последовательно'));
const sections = [
  ['Goal', 'goal', 'Goal · Цель S4'],
  ['Testing agreement', 'testing', 'Testing agreement · Согласованные проверки'],
  ['Parallel execution map', 'waves', 'Parallel execution map · Порядок выполнения'],
  ['Tasks: problem → capability', 'tasks', 'Tasks: problem → capability · Задачи'],
  ['Task details', 'details', 'Task details · Критерии и проверки'],
  ['Definition of done', 'done', 'Definition of done · Условия завершения'],
];
for (const [heading, id, title] of sections) {
  html = html.replace('<section><h2>' + heading + '</h2>', '<section id="' + id + '"><h2>' + title + '</h2>');
}
html = html.replace('Epic overview with agreed testing, task outcomes, dependencies, and parallel execution waves.', '8 задач · 7 волн · тестовая матрица согласована 27 сентября 2026. Реализация: DONE в согласованной матрице.');
html = html.replace('Open Markdown index', 'Markdown-план').replace('Open test plan', 'Соглашение о проверках');
html = html.replace(/>verification report<\/a>/g, '>Итоговый групповой отчёт</a>');
html = html.replace('</header>', '</header><nav class="plan-nav" aria-label="Разделы плана"><a href="#goal">Цель</a><a href="#testing">Тесты</a><a href="#waves">Зависимости</a><a href="#tasks">8 задач</a><a href="#details">Критерии</a><a href="#done">Приёмка</a></nav>');
html = html.replace('</style>', '.plan-nav{display:flex;flex-wrap:wrap;gap:8px 18px;padding:10px 4px}.readable-matrix{margin:12px 0 20px}.readable-matrix table{font-size:14px}.readable-matrix td{min-width:130px}.readable-matrix th{text-transform:none;letter-spacing:0}.graph-wrap{border-radius:12px}.task-detail{overflow-wrap:anywhere}.task-card summary{align-items:center}section{scroll-margin-top:20px}@media(max-width:600px){.task-card summary{flex-wrap:wrap}.summary-meta{text-align:left}.task-card summary::before{display:none}}\n</style>');
writeFileSync(output, html, 'utf8');
console.log('Enhanced sprint HTML: tasks/' + sprint + '/plan.html');
