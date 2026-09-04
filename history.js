/**
 * MITP History — RS and volatility from real price history.
 *
 * Quote-only RS/volatility describe a single session: a sleepy stock that
 * gapped this morning outranks a genuine six-month leader, and "volatility"
 * is just today's high-low range. This module pulls ~1y of daily bars
 * (Yahoo — free, no API key) and derives:
 *
 *   rs         IBD-style weighted performance (last quarter counts double),
 *              percentile-ranked inside the user's own ticker list and
 *              blended with excess return vs the benchmark (SPY).
 *   volatility annualised stdev of daily log returns, mapped onto the same
 *              0..100 scale the scorers already expect (≈45 = the day-trading
 *              sweet spot in scoreVolatilityForDay).
 *
 * Both stay in the ranges the existing scorers assume (rs 5..99, vol 5..95),
 * so nothing downstream needs to change. When history is unavailable
 * (file://, CORS proxies down, unknown ticker) the caller's same-day values
 * are left untouched — the app degrades to its previous behaviour.
 *
 * Depends on nothing. Exposes window.MITPHistory.
 */
(function () {
  'use strict';

  const BENCHMARK = 'SPY';
  const CACHE_PREFIX = 'mitp_hist_v1_';
  const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // daily bars change once a day
  const ENABLED_KEY = 'mitp_hist_enabled';
  const POOL_SIZE = 3; // public CORS proxies dislike bursts

  // Lookback windows in trading sessions
  const WINDOWS = { m3: 63, m6: 126, m9: 189, m12: 252 };
  // IBD-style: the most recent quarter carries double weight
  const PERF_WEIGHTS = { m3: 0.4, m6: 0.2, m9: 0.2, m12: 0.2 };

  const VOL_SESSIONS = 21; // ~1 month of daily returns
  const VOL_TO_SCORE = 1.2; // annualised % → 0..100 (37%/yr ≈ 45 = sweet spot)
  const RS_VS_BENCH_SLOPE = 1.1; // excess return % → points around 50

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function num(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function fmtPct(p) {
    if (!Number.isFinite(p)) return '—';
    return `${p > 0 ? '+' : ''}${p.toFixed(1)}%`;
  }

  // ─── Fetch (same fallback chain as the Day Trading chart) ───────────

  function isHttpApp() {
    return location.protocol === 'http:' || location.protocol === 'https:';
  }

  // Yahoo answers on both hosts; one is sometimes rate-limited while the other
  // is fine. Public CORS proxies go down regularly, so try several.
  const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  const CORS_PROXIES = [
    { name: 'direct', wrap: (url) => url },
    { name: 'allorigins', wrap: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
    { name: 'corsproxy', wrap: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}` },
    { name: 'codetabs', wrap: (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}` },
  ];

  // Whichever host/proxy pair answered last: probing costs a round-trip per
  // ticker, so once one works the rest of the batch goes straight to it.
  let workingRoute = null;
  // On GitHub Pages there is no server.py, so /api/candles is a 404 on every
  // ticker. Probe it once and stop asking for the rest of the batch.
  let localProxyDead = false;

  function chartUrl(host, ticker, range) {
    return (
      `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}` +
      `?interval=1d&range=${encodeURIComponent(range)}&includePrePost=false`
    );
  }

  /** Every host/proxy pair, the one that worked last time first. */
  function routes() {
    const all = [];
    for (const host of YAHOO_HOSTS) {
      for (const proxy of CORS_PROXIES) all.push({ host, proxy });
    }
    if (!workingRoute) return all;
    const first = all.filter((r) => r.host === workingRoute.host && r.proxy.name === workingRoute.proxy.name);
    return [...first, ...all.filter((r) => !first.includes(r))];
  }

  /**
   * Fetch and parse in one step: a proxy that is up but broken answers 200
   * with an HTML error page or a JSON envelope, so only a response that
   * actually parses as a Yahoo chart counts as success.
   */
  async function fetchChartVia(route, ticker, range) {
    const res = await fetch(route.proxy.wrap(chartUrl(route.host, ticker, range)), { mode: 'cors' });
    if (!res.ok) throw new Error(`${route.proxy.name} HTTP ${res.status}`);
    const parsed = parseCloses(await res.json());
    if (!parsed.closes.length) throw new Error(`${route.proxy.name}: 0 bars`);
    return parsed;
  }

  function parseCloses(data) {
    if (data?.error) throw new Error(data.message || data.error || 'proxy error');
    const result = data?.chart?.result?.[0];
    if (!result) {
      const err = data?.chart?.error?.description || data?.message || data?.yahoo || 'empty chart result';
      throw new Error(typeof err === 'string' ? err : JSON.stringify(err));
    }
    const ts = result.timestamp || [];
    const raw = result.indicators?.quote?.[0]?.close || [];
    const closes = [];
    const dates = [];
    for (let i = 0; i < ts.length; i++) {
      const c = num(raw[i], NaN);
      if (!Number.isFinite(c) || c <= 0) continue;
      closes.push(c);
      dates.push(ts[i]);
    }
    return { closes, dates, asOf: dates.length ? dates[dates.length - 1] : 0 };
  }

  /** Daily closes with their timestamps. `range` is a Yahoo range (1y, 2y, 5y…). */
  async function fetchDailyCloses(ticker, range = '1y') {
    // 1) local Python proxy (start.bat) — no CORS, no key
    if (isHttpApp() && !localProxyDead) {
      try {
        const res = await fetch(
          `/api/candles?symbol=${encodeURIComponent(ticker)}&interval=1d&range=${encodeURIComponent(range)}`
        );
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const parsed = parseCloses(data);
          if (parsed.closes.length) return parsed;
        }
        localProxyDead = true;
      } catch (_) {
        localProxyDead = true; // no server.py here — stop probing it
      }
    }
    // 2) Yahoo, across both hosts and every CORS proxy, until one answers
    let lastErr = null;
    for (const route of routes()) {
      try {
        const parsed = await fetchChartVia(route, ticker, range);
        workingRoute = route;
        return parsed;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('no data source reachable');
  }

  // ─── Statistics ────────────────────────────────────────────────────

  /** Return over `sessions` trading days; falls back to the oldest bar we have. */
  function perfPct(closes, sessions) {
    if (closes.length < 2) return null;
    const last = closes[closes.length - 1];
    const idx = closes.length - 1 - sessions;
    const base = idx >= 0 ? closes[idx] : closes[0];
    if (!(base > 0)) return null;
    return (last / base - 1) * 100;
  }

  function weightedPerf(perf) {
    let sum = 0;
    let weight = 0;
    for (const key of Object.keys(PERF_WEIGHTS)) {
      const p = perf[key];
      if (!Number.isFinite(p)) continue;
      sum += p * PERF_WEIGHTS[key];
      weight += PERF_WEIGHTS[key];
    }
    return weight > 0 ? sum / weight : null;
  }

  /** Annualised stdev of daily log returns, in percent. */
  function annualisedVolPct(closes, sessions = VOL_SESSIONS) {
    const slice = closes.slice(-(sessions + 1));
    const rets = [];
    for (let i = 1; i < slice.length; i++) {
      if (slice[i - 1] > 0 && slice[i] > 0) rets.push(Math.log(slice[i] / slice[i - 1]));
    }
    if (rets.length < 5) return null;
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
    return Math.sqrt(variance) * Math.sqrt(252) * 100;
  }

  function statsFromCloses(closes, asOf) {
    const perf = {};
    for (const [key, sessions] of Object.entries(WINDOWS)) {
      perf[key] = perfPct(closes, sessions);
    }
    perf.weighted = weightedPerf(perf);
    return {
      asOf,
      bars: closes.length,
      lastClose: closes[closes.length - 1],
      perf,
      volAnnualPct: annualisedVolPct(closes),
    };
  }

  /**
   * RS 0..100 per ticker: percentile inside the universe blended with
   * excess return vs the benchmark. A percentile alone would be meaningless
   * for a 3-ticker list; a benchmark comparison alone ignores the peer group.
   */
  function rsScores(universe, benchStats) {
    const entries = Object.entries(universe).filter(
      ([, st]) => st && st.perf && Number.isFinite(st.perf.weighted)
    );
    const benchPerf = benchStats?.perf?.weighted;
    const perfs = entries.map(([, st]) => st.perf.weighted);
    const out = {};

    for (const [ticker, st] of entries) {
      const perf = st.perf.weighted;
      let percentile = null;
      if (perfs.length >= 5) {
        const below = perfs.filter((p) => p < perf).length;
        percentile = (below / (perfs.length - 1)) * 100;
      }
      let vsBench = null;
      if (Number.isFinite(benchPerf)) {
        vsBench = clamp(50 + (perf - benchPerf) * RS_VS_BENCH_SLOPE, 5, 99);
      }

      let rs;
      if (percentile != null && vsBench != null) rs = percentile * 0.6 + vsBench * 0.4;
      else if (vsBench != null) rs = vsBench;
      else if (percentile != null) rs = percentile;
      else rs = clamp(50 + perf * RS_VS_BENCH_SLOPE, 5, 99);

      out[ticker] = clamp(Math.round(rs), 5, 99);
    }
    return { rs: out, benchPerf };
  }

  // ─── Cache (derived stats only — raw bars would blow the quota) ─────

  function cacheGet(ticker) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + ticker);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (!entry || !entry.ts || !entry.stats) return null;
      if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
      return entry.stats;
    } catch (_) {
      return null;
    }
  }

  function cacheSet(ticker, stats) {
    try {
      localStorage.setItem(CACHE_PREFIX + ticker, JSON.stringify({ ts: Date.now(), stats }));
    } catch (_) {}
  }

  function clearCache() {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch (_) {}
  }

  // ─── Orchestration ─────────────────────────────────────────────────

  async function runPool(items, worker, poolSize = POOL_SIZE) {
    const queue = items.slice();
    const runners = [];
    for (let i = 0; i < Math.min(poolSize, queue.length); i++) {
      runners.push(
        (async () => {
          while (queue.length) {
            const item = queue.shift();
            await worker(item);
          }
        })()
      );
    }
    await Promise.all(runners);
  }

  let lastRun = null;

  /**
   * Fetch history for every stock, then overwrite rs/volatility in place.
   * Stocks we could not price keep whatever the caller set (same-day proxy)
   * and are flagged hasHistory = false.
   */
  async function enrich(stocks, opts = {}) {
    const { force = false, onProgress = null } = opts;
    const list = Array.isArray(stocks) ? stocks.filter((s) => s && s.ticker) : [];
    const tickers = [...new Set(list.map((s) => String(s.ticker).toUpperCase()))];
    if (!tickers.length) {
      lastRun = { ts: Date.now(), applied: 0, total: 0, failed: [], benchmark: BENCHMARK };
      return lastRun;
    }

    if (force) clearCache();

    const wanted = [...new Set([...tickers, BENCHMARK])];
    const statsByTicker = {};
    const failed = [];
    let done = 0;

    await runPool(wanted, async (ticker) => {
      const cached = cacheGet(ticker);
      if (cached) {
        statsByTicker[ticker] = cached;
      } else {
        try {
          const { closes, asOf } = await fetchDailyCloses(ticker);
          const stats = statsFromCloses(closes, asOf);
          statsByTicker[ticker] = stats;
          cacheSet(ticker, stats);
        } catch (_) {
          failed.push(ticker);
        }
      }
      done++;
      if (onProgress) {
        try {
          onProgress(done, wanted.length, ticker);
        } catch (_) {}
      }
    });

    const benchStats = statsByTicker[BENCHMARK];
    const universe = {};
    for (const t of tickers) if (statsByTicker[t]) universe[t] = statsByTicker[t];

    const { rs, benchPerf } = rsScores(universe, benchStats);

    let applied = 0;
    let asOf = 0;
    for (const stock of list) {
      const t = String(stock.ticker).toUpperCase();
      const st = universe[t];
      if (!st) {
        stock.hasHistory = false;
        continue;
      }
      if (Number.isFinite(rs[t])) stock.rs = rs[t];
      if (Number.isFinite(st.volAnnualPct)) {
        stock.volatility = clamp(Math.round(st.volAnnualPct * VOL_TO_SCORE), 5, 95);
      }
      stock.hasHistory = true;
      stock.history = { ...st, benchmark: BENCHMARK, benchPerf };
      if (st.asOf > asOf) asOf = st.asOf;
      applied++;
    }

    lastRun = {
      ts: Date.now(),
      applied,
      total: tickers.length,
      failed,
      benchmark: BENCHMARK,
      benchPerf,
      benchOk: !!benchStats,
      asOf,
    };
    return lastRun;
  }

  /** One-line provenance for tooltips / status text. */
  function describe(stock) {
    const h = stock && stock.history;
    if (!h) return 'RS і волатильність — лише за сьогоднішню сесію (історія не завантажена)';
    const parts = [];
    if (Number.isFinite(h.perf?.m3)) parts.push(`3м ${fmtPct(h.perf.m3)}`);
    if (Number.isFinite(h.perf?.m12)) parts.push(`12м ${fmtPct(h.perf.m12)}`);
    if (Number.isFinite(h.benchPerf)) parts.push(`${h.benchmark} ${fmtPct(h.benchPerf)}`);
    if (Number.isFinite(h.volAnnualPct)) parts.push(`σ ${Math.round(h.volAnnualPct)}%/рік`);
    return parts.join(' · ');
  }

  function isEnabled() {
    try {
      return localStorage.getItem(ENABLED_KEY) !== '0';
    } catch (_) {
      return true;
    }
  }

  function setEnabled(on) {
    try {
      localStorage.setItem(ENABLED_KEY, on ? '1' : '0');
    } catch (_) {}
  }

  /**
   * Raw daily series for several tickers, fetched with the same fallback
   * chain as enrich(). Used by the backtest, which needs the bars themselves
   * (and their dates) rather than the derived stats enrich() caches.
   */
  async function fetchSeries(tickers, { range = '2y', onProgress = null } = {}) {
    const wanted = [...new Set(tickers.map((t) => String(t).toUpperCase()))];
    const series = {};
    const failed = [];
    let done = 0;
    await runPool(wanted, async (ticker) => {
      try {
        const { closes, dates } = await fetchDailyCloses(ticker, range);
        series[ticker] = { closes, dates };
      } catch (_) {
        failed.push(ticker);
      }
      done++;
      if (onProgress) {
        try {
          onProgress(done, wanted.length, ticker);
        } catch (_) {}
      }
    });
    return { series, failed };
  }

  window.MITPHistory = {
    BENCHMARK,
    CACHE_TTL_MS,
    enrich,
    describe,
    clearCache,
    isEnabled,
    setEnabled,
    fetchSeries,
    getLastRun: () => lastRun,
    // exposed for tests / debugging in the console
    _internals: {
      perfPct,
      weightedPerf,
      annualisedVolPct,
      statsFromCloses,
      rsScores,
      fetchDailyCloses,
      routes,
      resetRoute: () => { workingRoute = null; localProxyDead = false; },
      getRoute: () => workingRoute,
      CORS_PROXIES,
      YAHOO_HOSTS,
    },
  };
})();
