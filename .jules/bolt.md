## 2024-04-04 - Optimize URL parsing in simple static redirect scripts

**Learning:** In simple scripts that redirect based on the current URL properties (like `pathname`, `search`, and `hash`), using `new URL(window.location.href)` is completely redundant, because the `window.location` object natively provides all these exact properties already.
**Action:** When a static JS redirect operates strictly on current location properties (`pathname`, `search`, `hash`), access them directly off `window.location` instead of incurring the overhead of spinning up the `URL` constructor.
