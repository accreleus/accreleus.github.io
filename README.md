# accreleus.github.io

The Accreleus org site and blog, served at <https://accreleus.github.io/>.
Built with [Astro](https://astro.build) and published by `.github/workflows/pages.yml`
on every push to `main`.

Quasar's documentation is **not** here. It lives in
[`accreleus/quasar`](https://github.com/accreleus/quasar) under `site/` and is
published to `/quasar/` from that repository.

## Writing a post

Add a Markdown file to `src/content/blog/`, named `YYYY-MM-DD-short-slug.md`.
The file name becomes the URL (`/blog/YYYY-MM-DD-short-slug/`), so don't rename
a post once it's published.

```md
---
title: 'Development update: something'
description: 'One sentence for the post list, the RSS feed and link previews.'
date: 2026-09-26
projects: [quasar]   # optional: quasar, photon, quasar-protocol
draft: true          # optional: shows in `npm run dev`, never published
---

Post body in Markdown.
```

## Previewing

```sh
npm ci
npm run dev       # http://localhost:4321, drafts included
npm run build     # type-check and build to dist/, drafts excluded
npm run preview   # serve dist/
```

## Style

Colours, type and radii come from the Quasar v3 design contract; see
`src/styles/tokens.css`. Don't pick new values by eye.
