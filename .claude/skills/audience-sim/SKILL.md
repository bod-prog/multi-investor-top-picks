---
name: audience-sim
description: Test a video on a panel of simulated viewers (100 by default) before publishing — each viewer has their own age, interest, patience, mood, sound on/off and pet peeves, "watches" the video frame by frame, and decides the second they swipe away. Produces a retention curve, the exact drop-off moments with reasons, segment breakdown, predicted likes/comments/shares, and concrete fixes, as an HTML report. Use when the user wants to test, check, score or predict how viewers react to a video, reel, short, TikTok, ad or YouTube video, asks where people will stop watching, wants to compare two versions of a video, or mentions "100 viewers", synthetic audience or pre-publish testing.
---

# Audience simulation

Reply to the user in their language. Everything runs inside the session: ffmpeg + Python for preparation, parallel subagents for the viewers, Python for the report. No API keys.

## What you need from the user

- **The video file.** A local path (in the repo or uploaded into the session). A link alone is not enough: there is no downloader in the session, so ask them to upload the file. If there is no video yet, the skill can also test a script or storyboard: write it as a `.txt`/`.srt` and skip to step 2 with a timeline you write yourself (see "Script-only mode").
- **Who it is for** (optional, but it changes the result a lot): platform, language/country, topic, the target viewer, and the goal of the video (views, follows, sales, teaching). If the user gave none, use defaults and say which ones.
- **Transcript** (optional): an `.srt`/`.vtt`/`.txt`. Without one, viewers with sound on only get what is on screen plus the audio level; say so in the report summary if the video relies on speech.

## Workflow

Let `SKILL=.claude/skills/audience-sim` and `WORK=audience-runs/<video-name>-<YYYYMMDD-HHMM>` (inside the working directory, so the user can open the report).

1. **Prepare the video.**
   `python3 $SKILL/scripts/prepare_video.py <video> $WORK [--transcript file]`
   Look at one or two contact sheets yourself to understand the video, and write the creator's goal into one sentence.

2. **Describe the audience and build the panel.** Write `$WORK/audience.json` (format in the docstring of `scripts/make_panel.py`: `n`, `seed`, `platform`, `language`, `country`, `topic`, `segments` with `share`, `age`, `interest`, `expertise`, optional `notes`). Always keep a share of low-interest feed viewers for feed platforms — they are most of the real audience. Then:
   `python3 $SKILL/scripts/make_panel.py $WORK/audience.json $WORK --cohort-size 10`

3. **Tell the user the cost before running.** 100 viewers = 10 judge subagents, each reading all contact sheets once. Roughly: a 15–60 s short is cheap (a few minutes), a 10-minute video costs noticeably more because of the frame count; for videos over 20 minutes suggest 30–50 viewers or a larger `--every`. If the user already asked for the run, just state the plan in one line and go.

4. **Run the judges in parallel.** `mkdir -p $WORK/responses`. Read `references/judge-prompt.md`, fill in `{WORKDIR}` (absolute path), `{COHORT}` (e.g. `cohort_03`), `{CONTEXT}` (platform + language + country + topic), `{GOAL}` and `{LANGUAGE}` (the audience's language). Launch one `general-purpose` Agent per cohort, **all in a single message** so they run concurrently. Wait for all of them.

5. **Check and fill gaps.** `python3 $SKILL/scripts/aggregate.py $WORK --title "<video name>"` prints `missing_viewers` and `problems`. If a cohort file is missing or invalid, re-run only that cohort's judge, then aggregate again.

6. **Read the results critically** (`$WORK/summary.json`). Sanity-check against the calibration ranges in the judge prompt; if every viewer behaved the same or the numbers are implausibly rosy, re-run the worst cohort with a reminder to be realistic. Then look at the contact sheets around each top drop-off yourself, so your advice is about what is actually on screen.

7. **Report to the user.** Lead with three numbers (stayed past 3 s, completion, average % viewed), then the top 3 drop-off moments with timestamp, what is on screen there and why viewers left, then 3–5 concrete edits in priority order (e.g. "cut 0:00–0:02.5, open on the card at 0:03", "add burned-in captions — 28 % watched with sound off and left earlier"). Link `$WORK/report.html` and send it with SendUserFile (display: render). Remind them once that this is a simulation: use it to compare versions and find weak spots, then check real analytics after publishing.

## Comparing versions (A/B)

Run steps 1–5 for each version with the **same `audience.json` and seed**, so the same 100 people watch both. Compare the summaries side by side (3-second hold, completion, avg % viewed, drop-off moments) and say which version wins and why. This is the most reliable use of the skill: relative differences are more trustworthy than absolute numbers.

## Script-only mode

No video yet? Write `$WORK/timeline.json` yourself with `meta` (`duration`, `width`, `height`, `fps`, `has_audio`, `orientation`), empty `sheets`/`scene_cuts`/`silences`/`loudness_per_s`, and `beats` with the planned on-screen content and speech per moment (put a description of the visuals in `speech` prefixed with `[visual]`). Tell the judges there are no frames and they must imagine the video from the beats. Results are rougher; say so.

## With video-maker

If the video was built with the `video-maker` skill, test the half-size draft, fix the drop-off moments in the HTML timeline, re-render, and run an A/B against the previous draft.
