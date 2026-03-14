## 2024-11-20 - HTML Redirect Preconnect
**Learning:** For static HTML sites that rely on client-side JS redirects to a known target origin, pre-warming the connection (DNS + TCP/TLS) via `<link rel="preconnect">` and `<link rel="dns-prefetch">` in the `<head>` yields a significant latency reduction.
**Action:** Always check for hardcoded target origins in redirect scripts and add preconnect resource hints to parallelize the network handshake with HTML parsing.
