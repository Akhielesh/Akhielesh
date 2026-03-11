# Legacy GitHub Pages redirect template

Use this only if you want the old GitHub Pages URL at `https://akhielesh.github.io/Akhielesh/` to keep redirecting after the real portfolio source moves to a private repo.

## How to use it

1. Create a tiny **public** GitHub Pages repo that will own the old URL.
2. Copy `index.html` and `404.html` from this folder into that public repo.
3. If your final custom domain is different from `https://akhielesh-portfolio.pages.dev`, update `TARGET_ORIGIN` inside `index.html`.
4. Enable GitHub Pages for that public redirect repo.

## Important

The old `github.io` URL cannot keep redirecting if the same repo is private on GitHub Free. The redirect has to live in a separate public Pages repo.
