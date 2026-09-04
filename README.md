# Multi-Investor Top Picks Generator

Modern dark-themed stock screener & day-trading toolkit (HTML + Tailwind + JS).

- Top Picks with multi-investor styles & day-trading strategies  
- Live quotes via Finnhub (free API key)  
- RS & volatility from 1 year of daily history (Yahoo, no key) — see below  
- Stock Analyzer, Watchlist, Portfolio, Day Trading charts  
- Themes, cache, Grok prompts  

**Not financial advice.** Demo / personal use.

## Run locally

1. Open `index.html` via `start.bat` (Python server for chart proxy), **or**  
2. Deploy to GitHub Pages (see below).

## GitHub Pages

1. Push this repo to GitHub.  
2. **Settings → Pages → Source: Deploy from a branch**  
3. Branch: `main` · Folder: `/ (root)`  
4. Site URL: `https://YOUR_USERNAME.github.io/REPO_NAME/`

Required files at repo root:

- `index.html`
- `app-pages.js`
- `day-trading.js`
- `history.js`
- `backtest.js`

## RS & Volatility

Both inputs come from ~1 year of daily bars (Yahoo chart API — free, no key).
Toggle it under **Джерело RS / Volatility**; results are cached in
`localStorage` for 12h.

Data is fetched through the local `server.py` proxy when you run it, and
otherwise across both Yahoo hosts × several public CORS proxies until one
answers — those proxies go down often, and on GitHub Pages there is no local
server to fall back on. A response only counts as success if it parses as a
Yahoo chart (a proxy that is up but broken answers `200` with an error page),
and the route that worked is reused for the rest of the batch instead of
re-probing per ticker.

| | On (default) | Off |
|--|--------------|-----|
| `rs` | Weighted return over 3/6/9/12 months (most recent quarter counts double), percentile-ranked against your own ticker list and blended with excess return vs `SPY` | `50 + today's change % × 8` |
| `volatility` | Annualised stdev of daily log returns over ~1 month | Today's high-low range |

Why it matters: with the same-day formula a stock that fell 50% over the year
but popped 6% this morning scored the *highest* relative strength in the list.

If history can't be fetched (opened via `file://`, CORS proxies down, unknown
ticker) the app falls back to the same-day values and says so in the status
line — nothing breaks, the numbers are just weaker.

Check the math (no deps, no network): `node test/history.test.js`

## Trading journal (`/daytrade/`)

A separate, self-contained page — no CDN, no API key, no backend. It does not
generate signals; it measures what already happened to your money:

- **Position size** — shares that keep the loss at the risk you chose, with the
  reward-to-risk ratio and warnings (risk over 2%, R:R under 1.5, a position
  needing margin, a stop so far away the size rounds to zero).
- **Daily limits** — max trades and max loss in R per day, with an explicit stop
  banner once either is hit.
- **Pre-trade checklist** — your own rules, and the statistics later score the
  trades where you followed them against the ones where you did not.
- **Statistics in R** — expectancy, win rate, profit factor, max drawdown,
  longest losing streak, equity curve, breakdown by setup.
- **A verdict that refuses to over-claim** — under ~30 trades, or with |t| < 2,
  it says the edge is not established rather than showing a green number.

Data lives in `localStorage`; export/import JSON keeps a backup (import merges,
it never deletes trades entered since the backup).

`node test/daytrade-stats.test.js` covers the arithmetic — R-multiples with fees,
expectancy, drawdown, position sizing rounding down, daily limits, and the
wording of the verdict at each sample size.

## Backtest

**Бектест сигналу RS** on the Top Picks page answers "would this ranking have
made money?" — walk-forward, with no look-ahead: at each rebalance the ranking
sees only closes up to that date (the same `statsFromCloses` / `rsScores` the
live app uses), buys the top N equal-weight, holds, repeats. It reports the
strategy against both the equal-weight universe and `SPY`, per period and
compounded, with max drawdown, win rate and a t-statistic.

What it deliberately does **not** claim:

- Only the **price signal (RS)** is tested. Finnhub serves current fundamentals
  only, so scoring a past date with today's P/E, ROE and growth would be
  look-ahead bias — that half of the score stays untested.
- The ticker list is today's list of **survivors**; delisted and bankrupt names
  are missing, which inflates any result.
- A handful of rebalances is a tiny sample. The report prints a t-statistic
  precisely so a good-looking number below |t| ≈ 2 is read as luck.

`node test/backtest.test.js` verifies the engine, including that the ranking is
byte-identical whether or not future bars exist in the data.

## Finnhub

Get a free key: https://finnhub.io/register  
Enter it in the app UI (stored only in your browser `localStorage`).
