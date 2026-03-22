## 2024-05-24 - Optimizing JS-based Redirects with Preconnect

**Learning:** JS-based client-side redirects (which are sometimes necessary over native HTTP 301/302s to preserve query parameters or dynamically handle paths) incur a significant latency penalty due to the time it takes to parse the HTML, download and parse JS, and finally initiate the new connection.
**Action:** Always pair JS-based redirects with a `<link rel="preconnect" href="[target-domain]" />` tag as high up in the `<head>` as possible. This allows the browser to resolve DNS and establish the TCP/TLS handshake in the background while the rest of the page and JS is loading, drastically reducing the time-to-first-byte (TTFB) of the redirected destination once the `window.location.replace()` fires.
