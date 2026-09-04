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

## RS & Volatility

Both inputs come from ~1 year of daily bars (Yahoo chart API — free, no key),
fetched through the local `server.py` proxy when you run it and public CORS
proxies otherwise. Toggle it under **Джерело RS / Volatility**; results are
cached in `localStorage` for 12h.

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

## Finnhub

Get a free key: https://finnhub.io/register  
Enter it in the app UI (stored only in your browser `localStorage`).
