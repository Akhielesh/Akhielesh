## 2024-04-18 - Replacing URL constructor with window.location in redirect scripts

**Learning:** Using `new URL(window.location.href)` incurs unnecessary parsing overhead when `window.location` already provides the necessary parsed URL components (like `pathname`, `search`, and `hash`). In a simple redirect script, avoiding this constructor reduces execution time by ~95% (though absolute time saved is <1ms).
**Action:** When working with inline static redirect scripts that only need to read the current URL, use `window.location` directly instead of instantiating a new `URL` object.
