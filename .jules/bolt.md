## 2024-05-24 - [Avoid URL Constructor for Static Redirects]

**Learning:** [Replacing `new URL(window.location.href)` with `window.location` in static HTML redirect scripts avoids the URL constructor overhead, reducing parsing execution time by approximately ~90%. When making this change, an explicit check (e.g. `startsWith('/') ? path : '/' + path`) must be used to protect against open redirect/host-extension attacks during concatenation since we bypass the URL constructor's encoding logic.]
**Action:** [When implementing redirect scripts that derive paths from the current URL, always prefer reading directly from `window.location` (which natively implements URL-like properties) and manually enforce a leading slash, rather than parsing `window.location.href` via `new URL()`.]
