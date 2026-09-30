import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_CONFIG } from '../src/core.mjs';
import { makeHtml } from '../src/html.mjs';
const cli = fileURLToPath(new URL('../bin/croncrowd.mjs', import.meta.url));
const invoke = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
test('CLI help and input errors have documented exit codes', () => {
  assert.equal(invoke('--help').status, 0);
  assert.equal(invoke('audit').status, 2);
  assert.equal(invoke('audit', 'missing-file.json').status, 2);
  assert.equal(invoke('demo', '--port', '80').status, 2);
  assert.equal(invoke('audit', '--wat').status, 2);
});
test('JSON stdout, overload exit code, and standalone HTML export', async () => {
  const root = await mkdtemp(join(tmpdir(), 'croncrowd-test-'));
  try {
    const config = join(root, 'jobs.json'), html = join(root, 'report.html');
    await writeFile(config, JSON.stringify(DEMO_CONFIG));
    const result = invoke('audit', config, '--from', '2026-09-30T00:00Z', '--days', '1', '--json', '--html', html, '--fail-on-overload');
    assert.equal(result.status, 1);
    assert.ok(JSON.parse(result.stdout).summary.overloadMinutes > 0);
    assert.ok((await readFile(html, 'utf8')).includes('Database backup'));
    assert.match(result.stderr, /Interactive report/);
  } finally { await rm(resolve(root), { recursive: true, force: true }); }
});
test('HTML seed safely encodes script-breaking job names', async () => {
  const config = structuredClone(DEMO_CONFIG);
  config.jobs[0].name = '</script><img src=x onerror=alert(1)>';
  const html = await makeHtml(config);
  const seed = html.match(/<script id="seed" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.ok(!seed.includes('<'));
  assert.equal(JSON.parse(seed).config.jobs[0].name, config.jobs[0].name);
  assert.ok(!/<script[^>]*\bsrc=/.test(html));
});
