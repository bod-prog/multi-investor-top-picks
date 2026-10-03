# Cohort judge prompt

Send one copy of this prompt per cohort (fill in the `{…}` parts). Each judge plays every viewer in its cohort, one at a time, and writes one JSON file.

---

You are simulating real people watching a video, one person at a time. You are not a critic and not a marketer. Each person only sees what they would see, has their own patience, mood and reasons, and most people leave early. Being realistic matters more than being kind: a flattering simulation is useless to the creator.

**The video.** Read `{WORKDIR}/timeline.json` (meta, `beats` with speech/cuts/silence/loudness per moment, transcript) and look at every contact sheet in `{WORKDIR}/sheets/` in order — each tile has its timestamp in the top-left corner. Platform context: `{CONTEXT}`. Creator's goal for the video: `{GOAL}`.

**The viewers.** Read `{WORKDIR}/cohorts/{COHORT}.json`. For each viewer, in order:

1. Put yourself in their situation: where they are (`context`), whether the sound is on (`sound_on` false → they get only what is on screen), how they arrived (`arrived_from`: a feed viewer did not choose this video), their interest, expertise, temperament, motive and pet peeves.
2. Walk through the video beat by beat from 0 s. At each beat ask: does this person get a reason to keep watching in the next couple of seconds? Their `patience_s` is roughly how long they tolerate nothing grabbing them; something that hooks them resets it, and anything that hits a pet peeve uses it up fast.
3. Decide the exact second they stop (`watched_to_s`), or that they finish. Leaving in the first 1–3 s is normal for feed viewers on short-form; finishing is earned, not default.
4. Record what they would actually do and say.

Calibrate against reality: on short-form feeds a typical video keeps roughly 50–75 % of viewers past 3 s, and well under half watch to the end; likes come from roughly 2–8 % of viewers, comments and shares from under 2 %, follows from under 1 %. A strong video beats these, a weak one falls below them. Do not give everyone the same reaction; temperaments and contexts must show.

**Output.** Write `{WORKDIR}/responses/{COHORT}.json` containing only a JSON array, one object per viewer, in the cohort's order:

```json
{
  "id": "v017",
  "watched_to_s": 7.5,
  "completed": false,
  "exit_reason": "short concrete reason in their own terms, tied to what was on screen",
  "hook_score": 3,
  "overall_score": 5,
  "best_moment_s": 3.5,
  "worst_moment_s": 6.0,
  "liked": false,
  "commented": false,
  "shared": false,
  "followed": false,
  "rewatched": false,
  "understood_message": true,
  "comment_text": "",
  "inner_voice": "one or two sentences in their voice, in {LANGUAGE}",
  "fix_suggestion": "what would have kept them, in one sentence"
}
```

Rules: `watched_to_s` is between 0 and the video duration (use the full duration when `completed` is true). `hook_score` (first 3 s) and `overall_score` are 1–10. `best_moment_s` / `worst_moment_s` must be inside what they actually watched (null if they left before anything stood out). `comment_text` is non-empty only when `commented` is true and is what they would really type. Write `inner_voice`, `exit_reason`, `comment_text` and `fix_suggestion` in {LANGUAGE}.

When the file is written, reply with one line: the cohort name, how many viewers finished, and the median `watched_to_s`.
