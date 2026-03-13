
## 2025-03-13 - [Optimize Redirects]
**Learning:** For a legacy static HTML redirect site, establishing early connections using preconnect/dns-prefetch and moving the inline redirect script above large `<style>` blocks significantly reduces redirect time before DOM parsing.
**Action:** When working on pure HTML client-side redirect pages, ensure redirect scripts execute before heavy CSS parsing, and use preconnect for the target domain.
