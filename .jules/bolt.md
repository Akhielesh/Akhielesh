## 2024-03-23 - Optimize legacy static redirect

**Learning:** For legacy static HTML redirects that rely on JS window.location.replace, relying solely on the JS execution adds unnecessary delay waiting for DNS, TCP, and TLS for the target origin.
**Action:** Always add a `<link rel="preconnect" href="TARGET_URL" />` in the `<head>` to perform the handshake eagerly while the browser parses and executes the redirect script, saving ~100-300ms.
