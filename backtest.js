/**
 * MITP Backtest — what the RS ranking would actually have returned.
 *
 * Walk-forward, no look-ahead: at each rebalance date the ranking sees only
 * closes up to that date, using the very same statsFromCloses/rsScores the
 * live app ranks with. Buy the top N equal-weight, hold, repeat.
 *
 * What this does NOT test: the fundamental half of the score (P/E, ROE,
 * growth, debt). Finnhub only serves *current* fundamentals, so scoring a
 * past date with them would be look-ahead bias. This measures the price
 * signal — RS — which is what drives the day-trading strategy scores.
 *
 * Read the caveats in the report before believing any number: the sample is
 * a handful of periods, and the ticker list is today's list of survivors.
 *
 * Depends on window.MITPHistory._internals. Exposes window.MITPBacktest.
 */
(function () {
  'use strict';

  const T_STAT_CAP = 99;

  const DEFAULTS = {
    topN: 5,
    holdSessions: 21, // ~1 trading month
    warmupSessions: 252, // RS needs a year of history before the first pick
    costPct: 0.1, // round-trip cost charged on every rebalance, in percent
  };

  function internals() {
    const api = window.MITPHistory && window.MITPHistory._internals;
    if (!api) throw new Error('MITPHistory not loaded — backtest needs its ranking functions');
    return api;
  }

  function mean(xs) {
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  }

  function stdev(xs) {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
  }

  function compound(returns) {
    return returns.reduce((acc, r) => acc * (1 + r), 1) - 1;
  }

  function maxDrawdown(returns) {
    let equity = 1;
    let peak = 1;
    let worst = 0;
    for (const r of returns) {
      equity *= 1 + r;
      if (equity > peak) peak = equity;
      const dd = equity / peak - 1;
      if (dd < worst) worst = dd;
    }
    return worst;
  }

  /**
   * Put every ticker on the benchmark's trading calendar.
   *
   * Occasional missing days are forward-filled with the last known close
   * (no look-ahead — it only reuses a price already published). A ticker
   * whose history starts after the window does is dropped rather than
   * silently shortening the window for everyone.
   */
  function alignSeries(seriesMap, benchmarkTicker) {
    const bench = seriesMap[benchmarkTicker];
    if (!bench || !bench.dates?.length) {
      throw new Error(`no benchmark series for ${benchmarkTicker}`);
    }
    const axis = bench.dates.slice();
    const closes = {};
    const dropped = [];

    for (const [ticker, s] of Object.entries(seriesMap)) {
      if (ticker === benchmarkTicker) continue;
      if (!s?.dates?.length || s.dates[0] > axis[0]) {
        dropped.push(ticker); // listed later than the window starts
        continue;
      }
      const byDate = new Map();
      s.dates.forEach((d, i) => byDate.set(d, s.closes[i]));

      const out = [];
      let last = null;
      let cursor = 0;
      for (const d of axis) {
        // consume every bar at or before this axis date
        while (cursor < s.dates.length && s.dates[cursor] <= d) {
          last = s.closes[cursor];
          cursor++;
        }
        out.push(byDate.has(d) ? byDate.get(d) : last);
      }
      if (out.some((c) => !(c > 0))) dropped.push(ticker);
      else closes[ticker] = out;
    }

    return { dates: axis, closes, benchmark: bench.closes.slice(), dropped };
  }

  /** RS for every ticker using only closes up to and including index `t`. */
  function rankAt(panel, t) {
    const { statsFromCloses, rsScores } = internals();
    const universe = {};
    for (const [ticker, closes] of Object.entries(panel.closes)) {
      universe[ticker] = statsFromCloses(closes.slice(0, t + 1), panel.dates[t]);
    }
    const benchStats = statsFromCloses(panel.benchmark.slice(0, t + 1), panel.dates[t]);
    return rsScores(universe, benchStats).rs;
  }

  function ret(series, from, to) {
    const a = series[from];
    const b = series[to];
    if (!(a > 0) || !(b > 0)) return null;
    return b / a - 1;
  }

  /**
   * Run the walk-forward test over an aligned panel.
   * Every period: rank with data up to t, hold the top N for holdSessions.
   */
  function run(panel, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    const tickers = Object.keys(panel.closes);
    const n = panel.dates.length;
    const cost = opts.costPct / 100;

    if (tickers.length < 2) throw new Error('need at least 2 tickers');
    if (n <= opts.warmupSessions + opts.holdSessions) {
      throw new Error(
        `not enough history: ${n} sessions, need more than ${opts.warmupSessions + opts.holdSessions}`
      );
    }

    const periods = [];
    for (let t = opts.warmupSessions; t + opts.holdSessions < n; t += opts.holdSessions) {
      const to = t + opts.holdSessions;
      const rs = rankAt(panel, t);

      const rets = {};
      for (const ticker of tickers) {
        const r = ret(panel.closes[ticker], t, to);
        if (r != null) rets[ticker] = r;
      }
      const investable = Object.keys(rets);
      if (investable.length < 2) continue;

      const picks = investable
        .filter((ticker) => Number.isFinite(rs[ticker]))
        .sort((a, b) => rs[b] - rs[a])
        .slice(0, opts.topN);
      if (!picks.length) continue;

      const strategy = mean(picks.map((ticker) => rets[ticker])) - cost;
      const universe = mean(investable.map((ticker) => rets[ticker]));
      const benchmark = ret(panel.benchmark, t, to);

      periods.push({
        fromDate: panel.dates[t],
        toDate: panel.dates[to],
        picks: picks.map((ticker) => ({ ticker, rs: rs[ticker], ret: rets[ticker] })),
        strategy,
        universe,
        benchmark,
      });
    }

    if (!periods.length) throw new Error('no complete holding periods in this window');

    const stratRets = periods.map((p) => p.strategy);
    const uniRets = periods.map((p) => p.universe);
    const benchRets = periods.map((p) => p.benchmark).filter((r) => r != null);
    const excessVsUniverse = periods.map((p) => p.strategy - p.universe);
    const excessVsBench = periods.filter((p) => p.benchmark != null).map((p) => p.strategy - p.benchmark);

    // How many standard errors the average edge sits from zero. Below ~2 the
    // result is indistinguishable from luck at this sample size. Clamped: a
    // degenerate series (identical periods, as in synthetic data) has a
    // numerically-zero variance that would otherwise print as 1e14.
    const tStat = (xs) => {
      const sd = stdev(xs);
      if (xs.length < 2 || !(sd > 0)) return 0;
      const t = mean(xs) / (sd / Math.sqrt(xs.length));
      return Math.max(-T_STAT_CAP, Math.min(T_STAT_CAP, t));
    };

    return {
      params: opts,
      tickers,
      dropped: panel.dropped,
      periods,
      sampleSize: periods.length,
      totals: {
        strategy: compound(stratRets),
        universe: compound(uniRets),
        benchmark: benchRets.length === periods.length ? compound(benchRets) : null,
      },
      perPeriod: {
        strategy: mean(stratRets),
        universe: mean(uniRets),
        benchmark: benchRets.length ? mean(benchRets) : null,
        best: Math.max(...stratRets),
        worst: Math.min(...stratRets),
      },
      excess: {
        vsUniverse: mean(excessVsUniverse),
        vsBenchmark: excessVsBench.length ? mean(excessVsBench) : null,
        winRateVsUniverse: excessVsUniverse.filter((x) => x > 0).length / excessVsUniverse.length,
        winRateVsBenchmark: excessVsBench.length
          ? excessVsBench.filter((x) => x > 0).length / excessVsBench.length
          : null,
        tStatVsUniverse: tStat(excessVsUniverse),
        tStatVsBenchmark: excessVsBench.length > 1 ? tStat(excessVsBench) : null,
      },
      maxDrawdown: {
        strategy: maxDrawdown(stratRets),
        universe: maxDrawdown(uniRets),
      },
    };
  }

  /** Fetch → align → run, for a plain list of tickers. */
  async function runForTickers(tickers, options = {}) {
    const history = window.MITPHistory;
    if (!history) throw new Error('MITPHistory not loaded');
    const benchmark = options.benchmark || history.BENCHMARK;
    const { series, failed } = await history.fetchSeries([...tickers, benchmark], {
      range: options.range || '5y',
      onProgress: options.onProgress || null,
    });
    if (!series[benchmark]) throw new Error(`could not load the ${benchmark} benchmark`);
    const panel = alignSeries(series, benchmark);
    const report = run(panel, options);
    report.benchmarkTicker = benchmark;
    report.failed = failed;
    report.windowFrom = panel.dates[0];
    report.windowTo = panel.dates[panel.dates.length - 1];
    return report;
  }

  /** The reasons a good-looking number here still is not a promise of profit. */
  function caveats(report) {
    const list = [
      `Вибірка — ${report.sampleSize} періодів. Це дуже мало: різниця нижче ~2 стандартних помилок (t) не відрізняється від випадковості.`,
      'Список тікерів — сьогоднішній. Компанії, що збанкрутували чи були делістовані, у ньому відсутні, тож результат завищений (survivorship bias).',
      'Перевіряється лише сигнал RS (ціновий). Фундаментальну частину скору перевірити не можна: Finnhub віддає лише поточні P/E, ROE й ріст, а не їх значення на минулу дату.',
      `Комісія/спред враховані як ${report.params.costPct}% за ребаланс. Реальні витрати, податки й прослизання можуть бути більшими.`,
      'Купівля за ціною закриття дня ребалансу — на практиці ви отримаєте іншу ціну.',
    ];
    if (report.dropped?.length) {
      list.push(`Пропущено через коротку історію: ${report.dropped.join(', ')}.`);
    }
    if (report.failed?.length) {
      list.push(`Не вдалося завантажити: ${report.failed.join(', ')}.`);
    }
    return list;
  }

  /** One-sentence verdict that refuses to overclaim. */
  function verdict(report) {
    const t = report.excess.tStatVsBenchmark ?? report.excess.tStatVsUniverse;
    const edge = report.excess.vsBenchmark ?? report.excess.vsUniverse;
    const ref = report.excess.vsBenchmark != null ? report.benchmarkTicker || 'бенчмарк' : 'середнє по списку';
    const edgePct = (edge * 100).toFixed(2);
    if (Math.abs(t) < 2) {
      return `Статистично значущої переваги немає: ${edgePct}% за період проти ${ref}, t=${t.toFixed(2)} — у межах випадковості на такій вибірці.`;
    }
    return edge > 0
      ? `На цьому проміжку сигнал випереджав ${ref} на ${edgePct}% за період (t=${t.toFixed(2)}). Це один історичний відрізок, а не прогноз.`
      : `На цьому проміжку сигнал програвав ${ref} на ${edgePct}% за період (t=${t.toFixed(2)}).`;
  }

  window.MITPBacktest = {
    DEFAULTS,
    alignSeries,
    rankAt,
    run,
    runForTickers,
    caveats,
    verdict,
    _internals: { mean, stdev, compound, maxDrawdown },
  };
})();
