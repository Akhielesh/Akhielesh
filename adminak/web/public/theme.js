// Applies the saved theme before first paint (kept external so the CSP can forbid inline scripts).
// Same key and theme names as akhielesh.com, so the site and the console stay in sync.
(function () {
  var pref = "system";
  try {
    pref = localStorage.getItem("akh.theme") || localStorage.getItem("adminak-theme") || "system";
  } catch (e) {}
  var theme = pref === "light" || pref === "dark" || pref === "crt" ? pref : window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
})();
