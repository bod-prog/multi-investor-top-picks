# Graph Report - multi-investor-top-picks  (2026-09-04)

## Corpus Check
- 20 files · ~47,263 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 224 nodes · 371 edges · 19 communities (14 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `689471c4`
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

## God Nodes (most connected - your core abstractions)
1. `renderPortfolio()` - 14 edges
2. `renderWatchlist()` - 13 edges
3. `analyzeBars()` - 13 edges
4. `wire()` - 12 edges
5. `loadAndAnalyze()` - 12 edges
6. `What You Must Do When Invoked` - 12 edges
7. `M()` - 10 edges
8. `/graphify` - 10 edges
9. `loadPort()` - 9 edges
10. `enrich()` - 9 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (19 total, 5 thin omitted)

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
Cohesion: 0.18
Nodes (18): annualisedVolPct(), cacheGet(), cacheSet(), clamp(), clearCache(), describe(), enrich(), fetchDailyCloses() (+10 more)

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
Cohesion: 0.33
Nodes (5): Finnhub, GitHub Pages, Multi-Investor Top Picks Generator, RS & Volatility, Run locally

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
Cohesion: 0.11
Nodes (15): alt, bench, fs, geo, oldLaggardPop, path, { rs, benchPerf }, sandbox (+7 more)

## Knowledge Gaps
- **75 isolated node(s):** `fs`, `path`, `vm`, `store`, `sandbox` (+70 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 109 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `fs`, `path`, `vm` to the rest of the system?**
  _75 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `app-pages.js` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `day-trading.js` be split into smaller, more focused modules?**
  _Cohesion score 0.13940256045519203 - nodes in this community are weakly interconnected._
- **Should `history.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._