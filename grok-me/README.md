# MITP Desk — snapshot з Grok.me

Джерело: https://star-blue-quartz-zippy.grok.me  
Гілка: `grok-version` (main не змінювалась)  
Знято: 2026-09-04

Це **зібраний** фронтенд Grok App Builder (Vite/React), не вихідні `.tsx`.
Grok.me віддає лише бандли в `/assets/*`. Source maps немає.

## Запуск локально

```bash
cd grok-me
python3 -m http.server 4173
```

Відкрий http://localhost:4173

API котирувань і паперовий рахунок хостяться на інфраструктурі Grok, тому
офлайн частина UI відкриється, а живі дані можуть не підтягнутись.

## Маршрути

- `/` огляд
- `/picks`
- `/daytrade`
- `/paper`
- `/portfolio`
- `/journal`
- `/watchlist`
