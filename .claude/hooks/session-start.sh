#!/bin/bash
# Video toolchain for Claude Code on the web: ffmpeg, a headless Chromium for
# HyperFrames/Remotion, and the env vars both need. Idempotent; web only.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get install -y -qq ffmpeg >/dev/null 2>&1 \
    || { apt-get update -qq >/dev/null 2>&1 && apt-get install -y -qq ffmpeg >/dev/null 2>&1; }
fi

# Playwright's headless shell is pre-installed; HyperFrames and Remotion would
# otherwise try to download their own Chrome, which the network policy blocks.
BROWSER="$(ls -d /opt/pw-browsers/chromium_headless_shell-*/*/headless_shell 2>/dev/null | sort | tail -1 || true)"

# HyperFrames CLI, and Playwright for video-maker's render.mjs. Playwright is
# pinned to the release whose Chromium revision is pre-installed in
# /opt/pw-browsers, so it never tries to download a browser.
command -v hyperframes >/dev/null 2>&1 || npm install -g --silent hyperframes@latest >/dev/null 2>&1 || true
NPM_ROOT="$(npm root -g)"
if [ ! -d "$NPM_ROOT/playwright" ]; then
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install -g --silent playwright@1.56 >/dev/null 2>&1 || true
fi

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo 'export HYPERFRAMES_NO_TELEMETRY=1'
    echo 'export DO_NOT_TRACK=1'
    echo 'export HYPERFRAMES_SKIP_SKILLS=1'
    echo "export NODE_PATH=\"$NPM_ROOT\""
    if [ -n "$BROWSER" ]; then
      echo "export HYPERFRAMES_BROWSER_PATH=\"$BROWSER\""
      echo "export REMOTION_BROWSER_EXECUTABLE=\"$BROWSER\""
    fi
  } >> "$CLAUDE_ENV_FILE"
fi

echo "video toolchain: ffmpeg $(ffmpeg -version 2>/dev/null | head -1 | cut -d' ' -f3), hyperframes $(hyperframes --version 2>/dev/null | tail -1), browser ${BROWSER:-missing}" >&2
