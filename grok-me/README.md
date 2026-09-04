# MITP Desk — snapshot з Grok.me

Джерело: https://star-blue-quartz-zippy.grok.me  
Гілка: `grok-version` (`main` не змінювалась)  
Знято: 2026-09-04

Це **зібраний** фронтенд Grok App Builder (Vite + React + TanStack Router).
Вихідних `.tsx` на хості немає, source maps теж немає.

## Повний снапшот ассетів

```bash
chmod +x sync-from-live.sh
./sync-from-live.sh
python3 -m http.server 4173
```

Відкрий http://localhost:4173

API котирувань, логін Google/X і паперовий рахунок йдуть на інфраструктуру Grok.

## Маршрути

- `/` огляд
- `/picks`
- `/daytrade`
- `/paper`
- `/portfolio`
- `/journal`
- `/watchlist`
- `/login`
