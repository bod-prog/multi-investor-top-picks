# Graph Report - multi-investor-top-picks  (2026-09-05)

## Corpus Check
- 25 files · ~59,261 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 338 nodes · 560 edges · 24 communities (19 shown, 5 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `29d478e8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server.py
- app-pages.js
- What You Must Do When Invoked
- day-trading.js
- history.js
- Викласти на GitHub Pages (онлайн + телефон)
- graphify reference: extra exports and benchmark
- Як викласти Multi-Investor онлайн (телефон з будь-якої мережі)
- graphify reference: query, path, explain
- Multi-Investor Top Picks Generator
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- CLAUDE.md
- .claude/CLAUDE.md
- extraction-spec.md
- history.test.js
- backtest.test.js
- backtest.js
- daytrade-stats.test.js
- app.js
- stats.js

## God Nodes (most connected - your core abstractions)
1. `init()` - 16 edges
2. `renderPortfolio()` - 14 edges
3. `renderWatchlist()` - 13 edges
4. `analyzeBars()` - 13 edges
5. `wire()` - 12 edges
6. `loadAndAnalyze()` - 12 edges
7. `What You Must Do When Invoked` - 12 edges
8. `M()` - 10 edges
9. `summarise()` - 10 edges
10. `/graphify` - 10 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (24 total, 5 thin omitted)

### Community 0 - "server.py"
Cohesion: 0.17
Nodes (10): Handler, http_get_json(), http_get_text(), local_ip(), main(), Daily OHLCV via Stooq CSV → Yahoo-like shape for the frontend., Best-effort LAN IP for phone access instructions., stooq_daily() (+2 more)

### Community 1 - "app-pages.js"
Cohesion: 0.14
Nodes (33): addPosition(), addWatch(), applyGrokOverridesToPortfolio(), buildPortfolioGrokPrompt(), clamp(), clearGrokOverrides(), esc(), fmtP() (+25 more)

### Community 2 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 3 - "day-trading.js"
Cohesion: 0.14
Nodes (36): aggregateBars(), analyzeBars(), apiKey(), buildDayTradeGrokPrompt(), chip(), clamp(), detectPatterns(), ema() (+28 more)

### Community 4 - "history.js"
Cohesion: 0.16
Nodes (21): annualisedVolPct(), cacheGet(), cacheSet(), chartUrl(), clamp(), clearCache(), describe(), enrich() (+13 more)

### Community 5 - "Викласти на GitHub Pages (онлайн + телефон)"
Cohesion: 0.20
Nodes (9): Важливо, Викласти на GitHub Pages (онлайн + телефон), Крок 1 — Акаунт GitHub, Крок 2 — Новий репозиторій, Крок 3 — Залити код (PowerShell), Крок 4 — Увімкнути Pages, Оновлення сайту після змін, Якщо `git` уже в PATH (після перезапуску терміналу): (+1 more)

### Community 6 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 7 - "Як викласти Multi-Investor онлайн (телефон з будь-якої мережі)"
Cohesion: 0.25
Nodes (7): Важливо про безпеку, Варіант A — Netlify Drop (найпростіше, ~2 хвилини), Варіант B — Cloudflare Pages, Варіант C — GitHub Pages (якщо встановиш Git), Локально vs онлайн, Файли для деплою, Як викласти Multi-Investor онлайн (телефон з будь-якої мережі)

### Community 8 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 9 - "Multi-Investor Top Picks Generator"
Cohesion: 0.25
Nodes (7): Backtest, Finnhub, GitHub Pages, Multi-Investor Top Picks Generator, RS & Volatility, Run locally, Trading journal (`/daytrade/`)

### Community 10 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 11 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 12 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 18 - "history.test.js"
Cohesion: 0.10
Nodes (17): alt, bench, chartResponse(), fs, geo, oldLaggardPop, path, { rs, benchPerf } (+9 more)

### Community 19 - "backtest.test.js"
Cohesion: 0.09
Nodes (21): aligned, check(), clone, dates, expectedPeriods, flatPanel, flatReport, free (+13 more)

### Community 20 - "backtest.js"
Cohesion: 0.28
Nodes (10): alignSeries(), compound(), internals(), maxDrawdown(), mean(), rankAt(), ret(), run() (+2 more)

### Community 21 - "daytrade-stats.test.js"
Cohesion: 0.09
Nodes (26): bleeding, book, busy, byRules, bySetup, calm, check(), consistent (+18 more)

### Community 22 - "app.js"
Cohesion: 0.20
Nodes (24): buildExplanations(), checklistState(), clearDemo(), exportData(), fillForm(), importData(), init(), isDemoLoaded() (+16 more)

### Community 23 - "stats.js"
Cohesion: 0.22
Nodes (17): dayStatus(), equityCurve(), fmtR(), groupBy(), isClosed(), longestLossStreak(), maxDrawdownR(), mean() (+9 more)

## Knowledge Gaps
- **115 isolated node(s):** `fs`, `path`, `vm`, `store`, `sandbox` (+110 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 153 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Are the 4 inferred relationships involving `init()` (e.g. with `clearDemo()` and `exportData()`) actually correct?**
  _`init()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `fs`, `path`, `vm` to the rest of the system?**
  _115 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `app-pages.js` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `day-trading.js` be split into smaller, more focused modules?**
  _Cohesion score 0.13940256045519203 - nodes in this community are weakly interconnected._
- **Should `history.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `backtest.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._