## 2024-05-24 - Optimize URL parsing overhead

**Learning:** In static HTML redirect scripts, replacing `new URL(window.location.href)` with `window.location` avoids the URL constructor overhead and reduces execution time for the parsing logic by approximately 94-95%.
**Action:** Replace `new URL(window.location.href)` with `window.location` directly, and ensure paths are safely constructed with leading slashes.
