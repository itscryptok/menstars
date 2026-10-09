(function () {
  const PLATFORMS = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", facebook: "Facebook" };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  let boardPlatform = "tiktok";

  async function api(path, opts) {
    const r = await fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, opts || {}));
    if (r.status === 401) { showLogin(); throw new Error("auth"); }
    const ct = r.headers.get("content-type") || "";
    const d = ct.includes("json") ? await r.json().catch(() => ({})) : await r.text();
    if (!r.ok) throw new Error((d && d.error) || "Something went wrong.");
    return d;
  }

  function showLogin() {
    $("addyLogin").style.display = "block";
    $("addyDash").style.display = "none";
    $("addyLogout").style.display = "none";
  }
  function showDash() {
    $("addyLogin").style.display = "none";
    $("addyDash").style.display = "block";
    $("addyLogout").style.display = "inline-flex";
  }

  async function boot() {
    try {
      const d = await api("/api/addy/me");
      if (d.admin) { showDash(); initTabs(); loadOverview(); }
      else showLogin();
    } catch { showLogin(); }
  }

  $("addyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("addyErr");
    err.style.display = "none";
    try {
      await api("/api/addy/login", { method: "POST", body: JSON.stringify({ password: $("addyPass").value }) });
      $("addyPass").value = "";
      showDash(); initTabs(); loadOverview();
    } catch (ex) { err.textContent = ex.message; err.style.display = "block"; }
  });

  $("addyLogout").onclick = async () => {
    await fetch("/api/addy/logout", { method: "POST" }).catch(() => {});
    location.reload();
  };

  // ---------- tabs ----------
  const TABS = [["overview", "Overview"], ["users", "Users"], ["board", "Leaderboard"], ["stars", "Stars"], ["mod", "Moderation"], ["system", "System"]];
  function initTabs() {
    const box = $("addyTabs");
    if (box.dataset.done) return;
    box.dataset.done = "1";
    TABS.forEach(([key, label], i) => {
      const b = document.createElement("button");
      b.className = "tab" + (i === 0 ? " active" : "");
      b.textContent = label;
      b.onclick = () => {
        box.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        TABS.forEach(([k]) => { $("ap-" + k).hidden = k !== key; });
        if (key === "users") loadUsers();
        if (key === "board") loadBoard();
        if (key === "stars") loadStars();
        if (key === "mod") loadMod();
        if (key === "system") loadSystem();
      };
      box.appendChild(b);
    });
    // board platform tabs + csv buttons
    const bt = $("boardTabs"), cb = $("csvBtns");
    for (const [key, label] of Object.entries(PLATFORMS)) {
      const b = document.createElement("button");
      b.className = "tab" + (key === boardPlatform ? " active" : "");
      b.textContent = label;
      b.onclick = () => { boardPlatform = key; bt.querySelectorAll(".tab").forEach((x) => x.classList.remove("active")); b.classList.add("active"); loadBoard(); };
      bt.appendChild(b);
      const c = document.createElement("a");
      c.className = "btn small ghost";
      c.textContent = "⬇ " + label + " CSV";
      c.href = "/api/addy/leaderboard.csv?platform=" + key;
      cb.appendChild(c);
    }
  }

  // ---------- overview ----------
  async function loadOverview() {
    const d = await api("/api/addy/overview");
    $("ovStats").innerHTML = [
      [d.totalUsers, "Total users"], [d.signups7, "Signups (7d)"], [d.signups30, "Signups (30d)"],
      [d.totalEngagers, "Engagers listed"], [d.totalStars, "Stars given"],
    ].map(([n, l]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join("");
    $("ovPlatforms").innerHTML = `<table class="adm"><tr><th>Platform</th><th>Engagers</th><th>Stars</th><th>Claimed handles</th></tr>` +
      d.perPlatform.map((p) => `<tr><td>${esc(PLATFORMS[p.platform] || p.platform)}</td><td>${p.engagers}</td><td>★ ${p.stars}</td><td>${p.claimedHandles}</td></tr>`).join("") + `</table>`;
  }

  // ---------- users ----------
  let userSkip = 0;
  async function loadUsers() {
    const q = $("userSearch").value.trim();
    const d = await api(`/api/addy/users?q=${encodeURIComponent(q)}&take=25&skip=${userSkip}`);
    const pages = Math.ceil(d.total / 25);
    let h = `<table class="adm"><tr><th>User</th><th>Handles</th><th>Engagers</th><th>Joined</th><th>Status</th><th></th></tr>`;
    for (const u of d.users) {
      const handles = u.handles.map((x) => `${esc(PLATFORMS[x.platform] || x.platform)}: @${esc(x.handle)}`).join("<br>") || "—";
      h += `<tr><td><b>${esc(u.displayName || "(no name)")}</b><br><span style="color:var(--muted)">${esc(u.email)}</span></td>
        <td>${handles}</td><td>${u._count.engagers}</td>
        <td>${new Date(u.createdAt).toLocaleDateString()}</td>
        <td>${u.suspended ? '<span class="pill bad">suspended</span>' : '<span class="pill ok">active</span>'}</td>
        <td style="white-space:nowrap">
          ${u.suspended
            ? `<button class="btn small ghost" data-u="unsuspend" data-id="${u.id}">Unsuspend</button>`
            : `<button class="btn small ghost" data-u="suspend" data-id="${u.id}">Suspend</button>`}
          <button class="btn small danger" data-u="del" data-id="${u.id}">Delete</button>
        </td></tr>`;
    }
    h += `</table><p style="color:var(--muted);font-size:13px;margin-top:8px">${d.total} users · page ${Math.floor(userSkip / 25) + 1} of ${Math.max(pages, 1)}</p>`;
    if (pages > 1) {
      h += `<div style="margin-top:8px;display:flex;gap:8px">
        <button class="btn small ghost" id="uPrev" ${userSkip === 0 ? "disabled" : ""}>← Prev</button>
        <button class="btn small ghost" id="uNext" ${(userSkip + 25) >= d.total ? "disabled" : ""}>Next →</button></div>`;
    }
    $("usersTable").innerHTML = h;
    const prev = $("uPrev"), next = $("uNext");
    if (prev) prev.onclick = () => { userSkip = Math.max(0, userSkip - 25); loadUsers(); };
    if (next) next.onclick = () => { userSkip += 25; loadUsers(); };
  }
  $("userSearchBtn").onclick = () => { userSkip = 0; loadUsers(); };
  $("usersTable").addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-u]");
    if (!b) return;
    const id = b.dataset.id, act = b.dataset.u;
    if (act === "del" && !confirm("Delete this user and ALL their data?")) return;
    if (act === "suspend" && !confirm("Suspend this user? They will be logged out immediately.")) return;
    try {
      if (act === "del") await api("/api/addy/users/" + id, { method: "DELETE" });
      else await api(`/api/addy/users/${id}/${act}`, { method: "POST" });
      loadUsers();
    } catch (e) { alert(e.message); }
  });

  // ---------- leaderboard ----------
  async function loadBoard() {
    const d = await api("/api/addy/leaderboard?platform=" + boardPlatform);
    if (!d.top.length) { $("boardTable").innerHTML = '<div class="empty">No data yet.</div>'; return; }
    $("boardTable").innerHTML = `<table class="adm"><tr><th>#</th><th>Handle</th><th>Total stars</th><th>Contributors</th><th>Profile</th></tr>` +
      d.top.map((t) => `<tr><td><b>${t.rank}</b></td><td>@${esc(t.handle)}${t.link.kind === "internal" ? ' <span class="reg-badge">MEN</span>' : ""}</td>
        <td>★ ${t.totalStars}</td><td>${t.contributors}</td>
        <td><a href="${esc(t.link.url)}"${t.link.kind === "external" ? ' target="_blank" rel="noopener"' : ""}>open ↗</a></td></tr>`).join("") + `</table>`;
  }

  // ---------- stars ----------
  async function loadStars() {
    const d = await api("/api/addy/stars");
    $("starsStats").innerHTML = `<div class="stat"><div class="n">★ ${d.totalStars}</div><div class="l">Total stars given</div></div>` +
      d.perPlatform.map((p) => `<div class="stat"><div class="n">${p.stars}</div><div class="l">${esc(PLATFORMS[p.platform] || p.platform)} stars (${p.entries} entries)</div></div>`).join("");
    $("starsGivers").innerHTML = `<table class="adm"><tr><th>Member</th><th>Stars given</th></tr>` +
      d.topContributors.map((g) => `<tr><td><b>${esc(g.displayName || "(no name)")}</b><br><span style="color:var(--muted)">${esc(g.email)}</span></td><td>★ ${g.starsGiven}</td></tr>`).join("") + `</table>`;
  }

  // ---------- moderation ----------
  let modSkip = 0;
  async function loadMod() {
    const q = $("modSearch").value.trim();
    const pf = $("modPlatform").value;
    const d = await api(`/api/addy/engagers?q=${encodeURIComponent(q)}&platform=${pf}&take=25&skip=${modSkip}`);
    let h = `<table class="adm"><tr><th>Engager</th><th>Platform</th><th>Stars</th><th>Listed by</th><th>Added</th><th></th></tr>`;
    for (const e of d.engagers) {
      h += `<tr><td><b>@${esc(e.username)}</b></td><td>${esc(PLATFORMS[e.platform] || e.platform)}</td><td>★ ${e.stars}</td>
        <td>${esc(e.user.displayName || "(no name)")}<br><span style="color:var(--muted)">${esc(e.user.email)}</span></td>
        <td>${new Date(e.createdAt).toLocaleDateString()}</td>
        <td><button class="btn small danger" data-e="${e.id}">Delete</button></td></tr>`;
    }
    h += `</table><p style="color:var(--muted);font-size:13px;margin-top:8px">${d.total} entries</p>`;
    $("modTable").innerHTML = h;
  }
  $("modSearchBtn").onclick = () => { modSkip = 0; loadMod(); };
  $("modTable").addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-e]");
    if (!b || !confirm("Delete this engager entry?")) return;
    try { await api("/api/addy/engagers/" + b.dataset.e, { method: "DELETE" }); loadMod(); }
    catch (e) { alert(e.message); }
  });

  // ---------- system ----------
  async function loadSystem() {
    const d = await api("/api/addy/system");
    const c = d.counts;
    $("sysInfo").innerHTML = `<div class="stat-grid">
      ${[["Users", c.users], ["Engagers", c.engagers], ["Claimed handles", c.handles], ["Notes (count only)", c.notes], ["Sessions", c.sessions], ["Uptime", Math.round(d.uptimeSec / 60) + " min"], ["Node", d.node]].map(([l, n]) => `<div class="stat"><div class="n" style="font-size:20px">${esc(String(n))}</div><div class="l">${l}</div></div>`).join("")}
    </div>`;
  }

  boot();
})();
