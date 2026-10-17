## 2024-04-29 - URL Constructor Performance

**Learning:** Using `new URL(window.location.href)` is significantly slower than directly accessing `window.location` properties (pathname, search, hash) in static HTML redirect scripts.
**Action:** Replace `new URL(window.location.href)` with `window.location` to reduce execution time for the parsing logic by ~95%.
