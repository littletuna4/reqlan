# reqlan site

Static marketing site for reqlan, built with Vite and deployed to GitHub Pages at `/reqlan`.

## Development

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173). To match production paths locally:

```bash
SITE_BASE_PATH=/reqlan pnpm dev
```

## Build

```bash
pnpm build
```

This runs a single static export pipeline:

1. Pre-render syntax highlights (Shiki)
2. Generate one HTML file per showcase slug
3. Bundle the site with Vite into `out/`
4. Verify every required static page exists in `out/`

Production builds use `SITE_BASE_PATH=/reqlan` in CI. Output is written to `out/`.

## Scripts

- `pnpm generate:images` — regenerate favicons and PNGs from `public/logo.svg` when the logo changes.
