// Menstars — My Engager Network (MEN). Express + Prisma + PostgreSQL
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;
const SITE_URL = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

const SESSION_COOKIE = "men_session";
const SESSION_DAYS = 30;

const PLATFORMS = {
  tiktok: { label: "TikTok", profileUrl: (h) => `https://www.tiktok.com/@${h}` },
  instagram: { label: "Instagram", profileUrl: (h) => `https://www.instagram.com/${h}` },
  youtube: { label: "YouTube", profileUrl: (h) => `https://www.youtube.com/@${h}` },
  facebook: { label: "Facebook", profileUrl: (h) => `https://www.facebook.com/${h}` },
};
const PLATFORM_KEYS = Object.keys(PLATFORMS);

// Contributor niches (v1: one per contributor). "Other" takes free text.
const NICHES = [
  "Beauty", "Food", "Comedy", "Fitness", "Fashion", "Music", "Dance",
  "Gaming", "Education", "Business", "Lifestyle", "Sports", "Travel", "Tech", "Other",
];

// Normalize a (dropdown, otherText) pair into a single stored value.
// Returns null when blank. "Other" + custom text stores the custom text.
function normalizeNiche(niche, otherText) {
  const n = String(niche || "").trim();
  if (!n) return null;
  if (n === "Other") {
    const t = String(otherText || "").trim().slice(0, 40);
    return t || "Other";
  }
  if (NICHES.includes(n)) return n;
  // Tolerate a raw custom value (e.g. saved as free text before).
  return n.slice(0, 40) || null;
}

function cleanHandle(raw) {
  if (typeof raw !== "string") return null;
  let h = raw.trim().replace(/^@+/, "");
  if (!/^[A-Za-z0-9._-]{1,60}$/.test(h)) return null;
  return h;
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSessionCookie(res, token) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax`
  );
}
function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
  );
}

async function authMiddleware(req, res, next) {
  req.user = null;
  try {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (token) {
      const sess = await prisma.session.findUnique({
        where: { token },
        include: { user: true },
      });
      if (sess && sess.expiresAt > new Date() && !sess.user.suspended) {
        req.user = sess.user;
      } else if (sess) {
        await prisma.session.delete({ where: { token } }).catch(() => {});
      }
    }
  } catch (e) {
    console.error("auth middleware error:", e.message);
  }
  next();
}
app.use(authMiddleware);

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Login required." });
  next();
}

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    topBrand: u.topBrand || null,
    niche: u.niche || null,
    suspended: !!u.suspended,
    createdAt: u.createdAt,
  };
}

async function getHandlesMap(userId) {
  const rows = await prisma.claimedHandle.findMany({ where: { userId } });
  const map = {};
  for (const r of rows) map[r.platform] = r.handle;
  return map;
}

// ---------- health ----------
app.get("/api/health", (req, res) => res.json({ ok: true }));

// ---------- auth ----------
app.post("/api/auth/signup", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: "Enter a valid email address." });
    if (password.length < 8)
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: "That email is already registered. Try logging in." });
    const passwordHash = await bcrypt.hash(password, 10);
    // Frictionless signup: email + password only. Everything else is set
    // later via the onboarding walkthrough or the profile page.
    const user = await prisma.user.create({ data: { email, passwordHash } });
    const token = crypto.randomBytes(32).toString("hex");
    await prisma.session.create({
      data: { token, userId: user.id, expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5) },
    });
    setSessionCookie(res, token);
    res.json({ user: publicUser(user), handles: {} });
  } catch (e) {
    console.error("signup error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(400).json({ error: "Email or password is wrong." });
    if (user.suspended)
      return res.status(403).json({ error: "This account has been suspended." });
    const token = crypto.randomBytes(32).toString("hex");
    await prisma.session.create({
      data: { token, userId: user.id, expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5) },
    });
    setSessionCookie(res, token);
    res.json({ user: publicUser(user), handles: await getHandlesMap(user.id) });
  } catch (e) {
    console.error("login error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

app.post("/api/auth/logout", requireAuth, async (req, res) => {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) await prisma.session.delete({ where: { token } }).catch(() => {});
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.delete("/api/auth/account", requireAuth, async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.user.id } });
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (e) {
    console.error("account delete error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

app.get("/api/auth/me", async (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: publicUser(req.user), handles: await getHandlesMap(req.user.id) });
});

// Update own profile: display name + top brand + niche (all optional).
app.put("/api/account", requireAuth, async (req, res) => {
  try {
    const data = {};
    if (req.body.displayName !== undefined)
      data.displayName = String(req.body.displayName || "").trim().slice(0, 60) || null;
    if (req.body.topBrand !== undefined)
      data.topBrand = String(req.body.topBrand || "").trim().slice(0, 80) || null;
    if (req.body.niche !== undefined)
      data.niche = normalizeNiche(req.body.niche, req.body.nicheOther);
    const user = await prisma.user.update({ where: { id: req.user.id }, data });
    res.json({ user: publicUser(user) });
  } catch (e) {
    console.error("account update error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

// ---------- claimed handles ----------
app.put("/api/handles", requireAuth, async (req, res) => {
  try {
    const input = req.body.handles || {};
    for (const p of PLATFORM_KEYS) {
      const raw = input[p];
      if (raw === undefined) continue;
      const h = raw === "" || raw === null ? null : cleanHandle(raw);
      if (raw !== "" && raw !== null && !h)
        return res.status(400).json({ error: `That ${PLATFORMS[p].label} handle doesn't look valid.` });
      const existing = await prisma.claimedHandle.findUnique({
        where: { userId_platform: { userId: req.user.id, platform: p } },
      });
      if (h === null) {
        if (existing) await prisma.claimedHandle.delete({ where: { id: existing.id } });
      } else if (existing) {
        if (existing.handle !== h)
          await prisma.claimedHandle.update({ where: { id: existing.id }, data: { handle: h } });
      } else {
        await prisma.claimedHandle.create({ data: { userId: req.user.id, platform: p, handle: h } });
      }
    }
    res.json({ handles: await getHandlesMap(req.user.id) });
  } catch (e) {
    console.error("handles error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

// Is this username a registered MEN member's claimed handle on this platform?
async function registeredProfile(platform, username) {
  return prisma.claimedHandle.findFirst({
    where: { platform, handle: { equals: username, mode: "insensitive" } },
    include: { user: true },
  });
}

function engagerLink(platform, username, reg) {
  if (reg) return { kind: "internal", url: `/profile/${platform}/${encodeURIComponent(reg.handle)}` };
  return { kind: "external", url: PLATFORMS[platform].profileUrl(username) };
}

// ---------- engagers ----------
app.get("/api/engagers", requireAuth, async (req, res) => {
  try {
    const platform = String(req.query.platform || "");
    if (!PLATFORMS[platform]) return res.status(400).json({ error: "Unknown platform." });
    const sort = String(req.query.sort || "stars");
    const q = String(req.query.q || "").trim().toLowerCase();
    const orderBy =
      sort === "name" ? { username: "asc" } :
      sort === "recent" ? { createdAt: "desc" } :
      [{ stars: "desc" }, { createdAt: "desc" }];
    let rows = await prisma.engager.findMany({
      where: { userId: req.user.id, platform },
      orderBy,
    });
    if (q) rows = rows.filter((r) => r.username.toLowerCase().includes(q) || (r.notes || "").toLowerCase().includes(q));
    const out = [];
    for (const r of rows) {
      const reg = await registeredProfile(platform, r.username);
      out.push({
        id: r.id, username: r.username, notes: r.notes, stars: r.stars,
        createdAt: r.createdAt, link: engagerLink(platform, r.username, reg),
      });
    }
    res.json({ engagers: out });
  } catch (e) {
    console.error("engagers list error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

app.post("/api/engagers", requireAuth, async (req, res) => {
  try {
    const platform = String(req.body.platform || "");
    const username = cleanHandle(req.body.username || "");
    if (!PLATFORMS[platform]) return res.status(400).json({ error: "Unknown platform." });
    if (!username) return res.status(400).json({ error: "Enter a valid username." });
    const dupe = await prisma.engager.findUnique({
      where: { userId_platform_username: { userId: req.user.id, platform, username } },
    }).catch(async () => {
      // fallback for case variants: check case-insensitively
      return prisma.engager.findFirst({
        where: { userId: req.user.id, platform, username: { equals: username, mode: "insensitive" } },
      });
    });
    if (dupe) return res.status(400).json({ error: "That engager is already on your list." });
    const r = await prisma.engager.create({
      data: { userId: req.user.id, platform, username },
    });
    const reg = await registeredProfile(platform, username);
    res.json({
      engager: {
        id: r.id, username: r.username, notes: r.notes, stars: r.stars,
        createdAt: r.createdAt, link: engagerLink(platform, r.username, reg),
      },
    });
  } catch (e) {
    if (e.code === "P2002")
      return res.status(400).json({ error: "That engager is already on your list." });
    console.error("engager add error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

app.patch("/api/engagers/:id", requireAuth, async (req, res) => {
  try {
    const r = await prisma.engager.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!r) return res.status(404).json({ error: "Engager not found." });
    const notes = String(req.body.notes || "").slice(0, 2000);
    const updated = await prisma.engager.update({ where: { id: r.id }, data: { notes } });
    res.json({ ok: true, notes: updated.notes });
  } catch (e) {
    console.error("engager notes error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

app.post("/api/engagers/:id/star", requireAuth, async (req, res) => {
  try {
    const r = await prisma.engager.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!r) return res.status(404).json({ error: "Engager not found." });
    const updated = await prisma.engager.update({
      where: { id: r.id },
      data: { stars: { increment: 1 } },
    });
    res.json({ ok: true, stars: updated.stars });
  } catch (e) {
    console.error("star error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

app.delete("/api/engagers/:id", requireAuth, async (req, res) => {
  try {
    const r = await prisma.engager.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!r) return res.status(404).json({ error: "Engager not found." });
    await prisma.engager.delete({ where: { id: r.id } });
    res.json({ ok: true });
  } catch (e) {
    console.error("engager delete error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

// ---------- top 7 ----------
app.get("/api/top7", requireAuth, async (req, res) => {
  try {
    const platform = String(req.query.platform || "");
    if (!PLATFORMS[platform]) return res.status(400).json({ error: "Unknown platform." });
    const rows = await prisma.engager.findMany({
      where: { userId: req.user.id, platform, stars: { gt: 0 } },
      orderBy: [{ stars: "desc" }, { createdAt: "desc" }],
      take: 7,
    });
    const out = [];
    let rank = 0;
    for (const r of rows) {
      rank += 1;
      const reg = await registeredProfile(platform, r.username);
      out.push({
        rank, id: r.id, username: r.username, stars: r.stars,
        link: engagerLink(platform, r.username, reg),
      });
    }
    res.json({ top: out });
  } catch (e) {
    console.error("top7 error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

// ---------- who added me ----------
app.get("/api/added-me", requireAuth, async (req, res) => {
  try {
    const platform = String(req.query.platform || "");
    if (!PLATFORMS[platform]) return res.status(400).json({ error: "Unknown platform." });
    const handles = await getHandlesMap(req.user.id);
    const myHandle = handles[platform];
    if (!myHandle) return res.json({ claimed: false, entries: [] });
    const rows = await prisma.engager.findMany({
      where: {
        platform,
        username: { equals: myHandle, mode: "insensitive" },
        NOT: { userId: req.user.id },
      },
      include: { user: { include: { handles: true } } },
      orderBy: { createdAt: "desc" },
    });
    const seen = new Map();
    for (const r of rows) {
      if (seen.has(r.userId)) continue;
      const adderHandle = (r.user.handles.find((h) => h.platform === platform) || {}).handle || null;
      seen.set(r.userId, {
        name: r.user.displayName || "A MEN member",
        handle: adderHandle,
        profileUrl: adderHandle ? `/profile/${platform}/${encodeURIComponent(adderHandle)}` : null,
        at: r.createdAt,
      });
    }
    res.json({ claimed: true, myHandle, entries: [...seen.values()] });
  } catch (e) {
    console.error("added-me error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

// ---------- public in-app profile ----------
app.get("/api/profile/:platform/:handle", async (req, res) => {
  try {
    const platform = String(req.params.platform || "");
    if (!PLATFORMS[platform]) return res.status(400).json({ error: "Unknown platform." });
    const handle = cleanHandle(req.params.handle || "");
    if (!handle) return res.status(404).json({ error: "Profile not found." });
    const claimed = await prisma.claimedHandle.findFirst({
      where: { platform, handle: { equals: handle, mode: "insensitive" } },
      include: { user: { include: { handles: true } } },
    });
    if (!claimed) return res.status(404).json({ error: "That handle isn't registered on MEN yet." });
    const agg = await prisma.engager.aggregate({
      _sum: { stars: true },
      where: {
        platform,
        username: { equals: claimed.handle, mode: "insensitive" },
        NOT: { userId: claimed.userId },
      },
    });
    res.json({
      displayName: claimed.user.displayName || "MEN member",
      handle: claimed.handle,
      platform,
      platformLabel: PLATFORMS[platform].label,
      topBrand: claimed.user.topBrand || null,
      niche: claimed.user.niche || null,
      totalStars: agg._sum.stars || 0,
      memberSince: claimed.user.createdAt,
      links: claimed.user.handles.map((h) => ({
        platform: h.platform,
        label: PLATFORMS[h.platform] ? PLATFORMS[h.platform].label : h.platform,
        handle: h.handle,
        url: PLATFORMS[h.platform] ? PLATFORMS[h.platform].profileUrl(h.handle) : "#",
      })),
    });
  } catch (e) {
    console.error("profile error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

// ---------- private notepad ----------
app.get("/api/notes", requireAuth, async (req, res) => {
  const notes = await prisma.note.findMany({
    where: { userId: req.user.id },
    orderBy: { updatedAt: "desc" },
  });
  res.json({ notes });
});

app.post("/api/notes", requireAuth, async (req, res) => {
  try {
    const title = String(req.body.title || "").trim().slice(0, 120) || "Untitled note";
    const body = String(req.body.body || "").slice(0, 10000);
    const n = await prisma.note.create({ data: { userId: req.user.id, title, body } });
    res.json({ note: n });
  } catch (e) {
    console.error("note create error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

app.patch("/api/notes/:id", requireAuth, async (req, res) => {
  try {
    const n = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!n) return res.status(404).json({ error: "Note not found." });
    const data = {};
    if (req.body.title !== undefined) data.title = String(req.body.title).trim().slice(0, 120) || "Untitled note";
    if (req.body.body !== undefined) data.body = String(req.body.body).slice(0, 10000);
    const updated = await prisma.note.update({ where: { id: n.id }, data });
    res.json({ note: updated });
  } catch (e) {
    console.error("note update error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

app.delete("/api/notes/:id", requireAuth, async (req, res) => {
  try {
    const n = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!n) return res.status(404).json({ error: "Note not found." });
    await prisma.note.delete({ where: { id: n.id } });
    res.json({ ok: true });
  } catch (e) {
    console.error("note delete error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

// ---------- aggregated platform-wide leaderboard ----------
// Unique engager = platform + lowercased handle. Ranked by TOTAL stars from
// every contributor combined. Public (advertiser/buyer-facing).
// niches: derived from the niches of contributors who starred each handle
// (an engager can carry multiple niches). Optional nicheFilter keeps only
// engagers known to engage with that niche.
async function aggregatedTop(platform, limit = 7, nicheFilter = null) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT platform, MIN(username) AS display, LOWER(username) AS h,
            SUM(stars)::int AS total_stars, COUNT(DISTINCT "userId")::int AS contributors
     FROM "Engager" WHERE platform = $1
     GROUP BY platform, LOWER(username)
     HAVING SUM(stars) > 0
     ORDER BY total_stars DESC, contributors DESC
     LIMIT $2`,
    platform,
    limit
  );
  const out = [];
  let rank = 0;
  for (const r of rows) {
    rank += 1;
    const reg = await prisma.claimedHandle.findFirst({
      where: { platform, handle: { equals: r.h, mode: "insensitive" } },
      include: { user: { select: { topBrand: true } } },
    });
    const nicheRows = await prisma.$queryRawUnsafe(
      `SELECT DISTINCT u.niche AS niche FROM "Engager" e
       JOIN "User" u ON u.id = e."userId"
       WHERE e.platform = $1 AND LOWER(e.username) = $2
         AND e.stars > 0 AND u.niche IS NOT NULL AND u.niche <> ''`,
      platform,
      r.h
    );
    const niches = nicheRows.map((x) => x.niche);
    if (
      nicheFilter &&
      !niches.some((n) => n.toLowerCase() === String(nicheFilter).toLowerCase())
    )
      continue;
    out.push({
      rank,
      handle: r.display,
      platform,
      totalStars: r.total_stars,
      contributors: r.contributors,
      niches,
      topBrand: (reg && reg.user.topBrand) || null,
      link: reg
        ? { kind: "internal", url: `/profile/${platform}/${encodeURIComponent(reg.handle)}` }
        : { kind: "external", url: PLATFORMS[platform].profileUrl(r.display) },
    });
  }
  return out;
}

app.get("/api/top-engagers", async (req, res) => {
  try {
    const platform = String(req.query.platform || "");
    if (!PLATFORMS[platform]) return res.status(400).json({ error: "Unknown platform." });
    res.json({ platform, top: await aggregatedTop(platform, 7) });
  } catch (e) {
    console.error("top-engagers error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

// ---------- admin (/addy) ----------
// Password-only. Bcrypt hash comes from env ADMIN_PASSWORD_HASH (set by Yemi
// via secure vault). Session = HMAC-signed timestamp cookie, 12h expiry.
// PRIVACY RULE: admin queries NEVER select users' private engager notes or
// notepad contents — those fields are excluded from every admin query below.
const ADMIN_COOKIE = "men_admin";
const ADMIN_SESSION_HOURS = 12;
const adminAttempts = new Map(); // ip -> [timestamps]

function clientIp(req) {
  return (
    String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    (req.socket && req.socket.remoteAddress) ||
    "unknown"
  );
}

function adminRateLimited(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const arr = (adminAttempts.get(ip) || []).filter((t) => now - t < 60000);
  if (adminAttempts.size > 2000) adminAttempts.clear();
  adminAttempts.set(ip, arr);
  return arr.length >= 5;
}

function adminSecret() {
  return process.env.SESSION_SECRET || "menstars-dev-secret";
}

function signAdmin(expiry) {
  const data = String(expiry);
  const sig = crypto.createHmac("sha256", adminSecret()).update(data).digest("hex");
  return Buffer.from(data).toString("base64url") + "." + sig;
}

function verifyAdmin(req) {
  try {
    const token = parseCookies(req)[ADMIN_COOKIE];
    if (!token) return false;
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const expiry = parseInt(Buffer.from(parts[0], "base64url").toString("utf8"), 10);
    if (!expiry || expiry < Date.now()) return false;
    const sig = crypto.createHmac("sha256", adminSecret()).update(String(expiry)).digest("hex");
    if (sig.length !== parts[1].length) return false;
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(parts[1]));
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  if (!verifyAdmin(req)) return res.status(401).json({ error: "Admin login required." });
  next();
}

app.post("/api/addy/login", async (req, res) => {
  try {
    if (adminRateLimited(req))
      return res.status(429).json({ error: "Too many attempts. Wait a minute and try again." });
    const ip = clientIp(req);
    adminAttempts.set(ip, [...(adminAttempts.get(ip) || []), Date.now()]);
    const hash = process.env.ADMIN_PASSWORD_HASH || "";
    const password = String(req.body.password || "");
    if (!hash || !password || !(await bcrypt.compare(password, hash))) {
      return res.status(401).json({ error: "Wrong password." });
    }
    const expiry = Date.now() + ADMIN_SESSION_HOURS * 3600 * 1000;
    res.setHeader(
      "Set-Cookie",
      `${ADMIN_COOKIE}=${signAdmin(expiry)}; HttpOnly; Path=/; Max-Age=${ADMIN_SESSION_HOURS * 3600}; SameSite=Lax`
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("addy login error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

app.post("/api/addy/logout", (req, res) => {
  res.setHeader("Set-Cookie", `${ADMIN_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
  res.json({ ok: true });
});

app.get("/api/addy/me", (req, res) => res.json({ admin: verifyAdmin(req) }));

app.get("/api/addy/overview", requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const d7 = new Date(now.getTime() - 7 * 864e5);
    const d30 = new Date(now.getTime() - 30 * 864e5);
    const [totalUsers, signups7, signups30, totalEngagers, starsAgg, perPlatform, perPlatformUsers, perNiche] =
      await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: d7 } } }),
        prisma.user.count({ where: { createdAt: { gte: d30 } } }),
        prisma.engager.count(),
        prisma.engager.aggregate({ _sum: { stars: true } }),
        prisma.engager.groupBy({ by: ["platform"], _count: { _all: true }, _sum: { stars: true } }),
        prisma.claimedHandle.groupBy({ by: ["platform"], _count: { _all: true } }),
        prisma.user.groupBy({ by: ["niche"], _count: { _all: true }, where: { niche: { not: null } } }),
      ]);
    res.json({
      totalUsers, signups7, signups30, totalEngagers,
      totalStars: starsAgg._sum.stars || 0,
      perNiche: perNiche
        .filter((n) => n.niche)
        .map((n) => ({ niche: n.niche, contributors: n._count._all }))
        .sort((a, b) => b.contributors - a.contributors),
      perPlatform: perPlatform.map((p) => ({
        platform: p.platform,
        engagers: p._count._all,
        stars: p._sum.stars || 0,
        claimedHandles: (perPlatformUsers.find((x) => x.platform === p.platform) || { _count: { _all: 0 } })._count._all,
      })),
    });
  } catch (e) {
    console.error("addy overview error:", e.message);
    res.status(500).json({ error: "Something went wrong." });
  }
});

// Users: safe fields only — NEVER notes/notepad contents.
app.get("/api/addy/users", requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const niche = String(req.query.niche || "").trim();
    const take = Math.min(parseInt(req.query.take || "25", 10) || 25, 100);
    const skip = parseInt(req.query.skip || "0", 10) || 0;
    const where = q
      ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }] }
      : {};
    if (niche) where.niche = { equals: niche, mode: "insensitive" };
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true, email: true, displayName: true, topBrand: true, niche: true, suspended: true, createdAt: true,
          handles: { select: { platform: true, handle: true } },
          _count: { select: { engagers: true, notes: true } },
        },
        orderBy: { createdAt: "desc" },
        take, skip,
      }),
    ]);
    res.json({ total, users });
  } catch (e) {
    console.error("addy users error:", e.message);
    res.status(500).json({ error: "Something went wrong." });
  }
});

app.post("/api/addy/users/:id/suspend", requireAdmin, async (req, res) => {
  await prisma.user.update({ where: { id: req.params.id }, data: { suspended: true } }).catch(() => null);
  await prisma.session.deleteMany({ where: { userId: req.params.id } }).catch(() => {});
  res.json({ ok: true });
});

app.post("/api/addy/users/:id/unsuspend", requireAdmin, async (req, res) => {
  await prisma.user.update({ where: { id: req.params.id }, data: { suspended: false } }).catch(() => null);
  res.json({ ok: true });
});

app.delete("/api/addy/users/:id", requireAdmin, async (req, res) => {
  await prisma.user.delete({ where: { id: req.params.id } }).catch(() => null);
  res.json({ ok: true });
});

// Engager entries for moderation: metadata only — NEVER the private notes.
app.get("/api/addy/engagers", requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const platform = String(req.query.platform || "");
    const take = Math.min(parseInt(req.query.take || "25", 10) || 25, 100);
    const skip = parseInt(req.query.skip || "0", 10) || 0;
    const where = {};
    if (platform && PLATFORMS[platform]) where.platform = platform;
    if (q) where.username = { contains: q, mode: "insensitive" };
    const [total, rows] = await Promise.all([
      prisma.engager.count({ where }),
      prisma.engager.findMany({
        where,
        select: {
          id: true, username: true, platform: true, stars: true, createdAt: true,
          user: { select: { email: true, displayName: true } },
        },
        orderBy: { createdAt: "desc" },
        take, skip,
      }),
    ]);
    res.json({ total, engagers: rows });
  } catch (e) {
    console.error("addy engagers error:", e.message);
    res.status(500).json({ error: "Something went wrong." });
  }
});

app.delete("/api/addy/engagers/:id", requireAdmin, async (req, res) => {
  await prisma.engager.delete({ where: { id: req.params.id } }).catch(() => null);
  res.json({ ok: true });
});

app.get("/api/addy/leaderboard", requireAdmin, async (req, res) => {
  try {
    const platform = String(req.query.platform || "");
    if (!PLATFORMS[platform]) return res.status(400).json({ error: "Unknown platform." });
    const niche = String(req.query.niche || "").trim() || null;
    res.json({ platform, top: await aggregatedTop(platform, 50, niche) });
  } catch (e) {
    console.error("addy leaderboard error:", e.message);
    res.status(500).json({ error: "Something went wrong." });
  }
});

app.get("/api/addy/leaderboard.csv", requireAdmin, async (req, res) => {
  try {
    const platform = String(req.query.platform || "");
    if (!PLATFORMS[platform]) return res.status(400).json({ error: "Unknown platform." });
    const niche = String(req.query.niche || "").trim() || null;
    const top = await aggregatedTop(platform, 100, niche);
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = ["rank,handle,platform,total_stars,contributors,niches,promotes_brand,profile_url"];
    for (const t of top) {
      lines.push([t.rank, esc(t.handle), t.platform, t.totalStars, t.contributors, esc((t.niches || []).join("; ")), esc(t.topBrand || ""), esc(t.link.url)].join(","));
    }
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="menstars-top-engagers-${platform}.csv"`);
    res.send(lines.join("\n"));
  } catch (e) {
    console.error("addy csv error:", e.message);
    res.status(500).json({ error: "Something went wrong." });
  }
});

app.get("/api/addy/stars", requireAdmin, async (req, res) => {
  try {
    const [total, perPlatform, givers] = await Promise.all([
      prisma.engager.aggregate({ _sum: { stars: true } }),
      prisma.engager.groupBy({ by: ["platform"], _sum: { stars: true }, _count: { _all: true } }),
      prisma.engager.groupBy({
        by: ["userId"], _sum: { stars: true },
        orderBy: { _sum: { stars: "desc" } }, take: 20,
      }),
    ]);
    const userIds = givers.map((g) => g.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, displayName: true },
    });
    const byId = Object.fromEntries(users.map((u) => [u.id, u]));
    res.json({
      totalStars: total._sum.stars || 0,
      perPlatform: perPlatform.map((p) => ({ platform: p.platform, stars: p._sum.stars || 0, entries: p._count._all })),
      topContributors: givers.map((g) => ({
        starsGiven: g._sum.stars || 0,
        email: (byId[g.userId] || {}).email || "(deleted)",
        displayName: (byId[g.userId] || {}).displayName || null,
      })),
    });
  } catch (e) {
    console.error("addy stars error:", e.message);
    res.status(500).json({ error: "Something went wrong." });
  }
});

app.get("/api/addy/system", requireAdmin, async (req, res) => {
  try {
    const [users, engagers, handles, notes, sessions] = await Promise.all([
      prisma.user.count(), prisma.engager.count(), prisma.claimedHandle.count(),
      prisma.note.count(), prisma.session.count(),
    ]);
    res.json({
      uptimeSec: Math.round(process.uptime()),
      node: process.version,
      counts: { users, engagers, handles, notes, sessions },
    });
  } catch (e) {
    console.error("addy system error:", e.message);
    res.status(500).json({ error: "Something went wrong." });
  }
});

// ---------- pages ----------
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/app", (req, res) => res.sendFile(path.join(__dirname, "public", "app.html")));
app.get("/profile/:platform/:handle", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "profile.html"))
);
app.get("/top-engagers", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "top-engagers.html"))
);
app.get("/onboarding", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "onboarding.html"))
);
app.get("/addy", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "addy.html"))
);
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`MEN listening on ${PORT}`));
