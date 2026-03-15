## 2024-05-18 - Preconnect for JS Redirects

**Learning:** In legacy sites relying on pure client-side JS redirects to a specific origin, the browser must wait to parse and execute the JS before initiating the connection. Adding a preconnect link tag for the target origin starts the DNS/TCP/TLS handshake in parallel with HTML/JS parsing.
**Action:** Whenever a site uses JS to redirect to a known external origin, always ensure a `<link rel="preconnect">` tag exists in the `<head>` to save 100-300ms on the redirect.
