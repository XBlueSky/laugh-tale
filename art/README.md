# Art sources (local only — PNGs are git-ignored)

ChatGPT-generated ink illustrations (羅傑海賊團配件 / Manga Prompts / Comic Style
Prompts conversations, 2026-08-27 ~ 08-28). The PNGs here are the full-resolution
masters; the site ships resized lossy webp copies. Keep the masters — they are the
only way to re-export at other sizes or re-cut backgrounds.

Convert with sharp (from `site/`):

```sh
node -e "require('sharp')('../art/masters/NAME.png').resize({width:1600}).webp({quality:82}).toFile('src/assets/tribute/NAME.webp')"
```

## masters/ — sources of shipped assets

| master | shipped as |
|---|---|
| logo.png | docs/brand/logo.png → site/src/assets/logo.png |
| og-banner.png | site/public/og.jpg |
| straw-hat.png | site/src/assets/tribute/straw-hat.webp (background removed) |
| captain-cutlass.png | captain-cutlass.webp (background removed) |
| first-mate-sword.png | first-mate-sword.webp (background removed) |
| first-mate-glasses.png | first-mate-glasses.webp (background removed) |
| navigator-axes.png | navigator-axes.webp (background removed) |
| doctor-kit.png | doctor-kit.webp (background removed) |
| reader-swords.png | reader-swords.webp (background removed) |
| logbook.png | voyage-logbook.webp AND reader-journal.webp (cutout) |
| crew-assembled.png | crew-assembled.webp |
| crew-arrival.png | crew-arrival.webp |
| journey-sake.png | journey-sake.webp (in repo, currently unused on the page) |
| harbor-departure.png | harbor-departure.webp |
| chart-spread.png | chart-spread.webp |
| storm-spread.png | storm-spread.webp |
| helm-grip.png | helm-grip.webp |
| island-light.png | island-light.webp |
| crew-toast.png | crew-toast.webp |

## library/ — unused, ready to deploy

| file | subject |
|---|---|
| twin-cape-lighthouse.png | lighthouse between twin capes (雙子岬) |
| ink-bottle-compass.png | ink bottle + pocket compass |
| oden-cauldron.png | skewer cauldron over fire |
| sheared-peak.png | mountain with its peak sliced off |
| captain-hat-mustache.png | feathered hat + mustache emblem |
| glasses-crescent-moon.png | round glasses + crescent moon (variant of first-mate-glasses) |
| crew-assembled-alt.png | alternate crew line-up (variant of crew-assembled) |
| logo-paper-variant.png | logo on paper background (variant) |
| logo-dark-wordmark.png | dark logo with LAUGH TALE wordmark (variant) |
