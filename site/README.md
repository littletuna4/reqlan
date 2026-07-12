# reqlan site

Static marketing site for reqlan, built with Next.js App Router static export and deployed to GitHub Pages at `/reqlan`.

Live site: [https://tony.is-a.dev/reqlan](https://tony.is-a.dev/reqlan) (canonical URL in [`reqlan rq/phonebook.json`](../reqlan%20rq/phonebook.json)).

## Development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). To match production paths locally:

```bash
SITE_BASE_PATH=/reqlan pnpm dev
```

## Build

```bash
pnpm build
```

This runs a single static export pipeline:

1. Pre-render syntax highlights (Shiki)
2. Export all routes with `next build` into `out/`
3. Verify every required static page exists in `out/`

Production builds use `SITE_BASE_PATH=/reqlan` in CI. Output is written to `out/`.

## Scripts

- `pnpm generate:images` — regenerate favicons and PNGs from `public/logo.svg` when the logo changes.
