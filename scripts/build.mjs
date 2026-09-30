import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const [template, style, core, app] = await Promise.all(['web/template.html', 'web/style.css', 'src/core.mjs', 'web/app.js'].map(path => readFile(new URL(path, root), 'utf8')));
const html = template.replace('/* STYLE */', () => style).replace('/* CORE */', () => core.replace(/^export /gm, '')).replace('/* APP */', () => app);
const target = new URL('web/index.html', root);
if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8') !== html) throw new Error('web/index.html is stale. Run node scripts/build.mjs.');
  process.stdout.write('Standalone browser build is current.\n');
} else { await writeFile(target, html, 'utf8'); process.stdout.write('Built web/index.html �� no external assets.\n'); }
