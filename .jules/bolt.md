## 2024-05-24 - Preconnect for JavaScript Redirects
**Learning:** For legacy portfolio redirect repositories (where index.html and 404.html solely exist to redirect to a new domain via JavaScript), the DNS resolution, TCP handshake, and TLS negotiation for the target domain normally don't start until the JS executes.
**Action:** Adding `<link rel="preconnect" href="TARGET_DOMAIN" />` and `<link rel="dns-prefetch" href="TARGET_DOMAIN" />` to the `<head>` significantly reduces redirect latency by starting these network operations in parallel while the HTML and JS are being parsed.
