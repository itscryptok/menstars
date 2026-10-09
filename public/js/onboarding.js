// Menstars onboarding: 3 friendly skippable steps after signup.
(function () {
  const PLATFORMS = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", x: "X.com", facebook: "Facebook" };
  const $ = (id) => document.getElementById(id);
  const err = $("obErr");
  let step = 1;
  let obPlatform = "tiktok";

  function showErr(msg) { err.textContent = msg; err.style.display = "block"; }
  function hideErr() { err.style.display = "none"; }

  // must be logged in
  fetch("/api/auth/me").then((r) => r.json()).then((d) => {
    if (!d.user) location.href = "/login";
  }).catch(() => { location.href = "/login"; });

  function setStep(n) {
    step = n;
    [1, 2, 3].forEach((i) => { $("obStep" + i).hidden = i !== n; });
    $("obStepLabel").textContent = "Step " + n + " of 3";
    const dots = $("obDots").children;
    for (let i = 0; i < dots.length; i++) dots[i].classList.toggle("active", i < n);
    $("obContinue").textContent = n === 3 ? "Finish → go to my dashboard" : "Continue →";
    hideErr();
    window.scrollTo(0, 0);
  }

  async function api(url, opts) {
    const r = await fetch(url, Object.assign({ headers: { "Content-Type": "application/json" } }, opts || {}));
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Something went wrong.");
    return d;
  }

  // platform tabs for step 3
  const pt = $("obPlatformTabs");
  for (const [key, label] of Object.entries(PLATFORMS)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tab" + (key === obPlatform ? " active" : "");
    b.textContent = label;
    b.onclick = () => {
      obPlatform = key;
      pt.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
    };
    pt.appendChild(b);
  }

  // niche "Other" toggle
  let obNichePicker = null;
  api("/api/auth/me").then((d) => {
    const selected = (d.user && d.user.niches) || [];
    return initNichePicker($("obNichePicker"), { selected });
  }).then((p) => { obNichePicker = p; }).catch(() => {});

  $("obTrackBtn").onclick = async () => {
    hideErr();
    const username = $("obEngager").value.trim();
    if (!username) { showErr("Type a username first."); return; }
    try {
      const d = await api("/api/engagers", {
        method: "POST",
        body: JSON.stringify({ platform: obPlatform, username }),
      });
      const box = $("obAdded");
      box.style.display = "block";
      box.innerHTML = "🎉 <b>@" + escapeHtml(d.engager.username) + "</b> is on your list. Nice — you're up and running.";
      $("obEngager").value = "";
    } catch (e) { showErr(e.message); }
  };

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  async function saveStep() {
    if (step === 1) {
      const handles = {};
      const map = { tiktok: "obTiktok", instagram: "obInstagram", youtube: "obYoutube", x: "obX", facebook: "obFacebook" };
      for (const [p, id] of Object.entries(map)) {
        const v = $(id).value.trim();
        if (v) handles[p] = v;
      }
      if (Object.keys(handles).length) await api("/api/handles", { method: "PUT", body: JSON.stringify({ handles }) });
    } else if (step === 2) {
      if (obNichePicker) {
        const { niches } = obNichePicker.getSelection();
        await api("/api/account", { method: "PUT", body: JSON.stringify({ niches }) });
      }
    }
    // step 3 saves inline via the Track button; nothing required to continue.
  }

  $("obContinue").onclick = async () => {
    hideErr();
    try {
      await saveStep();
      if (step < 3) setStep(step + 1);
      else location.href = "/app";
    } catch (e) { showErr(e.message); }
  };

  $("obSkip").onclick = () => {
    if (step < 3) setStep(step + 1);
    else location.href = "/app";
  };

  setStep(1);
})();
