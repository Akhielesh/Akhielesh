## 2024-05-10 - Optimizing URL Parsing in Static Redirect Scripts
**Learning:** Instantiating `new URL(window.location.href)` is completely redundant when only standard path properties (`pathname`, `search`, `hash`) are needed, as `window.location` natively exposes these as a `Location` object.
**Action:** Always favor `window.location` directly over wrapping it in a `new URL()` call to avoid unnecessary memory allocation and parsing steps.
