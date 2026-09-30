import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCron, matchesCron, simulate, normalizeConfig, parseJobText, jobText, serializableReport, wallClock, MINUTE, DEMO_CONFIG } from '../src/core.mjs';

const utc = wallClock('UTC');
const matches = (cron, date) => matchesCron(parseCron(cron), utc(Date.parse(date)));
const job = overrides => ({ id: 'a', name: 'A', cron: '0 * * * *', timezone: 'UTC', durationMinutes: 10, weight: 1, ...overrides });
const run = (jobs, extra = {}) => simulate({ capacity: 1, jobs }, { from: '2026-09-30T00:00:00Z', days: 1, ...extra });

test('five-field grammar: aliases, names, lists, ranges, steps, Sunday 7', () => {
  assert.equal(matches('@hourly', '2026-09-30T02:00Z'), true);
  assert.equal(matches('5,20-30/5 9-17 * JAN,SEP MON-FRI', '2026-09-30T09:25Z'), true);
  assert.equal(matches('5,20-30/5 9-17 * JAN,SEP MON-FRI', '2026-09-30T09:26Z'), false);
  assert.equal(matches('0 0 * * 7', '2026-10-04T00:00Z'), true);
  assert.equal(matches('0 0 * * SUN', '2026-10-04T00:00Z'), true);
  assert.equal(matches('10/20 * * * *', '2026-09-30T00:50Z'), true);
});
test('invalid, empty, wrapping, six-field and unsupported dialects reject', () => {
  for (const expression of ['', '* * * *', '* * * * * *', '60 * * * *', '*/0 * * * *', '3-1 * * * *', '0 0 ? * MON', '0 0 L * *', 'H * * * *', '@reboot', '1,,2 * * * *', '*/2/3 * * * *', '0 0 * NOPE *']) assert.throws(() => parseCron(expression), undefined, expression);
});
test('restricted day fields OR; wildcard and stepped wildcard fields AND', () => {
  assert.equal(matches('0 0 1 * MON', '2026-10-01T00:00Z'), true);
  assert.equal(matches('0 0 1 * MON', '2026-10-05T00:00Z'), true);
  assert.equal(matches('0 0 1 * MON', '2026-10-06T00:00Z'), false);
  assert.equal(matches('0 0 */2 * MON', '2026-10-05T00:00Z'), true);
  assert.equal(matches('0 0 */2 * MON', '2026-10-12T00:00Z'), false);
  assert.equal(matches('0 0 * * MON', '2026-10-01T00:00Z'), false);
});
test('adjacent runs do not overlap at an exclusive end boundary', () => {
  const result = run([job({ durationMinutes: 60 })]);
  assert.equal(result.summary.starts, 24);
  assert.equal(result.summary.peakActive, 1);
  assert.equal(result.summary.overloadMinutes, 0);
  assert.equal(result.summary.busyMinutes, 1440);
});
test('different launch minutes still overload when durations overlap', () => {
  const result = run([job({ durationMinutes: 10 }), job({ id: 'b', name: 'B', cron: '5 * * * *' })]);
  assert.equal(result.summary.peakLoad, 2);
  assert.equal(result.summary.overloadMinutes, 120);
  assert.equal(result.overloads.length, 24);
  assert.equal(result.overloads[0].start, Date.parse('2026-09-30T00:05Z'));
  assert.equal(result.overloads[0].end, Date.parse('2026-09-30T00:10Z'));
});
test('carry-in and delayed prior scheduled starts count correctly', () => {
  const result = run([job({ cron: '55 * * * *', durationMinutes: 10 })]);
  assert.equal(result.summary.carriedIn, 1);
  assert.equal(result.load[0], 1);
  assert.equal(result.load[5], 0);
  assert.equal(result.summary.starts, 24);
  const delayed = run([job({ cron: '55 * * * *', durationMinutes: 10, delayMinutes: 10 })]);
  assert.equal(delayed.runs[0].scheduledAt, Date.parse('2026-09-29T23:55Z'));
  assert.equal(delayed.runs[0].start, Date.parse('2026-09-30T00:05Z'));
});
test('self-overlap and fractional resource weights', () => {
  const result = run([job({ cron: '*/5 * * * *', durationMinutes: 12, weight: 0.4 })]);
  assert.equal(result.summary.peakActive, 3);
  assert.ok(Math.abs(result.summary.peakLoad - 1.2) < 1e-8);
  assert.equal(result.summary.overloadMinutes, 576);
});
test('spring DST gap skips nonexistent wall minute in this model', () => {
  const result = run([job({ cron: '30 2 * * *', timezone: 'America/New_York' })], { from: '2026-03-08T00:00Z' });
  assert.equal(result.summary.starts, 0);
});
test('autumn DST fold matches the repeated wall minute twice', () => {
  const result = run([job({ cron: '30 1 * * *', timezone: 'America/New_York' })], { from: '2026-11-01T00:00Z' });
  assert.equal(result.summary.starts, 2);
  assert.deepEqual(result.runs.map(r => new Date(r.start).toISOString()), ['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']);
});
test('fractional-offset IANA timezone conversion', () => {
  const result = run([job({ cron: '0 9 * * *', timezone: 'Asia/Kathmandu' })]);
  assert.equal(new Date(result.runs[0].start).toISOString(), '2026-09-30T03:15:00.000Z');
});
test('never-firing window warns without claiming impossible schedule', () => {
  const result = run([job({ cron: '0 0 31 2 *' })]);
  assert.equal(result.summary.starts, 0);
  assert.ok(result.warnings.some(w => w.code === 'no-starts'));
});
test('what-if delay reduces demo pressure without modifying source', () => {
  const before = simulate(DEMO_CONFIG, { from: '2026-09-30T00:00Z', days: 7 });
  const changed = structuredClone(DEMO_CONFIG);
  changed.jobs.find(j => j.id === 'search').delayMinutes = 45;
  const after = simulate(changed, { from: '2026-09-30T00:00Z', days: 7 });
  assert.ok(after.summary.overloadMinutes < before.summary.overloadMinutes);
  assert.equal(DEMO_CONFIG.jobs[2].delayMinutes, 0);
  assert.equal(before.summary.starts, after.summary.starts);
});
test('configuration bounds, duplicate IDs, names, zones and ambiguous dates reject', () => {
  for (const override of [{ durationMinutes: 0 }, { durationMinutes: 1.5 }, { delayMinutes: -1 }, { weight: NaN }, { weight: '1' }, { timezone: 'No/Such_Zone' }, { name: 'foo|bar' }]) assert.throws(() => normalizeConfig({ jobs: [job(override)] }));
  assert.throws(() => normalizeConfig({ jobs: [job({}), job({})] }));
  assert.throws(() => normalizeConfig({ jobs: [] }));
  for (const from of ['2026-09-30', '2026-09-30T00:00', '2026-02-30T00:00Z', '2026-01-01T24:00Z']) assert.throws(() => run([job({})], { from }));
  assert.throws(() => run([job({})], { days: 32 }));
  const result = run([job({})], { from: '2026-09-30T00:00:01Z' });
  assert.equal(result.window.from, '2026-09-30T00:01:00.000Z');
});
test('text config parses comments and round trips values', () => {
  const parsed = parseJobText('# comment\nbackup | @daily | 20 | UTC | 2 | 4\n', 3);
  assert.deepEqual(parseJobText(jobText(parsed), 3), parsed);
  assert.throws(() => parseJobText('bad line'));
});
test('JSON report has explicit ISO timestamps and omits minute arrays', () => {
  const report = serializableReport(run([job({})]));
  assert.equal(report.load, undefined);
  assert.equal(report.runs[0].start, '2026-09-30T00:00:00.000Z');
  assert.equal(report.runs[0].end, new Date(Date.parse(report.runs[0].start) + 10 * MINUTE).toISOString());
});
test('sweep-line aggregate agrees with direct run intersection for every minute', () => {
  const result = run([job({ durationMinutes: 17, weight: 0.7 }), job({ id: 'b', cron: '*/13 * * * *', durationMinutes: 22, weight: 1.3, delayMinutes: 3 })]);
  const start = Date.parse(result.window.from);
  for (let i = 0; i < result.window.minutes; i++) {
    const timestamp = start + i * MINUTE;
    const active = result.runs.filter(r => r.start <= timestamp && r.end > timestamp);
    assert.equal(result.active[i], active.length);
    assert.ok(Math.abs(result.load[i] - active.reduce((sum, r) => sum + r.weight, 0)) < 1e-7);
  }
});
