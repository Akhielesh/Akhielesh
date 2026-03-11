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

## Cloudflare Pages deployment

This repo is now prepared for Cloudflare Pages deployment so the source repo can stay private while the site still serves static pages plus same-origin Pages Functions for the hidden `Adminak` analytics deck.

- The site still builds with `output: "export"` and emits a static `out/` directory.
- The workflow at `.github/workflows/deploy-cloudflare-pages.yml` deploys that export and the `/functions` directory to Cloudflare Pages on pushes to `main` or `master`.
- The workflow expects the site to live at the root of the domain, not under `/Akhielesh`.
- `_redirects` includes rules that strip `/Akhielesh` from incoming paths on the Cloudflare domain, which helps preserve old project-site path shapes once traffic reaches the new host.
- `wrangler.jsonc` is used for the Pages project configuration and the D1 binding that powers real analytics storage for `/api/analytics/*`.

### Required GitHub configuration

Add these repository settings before relying on CI deploys:

- Repository secret: `CLOUDFLARE_API_TOKEN`
- Repository variable: `CLOUDFLARE_ACCOUNT_ID`
- Optional repository variable: `CLOUDFLARE_PAGES_PROJECT`
  - defaults to `akhielesh-portfolio` if omitted
- Optional repository variable: `SITE_URL`
  - set this to your final public origin, for example `https://akhielesh.com`

### Required Cloudflare Pages secret

Set this on the `akhielesh-portfolio` Pages project so the hidden admin route can authenticate against the live analytics API:

- Pages secret: `ADMINAK_PASSWORD`

### Required D1 database

The live admin dashboard depends on the D1 database configured in `wrangler.jsonc`.

- Database name: `akhielesh-portfolio-analytics`
- Apply the schema in `migrations/0001_adminak_analytics.sql` before expecting live analytics data

### Local deployment

If you are already authenticated with Wrangler:

```bash
CLOUDFLARE_PAGES_PROJECT=akhielesh-portfolio npm run deploy:cloudflare
```

To apply the analytics schema remotely:

```bash
npx wrangler d1 execute akhielesh-portfolio-analytics --remote --file migrations/0001_adminak_analytics.sql
```

### Cloudflare dashboard build settings

If you use Cloudflare's Git-connected build pipeline instead of the GitHub Action:

- Build command: `pnpm run build`
- Build output directory: `out`
- Root directory: repository root
- Do **not** set a deploy command like `npx wrangler deploy`

For this repo, any deploy command that uses `wrangler deploy` is wrong because that is for Workers, not Pages static output.

### Legacy GitHub Pages URL redirect

If you want `https://akhielesh.github.io/Akhielesh/` to redirect to the new Cloudflare/custom-domain site, the old GitHub Pages URL must stay backed by a tiny public redirect site. The clean setup is:

1. Move the real portfolio source to a private repo.
2. Keep a separate public GitHub Pages repo that only contains a redirect page to the new domain.

You cannot keep the current repo private and still have the same GitHub Pages URL serve redirects, because GitHub Free Pages only serves public repos.

A ready-to-use redirect template lives in `legacy-github-redirect-template/`.
