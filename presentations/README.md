# Tutorial presentations (Reveal.js)

Deck JSON under `decks/`, standalone player under `player/` (for local `npx serve`),
vendored Reveal under `vendor/reveal.js/`.

The marketing site hosts `/presentations/player/` as a **Next App Router page**
(`site/src/app/presentations/player/`). Sync copies only decks, assets, vendor,
and manifest into `site/public/presentations/` — not `player/`.

Open a deck locally (standalone shell):

```bash
npx serve . -l 4173
# then http://localhost:4173/player/?deck=gs-01-why-reqlan
```

After changing `reveal.js`, run `pnpm run vendor` in this folder.
