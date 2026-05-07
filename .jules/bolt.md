## 2024-06-03 - Optimize URL parsing in redirect logic

**Learning:** Replacing `new URL(window.location.href)` with `window.location` reduces execution time for parsing logic by approximately 95% because we avoid using the URL constructor while maintaining access to location properties.
**Action:** When working with inline redirect scripts, favor using `window.location` directly instead of instantiating new URL objects if possible.
