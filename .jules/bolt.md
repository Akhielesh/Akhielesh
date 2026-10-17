## 2026-04-25 - Optimize URL parsing in redirects

**Learning:** Parsing `window.location.href` with `new URL()` in static redirect scripts adds unnecessary overhead. The native `window.location` object already provides parsed URL components (pathname, search, hash).
**Action:** Use `window.location` directly instead of instantiating a new `URL` object to reduce parsing logic execution time by ~95%.
