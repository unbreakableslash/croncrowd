(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const colors = ['#a3e6c1', '#899fe8', '#f59883', '#d7bbef', '#eed49c', '#7ccde0'];
  let language = 'en', result, preview, selectedDay = 0, comparingId;
  const translations = {
    en: { peak: 'Peak resource load', overloaded: 'Overloaded minutes', starts: 'Scheduled starts', units: 'capacity units', inFlight: 'already in progress at the start', across: 'across the entire window', peakAt: 'Peak at', timeline: 'Runs & resource load', totalLoad: 'Resource load', before: 'Before', after: 'After', saved: 'fewer overloaded minutes', more: 'more overloaded minutes', unchanged: 'No change in overloaded minutes', notes: 'No additional schedule notes.', loading: 'Calculating…' },
    zh: { eyebrow: '定时任务容量实验室', title: '提前看见，<br>最拥挤的一分钟。', lead: '为 cron 任务加上运行时长，查看重叠、衡量资源容量，并试试错峰启动。', stamp: '看见负载。<br>移开高峰。', inputLabel: '01 / 输入', studio: '任务工作台', demo: '载入演示', format: '每行一个任务：名称 | cron | 时长（分钟） | 时区 | 资源权重 | 延迟（分钟）', editorLabel: '任务定义', capacity: '资源容量', window: '模拟窗口', from: '开始时间（UTC）', analyze: '分析任务 →', model: '规划模型：固定时长、不限并行启动、不排队。所有图表使用 UTC。不会执行任何任务。', exportConfig: '导出 JSON', exportHtml: '保存离线报告', import: '导入 JSON 配置 ↗', loadLabel: '02 / 负载地图', loadTitle: '一眼看见负载高峰', heatHint: '每格代表一个小时，颜色表示小时内最高负载。点击某一天查看时间线。', low: '容量以内', high: '超过容量', hourMax: '小时内峰值，并非平均值', timelineLabel: '03 / 运行时间线', whatifLabel: '04 / 如果调整', whatif: '给一个任务留出更多空间', preview: '模拟对比', job: '任务', delay: '启动延迟（分钟）', compare: '对比', delayNote: '延迟会移动每次模拟启动，不会改写 cron 或修改你的调度器。', apply: '将此延迟保留在模型中', assumptions: '模型假设与任务提示', assumptionText: '五字段 cron，日期和星期遵循 Vixie 规则。夏令时跳过的分钟不启动，重复的分钟匹配两次；实际调度器策略可能不同。超载代表模拟资源需求超过容量，并非实测生产事故。包含窗口开始前已启动、仍在运行的任务。', footer: '让定时任务从容运行。零依赖。配置保留在你的设备上。', peak: '资源负载峰值', overloaded: '超载分钟数', starts: '计划启动次数', units: '容量单位', inFlight: '个任务在窗口开始时仍在运行', across: '统计整个模拟窗口', peakAt: '峰值时间', timeline: '任务与资源负载', totalLoad: '资源负载', before: '调整前', after: '调整后', saved: '分钟超载减少', more: '分钟超载增加', unchanged: '超载分钟数没有变化', notes: '没有其他任务提示。', loading: '计算中…' }
  };
  const english = new Map([...document.querySelectorAll('[data-i18n]')].map(el => [el, el.innerHTML]));
  const t = key => translations[language][key] ?? translations.en[key] ?? key;
  const n = number => Number(number.toFixed(2)).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US');
  const iso = timestamp => new Date(timestamp).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  function setConfig(config, options = {}) {
    const normalized = normalizeConfig(config);
    $('editor').value = jobText(normalized);
    $('capacity').value = normalized.capacity;
    $('days').value = String(options.days ?? 7);
    const now = new Date(); now.setUTCHours(0, 0, 0, 0);
    const from = options.from ?? now.toISOString();
    if (!Number.isFinite(Date.parse(from))) throw new Error('Invalid report start timestamp.');
    $('from').value = new Date(from).toISOString().slice(0, 16);
  }

  function options() {
    if (!$('from').value) throw new Error(language === 'zh' ? '请设置开始时间。' : 'Choose a start time.');
    return { days: Number($('days').value), from: new Date($('from').value + 'Z').toISOString() };
  }

  function error(message) { $('error').textContent = message; $('error').hidden = !message; }
  function analyze() {
    try {
      error('');
      const config = parseJobText($('editor').value, Number($('capacity').value));
      result = simulate(config, options());
      selectedDay = Math.min(selectedDay, result.window.days - 1);
      preview = undefined; $('comparison').replaceChildren(); $('apply').hidden = true;
      $('whatif-job').innerHTML = result.jobs.map(j => `<option value="${esc(j.id)}">${esc(j.name)}</option>`).join('');
      syncDelay(); render();
    } catch (e) { error(e.message); }
  }

  function render() {
    if (!result) return;
    const s = result.summary;
    $('stats').innerHTML = `<div class="stat"><div class="stat-label">${t('peak')}</div><div class="stat-value ${s.peakLoad > result.config.capacity ? 'danger' : 'good'}">${n(s.peakLoad)} <small>/ ${n(result.config.capacity)}</small></div><div class="stat-note">${t('peakAt')} ${iso(Date.parse(s.peakAt)).slice(5)}</div></div><div class="stat"><div class="stat-label">${t('overloaded')}</div><div class="stat-value ${s.overloadMinutes ? 'danger' : 'good'}">${n(s.overloadMinutes)}</div><div class="stat-note">${t('across')} · ${result.window.days}d</div></div><div class="stat"><div class="stat-label">${t('starts')}</div><div class="stat-value">${n(s.starts)}</div><div class="stat-note">${n(s.carriedIn)} ${t('inFlight')}</div></div>`;
    const start = Date.parse(result.window.from);
    const minuteOffset = new Date(start).getUTCMinutes();
    const cells = ['<span></span>', ...Array.from({ length: 24 }, (_, h) => `<span class="heat-hour">${new Date(start + h * 60 * MINUTE).toISOString().slice(11, minuteOffset ? 16 : 13)}</span>`)];
    for (let d = 0; d < result.window.days; d++) {
      const date = new Date(start + d * 1440 * MINUTE);
      const label = date.toISOString().slice(5, 10);
      cells.push(`<span class="heat-label">${label}</span>`);
      for (let h = 0; h < 24; h++) {
        const index = d * 1440 + h * 60;
        const peak = Math.max(...result.load.subarray(index, index + 60));
        const over = peak > result.config.capacity + 1e-8;
        const alpha = peak ? Math.min(.85, .18 + peak / Math.max(result.summary.peakLoad, 1) * .67) : .08;
        const rgb = over ? '245,152,131' : '163,230,193';
        const at = iso(start + index * MINUTE);
        cells.push(`<button class="cell ${d === selectedDay ? 'selected' : ''}" style="background:rgba(${rgb},${alpha})" data-day="${d}" aria-label="${at}, peak ${n(peak)} / ${n(result.config.capacity)}" title="${at} · ${t('peak')} ${n(peak)} / ${n(result.config.capacity)}"></button>`);
      }
    }
    $('heatmap').innerHTML = cells.join('');
    $('warnings').replaceChildren();
    if (!result.warnings.length) $('warnings').textContent = t('notes');
    for (const warning of result.warnings) { const p = document.createElement('p'); p.textContent = warning.message; $('warnings').append(p); }
    renderTimeline();
  }

  function renderTimeline() {
    const start = Date.parse(result.window.from) + selectedDay * 1440 * MINUTE, end = start + 1440 * MINUTE;
    $('timeline-title').textContent = t('timeline');
    $('selected-day').textContent = new Date(start).toISOString().slice(0, 10);
    let html = '<div class="time-ruler"><span></span><div class="ticks">' + [0, 6, 12, 18, 24].map(h => `<span>${new Date(start + h * 60 * MINUTE).toISOString().slice(11, 16)}${h === 24 ? ' +1d' : ''}</span>`).join('') + '</div></div>';
    for (let index = 0; index < result.jobs.length; index++) {
      const job = result.jobs[index];
      const bars = result.runs.filter(r => r.jobId === job.id && r.start < end && r.end > start).map(r => {
        const left = (Math.max(start, r.start) - start) / (1440 * MINUTE) * 100;
        const width = (Math.min(end, r.end) - Math.max(start, r.start)) / (1440 * MINUTE) * 100;
        return `<div class="run" style="left:${left}%;width:${width}%;background:${colors[index % colors.length]}" title="${esc(job.name)}: ${iso(r.start)} → ${iso(r.end)} (${job.weight} units)"></div>`;
      }).join('');
      html += `<div class="job-row"><div class="job-name">${esc(job.name)}<small>${job.durationMinutes}m · ${job.weight}u · +${job.delayMinutes}m</small></div><div class="lane">${bars}</div></div>`;
    }
    const maximum = Math.max(result.summary.peakLoad, result.config.capacity) * 1.1;
    const load = result.load.subarray(selectedDay * 1440, (selectedDay + 1) * 1440);
    const histogram = Array.from({ length: 48 }, (_, i) => {
      const peak = Math.max(...load.subarray(i * 30, i * 30 + 30));
      return `<span class="bar" style="height:${Math.max(peak ? 2 : 0, peak / maximum * 48)}px;background:${peak > result.config.capacity + 1e-8 ? '#f59883' : '#a3e6c1'}" title="${iso(start + i * 30 * MINUTE)} · ${n(peak)} units"></span>`;
    }).join('');
    html += `<div class="job-row load-row"><div class="job-name">${t('totalLoad')}<small>${n(result.config.capacity)}u ${t('capacity')}</small></div><div class="bars"><span class="capacity-line" style="bottom:${result.config.capacity / maximum * 48}px"></span>${histogram}</div></div>`;
    $('timeline').innerHTML = html;
  }

  function syncDelay() {
    const job = result?.jobs.find(j => j.id === $('whatif-job').value);
    $('delay').max = String(Math.max(120, job?.delayMinutes ?? 0));
    $('delay').value = String(job?.delayMinutes ?? 0);
    $('delay-value').textContent = $('delay').value + 'm';
    preview = undefined; $('comparison').replaceChildren(); $('apply').hidden = true;
  }

  function compare() {
    if (!result) return;
    try {
      error('');
      comparingId = $('whatif-job').value;
      const config = structuredClone(result.config);
      config.jobs.find(j => j.id === comparingId).delayMinutes = Number($('delay').value);
      preview = simulate(config, { from: result.window.from, days: result.window.days });
      const change = result.summary.overloadMinutes - preview.summary.overloadMinutes;
      $('comparison').innerHTML = `<div class="comparison"><p>${t('peak')}<br><strong>${n(result.summary.peakLoad)} → ${n(preview.summary.peakLoad)}</strong></p><p>${t('overloaded')}<br><strong>${n(result.summary.overloadMinutes)} → ${n(preview.summary.overloadMinutes)}</strong></p><p><br><strong class="${change >= 0 ? 'gain' : 'loss'}">${change ? `${n(Math.abs(change))} ${t(change > 0 ? 'saved' : 'more')}` : t('unchanged')}</strong></p></div>`;
      $('apply').hidden = false;
    } catch (e) { error(e.message); }
  }

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function busy(action) {
    $('analyze').disabled = true; $('analyze').textContent = t('loading');
    setTimeout(() => { try { action(); } finally { $('analyze').disabled = false; $('analyze').innerHTML = language === 'en' ? english.get($('analyze')) : t('analyze'); } }, 0);
  }

  $('analyze').addEventListener('click', () => busy(analyze));
  $('demo').addEventListener('click', () => { setConfig(DEMO_CONFIG); selectedDay = 0; busy(analyze); });
  $('heatmap').addEventListener('click', e => { const day = e.target.closest('[data-day]'); if (day) { selectedDay = Number(day.dataset.day); render(); } });
  $('whatif-job').addEventListener('change', syncDelay);
  $('delay').addEventListener('input', () => { $('delay-value').textContent = $('delay').value + 'm'; preview = undefined; $('apply').hidden = true; $('comparison').replaceChildren(); });
  $('preview-button').addEventListener('click', () => busy(compare));
  $('apply').addEventListener('click', () => { if (preview) { setConfig(preview.config, { from: result.window.from, days: result.window.days }); analyze(); $('whatif-job').value = comparingId; syncDelay(); } });
  $('config-export').addEventListener('click', () => { try { const config = parseJobText($('editor').value, Number($('capacity').value)); download('croncrowd.jobs.json', JSON.stringify(config, null, 2), 'application/json'); } catch (e) { error(e.message); } });
  $('html-export').addEventListener('click', () => {
    try {
      const config = parseJobText($('editor').value, Number($('capacity').value)), opts = options();
      simulate(config, opts);
      const clone = document.documentElement.cloneNode(true);
      for (const [el, value] of english) clone.querySelector(`[data-i18n="${el.dataset.i18n}"]`).innerHTML = value;
      clone.setAttribute('lang', 'en'); clone.querySelector('#lang').textContent = '中文';
      clone.querySelector('#seed').textContent = JSON.stringify({ config, options: opts }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
      download('croncrowd-report.html', '<!doctype html>\n' + clone.outerHTML, 'text/html');
    } catch (e) { error(e.message); }
  });
  $('import').addEventListener('change', async () => {
    const file = $('import').files[0]; if (!file) return;
    try { if (file.size > 1_000_000) throw new Error('Config file exceeds 1 MB.'); setConfig(JSON.parse(await file.text()), options()); busy(analyze); } catch (e) { error(e.message); } finally { $('import').value = ''; }
  });
  $('lang').addEventListener('click', () => {
    language = language === 'en' ? 'zh' : 'en'; document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    for (const [el, value] of english) el.innerHTML = language === 'en' ? value : t(el.dataset.i18n);
    $('lang').textContent = language === 'en' ? '中文' : 'English'; render(); if (preview) compare();
  });
  try { const seed = JSON.parse($('seed').textContent); setConfig(seed.config ?? DEMO_CONFIG, seed.options ?? {}); busy(analyze); } catch (e) { error(e.message); }
})();
