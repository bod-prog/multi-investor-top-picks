# Graph Report - multi-investor-top-picks  (2026-09-03)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 96 nodes · 242 edges · 9 communities
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `cf87c5ef`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server.py
- app-pages.js
- renderPortfolio
- day-trading.js
- fetchCandles
- M
- wire
- loadAndAnalyze
- addWatch

## God Nodes (most connected - your core abstractions)
1. `renderPortfolio()` - 14 edges
2. `renderWatchlist()` - 13 edges
3. `analyzeBars()` - 13 edges
4. `wire()` - 12 edges
5. `loadAndAnalyze()` - 12 edges
6. `M()` - 10 edges
7. `loadPort()` - 9 edges
8. `fmtP()` - 8 edges
9. `fmtPct()` - 8 edges
10. `M()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `applyGrokOverridesToPortfolio()` --calls--> `parseGrokOverrides()`  [EXTRACTED]
  app-pages.js → app-pages.js  _Bridges community 1 → community 6_
- `renderPortfolio()` --calls--> `portfolioLevelRecs()`  [EXTRACTED]
  app-pages.js → app-pages.js  _Bridges community 1 → community 2_
- `wire()` --calls--> `buildPortfolioGrokPrompt()`  [EXTRACTED]
  app-pages.js → app-pages.js  _Bridges community 2 → community 6_
- `addWatch()` --calls--> `renderWatchlist()`  [EXTRACTED]
  app-pages.js → app-pages.js  _Bridges community 2 → community 8_
- `analyzeBars()` --calls--> `clamp()`  [EXTRACTED]
  day-trading.js → day-trading.js  _Bridges community 3 → community 5_

## Import Cycles
- None detected.

## Communities (9 total, 0 thin omitted)

### Community 0 - "server.py"
Cohesion: 0.17
Nodes (10): Handler, http_get_json(), http_get_text(), local_ip(), main(), Daily OHLCV via Stooq CSV → Yahoo-like shape for the frontend., Best-effort LAN IP for phone access instructions., stooq_daily() (+2 more)

### Community 1 - "app-pages.js"
Cohesion: 0.17
Nodes (6): normalizeAction(), parseGrokOverrides(), parseMoneyToken(), portfolioLevelRecs(), processGrokReply(), renderGrokParsed()

### Community 2 - "renderPortfolio"
Cohesion: 0.37
Nodes (14): buildPortfolioGrokPrompt(), clamp(), esc(), fmtP(), fmtPct(), getQuoteFor(), interestScore(), M() (+6 more)

### Community 3 - "day-trading.js"
Cohesion: 0.32
Nodes (10): analyzeBars(), detectPatterns(), ema(), ensureChart(), macd(), pivotSupportResistance(), renderChart(), rsi() (+2 more)

### Community 4 - "fetchCandles"
Cohesion: 0.31
Nodes (9): aggregateBars(), fetchCandles(), fetchJsonViaProxies(), fetchViaLocalProxy(), fetchYahooCandlesBrowser(), isFileProtocol(), isLocalHttpApp(), num() (+1 more)

### Community 5 - "M"
Cohesion: 0.36
Nodes (9): apiKey(), buildDayTradeGrokPrompt(), chip(), clamp(), escapeHtml(), formatPct(), formatPrice(), M() (+1 more)

### Community 6 - "wire"
Cohesion: 0.54
Nodes (8): addPosition(), applyGrokOverridesToPortfolio(), clearGrokOverrides(), loadPort(), removePosition(), savePort(), toast(), wire()

### Community 7 - "loadAndAnalyze"
Cohesion: 0.43
Nodes (8): fhGet(), loadAndAnalyze(), loadSaved(), renderSavedList(), resetChart(), saveAnalysis(), setStatus(), wire()

### Community 8 - "addWatch"
Cohesion: 0.70
Nodes (5): addWatch(), loadWatch(), removeWatch(), saveWatch(), updateWatchBadges()

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `analyzeBars()` connect `day-trading.js` to `fetchCandles`, `M`, `loadAndAnalyze`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `renderPortfolio()` connect `renderPortfolio` to `app-pages.js`, `wire`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._