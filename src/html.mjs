import { readFile } from 'node:fs/promises';

export async function makeHtml(config, options = {}) {
  const template = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
  const seed = JSON.stringify({ config, options }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return template.replace(/(<script id="seed" type="application\/json">)[\s\S]*?(<\/script>)/, (_, open, close) => open + seed + close);
}
