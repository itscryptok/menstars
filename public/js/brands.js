(function () {
  const PLATFORMS = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", x: "X.com", facebook: "Facebook" };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  async function load() {
    const grid = $("shortGrid");
    try {
      const r = await fetch("/api/brands/shortlists");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Load failed.");
      grid.innerHTML = "";
      for (const s of d.shortlists || []) {
        const card = document.createElement("div");
        card.className = "short-card";
        let teaser = "";
        let anyRows = false;
        for (const [pkey, rows] of Object.entries(s.platforms || {})) {
          if (!rows || !rows.length) continue;
          anyRows = true;
          teaser += `<div class="plat"><b>${esc(PLATFORMS[pkey] || pkey)}</b><ol>` +
            rows.slice(0, 3).map((t) =>
              `<li><a href="${esc(t.link.url)}"${t.link.kind === "external" ? ' target="_blank" rel="noopener"' : ""}>@${esc(t.handle)}</a> <span style="color:var(--muted)">★ ${t.totalStars}</span></li>`
            ).join("") + `</ol></div>`;
        }
        if (!anyRows) {
          teaser = `<p class="grow">Rankings for ${esc(s.niche)} are still growing — request anyway and we&rsquo;ll curate your list from the latest data.</p>`;
        } else {
          teaser += `<p class="sub" style="margin-top:10px">${s.totalRanked} ranked across platforms · full Top 7 per platform in the paid shortlist.</p>`;
        }
        card.innerHTML = `<h2>${esc(s.niche)}</h2>
          <div class="price">$${s.price} <small>one-time</small></div>
          <p class="sub" style="margin:0">Top 7 ranked ${esc(s.niche)} engagers per platform, from live community rankings.</p>
          <div class="teaser">${teaser}</div>
          <div style="margin-top:auto;padding-top:10px"><button class="btn block" data-niche="${esc(s.niche)}">Request this shortlist</button></div>`;
        grid.appendChild(card);
      }
      grid.querySelectorAll("[data-niche]").forEach((b) => {
        b.onclick = () => {
          $("inqNiche").value = b.dataset.niche;
          updateBtn();
          $("inquireSection").scrollIntoView({ behavior: "smooth", block: "start" });
        };
      });
    } catch (e) {
      grid.innerHTML = `<p class="sub">Couldn&rsquo;t load the shortlists right now. You can still request one below — we&rsquo;ll curate it from the latest rankings.</p>`;
    }
  }

  function updateBtn() {
    const n = $("inqNiche").value;
    $("inqBtn").textContent = `Request shortlist — $50 (${n})`;
  }
  $("inqNiche").addEventListener("change", updateBtn);
  updateBtn();

  $("inqForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("inqErr"), ok = $("inqOk"), btn = $("inqBtn");
    err.style.display = "none"; ok.style.display = "none";
    btn.disabled = true;
    try {
      const r = await fetch("/api/brands/inquire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: $("inqNiche").value,
          brandName: $("inqBrand").value.trim(),
          email: $("inqEmail").value.trim(),
          message: $("inqMsg").value.trim(),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Something went wrong.");
      $("inqForm").reset(); updateBtn();
      ok.style.display = "block";
      ok.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (ex) {
      err.textContent = ex.message;
      err.style.display = "block";
    } finally {
      btn.disabled = false;
    }
  });

  load();
})();
