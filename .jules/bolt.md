## 2024-05-24 - Avoid Redundant URL Parsing in Redirects
**Learning:** In simple redirect scripts, calling `new URL(window.location.href)` incurs a measurable overhead (~500ms for 100k iterations) compared to directly using `window.location` (~15ms for 100k iterations). Both objects provide identically structured string properties for `pathname`, `search`, and `hash`.
**Action:** Always prefer `window.location` over redundant `new URL()` instantiations when dealing with the current page's URL components in performance-sensitive contexts like immediate redirects.
