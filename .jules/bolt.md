## 2024-05-24 - [Avoid URL constructor for location in redirect scripts]

**Learning:** [Replacing `new URL(window.location.href)` with `window.location` reduces execution time for the parsing logic by approximately 94-95%.]
**Action:** [Use `window.location` directly instead of instantiating a new URL object when `window.location.href` properties like `.pathname`, `.search`, and `.hash` are needed.]
