# AI Product Engineer Portfolio

Personal portfolio site built with Next.js App Router, Tailwind CSS, shadcn/ui patterns, and Motion.

## Local development

```bash
pnpm install
pnpm dev
```

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## GitHub Pages deployment

This repo is prepared for static deployment through GitHub Pages.

- The site builds with `output: "export"` and emits a static `out/` directory.
- The workflow at `.github/workflows/deploy-pages.yml` deploys on pushes to `main` or `master`.
- The workflow automatically derives the correct `basePath` and `siteUrl` for either:
  - a user/org site such as `https://owner.github.io`
  - a project site such as `https://owner.github.io/repository-name`
- If you later use a custom domain, set repository variables:
  - `PAGES_SITE_URL` to the full public origin, for example `https://portfolio.example.com`
  - `PAGES_BASE_PATH` only if the site should still live under a subpath

If you add a custom domain, also configure that domain in your GitHub Pages settings.
