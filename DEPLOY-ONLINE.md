# Як викласти Multi-Investor онлайн (телефон з будь-якої мережі)

Сайт — статичні файли (`index.html` + JS). Хостинг **безкоштовний**, HTTPS входить у більшість сервісів.

## Варіант A — Netlify Drop (найпростіше, ~2 хвилини)

1. Відкрий на комп’ютері: https://app.netlify.com/drop  
2. Увійди (Google / email) — безкоштовно.  
3. Перетягни папку `multi-investor-top-picks` **або** файл `multi-investor-online.zip`  
   (у zip уже є `index.html`, `app-pages.js`, `day-trading.js`).  
4. Netlify дасть посилання на кшталт:  
   `https://random-name-123.netlify.app`  
5. Відкрий це посилання на телефоні (можна будь-який інтернет, не лише Wi‑Fi дому).  
6. (Опційно) Site settings → Domain management → змінити назву сайту.

**На телефоні:**  
- Connect Finnhub API key (твій ключ лишається в браузері телефону)  
- Generate Top Picks, Watchlist, Portfolio  
- Day Trading: графік через Yahoo (може інколи тупити CORS — тоді Daily TF)

---

## Варіант B — Cloudflare Pages

1. https://pages.cloudflare.com  
2. Upload assets → завантаж zip / файли  
3. Отримай `*.pages.dev` URL

---

## Варіант C — GitHub Pages (якщо встановиш Git)

1. Створи репозиторій, залий файли.  
2. Settings → Pages → Deploy from branch `main` / root.  
3. URL: `https://USERNAME.github.io/REPO/`

---

## Важливо про безпеку

- **Не викладай** Finnhub API key у файли сайту — ключ вводять користувачі в UI (localStorage).  
- Публічний URL бачать усі, у кого є лінк — не публікуй конфіденційні дані.  
- Free Finnhub: personal use; rate limits 60/min.

---

## Локально vs онлайн

| | Локально (`start.bat`) | Онлайн (Netlify) |
|--|------------------------|------------------|
| Телефон вдома (Wi‑Fi) | так (IP ПК) | так |
| Телефон 4G / інша мережа | ні | **так** |
| Графік candles | Yahoo через Python proxy | Yahoo + CORS proxy |
| Ключ Finnhub | localStorage | localStorage (на кожному пристрої свій) |

---

## Файли для деплою

Обов’язкові:
- `index.html`
- `app-pages.js`
- `day-trading.js`
- `history.js`
- `backtest.js`

Не обов’язкові на Netlify:
- `server.py`, `start.bat` (лише для локального сервера)
