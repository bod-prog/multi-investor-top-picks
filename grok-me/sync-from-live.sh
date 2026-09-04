#!/usr/bin/env bash
set -euo pipefail
BASE="${1:-https://star-blue-quartz-zippy.grok.me}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$ROOT/assets" "$ROOT/__grok"
files=(
  index.html favicon.svg og.jpg
  __grok/manifest.webmanifest __grok/icon-180.png
  assets/styles-qQL3oojN.css
  assets/index-C1y4bzJG.js
  assets/react-SIfiwpqq.js
  assets/dist-BN88FNUH.js
  assets/preload-helper-EP1L_UvZ.js
  assets/utils-CDDqBGuM.js
  assets/routes-B75qF48r.js
  assets/shell-2rynFAQs.js
  assets/button-BfDdJad2.js
  assets/badge-B2_9A1Pi.js
  assets/market-CkU7FcOq.js
  assets/picks-uWdJjhUw.js
  assets/paper-Dbjt_sKh.js
  assets/journal-B4zJN5RX.js
  assets/picks-BVqbFH_s.js
  assets/client-DRhaju3Z.js
  assets/daytrade-DWgsuifK.js
  assets/input-pxSaY-W9.js
  assets/journal-Bwg7NTLp.js
  assets/label-BIcaQsy2.js
  assets/login-DDGhTdjM.js
  assets/paper-ZRfW6gvV.js
  assets/picks-BtT5qT0k.js
  assets/portfolio-C8Lp1vFu.js
  assets/portfolio-sDbwjyRW.js
  assets/watchlist-BEdYidyw.js
  assets/watchlist-t9sovX-F.js
  assets/writeup-DqtUUHbg.js
)
for f in "${files[@]}"; do
  echo "GET $f"
  curl -fsSL -A "Mozilla/5.0" "$BASE/$f" -o "$ROOT/$f"
done
echo "OK $ROOT"
