# Multi-Investor Top Picks Generator

Modern dark-themed stock screener & day-trading toolkit (HTML + Tailwind + JS).

- Top Picks with multi-investor styles & day-trading strategies  
- Live quotes via Finnhub (free API key)  
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

## Finnhub

Get a free key: https://finnhub.io/register  
Enter it in the app UI (stored only in your browser `localStorage`).
