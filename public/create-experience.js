/* Create Experience sub-tab. Self-contained: only touches elements it owns,
   plus showing/hiding itself when the existing sub-tabs are clicked. */
(function () {
  const $ = id => document.getElementById(id);
  const panel = $("ezCreatePanel");
  if (!panel) return;

  const CAP_KEY = "rblxPublisher.createCap.v1";
  const TODAY_KEY = "rblxPublisher.createToday.v1";
  const today = () => new Date().toISOString().slice(0, 10);
  const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  const msg = $("ezcMessage"), out = $("ezcOutput");
  let linksBox = null;

  function log(line) { if (typeof appendEzLog === "function") appendEzLog(line); }
  function capValue() { return Math.max(1, parseInt($("ezcCap").value, 10) || 1); }
  function loadToday() {
    try { const d = JSON.parse(lsGet(TODAY_KEY) || "{}"); return d.date === today() ? d.count : 0; } catch { return 0; }
  }
  function saveToday(n) { lsSet(TODAY_KEY, JSON.stringify({ date: today(), count: n })); }

  $("ezcCap").value = lsGet(CAP_KEY) || "3";
  $("ezcToday").textContent = loadToday();
  $("ezcCap").addEventListener("change", () => lsSet(CAP_KEY, String(capValue())));

  // Show this panel only on its own sub-tab. The existing handler runs first (registered earlier).
  document.querySelectorAll(".ezTab").forEach(btn => btn.addEventListener("click", () => {
    const create = btn.dataset.ezMode === "create";
    panel.classList.toggle("hidden", !create);
    const warn = $("ezLimitWarning");
    if (warn) warn.classList.toggle("hidden", create);
    if (create) $("ezFormPanel").classList.add("hidden");
  }));

  async function post(path, payload) {
    const r = await fetch("/api/create-experience/" + path, {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const d = await r.json().catch(() => ({ error: "Invalid response" }));
    if (!r.ok && !d.error) d.error = "Request failed " + r.status;
    if (r.status === 401) d.error = "Please log in again.";
    return d;
  }

  function setBusy(b) { $("ezcCheckBtn").disabled = b; $("ezcCreateBtn").disabled = b; }
  function clearLinks() { if (linksBox) { linksBox.remove(); linksBox = null; } }
  function addLink(href, text) {
    if (!linksBox) { linksBox = document.createElement("div"); linksBox.className = "ezcLinks"; out.after(linksBox); }
    const a = document.createElement("a");
    a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = text;
    linksBox.appendChild(a);
  }
  const cookieVal = () => $("ezcCookie").value.trim();
  function needCookie() {
    if (cookieVal()) return true;
    msg.textContent = "Ilagay muna ang cookie ng test account.";
    return false;
  }

  $("ezcCheckBtn").onclick = async () => {
    if (!needCookie()) return;
    clearLinks(); setBusy(true); msg.textContent = "Sandali..."; out.textContent = "Chine-check ang account...";
    try {
      const w = await post("whoami", { cookie: cookieVal() });
      if (w.error) { msg.textContent = w.error; out.textContent = w.error; return; }
      if (w.status !== 200) {
        msg.textContent = "Hindi valid ang cookie o may problema.";
        out.textContent = "Status " + w.status + "\n" + (w.body || ""); return;
      }
      let text = "Valid ang cookie.\nAccount: " + (w.name || "?");
      const l = await post("list", { cookie: cookieVal() });
      if (l.count !== undefined) {
        $("ezcOwned").textContent = l.count + (l.more ? "+" : "");
        text += "\nExperiences: " + l.count + (l.more ? "+" : "");
        if (l.recent && l.recent.length) text += "\nPinakabago: " + l.recent.join(", ");
      } else {
        text += "\nHindi nabilang ang experiences (status " + l.status + ").\n" + (l.body || l.error || "");
      }
      out.textContent = text; msg.textContent = "Tapos na ang check.";
      log("[OK] Create tab: account checked (" + (w.name || "?") + ").");
    } catch (e) {
      msg.textContent = "Hindi naabot ang server."; out.textContent = String(e.message || e);
    } finally { setBusy(false); }
  };

  $("ezcCreateBtn").onclick = async () => {
    if (!needCookie()) return;
    const used = loadToday();
    if (used >= capValue()) {
      msg.textContent = "Naabot mo na ang daily limit (" + used + "/" + capValue() + "). Taasan ang limit kung gusto mong magpatuloy.";
      return;
    }
    clearLinks(); setBusy(true); msg.textContent = "Gumagawa ng experience..."; out.textContent = "Sandali...";
    try {
      const d = await post("create", {
        cookie: cookieVal(), templatePlaceId: $("ezcTemplate").value.trim(),
        name: $("ezcName").value, description: $("ezcDesc").value, makePublic: $("ezcPublic").checked
      });
      if (d.error) { msg.textContent = d.error; out.textContent = d.error; log("[ERROR] Create tab: " + d.error); return; }
      if (!d.created) {
        msg.textContent = "Hindi nagawa ang experience.";
        out.textContent = "Status " + d.status + "\n" + (d.body || ""); log("[ERROR] Create tab: status " + d.status); return;
      }
      const u = d.created.universeId, p = d.created.rootPlaceId;
      const n = used + 1; saveToday(n); $("ezcToday").textContent = n;
      const o = parseInt($("ezcOwned").textContent, 10); if (!isNaN(o)) $("ezcOwned").textContent = o + 1;
      let text = "Nagawa ang experience!\nUniverse ID: " + u + "\nPlace ID: " + p;
      for (const s of (d.steps || [])) {
        const ok = s.status >= 200 && s.status < 300;
        text += "\n\n" + s.step + ": " + (ok ? "OK" : "may problema") + "\nStatus " + s.status + (ok ? "" : "\n" + s.body);
      }
      out.textContent = text; msg.textContent = "Tapos na.";
      addLink("https://create.roblox.com/dashboard/creations/experiences/" + u + "/overview", "BUKSAN SA CREATOR HUB");
      addLink("https://www.roblox.com/games/" + p, "BUKSAN ANG GAME PAGE");
      log("[OK] Create tab: created Universe " + u + " (Place " + p + ").");
    } catch (e) {
      msg.textContent = "Hindi naabot ang server."; out.textContent = String(e.message || e);
    } finally { setBusy(false); }
  };
})();
