/**
 * Day-trading journal statistics — pure functions, no DOM, no storage.
 *
 * Everything is measured in R: one R is the money you decided to lose if the
 * stop is hit. A trader who risks $50 and makes $100 is +2R whether the account
 * is $500 or $50,000, so R is the only unit in which trades compare to each
 * other and the only one in which an edge is visible.
 *
 * Loaded as a plain script in the browser (window.DTStats) and required by
 * test/daytrade-stats.test.js in node.
 */
(function (root) {
  'use strict';

  /** Money risked per share if the stop is hit. */
  function riskPerShare(trade) {
    const d = Math.abs(Number(trade.entry) - Number(trade.stop));
    return Number.isFinite(d) && d > 0 ? d : null;
  }

  /** Profit per share, signed by direction. */
  function pnlPerShare(trade) {
    const entry = Number(trade.entry);
    const exit = Number(trade.exit);
    if (!Number.isFinite(entry) || !Number.isFinite(exit)) return null;
    return trade.side === 'short' ? entry - exit : exit - entry;
  }

  /** Realised money, fees included. */
  function pnlMoney(trade) {
    const per = pnlPerShare(trade);
    const qty = Number(trade.qty);
    if (per == null || !Number.isFinite(qty)) return null;
    return per * qty - (Number(trade.fees) || 0);
  }

  /**
   * The trade's result in R. Fees are charged against the risk too — a
   * commission-heavy scalp that "broke even" on price did not break even.
   */
  function rMultiple(trade) {
    const risk = riskPerShare(trade);
    const per = pnlPerShare(trade);
    const qty = Number(trade.qty);
    if (risk == null || per == null) return null;
    if (Number.isFinite(qty) && qty > 0) {
      const money = per * qty - (Number(trade.fees) || 0);
      return money / (risk * qty);
    }
    return per / risk;
  }

  /** A trade counts once it has an exit; open positions stay out of the stats. */
  function isClosed(trade) {
    return trade && trade.exit !== '' && trade.exit != null && Number.isFinite(Number(trade.exit));
  }

  function mean(xs) {
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  }

  function stdev(xs) {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
  }

  /** Cumulative R after each trade — the equity curve, in R. */
  function equityCurve(rs) {
    let sum = 0;
    return rs.map((r) => (sum += r));
  }

  /** Deepest peak-to-trough fall of the cumulative-R curve, as a negative number. */
  function maxDrawdownR(rs) {
    let sum = 0;
    let peak = 0;
    let worst = 0;
    for (const r of rs) {
      sum += r;
      if (sum > peak) peak = sum;
      const dd = sum - peak;
      if (dd < worst) worst = dd;
    }
    return worst;
  }

  /** Longest run of consecutive losers — what actually breaks people. */
  function longestLossStreak(rs) {
    let run = 0;
    let worst = 0;
    for (const r of rs) {
      run = r < 0 ? run + 1 : 0;
      if (run > worst) worst = run;
    }
    return worst;
  }

  const T_CAP = 99;

  /** How many standard errors the average R sits from zero. */
  function tStat(rs) {
    const sd = stdev(rs);
    if (rs.length < 2 || !(sd > 0)) return 0;
    const t = mean(rs) / (sd / Math.sqrt(rs.length));
    return Math.max(-T_CAP, Math.min(T_CAP, t));
  }

  /**
   * Full summary over a list of trades. Open trades are ignored; trades with an
   * unusable stop (no risk defined) cannot be scored in R and are counted
   * separately rather than silently dropped.
   */
  function summarise(trades) {
    const closed = (trades || []).filter(isClosed);
    const scored = [];
    let unscorable = 0;
    let money = 0;

    for (const t of closed) {
      const r = rMultiple(t);
      const m = pnlMoney(t);
      if (Number.isFinite(m)) money += m;
      if (r == null || !Number.isFinite(r)) unscorable++;
      else scored.push({ trade: t, r });
    }

    const rs = scored.map((s) => s.r);
    const wins = scored.filter((s) => s.r > 0);
    const losses = scored.filter((s) => s.r < 0);
    const grossWin = wins.reduce((a, s) => a + s.r, 0);
    const grossLoss = Math.abs(losses.reduce((a, s) => a + s.r, 0));

    return {
      count: rs.length,
      openCount: (trades || []).length - closed.length,
      unscorable,
      wins: wins.length,
      losses: losses.length,
      breakeven: scored.filter((s) => s.r === 0).length,
      winRate: rs.length ? wins.length / rs.length : 0,
      expectancy: mean(rs), // average R per trade — the number that matters
      avgWin: wins.length ? mean(wins.map((s) => s.r)) : 0,
      avgLoss: losses.length ? mean(losses.map((s) => s.r)) : 0,
      totalR: rs.reduce((a, r) => a + r, 0),
      totalMoney: money,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
      maxDrawdownR: maxDrawdownR(rs),
      longestLossStreak: longestLossStreak(rs),
      best: rs.length ? Math.max(...rs) : 0,
      worst: rs.length ? Math.min(...rs) : 0,
      tStat: tStat(rs),
      curve: equityCurve(rs),
      rs,
    };
  }

  /** Same summary, split by any key — setup tag, rule compliance, side… */
  function groupBy(trades, keyFn) {
    const buckets = new Map();
    for (const t of trades || []) {
      const key = keyFn(t);
      if (key == null || key === '') continue;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(t);
    }
    return [...buckets.entries()]
      .map(([key, list]) => ({ key, ...summarise(list) }))
      .filter((g) => g.count > 0)
      .sort((a, b) => b.expectancy - a.expectancy);
  }

  /**
   * What the numbers are allowed to claim. Trading results are noisy enough
   * that a positive average over a few dozen trades is routinely luck, so the
   * sample size gates the wording rather than decorating it.
   */
  function verdict(summary) {
    const n = summary.count;
    if (n === 0) {
      return { tone: 'neutral', headline: 'Ще немає закритих угод', detail: 'Додай перші угоди — статистика з’явиться сама.' };
    }
    const exp = summary.expectancy;
    const per100 = exp * 100;
    if (n < 30) {
      return {
        tone: 'neutral',
        headline: `${n} угод — замало для висновку`,
        detail: `Поточна експектансі ${fmtR(exp)} за угоду, але на такій вибірці це ще шум. Орієнтир — від 30–50 угод, і навіть тоді це лише орієнтир.`,
      };
    }
    if (Math.abs(summary.tStat) < 2) {
      return {
        tone: 'neutral',
        headline: 'Перевага статистично не доведена',
        detail: `Експектансі ${fmtR(exp)} за угоду (t=${summary.tStat.toFixed(2)}). Нижче |t|=2 результат не відрізняється від випадковості — ні в плюс, ні в мінус.`,
      };
    }
    if (exp > 0) {
      return {
        tone: 'good',
        headline: `Стабільний плюс: ${fmtR(exp)} за угоду`,
        detail: `t=${summary.tStat.toFixed(2)} на ${n} угодах. За 100 угод у такому ж режимі це ≈ ${fmtR(per100)}. Минулий результат не гарантує майбутнього.`,
      };
    }
    return {
      tone: 'critical',
      headline: `Стабільний мінус: ${fmtR(exp)} за угоду`,
      detail: `t=${summary.tStat.toFixed(2)} на ${n} угодах. Це не невезіння — за 100 таких угод втрата ≈ ${fmtR(per100)}. Варто зупинитись і розібрати, що саме не працює.`,
    };
  }

  function fmtR(r) {
    if (!Number.isFinite(r)) return '—';
    return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(2)}R`;
  }

  // ─── Position sizing ─────────────────────────────────────────────

  /**
   * How many shares keep the loss at the intended risk if the stop is hit.
   * Rounds down: rounding up quietly raises the risk above what was chosen.
   */
  function positionSize({ account, riskPct, entry, stop, target }) {
    const acc = Number(account);
    const pct = Number(riskPct);
    const e = Number(entry);
    const s = Number(stop);
    const perShare = Math.abs(e - s);

    if (!(acc > 0) || !(pct > 0) || !(e > 0) || !(s > 0) || !(perShare > 0)) return null;

    const riskBudget = (acc * pct) / 100;
    const shares = Math.floor(riskBudget / perShare);
    const riskMoney = shares * perShare;
    const positionValue = shares * e;
    const t = Number(target);
    const rr = Number.isFinite(t) && t > 0 ? Math.abs(t - e) / perShare : null;

    return {
      shares,
      perShare,
      riskBudget,
      riskMoney,
      positionValue,
      rr,
      side: s < e ? 'long' : 'short',
      // A position worth more than the account needs margin — flag, don't hide.
      needsMargin: positionValue > acc,
      targetMoney: rr != null ? riskMoney * rr : null,
    };
  }

  // ─── Daily limits ────────────────────────────────────────────────

  function sameDay(dateStr, dayStr) {
    return String(dateStr || '').slice(0, 10) === dayStr;
  }

  /**
   * Where today stands against the limits. Losing days compound when a trader
   * keeps going to "win it back", so the stop condition is explicit.
   */
  function dayStatus(trades, dayStr, limits) {
    const today = (trades || []).filter((t) => sameDay(t.date, dayStr));
    const closed = today.filter(isClosed);
    const rs = closed.map(rMultiple).filter((r) => r != null && Number.isFinite(r));
    const lossR = rs.reduce((a, r) => a + r, 0);
    const maxTrades = Number(limits?.maxTrades) || 0;
    const maxLossR = Number(limits?.maxLossR) || 0;

    const tradeLimitHit = maxTrades > 0 && today.length >= maxTrades;
    const lossLimitHit = maxLossR > 0 && lossR <= -Math.abs(maxLossR);

    return {
      trades: today.length,
      closed: closed.length,
      r: lossR,
      maxTrades,
      maxLossR,
      tradeLimitHit,
      lossLimitHit,
      shouldStop: tradeLimitHit || lossLimitHit,
      reason: lossLimitHit
        ? `Денний ліміт збитку вичерпано (${fmtR(lossR)} з ${fmtR(-Math.abs(maxLossR))}).`
        : tradeLimitHit
          ? `Ліміт угод на сьогодні вичерпано (${today.length} з ${maxTrades}).`
          : '',
    };
  }

  const api = {
    riskPerShare,
    pnlPerShare,
    pnlMoney,
    rMultiple,
    isClosed,
    summarise,
    groupBy,
    verdict,
    equityCurve,
    maxDrawdownR,
    longestLossStreak,
    tStat,
    positionSize,
    dayStatus,
    fmtR,
    _internals: { mean, stdev },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DTStats = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
