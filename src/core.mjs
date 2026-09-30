/** Pure, dependency-free scheduling model shared by the CLI and browser. */
export const MINUTE = 60_000;
export const MAX_RUNS = 200_000;
const MONTHS = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ');
const DAYS = 'SUN MON TUE WED THU FRI SAT'.split(' ');
const MACROS = { '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *', '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *' };
const SPECS = [[0, 59], [0, 23], [1, 31], [1, 12, MONTHS], [0, 7, DAYS]];

function number(text, min, max, names) {
  const named = names?.indexOf(text.toUpperCase());
  const value = named >= 0 ? named + (names === MONTHS ? 1 : 0) : /^\d+$/.test(text) ? Number(text) : NaN;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Value "${text}" must be ${min}–${max}${names ? ' or a three-letter name' : ''}.`);
  return value;
}

function field(text, [min, max, names], index) {
  const values = new Set();
  for (const part of text.split(',')) {
    const chunks = part.split('/');
    if (chunks.length > 2 || !chunks[0]) throw new Error(`Invalid cron field "${text}".`);
    const step = chunks.length === 2 ? number(chunks[1], 1, max - min + 1) : 1;
    const base = chunks[0];
    let low, high;
    if (base === '*') { low = min; high = max; }
    else if (base.includes('-')) {
      const range = base.split('-');
      if (range.length !== 2) throw new Error(`Invalid range "${base}".`);
      low = number(range[0], min, max, names); high = number(range[1], min, max, names);
    } else { low = number(base, min, max, names); high = chunks.length === 2 ? max : low; }
    if (low > high) throw new Error(`Wrapping ranges are unsupported: "${base}".`);
    for (let value = low; value <= high; value += step) values.add(index === 4 && value === 7 ? 0 : value);
  }
  // Vixie wildcard flags apply to fields beginning with *, including */n.
  return { values, wildcard: text.startsWith('*'), text };
}

export function parseCron(expression) {
  if (typeof expression !== 'string') throw new Error('Cron expression must be a string.');
  const source = expression.trim();
  const expanded = MACROS[source.toLowerCase()] || source;
  const pieces = expanded.split(/\s+/);
  if (pieces.length !== 5) throw new Error('Use five cron fields: minute hour day month weekday. Seconds, Quartz, H, L, W, ?, and @reboot are unsupported.');
  return { source, expanded, fields: pieces.map((text, index) => field(text, SPECS[index], index)) };
}

export function matchesCron(parsed, wall) {
  const [minute, hour, dom, month, dow] = parsed.fields;
  if (!minute.values.has(wall.minute) || !hour.values.has(wall.hour) || !month.values.has(wall.month)) return false;
  const a = dom.values.has(wall.day), b = dow.values.has(wall.weekday);
  return dom.wildcard || dow.wildcard ? a && b : a || b;
}

export function wallClock(timezone = 'UTC') {
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
  } catch { throw new Error(`Unknown IANA timezone "${timezone}".`); }
  if (timezone === 'UTC' || timezone === 'Etc/UTC') return timestamp => {
    const d = new Date(timestamp);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: d.getUTCDay(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
  };
  return timestamp => {
    const parts = Object.fromEntries(formatter.formatToParts(timestamp).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
    return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), weekday: DAYS.indexOf(parts.weekday.toUpperCase()), hour: Number(parts.hour) % 24, minute: Number(parts.minute) };
  };
}

function bounded(value, label, min, max, integer = true) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new Error(`${label} must be ${integer ? 'an integer' : 'a number'} from ${min} to ${max}.`);
  return value;
}

export function normalizeConfig(config) {
  if (!config || !Array.isArray(config.jobs) || config.jobs.length < 1 || config.jobs.length > 100) throw new Error('Config needs 1–100 jobs.');
  const ids = new Set();
  const jobs = config.jobs.map((job, index) => {
    if (!job || typeof job !== 'object') throw new Error(`Job ${index + 1} must be an object.`);
    const id = job.id ?? `job-${index + 1}`;
    if (typeof id !== 'string' || !id.trim() || ids.has(id)) throw new Error('Job IDs must be unique non-empty strings.');
    ids.add(id);
    const name = job.name ?? id;
    if (typeof name !== 'string' || !name.trim() || name.length > 200 || /[|\r\n]/.test(name)) throw new Error(`Job ${index + 1} needs a name of 1–200 characters without pipes or newlines.`);
    parseCron(job.cron);
    const timezone = job.timezone ?? config.timezone ?? 'UTC';
    if (typeof timezone !== 'string') throw new Error('Timezone must be a string.');
    wallClock(timezone);
    return { id, name, cron: job.cron.trim().replace(/\s+/g, ' '), timezone, durationMinutes: bounded(job.durationMinutes ?? 1, `${name}: durationMinutes`, 1, 1440), weight: bounded(job.weight ?? 1, `${name}: weight`, 0.1, 1000, false), delayMinutes: bounded(job.delayMinutes ?? 0, `${name}: delayMinutes`, 0, 1440) };
  });
  return { capacity: bounded(config.capacity ?? 4, 'capacity', 0.1, 100_000, false), jobs };
}

export function parseJobText(text, capacity = 4) {
  const jobs = text.split(/\r?\n/).map((line, i) => ({ line: line.trim(), i })).filter(x => x.line && !x.line.startsWith('#')).map(({ line, i }) => {
    const parts = line.split('|').map(x => x.trim());
    if (parts.length < 3 || parts.length > 6) throw new Error(`Line ${i + 1}: name | cron | duration minutes | timezone | weight | delay minutes`);
    const [name, cron, duration, timezone = 'UTC', weight = '1', delay = '0'] = parts;
    return { name, cron, durationMinutes: Number(duration), timezone, weight: Number(weight), delayMinutes: Number(delay) };
  });
  return normalizeConfig({ capacity, jobs });
}

export function jobText(config) {
  return config.jobs.map(j => `${j.name} | ${j.cron} | ${j.durationMinutes} | ${j.timezone} | ${j.weight} | ${j.delayMinutes}`).join('\n');
}

export function simulate(input, options = {}) {
  const config = normalizeConfig(input);
  const days = bounded(options.days ?? 7, 'days', 1, 31);
  const from = options.from ?? new Date().toISOString();
  if (typeof from !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(from) || !Number.isFinite(Date.parse(from))) throw new Error('from must be an ISO timestamp with Z or an explicit UTC offset.');
  const datePart = from.slice(0, 10), calendarDate = new Date(datePart + 'T00:00:00Z');
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== datePart || Number(from.slice(11, 13)) > 23) throw new Error('from contains an invalid calendar date or hour.');
  const start = Math.ceil(Date.parse(from) / MINUTE) * MINUTE;
  const slots = days * 1440, end = start + slots * MINUTE;
  const loadDelta = new Float64Array(slots + 1), activeDelta = new Int32Array(slots + 1);
  const clocks = new Map(), runs = [], counts = new Map(), warnings = [];
  for (const job of config.jobs) {
    const parsed = parseCron(job.cron);
    if (!clocks.has(job.timezone)) clocks.set(job.timezone, wallClock(job.timezone));
    const clock = clocks.get(job.timezone);
    let count = 0, inFlight = 0;
    // Include work launched before the window that still consumes capacity inside it.
    const lookback = job.durationMinutes + job.delayMinutes;
    for (let timestamp = start - lookback * MINUTE; timestamp < end - job.delayMinutes * MINUTE; timestamp += MINUTE) {
      if (!matchesCron(parsed, clock(timestamp))) continue;
      const runStart = timestamp + job.delayMinutes * MINUTE, runEnd = runStart + job.durationMinutes * MINUTE;
      if (runEnd <= start || runStart >= end) continue;
      if (runs.length >= MAX_RUNS) throw new Error(`More than ${MAX_RUNS.toLocaleString()} intersecting runs. Use a shorter window or fewer jobs.`);
      const left = Math.max(0, (runStart - start) / MINUTE), right = Math.min(slots, (runEnd - start) / MINUTE);
      loadDelta[left] += job.weight; loadDelta[right] -= job.weight;
      activeDelta[left]++; activeDelta[right]--;
      runs.push({ jobId: job.id, scheduledAt: timestamp, start: runStart, end: runEnd, weight: job.weight, carriedIn: runStart < start });
      if (runStart >= start) count++; else inFlight++;
    }
    counts.set(job.id, { count, inFlight });
    if (!count) warnings.push({ jobId: job.id, code: 'no-starts', message: `${job.name}: no starts in this ${days}-day window. This does not prove the schedule is impossible.` });
    if (!parsed.fields[2].wildcard && !parsed.fields[4].wildcard) warnings.push({ jobId: job.id, code: 'day-or', message: `${job.name}: day-of-month and weekday are joined with OR.` });
    if (job.timezone !== 'UTC' && job.timezone !== 'Etc/UTC') warnings.push({ jobId: job.id, code: 'wall-clock', message: `${job.name}: modeled in ${job.timezone}; DST gaps skip starts and repeated wall minutes match twice. Check your scheduler's policy.` });
  }
  runs.sort((a, b) => a.start - b.start || a.jobId.localeCompare(b.jobId));
  const load = new Float64Array(slots), active = new Int32Array(slots), overloads = [];
  let currentLoad = 0, currentActive = 0, peakLoad = 0, peakActive = 0, peakAt = start, overloadMinutes = 0, busyMinutes = 0, area = 0, interval;
  for (let i = 0; i < slots; i++) {
    currentLoad += loadDelta[i]; currentActive += activeDelta[i];
    currentLoad = Math.abs(currentLoad) < 1e-8 ? 0 : currentLoad;
    load[i] = currentLoad; active[i] = currentActive; area += currentLoad;
    if (currentLoad > peakLoad + 1e-8) { peakLoad = currentLoad; peakAt = start + i * MINUTE; }
    peakActive = Math.max(peakActive, currentActive);
    if (currentActive > 0) busyMinutes++;
    if (currentLoad > config.capacity + 1e-8) {
      overloadMinutes++;
      if (!interval) interval = { start: start + i * MINUTE, end: 0, peak: currentLoad };
      interval.peak = Math.max(interval.peak, currentLoad);
    } else if (interval) { interval.end = start + i * MINUTE; overloads.push(interval); interval = undefined; }
  }
  if (interval) { interval.end = end; overloads.push(interval); }
  return { version: 1, config, window: { from: new Date(start).toISOString(), to: new Date(end).toISOString(), days, minutes: slots }, summary: { starts: runs.filter(r => !r.carriedIn).length, carriedIn: runs.filter(r => r.carriedIn).length, peakLoad, peakActive, peakAt: new Date(peakAt).toISOString(), overloadMinutes, busyMinutes, averageLoad: area / slots }, jobs: config.jobs.map(j => ({ ...j, ...counts.get(j.id) })), warnings, overloads, runs, load, active };
}

export function serializableReport(result) {
  const { load, active, ...report } = result;
  return { ...report, overloads: result.overloads.map(x => ({ ...x, start: new Date(x.start).toISOString(), end: new Date(x.end).toISOString() })), runs: result.runs.map(r => ({ ...r, scheduledAt: new Date(r.scheduledAt).toISOString(), start: new Date(r.start).toISOString(), end: new Date(r.end).toISOString() })) };
}

export const DEMO_CONFIG = {
  capacity: 4,
  jobs: [
    { id: 'backup', name: 'Database backup', cron: '0 2 * * *', timezone: 'UTC', durationMinutes: 45, weight: 2, delayMinutes: 0 },
    { id: 'analytics', name: 'Analytics rollup', cron: '0 2 * * *', timezone: 'UTC', durationMinutes: 35, weight: 2, delayMinutes: 0 },
    { id: 'search', name: 'Search reindex', cron: '0 2 * * *', timezone: 'UTC', durationMinutes: 25, weight: 2, delayMinutes: 0 },
    { id: 'sync', name: 'Inventory sync', cron: '*/30 * * * *', timezone: 'UTC', durationMinutes: 8, weight: 1, delayMinutes: 0 },
    { id: 'digest', name: 'Morning digest', cron: '0 9 * * MON-FRI', timezone: 'Asia/Shanghai', durationMinutes: 12, weight: 1, delayMinutes: 0 }
  ]
};
