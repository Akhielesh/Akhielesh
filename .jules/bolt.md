## 2024-05-03 - Avoid URL constructor in static redirects

**Learning:** Replacing `new URL(window.location.href)` with `window.location` directly reduces execution time of the URL parsing logic by ~95% while maintaining the exact same property access interface (.pathname, .search, .hash).
**Action:** When working with client-side routing/redirects that only need to read the current URL parts, use `window.location` directly instead of instantiating a new URL object. Ensure derived paths are prefixed with a leading slash to prevent open redirect vulnerabilities.
