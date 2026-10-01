// Applies the saved theme before first paint (kept external so the CSP can forbid inline scripts).
(function () {
  var pref = "system";
  try {
    pref = localStorage.getItem("adminak-theme") || "system";
  } catch (e) {}
  var dark = pref === "dark" || (pref === "system" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
})();
