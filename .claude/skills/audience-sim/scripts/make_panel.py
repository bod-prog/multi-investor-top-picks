#!/usr/bin/env python3
"""Build a reproducible panel of simulated viewers and split it into cohorts for the judge agents.

The audience is described in a small JSON file (all keys optional):
{
  "n": 100, "seed": 7, "platform": "shorts",          # shorts | reels | tiktok | youtube | other
  "language": "uk", "country": "Україна",
  "topic": "інвестиції для початківців",
  "segments": [                                       # who the video is for; shares are normalised
    {"name": "цільові новачки", "share": 0.5, "age": [18, 30], "interest": "high", "expertise": "novice"},
    {"name": "досвідчені", "share": 0.2, "age": [25, 45], "interest": "high", "expertise": "expert"},
    {"name": "випадкові скролери", "share": 0.3, "age": [16, 55], "interest": "low", "expertise": "novice"}
  ]
}
Without segments a default mix for the platform is used: most of a feed audience did not choose the video.

Usage: python3 make_panel.py <audience.json|-> <workdir> [--cohort-size 10]
Writes <workdir>/panel.json and <workdir>/cohorts/cohort_XX.json.
"""
import argparse
import json
import math
import os
import random

PLATFORM = {
    # sound_on: share watching with sound; feed: share who arrived from a feed rather than by choice
    "shorts": {"sound_on": 0.75, "feed": 0.85, "patience": (1.3, 0.8)},
    "reels": {"sound_on": 0.6, "feed": 0.85, "patience": (1.2, 0.8)},
    "tiktok": {"sound_on": 0.85, "feed": 0.9, "patience": (1.2, 0.8)},
    "youtube": {"sound_on": 0.95, "feed": 0.45, "patience": (3.4, 0.9)},
    "other": {"sound_on": 0.8, "feed": 0.5, "patience": (2.5, 1.0)},
}

DEFAULT_SEGMENTS = [
    {"name": "target viewers", "share": 0.45, "age": [18, 40], "interest": "high", "expertise": "mixed"},
    {"name": "adjacent interest", "share": 0.25, "age": [18, 55], "interest": "medium", "expertise": "mixed"},
    {"name": "random scrollers", "share": 0.30, "age": [14, 60], "interest": "low", "expertise": "novice"},
]

MOTIVES = ["learn something useful", "be entertained", "kill time", "find a product or deal", "stay up to date",
           "get inspired", "see something funny", "solve a specific problem", "follow a creator they like",
           "relax after work"]
PEEVES = ["slow intros", "clickbait that does not pay off", "too much text on screen", "loud music over speech",
          "talking head with no visuals", "obvious ads", "repetition", "low video quality", "fast unreadable text",
          "fake enthusiasm", "missing subtitles", "no clear point", "jargon", "long logo intros", "begging for likes"]
CONTEXTS = ["commuting on public transport", "in bed before sleep", "on a work break", "waiting in a queue",
            "on the sofa in the evening", "at lunch", "multitasking at a desk", "morning coffee"]
TEMPERAMENTS = ["skeptical", "curious", "impatient", "easily amused", "analytical", "distracted", "friendly",
                "critical", "loyal fan type", "trend-chaser"]
OCCUPATIONS = ["student", "office worker", "IT specialist", "entrepreneur", "teacher", "driver", "designer",
               "retail worker", "freelancer", "engineer", "medic", "parent on leave", "marketer", "retiree",
               "school pupil", "manager", "tradesperson", "accountant"]


def lognormal_patience(rng, mu_sigma, interest):
    mu, sigma = mu_sigma
    shift = {"high": 0.6, "medium": 0.0, "low": -0.6}.get(interest, 0.0)
    # Seconds of "nothing grabs me" a viewer tolerates before swiping/leaving.
    return round(min(600.0, math.exp(rng.gauss(mu + shift, sigma))), 1)


def pick_expertise(rng, e):
    if e in ("novice", "intermediate", "expert"):
        return e
    return rng.choices(["novice", "intermediate", "expert"], [0.5, 0.35, 0.15])[0]


def build(cfg, cohort_size):
    rng = random.Random(cfg.get("seed", 7))
    n = int(cfg.get("n", 100))
    plat_name = cfg.get("platform", "shorts")
    plat = PLATFORM.get(plat_name, PLATFORM["other"])
    segments = cfg.get("segments") or DEFAULT_SEGMENTS
    total = sum(s.get("share", 1) for s in segments)

    # Largest-remainder allocation so the panel has exactly n people.
    raw = [n * s.get("share", 1) / total for s in segments]
    counts = [int(r) for r in raw]
    for i in sorted(range(len(raw)), key=lambda i: raw[i] - counts[i], reverse=True)[: n - sum(counts)]:
        counts[i] += 1

    panel = []
    for seg, count in zip(segments, counts):
        lo, hi = seg.get("age", [16, 60])
        for _ in range(count):
            interest = seg.get("interest", "medium")
            p = {
                "id": f"v{len(panel) + 1:03d}",
                "segment": seg.get("name", "general"),
                "age": rng.randint(lo, hi),
                "gender": rng.choice(["female", "male"]) if rng.random() < 0.97 else "non-binary",
                "occupation": rng.choice(OCCUPATIONS),
                "interest_in_topic": interest,
                "expertise": pick_expertise(rng, seg.get("expertise", "mixed")),
                "temperament": rng.choice(TEMPERAMENTS),
                "motive": rng.choice(MOTIVES),
                "pet_peeves": rng.sample(PEEVES, 2),
                "context": rng.choice(CONTEXTS),
                "arrived_from": "feed" if rng.random() < plat["feed"] else "search/subscription",
                "sound_on": rng.random() < plat["sound_on"],
                "patience_s": lognormal_patience(rng, plat["patience"], interest),
                "follows_creator": rng.random() < (0.15 if interest == "high" else 0.03),
            }
            if seg.get("notes"):
                p["segment_notes"] = seg["notes"]
            panel.append(p)

    rng.shuffle(panel)  # mix segments across cohorts so no judge sees a one-sided group
    cohorts = [panel[i:i + cohort_size] for i in range(0, len(panel), cohort_size)]
    context = {k: cfg.get(k) for k in ("platform", "language", "country", "topic") if cfg.get(k)}
    context.setdefault("platform", plat_name)
    return panel, cohorts, context


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audience")
    ap.add_argument("workdir")
    ap.add_argument("--cohort-size", type=int, default=10)
    args = ap.parse_args()

    cfg = {} if args.audience == "-" else json.load(open(args.audience, encoding="utf-8"))
    panel, cohorts, context = build(cfg, args.cohort_size)
    os.makedirs(os.path.join(args.workdir, "cohorts"), exist_ok=True)
    with open(os.path.join(args.workdir, "panel.json"), "w", encoding="utf-8") as f:
        json.dump({"context": context, "viewers": panel}, f, ensure_ascii=False, indent=1)
    for i, c in enumerate(cohorts, 1):
        with open(os.path.join(args.workdir, "cohorts", f"cohort_{i:02d}.json"), "w", encoding="utf-8") as f:
            json.dump({"context": context, "viewers": c}, f, ensure_ascii=False, indent=1)

    seg_counts = {}
    for p in panel:
        seg_counts[p["segment"]] = seg_counts.get(p["segment"], 0) + 1
    print(json.dumps({"viewers": len(panel), "cohorts": len(cohorts), "segments": seg_counts,
                      "median_patience_s": sorted(p["patience_s"] for p in panel)[len(panel) // 2]},
                     ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
