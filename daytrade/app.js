/**
 * Journal UI: storage, rendering, the equity curve.
 * All arithmetic lives in stats.js (window.DTStats) so it can be tested in node.
 */
(function () {
  'use strict';

  const S = window.DTStats;
  const KEY_TRADES = 'dt_trades_v1';
  const KEY_SETTINGS = 'dt_settings_v1';

  const DEFAULT_RULES = [
    'Стоп визначений ще до входу',
    'Потенціал щонайменше вдвічі більший за ризик (R:R ≥ 2)',
    'Це мій сетап, а не «щось поїхало — заскочу»',
    'Не відіграю попередній збиток',
    'Денний ліміт ще не вичерпано',
  ];

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const todayStr = () => new Date().toISOString().slice(0, 10);
  const money = (v) => (Number.isFinite(v) ? `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2)}` : '—');
  const signClass = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : 'muted');

  // ─── State ────────────────────────────────────────────────────────

  let trades = [];
  let settings = { account: 1000, riskPct: 1, maxTrades: 3, maxLossR: 2, rules: DEFAULT_RULES.slice() };

  function load() {
    try {
      const raw = localStorage.getItem(KEY_TRADES);
      if (raw) trades = JSON.parse(raw) || [];
    } catch (_) { trades = []; }
    try {
      const raw = localStorage.getItem(KEY_SETTINGS);
      if (raw) settings = { ...settings, ...(JSON.parse(raw) || {}) };
    } catch (_) {}
    if (!Array.isArray(settings.rules) || !settings.rules.length) settings.rules = DEFAULT_RULES.slice();
  }

  function save() {
    try {
      localStorage.setItem(KEY_TRADES, JSON.stringify(trades));
      localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings));
    } catch (e) {
      // Private mode, or the quota is full — say so instead of losing data quietly.
      alert('Не вдалося зберегти дані у браузері. Збережи їх у файл кнопкою «Зберегти у файл».');
    }
  }

  // ─── Position size ────────────────────────────────────────────────

  function renderPositionSize() {
    const input = {
      account: $('ps-account').value,
      riskPct: $('ps-risk').value,
      entry: $('ps-entry').value,
      stop: $('ps-stop').value,
      target: $('ps-target').value,
    };
    settings.account = Number(input.account) || settings.account;
    settings.riskPct = Number(input.riskPct) || settings.riskPct;

    const res = S.positionSize(input);
    const out = $('ps-out');
    const warn = $('ps-warn');

    if (!res) {
      out.innerHTML = `<div class="tile" style="grid-column:1/-1"><div class="label">Розмір позиції</div>
        <div class="value muted">—</div><div class="sub">Заповни депозит, вхід і стоп. Стоп не може дорівнювати входу.</div></div>`;
      warn.hidden = true;
      return null;
    }

    const rr = res.rr;
    out.innerHTML = `
      <div class="tile"><div class="label">Купувати</div><div class="value">${res.shares.toLocaleString('uk-UA')}</div>
        <div class="sub">${res.side === 'short' ? 'у шорт' : 'акцій'} · ${money(res.positionValue)}</div></div>
      <div class="tile"><div class="label">Ризик, якщо стоп</div><div class="value neg">−${money(res.riskMoney).replace('$', '$')}</div>
        <div class="sub">${money(res.perShare)} на акцію</div></div>
      <div class="tile"><div class="label">R:R до цілі</div><div class="value ${rr == null ? 'muted' : rr >= 2 ? 'pos' : ''}">${rr == null ? '—' : rr.toFixed(2)}</div>
        <div class="sub">${rr == null ? 'вкажи ціль' : `прибуток ≈ ${money(res.targetMoney)}`}</div></div>
      <div class="tile"><div class="label">Частка депозиту</div><div class="value">${((res.positionValue / (Number(input.account) || 1)) * 100).toFixed(0)}%</div>
        <div class="sub">ризик ${(Number(input.riskPct) || 0).toFixed(2)}% рахунку</div></div>`;

    const problems = [];
    if (Number(input.riskPct) > 2) problems.push('Ризик понад 2% на угоду — серія з 5 збитків забере понад десяту частину депозиту.');
    if (res.needsMargin) problems.push('Позиція більша за депозит — потрібне кредитне плече, а воно множить і збиток.');
    if (rr != null && rr < 1.5) problems.push(`R:R лише ${rr.toFixed(2)} — щоб виходити в плюс, доведеться вгадувати понад ${Math.round(100 / (1 + rr))}% разів.`);
    if (res.shares === 0) problems.push('Виходить 0 акцій: стоп задалеко для такого депозиту й ризику.');

    if (problems.length) {
      warn.hidden = false;
      $('ps-warn-title').textContent = problems.length === 1 ? 'Зверни увагу' : `Зверни увагу (${problems.length})`;
      $('ps-warn-text').textContent = problems.join(' ');
    } else {
      warn.hidden = true;
    }
    return res;
  }

  // ─── Checklist ────────────────────────────────────────────────────

  function renderChecklist() {
    $('checklist').innerHTML = settings.rules.map((rule, i) => `
      <label class="check"><input type="checkbox" data-rule="${i}"/><span>${esc(rule)}</span></label>`).join('');
    $('rules-text').value = settings.rules.join('\n');
  }

  function checklistState() {
    const boxes = [...document.querySelectorAll('#checklist input[type=checkbox]')];
    return { total: boxes.length, ticked: boxes.filter((b) => b.checked).length };
  }

  // ─── Day limits ───────────────────────────────────────────────────

  function renderDay() {
    const st = S.dayStatus(trades, todayStr(), { maxTrades: settings.maxTrades, maxLossR: settings.maxLossR });
    const banner = $('day-banner');
    const parts = [`Сьогодні: ${st.trades} ${plural(st.trades, 'угода', 'угоди', 'угод')}`];
    if (st.closed) parts.push(`результат ${S.fmtR(st.r)}`);
    if (st.maxTrades) parts.push(`ліміт ${st.maxTrades}`);
    if (st.maxLossR) parts.push(`стоп-денний ${S.fmtR(-Math.abs(st.maxLossR))}`);

    if (st.shouldStop) {
      banner.className = 'banner critical';
      $('day-glyph').textContent = '✕';
      $('day-title').textContent = 'На сьогодні досить';
      $('day-detail').textContent = `${st.reason} Наступна угода — завтра. Саме після таких днів втрачають найбільше.`;
    } else if (st.trades === 0) {
      banner.className = 'banner neutral';
      $('day-glyph').textContent = '•';
      $('day-title').textContent = 'Сьогодні угод ще не було';
      $('day-detail').textContent = `Ліміти: ${st.maxTrades || '—'} угод, стоп-денний ${st.maxLossR ? S.fmtR(-Math.abs(st.maxLossR)) : '—'}.`;
    } else {
      banner.className = st.r < 0 ? 'banner warning' : 'banner good';
      $('day-glyph').textContent = st.r < 0 ? '!' : '✓';
      $('day-title').textContent = parts[0] + (st.closed ? ` · ${S.fmtR(st.r)}` : '');
      $('day-detail').textContent = parts.slice(1).join(' · ');
    }
    return st;
  }

  function plural(n, one, few, many) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  // ─── Statistics ───────────────────────────────────────────────────

  function renderStats() {
    const sum = S.summarise(trades);
    const v = S.verdict(sum);

    $('verdict').className = `banner ${v.tone === 'good' ? 'good' : v.tone === 'critical' ? 'critical' : 'neutral'}`;
    $('v-glyph').textContent = v.tone === 'good' ? '✓' : v.tone === 'critical' ? '✕' : '•';
    $('v-title').textContent = v.headline;
    $('v-detail').textContent = v.detail;

    const pf = sum.profitFactor;
    $('stat-tiles').innerHTML = `
      <div class="tile"><div class="label">Закритих угод</div><div class="value">${sum.count}</div>
        <div class="sub">${sum.openCount ? `${sum.openCount} відкритих` : 'усі закриті'}${sum.unscorable ? ` · ${sum.unscorable} без стопу` : ''}</div></div>
      <div class="tile"><div class="label">Виграшних</div><div class="value">${sum.count ? Math.round(sum.winRate * 100) : 0}%</div>
        <div class="sub">${sum.wins} у плюс · ${sum.losses} у мінус</div></div>
      <div class="tile"><div class="label">Експектансі</div><div class="value ${signClass(sum.expectancy)}">${sum.count ? S.fmtR(sum.expectancy) : '—'}</div>
        <div class="sub">середнє за угоду</div></div>
      <div class="tile"><div class="label">Разом</div><div class="value ${signClass(sum.totalR)}">${sum.count ? S.fmtR(sum.totalR) : '—'}</div>
        <div class="sub">${money(sum.totalMoney)}</div></div>
      <div class="tile"><div class="label">Профіт-фактор</div><div class="value">${sum.count ? (Number.isFinite(pf) ? pf.toFixed(2) : '∞') : '—'}</div>
        <div class="sub">виграно / програно</div></div>
      <div class="tile"><div class="label">Середній плюс</div><div class="value pos">${sum.wins ? S.fmtR(sum.avgWin) : '—'}</div>
        <div class="sub">середній мінус ${sum.losses ? S.fmtR(sum.avgLoss) : '—'}</div></div>
      <div class="tile"><div class="label">Макс. просадка</div><div class="value ${sum.maxDrawdownR < 0 ? 'neg' : ''}">${sum.count ? S.fmtR(sum.maxDrawdownR) : '—'}</div>
        <div class="sub">найдовша серія мінусів: ${sum.longestLossStreak}</div></div>
      <div class="tile"><div class="label">Найкраща / найгірша</div><div class="value" style="font-size:17px">${sum.count ? `${S.fmtR(sum.best)} / ${S.fmtR(sum.worst)}` : '—'}</div>
        <div class="sub">одна угода</div></div>`;

    renderCurve(sum);
    renderGroups();
  }

  function renderGroups() {
    const rows = (groups) => groups.length
      ? groups.map((g) => `<tr>
          <td>${esc(g.key)}</td>
          <td class="num muted">${g.count}</td>
          <td class="num ${signClass(g.expectancy)}">${S.fmtR(g.expectancy)}</td>
        </tr>`).join('')
      : '<tr><td colspan="3" class="muted" style="padding:14px 10px">Немає даних</td></tr>';

    $('by-setup').innerHTML = rows(S.groupBy(trades.filter(S.isClosed), (t) => t.setup || 'без сетапу'));
    $('by-rules').innerHTML = rows(S.groupBy(trades.filter(S.isClosed), (t) =>
      t.rulesTicked == null ? null : t.rulesTicked >= (t.rulesTotal || 0) ? 'За всіма правилами' : 'Правила порушені'));
  }

  // ─── Equity curve ─────────────────────────────────────────────────
  // One series, so no legend: the heading names it. Only the endpoint is
  // labelled — a number on every point is unreadable.

  function renderCurve(sum) {
    const wrap = $('curve-wrap');
    if (sum.count < 2) { wrap.hidden = true; return; }
    wrap.hidden = false;

    const svg = $('curve');
    // Draw in a coordinate system that matches the rendered width, so the
    // viewBox never stretches: 11px text stays 11px and the line stays 2px.
    // A phone gets a proportionally taller box, or the curve is a flat smear.
    const avail = Math.round(wrap.clientWidth || svg.clientWidth || 720);
    const W = Math.max(320, Math.min(avail, 900));
    const H = Math.round(Math.max(190, Math.min(300, W * (W < 560 ? 0.62 : 0.32))));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const padL = 40, padR = 62, padT = 16, padB = 24;
    const pts = [0, ...sum.curve]; // start the curve at zero
    const min = Math.min(0, ...pts);
    const max = Math.max(0, ...pts);
    const span = max - min || 1;
    const x = (i) => padL + (i / (pts.length - 1)) * (W - padL - padR);
    const y = (v) => padT + (1 - (v - min) / span) * (H - padT - padB);

    const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const area = `${line}L${x(pts.length - 1).toFixed(1)},${y(min).toFixed(1)}L${x(0).toFixed(1)},${y(min).toFixed(1)}Z`;
    const last = pts[pts.length - 1];
    const zeroY = y(0);

    // Ticks at clean values, plus the zero line that says win from lose.
    const step = niceStep(span / 4);
    const ticks = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(v);

    svg.innerHTML = `
      <g>
        ${ticks.map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"
            stroke="#273246" stroke-width="1"/>
          <text x="${padL - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#7f92aa"
            font-family="ui-monospace,monospace">${v > 0 ? '+' : ''}${Number(v.toFixed(2))}</text>`).join('')}
        <line x1="${padL}" x2="${W - padR}" y1="${zeroY.toFixed(1)}" y2="${zeroY.toFixed(1)}" stroke="#3b4a63" stroke-width="1"/>
      </g>
      <path d="${area}" fill="#3987e5" opacity=".10"/>
      <path d="${line}" fill="none" stroke="#3987e5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(last).toFixed(1)}" r="4.5" fill="#3987e5" stroke="#141a24" stroke-width="2"/>
      <text x="${(x(pts.length - 1) + 10).toFixed(1)}" y="${(y(last) + 4).toFixed(1)}" font-size="12.5" font-weight="600"
        fill="${last > 0 ? '#4ade4a' : last < 0 ? '#ff7a7a' : '#9fb0c6'}" font-family="ui-monospace,monospace">${S.fmtR(last)}</text>
      <g id="curve-hit"></g>`;

    // Hover: a crosshair and a tooltip, the default for a line chart.
    const hit = svg.querySelector('#curve-hit');
    hit.innerHTML = pts.map((v, i) =>
      `<rect x="${(x(i) - (W / pts.length) / 2).toFixed(1)}" y="${padT}" width="${(W / pts.length).toFixed(1)}"
        height="${H - padT - padB}" fill="transparent" data-i="${i}" data-v="${v}"/>`).join('');

    let tip = document.querySelector('.tooltip');
    if (!tip) { tip = document.createElement('div'); tip.className = 'tooltip'; tip.hidden = true; document.body.appendChild(tip); }

    const show = (e) => {
      const i = Number(e.target.dataset.i);
      if (!Number.isFinite(i)) return;
      const v = Number(e.target.dataset.v);
      const r = i === 0 ? null : sum.rs[i - 1];
      tip.innerHTML = i === 0
        ? 'Старт · 0R'
        : `Угода ${i} · <b>${S.fmtR(r)}</b><br><span style="color:#9fb0c6">разом ${S.fmtR(v)}</span>`;
      tip.hidden = false;
      const box = svg.getBoundingClientRect();
      tip.style.left = `${box.left + window.scrollX + (x(i) / W) * box.width + 10}px`;
      tip.style.top = `${box.top + window.scrollY + (y(v) / H) * box.height - 12}px`;
    };
    hit.addEventListener('mouseover', show);
    hit.addEventListener('mousemove', show);
    hit.addEventListener('mouseleave', () => { tip.hidden = true; });

    $('curve-desc').textContent =
      `${sum.count} угод, підсумок ${S.fmtR(sum.totalR)}. Найглибша просадка ${S.fmtR(sum.maxDrawdownR)}.`;
    svg.setAttribute('aria-label', $('curve-desc').textContent);
  }

  function niceStep(raw) {
    const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-6))));
    const n = raw / pow;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
  }

  // ─── Journal ──────────────────────────────────────────────────────

  function renderJournal() {
    const body = $('journal');
    const empty = $('journal-empty');
    $('journal-count').textContent = `${trades.length} ${plural(trades.length, 'угода', 'угоди', 'угод')}`;

    if (!trades.length) { body.innerHTML = ''; empty.hidden = false; return; }
    empty.hidden = true;

    const sorted = [...trades].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
    body.innerHTML = sorted.map((t) => {
      const r = S.rMultiple(t);
      const m = S.pnlMoney(t);
      const open = !S.isClosed(t);
      return `<tr data-id="${esc(t.id)}">
        <td class="muted">${esc(String(t.date).slice(5))}</td>
        <td><b>${esc(t.ticker)}</b><br><span class="muted" style="font-size:11px">${t.side === 'short' ? 'short' : 'long'} · ${t.qty}${t.setup ? ` · ${esc(t.setup)}` : ''}${open ? ' · <span class="warn-open">відкрита</span>' : ''}</span></td>
        <td class="muted opt">${esc(t.setup || '—')}${t.rulesTicked != null && t.rulesTotal ? `<br><span style="font-size:11px" class="${t.rulesTicked >= t.rulesTotal ? 'pos' : 'neg'}">правила ${t.rulesTicked}/${t.rulesTotal}</span>` : ''}</td>
        <td class="num opt">${Number(t.entry).toFixed(2)}</td>
        <td class="num opt">${Number(t.stop).toFixed(2)}</td>
        <td class="num opt">${open ? '<span class="muted">відкрита</span>' : Number(t.exit).toFixed(2)}</td>
        <td class="num ${open ? 'muted' : signClass(m)}">${open ? '—' : money(m)}</td>
        <td class="num ${open ? 'muted' : signClass(r)}"><b>${open || r == null ? '—' : S.fmtR(r)}</b></td>
        <td class="num"><button type="button" class="btn ghost small" data-edit="${esc(t.id)}">✎</button></td>
      </tr>`;
    }).join('');
  }

  // ─── Form ─────────────────────────────────────────────────────────

  function resetForm() {
    $('t-id').value = '';
    $('t-date').value = todayStr();
    ['t-ticker', 't-entry', 't-stop', 't-qty', 't-exit', 't-notes'].forEach((id) => { $(id).value = ''; });
    $('t-fees').value = '0';
    $('t-submit').textContent = 'Записати угоду';
    $('t-cancel').hidden = true;
    document.querySelectorAll('#checklist input').forEach((b) => { b.checked = false; });
  }

  function fillForm(t) {
    $('t-id').value = t.id;
    $('t-date').value = t.date;
    $('t-ticker').value = t.ticker;
    $('t-side').value = t.side;
    $('t-entry').value = t.entry;
    $('t-stop').value = t.stop;
    $('t-qty').value = t.qty;
    $('t-exit').value = t.exit ?? '';
    $('t-fees').value = t.fees ?? 0;
    $('t-setup').value = t.setup ?? '';
    $('t-notes').value = t.notes ?? '';
    $('t-submit').textContent = 'Зберегти зміни';
    $('t-cancel').hidden = false;
    $('trade-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function submitTrade(e) {
    e.preventDefault();
    const id = $('t-id').value;
    const check = checklistState();
    const trade = {
      id: id || `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      date: $('t-date').value || todayStr(),
      ticker: ($('t-ticker').value || '').toUpperCase().trim(),
      side: $('t-side').value,
      entry: Number($('t-entry').value),
      stop: Number($('t-stop').value),
      qty: Number($('t-qty').value),
      exit: $('t-exit').value === '' ? '' : Number($('t-exit').value),
      fees: Number($('t-fees').value) || 0,
      setup: ($('t-setup').value || '').trim(),
      notes: $('t-notes').value || '',
    };
    if (id) {
      const prev = trades.find((t) => t.id === id);
      // Keep the checklist as it was recorded at entry unless it was re-ticked
      trade.rulesTicked = check.ticked || prev?.rulesTicked || 0;
      trade.rulesTotal = check.ticked ? check.total : prev?.rulesTotal ?? check.total;
      trades = trades.map((t) => (t.id === id ? trade : t));
    } else {
      trade.rulesTicked = check.ticked;
      trade.rulesTotal = check.total;
      trades.push(trade);
    }
    save();
    resetForm();
    renderAll();
  }

  // ─── Import / export ──────────────────────────────────────────────

  function exportData() {
    const blob = new Blob([JSON.stringify({ version: 1, exported: new Date().toISOString(), settings, trades }, null, 2)],
      { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `trading-journal-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.trades)) throw new Error('у файлі немає списку угод');
        // Merge rather than replace: importing a backup should never delete
        // trades entered since it was made.
        const byId = new Map(trades.map((t) => [t.id, t]));
        data.trades.forEach((t) => { if (t && t.id) byId.set(t.id, t); });
        trades = [...byId.values()];
        if (data.settings) settings = { ...settings, ...data.settings };
        save();
        loadSettingsIntoForm();
        renderAll();
        alert(`Завантажено. Тепер у журналі ${trades.length} угод.`);
      } catch (err) {
        alert(`Не вдалося прочитати файл: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  // ─── Wiring ───────────────────────────────────────────────────────

  function loadSettingsIntoForm() {
    $('ps-account').value = settings.account;
    $('ps-risk').value = settings.riskPct;
    $('lim-trades').value = settings.maxTrades;
    $('lim-loss').value = settings.maxLossR;
    renderChecklist();
  }

  function renderAll() {
    renderDay();
    renderStats();
    renderJournal();
  }

  function init() {
    load();
    loadSettingsIntoForm();
    resetForm();
    renderPositionSize();
    renderAll();

    ['ps-account', 'ps-risk', 'ps-entry', 'ps-stop', 'ps-target'].forEach((id) =>
      $(id).addEventListener('input', () => { renderPositionSize(); save(); }));

    $('ps-to-trade').addEventListener('click', () => {
      const res = renderPositionSize();
      $('t-entry').value = $('ps-entry').value;
      $('t-stop').value = $('ps-stop').value;
      if (res) { $('t-qty').value = res.shares; $('t-side').value = res.side; }
      $('trade-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    $('trade-form').addEventListener('submit', submitTrade);
    $('t-cancel').addEventListener('click', resetForm);

    $('journal').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-edit]');
      const row = e.target.closest('tr[data-id]');
      const id = btn ? btn.dataset.edit : row?.dataset.id;
      const t = id && trades.find((x) => x.id === id);
      if (t) fillForm(t);
    });

    $('lim-trades').addEventListener('input', () => { settings.maxTrades = Number($('lim-trades').value) || 0; save(); renderDay(); });
    $('lim-loss').addEventListener('input', () => { settings.maxLossR = Number($('lim-loss').value) || 0; save(); renderDay(); });
    $('rules-text').addEventListener('change', () => {
      const rules = $('rules-text').value.split('\n').map((s) => s.trim()).filter(Boolean);
      settings.rules = rules.length ? rules : DEFAULT_RULES.slice();
      save();
      renderChecklist();
    });

    // The curve's geometry depends on the rendered width, so redraw it when
    // that changes — rotating a phone otherwise leaves a stale chart.
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => renderCurve(S.summarise(trades)), 150);
    });

    $('export').addEventListener('click', exportData);
    $('import-btn').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', (e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });
    $('wipe').addEventListener('click', () => {
      if (!confirm(`Стерти всі ${trades.length} угод? Це не можна скасувати — спершу збережи їх у файл.`)) return;
      trades = [];
      save();
      renderAll();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
