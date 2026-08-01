/**
 * Day Trading Chart Analyzer
 * Uses Finnhub candles + lightweight-charts + local TA engine
 * Depends on window.MITP (from index.html) and window.LightweightCharts
 */
(function () {
  'use strict';

  const STORAGE_SAVED = 'mitp_dt_saved_v1';
  const STORAGE_LAST = 'mitp_dt_last_v1';

  /** @type {string} */
  let selectedTf = '5';
  /** @type {null | object} */
  let lastAnalysis = null;
  /** @type {Array} */
  let lastBars = [];
  let chart = null;
  let candleSeries = null;
  let volumeSeries = null;
  let emaFastSeries = null;
  let emaSlowSeries = null;
  let resizeObs = null;

  const TF_META = {
    '1': { label: '1m', finnhub: '1', lookbackSec: 2 * 86400, maxBars: 400 },
    '5': { label: '5m', finnhub: '5', lookbackSec: 5 * 86400, maxBars: 500 },
    '15': { label: '15m', finnhub: '15', lookbackSec: 12 * 86400, maxBars: 500 },
    '30': { label: '30m', finnhub: '30', lookbackSec: 20 * 86400, maxBars: 500 },
    '60': { label: '1H', finnhub: '60', lookbackSec: 45 * 86400, maxBars: 500 },
    '240': { label: '4H', finnhub: '60', lookbackSec: 90 * 86400, maxBars: 800, aggregate: 4 },
    D: { label: 'Daily', finnhub: 'D', lookbackSec: 400 * 86400, maxBars: 400 },
  };

  // ─── helpers ──────────────────────────────────────────────────────
  function M() {
    return window.MITP || {};
  }
  function apiKey() {
    return M().getApiKey ? M().getApiKey() : '';
  }
  function num(v, fb = 0) {
    return M().num ? M().num(v, fb) : (Number.isFinite(Number(v)) ? Number(v) : fb);
  }
  function clamp(n, a, b) {
    return M().clamp ? M().clamp(n, a, b) : Math.max(a, Math.min(b, n));
  }
  function formatPrice(p) {
    return M().formatPrice ? M().formatPrice(p) : `$${Number(p).toFixed(2)}`;
  }
  function formatPct(p) {
    return M().formatPct ? M().formatPct(p) : `${p}%`;
  }
  function escapeHtml(s) {
    return M().escapeHtml
      ? M().escapeHtml(s)
      : String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  async function fhGet(path, params) {
    if (!M().finnhubGet) throw new Error('MITP bridge not ready');
    if (M().enqueueRest) return M().enqueueRest(() => M().finnhubGet(path, params));
    return M().finnhubGet(path, params);
  }

  function setStatus(msg, cls = 'text-slate-500') {
    const el = document.getElementById('dt-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `text-xs mt-3 ${cls}`;
  }

  // ─── TA math ──────────────────────────────────────────────────────
  function ema(values, period) {
    const out = new Array(values.length).fill(null);
    if (values.length < period) return out;
    const k = 2 / (period + 1);
    let prev = 0;
    for (let i = 0; i < period; i++) prev += values[i];
    prev /= period;
    out[period - 1] = prev;
    for (let i = period; i < values.length; i++) {
      prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
    return out;
  }

  function sma(values, period) {
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= period) sum -= values[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  }

  function rsi(closes, period = 14) {
    const out = new Array(closes.length).fill(null);
    if (closes.length <= period) return out;
    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 1; i <= period; i++) {
      const d = closes[i] - closes[i - 1];
      if (d >= 0) avgGain += d;
      else avgLoss -= d;
    }
    avgGain /= period;
    avgLoss /= period;
    out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    for (let i = period + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      const gain = d > 0 ? d : 0;
      const loss = d < 0 ? -d : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
    return out;
  }

  function macd(closes, fast = 12, slow = 26, signal = 9) {
    const ef = ema(closes, fast);
    const es = ema(closes, slow);
    const line = closes.map((_, i) =>
      ef[i] != null && es[i] != null ? ef[i] - es[i] : null
    );
    const compact = line.map((v) => (v == null ? 0 : v));
    // signal on non-null macd segment
    const first = line.findIndex((v) => v != null);
    const sig = new Array(closes.length).fill(null);
    const hist = new Array(closes.length).fill(null);
    if (first < 0) return { line, signal: sig, hist };
    const slice = line.slice(first);
    const vals = slice.map((v) => (v == null ? 0 : v));
    const sigSlice = ema(vals, signal);
    for (let i = 0; i < sigSlice.length; i++) {
      const idx = first + i;
      sig[idx] = sigSlice[i];
      if (line[idx] != null && sig[idx] != null) hist[idx] = line[idx] - sig[idx];
    }
    return { line, signal: sig, hist };
  }

  function vwapSeries(bars) {
    const out = new Array(bars.length).fill(null);
    let cumPV = 0;
    let cumV = 0;
    let dayKey = null;
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const d = new Date(b.time * 1000);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
      if (dayKey !== key) {
        dayKey = key;
        cumPV = 0;
        cumV = 0;
      }
      const tp = (b.high + b.low + b.close) / 3;
      const vol = Math.max(b.volume || 0, 0);
      cumPV += tp * vol;
      cumV += vol;
      out[i] = cumV > 0 ? cumPV / cumV : tp;
    }
    return out;
  }

  function pivotSupportResistance(bars, lookback = 40) {
    const slice = bars.slice(-lookback);
    if (!slice.length) return { support: 0, resistance: 0 };
    const lows = slice.map((b) => b.low);
    const highs = slice.map((b) => b.high);
    // secondary: recent swing
    const last20 = bars.slice(-20);
    const support = Math.min(...lows);
    const resistance = Math.max(...highs);
    const nearSupport = Math.min(...last20.map((b) => b.low));
    const nearResistance = Math.max(...last20.map((b) => b.high));
    return {
      support,
      resistance,
      nearSupport,
      nearResistance,
    };
  }

  function detectPatterns(bars) {
    const notes = [];
    if (bars.length < 3) return notes;
    const a = bars[bars.length - 3];
    const b = bars[bars.length - 2];
    const c = bars[bars.length - 1];

    const body = (x) => Math.abs(x.close - x.open);
    const range = (x) => x.high - x.low || 1e-9;
    const bull = (x) => x.close > x.open;
    const bear = (x) => x.close < x.open;

    // Doji
    if (body(c) / range(c) < 0.12) notes.push('Doji — indecision near current price');

    // Hammer / shooting star
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);
    if (lowerWick > body(c) * 2 && upperWick < body(c) * 0.5 && bull(c)) {
      notes.push('Hammer-like bullish rejection');
    }
    if (upperWick > body(c) * 2 && lowerWick < body(c) * 0.5 && bear(c)) {
      notes.push('Shooting star-like bearish rejection');
    }

    // Engulfing
    if (bear(b) && bull(c) && c.open <= b.close && c.close >= b.open && body(c) > body(b)) {
      notes.push('Bullish engulfing');
    }
    if (bull(b) && bear(c) && c.open >= b.close && c.close <= b.open && body(c) > body(b)) {
      notes.push('Bearish engulfing');
    }

    // Inside bar
    if (c.high <= b.high && c.low >= b.low) notes.push('Inside bar — compression / breakout setup');

    // Higher highs / lower lows structure
    const last8 = bars.slice(-8);
    const closes = last8.map((x) => x.close);
    const rising = closes.every((v, i, arr) => i === 0 || v >= arr[i - 1] * 0.998);
    const falling = closes.every((v, i, arr) => i === 0 || v <= arr[i - 1] * 1.002);
    if (rising) notes.push('Short-term higher closes (micro uptrend)');
    if (falling) notes.push('Short-term lower closes (micro downtrend)');

    // Volume spike
    const vols = bars.slice(-21, -1).map((x) => x.volume || 0);
    const avgV = vols.length ? vols.reduce((s, v) => s + v, 0) / vols.length : 0;
    if (avgV > 0 && (c.volume || 0) > avgV * 1.8) {
      notes.push(`Volume spike ×${((c.volume || 0) / avgV).toFixed(1)} vs 20-bar avg`);
    }

    // Gap
    if (bars.length >= 2) {
      const gapUp = c.low > b.high;
      const gapDown = c.high < b.low;
      if (gapUp) notes.push('Gap up vs previous bar');
      if (gapDown) notes.push('Gap down vs previous bar');
    }

    if (!notes.length) notes.push('No strong classic candlestick pattern on last bars');
    return notes;
  }

  function analyzeBars(bars, quote, tfLabel) {
    const closes = bars.map((b) => b.close);
    const volumes = bars.map((b) => b.volume || 0);
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2] || last;
    const price = last.close;

    const ema9 = ema(closes, 9);
    const ema21 = ema(closes, 21);
    const rsi14 = rsi(closes, 14);
    const macdObj = macd(closes);
    const vwap = vwapSeries(bars);
    const levels = pivotSupportResistance(bars);
    const patterns = detectPatterns(bars);

    const i = bars.length - 1;
    const e9 = ema9[i];
    const e21 = ema21[i];
    const r = rsi14[i];
    const mLine = macdObj.line[i];
    const mSig = macdObj.signal[i];
    const mHist = macdObj.hist[i];
    const mHistPrev = macdObj.hist[i - 1];
    const vw = vwap[i];
    const avgVol20 = sma(volumes, 20)[i] || 0;
    const volRatio = avgVol20 > 0 ? (last.volume || 0) / avgVol20 : 1;

    const trend =
      e9 != null && e21 != null
        ? e9 > e21 * 1.001
          ? 'Bullish'
          : e9 < e21 * 0.999
            ? 'Bearish'
            : 'Sideways'
        : price >= prev.close
          ? 'Bullish'
          : 'Bearish';

    const aboveVwap = vw != null ? price >= vw : null;
    const emaCross =
      e9 != null && e21 != null && ema9[i - 1] != null && ema21[i - 1] != null
        ? ema9[i - 1] <= ema21[i - 1] && e9 > e21
          ? 'Bullish cross'
          : ema9[i - 1] >= ema21[i - 1] && e9 < e21
            ? 'Bearish cross'
            : 'No fresh cross'
        : 'n/a';

    const macdCross =
      mHist != null && mHistPrev != null
        ? mHistPrev <= 0 && mHist > 0
          ? 'MACD hist flip +'
          : mHistPrev >= 0 && mHist < 0
            ? 'MACD hist flip −'
            : 'MACD steady'
        : 'n/a';

    // Strategy scores 0–100 + rich explanations
    const strategies = [];
    const drivers = { scalp: [], mom: [], brk: [], rev: [], gap: [] };

    // Scalping
    let scalp = 50;
    if (r != null) {
      if (r > 45 && r < 65) { scalp += 10; drivers.scalp.push(`RSI ${r.toFixed(0)} у «робочій» зоні 45–65 — менше перекупленості`); }
      if (r > 70 || r < 30) { scalp -= 15; drivers.scalp.push(`RSI ${r.toFixed(0)} екстремальний — scalping ризикованіший (відкати)`); }
    }
    if (volRatio > 1.2) { scalp += 8; drivers.scalp.push(`Обʼєм ${volRatio.toFixed(2)}× середнього — є ліквідність для швидких угод`); }
    if (trend === 'Sideways') { scalp += 5; drivers.scalp.push('Боковик — класичне середовище для scalping від рівня до рівня'); }
    if (Math.abs((last.high - last.low) / price) < 0.008) { scalp += 5; drivers.scalp.push('Вузький останній бар — менше шуму на вході'); }
    scalp = clamp(scalp, 5, 95);
    strategies.push({
      id: 'scalp',
      name: 'Scalping',
      score: Math.round(scalp),
      bias: scalp >= 58 ? 'Long bias' : scalp <= 42 ? 'Short / skip' : 'Neutral',
      note: 'Швидкі входи біля VWAP/EMA9, малий target.',
      what: 'Scalping — багато дуже коротких угод (секунди–хвилини) з маленьким take-profit. Мета — зняти спред/мікро-рух, а не «вгадати день».',
      when: 'Коли ринок у діапазоні, є ліквідність, RSI не в екстремумі, ціна осцилює навколо VWAP/EMA9.',
      how: 'Вхід від мікро-support/VWAP, стоп за останній wick, TP = 0.3–0.8×ATR, не тримати при імпульсі проти позиції.',
      avoid: 'Сильний тренд «в один бік», новини, низький обʼєм, широкий спред, RSI >70 або <30.',
      drivers: drivers.scalp.length ? drivers.scalp : ['Нейтральні умови — немає яскравого edge для scalping'],
      fit: scalp >= 65 ? 'Зараз setup відносно зручний для мікро-угод' : scalp >= 50 ? 'Можна лише дуже вибірково' : 'Краще не скальпувати цей момент',
    });

    // Momentum
    let mom = 50;
    if (trend === 'Bullish') { mom += 15; drivers.mom.push('Тренд Bullish — momentum long узгоджується з напрямком'); }
    if (trend === 'Bearish') { mom -= 15; drivers.mom.push('Тренд Bearish — long-momentum слабший (краще short-momentum або wait)'); }
    if (e9 != null && price > e9) { mom += 8; drivers.mom.push('Ціна вище EMA9 — короткостроковий імпульс up'); }
    if (r != null && r > 55 && r < 75) { mom += 10; drivers.mom.push(`RSI ${r.toFixed(0)} у зоні сили (55–75) без крайнього overbought`); }
    if (r != null && r > 80) { mom -= 8; drivers.mom.push(`RSI ${r.toFixed(0)} >80 — імпульс «перегрітий», ризик exhaust`); }
    if (mHist != null && mHist > 0) { mom += 8; drivers.mom.push('MACD histogram > 0 — бичачий momentum'); }
    if (volRatio > 1.3) { mom += 7; drivers.mom.push('Підвищений volume підтверджує рух'); }
    if (aboveVwap) { mom += 5; drivers.mom.push('Ціна вище VWAP — інституційний bias часто long intraday'); }
    mom = clamp(mom, 5, 95);
    strategies.push({
      id: 'mom',
      name: 'Momentum',
      score: Math.round(mom),
      bias: mom >= 60 ? 'Ride long' : mom <= 40 ? 'Ride short' : 'Wait',
      note: 'Тренд + RSI + volume confirmation.',
      what: 'Momentum — торгівля в напрямку сильного руху: «не ловимо ніж, а їдемо з хвилею», поки імпульс живий.',
      when: 'Чіткий тренд (EMA9>EMA21), RSI 55–75, MACD hist >0, volume на продовженні, price > VWAP.',
      how: 'Вхід на pullback до EMA9/VWAP у тренді, SL за swing, TP1 = 1×ATR, TP2 = 1.5–2×ATR або trail stop.',
      avoid: 'Дивергенції, climax volume на вершині, RSI >80 без consolidation, торгівля проти тренду «на відскік».',
      drivers: drivers.mom.length ? drivers.mom : ['Немає яскравого momentum-сигналу'],
      fit: mom >= 65 ? 'Імпульс підтримує directional trade' : mom >= 50 ? 'Слабкий/змішаний momentum' : 'Momentum проти або відсутній',
    });

    // Breakout
    let brk = 50;
    const nearRes = levels.nearResistance > 0 && price >= levels.nearResistance * 0.995;
    const nearSup = levels.nearSupport > 0 && price <= levels.nearSupport * 1.005;
    if (nearRes && volRatio > 1.4 && trend !== 'Bearish') {
      brk += 20;
      drivers.brk.push(`Біля resistance ${formatPrice(levels.nearResistance)} + volume spike — watch long breakout`);
    }
    if (nearSup && volRatio > 1.4 && trend !== 'Bullish') {
      brk += 12;
      drivers.brk.push(`Біля support ${formatPrice(levels.nearSupport)} + volume — watch breakdown`);
    }
    if (patterns.some((p) => /Inside bar|compression/i.test(p))) {
      brk += 10;
      drivers.brk.push('Compression / inside bar — енергія для пробою');
    }
    if (volRatio < 0.8) {
      brk -= 10;
      drivers.brk.push('Слабкий volume — пробої часто false break');
    }
    if (!nearRes && !nearSup) drivers.brk.push('Ціна не біля краю range — breakout setup ще не «на рівні»');
    brk = clamp(brk, 5, 95);
    strategies.push({
      id: 'brk',
      name: 'Breakout',
      score: Math.round(brk),
      bias: nearRes && brk >= 60 ? 'Long breakout watch' : nearSup && brk >= 55 ? 'Breakdown watch' : 'No clear break',
      note: 'Прорив range + volume spike.',
      what: 'Breakout — вхід, коли ціна виходить із діапазону (або рівня) з обʼємом. Ідея: новий тренд після стиснення.',
      when: 'Ціна біля high/low range, volume зростає на пробої, бажано retest рівня як новий support/resistance.',
      how: 'Buy stop вище resistance (або sell stop нижче support), SL назад у range, TP = висота range / 1–2×ATR.',
      avoid: 'Пробив на низькому volume, «fakeout» у новинах, chase далеко від рівня без retest.',
      drivers: drivers.brk,
      fit: brk >= 65 ? 'Є умови для breakout-сценарію' : brk >= 50 ? 'Рівні є, але підтвердження слабке' : 'Немає якісного breakout setup',
    });

    // Reversal
    let rev = 50;
    if (r != null && r < 30 && patterns.some((p) => /Hammer|Bullish engulfing/i.test(p))) {
      rev += 18;
      drivers.rev.push('Перепроданість RSI + bullish candle rejection');
    }
    if (r != null && r > 70 && patterns.some((p) => /Shooting|Bearish engulfing/i.test(p))) {
      rev += 18;
      drivers.rev.push('Перекупленість RSI + bearish rejection candle');
    }
    if (macdCross.includes('+') && r != null && r < 45) {
      rev += 10;
      drivers.rev.push('MACD hist flip + при невисокому RSI — можливий розворот up');
    }
    if (macdCross.includes('−') && r != null && r > 55) {
      rev += 10;
      drivers.rev.push('MACD hist flip − при високому RSI — можливий розворот down');
    }
    if (trend === 'Sideways') {
      rev += 5;
      drivers.rev.push('Боковик — mean-reversion/reversal від меж range частіші');
    }
    if (!drivers.rev.length) drivers.rev.push('Немає збігу «екстремум RSI + pattern + MACD»');
    rev = clamp(rev, 5, 95);
    strategies.push({
      id: 'rev',
      name: 'Reversal',
      score: Math.round(rev),
      bias: rev >= 62 ? 'Counter-trend setup' : 'Low confidence reverse',
      note: 'RSI extremes + candle rejection + MACD flip.',
      what: 'Reversal — ставка на розворот короткострокового руху (від overbought/oversold), а не на продовження тренду.',
      when: 'RSI <30 або >70, rejection candle (hammer/shooting/engulfing), підтвердження MACD, рівень S/R.',
      how: 'Вхід після підтверджуючої свічки, SL за wick екстремуму, TP1 = mid-range / VWAP, TP2 = протилежний рівень.',
      avoid: 'Розворот проти сильного тренду без рівня, «ловити ніж» на news dump, відсутність volume confirmation.',
      drivers: drivers.rev,
      fit: rev >= 65 ? 'Є hints на counter-trend setup' : 'Розворот низької якості / рано',
    });

    // Gap and Go
    let gap = 40;
    const gapNote = patterns.find((p) => /Gap/i.test(p));
    if (gapNote) {
      gap += 25;
      drivers.gap.push(gapNote);
      if (volRatio > 1.2) { gap += 10; drivers.gap.push('Gap + volume — сильніше continuation («gap and go»)'); }
      if (trend === 'Bullish' && /up/i.test(gapNote)) { gap += 12; drivers.gap.push('Gap up у бичачому контексті'); }
      if (trend === 'Bearish' && /down/i.test(gapNote)) { gap += 12; drivers.gap.push('Gap down у ведмежому контексті'); }
    } else {
      drivers.gap.push('На останніх барах gap не виявлено (типово для mid-session TF)');
    }
    if (tfLabel === 'Daily') { gap -= 10; drivers.gap.push('Daily TF — gap-and-go більше про premarket/open (краще 1–15m)'); }
    gap = clamp(gap, 5, 95);
    strategies.push({
      id: 'gap',
      name: 'Gap and Go',
      score: Math.round(gap),
      bias: gap >= 60 ? 'Gap continuation' : 'No tradable gap',
      note: 'Gap + volume + direction of open drive.',
      what: 'Gap and Go — торгівля продовження руху після цінового gap (часто на відкритті), якщо gap «тримається» і є volume.',
      when: 'Gap up/down, ціна не одразу заповнює gap, volume високий, тренд збігається з напрямком gap.',
      how: 'Вхід на hold gap / first pullback, SL під/над gap zone, TP1 = extension 1×ATR, trail решту.',
      avoid: 'Gap fill одразу, слабкий volume, fade gap без досвіду, mid-day без реального gap.',
      drivers: drivers.gap,
      fit: gap >= 60 ? 'Є gap-continuation логіка' : 'Gap setup відсутній або слабкий',
    });

    // Composite verdict score -100..100
    let score = 0;
    if (trend === 'Bullish') score += 22;
    if (trend === 'Bearish') score -= 22;
    if (e9 != null && e21 != null) score += e9 > e21 ? 12 : -12;
    if (r != null) {
      if (r > 55 && r < 70) score += 10;
      else if (r >= 70 && r < 80) score += 4;
      else if (r >= 80) score -= 8;
      else if (r < 30) score += 4; // bounce potential small
      else if (r < 45) score -= 6;
    }
    if (mHist != null) score += mHist > 0 ? 10 : -10;
    if (aboveVwap === true) score += 8;
    if (aboveVwap === false) score -= 8;
    if (emaCross === 'Bullish cross') score += 12;
    if (emaCross === 'Bearish cross') score -= 12;
    if (volRatio > 1.5 && trend === 'Bullish') score += 6;
    if (volRatio > 1.5 && trend === 'Bearish') score -= 6;
    score += (mom - 50) * 0.25;
    score += (brk - 50) * 0.15;
    score = clamp(score, -100, 100);

    let verdict = 'Neutral';
    let verdictClass = 'verdict-neutral';
    if (score >= 45) { verdict = 'Strong Buy'; verdictClass = 'verdict-strong-buy'; }
    else if (score >= 18) { verdict = 'Buy'; verdictClass = 'verdict-buy'; }
    else if (score <= -45) { verdict = 'Strong Sell'; verdictClass = 'verdict-strong-sell'; }
    else if (score <= -18) { verdict = 'Sell'; verdictClass = 'verdict-sell'; }

    // Trade plan
    const atrApprox = (() => {
      const n = Math.min(14, bars.length - 1);
      let sum = 0;
      for (let k = bars.length - n; k < bars.length; k++) {
        const b = bars[k];
        const p = bars[k - 1] || b;
        const tr = Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close));
        sum += tr;
      }
      return sum / n;
    })();

    const isLong = score >= 0;
    let entryLow, entryHigh, sl, tp1, tp2;
    if (isLong) {
      entryLow = Math.max(levels.nearSupport, price - atrApprox * 0.35);
      entryHigh = price + atrApprox * 0.15;
      sl = Math.min(levels.nearSupport, price) - atrApprox * 0.6;
      tp1 = price + atrApprox * 1.0;
      tp2 = price + atrApprox * 1.8;
      if (levels.nearResistance > price) {
        tp1 = Math.min(tp1, levels.nearResistance * 0.998);
        tp2 = Math.max(tp2, levels.nearResistance * 1.004);
      }
    } else {
      entryHigh = Math.min(levels.nearResistance, price + atrApprox * 0.35);
      entryLow = price - atrApprox * 0.15;
      sl = Math.max(levels.nearResistance, price) + atrApprox * 0.6;
      tp1 = price - atrApprox * 1.0;
      tp2 = price - atrApprox * 1.8;
      if (levels.nearSupport < price) {
        tp1 = Math.max(tp1, levels.nearSupport * 1.002);
        tp2 = Math.min(tp2, levels.nearSupport * 0.996);
      }
    }

    const risk = Math.abs(price - sl) || atrApprox;
    const reward1 = Math.abs(tp1 - price) || atrApprox;
    const rr = risk > 0 ? reward1 / risk : 0;

    const dayChg = quote && quote.dp != null ? num(quote.dp) : ((price - prev.close) / prev.close) * 100;

    const bestStrat = [...strategies].sort((a, b) => b.score - a.score)[0];
    const worstStrat = [...strategies].sort((a, b) => a.score - b.score)[0];

    const summaryParts = [];
    summaryParts.push(`Тренд: ${trend} (EMA9/21 ${emaCross}).`);
    if (r != null) summaryParts.push(`RSI(14)=${r.toFixed(1)}.`);
    if (vw != null) summaryParts.push(`Ціна ${aboveVwap ? 'вище' : 'нижче'} VWAP.`);
    summaryParts.push(`MACD: ${macdCross}.`);
    summaryParts.push(`Найкраща стратегія зараз: ${bestStrat.name} (${bestStrat.score}/100).`);

    // Deep conclusions for UI
    const conclusions = [];
    conclusions.push({
      title: 'Загальний bias',
      text: isLong
        ? `Локальний композитний score ${Math.round(score)} → bias Long / ${verdict}. Ринок більше «дозволяє» покупкам, ніж продажам на цьому TF.`
        : `Локальний композитний score ${Math.round(score)} → bias Short / ${verdict}. Тиск продавців або слабкий long-setup.`,
    });
    conclusions.push({
      title: 'Чому такий вердикт',
      text: [
        trend === 'Bullish' ? 'Бичачий тренд за EMA' : trend === 'Bearish' ? 'Ведмежий тренд за EMA' : 'Боковий тренд',
        r != null ? `RSI ${r.toFixed(1)}` : null,
        aboveVwap === true ? 'ціна > VWAP' : aboveVwap === false ? 'ціна < VWAP' : null,
        macdCross,
        `vol ${volRatio.toFixed(2)}×`,
      ].filter(Boolean).join(' · ') + '.',
    });
    conclusions.push({
      title: 'Стратегічний фокус',
      text: `Пріоритет: ${bestStrat.name} — ${bestStrat.fit}. Найслабша: ${worstStrat.name} (${worstStrat.score}/100) — ${worstStrat.fit}.`,
    });
    if (patterns.length) {
      conclusions.push({
        title: 'Структура / патерни',
        text: patterns.slice(0, 3).join('; ') + '.',
      });
    }
    conclusions.push({
      title: 'Ризики зараз',
      text: [
        volRatio < 0.7 ? 'Низький volume — сигнали менш надійні' : null,
        r != null && r > 75 ? 'RSI високий — ризик відкату long' : null,
        r != null && r < 25 ? 'RSI низький — ризик «падаючого ножа»' : null,
        Math.abs(dayChg) > 5 ? `Сильний денний рух ${formatPct(dayChg)} — підвищена волатильність` : null,
        emaCross === 'No fresh cross' ? 'Немає свіжого EMA-cross — сигнал не «новий»' : null,
      ].filter(Boolean).join('. ') || 'Критичних red flags за простими правилами не знайдено — все одно обмежуй risk.',
    });

    const planExplain = {
      entry: isLong
        ? `Зона входу ${formatPrice(entryLow)}–${formatPrice(entryHigh)}: біля поточної ціни / ближче до support (${formatPrice(levels.nearSupport)}), щоб не купувати «в стелю» range. Буфер ≈ 0.15–0.35×ATR (${formatPrice(atrApprox)}).`
        : `Зона входу ${formatPrice(entryLow)}–${formatPrice(entryHigh)}: біля ціни / ближче до resistance (${formatPrice(levels.nearResistance)}) для short, з буфером від ATR.`,
      sl: isLong
        ? `Stop Loss ${formatPrice(sl)}: під support / за ATR×0.6 — якщо рівень пробито, long-теза скасовується.`
        : `Stop Loss ${formatPrice(sl)}: над resistance / ATR×0.6 — invalidation short.`,
      tp: `TP1 ${formatPrice(tp1)} ≈ 1×ATR (фіксуємо частину). TP2 ${formatPrice(tp2)} ≈ 1.8×ATR або за resistance/support. R:R до TP1 ≈ 1:${rr.toFixed(2)}.`,
      risk: `Ризик на угоду: зазвичай 0.25–1% депозиту. Розмір позиції = (ризик $) / |entry − SL|. Не збільшуй size, якщо R:R < 1.`,
    };

    const nextSteps = [];
    if (verdict === 'Strong Buy' || verdict === 'Buy') {
      nextSteps.push(`Розглянь ${isLong ? 'long' : 'short'} лише в зоні ${formatPrice(entryLow)}–${formatPrice(entryHigh)}.`);
      nextSteps.push(`Постав SL ${formatPrice(sl)} одразу; частково виходь на TP1 ${formatPrice(tp1)}.`);
      nextSteps.push(`Основна стратегія: ${bestStrat.name} — ${bestStrat.how}`);
    } else if (verdict === 'Neutral') {
      nextSteps.push('Не форсуй вхід: дочекайся breakout з volume або чіткого pullback до EMA9/VWAP.');
      nextSteps.push(`Слідкуй за стратегією ${bestStrat.name} (score ${bestStrat.score}) — якщо score зросте після нової свічки, перезапусти Analyze.`);
      nextSteps.push('Можна готувати ордери, але не market «в нікуди».');
    } else {
      nextSteps.push(`Bias ${verdict}: long зараз низької якості — ${isLong ? 'краще wait' : 'пріоритет short/wait'}.`);
      nextSteps.push(`Не торгуй проти: ${worstStrat.name} і слабкі long-сигнали.`);
      nextSteps.push('Перезапусти аналіз після зміни TF (5m↔15m) або після сильної свічки з volume.');
    }
    nextSteps.push('Для глибшого розбору: Generate Full Grok Analysis (кнопка нижче).');

    // Pattern notes with meaning
    const patternExplain = {
      Doji: 'Нерішучість покупців і продавців — часто пауза перед імпульсом.',
      Hammer: 'Відбій від low — можливий short-term long, якщо є рівень.',
      'Shooting star': 'Відбій від high — обережно з long.',
      engulfing: 'Сильна зміна контролю (покупці/продавці) на 1–2 барах.',
      Inside: 'Стиснення волатильності — чекай пробою.',
      Gap: 'Дисбаланс ціни між сесіями/барами — або continuation, або fill.',
      Volume: 'Підвищений інтерес — сигнали вагоміші.',
      higher: 'Мікро-аптренд по closes.',
      lower: 'Мікро-даунтренд по closes.',
    };
    const patternsDetailed = patterns.map((p) => {
      let why = 'Спостереження структури графіка.';
      for (const [k, v] of Object.entries(patternExplain)) {
        if (p.toLowerCase().includes(k.toLowerCase())) { why = v; break; }
      }
      return { title: p, why };
    });

    const indicatorExplain = {
      ema9: 'EMA9 — швидка середня. Ціна вище = short-term bullish bias; відкат до EMA9 у тренді — типова зона входу momentum.',
      ema21: 'EMA21 — повільніша. EMA9 > EMA21 = uptrend filter; навпаки = downtrend filter.',
      rsi: 'RSI(14): >70 overbought (обережно long), <30 oversold (обережно short/knife), 55–70 зона сили для long-momentum.',
      macd: 'MACD histogram >0 — бичачий імпульс; flip з − в + часто early long signal; навпаки — early short.',
      vwap: 'VWAP — середня ціна дня зважена на volume. Інтрадей long часто шукають hold над VWAP; short — під ним.',
      vol: 'Volume vs avg: >1.5× на пробої = підтвердження; <0.7× = слабкий інтерес, більше false moves.',
      support: 'Support — зона, де раніше зупиняли падіння. Пробив support інвалідує long.',
      resistance: 'Resistance — зона пропозиції. Пробив вгору з volume = breakout long watch.',
    };

    return {
      tfLabel,
      price,
      dayChg,
      trend,
      ema9: e9,
      ema21: e21,
      emaCross,
      rsi: r,
      macdLine: mLine,
      macdSignal: mSig,
      macdHist: mHist,
      macdCross,
      vwap: vw,
      aboveVwap,
      volRatio,
      levels,
      patterns,
      patternsDetailed,
      strategies,
      score: Math.round(score),
      verdict,
      verdictClass,
      summary: summaryParts.join(' '),
      conclusions,
      planExplain,
      nextSteps,
      indicatorExplain,
      bestStrat: bestStrat.name,
      plan: {
        side: isLong ? 'Long' : 'Short',
        entryLow,
        entryHigh,
        sl,
        tp1,
        tp2,
        rr,
        atr: atrApprox,
      },
      quote,
      barCount: bars.length,
      lastBar: last,
    };
  }

  // ─── Candles fetch ────────────────────────────────────────────────
  // Finnhub Free does NOT include /stock/candle (HTTP 403).
  // Primary source: Yahoo Finance chart API (free, no key) + CORS proxies.

  const YAHOO_TF = {
    '1': { interval: '1m', range: '1d', maxBars: 400 },
    '5': { interval: '5m', range: '5d', maxBars: 500 },
    '15': { interval: '15m', range: '1mo', maxBars: 500 },
    '30': { interval: '30m', range: '1mo', maxBars: 500 },
    '60': { interval: '60m', range: '3mo', maxBars: 500 },
    '240': { interval: '60m', range: '6mo', maxBars: 800, aggregate: 4 },
    D: { interval: '1d', range: '1y', maxBars: 400 },
  };

  function aggregateBars(bars, factor) {
    if (factor <= 1) return bars;
    const out = [];
    for (let i = 0; i < bars.length; i += factor) {
      const chunk = bars.slice(i, i + factor);
      if (!chunk.length) continue;
      out.push({
        time: chunk[0].time,
        open: chunk[0].open,
        high: Math.max(...chunk.map((c) => c.high)),
        low: Math.min(...chunk.map((c) => c.low)),
        close: chunk[chunk.length - 1].close,
        volume: chunk.reduce((s, c) => s + (c.volume || 0), 0),
      });
    }
    return out;
  }

  function parseYahooChart(data) {
    if (data?.error) {
      throw new Error(data.message || data.error || 'proxy error');
    }
    const result = data?.chart?.result?.[0];
    if (!result) {
      const err =
        data?.chart?.error?.description ||
        data?.message ||
        data?.yahoo ||
        'Yahoo: empty chart result';
      throw new Error(typeof err === 'string' ? err : JSON.stringify(err));
    }
    const ts = result.timestamp || [];
    const q = result.indicators?.quote?.[0] || {};
    const opens = q.open || [];
    const highs = q.high || [];
    const lows = q.low || [];
    const closes = q.close || [];
    const vols = q.volume || [];

    const bars = [];
    for (let i = 0; i < ts.length; i++) {
      const o = num(opens[i], NaN);
      const h = num(highs[i], NaN);
      const l = num(lows[i], NaN);
      const c = num(closes[i], NaN);
      if (![o, h, l, c].every((x) => Number.isFinite(x) && x > 0)) continue;
      bars.push({
        time: ts[i],
        open: o,
        high: h,
        low: l,
        close: c,
        volume: num(vols[i], 0),
      });
    }
    return bars;
  }

  function isLocalHttpApp() {
    return location.protocol === 'http:' || location.protocol === 'https:';
  }

  function isFileProtocol() {
    return location.protocol === 'file:';
  }

  async function fetchViaLocalProxy(ticker, tfKey) {
    if (!isLocalHttpApp()) throw new Error('not local http');
    const y = YAHOO_TF[tfKey] || YAHOO_TF['5'];
    const url =
      `/api/candles?symbol=${encodeURIComponent(ticker)}` +
      `&interval=${encodeURIComponent(y.interval)}` +
      `&range=${encodeURIComponent(y.range)}`;
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || data.yahoo || data.error || `local proxy HTTP ${res.status}`);
    }
    let bars = parseYahooChart(data);
    if (y.aggregate) bars = aggregateBars(bars, y.aggregate);
    if (bars.length > y.maxBars) bars = bars.slice(-y.maxBars);
    if (!bars.length) throw new Error('0 bars from local proxy');
    const src =
      data?.chart?.result?.[0]?.meta?.source === 'stooq'
        ? 'Stooq daily (via local server)'
        : 'Yahoo (via local server)';
    return { bars, source: src };
  }

  async function fetchJsonViaProxies(url) {
    const attempts = [
      async () => {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      },
      async () => {
        const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
        if (!res.ok) throw new Error(`allorigins ${res.status}`);
        return res.json();
      },
      async () => {
        const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);
        if (!res.ok) throw new Error(`corsproxy ${res.status}`);
        return res.json();
      },
    ];
    let lastErr = null;
    for (const fn of attempts) {
      try {
        const data = await fn();
        if (data) return data;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('CORS proxies failed');
  }

  async function fetchYahooCandlesBrowser(ticker, tfKey) {
    const y = YAHOO_TF[tfKey] || YAHOO_TF['5'];
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
      `?interval=${encodeURIComponent(y.interval)}&range=${encodeURIComponent(y.range)}` +
      `&includePrePost=false&events=div%7Csplit`;
    const data = await fetchJsonViaProxies(url);
    let bars = parseYahooChart(data);
    if (y.aggregate) bars = aggregateBars(bars, y.aggregate);
    if (bars.length > y.maxBars) bars = bars.slice(-y.maxBars);
    if (!bars.length) throw new Error('Yahoo: 0 bars');
    return { bars, source: 'Yahoo (browser / CORS proxy)' };
  }

  async function fetchCandles(ticker, tfKey) {
    const errors = [];

    // 1) BEST: local Python proxy (start.bat → http://127.0.0.1:8765)
    if (isLocalHttpApp()) {
      try {
        return await fetchViaLocalProxy(ticker, tfKey);
      } catch (e) {
        errors.push(`Local proxy: ${e.message || e}`);
      }
    }

    // 2) Browser Yahoo + public CORS proxies (often blocked)
    try {
      return await fetchYahooCandlesBrowser(ticker, tfKey);
    } catch (e) {
      errors.push(`Yahoo/CORS: ${e.message || e}`);
    }

    // 3) Clear guidance
    if (isFileProtocol()) {
      throw new Error(
        'Браузер відкрив файл напряму (file://) — Yahoo блокує запити (Failed to fetch).\n\n' +
        'ЗРОБИ ТАК:\n' +
        '1) Закрий цю вкладку\n' +
        '2) У папці multi-investor-top-picks запусти start.bat\n' +
        '3) Відкриється http://127.0.0.1:8765/#daytrade\n' +
        '4) Натисни Load Chart + Analyze\n\n' +
        '(Finnhub Free не дає candles — 403. Локальний сервер качає Yahoo без CORS.)'
      );
    }

    throw new Error(
      'Не вдалося завантажити графік.\n\n' +
      errors.join('\n') +
      '\n\nЗапусти start.bat і відкрий http://127.0.0.1:8765/#daytrade\n' +
      'Finnhub Free = без /stock/candle (403).'
    );
  }

  // ─── Chart ────────────────────────────────────────────────────────
  function ensureChart() {
    const container = document.getElementById('dt-chart');
    if (!container || !window.LightweightCharts) return null;
    if (chart) return chart;

    chart = LightweightCharts.createChart(container, {
      autoSize: true,
      layout: {
        background: { type: 'solid', color: '#0a1020' },
        textColor: '#94a3b8',
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(36, 51, 82, 0.45)' },
        horzLines: { color: 'rgba(36, 51, 82, 0.45)' },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: 'rgba(59,130,246,0.45)', labelBackgroundColor: '#1e3a5f' },
        horzLine: { color: 'rgba(16,185,129,0.45)', labelBackgroundColor: '#134e4a' },
      },
      rightPriceScale: { borderColor: 'rgba(36, 51, 82, 0.8)' },
      timeScale: {
        borderColor: 'rgba(36, 51, 82, 0.8)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#4ade80',
      wickDownColor: '#f87171',
    });

    volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.75, bottom: 0 },
    });

    emaFastSeries = chart.addLineSeries({
      color: '#38bdf8',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    emaSlowSeries = chart.addLineSeries({
      color: '#a78bfa',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    chart.subscribeCrosshairMove((param) => {
      const el = document.getElementById('dt-ohlc');
      if (!el) return;
      if (!param || !param.time || !param.seriesData) {
        el.textContent = 'OHLC —';
        return;
      }
      const c = param.seriesData.get(candleSeries);
      if (!c) {
        el.textContent = 'OHLC —';
        return;
      }
      el.textContent = `O ${c.open?.toFixed?.(2) ?? c.open}  H ${c.high?.toFixed?.(2) ?? c.high}  L ${c.low?.toFixed?.(2) ?? c.low}  C ${c.close?.toFixed?.(2) ?? c.close}`;
    });

    return chart;
  }

  function renderChart(bars, analysis) {
    const empty = document.getElementById('dt-chart-empty');
    if (empty) empty.classList.add('hidden');
    ensureChart();
    if (!chart || !candleSeries) {
      setStatus('lightweight-charts не завантажився. Перевір інтернет / CDN.', 'text-red-400');
      return;
    }

    const candleData = bars.map((b) => ({
      time: b.time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));
    const volData = bars.map((b) => ({
      time: b.time,
      value: b.volume || 0,
      color: b.close >= b.open ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)',
    }));

    const closes = bars.map((b) => b.close);
    const e9 = ema(closes, 9);
    const e21 = ema(closes, 21);
    const ema9Data = bars
      .map((b, i) => (e9[i] != null ? { time: b.time, value: e9[i] } : null))
      .filter(Boolean);
    const ema21Data = bars
      .map((b, i) => (e21[i] != null ? { time: b.time, value: e21[i] } : null))
      .filter(Boolean);

    candleSeries.setData(candleData);
    volumeSeries.setData(volData);
    emaFastSeries.setData(ema9Data);
    emaSlowSeries.setData(ema21Data);

    const LS = (window.LightweightCharts && LightweightCharts.LineStyle) || {};
    const dashed = LS.Dashed != null ? LS.Dashed : 2;
    const dotted = LS.SparseDotted != null ? LS.SparseDotted : (LS.Dotted != null ? LS.Dotted : 1);

    // Price lines for S/R / SL / TP
    candleSeries.createPriceLine({
      price: analysis.levels.nearSupport,
      color: 'rgba(34,197,94,0.55)',
      lineWidth: 1,
      lineStyle: dashed,
      axisLabelVisible: true,
      title: 'Support',
    });
    candleSeries.createPriceLine({
      price: analysis.levels.nearResistance,
      color: 'rgba(248,113,113,0.55)',
      lineWidth: 1,
      lineStyle: dashed,
      axisLabelVisible: true,
      title: 'Resist',
    });
    if (analysis.plan?.sl) {
      candleSeries.createPriceLine({
        price: analysis.plan.sl,
        color: 'rgba(239,68,68,0.75)',
        lineWidth: 1,
        lineStyle: dotted,
        axisLabelVisible: true,
        title: 'SL',
      });
    }
    if (analysis.plan?.tp1) {
      candleSeries.createPriceLine({
        price: analysis.plan.tp1,
        color: 'rgba(16,185,129,0.75)',
        lineWidth: 1,
        lineStyle: dotted,
        axisLabelVisible: true,
        title: 'TP1',
      });
    }

    chart.timeScale().fitContent();
    document.getElementById('dt-bar-count').textContent = `${bars.length} bars`;
  }

  // Re-create price lines only works by recreating series data each time -
  // createPriceLine stacks if we call load multiple times. Fix: remove series and re-add, or track lines.
  // Simpler fix: destroy chart on each load.
  function resetChart() {
    if (chart) {
      chart.remove();
      chart = null;
      candleSeries = null;
      volumeSeries = null;
      emaFastSeries = null;
      emaSlowSeries = null;
    }
    const container = document.getElementById('dt-chart');
    if (container) container.innerHTML = '';
  }

  // ─── UI render analysis ───────────────────────────────────────────
  function chip(label, value) {
    return `<div class="metric-chip"><div class="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">${escapeHtml(label)}</div><div class="text-sm font-semibold text-slate-100">${value}</div></div>`;
  }

  function renderAnalysis(a, ticker) {
    const v = document.getElementById('dt-verdict');
    v.className = `text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg border ${a.verdictClass}`;
    v.textContent = a.verdict;
    v.classList.remove('hidden');

    document.getElementById('dt-verdict-text').textContent = a.summary;
    document.getElementById('dt-live-price').textContent = formatPrice(a.price);
    const chgEl = document.getElementById('dt-live-chg');
    chgEl.textContent = formatPct(a.dayChg);
    chgEl.className = `text-xs tabular-nums font-medium ${a.dayChg > 0 ? 'text-emerald-400' : a.dayChg < 0 ? 'text-red-400' : 'text-slate-400'}`;

    document.getElementById('dt-chart-title').textContent = ticker;
    document.getElementById('dt-chart-sub').textContent = `${a.tfLabel} · ${a.trend} · score ${a.score}`;

    // Conclusions
    const concEl = document.getElementById('dt-conclusions');
    if (concEl) {
      concEl.innerHTML = (a.conclusions || [])
        .map(
          (c) => `
        <div class="rounded-lg bg-surface-900/70 border border-white/5 px-3 py-2">
          <div class="text-[10px] uppercase tracking-wide text-emerald-400/90 font-semibold mb-0.5">${escapeHtml(c.title)}</div>
          <div class="text-slate-300 leading-relaxed">${escapeHtml(c.text)}</div>
        </div>`
        )
        .join('');
    }

    const p = a.plan;
    document.getElementById('dt-levels').innerHTML = [
      chip('Side', escapeHtml(p.side)),
      chip('Entry zone', `${formatPrice(p.entryLow)} – ${formatPrice(p.entryHigh)}`),
      chip('Stop Loss', `<span class="text-red-300">${formatPrice(p.sl)}</span>`),
      chip('Take Profit 1', `<span class="text-emerald-300">${formatPrice(p.tp1)}</span>`),
      chip('Take Profit 2', `<span class="text-emerald-300">${formatPrice(p.tp2)}</span>`),
      chip('Risk : Reward', `1 : ${p.rr.toFixed(2)}`),
    ].join('');

    // Plan explanation
    const pe = document.getElementById('dt-plan-explain');
    if (pe && a.planExplain) {
      pe.innerHTML = `
        <div class="rounded-xl bg-surface-900/60 border border-white/5 p-3 space-y-2">
          <div class="text-[10px] uppercase tracking-wide text-blue-300 font-semibold">Чому саме ці рівні</div>
          <p><span class="text-slate-500">Entry:</span> ${escapeHtml(a.planExplain.entry)}</p>
          <p><span class="text-slate-500">Stop:</span> ${escapeHtml(a.planExplain.sl)}</p>
          <p><span class="text-slate-500">Targets:</span> ${escapeHtml(a.planExplain.tp)}</p>
          <p><span class="text-slate-500">Risk:</span> ${escapeHtml(a.planExplain.risk)}</p>
        </div>`;
    }

    const ie = a.indicatorExplain || {};
    document.getElementById('dt-indicators').innerHTML = [
      { k: 'ema9', l: 'EMA 9', v: a.ema9 != null ? a.ema9.toFixed(3) : '—' },
      { k: 'ema21', l: 'EMA 21', v: a.ema21 != null ? a.ema21.toFixed(3) : '—' },
      { k: 'ema9', l: 'EMA cross', v: escapeHtml(a.emaCross) },
      { k: 'rsi', l: 'RSI (14)', v: a.rsi != null ? a.rsi.toFixed(1) : '—' },
      { k: 'macd', l: 'MACD hist', v: a.macdHist != null ? a.macdHist.toFixed(4) : '—' },
      { k: 'vwap', l: 'VWAP', v: a.vwap != null ? formatPrice(a.vwap) : '—' },
      { k: 'vwap', l: 'vs VWAP', v: a.aboveVwap == null ? '—' : a.aboveVwap ? 'Above' : 'Below' },
      { k: 'vol', l: 'Vol vs avg', v: `${a.volRatio.toFixed(2)}×` },
      { k: 'support', l: 'Support', v: formatPrice(a.levels.nearSupport) },
      { k: 'resistance', l: 'Resistance', v: formatPrice(a.levels.nearResistance) },
    ]
      .map(
        (item) => `
      <button type="button" data-ind="${item.k}" data-label="${escapeHtml(item.l)}"
        class="metric-chip text-left w-full hover:border-blue-500/40 transition-colors cursor-pointer">
        <div class="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">${escapeHtml(item.l)}</div>
        <div class="text-sm font-semibold text-slate-100">${item.v}</div>
      </button>`
      )
      .join('');

    const indBox = document.getElementById('dt-indicator-explain');
    document.querySelectorAll('#dt-indicators [data-ind]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-ind');
        const label = btn.getAttribute('data-label') || key;
        const text = ie[key] || 'Немає опису.';
        if (indBox) {
          indBox.classList.remove('hidden');
          indBox.innerHTML = `<span class="text-blue-300 font-semibold">${escapeHtml(label)}:</span> ${escapeHtml(text)}`;
        }
      });
    });

    // Strategies with expandable explanations
    document.getElementById('dt-strategies').innerHTML = a.strategies
      .map((s, idx) => {
        const w = clamp(s.score, 0, 100);
        const scoreColor =
          s.score >= 65 ? 'text-emerald-400' : s.score >= 50 ? 'text-amber-300' : 'text-slate-400';
        return `
        <div class="rounded-xl border border-white/5 bg-surface-900/50 overflow-hidden">
          <div class="px-3 py-2.5">
            <div class="flex justify-between gap-2 mb-1 items-center">
              <span class="font-semibold text-slate-100">${escapeHtml(s.name)}</span>
              <span class="text-xs ${scoreColor} font-bold">${s.score}/100</span>
            </div>
            <div class="h-1.5 rounded-full bg-surface-700 overflow-hidden mb-1.5">
              <div class="strategy-bar h-full" style="width:${w}%"></div>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-[11px] text-slate-400">${escapeHtml(s.bias)} · ${escapeHtml(s.fit || s.note)}</span>
              <button type="button" data-strat-toggle="${idx}"
                class="text-[11px] font-semibold text-blue-300 hover:text-blue-200 px-2 py-0.5 rounded-md border border-blue-500/25 bg-blue-500/10">
                Пояснення ▾
              </button>
            </div>
          </div>
          <div id="dt-strat-body-${idx}" class="hidden px-3 pb-3 border-t border-white/5 pt-2 space-y-2 text-[11px] text-slate-400 leading-relaxed">
            <p><span class="text-emerald-400/90 font-semibold">Що це:</span> ${escapeHtml(s.what || '')}</p>
            <p><span class="text-blue-300 font-semibold">Коли працює:</span> ${escapeHtml(s.when || '')}</p>
            <p><span class="text-cyan-300 font-semibold">Як торгувати:</span> ${escapeHtml(s.how || '')}</p>
            <p><span class="text-amber-300 font-semibold">Коли уникати:</span> ${escapeHtml(s.avoid || '')}</p>
            <p><span class="text-slate-300 font-semibold">Зараз на графіку:</span> ${escapeHtml(s.fit || '')}</p>
            <div>
              <div class="text-slate-500 font-semibold mb-1">Чому саме ${s.score}/100:</div>
              <ul class="list-disc list-inside space-y-0.5 text-slate-400">
                ${(s.drivers || []).map((d) => `<li>${escapeHtml(d)}</li>`).join('')}
              </ul>
            </div>
          </div>
        </div>`;
      })
      .join('');

    document.querySelectorAll('[data-strat-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = btn.getAttribute('data-strat-toggle');
        const body = document.getElementById(`dt-strat-body-${idx}`);
        if (!body) return;
        const open = !body.classList.contains('hidden');
        body.classList.toggle('hidden', open);
        btn.textContent = open ? 'Пояснення ▾' : 'Сховати ▴';
      });
    });

    // Patterns with explanations
    const pd = a.patternsDetailed || (a.patterns || []).map((t) => ({ title: t, why: '' }));
    document.getElementById('dt-patterns').innerHTML = pd.length
      ? pd
          .map(
            (item) => `
        <li class="rounded-lg bg-surface-900/60 border border-white/5 px-2.5 py-2 list-none">
          <div class="font-medium text-slate-200">${escapeHtml(item.title)}</div>
          ${item.why ? `<div class="text-slate-500 mt-0.5 leading-relaxed">${escapeHtml(item.why)}</div>` : ''}
        </li>`
          )
          .join('')
      : '<li class="text-slate-600 list-none">Немає відмічених патернів</li>';

    // Next steps
    const ns = document.getElementById('dt-next-steps');
    if (ns) {
      ns.innerHTML = (a.nextSteps || [])
        .map((step) => `<li class="leading-relaxed">${escapeHtml(step)}</li>`)
        .join('');
    }

    document.getElementById('dt-grok-btn').disabled = false;
    document.getElementById('dt-save-btn').disabled = false;
  }

  function buildDayTradeGrokPrompt(ticker, a) {
    const stratLines = a.strategies
      .map((s) => `  - ${s.name}: ${s.score}/100 · ${s.bias} — ${s.note}`)
      .join('\n');
    const pat = a.patterns.map((p) => `  - ${p}`).join('\n');

    return `Ти — професійний day-trader і технічний аналітик. Проаналізуй акцію ${ticker} для DAY TRADING і дай конкретний план з цифрами.

## Ринок (з Chart Analyzer)
- Тікер: ${ticker}
- Таймфрейм: ${a.tfLabel}
- Поточна ціна: ${formatPrice(a.price)}
- Δ day (approx): ${formatPct(a.dayChg)}
- Барів у вибірці: ${a.barCount}
- Локальний вердикт додатку: ${a.verdict} (score ${a.score})
- Тренд: ${a.trend}
- EMA9: ${a.ema9?.toFixed?.(3) ?? 'n/a'} | EMA21: ${a.ema21?.toFixed?.(3) ?? 'n/a'} | Cross: ${a.emaCross}
- RSI(14): ${a.rsi?.toFixed?.(1) ?? 'n/a'}
- MACD hist: ${a.macdHist?.toFixed?.(4) ?? 'n/a'} | ${a.macdCross}
- VWAP: ${a.vwap != null ? formatPrice(a.vwap) : 'n/a'} | Price vs VWAP: ${a.aboveVwap == null ? 'n/a' : a.aboveVwap ? 'above' : 'below'}
- Volume vs 20-bar avg: ${a.volRatio.toFixed(2)}×
- Support: ${formatPrice(a.levels.nearSupport)} | Resistance: ${formatPrice(a.levels.nearResistance)}
- ATR(approx): ${formatPrice(a.plan.atr)}

## App trade sketch (${a.plan.side})
- Entry zone: ${formatPrice(a.plan.entryLow)} – ${formatPrice(a.plan.entryHigh)}
- Stop Loss: ${formatPrice(a.plan.sl)}
- TP1: ${formatPrice(a.plan.tp1)} | TP2: ${formatPrice(a.plan.tp2)}
- R:R (to TP1): 1:${a.plan.rr.toFixed(2)}

## Strategy scores
${stratLines}

## Patterns / structure
${pat}

## Summary from app
${a.summary}

---

## Твоє завдання
1. Потенціал руху вгору/вниз у % на обраний TF (day trade horizon).
2. Точна зона входу (або «не торгувати»).
3. Stop Loss з поясненням (рівень + логіка).
4. Take Profit 1 і Take Profit 2.
5. Стратегія: Scalping / Momentum / Breakout / Reversal / Gap and Go — яку обрати і чому.
6. Risk management: % ризику на угоду від портфеля.
7. Вердикт: Strong Buy / Buy / Neutral / Sell / Strong Sell саме для day trading + чому.

Будь конкретним, використовуй цифри. Відповідь українською. Це освітній аналіз, не індивідуальна фінпорада.`;
  }

  // ─── Save / load ──────────────────────────────────────────────────
  function loadSaved() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_SAVED) || '[]');
    } catch (_) {
      return [];
    }
  }
  function renderSavedList() {
    const list = document.getElementById('dt-saved-list');
    if (!list) return;
    const items = loadSaved();
    if (!items.length) {
      list.innerHTML = '<li class="text-slate-600">Порожньо</li>';
      return;
    }
    list.innerHTML = items
      .map(
        (it, idx) => `
      <li class="flex items-center justify-between gap-2 px-2 py-2 rounded-lg bg-surface-900/80 border border-white/5">
        <button type="button" data-load-saved="${idx}" class="text-left min-w-0 flex-1 hover:text-emerald-300">
          <span class="font-mono font-bold text-blue-300">${escapeHtml(it.ticker)}</span>
          <span class="text-slate-500"> · ${escapeHtml(it.tf)} · ${escapeHtml(it.verdict)}</span>
          <div class="text-[10px] text-slate-600">${escapeHtml(it.savedAt)}</div>
        </button>
        <button type="button" data-del-saved="${idx}" class="text-slate-600 hover:text-red-400 px-1">✕</button>
      </li>`
      )
      .join('');

    list.querySelectorAll('[data-load-saved]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const it = loadSaved()[Number(btn.getAttribute('data-load-saved'))];
        if (!it) return;
        document.getElementById('dt-ticker').value = it.ticker;
        selectedTf = it.tfKey || '5';
        document.querySelectorAll('#dt-tf-group .tf-btn').forEach((b) => {
          b.classList.toggle('active', b.dataset.tf === selectedTf);
        });
        // re-load live rather than stale chart
        loadAndAnalyze();
      });
    });
    list.querySelectorAll('[data-del-saved]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const items = loadSaved();
        items.splice(Number(btn.getAttribute('data-del-saved')), 1);
        localStorage.setItem(STORAGE_SAVED, JSON.stringify(items));
        renderSavedList();
      });
    });
  }

  function saveAnalysis() {
    if (!lastAnalysis) return;
    const ticker = document.getElementById('dt-ticker').value.trim().toUpperCase();
    const items = loadSaved();
    items.unshift({
      ticker,
      tf: lastAnalysis.tfLabel,
      tfKey: selectedTf,
      verdict: lastAnalysis.verdict,
      score: lastAnalysis.score,
      price: lastAnalysis.price,
      plan: lastAnalysis.plan,
      summary: lastAnalysis.summary,
      savedAt: new Date().toLocaleString(),
    });
    localStorage.setItem(STORAGE_SAVED, JSON.stringify(items.slice(0, 30)));
    renderSavedList();
    setStatus(`Збережено аналіз ${ticker} · ${lastAnalysis.tfLabel}`, 'text-emerald-400');
  }

  // ─── Main load ────────────────────────────────────────────────────
  async function loadAndAnalyze() {
    const ticker = document.getElementById('dt-ticker').value.trim().toUpperCase();
    if (!ticker) {
      setStatus('Введи тікер.', 'text-amber-400');
      return;
    }
    // Finnhub key is OPTIONAL here — candles come from Yahoo (local server).
    // Quote from Finnhub is a bonus if key already saved.

    const btn = document.getElementById('dt-load-btn');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner inline-block"></span> Loading…`;
    setStatus(`Завантаження ${ticker} · TF ${TF_META[selectedTf]?.label || selectedTf}…`, 'text-blue-300');
    document.getElementById('dt-grok-wrap').classList.add('hidden');

    try {
      const { bars, source } = await fetchCandles(ticker, selectedTf);
      if (bars.length < 15) {
        throw new Error(`Замало барів (${bars.length}). Спробуй Daily або інший тікер.`);
      }

      let quote = null;
      if (apiKey()) {
        try {
          quote = await fhGet('/quote', { symbol: ticker });
        } catch (_) {}
      }
      // Fallback quote from last bar if Finnhub blocked/unavailable
      if (!quote && bars.length) {
        const last = bars[bars.length - 1];
        const prev = bars[bars.length - 2] || last;
        const dp = prev.close ? ((last.close - prev.close) / prev.close) * 100 : 0;
        quote = { c: last.close, dp, h: last.high, l: last.low, o: last.open, pc: prev.close };
      }

      const meta = TF_META[selectedTf] || TF_META['5'];
      const analysis = analyzeBars(bars, quote, meta.label);
      lastBars = bars;
      lastAnalysis = analysis;

      resetChart();
      renderChart(bars, analysis);
      renderAnalysis(analysis, ticker);

      try {
        localStorage.setItem(
          STORAGE_LAST,
          JSON.stringify({ ticker, tf: selectedTf, at: Date.now() })
        );
      } catch (_) {}

      setStatus(
        `OK · ${ticker} · ${bars.length} bars · ${meta.label} · ${analysis.verdict} · data: ${source}`,
        'text-emerald-400'
      );
    } catch (e) {
      const msg = e.message || 'Помилка завантаження';
      setStatus(msg, 'text-red-400');
      document.getElementById('dt-chart-empty')?.classList.remove('hidden');
      const empty = document.getElementById('dt-chart-empty');
      if (empty) {
        empty.innerHTML = `<div class="max-w-md text-center px-4 text-sm text-red-300/90 whitespace-pre-line">${escapeHtml(msg)}</div>`;
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Load Chart + Analyze';
    }
  }

  // ─── Wire UI ──────────────────────────────────────────────────────
  function wire() {
    // Warn when opened as file://
    const fileWarn = document.getElementById('dt-file-warn');
    if (fileWarn && location.protocol === 'file:') {
      fileWarn.classList.remove('hidden');
      setStatus(
        'Відкрито як file:// — запусти start.bat → http://127.0.0.1:8765/#daytrade',
        'text-amber-400'
      );
    } else if (location.protocol.startsWith('http') && location.port === '8765') {
      setStatus('Локальний сервер OK · можна Load Chart (Yahoo proxy).', 'text-emerald-400');
    }

    document.querySelectorAll('#dt-tf-group .tf-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedTf = btn.dataset.tf;
        document.querySelectorAll('#dt-tf-group .tf-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    document.getElementById('dt-load-btn')?.addEventListener('click', loadAndAnalyze);
    document.getElementById('dt-ticker')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        loadAndAnalyze();
      }
    });

    document.getElementById('dt-save-btn')?.addEventListener('click', saveAnalysis);
    document.getElementById('dt-clear-saved')?.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_SAVED);
      renderSavedList();
    });

    document.getElementById('dt-grok-btn')?.addEventListener('click', () => {
      if (!lastAnalysis) return;
      const ticker = document.getElementById('dt-ticker').value.trim().toUpperCase();
      const prompt = buildDayTradeGrokPrompt(ticker, lastAnalysis);
      document.getElementById('dt-grok-prompt').value = prompt;
      document.getElementById('dt-grok-wrap').classList.remove('hidden');
      document.getElementById('dt-grok-prompt').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    document.getElementById('dt-copy-btn')?.addEventListener('click', async () => {
      const text = document.getElementById('dt-grok-prompt').value;
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
      } catch (_) {
        document.getElementById('dt-grok-prompt').select();
        document.execCommand('copy');
      }
      const msg = document.getElementById('dt-copy-msg');
      msg.classList.remove('hidden');
      setTimeout(() => msg.classList.add('hidden'), 2000);
    });

    document.getElementById('dt-open-grok-btn')?.addEventListener('click', async () => {
      const text = document.getElementById('dt-grok-prompt').value;
      if (text) {
        try { await navigator.clipboard.writeText(text); } catch (_) {}
      }
      window.open('https://grok.com/', '_blank', 'noopener,noreferrer');
    });

    renderSavedList();

    try {
      const last = JSON.parse(localStorage.getItem(STORAGE_LAST) || 'null');
      if (last?.ticker) {
        document.getElementById('dt-ticker').value = last.ticker;
        if (last.tf && TF_META[last.tf]) {
          selectedTf = last.tf;
          document.querySelectorAll('#dt-tf-group .tf-btn').forEach((b) => {
            b.classList.toggle('active', b.dataset.tf === selectedTf);
          });
        }
      }
    } catch (_) {}
  }

  window.DayTradingAnalyzer = {
    onShow() {
      // reflow chart if exists
      if (chart) {
        try { chart.timeScale().fitContent(); } catch (_) {}
      }
    },
    loadAndAnalyze,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
