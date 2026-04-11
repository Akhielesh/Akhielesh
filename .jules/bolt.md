## 2026-04-11 - Overhead of URL constructor

**Learning:** Using `new URL(window.location.href)` introduces significant overhead compared to using the native `window.location` object directly, which natively provides `pathname`, `search`, and `hash`.
**Action:** Default to using `window.location` properties directly for simple URL extraction to save parsing time, unless specific encoding behaviors of `URL` are strictly required.
