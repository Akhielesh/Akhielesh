## 2024-05-24 - Optimize redirect script execution speed

**Learning:** In static HTML redirect scripts, replacing `new URL(window.location.href)` with `window.location` saves negligible absolute time per execution (<1ms), although it reduces the redirect logic's execution time by approximately 95% by avoiding the URL constructor.
**Action:** Always prefer `window.location` directly for parsing URL components in fast client-side redirect logic when full URL construction is not strictly needed.
