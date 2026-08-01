/**
 * Watchlist, Portfolio, Cache helpers for Multi-Investor Suite
 * Depends on window.MITP (set by index.html) and DOM views.
 */
(function () {
  'use strict';

  const CACHE_PREFIX = 'mitp_cache_';
  const KEY_WATCH = 'mitp_watchlist_v1';
  const KEY_PORT = 'mitp_portfolio_v1';
  const KEY_QUOTES = 'mitp_cache_quotes_v1';

  const TTL_PICKS = 8 * 60 * 1000;      // 8 min
  const TTL_ANALYZE = 8 * 60 * 1000;   // 8 min
  const TTL_QUOTES = 90 * 1000;        // 1.5 min

  // ─── tiny utils ───────────────────────────────────────────────────
  function M() { return window.MITP || {}; }
  function esc(s) {
    return M().escapeHtml ? M().escapeHtml(s) : String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function fmtP(p) { return M().formatPrice ? M().formatPrice(p) : `$${Number(p).toFixed(2)}`; }
  function fmtPct(p) { return M().formatPct ? M().formatPct(p) : `${p}%`; }
  function num(v, fb = 0) { return M().num ? M().num(v, fb) : (Number.isFinite(+v) ? +v : fb); }
  function toast(msg, type) {
    if (typeof M().showToast === 'function') M().showToast(msg, type);
  }

  // ─── Cache layer ──────────────────────────────────────────────────
  const Cache = {
    set(key, data, ttlMs) {
      try {
        localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
          t: Date.now(),
          ttl: ttlMs,
          data,
        }));
      } catch (_) { /* quota */ }
    },
    get(key) {
      try {
        const raw = localStorage.getItem(CACHE_PREFIX + key);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (!obj || obj.t == null) return null;
        if (Date.now() - obj.t > (obj.ttl || 0)) {
          localStorage.removeItem(CACHE_PREFIX + key);
          return null;
        }
        return obj.data;
      } catch (_) {
        return null;
      }
    },
    getStale(key) {
      // return even if expired (for instant paint + background refresh)
      try {
        const raw = localStorage.getItem(CACHE_PREFIX + key);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        return obj ? { data: obj.data, age: Date.now() - obj.t, expired: Date.now() - obj.t > (obj.ttl || 0) } : null;
      } catch (_) {
        return null;
      }
    },
    clearAll() {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
      // also quotes helper key
      localStorage.removeItem(KEY_QUOTES);
    },
    picksKey(horizon, styles, maxPrice) {
      const s = (styles || []).slice().sort().join(',');
      const m = maxPrice == null ? 'any' : String(maxPrice);
      return `picks_${horizon}_${s}_${m}`;
    },
    analyzeKey(ticker) {
      return `analyze_${String(ticker).toUpperCase()}`;
    },
    saveQuotes(map) {
      try {
        localStorage.setItem(KEY_QUOTES, JSON.stringify({ t: Date.now(), map }));
      } catch (_) {}
    },
    loadQuotes() {
      try {
        const obj = JSON.parse(localStorage.getItem(KEY_QUOTES) || 'null');
        if (!obj || !obj.map) return null;
        if (Date.now() - obj.t > TTL_QUOTES) return { map: obj.map, expired: true, t: obj.t };
        return { map: obj.map, expired: false, t: obj.t };
      } catch (_) {
        return null;
      }
    },
  };

  // ─── Watchlist ────────────────────────────────────────────────────
  function loadWatch() {
    try {
      const arr = JSON.parse(localStorage.getItem(KEY_WATCH) || '[]');
      return Array.isArray(arr) ? [...new Set(arr.map((t) => String(t).toUpperCase()))] : [];
    } catch (_) {
      return [];
    }
  }
  function saveWatch(list) {
    localStorage.setItem(KEY_WATCH, JSON.stringify(list));
  }
  function addWatch(ticker) {
    const t = String(ticker || '').toUpperCase().trim();
    if (!t) return false;
    const list = loadWatch();
    if (list.includes(t)) {
      toast(`${t} already in Watchlist`, 'warn');
      return false;
    }
    list.push(t);
    saveWatch(list);
    toast(`${t} added to Watchlist`, 'ok');
    renderWatchlist();
    updateWatchBadges();
    return true;
  }
  function removeWatch(ticker) {
    const t = String(ticker || '').toUpperCase();
    saveWatch(loadWatch().filter((x) => x !== t));
    toast(`${t} removed`, 'ok');
    renderWatchlist();
    updateWatchBadges();
  }

  let watchSort = { key: 'interest', dir: 'desc' };
  const KEY_GROK_REPLY = 'mitp_portfolio_grok_reply_v1';

  function getQuoteFor(ticker) {
    // Prefer live universe from MITP
    if (typeof M().getStock === 'function') {
      const s = M().getStock(ticker);
      if (s) return s;
    }
    const q = Cache.loadQuotes();
    if (q?.map?.[ticker]) {
      return {
        ticker,
        name: q.map[ticker].name || ticker,
        price: q.map[ticker].price,
        dayChangePct: q.map[ticker].dayChangePct,
        hasQuote: true,
        pe: 0, epsGrowth: 0, revGrowth: 0, rs: 50, roe: 0, innovation: 50, volatility: 40,
      };
    }
    return {
      ticker, name: ticker, price: 0, dayChangePct: 0, hasQuote: false,
      pe: 0, epsGrowth: 0, revGrowth: 0, rs: 50, roe: 0, innovation: 50, volatility: 40,
    };
  }

  /** Score 0–100: how interesting to research / consider next */
  function interestScore(stock) {
    const chg = num(stock.dayChangePct, 0);
    const rs = num(stock.rs, 50);
    const pe = num(stock.pe, 0);
    const growth = Math.max(num(stock.epsGrowth, 0), num(stock.revGrowth, 0));
    const inn = num(stock.innovation, 50);
    const roe = num(stock.roe, 0);
    const vol = num(stock.volatility, 40);

    let s = 40;
    // momentum / attention
    s += clamp(Math.abs(chg) * 2.2, 0, 18);
    if (chg > 0 && chg < 6) s += 6;
    if (chg > 10) s -= 4; // already hot
    s += clamp((rs - 50) * 0.35, -12, 16);
    // growth / innovation story
    s += clamp(growth * 0.35, 0, 18);
    s += clamp(inn * 0.12, 0, 12);
    s += clamp(roe * 0.12, -4, 10);
    // valuation intrigue
    if (pe > 0 && pe < 18 && growth > 8) s += 8;
    if (pe > 70 && growth < 12) s -= 8;
    // tradeable vol
    if (vol >= 25 && vol <= 65) s += 4;
    if (!stock.hasQuote) s -= 15;

    s = clamp(Math.round(s), 5, 98);
    let tier = 'Низька';
    if (s >= 72) tier = 'Висока';
    else if (s >= 55) tier = 'Середня+';
    else if (s >= 40) tier = 'Середня';

    const why = [];
    if (Math.abs(chg) >= 2) why.push(`день ${fmtPct(chg)}`);
    if (rs >= 65) why.push(`сильний RS ~${Math.round(rs)}`);
    if (growth >= 15) why.push(`growth ~${growth.toFixed(0)}%`);
    if (inn >= 80) why.push('висока innovation');
    if (pe > 0 && pe < 20) why.push(`P/E ${pe.toFixed(0)}`);
    if (!why.length) why.push(stock.hasQuote ? 'помірні сигнали — слідкувати' : 'немає live-даних — Connect Finnhub');

    return { score: s, tier, why: why.join(' · ') };
  }

  function clamp(n, a, b) {
    return M().clamp ? M().clamp(n, a, b) : Math.max(a, Math.min(b, n));
  }

  function renderWatchlist() {
    const root = document.getElementById('wl-list');
    const empty = document.getElementById('wl-empty');
    const count = document.getElementById('wl-count');
    if (!root) return;
    let list = loadWatch();
    if (count) count.textContent = `${list.length} tickers`;

    list = list.slice().sort((a, b) => {
      const sa = getQuoteFor(a);
      const sb = getQuoteFor(b);
      let av; let bv;
      if (watchSort.key === 'price') { av = sa.price; bv = sb.price; }
      else if (watchSort.key === 'change') { av = sa.dayChangePct; bv = sb.dayChangePct; }
      else if (watchSort.key === 'interest') {
        av = interestScore(sa).score;
        bv = interestScore(sb).score;
      } else { av = a; bv = b; }
      if (av < bv) return watchSort.dir === 'asc' ? -1 : 1;
      if (av > bv) return watchSort.dir === 'asc' ? 1 : -1;
      return 0;
    });

    if (!list.length) {
      root.innerHTML = '';
      empty?.classList.remove('hidden');
      return;
    }
    empty?.classList.add('hidden');

    root.innerHTML = list.map((t) => {
      const s = getQuoteFor(t);
      const interest = interestScore(s);
      const chgClass = s.dayChangePct > 0 ? 'text-emerald-400' : s.dayChangePct < 0 ? 'text-red-400' : 'text-slate-400';
      const tierColor =
        interest.tier === 'Висока' ? 'text-emerald-400' :
        interest.tier.startsWith('Середня') ? 'text-cyan-300' : 'text-slate-500';
      const barW = interest.score;
      return `
      <div class="glass rounded-xl p-4">
        <div class="flex flex-col sm:flex-row sm:items-start gap-3 justify-between">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-mono font-bold text-blue-300 text-lg">${esc(t)}</span>
              <span class="text-sm font-semibold text-emerald-400 tabular-nums" data-price-ticker="${esc(t)}">${s.hasQuote ? fmtP(s.price) : '—'}</span>
              <span class="text-xs tabular-nums font-medium ${chgClass}" data-chg-ticker="${esc(t)}">${s.hasQuote ? fmtPct(s.dayChangePct) : '—'}</span>
            </div>
            <p class="text-xs text-slate-500 truncate mt-0.5">${esc(s.name || t)}</p>
            <div class="mt-3 rounded-xl bg-surface-900/70 border border-white/5 p-3">
              <div class="flex items-center justify-between gap-2 mb-1">
                <span class="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Score цікавості</span>
                <span class="text-sm font-bold tabular-nums ${tierColor}">${interest.score}<span class="text-slate-500 text-xs font-medium">/100</span></span>
              </div>
              <div class="h-1.5 rounded-full bg-surface-700 overflow-hidden mb-1.5">
                <div class="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400" style="width:${barW}%"></div>
              </div>
              <div class="text-[11px] ${tierColor} font-semibold mb-0.5">${esc(interest.tier)} цікавість для розгляду</div>
              <p class="text-[11px] text-slate-500 leading-relaxed">${esc(interest.why)}</p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2 shrink-0">
            <button type="button" data-wl-analyze="${esc(t)}" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white">Analyze</button>
            <button type="button" data-wl-remove="${esc(t)}" class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-500/30 text-red-300 hover:bg-red-500/10">Remove</button>
          </div>
        </div>
      </div>`;
    }).join('');

    root.querySelectorAll('[data-wl-remove]').forEach((btn) => {
      btn.addEventListener('click', () => removeWatch(btn.getAttribute('data-wl-remove')));
    });
    root.querySelectorAll('[data-wl-analyze]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (typeof M().openAnalyzer === 'function') M().openAnalyzer(btn.getAttribute('data-wl-analyze'));
      });
    });
  }

  function updateWatchBadges() {
    const set = new Set(loadWatch());
    document.querySelectorAll('[data-watch-ticker]').forEach((btn) => {
      const t = btn.getAttribute('data-watch-ticker');
      const on = set.has(t);
      btn.textContent = on ? '★ Watch' : '+ Watch';
      btn.classList.toggle('opacity-70', on);
      btn.dataset.inWatch = on ? '1' : '0';
    });
  }

  // ─── Portfolio ────────────────────────────────────────────────────
  function loadPort() {
    try {
      const arr = JSON.parse(localStorage.getItem(KEY_PORT) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }
  function savePort(list) {
    localStorage.setItem(KEY_PORT, JSON.stringify(list));
  }

  function addPosition(ticker, shares, avgPrice) {
    const t = String(ticker || '').toUpperCase().trim();
    const sh = num(shares, 0);
    const ap = num(avgPrice, 0);
    if (!t || sh <= 0 || ap <= 0) {
      toast('Enter ticker, shares > 0, avg price > 0', 'warn');
      return false;
    }
    const list = loadPort();
    const existing = list.find((p) => p.ticker === t);
    if (existing) {
      // average in
      const totalSh = existing.shares + sh;
      existing.avgPrice = (existing.shares * existing.avgPrice + sh * ap) / totalSh;
      existing.shares = totalSh;
    } else {
      list.push({ ticker: t, shares: sh, avgPrice: ap, addedAt: Date.now() });
    }
    savePort(list);
    toast(`${t} position saved`, 'ok');
    renderPortfolio();
    return true;
  }

  function removePosition(ticker) {
    savePort(loadPort().filter((p) => p.ticker !== String(ticker).toUpperCase()));
    toast(`${ticker} removed from portfolio`, 'ok');
    renderPortfolio();
  }

  /** Per-position strategy: hold/trim/sell, SL, when to sell */
  function positionStrategy(p, q, totalValue) {
    const price = q.hasQuote ? q.price : 0;
    const cost = p.shares * p.avgPrice;
    const value = price > 0 ? p.shares * price : 0;
    const pnlPct = cost > 0 && price > 0 ? ((value - cost) / cost) * 100 : 0;
    const chg = num(q.dayChangePct, 0);
    const weight = totalValue > 0 && value > 0 ? (value / totalValue) * 100 : 0;
    const atrProxy = price * (0.015 + clamp(num(q.volatility, 40) / 100 * 0.04, 0, 0.04));

    let action = 'HOLD';
    let actionClass = 'rec-wait';
    const reasons = [];
    let whenSell = 'Тримай, поки тренд/теза живі; переглянь після earnings або break SL.';
    let sl = price > 0 ? price - atrProxy * 1.8 : p.avgPrice * 0.92;
    let tp1 = price > 0 ? price + atrProxy * 2 : p.avgPrice * 1.12;
    let tp2 = price > 0 ? price + atrProxy * 3.5 : p.avgPrice * 1.22;

    // Protect gains
    if (pnlPct >= 25) {
      action = 'TRIM';
      actionClass = 'rec-wait';
      reasons.push(`великий профіт +${pnlPct.toFixed(1)}% — зафіксуй 20–40% позиції`);
      whenSell = 'Продай частково зараз; trailing stop на решту під останній swing low.';
      sl = Math.max(sl, p.avgPrice * 1.05); // lock some gain
    } else if (pnlPct >= 12) {
      action = 'HOLD+';
      actionClass = 'rec-buy';
      reasons.push(`хороший профіт +${pnlPct.toFixed(1)}% — можна підтягнути SL до беззбитку/плюс`);
      sl = Math.max(sl, p.avgPrice * 1.01);
      whenSell = 'Продавай на сильному climax day (+8%+) або якщо закриється тиждень нижче EMA/структури.';
    }

    // Cut losers
    if (pnlPct <= -15) {
      action = 'REVIEW / SELL';
      actionClass = 'rec-avoid';
      reasons.push(`збиток ${pnlPct.toFixed(1)}% — перевір тезу; часто краще cut або hard SL`);
      whenSell = 'Якщо теза зламана — продай зараз. Інакше жорсткий SL і не усереднюй без плану.';
      sl = Math.min(sl, price * 0.97);
    } else if (pnlPct <= -8) {
      action = 'TIGHTEN';
      actionClass = 'rec-wait';
      reasons.push(`просадка ${pnlPct.toFixed(1)}% — звузь ризик, не докуповуй емоційно`);
      whenSell = 'Продай якщо пробиє SL або з’являться bad news / breakdown на volume.';
    }

    // Concentration
    if (weight >= 35) {
      reasons.push(`частка ~${weight.toFixed(0)}% портфеля — надмірна концентрація, розглянь trim`);
      if (action === 'HOLD' || action === 'HOLD+') {
        action = 'TRIM';
        actionClass = 'rec-wait';
      }
    }

    // Day volatility
    if (chg <= -5 && pnlPct < 5) {
      reasons.push(`різкий день ${fmtPct(chg)} — не панікуй market sell; чекай close / рівень`);
    }
    if (chg >= 7 && pnlPct > 5) {
      reasons.push(`сильний spike ${fmtPct(chg)} — можна scale-out 10–25%`);
      if (action === 'HOLD' || action === 'HOLD+') action = 'TRIM';
    }

    if (!reasons.length) {
      reasons.push('немає критичних сигналів — базова стратегія hold з SL');
    }

    // Protective SL relative to avg
    if (price > 0 && sl >= price) sl = price * 0.97;
    if (price > 0 && tp1 <= price) tp1 = price * 1.04;
    if (price > 0 && tp2 <= tp1) tp2 = tp1 * 1.06;

    const plan = [
      `Дія: ${action}`,
      `Stop Loss (орієнтир): ${price > 0 ? fmtP(sl) : 'н/д'} — нижче структури / ~1.5–2×ATR proxy`,
      `Take Profit 1: ${price > 0 ? fmtP(tp1) : 'н/д'} (частково)`,
      `Take Profit 2: ${price > 0 ? fmtP(tp2) : 'н/д'} (залишок / trail)`,
      `Коли продавати: ${whenSell}`,
    ];

    // Merge saved Grok overrides (user-pasted reply) so SL/TP/action actually update
    const g = p.grokOverride;
    let source = 'local';
    if (g && (g.sl || g.tp1 || g.tp2 || g.action || g.whenSell)) {
      source = 'grok';
      if (g.action) {
        action = String(g.action).toUpperCase();
        if (/SELL|ПРОДА/.test(action)) actionClass = 'rec-avoid';
        else if (/TRIM|ЧАСТ|SCALE/.test(action)) actionClass = 'rec-wait';
        else if (/HOLD|ТРИМ|ADD|ДОКУП/.test(action)) actionClass = 'rec-buy';
        else actionClass = 'rec-wait';
      }
      if (num(g.sl, 0) > 0) sl = num(g.sl);
      if (num(g.tp1, 0) > 0) tp1 = num(g.tp1);
      if (num(g.tp2, 0) > 0) tp2 = num(g.tp2);
      if (g.whenSell) whenSell = g.whenSell;
      reasons.unshift('Оновлено з відповіді Grok (збережені рівні/дія)');
    }

    return {
      action,
      actionClass,
      reasons,
      whenSell,
      sl,
      tp1,
      tp2,
      weight,
      plan,
      summary: reasons[0],
      source,
    };
  }

  function portfolioLevelRecs(enriched) {
    const recs = [];
    if (!enriched.length) {
      return ['Додай позиції, щоб отримати рекомендації по змінах.'];
    }
    const totalValue = enriched.reduce((s, x) => s + x.value, 0);
    const totalCost = enriched.reduce((s, x) => s + x.cost, 0);
    const totalPnlPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;

    const heavy = enriched.filter((x) => x.weight >= 30);
    if (heavy.length) {
      recs.push(`Концентрація: ${heavy.map((x) => x.ticker).join(', ')} ≥30% портфеля — розглянь ребаланс (trim).`);
    }
    if (enriched.length === 1) {
      recs.push('Лише 1 позиція — високий idiosyncratic risk. Додай 2–4 некорельовані ідеї або зменш size.');
    }
    const losers = enriched.filter((x) => x.pnlPct <= -12);
    if (losers.length) {
      recs.push(`Під тиском: ${losers.map((x) => `${x.ticker} (${x.pnlPct.toFixed(1)}%)`).join(', ')} — review тези / SL, не усереднюй сліпо.`);
    }
    const winners = enriched.filter((x) => x.pnlPct >= 20);
    if (winners.length) {
      recs.push(`Сильні переможці: ${winners.map((x) => x.ticker).join(', ')} — зафіксуй частину прибутку, trailing stop.`);
    }
    if (totalPnlPct >= 15) {
      recs.push(`Портфель у плюсі ~${totalPnlPct.toFixed(1)}% — можна підняти cash buffer (5–15%) після trim.`);
    } else if (totalPnlPct <= -10) {
      recs.push(`Портфель у мінусі ~${totalPnlPct.toFixed(1)}% — зменш ризик: менше нових buys, жорсткі SL, без revenge trading.`);
    }
    const noPrice = enriched.filter((x) => !x.hasPrice);
    if (noPrice.length) {
      recs.push(`Немає live-ціни: ${noPrice.map((x) => x.ticker).join(', ')} — Connect Finnhub для точного P&L.`);
    }
    if (!recs.length) {
      recs.push('Портфель збалансований за локальними правилами. Тримай дисципліну SL/TP на кожній позиції.');
    }
    recs.push('Освітні підказки, не індивідуальна фінансова порада.');
    return recs;
  }

  function buildPortfolioGrokPrompt(enriched, totalValue, totalCost, totalPnl, totalPnlPct) {
    const lines = enriched.map((x, i) => {
      const st = x.strategy;
      return `${i + 1}. ${x.ticker}
   Shares: ${x.shares} | Avg: ${fmtP(x.avgPrice)} | Price: ${x.hasPrice ? fmtP(x.price) : 'n/a'} | Day: ${x.hasPrice ? fmtPct(x.dayChangePct) : 'n/a'}
   Value: ${x.hasPrice ? fmtP(x.value) : 'n/a'} | Cost: ${fmtP(x.cost)} | P&L: ${x.hasPrice ? fmtPct(x.pnlPct) : 'n/a'} | Weight: ${x.weight.toFixed(1)}%
   Local action: ${st.action} | SL≈${x.hasPrice ? fmtP(st.sl) : 'n/a'} | TP1≈${x.hasPrice ? fmtP(st.tp1) : 'n/a'} | TP2≈${x.hasPrice ? fmtP(st.tp2) : 'n/a'}
   Notes: ${st.reasons.join('; ')}`;
    }).join('\n\n');

    return `Ти — портфельний стратег і ризик-менеджер. Проаналізуй мій портфель і дай конкретний план дій українською.

## Зведення
- Позицій: ${enriched.length}
- Ринкова вартість: ${fmtP(totalValue)}
- Собівартість: ${fmtP(totalCost)}
- Нереалізований P&L: ${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toFixed(2)} (${fmtPct(totalPnlPct)})

## Позиції
${lines || '(порожньо)'}

## Завдання
1. Загальна оцінка портфеля (ризик, концентрація, якість).
2. Що змінити найближчим часом (trim / add / close) — з пріоритетами.
3. По КОЖНІЙ позиції:
   - Hold / Trim / Sell / Add
   - Точний Stop Loss ($) і чому
   - Take Profit 1 і 2
   - Коли продавати (тригери)
4. Ризик-менеджмент: max % на 1 ідею, cash buffer.
5. Короткий план на 7 днів.

## Обов'язковий структурований блок (в кінці відповіді)
Додай таблицю рівнів у ТОЧНО такому форматі (один рядок на тікер):

STRUCTURED_START
TICKER|ACTION|SL|TP1|TP2|WHEN_SELL
${enriched.map((x) => `${x.ticker}|HOLD|0|0|0|`).join('\n')}
STRUCTURED_END

ACTION = HOLD або TRIM або SELL або ADD. SL/TP1/TP2 = числа в USD (без $).
Заповни реальними числами. Без цього блок додаток не зможе оновити рівні на картках.

Будь конкретним, з цифрами. Це освітній розбір, не персональна фінпорада.`;
  }

  function parseMoneyToken(str) {
    if (str == null) return null;
    const s = String(str).replace(/,/g, '').replace(/\s/g, '');
    const m = s.match(/-?\$?(\d+(?:\.\d+)?)/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function normalizeAction(raw) {
    const a = String(raw || '').trim().toUpperCase();
    if (/SELL|ПРОДА|ЗАКРИ|CLOSE|EXIT/.test(a)) return 'SELL';
    if (/TRIM|ЧАСТ|SCALE\s*OUT|REDUCE|ЗМЕНШ/.test(a)) return 'TRIM';
    if (/ADD|ДОКУП|BUY\s*MORE|УСЕРЕД/.test(a)) return 'ADD';
    if (/HOLD|ТРИМ|ТРИМАТИ|KEEP/.test(a)) return 'HOLD';
    if (a) return a.slice(0, 16);
    return null;
  }

  /**
   * Parse Grok reply into per-ticker overrides { TICKER: { action, sl, tp1, tp2, whenSell } }
   */
  function parseGrokOverrides(text, tickers) {
    const raw = String(text || '');
    const overrides = {};
    const tset = (tickers || []).map((t) => String(t).toUpperCase());

    // 1) Structured block (most reliable)
    const structured = raw.match(/STRUCTURED_START([\s\S]*?)STRUCTURED_END/i);
    if (structured) {
      structured[1].split(/\r?\n/).forEach((line) => {
        const ln = line.trim();
        if (!ln || /^TICKER\|/i.test(ln) || ln.startsWith('#')) return;
        const parts = ln.split('|').map((p) => p.trim());
        if (parts.length < 5) return;
        const ticker = parts[0].toUpperCase();
        if (!tset.includes(ticker) && tset.length) {
          // still accept if looks like ticker
          if (!/^[A-Z.]{1,6}$/.test(ticker)) return;
        }
        const action = normalizeAction(parts[1]);
        const sl = parseMoneyToken(parts[2]);
        const tp1 = parseMoneyToken(parts[3]);
        const tp2 = parseMoneyToken(parts[4]);
        const whenSell = parts.slice(5).join('|').trim() || null;
        if (!overrides[ticker]) overrides[ticker] = {};
        if (action) overrides[ticker].action = action;
        if (sl) overrides[ticker].sl = sl;
        if (tp1) overrides[ticker].tp1 = tp1;
        if (tp2) overrides[ticker].tp2 = tp2;
        if (whenSell) overrides[ticker].whenSell = whenSell;
      });
    }

    // 2) Free-text per ticker chunks
    tset.forEach((ticker) => {
      const re = new RegExp(`(?:^|\\n)[^\\n]{0,40}\\b${ticker}\\b([\\s\\S]{0,900})`, 'gi');
      let m;
      let chunk = '';
      while ((m = re.exec(raw)) !== null) {
        const c = (m[0] || '') + (m[1] || '');
        if (c.length > chunk.length) chunk = c;
      }
      if (!chunk) {
        // fallback: any window around ticker
        const idx = raw.toUpperCase().indexOf(ticker);
        if (idx >= 0) chunk = raw.slice(Math.max(0, idx - 40), idx + 700);
      }
      if (!chunk) return;
      if (!overrides[ticker]) overrides[ticker] = {};
      const o = overrides[ticker];

      const slM =
        chunk.match(/(?:stop\s*loss|стоп[-\s]?лос[с]?|\bSL\b)\s*[:#\-]?\s*\$?\s*(\d+(?:[.,]\d+)?)/i) ||
        chunk.match(/(?:stop\s*loss|SL)\s*[—–-]\s*\$?\s*(\d+(?:[.,]\d+)?)/i);
      const tp1M =
        chunk.match(/(?:take\s*profit\s*1|тейк\s*профіт\s*1|\bTP\s*1\b|\bTP1\b)\s*[:#\-]?\s*\$?\s*(\d+(?:[.,]\d+)?)/i);
      const tp2M =
        chunk.match(/(?:take\s*profit\s*2|тейк\s*профіт\s*2|\bTP\s*2\b|\bTP2\b)\s*[:#\-]?\s*\$?\s*(\d+(?:[.,]\d+)?)/i);
      // also "TP1/TP2: 10 / 12"
      const tpBoth = chunk.match(/\bTP\s*1?\s*\/\s*TP\s*2\b\s*[:#]?\s*\$?\s*(\d+(?:[.,]\d+)?)\s*[\/|]\s*\$?\s*(\d+(?:[.,]\d+)?)/i);

      if (slM && !o.sl) o.sl = parseMoneyToken(slM[1]);
      if (tp1M && !o.tp1) o.tp1 = parseMoneyToken(tp1M[1]);
      if (tp2M && !o.tp2) o.tp2 = parseMoneyToken(tp2M[1]);
      if (tpBoth) {
        if (!o.tp1) o.tp1 = parseMoneyToken(tpBoth[1]);
        if (!o.tp2) o.tp2 = parseMoneyToken(tpBoth[2]);
      }

      if (!o.action) {
        const actM = chunk.match(/\b(HOLD\+?|TRIM|SELL|ADD|ТРИМАТИ|ПРОДАТИ|ПРОДАЙ|ЗМЕНШИТИ|ДОКУПИТИ|SCALE\s*OUT)\b/i);
        if (actM) o.action = normalizeAction(actM[1]);
      }

      if (!o.whenSell) {
        const whenM = chunk.match(/(?:коли продавати|when to sell|sell when|тригер[и]?)\s*[:#\-]?\s*([^\n]{10,160})/i);
        if (whenM) o.whenSell = whenM[1].trim();
      }
    });

    // drop empty
    Object.keys(overrides).forEach((k) => {
      const o = overrides[k];
      if (!o.sl && !o.tp1 && !o.tp2 && !o.action && !o.whenSell) delete overrides[k];
    });
    return overrides;
  }

  /** Apply parsed Grok levels onto portfolio positions in localStorage */
  function applyGrokOverridesToPortfolio(text) {
    const list = loadPort();
    const tickers = list.map((p) => p.ticker);
    const parsed = parseGrokOverrides(text, tickers);
    let applied = 0;
    const details = [];

    list.forEach((p) => {
      const o = parsed[p.ticker];
      if (!o) return;
      p.grokOverride = {
        action: o.action || null,
        sl: o.sl || null,
        tp1: o.tp1 || null,
        tp2: o.tp2 || null,
        whenSell: o.whenSell || null,
        at: Date.now(),
      };
      applied += 1;
      details.push({
        ticker: p.ticker,
        action: p.grokOverride.action,
        sl: p.grokOverride.sl,
        tp1: p.grokOverride.tp1,
        tp2: p.grokOverride.tp2,
      });
    });

    savePort(list);
    return { applied, details, parsed, tickers };
  }

  function clearGrokOverrides() {
    const list = loadPort();
    list.forEach((p) => { delete p.grokOverride; });
    savePort(list);
  }

  function processGrokReply(text) {
    const raw = String(text || '').trim();
    if (!raw) return { bullets: [], actions: [], levels: [], overrides: {} };

    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const bullets = lines.filter((l) => /^[-*•]|\d+\./.test(l)).slice(0, 24);
    const actions = [];
    const levels = [];
    const actionRe = /\b(hold|trim|sell|buy|add|закри(й|ти)|трим|прода(й|ти)|тримай|докупо)\b/i;
    const moneyRe = /\$\s?\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*%/g;

    lines.forEach((l) => {
      if (actionRe.test(l)) actions.push(l);
      const m = l.match(moneyRe);
      if (m && /stop|sl|tp|take|profit|loss|стоп|тейк/i.test(l)) {
        levels.push(l);
      }
    });

    const tickers = loadPort().map((p) => p.ticker);
    const overrides = parseGrokOverrides(raw, tickers);

    return {
      bullets: bullets.length ? bullets : lines.slice(0, 12),
      actions: actions.slice(0, 12),
      levels: levels.slice(0, 12),
      overrides,
    };
  }

  function renderGrokParsed(text, applyResult) {
    const box = document.getElementById('pf-grok-parsed');
    if (!box) return;
    const p = processGrokReply(text);
    if (!text.trim()) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    const ov = applyResult?.details || Object.entries(p.overrides || {}).map(([ticker, o]) => ({ ticker, ...o }));
    box.classList.remove('hidden');
    box.innerHTML = `
      <div class="text-[10px] uppercase tracking-wide text-emerald-400 font-semibold">Застосовано з Grok до карток</div>
      ${ov.length ? `
        <div class="overflow-x-auto">
          <table class="w-full text-[11px] text-left min-w-[320px]">
            <thead class="text-slate-500">
              <tr><th class="py-1 pr-2">Ticker</th><th class="py-1 pr-2">Action</th><th class="py-1 pr-2">SL</th><th class="py-1 pr-2">TP1</th><th class="py-1 pr-2">TP2</th></tr>
            </thead>
            <tbody>
              ${ov.map((r) => `
                <tr class="border-t border-white/5 text-slate-200">
                  <td class="py-1 pr-2 font-mono text-blue-300">${esc(r.ticker)}</td>
                  <td class="py-1 pr-2">${esc(r.action || '—')}</td>
                  <td class="py-1 pr-2 font-mono">${r.sl ? fmtP(r.sl) : '—'}</td>
                  <td class="py-1 pr-2 font-mono">${r.tp1 ? fmtP(r.tp1) : '—'}</td>
                  <td class="py-1 pr-2 font-mono">${r.tp2 ? fmtP(r.tp2) : '—'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : `<p class="text-amber-300/90">Не знайдено рівнів для твоїх тікерів. Попроси Grok додати блок STRUCTURED_START … STRUCTURED_END (див. промпт).</p>`}
      ${p.actions.length ? `<div><span class="text-amber-300 font-semibold">Дії з тексту:</span><ul class="list-disc list-inside mt-1 space-y-0.5">${p.actions.slice(0, 8).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      <p class="text-[10px] text-slate-600">Картки позицій оновлюються з бейджем «from Grok». Clear saved reply — скинути оверрайди.</p>`;
  }

  function renderPortfolio() {
    const root = document.getElementById('pf-list');
    const empty = document.getElementById('pf-empty');
    const sumEl = document.getElementById('pf-summary');
    const recsEl = document.getElementById('pf-recs');
    if (!root) return;

    const list = loadPort();
    if (!list.length) {
      root.innerHTML = '';
      empty?.classList.remove('hidden');
      if (sumEl) {
        sumEl.innerHTML = `<div class="text-slate-500 text-sm">Portfolio empty — add a position below.</div>`;
      }
      if (recsEl) {
        recsEl.innerHTML = '<li class="text-slate-500">Додай позиції, щоб побачити рекомендації.</li>';
      }
      return;
    }
    empty?.classList.add('hidden');

    // First pass values for weights
    let totalCost = 0;
    let totalValue = 0;
    const enriched = list.map((p) => {
      const q = getQuoteFor(p.ticker);
      const price = q.hasQuote ? q.price : 0;
      const cost = p.shares * p.avgPrice;
      const value = price > 0 ? p.shares * price : 0;
      const pnl = price > 0 ? value - cost : 0;
      const pnlPct = cost > 0 && price > 0 ? (pnl / cost) * 100 : 0;
      totalCost += cost;
      if (price > 0) totalValue += value;
      return {
        ...p,
        q,
        price,
        cost,
        value,
        pnl,
        pnlPct,
        hasPrice: price > 0,
        dayChangePct: q.dayChangePct,
        weight: 0,
        strategy: null,
      };
    });
    enriched.forEach((x) => {
      x.weight = totalValue > 0 && x.value > 0 ? (x.value / totalValue) * 100 : 0;
      x.strategy = positionStrategy(x, x.q, totalValue);
    });

    const totalPnl = totalValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    const totClass = totalPnl > 0 ? 'text-emerald-400' : totalPnl < 0 ? 'text-red-400' : 'text-slate-300';

    if (sumEl) {
      sumEl.innerHTML = `
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="metric-chip">
            <div class="text-[10px] uppercase text-slate-500 mb-0.5">Positions</div>
            <div class="text-lg font-bold text-white">${list.length}</div>
          </div>
          <div class="metric-chip">
            <div class="text-[10px] uppercase text-slate-500 mb-0.5">Total value</div>
            <div class="text-lg font-bold text-emerald-400 tabular-nums" id="pf-total-value">${fmtP(totalValue)}</div>
          </div>
          <div class="metric-chip">
            <div class="text-[10px] uppercase text-slate-500 mb-0.5">Total P&L $</div>
            <div class="text-lg font-bold tabular-nums ${totClass}" id="pf-total-pnl">${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toFixed(2)}</div>
          </div>
          <div class="metric-chip">
            <div class="text-[10px] uppercase text-slate-500 mb-0.5">Total P&L %</div>
            <div class="text-lg font-bold tabular-nums ${totClass}" id="pf-total-pnlpc">${fmtPct(totalPnlPct)}</div>
          </div>
        </div>`;
    }

    if (recsEl) {
      const recs = portfolioLevelRecs(enriched);
      recsEl.innerHTML = recs.map((r) => `
        <li class="flex gap-2 items-start">
          <span class="text-emerald-400 mt-0.5">▸</span>
          <span class="leading-relaxed">${esc(r)}</span>
        </li>`).join('');
    }

    // stash for grok
    window.__pfSnapshot = { enriched, totalValue, totalCost, totalPnl, totalPnlPct };

    root.innerHTML = enriched.map((x) => {
      const pnlClass = x.pnl > 0 ? 'text-emerald-400' : x.pnl < 0 ? 'text-red-400' : 'text-slate-400';
      const chgClass = x.dayChangePct > 0 ? 'text-emerald-400' : x.dayChangePct < 0 ? 'text-red-400' : 'text-slate-400';
      const st = x.strategy;
      return `
      <div class="glass rounded-xl p-4">
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-mono font-bold text-blue-300 text-lg">${esc(x.ticker)}</span>
              <span class="text-sm font-semibold text-emerald-400 tabular-nums" data-price-ticker="${esc(x.ticker)}">${x.hasPrice ? fmtP(x.price) : '—'}</span>
              <span class="text-xs tabular-nums ${chgClass}" data-chg-ticker="${esc(x.ticker)}">${x.hasPrice ? fmtPct(x.dayChangePct) : ''}</span>
              <span class="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${st.actionClass}">${esc(st.action)}</span>
              ${st.source === 'grok' ? '<span class="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-violet-500/15 text-violet-300 border border-violet-500/25">from Grok</span>' : '<span class="text-[10px] text-slate-600">local</span>'}
              <span class="text-[10px] text-slate-500">~${x.weight.toFixed(0)}% port.</span>
            </div>
            <p class="text-xs text-slate-500 mt-1">
              ${num(x.shares).toLocaleString()} shares · avg ${fmtP(x.avgPrice)}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" data-pf-analyze="${esc(x.ticker)}" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white">Analyze</button>
            <button type="button" data-pf-remove="${esc(x.ticker)}" class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-500/30 text-red-300 hover:bg-red-500/10">Remove</button>
          </div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
          <div class="rounded-lg bg-surface-900/80 border border-white/5 px-2.5 py-2">
            <div class="text-slate-500 text-[10px]">Market value</div>
            <div class="font-semibold text-slate-100 tabular-nums" data-pf-value="${esc(x.ticker)}">${x.hasPrice ? fmtP(x.value) : '—'}</div>
          </div>
          <div class="rounded-lg bg-surface-900/80 border border-white/5 px-2.5 py-2">
            <div class="text-slate-500 text-[10px]">Cost basis</div>
            <div class="font-semibold text-slate-300 tabular-nums">${fmtP(x.cost)}</div>
          </div>
          <div class="rounded-lg bg-surface-900/80 border border-white/5 px-2.5 py-2">
            <div class="text-slate-500 text-[10px]">Unrealized P&L $</div>
            <div class="font-semibold tabular-nums ${pnlClass}" data-pf-pnl="${esc(x.ticker)}">${x.hasPrice ? `${x.pnl >= 0 ? '+' : ''}$${Math.abs(x.pnl).toFixed(2)}` : '—'}</div>
          </div>
          <div class="rounded-lg bg-surface-900/80 border border-white/5 px-2.5 py-2">
            <div class="text-slate-500 text-[10px]">Unrealized P&L %</div>
            <div class="font-semibold tabular-nums ${pnlClass}" data-pf-pnlpc="${esc(x.ticker)}">${x.hasPrice ? fmtPct(x.pnlPct) : '—'}</div>
          </div>
        </div>
        <div class="mt-3 rounded-xl border border-white/5 bg-surface-900/60 p-3 space-y-2">
          <div class="text-[10px] uppercase tracking-wide text-emerald-400/90 font-semibold">Стратегія позиції</div>
          <ul class="text-[11px] text-slate-400 space-y-1 leading-relaxed">
            ${st.reasons.map((r) => `<li class="flex gap-1.5"><span class="text-slate-600">•</span><span>${esc(r)}</span></li>`).join('')}
          </ul>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] pt-1">
            <div class="rounded-lg bg-black/20 border border-red-500/15 px-2.5 py-2">
              <div class="text-red-300/90 font-semibold">Stop Loss</div>
              <div class="text-slate-200 font-mono">${x.hasPrice ? fmtP(st.sl) : '—'}</div>
            </div>
            <div class="rounded-lg bg-black/20 border border-emerald-500/15 px-2.5 py-2">
              <div class="text-emerald-300/90 font-semibold">TP1 / TP2</div>
              <div class="text-slate-200 font-mono">${x.hasPrice ? `${fmtP(st.tp1)} · ${fmtP(st.tp2)}` : '—'}</div>
            </div>
            <div class="rounded-lg bg-black/20 border border-blue-500/15 px-2.5 py-2 sm:col-span-1">
              <div class="text-blue-300/90 font-semibold">Коли продавати</div>
              <div class="text-slate-400 leading-snug">${esc(st.whenSell)}</div>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');

    root.querySelectorAll('[data-pf-remove]').forEach((btn) => {
      btn.addEventListener('click', () => removePosition(btn.getAttribute('data-pf-remove')));
    });
    root.querySelectorAll('[data-pf-analyze]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (typeof M().openAnalyzer === 'function') M().openAnalyzer(btn.getAttribute('data-pf-analyze'));
      });
    });
  }

  /** Live price tick → refresh portfolio numbers without full re-render if possible */
  function onPricesUpdated() {
    renderWatchlist();
    // lightweight portfolio total refresh
    const list = loadPort();
    if (!list.length) return;
    let totalCost = 0;
    let totalValue = 0;
    list.forEach((p) => {
      const q = getQuoteFor(p.ticker);
      const cost = p.shares * p.avgPrice;
      totalCost += cost;
      if (q.hasQuote) {
        const value = p.shares * q.price;
        totalValue += value;
        const pnl = value - cost;
        const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
        const pnlEl = document.querySelector(`[data-pf-pnl="${p.ticker}"]`);
        const pctEl = document.querySelector(`[data-pf-pnlpc="${p.ticker}"]`);
        const valEl = document.querySelector(`[data-pf-value="${p.ticker}"]`);
        const cls = pnl > 0 ? 'text-emerald-400' : pnl < 0 ? 'text-red-400' : 'text-slate-400';
        if (valEl) valEl.textContent = fmtP(value);
        if (pnlEl) {
          pnlEl.textContent = `${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(2)}`;
          pnlEl.className = `font-semibold tabular-nums ${cls}`;
        }
        if (pctEl) {
          pctEl.textContent = fmtPct(pnlPct);
          pctEl.className = `font-semibold tabular-nums ${cls}`;
        }
      }
    });
    const totalPnl = totalValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    const totClass = totalPnl > 0 ? 'text-emerald-400' : totalPnl < 0 ? 'text-red-400' : 'text-slate-300';
    const tv = document.getElementById('pf-total-value');
    const tp = document.getElementById('pf-total-pnl');
    const tpp = document.getElementById('pf-total-pnlpc');
    if (tv) tv.textContent = fmtP(totalValue);
    if (tp) {
      tp.textContent = `${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toFixed(2)}`;
      tp.className = `text-lg font-bold tabular-nums ${totClass}`;
    }
    if (tpp) {
      tpp.textContent = fmtPct(totalPnlPct);
      tpp.className = `text-lg font-bold tabular-nums ${totClass}`;
    }
  }

  // ─── Wire UI ──────────────────────────────────────────────────────
  function wire() {
    document.getElementById('btn-clear-cache')?.addEventListener('click', () => {
      Cache.clearAll();
      toast('Cache cleared', 'ok');
    });

    document.getElementById('wl-sort')?.addEventListener('change', (e) => {
      const v = e.target.value || 'interest_desc';
      const [key, dir] = v.split('_');
      watchSort = { key, dir };
      renderWatchlist();
    });

    document.getElementById('wl-add-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('wl-add-ticker');
      const t = (input?.value || '').trim().toUpperCase();
      if (addWatch(t) && input) input.value = '';
    });

    document.getElementById('pf-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const ticker = document.getElementById('pf-ticker')?.value;
      const shares = document.getElementById('pf-shares')?.value;
      const avg = document.getElementById('pf-avg')?.value;
      if (addPosition(ticker, shares, avg)) {
        e.target.reset();
      }
    });

    // Portfolio Grok
    document.getElementById('pf-grok-gen')?.addEventListener('click', () => {
      renderPortfolio(); // refresh snapshot
      const snap = window.__pfSnapshot;
      if (!snap?.enriched?.length) {
        toast('Спочатку додай позиції в портфель', 'warn');
        return;
      }
      const prompt = buildPortfolioGrokPrompt(
        snap.enriched,
        snap.totalValue,
        snap.totalCost,
        snap.totalPnl,
        snap.totalPnlPct
      );
      const ta = document.getElementById('pf-grok-prompt');
      if (ta) ta.value = prompt;
      toast('Grok portfolio prompt ready', 'ok');
    });
    document.getElementById('pf-grok-copy')?.addEventListener('click', async () => {
      const ta = document.getElementById('pf-grok-prompt');
      const text = ta?.value || '';
      if (!text) {
        toast('Спочатку Generate Grok Portfolio Prompt', 'warn');
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        toast('Prompt copied', 'ok');
      } catch (_) {
        ta.select();
        document.execCommand('copy');
        toast('Prompt copied', 'ok');
      }
    });
    document.getElementById('pf-grok-open')?.addEventListener('click', async () => {
      const text = document.getElementById('pf-grok-prompt')?.value || '';
      if (text) {
        try { await navigator.clipboard.writeText(text); } catch (_) {}
        toast('Prompt copied · paste in Grok', 'ok');
      }
      window.open('https://grok.com/', '_blank', 'noopener,noreferrer');
    });
    document.getElementById('pf-grok-save')?.addEventListener('click', () => {
      const text = document.getElementById('pf-grok-response')?.value || '';
      if (!text.trim()) {
        toast('Встав відповідь Grok у поле', 'warn');
        return;
      }
      try {
        localStorage.setItem(KEY_GROK_REPLY, JSON.stringify({ t: Date.now(), text }));
      } catch (_) {}
      const result = applyGrokOverridesToPortfolio(text);
      renderGrokParsed(text, result);
      renderPortfolio(); // refresh cards with new SL/TP/action
      const msg = document.getElementById('pf-grok-msg');
      if (msg) {
        msg.textContent = result.applied
          ? `Applied to ${result.applied} position(s)`
          : 'Saved, but no ticker levels found';
        msg.className = result.applied ? 'text-xs text-emerald-400 self-center' : 'text-xs text-amber-400 self-center';
      }
      if (result.applied) toast(`Grok levels applied to ${result.applied} position(s)`, 'ok');
      else toast('Could not find SL/TP per ticker — use STRUCTURED block in Grok reply', 'warn', 4500);
    });
    document.getElementById('pf-grok-clear')?.addEventListener('click', () => {
      localStorage.removeItem(KEY_GROK_REPLY);
      clearGrokOverrides();
      const ta = document.getElementById('pf-grok-response');
      if (ta) ta.value = '';
      renderGrokParsed('');
      renderPortfolio();
      const msg = document.getElementById('pf-grok-msg');
      if (msg) {
        msg.textContent = 'Cleared Grok overrides';
        msg.className = 'text-xs text-slate-500 self-center';
      }
      toast('Grok overrides cleared · back to local SL/TP', 'ok');
    });

    // restore saved Grok reply + overrides already on positions
    try {
      const saved = JSON.parse(localStorage.getItem(KEY_GROK_REPLY) || 'null');
      if (saved?.text) {
        const ta = document.getElementById('pf-grok-response');
        if (ta) ta.value = saved.text;
        const tickers = loadPort().map((p) => p.ticker);
        const details = loadPort()
          .filter((p) => p.grokOverride)
          .map((p) => ({ ticker: p.ticker, ...p.grokOverride }));
        renderGrokParsed(saved.text, { details, applied: details.length });
      }
    } catch (_) {}

    // delegated watch buttons (results re-render)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-watch-ticker]');
      if (!btn) return;
      // ignore if it's only a display badge without handler need - still toggle
      const t = btn.getAttribute('data-watch-ticker');
      if (!t) return;
      if (btn.dataset.inWatch === '1') removeWatch(t);
      else addWatch(t);
    });

    renderWatchlist();
    renderPortfolio();
    if (typeof window.__mitpAfterPages === 'function') {
      window.__mitpAfterPages();
    }
  }

  window.MITPPages = {
    Cache,
    TTL_PICKS,
    TTL_ANALYZE,
    TTL_QUOTES,
    loadWatch,
    addWatch,
    removeWatch,
    renderWatchlist,
    renderPortfolio,
    onPricesUpdated,
    updateWatchBadges,
    onShow(view) {
      if (view === 'watchlist') renderWatchlist();
      if (view === 'portfolio') renderPortfolio();
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
