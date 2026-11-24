// Create Experience (baseplate) routes. Mounted from server.js; touches no other route.
// Uses an unofficial cookie-based Roblox endpoint: use a TEST account only.
// The cookie is used per request and is never stored or logged.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const CREATE_URL = "https://apis.roblox.com/universes/v1/universes/create";
const DAILY_LIMIT = Math.max(1, parseInt(process.env.CREATE_DAILY_LIMIT || "5", 10) || 5);

function cleanCookie(raw) {
  return String(raw || "").trim().replace(/^\.?ROBLOSECURITY=/i, "").replace(/;$/, "").trim();
}

async function robloxFetch(url, { method = "GET", cookie, body, csrf }) {
  const headers = {
    Cookie: ".ROBLOSECURITY=" + cookie,
    "User-Agent": UA,
    Accept: "application/json",
    Origin: "https://create.roblox.com",
    Referer: "https://create.roblox.com/",
  };
  if (body) headers["Content-Type"] = "application/json";
  if (csrf) headers["X-CSRF-TOKEN"] = csrf;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { res, text: await res.text() };
}

async function withCsrf(url, opts) {
  let r = await robloxFetch(url, opts);
  if (r.res.status === 403 && r.res.headers.get("x-csrf-token")) {
    r = await robloxFetch(url, { ...opts, csrf: r.res.headers.get("x-csrf-token") });
  }
  return r;
}

function usedToday(req) {
  const today = new Date().toISOString().slice(0, 10);
  const s = req.session.createExp;
  if (!s || s.date !== today) req.session.createExp = { date: today, count: 0 };
  return req.session.createExp;
}

module.exports = function mountCreateExperience(app, auth) {
  const needCookie = (req, res) => {
    const cookie = cleanCookie(req.body && req.body.cookie);
    if (!cookie) { res.status(400).json({ error: "Ilagay ang cookie ng test account." }); return null; }
    return cookie;
  };

  app.post("/api/create-experience/whoami", auth, async (req, res) => {
    const cookie = needCookie(req, res); if (!cookie) return;
    try {
      const { res: r, text } = await withCsrf("https://users.roblox.com/v1/users/authenticated", { cookie });
      let name = ""; try { name = JSON.parse(text).name || ""; } catch {}
      res.json({ status: r.status, name, body: r.status === 200 ? "" : text.slice(0, 800) });
    } catch (e) { res.status(500).json({ error: "Hindi naabot ang Roblox." }); }
  });

  app.post("/api/create-experience/list", auth, async (req, res) => {
    const cookie = needCookie(req, res); if (!cookie) return;
    try {
      let cursor = "", total = 0, more = false;
      const recent = [];
      for (let i = 0; i < 10; i++) {
        const u = "https://develop.roblox.com/v1/user/universes?limit=50&sortOrder=Desc" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
        const { res: r, text } = await withCsrf(u, { cookie });
        if (r.status !== 200) return res.json({ status: r.status, body: text.slice(0, 800) });
        let j = {}; try { j = JSON.parse(text); } catch {}
        const rows = j.data || [];
        total += rows.length;
        for (const row of rows) if (recent.length < 5) recent.push(row.name);
        cursor = j.nextPageCursor || "";
        if (!cursor) break;
        if (i === 9) more = true;
      }
      res.json({ status: 200, count: total, more, recent });
    } catch (e) { res.status(500).json({ error: "Hindi nabilang ang experiences." }); }
  });

  app.post("/api/create-experience/create", auth, async (req, res) => {
    const cookie = needCookie(req, res); if (!cookie) return;
    const used = usedToday(req);
    if (used.count >= DAILY_LIMIT) {
      return res.status(429).json({ error: "Naabot na ang daily limit (" + used.count + "/" + DAILY_LIMIT + ") sa session na ito." });
    }
    const id = Number(req.body.templatePlaceId) || 95206881; // Baseplate template
    const name = String(req.body.name || "").trim().slice(0, 50);
    const description = String(req.body.description || "").trim().slice(0, 1000);
    try {
      const { res: r, text } = await withCsrf(CREATE_URL, {
        method: "POST", cookie, body: { templatePlaceId: id, templatePlaceIdToUse: id },
      });
      if (r.status < 200 || r.status >= 300) {
        return res.json({ created: null, status: r.status, body: text.slice(0, 1200), steps: [] });
      }
      let created = null; try { created = JSON.parse(text); } catch {}
      if (!created || !created.universeId) {
        return res.json({ created: null, status: r.status, body: text.slice(0, 1200), steps: [] });
      }
      used.count += 1;
      const steps = [];
      const uid = created.universeId;
      if (name || description) {
        const body = {}; if (name) body.name = name; if (description) body.description = description;
        const u = "https://develop.roblox.com/v2/universes/" + uid + "/configuration";
        const x = await withCsrf(u, { method: "PATCH", cookie, body });
        steps.push({ step: "Name / description", status: x.res.status, body: x.text.slice(0, 600) });
      }
      if (req.body.makePublic) {
        const u = "https://apis.roblox.com/legacy-develop/v1/universes/" + uid + "/activate";
        const x = await withCsrf(u, { method: "POST", cookie });
        steps.push({ step: "Make public", status: x.res.status, body: x.text.slice(0, 600) });
      }
      res.json({ created, steps, usedToday: used.count, dailyLimit: DAILY_LIMIT });
    } catch (e) { res.status(500).json({ error: "Hindi naabot ang Roblox." }); }
  });
};
