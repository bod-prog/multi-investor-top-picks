#!/usr/bin/env python3
"""
Local static server + Yahoo Finance candle proxy (no CORS issues).

Usage:
  python server.py
  open http://127.0.0.1:8765/

Why: Finnhub Free blocks /stock/candle (403).
     Yahoo blocks browser CORS → "Failed to fetch".
     This proxy fetches Yahoo server-side and serves the app.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# 0.0.0.0 = accessible from this PC and phones on the same Wi‑Fi
HOST = "0.0.0.0"
PORT = 8765
ROOT = Path(__file__).resolve().parent


def local_ip() -> str:
    """Best-effort LAN IP for phone access instructions."""
    import socket

    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "192.168.x.x"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36"
)


def http_get_json(url: str, timeout: int = 25):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "application/json,text/plain,*/*",
            "Accept-Language": "en-US,en;q=0.9",
        },
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
        return json.loads(raw)


def http_get_text(url: str, timeout: int = 25) -> str:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept": "*/*"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def yahoo_chart(symbol: str, interval: str, range_: str) -> dict:
    qs = urllib.parse.urlencode(
        {
            "interval": interval,
            "range": range_,
            "includePrePost": "false",
            "events": "div|split",
        }
    )
    # query1 / query2 fallback
    errors = []
    for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com"):
        url = f"https://{host}/v8/finance/chart/{urllib.parse.quote(symbol)}?{qs}"
        try:
            data = http_get_json(url)
            if data.get("chart", {}).get("result"):
                return data
            err = data.get("chart", {}).get("error") or data
            errors.append(f"{host}: {err}")
        except Exception as e:
            errors.append(f"{host}: {e}")
    raise RuntimeError(" | ".join(errors) if errors else "Yahoo failed")


def stooq_daily(symbol: str) -> dict:
    """Daily OHLCV via Stooq CSV → Yahoo-like shape for the frontend."""
    sym = symbol.lower().strip()
    if not sym.endswith(".us") and "." not in sym:
        sym = f"{sym}.us"
    url = f"https://stooq.com/q/d/l/?s={urllib.parse.quote(sym)}&i=d"
    text = http_get_text(url)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if len(lines) < 2:
        raise RuntimeError("Stooq empty")

    # Date,Open,High,Low,Close,Volume
    rows = []
    for ln in lines[1:]:
        parts = ln.split(",")
        if len(parts) < 6:
            continue
        try:
            from datetime import datetime

            dt = datetime.strptime(parts[0], "%Y-%m-%d")
            ts = int(dt.timestamp())
            o, h, l, c = float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])
            v = float(parts[5]) if parts[5] not in ("", "null") else 0.0
            if c <= 0:
                continue
            rows.append((ts, o, h, l, c, v))
        except Exception:
            continue

    # last ~400 days
    rows = rows[-400:]
    if not rows:
        raise RuntimeError("Stooq parse failed")

    return {
        "chart": {
            "result": [
                {
                    "timestamp": [r[0] for r in rows],
                    "indicators": {
                        "quote": [
                            {
                                "open": [r[1] for r in rows],
                                "high": [r[2] for r in rows],
                                "low": [r[3] for r in rows],
                                "close": [r[4] for r in rows],
                                "volume": [r[5] for r in rows],
                            }
                        ]
                    },
                    "meta": {"symbol": symbol, "source": "stooq"},
                }
            ],
            "error": None,
        }
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write("[server] " + (fmt % args) + "\n")

    def _send_json(self, code: int, obj: dict):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path in ("/api/candles", "/api/yahoo"):
            qs = urllib.parse.parse_qs(parsed.query)
            symbol = (qs.get("symbol") or qs.get("ticker") or ["AAPL"])[0].strip().upper()
            interval = (qs.get("interval") or ["5m"])[0]
            range_ = (qs.get("range") or ["5d"])[0]
            try:
                data = yahoo_chart(symbol, interval, range_)
                # annotate source
                try:
                    data["chart"]["result"][0].setdefault("meta", {})["dataSource"] = "yahoo"
                except Exception:
                    pass
                self._send_json(200, data)
            except Exception as e:
                # Daily fallback via Stooq
                if interval in ("1d", "d", "D") or range_ in ("1y", "2y", "5y", "max"):
                    try:
                        data = stooq_daily(symbol)
                        self._send_json(200, data)
                        return
                    except Exception as e2:
                        self._send_json(
                            502,
                            {
                                "error": "candle_fetch_failed",
                                "yahoo": str(e),
                                "stooq": str(e2),
                                "hint": "Check ticker (US), internet, or try Daily.",
                            },
                        )
                        return
                self._send_json(
                    502,
                    {
                        "error": "candle_fetch_failed",
                        "message": str(e),
                        "hint": "Try another timeframe (Daily) or ticker. Finnhub free has no candles.",
                    },
                )
            return

        if path == "/api/health":
            self._send_json(200, {"ok": True, "root": str(ROOT)})
            return

        return super().do_GET()


def main():
    os_chdir = ROOT
    # ensure cwd is app root for static files
    import os

    os.chdir(os_chdir)

    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    lan = local_ip()
    print("=" * 56)
    print(" Multi-Investor · local server + Yahoo candle proxy")
    print("=" * 56)
    print(f" This PC:   http://127.0.0.1:{PORT}/")
    print(f" Phone WiFi: http://{lan}:{PORT}/")
    print(f" Day Trade:  http://{lan}:{PORT}/#daytrade")
    print()
    print(" Phone + PC must be on the SAME Wi‑Fi.")
    print(" If phone cannot open: allow Python in Windows Firewall.")
    print(" Stop:  Ctrl+C")
    print("=" * 56)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        httpd.server_close()


if __name__ == "__main__":
    main()
