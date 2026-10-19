# Scribble Habits

A fast, forgiving, local-first habit tracker PWA with a hand-drawn UI. No build step, no dependencies.

```sh
python3 -m http.server 8000   # or any static server; service workers need localhost or https
```

- `css/tokens.css`: all design tokens (palette, fonts, wobbly radii, hard shadows)
- `js/stats.js`: chain, 30-day %, 66-day progress, heatmap, weekly summary, tag-before-miss insights
- `js/store.js`: localStorage persistence · `js/views.js`: views · `js/app.js`: events

Known v1 limits: data is on-device only (no cloud sync), and reminders fire while the app/service worker
is alive; true background push needs a push server.

## Deploying

`.github/workflows/pages.yml` publishes the site to GitHub Pages on every push to `main`. One-time setup:
**Settings → Pages → Build and deployment → Source: GitHub Actions**. The app uses only relative paths,
so it works from the `/todoapp/` project URL.
