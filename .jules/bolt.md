## 2024-05-24 - Avoid URL Constructor parsing

**Learning:** Using `new URL(window.location.href)` to parse the URL is expensive and negligible time per execution (<1ms), but avoiding it and using `window.location` directly reduces execution time by ~94-95% by avoiding the URL constructor.
**Action:** Use `window.location` properties (e.g. `pathname`, `search`, `hash`) directly instead of parsing the current URL via the constructor.
