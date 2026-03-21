## 2024-05-18 - Optimized Redirects with Preconnect
**Learning:** Adding `<link rel="preconnect">` tags to redirect pages can significantly reduce latency (by ~50-100ms) by warming up DNS, TCP, and TLS connections before the redirect actually occurs.
**Action:** When working on redirect pages, consider adding `preconnect` tags to the target origin to optimize performance.
