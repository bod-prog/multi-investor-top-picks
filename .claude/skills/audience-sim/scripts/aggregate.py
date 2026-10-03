#!/usr/bin/env python3
"""Merge cohort responses into a retention curve, drop-off hotspots and a self-contained HTML report.

Usage: python3 aggregate.py <workdir> [--title "Video name"]
Reads  <workdir>/timeline.json, panel.json, responses/*.json
Writes <workdir>/summary.json and <workdir>/report.html
"""
import argparse
import glob
import html
import json
import os
import statistics
from collections import Counter, defaultdict

BOOL_FIELDS = ["completed", "liked", "commented", "shared", "followed", "rewatched", "understood_message"]


def load(workdir):
    timeline = json.load(open(os.path.join(workdir, "timeline.json"), encoding="utf-8"))
    panel = json.load(open(os.path.join(workdir, "panel.json"), encoding="utf-8"))
    viewers = {v["id"]: v for v in panel["viewers"]}
    responses, problems = {}, []
    for path in sorted(glob.glob(os.path.join(workdir, "responses", "*.json"))):
        try:
            data = json.load(open(path, encoding="utf-8"))
        except json.JSONDecodeError as e:
            problems.append(f"{os.path.basename(path)}: invalid JSON ({e})")
            continue
        for r in data if isinstance(data, list) else data.get("viewers", []):
            if r.get("id") in viewers:
                responses[r["id"]] = r
            else:
                problems.append(f"{os.path.basename(path)}: unknown viewer id {r.get('id')}")
    missing = [vid for vid in viewers if vid not in responses]
    return timeline, panel, viewers, responses, problems, missing


def clean(r, duration):
    w = r.get("watched_to_s")
    w = duration if r.get("completed") else float(w if isinstance(w, (int, float)) else 0)
    r["watched_to_s"] = max(0.0, min(duration, w))
    r["completed"] = bool(r.get("completed")) or r["watched_to_s"] >= duration - 0.25
    for f in BOOL_FIELDS:
        r[f] = bool(r.get(f))
    for f in ("hook_score", "overall_score"):
        try:
            r[f] = max(1, min(10, int(r.get(f))))
        except (TypeError, ValueError):
            r[f] = None
    return r


def retention_curve(watched, duration, step):
    n = len(watched)
    pts, t = [], 0.0
    while t <= duration + 1e-9:
        pts.append((round(t, 2), sum(1 for w in watched if w >= t - 1e-9) / n if n else 0))
        t += step
    if pts[-1][0] < duration:
        pts.append((duration, sum(1 for w in watched if w >= duration - 0.25) / n if n else 0))
    return pts


def beat_for(t, beats):
    for b in beats:
        if b["start"] <= t < b["end"]:
            return b
    return beats[-1] if beats else None


def summarise(timeline, panel, viewers, responses):
    duration = timeline["meta"]["duration"]
    rs = [clean(dict(r), duration) for r in responses.values()]
    n = len(rs)
    watched = [r["watched_to_s"] for r in rs]
    step = 0.5 if duration <= 30 else 1 if duration <= 120 else 5 if duration <= 900 else 15
    curve = retention_curve(watched, duration, step)

    def share(pred):
        return round(sum(1 for r in rs if pred(r)) / n, 3) if n else 0

    # Drop-off hotspots: group exits by beat.
    exits = defaultdict(list)
    for r in rs:
        if not r["completed"]:
            b = beat_for(r["watched_to_s"], timeline["beats"])
            exits[(b["start"], b["end"]) if b else (0, 0)].append(r)
    hotspots = sorted(exits.items(), key=lambda kv: len(kv[1]), reverse=True)[:6]

    by_segment = defaultdict(list)
    for r in rs:
        by_segment[viewers[r["id"]]["segment"]].append(r)

    def seg_stats(group):
        return {
            "viewers": len(group),
            "avg_watch_share": round(statistics.mean(r["watched_to_s"] for r in group) / duration, 3),
            "completion": round(sum(r["completed"] for r in group) / len(group), 3),
            "avg_overall": round(statistics.mean(r["overall_score"] for r in group if r["overall_score"]), 1)
            if any(r["overall_score"] for r in group) else None,
        }

    def moments(key):
        c = Counter()
        for r in rs:
            m = r.get(key)
            if isinstance(m, (int, float)):
                b = beat_for(m, timeline["beats"])
                if b:
                    c[(b["start"], b["end"])] += 1
        return [{"start": a, "end": b, "votes": v} for (a, b), v in c.most_common(5)]

    hooks = [r["hook_score"] for r in rs if r["hook_score"]]
    overall = [r["overall_score"] for r in rs if r["overall_score"]]
    return {
        "viewers": n,
        "duration_s": duration,
        "avg_view_duration_s": round(statistics.mean(watched), 1) if n else 0,
        "avg_percentage_viewed": round(statistics.mean(watched) / duration, 3) if n else 0,
        "median_watch_s": round(statistics.median(watched), 1) if n else 0,
        "stayed_past_3s": share(lambda r: r["watched_to_s"] >= min(3, duration)),
        "completion_rate": share(lambda r: r["completed"]),
        "like_rate": share(lambda r: r["liked"]),
        "comment_rate": share(lambda r: r["commented"]),
        "share_rate": share(lambda r: r["shared"]),
        "follow_rate": share(lambda r: r["followed"]),
        "rewatch_rate": share(lambda r: r["rewatched"]),
        "understood_rate": share(lambda r: r["understood_message"]),
        "avg_hook_score": round(statistics.mean(hooks), 1) if hooks else None,
        "avg_overall_score": round(statistics.mean(overall), 1) if overall else None,
        "curve": curve,
        "hotspots": [{
            "start": a, "end": b, "exits": len(group),
            "speech": (beat_for(a, timeline["beats"]) or {}).get("speech", ""),
            "reasons": top_texts(g.get("exit_reason") for g in group),
            "fixes": top_texts(g.get("fix_suggestion") for g in group),
        } for (a, b), group in hotspots],
        "best_moments": moments("best_moment_s"),
        "worst_moments": moments("worst_moment_s"),
        "segments": {k: seg_stats(v) for k, v in by_segment.items()},
        "sound_off": seg_stats([r for r in rs if not viewers[r["id"]]["sound_on"]]) if any(not viewers[r["id"]]["sound_on"] for r in rs) else None,
        "comments": [{"id": r["id"], "text": r["comment_text"]} for r in rs if r.get("comment_text")][:20],
        "voices": [{"id": r["id"], "segment": viewers[r["id"]]["segment"], "watched_to_s": r["watched_to_s"],
                    "text": r.get("inner_voice", "")} for r in rs if r.get("inner_voice")],
    }


def top_texts(texts, k=6):
    """Most frequent texts first, with a count when repeated."""
    c = Counter(t.strip() for t in texts if t and t.strip())
    return [f"{t} (×{n})" if n > 1 else t for t, n in c.most_common(k)]


def pct(x):
    return f"{x * 100:.0f}%"


def fmt_t(s):
    s = float(s)
    return f"{int(s // 60)}:{s % 60:04.1f}" if s >= 60 else f"{s:.1f} с"


def svg_curve(curve, duration, hotspots):
    W, H, L, B, T, R = 760, 300, 44, 34, 14, 30
    pw, ph = W - L - R, H - T - B
    x = lambda t: L + pw * t / duration if duration else L
    y = lambda v: T + ph * (1 - v)
    path = " ".join(f"{'M' if i == 0 else 'L'}{x(t):.1f},{y(v):.1f}" for i, (t, v) in enumerate(curve))
    area = path + f" L{x(curve[-1][0]):.1f},{y(0):.1f} L{x(0):.1f},{y(0):.1f} Z"
    grid = "".join(
        f'<line x1="{L}" x2="{W - R}" y1="{y(v):.1f}" y2="{y(v):.1f}" class="grid"/>'
        f'<text x="{L - 8}" y="{y(v) + 4:.1f}" class="axis" text-anchor="end">{int(v * 100)}%</text>'
        for v in (0, 0.25, 0.5, 0.75, 1))
    ticks = 6
    xt = "".join(f'<text x="{x(duration * i / ticks):.1f}" y="{H - 10}" class="axis" text-anchor="middle">'
                 f'{fmt_t(duration * i / ticks)}</text>' for i in range(ticks + 1))
    bands = "".join(f'<rect x="{x(h["start"]):.1f}" y="{T}" width="{max(2, x(h["end"]) - x(h["start"])):.1f}" '
                    f'height="{ph}" class="hot"><title>{h["exits"]} пішли тут</title></rect>' for h in hotspots[:3])
    return (f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Крива утримання">{bands}{grid}'
            f'<path d="{area}" class="area"/><path d="{path}" class="line"/>{xt}</svg>')


def render_html(s, title, timeline):
    e = html.escape
    kpis = [("Залишились після 3 с", pct(s["stayed_past_3s"])), ("Додивились до кінця", pct(s["completion_rate"])),
            ("Середній перегляд", f'{fmt_t(s["avg_view_duration_s"])} · {pct(s["avg_percentage_viewed"])}'),
            ("Оцінка хука", f'{s["avg_hook_score"]}/10'), ("Загальна оцінка", f'{s["avg_overall_score"]}/10'),
            ("Лайки · коменти · репости", f'{pct(s["like_rate"])} · {pct(s["comment_rate"])} · {pct(s["share_rate"])}'),
            ("Підписки", pct(s["follow_rate"])), ("Зрозуміли посил", pct(s["understood_rate"]))]
    kpi_html = "".join(f'<div class="kpi"><div class="v">{e(v)}</div><div class="k">{e(k)}</div></div>' for k, v in kpis)

    hot_html = "".join(
        f'<div class="card"><div class="when">{fmt_t(h["start"])}–{fmt_t(h["end"])} · <b>{h["exits"]}</b> пішли</div>'
        + (f'<div class="speech">«{e(h["speech"][:160])}»</div>' if h["speech"] else "")
        + "<ul>" + "".join(f"<li>{e(r)}</li>" for r in h["reasons"][:5]) + "</ul>"
        + ("<div class='fix'><b>Що б їх втримало:</b> " + " · ".join(e(f) for f in h["fixes"][:3]) + "</div>" if h["fixes"] else "")
        + "</div>" for h in s["hotspots"])

    seg_rows = "".join(f'<tr><td>{e(k)}</td><td>{v["viewers"]}</td><td>{pct(v["avg_watch_share"])}</td>'
                       f'<td>{pct(v["completion"])}</td><td>{v["avg_overall"] or "–"}</td></tr>'
                       for k, v in sorted(s["segments"].items(), key=lambda kv: -kv[1]["viewers"]))
    if s["sound_off"]:
        v = s["sound_off"]
        seg_rows += (f'<tr class="muted"><td>без звуку (усі сегменти)</td><td>{v["viewers"]}</td><td>{pct(v["avg_watch_share"])}</td>'
                     f'<td>{pct(v["completion"])}</td><td>{v["avg_overall"] or "–"}</td></tr>')

    def mlist(items):
        return "".join(f"<li>{fmt_t(m['start'])}–{fmt_t(m['end'])}: {m['votes']}</li>" for m in items) or "<li>–</li>"

    voices = sorted(s["voices"], key=lambda v: v["watched_to_s"])
    pick = voices[:: max(1, len(voices) // 12)][:12]
    voice_html = "".join(f'<blockquote><p>{e(v["text"])}</p><cite>{e(v["segment"])} · дивився {fmt_t(v["watched_to_s"])}</cite></blockquote>' for v in pick)
    comments = "".join(f"<li>{e(c['text'])}</li>" for c in s["comments"]) or "<li>Ніхто не прокоментував.</li>"
    meta = timeline["meta"]

    return f"""<!doctype html><html lang="uk"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Тест на глядачах</title>
<style>
:root{{--bg:#f6f7f9;--fg:#16181d;--muted:#666d78;--card:#fff;--line:#e3e6ea;--accent:#14a385;--accent-soft:rgba(20,163,133,.14);--hot:rgba(229,72,77,.13)}}
@media (prefers-color-scheme:dark){{:root{{--bg:#111316;--fg:#eceef1;--muted:#9aa1ab;--card:#1a1d21;--line:#2a2e34;--accent:#3cc9a8;--accent-soft:rgba(60,201,168,.18);--hot:rgba(240,100,105,.2)}}}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}}
main{{max-width:880px;margin:0 auto;padding:28px 16px 60px}}h1{{font-size:26px;margin:0 0 4px}}h2{{font-size:18px;margin:34px 0 12px}}
.sub{{color:var(--muted)}}.kpis{{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;margin-top:20px}}
.kpi,.card,blockquote,table{{background:var(--card);border:1px solid var(--line);border-radius:12px}}.kpi{{padding:14px}}
.kpi .v{{font-size:22px;font-weight:700}}.kpi .k{{color:var(--muted);font-size:13px}}
svg{{width:100%;height:auto;background:var(--card);border:1px solid var(--line);border-radius:12px}}
.grid{{stroke:var(--line)}}.axis{{fill:var(--muted);font-size:11px}}.line{{fill:none;stroke:var(--accent);stroke-width:2.5}}.area{{fill:var(--accent-soft)}}.hot{{fill:var(--hot)}}
.card{{padding:14px 16px;margin-bottom:10px}}.when{{font-weight:600}}.speech{{color:var(--muted);font-style:italic;margin-top:4px}}.fix{{margin-top:8px;font-size:14px}}
ul{{margin:8px 0 0;padding-left:20px}}table{{width:100%;border-collapse:separate;border-spacing:0;overflow:hidden}}
th,td{{padding:9px 12px;text-align:left;border-bottom:1px solid var(--line)}}th{{color:var(--muted);font-weight:600;font-size:13px}}tr:last-child td{{border-bottom:0}}.muted td{{color:var(--muted)}}
.cols{{display:grid;grid-template-columns:1fr 1fr;gap:12px}}@media (max-width:640px){{.cols{{grid-template-columns:1fr}}}}
blockquote{{margin:0 0 10px;padding:12px 16px}}blockquote p{{margin:0}}cite{{color:var(--muted);font-size:13px;font-style:normal}}
.note{{margin-top:36px;color:var(--muted);font-size:13px}}
</style></head><body><main>
<h1>{e(title)}</h1>
<div class="sub">{s["viewers"]} симульованих глядачів · {fmt_t(meta["duration"])} · {meta["width"]}×{meta["height"]} · {e(" · ".join(str(v) for v in panel_context(timeline).values()))}</div>
<div class="kpis">{kpi_html}</div>
<h2>Крива утримання</h2>{svg_curve(s["curve"], s["duration_s"], s["hotspots"])}
<h2>Де глядачі йдуть</h2>{hot_html or "<p>Майже всі додивились.</p>"}
<h2>Сегменти аудиторії</h2><table><tr><th>Сегмент</th><th>Глядачів</th><th>Середній перегляд</th><th>До кінця</th><th>Оцінка</th></tr>{seg_rows}</table>
<div class="cols"><div><h2>Найкращі моменти</h2><ul>{mlist(s["best_moments"])}</ul></div><div><h2>Найгірші моменти</h2><ul>{mlist(s["worst_moments"])}</ul></div></div>
<h2>Що вони думали</h2>{voice_html}
<h2>Коментарі, які б написали</h2><ul>{comments}</ul>
<p class="note">Це симуляція: AI грає ролі глядачів. Цифри показують напрям, де шукати проблеми, а не реальну статистику. Порівнюй версії одного відео між собою і перевіряй висновки на реальній аналітиці після публікації.</p>
</main></body></html>"""


def panel_context(timeline):
    return timeline.get("panel_context", {})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("workdir")
    ap.add_argument("--title", default="Тест відео на глядачах")
    args = ap.parse_args()

    timeline, panel, viewers, responses, problems, missing = load(args.workdir)
    if not responses:
        raise SystemExit("no responses found in responses/*.json")
    timeline["panel_context"] = panel.get("context", {})
    s = summarise(timeline, panel, viewers, responses)
    s["problems"], s["missing_viewers"] = problems, missing
    with open(os.path.join(args.workdir, "summary.json"), "w", encoding="utf-8") as f:
        json.dump(s, f, ensure_ascii=False, indent=1)
    with open(os.path.join(args.workdir, "report.html"), "w", encoding="utf-8") as f:
        f.write(render_html(s, args.title, timeline))
    brief = {k: s[k] for k in ("viewers", "stayed_past_3s", "completion_rate", "avg_percentage_viewed",
                               "avg_hook_score", "avg_overall_score", "like_rate", "share_rate", "follow_rate")}
    brief["top_dropoffs"] = [f'{h["start"]}-{h["end"]}s: {h["exits"]}' for h in s["hotspots"][:3]]
    brief["missing_viewers"] = len(missing)
    brief["problems"] = problems[:5]
    print(json.dumps(brief, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
