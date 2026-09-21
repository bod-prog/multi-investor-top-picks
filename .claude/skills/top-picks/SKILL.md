---
name: top-picks
description: Finds new stock candidates to hold for a month or more — a shortlist built from live screens, catalysts, themes and contrarian setups rather than from memory, on a valuation or quality thesis rather than a scheduled event. Use it for positional ideas; for a position held inside one session use day-picks, and for a dated catalyst over days to weeks use swing-picks. Use this whenever the user asks what to buy, what to look at, what is interesting right now, for ideas, picks, candidates, or names; asks to find stocks matching a style (value, growth, GARP, momentum, breakout, high-beta) or a theme; asks what to add to their watchlist or ticker list; or asks to scan the market. Reach for it whenever the question is "which stocks?" rather than "this stock" — trading-desk analyses a ticker you already have, portfolio-review examines a book you already hold, and this is the step before both, the one that produces the tickers in the first place.
---

# Top Picks

The positional end of the funnel: `market-today` sets the tape → **`top-picks`**
finds names worth holding a month or more → `trading-desk` analyses one in depth
→ `portfolio-review` judges the resulting book.

**Two siblings cover the shorter horizons**, and they are separate skills
because their data and their handoffs differ, not merely their timeframes:

| Skill | Horizon | Thesis | Downstream |
|---|---|---|---|
| `day-picks` | inside one session | today's move | terminal — the app and the desk both fail at this horizon |
| `swing-picks` | 2–15 sessions | a **dated** scheduled event | app scoring works; desk optional |
| **`top-picks`** | a month or more | valuation, quality, a structural change | app scoring works; desk recommended |

If the request is intraday or names a date inside two weeks, **hand off** rather
than stretching this skill to cover it.

It exists because this project's own screener, powerful as it is, can only rank
**a ticker list the user maintains by hand** — RS is percentile-ranked against
that list, so a company not already on it can never surface, however good it
is. This skill's job is to produce names that are not yet on the list. It does
not re-rank the list; the app already does that with a year of real daily bars,
and does it better than any amount of prose.

So the output here is a *shortlist with reasons*, not a score. Deliverable:
tickers the user can paste into their app, plus a recommendation of which
deserve a full `trading-desk` run.

Research scaffold, not financial advice — see Guardrails.

## Phase 0 — Frame the search

Establish before searching, asking only if the user's request leaves it
genuinely open:

- **Style** — the app's own vocabulary, so results slot straight in:

  | Style | What it selects for |
  |---|---|
  | `buffett` | Value and quality: low P/E, high ROE, low debt/equity |
  | `lynch` | GARP: EPS growth against a reasonable multiple |
  | `wood` | Innovation and revenue growth, multiple secondary |
  | `momentum` / `breakout` | Relative strength, price near highs |
  | `meanrev` | Oversold quality, fading an extreme move |

  `highbeta` / `gapgo` / `scalping` belong to `day-picks`.

- **Horizon** — `1m` and longer. The app's `day` and `10d` settings are served
  by `day-picks` and `swing-picks`; this skill covers the `1m` setting and
  anything beyond it. Two runs at the `day` horizon established that a single
  skill cannot serve all three, which is why they are now separate.
- **Constraints** — max price, market-cap floor, markets, sectors to avoid.
- **Exclusions** — the current watchlist (`mitp_watchlist_v1`), portfolio
  (`mitp_portfolio_v1`), and anything already in `trading-desk/decision-log.md`
  — list those with `python3 trading-desk/tools/deskdb.py timeline`, and check a
  specific name with `deskdb.py ticker <T>` before spending a slot on it.
  Surfacing a name the user already holds is a wasted slot, and adding to an
  existing concentration is worse than a wasted slot.

Default when unstated: `1m` horizon, balanced style, liquid names above ~$2B
market cap. If the user asks for a shorter hold, route to the right sibling
rather than running this with a compressed window.

## Phase 1 — Generate candidates from separate angles

The failure mode of "find me stocks" is a list of the same mega-caps every
time, or names remembered from training data that have since moved, been
acquired, or collapsed. Both come from searching once and accepting what
returns.

So source from **at least three independent angles**, each with its own search,
and expect them to disagree:

**Quantitative screen.** Search for current screens matching the style —
low-P/E high-ROE lists, GARP screens, 52-week-high breakout lists, unusual
volume. These give names, rarely reasons.

**Catalyst.** Recent earnings surprises and guidance raises, analyst upgrades,
new contracts, regulatory decisions, insider buying, spin-offs, index
additions. These give reasons and timing.

**Theme.** What is actually rotating right now — a sector bid, a policy shift,
a supply cycle turning. Then find the names with real exposure, not the
obvious first-order one everyone already owns.

**Contrarian.** Quality names beaten down for reasons that look temporary,
post-capitulation setups, forced-selling artefacts. This angle rarely agrees
with the momentum screen, which is exactly why it earns its place.

Aim for 12–20 raw candidates before filtering. Cast wider than the final list.

## Phase 2 — Verify and filter

Every candidate gets verified before it reaches the shortlist. This phase kills
most of them, and that is the point.

1. **The company exists and is what you think.** Ticker, exchange, current
   name. Tickers get reused and companies get renamed and acquired.
2. **Current price and market cap, fetched.** Not remembered.
3. **Liquidity.** Anything too thin to trade at the user's size is out,
   regardless of how good the story is.
4. **Constraints and exclusions from Phase 0.**
5. **Sector cap.** No more than a third of the shortlist from one sector — if
   the search produced eight semiconductor names, that is the search's bias
   showing, not eight independent ideas.

**A candidate that could not be verified does not appear on the list**, not
even with a caveat. A shortlist is a request for the user's attention and
money; an unverified name spends both on nothing.

## Phase 3 — Rank and explain

For each survivor, one tight paragraph: why it is here, which angle surfaced
it, what specifically supports it (fetched numbers, dated), and the single
thing most likely to break it.

Rank by strength of evidence, not by expected return — expected return is a
guess, evidence is checkable.

Be explicit about what this ranking is *not*: it is a qualitative pre-screen.
It does not compute RS, which needs a year of daily bars percentile-ranked
against a peer list, and it does not compute the app's fundamental score. Say
so. The user's app does that properly, and the honest handoff is:

> These are candidates. Paste them into the app for real RS and fundamental
> scoring, then run `/trading-desk` on whichever survive that.

Never present a prose impression as though it were the app's quantitative
score. The two look similar on the page and are not remotely the same thing.

## Phase 4 — Output

Give the user, in chat:

1. A ranked table: ticker · company · sector · price (as of) · angle · one-line
   reason.
2. A **paste-ready ticker line** for the app: `NVDA, AVGO, VRT, ...`
3. The two or three worth a full `trading-desk` run first, and why those.

Write the full version to `trading-desk/reports/top-picks-<YYYY-MM-DD>.md`,
including the candidates that were rejected in Phase 2 and why — that list is
what stops the next run from resurfacing the same dead ends.

Append one line to `trading-desk/decision-log.md` recording the shortlist, so a
later run can check what these names actually did. That feedback loop is the
only way this skill improves; without it, every run is a fresh guess.

## Guardrails

**Everything is sourced, nothing is remembered.** Market conditions, prices,
and company status all move between training and today. A name that reaches the
shortlist without a fetch behind it is the single most likely way this skill
does harm, because it looks identical to a researched one.

**Date every claim.** "Trading near 52-week highs" is meaningless without an
as-of date; markets move while the report is being written.

**Report the search's own bias.** If three of four angles returned the same
sector, that is information about the market — say it, rather than presenting a
concentrated list as though it were diversified by construction.

**Do not tune the list to please.** If the honest answer is that the style and
constraints given produce three candidates rather than ten, deliver three.
Padding a shortlist to a round number is how a screen becomes noise.

Every report carries:

> Research scaffold, not financial or investment advice. LLM-generated analysis
> varies between runs and can be wrong. Verify independently before trading.
