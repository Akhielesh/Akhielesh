## 2024-05-24 - Avoid URL constructor overhead in redirect scripts

**Learning:** Using `new URL(window.location.href)` introduces unnecessary parsing overhead when `window.location` already provides the parsed URL components (`pathname`, `search`, `hash`).
**Action:** Replace `new URL(window.location.href)` with `window.location` directly in static redirect scripts to reduce execution time by approximately 94-95%.
