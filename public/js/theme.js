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

/* Burger menu toggle (shared header nav). */
(function () {
  function close() {
    var m = document.getElementById("burgerMenu");
    var b = document.getElementById("burgerBtn");
    if (m) m.hidden = true;
    if (b) b.setAttribute("aria-expanded", "false");
  }
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("#burgerBtn");
    var menu = document.getElementById("burgerMenu");
    if (!menu) return;
    if (btn) {
      var willOpen = menu.hidden;
      menu.hidden = !willOpen;
      btn.setAttribute("aria-expanded", String(willOpen));
      return;
    }
    if (!e.target.closest || !e.target.closest("#burgerMenu")) close();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") close();
  });
})();
