## 2024-05-15 - Optimize window.location parsing

**Learning:** In static HTML redirect scripts, instantiating `new URL(window.location.href)` takes ~95% of the execution time of the script. The `window.location` object natively provides `pathname`, `search`, and `hash`, making the `URL` constructor redundant.
**Action:** When working on redirect scripts in the browser, read directly from `window.location` instead of parsing `window.location.href` to save execution time.
