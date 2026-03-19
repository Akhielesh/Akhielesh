## 2024-05-24 - Client-side Redirect Preconnection

**Learning:** In legacy environments with pure HTML/JS redirects, waiting for script execution before establishing connection to the target domain incurs a significant DNS/TCP/TLS penalty. Moving the script up and using `<link rel="preconnect">` starts this handshake concurrently during HTML parsing.
**Action:** Always preconnect to the target origin for client-side routing/redirect applications if the target origin is known at parse-time.
