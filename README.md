# Roost Links

Installable phone app (PWA) for the indoor golf league. Served by GitHub Pages; all data comes from the league's Google Sheet through its Apps Script web app (`?api=data`, and POST actions `login`, `setup`, `logout`, `save`).

- `index.html` — the league page (moved from Board.html in Apps Script; `google.script.run` is provided by `app.js`).
- `app.js` — API calls, PIN sign-in, install prompts. The web app URL is at the top.
- `app.css` — sign-in screen, install tip, phone safe areas.
- `sw.js` — network-first service worker (offline fallback only; league data is never cached).
- `manifest.webmanifest`, `icons/` — app name, colors and icon.

Page changes go live when pushed here. New data from the sheet still needs a Web.gs edit and a new Apps Script deployment version.
