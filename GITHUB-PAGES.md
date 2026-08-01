# Викласти на GitHub Pages (онлайн + телефон)

Git уже ініціалізовано в цій папці, коміт готовий на гілці `main`.

## Крок 1 — Акаунт GitHub

1. Відкрий https://github.com  
2. Зареєструйся / увійди  

## Крок 2 — Новий репозиторій

1. https://github.com/new  
2. **Repository name:** наприклад `multi-investor-top-picks`  
3. **Public**  
4. **НЕ** став галочки “Add README / .gitignore” (у нас уже є файли)  
5. **Create repository**

## Крок 3 — Залити код (PowerShell)

Скопіюй **свій** URL репозиторію (замість `YOUR_USER`):

```powershell
cd C:\Users\Acer\multi-investor-top-picks
& "C:\Program Files\Git\bin\git.exe" remote add origin https://github.com/YOUR_USER/multi-investor-top-picks.git
& "C:\Program Files\Git\bin\git.exe" push -u origin main
```

GitHub попросить увійти (браузер / Personal Access Token).

### Якщо `git` уже в PATH (після перезапуску терміналу):

```powershell
cd C:\Users\Acer\multi-investor-top-picks
git remote add origin https://github.com/YOUR_USER/multi-investor-top-picks.git
git push -u origin main
```

## Крок 4 — Увімкнути Pages

1. Репозиторій → **Settings**  
2. Ліворуч **Pages**  
3. **Build and deployment → Source:** Deploy from a branch  
4. **Branch:** `main`  
5. **Folder:** `/ (root)`  
6. **Save**

Через 1–2 хвилини з’явиться адреса:

```text
https://YOUR_USER.github.io/multi-investor-top-picks/
```

Відкрий її на телефоні.

## Оновлення сайту після змін

```powershell
cd C:\Users\Acer\multi-investor-top-picks
git add .
git commit -m "Update app"
git push
```

Через ~1 хвилину Pages оновиться.

## Важливо

- Finnhub API key вводь **на телефоні** в UI (не в GitHub).  
- Не коміть ключі / паролі.  
- Файл `.nojekyll` уже є — щоб GitHub не ламав JS/шляхи.

## Якщо push просить пароль

GitHub більше не приймає звичайний пароль. Використай:

1. **GitHub → Settings → Developer settings → Personal access tokens**  
2. Створи token (scope `repo`)  
3. При `git push` у поле password встав **token**
