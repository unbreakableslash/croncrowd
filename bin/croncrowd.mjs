#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { DEMO_CONFIG, simulate, serializableReport } from '../src/core.mjs';
import { makeHtml } from '../src/html.mjs';

const HELP = `CronCrowd �� see when cron jobs overlap

  croncrowd demo [--port 4173]
  croncrowd audit jobs.json [--from ISO] [--days 7] [--capacity 4]
                 [--json] [--html report.html] [--fail-on-overload]

Requires Node.js 20+. No dependencies, network calls, or job execution.
Audit models minute-resolution starts, fixed durations, and resource weights.
Window includes its first minute and excludes its final minute.
ISO timestamps must include Z or a UTC offset. days: 1�C31.
Exit codes: 0 success, 1 overload with --fail-on-overload, 2 invalid input/I/O.
Use --html to produce a standalone interactive report. Open it offline.
`;

function args(argv) {
  const flags = {}, positional = [], withValue = new Set(['from', 'days', 'capacity', 'html', 'port']);
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (item === '--help' || item === '-h') { flags.help = true; continue; }
    if (!item.startsWith('--')) { positional.push(item); continue; }
    const key = item.slice(2);
    if (![...withValue, 'json', 'fail-on-overload'].includes(key)) throw new Error(`Unknown option ${item}.`);
    if (Object.hasOwn(flags, key)) throw new Error(`Duplicate option ${item}.`);
    if (withValue.has(key)) {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`${item} needs a value.`);
      flags[key] = value;
    } else flags[key] = true;
  }
  return { flags, positional };
}

try {
  const { flags, positional } = args(process.argv.slice(2));
  const command = positional[0];
  if (flags.help || !command) process.stdout.write(HELP);
  else if (command === 'demo') {
    if (positional.length !== 1 || Object.keys(flags).some(k => k !== 'port')) throw new Error('demo accepts only --port.');
    const port = Number(flags.port ?? 4173);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('port must be 1024�C65535.');
    const html = await makeHtml(DEMO_CONFIG);
    const server = createServer((req, res) => {
      if (req.url !== '/' && req.url !== '/index.html') { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'" });
      res.end(html);
    });
    server.on('error', error => { process.stderr.write(`CronCrowd: ${error.message}\n`); process.exitCode = 2; });
    server.listen(port, '127.0.0.1', () => process.stdout.write(`CronCrowd demo: http://127.0.0.1:${port}\nCtrl+C to stop. Your config stays in this browser.\n`));
  } else if (command === 'audit') {
    if (positional.length !== 2 || flags.port) throw new Error('audit needs exactly one JSON config file.');
    const stat = await import('node:fs/promises').then(fs => fs.stat(positional[1]));
    if (stat.size > 1_000_000) throw new Error('Config file exceeds 1 MB.');
    const config = JSON.parse(await readFile(positional[1], 'utf8'));
    if (flags.capacity !== undefined) config.capacity = Number(flags.capacity);
    const options = { days: Number(flags.days ?? 7), from: flags.from ?? new Date().toISOString() };
    const result = simulate(config, options);
    if (flags.html) {
      await writeFile(flags.html, await makeHtml(result.config, { ...options, from: result.window.from }), 'utf8');
      process.stderr.write(`Interactive report written to ${flags.html}\n`);
    }
    if (flags.json) process.stdout.write(JSON.stringify(serializableReport(result), null, 2) + '\n');
    else {
      const s = result.summary;
      process.stdout.write(`CronCrowd\n${result.window.from} �� ${result.window.to}\n\n${result.jobs.length} jobs �� ${s.starts} starts �� ${s.carriedIn} carried-in runs\nPeak load ${s.peakLoad.toFixed(2)} / capacity ${result.config.capacity} at ${s.peakAt}\n${s.overloadMinutes} overloaded minutes �� ${result.overloads.length} overload windows\n\n`);
      for (const job of result.jobs) process.stdout.write(`${job.name}: ${job.count} starts, ${job.durationMinutes}m duration, ${job.weight} units, ${job.delayMinutes}m delay (${job.timezone})\n`);
      for (const warning of result.warnings) process.stdout.write(`NOTE: ${warning.message}\n`);
    }
    if (flags['fail-on-overload'] && result.summary.overloadMinutes > 0) process.exitCode = 1;
  } else throw new Error(`Unknown command "${command}". Use --help.`);
} catch (error) { process.stderr.write(`CronCrowd: ${error.message}\n`); process.exitCode = 2; }
