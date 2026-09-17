#!/usr/bin/env python3
"""
deskdb — a searchable index over trading-desk/decision-log.md

The markdown log stays the source of truth: it lives in git, diffs readably,
and every skill keeps appending to it exactly as before. This builds a
throwaway SQLite index on top of it so the log can be queried instead of
read end to end. Delete the database at any time and rebuild it.

Usage:
    deskdb.py build                 rebuild the index from the markdown
    deskdb.py search "<query>"      full-text search across notes
    deskdb.py ticker GME            every row touching one ticker
    deskdb.py rating Hold           every row with a given rating
    deskdb.py method                the accumulated method rules
    deskdb.py timeline              compact chronological view
    deskdb.py stats                 counts and distributions

Options:
    --full      print whole notes instead of match snippets
    --json      machine-readable output
    --limit N   cap results (default 20)

No dependencies beyond the standard library.
"""

import argparse
import json
import os
import re
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG = os.path.join(ROOT, "decision-log.md")
DB = os.path.join(ROOT, "tools", ".deskdb.sqlite3")
REPORTS = os.path.join(ROOT, "reports")

DASHES = {"—", "–", "-", ""}
RATINGS = ["Buy", "Overweight", "Hold", "Underweight", "Sell"]

# Non-ticker rows mark themselves with *asterisks* in the ticker column.
KINDS = {
    "top-picks": "shortlist",
    "method": "method",
    "portfolio flag": "flag",
    "macro correction": "correction",
}


def clean(cell):
    """Strip markdown emphasis and whitespace from a table cell."""
    return re.sub(r"\*\*|\*", "", cell).strip()


def is_blank(cell):
    return cell.strip().strip("*") in DASHES


def parse_price(raw):
    """First dollar figure in the cell, or None. Keeps the raw text intact."""
    m = re.search(r"\$\s*([\d,]+(?:\.\d+)?)", raw)
    return float(m.group(1).replace(",", "")) if m else None


def normalise_rating(raw):
    """Map 'Overweight (weakest of 3)' -> 'Overweight'. None for non-decisions."""
    for r in RATINGS:
        if re.match(rf"^{r}\b", raw, re.I):
            return r
    return None


def parse_log(path):
    """Parse the markdown table into records.

    Method and flag rows carry no date of their own -- they belong to the run
    they were logged under. We carry the last seen date forward as
    `date_effective` so those rows stay reachable by date.
    """
    rows = []
    last_date = None
    unknown = set()
    with open(path, encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, 1):
            line = line.rstrip("\n")
            if not line.startswith("|"):
                continue
            cells = [c for c in line.split("|")[1:-1]]
            if len(cells) < 5:
                continue
            date_raw, who_raw, rating_raw, price_raw, note = (
                cells[0], cells[1], cells[2], cells[3], "|".join(cells[4:])
            )
            who = clean(who_raw)
            # Skip the header and its separator.
            if who.lower() == "ticker" or set(who) <= {"-", " "}:
                continue

            # A ticker column wrapped in *asterisks* is a marker, never a
            # ticker. Known markers get their own kind; unknown ones fall back
            # to a generic note so a marker invented in a later run cannot
            # silently be indexed as a company.
            marked = who_raw.strip().startswith("*")
            marker = who.strip("*").strip().lower()
            if marked:
                kind = KINDS.get(marker, "note")
                if marker not in KINDS:
                    unknown.add(marker)
                ticker = None
            else:
                kind, ticker = "decision", who.upper()

            date = clean(date_raw)
            if is_blank(date):
                date = None
            else:
                last_date = date

            rating = clean(rating_raw)
            eff = date or last_date

            # A decision or shortlist row has its own report. A method, flag or
            # correction row was logged under the run above it, so it inherits
            # that run's report rather than claiming one of its own.
            report = None
            if kind in ("decision", "shortlist") and eff:
                stem = ticker if kind == "decision" else "top-picks"
                cand = os.path.join(REPORTS, f"{stem}-{eff}.md")
                if os.path.exists(cand):
                    report = os.path.relpath(cand, os.path.dirname(ROOT))
            elif rows:
                report = rows[-1]["report"]

            rows.append({
                "lineno": lineno,
                "date": date,
                "date_effective": eff,
                "kind": kind,
                "ticker": ticker,
                "label": rating if kind != "decision" else None,
                "rating": normalise_rating(rating),
                "rating_raw": rating,
                "price_raw": clean(price_raw) if not is_blank(price_raw) else None,
                "price": parse_price(price_raw),
                "note": note.strip(),
                "report": report,
            })
    if unknown:
        print(f"note: unrecognised row markers indexed as 'note': "
              f"{', '.join(sorted(unknown))}", file=sys.stderr)
    return rows


def build(verbose=True):
    if not os.path.exists(LOG):
        sys.exit(f"decision log not found: {LOG}")
    rows = parse_log(LOG)
    if os.path.exists(DB):
        os.remove(DB)
    con = sqlite3.connect(DB)
    con.executescript("""
        CREATE TABLE entries (
            id INTEGER PRIMARY KEY,
            lineno INTEGER, date TEXT, date_effective TEXT,
            kind TEXT, ticker TEXT,
            label TEXT, rating TEXT, rating_raw TEXT,
            price_raw TEXT, price REAL,
            note TEXT, report TEXT
        );
        CREATE INDEX i_ticker ON entries(ticker);
        CREATE INDEX i_kind   ON entries(kind);
        CREATE INDEX i_rating ON entries(rating);
        CREATE INDEX i_date   ON entries(date_effective);
        CREATE VIRTUAL TABLE fts USING fts5(
            note, ticker, rating_raw, label,
            content='entries', content_rowid='id', tokenize='porter unicode61'
        );
    """)
    cols = ("lineno", "date", "date_effective", "kind", "ticker", "label",
            "rating", "rating_raw", "price_raw", "price", "note", "report")
    con.executemany(
        f"INSERT INTO entries ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})",
        [tuple(r[c] for c in cols) for r in rows],
    )
    con.execute("INSERT INTO fts(fts) VALUES('rebuild')")
    con.commit()
    if verbose:
        kinds = {}
        for r in rows:
            kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
        shape = " · ".join(f"{v} {k}" for k, v in sorted(kinds.items()))
        linked = sum(1 for r in rows if r["report"])
        print(f"indexed {len(rows)} entries ({shape}) — {linked} linked to reports")
        print(f"db: {os.path.relpath(DB, os.path.dirname(ROOT))} (derived, gitignored)")
    con.close()
    return rows


def connect():
    if not os.path.exists(DB) or os.path.getmtime(DB) < os.path.getmtime(LOG):
        build(verbose=False)          # stale or missing: rebuild silently
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    return con


def fmt(rows, full=False, as_json=False, snippets=None):
    if as_json:
        out = [dict(r) for r in rows]
        print(json.dumps(out, indent=2, ensure_ascii=False))
        return
    if not rows:
        print("no matches")
        return
    for i, r in enumerate(rows):
        who = r["ticker"] or f"*{r['kind']}*"
        date = r["date_effective"] or "—"
        head = f"{date}  {who:<10}"
        if r["rating_raw"]:
            head += f" {r['rating_raw']}"
        if r["price_raw"]:
            head += f"  @ {r['price_raw']}"
        print(f"\n\033[1m{head}\033[0m")
        if r["report"]:
            print(f"  report: {r['report']}")
        body = r["note"] if full else (snippets[i] if snippets else r["note"][:300] + ("…" if len(r["note"]) > 300 else ""))
        for line in body.split("\n"):
            print(f"  {line}")
    print(f"\n{len(rows)} result(s)")


FTS_OPS = {"AND", "OR", "NOT", "NEAR"}


def sanitise(query):
    """Neutralise stray punctuation without destroying boolean intent.

    FTS5 rejects terms like "BBB-" or "$25.27" outright. Quoting the whole
    query would fix the syntax but silently turn "BBB- AND junk" into a phrase
    search that matches nothing, so each token is quoted individually and
    genuine operators are left alone.
    """
    out = []
    for tok in query.split():
        if tok.upper() in FTS_OPS or re.fullmatch(r"[A-Za-z0-9_]+\*?", tok):
            out.append(tok)
        else:
            out.append('"' + tok.replace('"', '""') + '"')
    return " ".join(out)


def q_search(args):
    con = connect()
    sql = """SELECT e.*, snippet(fts, 0, '\033[1;33m', '\033[0m', ' … ', 24) AS snip
             FROM fts JOIN entries e ON e.id = fts.rowid
             WHERE fts MATCH ? ORDER BY rank LIMIT ?"""
    # Try the query verbatim first so real FTS5 syntax still works, then fall
    # back to progressively blunter rewrites.
    attempts = [args.query, sanitise(args.query),
                '"' + args.query.replace('"', "") + '"']
    for attempt in attempts:
        try:
            rows = con.execute(sql, (attempt, args.limit)).fetchall()
            break
        except sqlite3.OperationalError:
            continue
    else:
        sys.exit(f"could not parse query: {args.query!r}")
    fmt(rows, args.full, args.json, [r["snip"] for r in rows])


def q_ticker(args):
    con = connect()
    t = args.name.upper()
    # The ticker's own calls come first; rows that merely mention it follow.
    rows = con.execute(
        "SELECT * FROM entries WHERE ticker = ? OR note LIKE ? "
        "ORDER BY (ticker = ?) DESC, date_effective, lineno LIMIT ?",
        (t, f"%{t}%", t, args.limit)).fetchall()
    own = [r for r in rows if r["ticker"] == t]
    if own:
        prices = [(r["date_effective"], r["price"], r["rating"]) for r in own if r["price"]]
        if prices:
            print(f"\033[1m{t} — desk calls\033[0m")
            for d, p, rt in prices:
                print(f"  {d}  {rt or '—':<12} ${p:,.2f}")
    fmt(rows, args.full, args.json)


def q_rating(args):
    con = connect()
    rows = con.execute(
        "SELECT * FROM entries WHERE rating = ? COLLATE NOCASE ORDER BY date_effective, lineno LIMIT ?",
        (args.name, args.limit)).fetchall()
    fmt(rows, args.full, args.json)


def q_method(args):
    con = connect()
    rows = con.execute(
        "SELECT * FROM entries WHERE kind IN ('method','flag','correction','note') "
        "ORDER BY date_effective, lineno LIMIT ?", (args.limit,)).fetchall()
    fmt(rows, args.full, args.json)


def q_timeline(args):
    con = connect()
    rows = con.execute(
        "SELECT * FROM entries ORDER BY lineno LIMIT ?", (args.limit,)).fetchall()
    if args.json:
        fmt(rows, as_json=True)
        return
    for r in rows:
        who = r["ticker"] or f"*{r['kind']}*"
        date = r["date_effective"] or "—"
        rating = r["rating_raw"][:26] if r["rating_raw"] else ""
        price = r["price_raw"] or ""
        print(f"{date}  {who:<18} {rating:<28} {price}")
    print(f"\n{len(rows)} entries")


def q_stats(args):
    con = connect()
    def tally(sql):
        return con.execute(sql).fetchall()
    print("\033[1mby kind\033[0m")
    for r in tally("SELECT kind, COUNT(*) n FROM entries GROUP BY kind ORDER BY n DESC"):
        print(f"  {r['kind']:<12} {r['n']}")
    print("\n\033[1mratings issued\033[0m")
    for r in tally("SELECT rating, COUNT(*) n FROM entries WHERE rating IS NOT NULL "
                   "GROUP BY rating ORDER BY n DESC"):
        print(f"  {r['rating']:<12} {r['n']}")
    print("\n\033[1mcoverage\033[0m")
    row = con.execute(
        "SELECT COUNT(*) n, COUNT(report) linked, MIN(date_effective) a, MAX(date_effective) b, "
        "SUM(LENGTH(note)) chars FROM entries").fetchone()
    print(f"  entries        {row['n']}")
    print(f"  linked reports {row['linked']}")
    print(f"  span           {row['a']} → {row['b']}")
    print(f"  note text      {row['chars']:,} chars")
    tickers = con.execute(
        "SELECT COUNT(DISTINCT ticker) n FROM entries WHERE ticker IS NOT NULL").fetchone()
    print(f"  tickers        {tickers['n']}")


def main():
    # Shared options are attached to every subcommand as well as the root, so
    # both "deskdb --full search x" and "deskdb search x --full" work.
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--full", action="store_true", help="print whole notes")
    common.add_argument("--json", action="store_true", help="machine-readable output")
    common.add_argument("--limit", type=int, default=20, help="cap results (default 20)")

    p = argparse.ArgumentParser(prog="deskdb", description=__doc__, parents=[common],
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    def add(name, **kw):
        return sub.add_parser(name, parents=[common], **kw)

    add("build").set_defaults(fn=lambda a: build())
    s = add("search"); s.add_argument("query"); s.set_defaults(fn=q_search)
    s = add("ticker"); s.add_argument("name"); s.set_defaults(fn=q_ticker)
    s = add("rating"); s.add_argument("name"); s.set_defaults(fn=q_rating)
    add("method").set_defaults(fn=q_method)
    add("timeline").set_defaults(fn=q_timeline)
    add("stats").set_defaults(fn=q_stats)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        # Something downstream closed the pipe (typically `| head`). Redirect
        # stdout to devnull so the interpreter's own flush cannot raise again.
        os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        sys.exit(0)
    except KeyboardInterrupt:
        sys.exit(130)
