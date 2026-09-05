# Report template

Use this structure for the saved run report. Keep the headings verbatim — the
decision log and any later run that reads a past report rely on finding them.

Drop a section only when the phase genuinely did not run (e.g. the Fundamentals
Analyst at `quick` depth); write "Not run at `quick` depth" under the heading
rather than deleting it, so a reader can tell the difference between "no signal"
and "not looked at".

---

```markdown
# <TICKER> — <Company / Asset name>
**Analysis date**: <YYYY-MM-DD> · **Depth**: <quick | standard | deep>

## Decision
**Rating**: <Buy | Overweight | Hold | Underweight | Sell>
**Executive Summary**: <entry, sizing, key risk levels, horizon>
**Investment Thesis**: <reasoning cited to the debates>
**Price Target**: <level, or "not set">
**Time Horizon**: <e.g. 3–6 months, or "not set">

## Verified data snapshot
As of <date/time and source>:
- Last close: <value>
- Range (1W / 1M / YTD): <values>
- Market cap: <value>
- <anything else fetched, with its source>

Unavailable: <list what could not be sourced — this matters as much as what could>

## Analyst reports
### Technical
### Fundamentals
### News & macro
### Sentiment
**Band**: <Bullish | Mildly Bullish | Neutral | Mixed | Mildly Bearish | Bearish>
· **Score**: <0–10> · **Confidence**: <low | medium | high>

## Researcher debate
### Bull
### Bear
### Research Manager ruling
**Recommendation**: <rating>
**Rationale**:
**Strategic Actions**:

## Trader proposal
**Action**: <Buy | Hold | Sell>
**Reasoning**:
**Entry Price**: · **Stop Loss**: · **Position Sizing**:

## Risk review
### Aggressive
### Conservative
### Neutral

## Prior decisions on this ticker
<What the decision log holds, what it would have returned by now, and whether
that changed anything above. Write "None" on a first run.>

---
> Research scaffold, not financial or investment advice. LLM-generated analysis
> varies between runs and can be wrong. Verify independently before trading.
```

## Notes on filling it in

The report is read by two audiences: the user now, and a future run of this
skill on the same ticker. That second reader is why the snapshot section lists
what was *unavailable* — a later run that sees "options data unavailable" knows
not to treat the absence of a positioning read as a bearish signal.

Keep the analyst sections dense. Whole paragraphs restating the ticker's
business are filler; specific numbers, dates, and named events are what the
debate can actually use.
