/* Menstars day/night theme. Night is the default; day = TikTok red + white.
   A tiny inline script in each page's <head> applies the saved theme before
   first paint (no flash); this file wires the toggle button. */
(function () {
  var KEY = "menstars-theme";
  function current() {
    return document.documentElement.getAttribute("data-theme") === "day" ? "day" : "night";
  }
  function apply(t) {
    if (t === "day") document.documentElement.setAttribute("data-theme", "day");
    else document.documentElement.removeAttribute("data-theme");
    var b = document.getElementById("themeToggle");
    if (b) b.textContent = t === "day" ? "☀️" : "🌙";
    try { localStorage.setItem(KEY, t); } catch (e) {}
  }
  // Sync icon in case the head snippet already applied the theme.
  var b0 = document.getElementById("themeToggle");
  if (b0) b0.textContent = current() === "day" ? "☀️" : "🌙";
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("#themeToggle")) {
      apply(current() === "day" ? "night" : "day");
    }
  });
})();
