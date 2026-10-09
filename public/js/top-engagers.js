(function () {
  const PLATFORMS = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", facebook: "Facebook" };
  let platform = "tiktok";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function renderTabs() {
    const box = $("platformTabs");
    box.innerHTML = "";
    for (const [key, label] of Object.entries(PLATFORMS)) {
      const b = document.createElement("button");
      b.className = "tab" + (key === platform ? " active" : "");
      b.textContent = label;
      b.onclick = () => { platform = key; renderTabs(); load(); };
      box.appendChild(b);
    }
    $("boardTitle").textContent = "🏆 Top 7 — " + PLATFORMS[platform];
  }

  async function load() {
    const ol = $("boardList");
    ol.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const r = await fetch("/api/top-engagers?platform=" + platform);
      const d = await r.json();
      if (!d.top.length) {
        ol.innerHTML = '<div class="empty">No starred engagers yet on ' + esc(PLATFORMS[platform]) + '. <a href="/login?mode=signup">Be the first to star someone. ★</a></div>';
        return;
      }
      ol.innerHTML = d.top.map((e) => {
        const target = e.link.kind === "external" ? ' target="_blank" rel="noopener"' : "";
        const badge = e.link.kind === "internal" ? '<span class="reg-badge">MEN member</span>' : "";
        return `<li><span class="rank">${e.rank}</span>
          <span class="who"><a href="${esc(e.link.url)}"${target}>@${esc(e.handle)}</a>${badge}
          <div class="eng-meta">${e.contributors} contributor${e.contributors === 1 ? "" : "s"}</div></span>
          <span class="stars">★ ${e.totalStars}</span></li>`;
      }).join("");
    } catch {
      ol.innerHTML = '<div class="empty">Could not load the leaderboard. Try again.</div>';
    }
  }

  renderTabs();
  load();
})();
