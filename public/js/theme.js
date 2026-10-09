/* Menstars HQ day/night theme. Day (gray + lime) is the default; night = deep black + Cryptok blue.
   A tiny inline script in each page's <head> applies the saved theme before
   first paint (no flash); this file wires the toggle button. */
(function () {
  var KEY = "menstars-theme";
  function current() {
    return document.documentElement.getAttribute("data-theme") === "night" ? "night" : "day";
  }
  function apply(t) {
    if (t === "night") document.documentElement.setAttribute("data-theme", "night");
    else document.documentElement.removeAttribute("data-theme");
    var b = document.getElementById("themeToggle");
    if (b) b.textContent = t === "night" ? "🌙" : "☀️";
    try { localStorage.setItem(KEY, t); } catch (e) {}
  }
  // Sync icon in case the head snippet already applied the theme.
  var b0 = document.getElementById("themeToggle");
  if (b0) b0.textContent = current() === "night" ? "🌙" : "☀️";
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("#themeToggle")) {
      apply(current() === "night" ? "day" : "night");
    }
  });
})();
