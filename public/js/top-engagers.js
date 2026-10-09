(function () {
  const PLATFORMS = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", x: "X.com", facebook: "Facebook" };
  let platform = "tiktok";
  let niche = "";
  let query = "";
  let searchTimer = null;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function renderTabs() {
    const box = $("platformTabs");
    if (!box) return;
    box.innerHTML = "";
    for (const [key, label] of Object.entries(PLATFORMS)) {
      const b = document.createElement("button");
      b.className = "tab" + (key === platform ? " active" : "");
      b.textContent = label;
      b.onclick = () => { platform = key; renderTabs(); load(); };
      box.appendChild(b);
    }
    updateTitle();
  }

  function updateTitle() {
    const t = $("boardTitle");
    if (t) t.textContent = query
      ? `🔍 Top 7 results for "${query}" — ${PLATFORMS[platform]}`
      : "🏆 Top 7 — " + PLATFORMS[platform] + (niche ? " · " + niche : "");
    const sub = $("boardSub");
    if (sub) sub.textContent = query
      ? "The 7 most-starred matching engagers across the Menstars community."
      : niche
        ? "Ranked by stars from " + niche + " contributors only."
        : "The most-starred engagers across the whole Menstars community — ranked by total stars from every contributor combined.";
  }

  async function loadNiches() {
    const sel = $("nicheFilter");
    if (!sel) return;
    try {
      const r = await fetch("/api/niches");
      const d = await r.json();
      sel.innerHTML = '<option value="">All niches</option>' +
        (d.niches || []).map((n) => `<option value="${esc(n.name)}">${esc(n.name)}</option>`).join("");
      sel.onchange = () => { niche = sel.value; updateTitle(); load(); };
    } catch { /* filter stays on "All niches" */ }
  }

  async function load() {
    const ol = $("boardList");
    if (!ol) return;
    ol.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const r = await fetch("/api/top-engagers?platform=" + platform + (niche ? "&niche=" + encodeURIComponent(niche) : "") + (query ? "&q=" + encodeURIComponent(query) : ""));
      const d = await r.json();
      if (!d.top.length) {
        ol.innerHTML = '<div class="empty">' + (query
          ? 'No engagers matching "' + esc(query) + '" on ' + esc(PLATFORMS[platform]) + "."
          : "No starred engagers yet" + (niche ? " for " + esc(niche) : "") + " on " + esc(PLATFORMS[platform]) + '. <a href="/login?mode=signup">Be the first to star someone. ★</a>') + "</div>";
        return;
      }
      ol.innerHTML = d.top.map((e) => {
        const target = e.link.kind === "external" ? ' target="_blank" rel="noopener"' : "";
        const badge = e.link.kind === "internal" ? '<span class="reg-badge">contributor</span>' : "";
        const niches = (e.niches && e.niches.length) ? `<div class="eng-meta">🎯 ${e.niches.map(esc).join(", ")}</div>` : "";
        return `<li><span class="rank">${e.rank}</span>
          <span class="who"><a href="${esc(e.link.url)}"${target}>@${esc(e.handle)}</a>${badge}
          <div class="eng-meta">${e.contributors} contributor${e.contributors === 1 ? "" : "s"}</div>${niches}</span>
          <span class="stars">★ ${e.totalStars}</span></li>`;
      }).join("");
    } catch {
      ol.innerHTML = '<div class="empty">Could not load the leaderboard. Try again.</div>';
    }
  }

  renderTabs();
  loadNiches();
  const searchInput = $("engagerSearch");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        query = searchInput.value.trim();
        updateTitle();
        load();
      }, 300);
    });
  }
  load();
})();
