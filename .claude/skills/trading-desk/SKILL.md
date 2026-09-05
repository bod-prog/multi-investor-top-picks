---
name: trading-desk
description: Runs a full multi-agent investment analysis on any ticker (stock, ETF, or crypto) — four specialist analysts, a bull-vs-bear debate, a trader proposal, a three-way risk review, and a final Buy/Overweight/Hold/Underweight/Sell rating with a written thesis. This is a Claude-native port of the TradingAgents framework, so no Python, API keys, or local setup are needed. Use this whenever the user asks whether to buy, sell, or hold something; asks what you think of a ticker; wants an investment thesis, a bull case, a bear case, a price target, or a risk assessment; wants several tickers compared or ranked; or mentions TradingAgents at all. Reach for it even when the user just names a ticker and asks "what do you think" — a one-line opinion is exactly what this workflow exists to replace.
---

# Trading Desk

A simulated trading firm. Instead of answering "should I buy NVDA?" as a single
opinion, you walk the question through the desk: specialists gather evidence,
two researchers argue the opposite sides of it, a trader turns the winning
argument into a concrete transaction, three risk officers attack that
transaction from different angles, and a portfolio manager rules on it.

The point is not ceremony. A single pass produces a confident-sounding answer
with no adversarial pressure on it; this structure forces the bear case to be
argued as well as the bull case, and forces the final rating to survive both.

This is a research scaffold, not financial advice — see Guardrails.

## Inputs

Read from the user's request: **ticker**, optional **date** (default: today),
optional **depth**.

Tickers follow Yahoo Finance conventions, which also tells you the market:
`AAPL`, `SPY` (US) · `0700.HK` · `7203.T` · `AZN.L` · `RELIANCE.NS` · `.TO`
· `.AX` · `600519.SS` / `.SZ` (China A) · `BTC-USD`, `ETH-USD` (crypto).

**Depth presets** — pick `standard` unless the user signals otherwise:

| Depth | Debate rounds | Risk rounds | Analysts run |
|---|---|---|---|
| `quick` | 1 exchange | 1 pass | Technical + News only |
| `standard` | 2 exchanges | 1 full round | All four |
| `deep` | 3 exchanges | 2 full rounds | All four, each researched separately |

At `deep`, run the four analysts as parallel subagents (one Task per analyst,
all launched in the same turn) — they have no dependencies on each other and
parallelism is the whole reason the phase is separable. At `quick` and
`standard`, run them inline; spawning agents costs more than it saves there.

## Phase 0 — Ground the instrument

Everything downstream inherits the errors made here, so do this first and do it
literally.

1. Resolve the ticker to a specific instrument: full name, exchange, quote
   currency, sector. Never assume from the letters alone — `MSTR`, `META`, and
   many non-US tickers have been renamed or reused.
2. Fetch a **verified data snapshot** with WebSearch/WebFetch: last close,
   recent price range, market cap, and the trailing move (1W / 1M / YTD where
   available). Note the as-of date of everything you fetch.
3. Write the snapshot down before any agent speaks. Every later numeric claim
   must trace back to this snapshot or to a source that agent fetched itself.

**If a number was not fetched, it does not get stated.** Say "not verified"
instead. A fabricated price level poisons the entire chain — the trader will
set a stop-loss against it and the PM will rule on it. This is the single most
important rule in the skill.

## Phase 1 — Analyst team

Four specialists, each producing a short evidence-dense report. Each one
searches for its own material; none of them may lean on the others' work.

**Technical Analyst** — price action and indicators. Trend and structure,
moving averages, MACD/RSI where obtainable, support and resistance from actual
levels in the data, volume behaviour. Say plainly when an indicator could not
be sourced rather than estimating it.

**Fundamentals Analyst** — the business. Revenue and margin trajectory,
earnings, balance sheet, valuation multiples versus the sector, capital
allocation. For crypto: tokenomics, supply schedule, network activity, and the
fact that equity-style fundamentals do not apply.

**News Analyst** — events and macro. Company-specific catalysts, regulatory and
legal developments, sector moves, and the macro backdrop (rates, inflation,
growth) as it actually bears on this instrument. Prefer the last 30 days.

**Sentiment Analyst** — positioning and mood. Analyst ratings and revisions,
retail and social chatter, options/short interest if obtainable. Close with an
explicit band — Bullish / Mildly Bullish / Neutral / Mixed / Mildly Bearish /
Bearish — plus a 0–10 score and your confidence in it (low/medium/high), so the
read is comparable across runs instead of buried in prose.

Where sources conflict, say so. Divergence between the technical and
fundamental picture is signal for the debate, not noise to smooth over.

## Phase 2 — Researcher debate

Now argue. **Bull Researcher** opens, **Bear Researcher** answers, alternating
for the configured number of exchanges.

Each turn must engage the opponent's last argument directly — name the specific
claim and answer it with evidence from the analyst reports. Restating your own
thesis louder is a wasted turn. Both sides draw from the same reports, so the
debate is decided by which reading of the evidence is stronger, not by who
found more of it.

Keep each turn to a few tight paragraphs. Argue like a colleague across a desk,
not like a press release.

Then the **Research Manager** rules on the debate and produces:

```
**Recommendation**: <Buy | Overweight | Hold | Underweight | Sell>
**Rationale**: <which arguments actually carried it, both sides summarised>
**Strategic Actions**: <concrete instructions for the trader, with sizing>
```

Judge the arguments on merit, not on who spoke last. Choose Hold when the case
is genuinely balanced, conflicting, or thin — forcing a direction to look
decisive is the failure mode this role exists to prevent.

## Phase 3 — Trader

Turn the plan into a transaction:

```
**Action**: <Buy | Hold | Sell>
**Reasoning**: <2–4 sentences, anchored in the reports and the plan>
**Entry Price**: <level, or omit>
**Stop Loss**: <level, or omit>
**Position Sizing**: <e.g. 3% of portfolio, or omit>
```

Levels must come from the verified snapshot. Omit a field rather than inventing
a number for it.

## Phase 4 — Risk review

Three officers attack the trader's proposal in order — **Aggressive**,
**Conservative**, **Neutral** — for the configured number of rounds.

- **Aggressive**: the opportunity cost of timidity. What does under-sizing or
  sitting out cost if the thesis is right?
- **Conservative**: capital preservation. Drawdown scenarios, liquidity, the
  concentration and tail risks the proposal ignores.
- **Neutral**: adjudicates the overstatement on both sides and asks what the
  proposal assumes that could simply be false.

Each speaks to the *proposal* — the sizing, the entry, the stop — not to the
ticker in the abstract.

## Phase 5 — Portfolio Manager

The final call, in this exact shape:

```
**Rating**: <Buy | Overweight | Hold | Underweight | Sell>
**Executive Summary**: <entry, sizing, key risk levels, horizon — 2–4 sentences>
**Investment Thesis**: <the reasoning, cited to specific evidence from the debates>
**Price Target**: <level, or omit>
**Time Horizon**: <e.g. 3–6 months, or omit>
```

The five tiers mean: **Buy** enter or add with conviction · **Overweight**
favourable, increase gradually · **Hold** no action · **Underweight** reduce,
take partial profits · **Sell** exit or avoid.

If prior decisions on this ticker exist in the decision log, weigh them here:
what did the last call get right or wrong, and does that change anything?

Hold is a real answer. Reach for it when the evidence is balanced, materially
conflicting, or too thin to justify moving exposure.

## Phase 6 — Report and memory

Write the full run to `trading-desk/reports/<TICKER>-<YYYY-MM-DD>.md` using the
template in `references/report-template.md`, then append one line to
`trading-desk/decision-log.md`:

```
| 2026-09-05 | NVDA | Overweight | $178.4 | Fundamentals strong, technicals extended; sized half |
```

The log is what makes later runs smarter than isolated ones — on the next run
for the same ticker, read it first, check what the earlier call would have
returned by now, and let that inform Phase 5.

In chat, give the user the rating, the two or three arguments that actually
decided it, the main risk, and the report path. Do not paste the whole report
back — they can open it.

Offer to publish it as an artifact when the user wants something shareable or
visual; a plain terminal summary is fine otherwise.

## Guardrails

Say what you don't know. An analysis built on three sourced facts and an
honest "fundamentals unavailable for this instrument" is worth more than a
complete-looking one with invented numbers, because the user can see where the
thin ice is.

Every report carries this line, and it is not boilerplate — the framework is a
research scaffold whose output varies run to run:

> Research scaffold, not financial or investment advice. LLM-generated analysis
> varies between runs and can be wrong. Verify independently before trading.

If the user asks for something this workflow can't honestly do — a guaranteed
return, a prediction of tomorrow's close, or advice tailored to their personal
finances — say so plainly and give them the analysis you can stand behind.
