# grok-version

Зібраний снапшот сайту https://star-blue-quartz-zippy.grok.me
лежить у каталозі `grok-me/`.

Гілку `main` не змінювали.

Grok.me віддає лише зібраний Vite/React бандл (без `.tsx` і без source maps).

Повний набір ассетів:

```bash
cd grok-me
chmod +x sync-from-live.sh
./sync-from-live.sh
python3 -m http.server 4173
```
