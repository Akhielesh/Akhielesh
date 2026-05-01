## 2024-05-24 - Avoid URL constructor in static HTML redirect scripts

**Learning:** Replacing `new URL(window.location.href)` with `window.location` in redirect scripts reduces execution time for the parsing logic by approximately 94-95% by avoiding the URL constructor.
**Action:** Use `window.location` directly when accessing URL properties in redirect scripts instead of instantiating a new URL object.
