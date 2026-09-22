---
name: market-today
description: Reads today's market and writes the frame the other skills work inside — index levels and breadth, the one macro driver actually moving the tape, sector rotation, what all of it means for an intraday versus a multi-day position, and a plain verdict on whether today's conditions favour putting new money into stocks or waiting. Use this whenever the user asks what the market is doing, how it opened, what moved today, what the Fed or CPI or oil did, whether it is risk-on or risk-off, what is leading or lagging, or simply "what's happening"; and run it before day-picks or swing-picks whenever the tape has not already been established in this conversation. It produces a frame, not tickers — day-picks and swing-picks produce the names, trading-desk analyses one, portfolio-review judges the book.
---

# Market Today

The first step in the chain, and the only one that produces no tickers.

`market-today` establishes the tape → `day-picks` finds today's movers inside it
→ `swing-picks` finds dated catalysts → `trading-desk` analyses one name →
`portfolio-review` judges the resulting book.

It exists because every shortlist this project has produced was written against
an implicit market frame, and when that frame was wrong the names inherited the
error silently. Making the frame explicit and dated is the whole job.

Research scaffold, not financial advice — see Guardrails.

## Phase 0 — Locate yourself in the session

Before any claim about "today", establish when today is:

1. Run `date -u` and convert to ET. US cash equities open **09:30 ET** and
   close **16:00 ET**.
2. Say which regime you are in and write it at the top of the report:
   **pre-open** · **first hour** · **mid-session** · **final hour** ·
   **after the close** · **weekend or holiday**.
3. A weekend or holiday run describes the *last* session and says so in those
   words. Never describe a stale session as "today".

This matters more than it looks. A move reported at 09:45 is an opening
reaction; the same move at 15:30 is a day's verdict, and they mean opposite
things about conviction.

## Phase 1 — The tape, dated

Fetch and write down, each with its as-of time:

- **S&P 500, Nasdaq, Dow, Russell 2000** — level and change
- **Breadth** where obtainable: advancers versus decliners, new highs versus
  new lows, or equal-weight against cap-weight
- **10-year and 2-year Treasury yields**, and the dollar index
- **Oil** (Brent or WTI) and **gold**, which are the two macro prices that most
  often explain an equity move that otherwise looks unmotivated

**Breadth is the part most reports skip and the part that carries the
information.** An index up 0.6% on narrow leadership and an index up 0.6% with
the Russell leading are different tapes. Say which one this is, or say breadth
could not be sourced — never imply it from the index level.

## Phase 2 — The one thing moving it

Most days have a single dominant driver. Name it, date it, and quantify it.

Check, in this order:
1. **Scheduled macro** — CPI, PCE, payrolls, FOMC, GDP. Was something released
   today, and at what time? Get the **actual against the expected**, not just
   the actual.
2. **The Fed's current position** — the standing target range, the date of the
   last decision, the date of the next one, and what the market prices for it.
3. **A commodity or currency move** large enough to reprice sectors.
4. **A single company large enough to move its index.**

If there is genuinely no dominant driver, say so. "Quiet drift on no catalyst"
is a real and useful answer, and inventing a narrative for it is the failure
mode this phase exists to prevent.

### The lesson that produced this section

On 2026-09-07 this project recorded inflation at **4.2%** and built a whole
rotation frame on it. The verified figure was **3.4% headline, 2.4% core**. The
wrong number was carried through four runs and shaped a shortlist.

**Macro numbers get the same verification discipline as prices**: fetched, dated,
and cross-checked against a second source where possible. A macro figure that
was not fetched does not get stated.

### Data is not the reaction function

On 2026-09-11 the analysis was right that August inflation was an energy shock —
core *easing* to 2.4%, gasoline more than a third of the monthly rise — and the
Fed hiked anyway on 2026-09-16, citing persistent inflation.

**Reading the data correctly and predicting the policy response are different
tasks, and this skill only does the first.** Describe what was released and what
the market did with it. Where a decision is pending, report the **priced
probability** and its source, never a forecast of the outcome.

## Phase 3 — Rotation

What is actually being bought and sold, with numbers:

- Sector performance today, and over the last five sessions where obtainable
- **ETF flows** if sourceable — a flow reversal (outflows turning to inflows) is
  a stronger signal than a day's price move, because it is slower to reverse
- Which factor is working: value against growth, small against large, quality
  against junk, defensive against cyclical

Then state the regime in one line: **risk-on**, **risk-off**, **rotation
without direction**, or **no clear regime**.

Prefer a move you can attribute to a driver from Phase 2 over one you cannot.
An unexplained sector move is worth flagging as unexplained — it is often the
first sign the stated narrative is wrong.

## Phase 4 — The frame

Two short paragraphs, and this is the deliverable the other skills consume.

**For an intraday position**: is there enough range and volume today to trade,
or is this a quiet tape? Which sectors are in motion? Is there a scheduled event
later today that will reprice everything — an afternoon Fed decision, an
auction, a major close-of-session earnings release?

**For a multi-day position**: what is the dominant risk over the next one to ten
sessions? Name the scheduled events inside that window with their dates. Is the
current move likely to persist or to mean-revert, and say plainly which parts of
that are observation and which are judgement.

End with **what would change this read** — one or two specific, checkable
conditions. A frame that cannot be falsified is a mood, not an analysis.

## Phase 5 — The verdict: deploy or wait

The frame above says what the tape is. This says what to do about it, in one
word, and it is the part the user reads first.

**It is a verdict on conditions, not on the user and not on the future.** It
answers "is today a good day to put new money into stocks", the way a surf
report answers "are conditions good", and it does not answer "should you buy",
which depends on a horizon, a portfolio and a risk tolerance this skill cannot
see.

### The four states

| Verdict | What it means | Fires when |
|---|---|---|
| **Favourable** | Conditions support deploying new capital broadly | Breadth confirms the index move · no scheduled reprice inside the session · trend intact · volatility not depressed |
| **Selective** | The tape works for specific setups, not for the index | Leadership narrow, or a rotation underway, or the index stretched while individual structures are sound |
| **Wait** | Conditions argue against new money today | An unconfirmed high **plus** event risk **plus** no volatility premium · or a trend breaking · or a major scheduled release inside hours |
| **Defensive** | Active risk-reduction signals | Volatility rising hard · breadth collapsing · credit widening · a disorderly move in rates |

### How to decide it

Score these six, each with the number that decided it. **State which ones fired**
— a verdict without its criteria is a mood.

1. **Breadth against price.** The single most informative input. An index at a
   high on negative advance/decline is *unconfirmed* and caps the verdict at
   Selective, however strong the price looks. If breadth is unavailable, say so
   and say that the verdict is less reliable for it.
2. **Volatility regime.** VIX level and direction. Depressed and falling means
   no compensation for risk — that argues against *paying up*, not against
   owning. Rising fast is the Defensive trigger.
3. **Where price sits** in its own recent range, and whether the trend holds.
4. **Scheduled event risk inside the session or the next one** — a Fed decision,
   CPI, payrolls, a major auction. Buying hours before a known reprice is a
   choice, and the verdict should name the hour.
5. **Rates** — the 10-year's level and direction, and whether it is at a
   threshold the market is watching.
6. **Whether the day's move is confirmed** by the things that should confirm it:
   a rally led by the sectors that ought to lead it, volume, credit.

### The honesty rules, which matter more than the verdict

**Never present this as a prediction.** A **Wait** day that rallies 2% is not a
failed call — conditions and outcomes are different things, and a report that
quietly rewrites itself to match the outcome is worthless. Write the verdict
against what was knowable this morning and let it be judged on that.

**Say when it does not matter.** For an investor with a multi-year horizon
adding regularly, the honest answer most days is that this verdict changes very
little; the evidence that timing entries improves long-run returns is weak. It
matters for **deploying a large lump sum**, for **leveraged or short-dated
positions**, and for **deciding whether to chase a move that has already
happened**. Say which of those applies rather than implying today's word is
universally important.

**Never "buy" or "sell" as an instruction.** The states are conditions. Pair the
verdict with *what kind* of buying it supports: the index, a rotation leader, a
specific catalyst, or nothing.

**Always give the falsifier** — one or two checkable conditions that would move
it to the next state up or down. A verdict that cannot be wrong is not a
verdict.

### Output shape

```
**Verdict: Selective** — conditions support specific setups, not the index.
Fired on: breadth unconfirmed (Nasdaq 48.6% advancing on a record close) ·
10-year at 4.96%, 4bp under a threshold · event risk 13:00 ET.
Would become Favourable if: Nasdaq advancers exceed decliners on an up day.
Would become Wait if: the 10-year takes 5.00%.
Matters most for: a lump sum or a chased entry. Matters little for: regular
multi-year additions.
```

## Output

In chat: **the verdict first**, then the regime line, the three or four numbers that matter, the dominant
driver, and the frame. Short — this is the input to other work, not the work.

Write the full version to `trading-desk/reports/market-<YYYY-MM-DD>.md`. If a
second run happens the same day, suffix it (`-open`, `-close`) rather than
overwriting; `deskdb.py` links suffixed reports correctly.

Append one line to `trading-desk/decision-log.md` with the marker
`*market*`:

```
| 2026-09-21 | *market* | Selective · risk-on, narrow | — | S&P +0.59%... |
```

**Put the verdict in the rating column.** That is what makes it scoreable: a
later run can pull every `*market*` row with `deskdb.py`, read what the verdict
was and what the tape did next, and find out whether "Favourable" days were
actually favourable. A verdict that is never checked is decoration.

That row is what lets a later run check whether the frame held.

## Guardrails

**Date every claim.** "Oil is rallying" is meaningless without a level and a
time. Markets move while the report is being written.

**Describe, do not predict.** This skill says what happened and what is priced.
It does not forecast the next move, and where it offers judgement it labels it
as judgement.

**Report what could not be sourced.** Breadth and flows are frequently
unobtainable through the tooling available here. An honest "breadth could not
be sourced" is worth more than an impression presented as a measurement.

**Third-party judgements carry their interest.** When citing a rating agency, a
broker or a company statement, name whose interest it serves and what it costs
them to be wrong. A target board disparaging a hostile bidder and a rating
agency publishing a downgrade are not equivalent evidence.

Every report carries:

> Research scaffold, not financial or investment advice. LLM-generated analysis
> varies between runs and can be wrong. Verify independently before trading.
