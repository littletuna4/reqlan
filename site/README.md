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

1. Build `@reqlan/language`, `@reqlan/analytical`, and `@reqlan/cli`
2. Validate showcase `.rq` blocks and pre-render syntax highlights (Shiki)
3. Export all Next.js routes with `next build` into `out/`
4. Export the workspace requirement graph (non-secret) under `out/spec/` via `reqlan export`
   - Uses `--url-base` (honours `SITE_BASE_PATH`) so `/spec` works with or without a trailing slash
   - Adds a topbar header link back to the marketing site home
5. Verify every required static page exists in `out/`

Production builds use `SITE_BASE_PATH=/reqlan` in CI. Output is written to `out/`.

## Scripts

- `pnpm generate:images` — regenerate favicons and PNGs from `public/logo.svg` when the logo changes.
