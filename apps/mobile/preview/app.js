const API = localStorage.getItem("intra.api") || "http://localhost:3000/api/v1";
const DEVICE_KEY = "intra.deviceId";
const SESSION_KEY = "intra.session";
const deviceId = localStorage.getItem(DEVICE_KEY) || crypto.randomUUID();
localStorage.setItem(DEVICE_KEY, deviceId);

const app = document.getElementById("app");
const toastEl = document.getElementById("toast");
document.getElementById("api-label").textContent = API.replace(/^https?:\/\//, "");

let session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
let cache = {};
let sheet = null;
let renderGen = 0;

function saveSession() {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

function toast(message) {
  toastEl.hidden = false;
  toastEl.textContent = message;
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => { toastEl.hidden = true; }, 2800);
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || "").join("").toUpperCase() || "?";
}

function rupees(minor) {
  if (minor == null || Number.isNaN(Number(minor))) return "—";
  const value = Number(minor) / 100;
  if (Math.abs(value) >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return `₹${value.toFixed(0)}`;
}

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtClock(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function attendanceStatus(status) {
  return ({ present: "Present", late: "Late", open: "Punched in", absent: "Absent", closed: "Closed" })[status] || status;
}

function formatMinutes(minutes) {
  const value = Number(minutes) || 0;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}

function visitStatusLabel(status) {
  return ({
    scheduled: "Scheduled",
    in_progress: "In progress",
    completed: "Completed",
    cancelled: "Cancelled",
    no_show: "No show",
  })[status] || status || "Unknown";
}

function isOpenVisit(status) {
  return status === "scheduled" || status === "in_progress";
}

function previewGps() {
  return new Promise((resolve) => {
    const fallback = { latitude: 28.6139, longitude: 77.209, accuracyMeters: 50 };
    if (!navigator.geolocation) {
      resolve(fallback);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracyMeters: pos.coords.accuracy,
      }),
      () => resolve(fallback),
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 120000 },
    );
  });
}

function relative(value) {
  if (!value) return "";
  const delta = Date.now() - new Date(value).getTime();
  const m = Math.max(1, Math.round(delta / 60000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function localInput(offsetMs = 86400000) {
  const d = new Date(Date.now() + offsetMs);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isoFromLocal(value) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function items(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.standings)) return data.standings;
  if (Array.isArray(data?.hits)) return data.hits;
  return [];
}

function pillClass(label = "") {
  const v = String(label).toLowerCase();
  if (/(won|qualified|active|paid|completed)/.test(v)) return "won";
  if (/(lost|overdue|void|cancelled)/.test(v)) return "lost";
  if (/(contact|negotiat|pending|follow)/.test(v)) return "contact";
  if (/(new|quote|hot|draft)/.test(v)) return "new";
  return "open";
}

function can(code) {
  return Boolean(session?.permissions?.includes(code));
}

function errText(body, fallback = "Request failed") {
  return body?.error?.detail || body?.detail || body?.title || body?.message || fallback;
}

async function api(path, { method = "GET", body, query } = {}) {
  const url = new URL(API.replace(/\/$/, "") + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
    }
  }
  const headers = {
    Accept: "application/json",
    "X-Device-Id": deviceId,
    "X-Request-Id": crypto.randomUUID(),
  };
  if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
  if (session?.tenantId) headers["X-Tenant-Id"] = session.tenantId;
  const mutating = /^(POST|PUT|PATCH|DELETE)$/i.test(method);
  if (mutating) headers["Idempotency-Key"] = crypto.randomUUID();
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error("Cannot reach the API. Start it on port 3000.");
  }
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && session?.refreshToken && path !== "/auth/refresh") {
    const ok = await refresh();
    if (ok) return api(path, { method, body, query });
  }
  if (!res.ok) throw new Error(errText(json));
  return json.data;
}

async function refresh() {
  if (!session?.refreshToken) return false;
  try {
    const json = await fetch(`${API}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Device-Id": deviceId },
      body: JSON.stringify({ refreshToken: session.refreshToken, deviceId }),
    }).then((r) => r.json());
    if (!json?.data?.accessToken) {
      session = null;
      saveSession();
      return false;
    }
    session = { ...session, ...json.data, user: json.data.user || session.user };
    saveSession();
    return true;
  } catch {
    return false;
  }
}

function parseHash() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [pathPart, queryPart] = raw.split("?");
  const query = Object.fromEntries(new URLSearchParams(queryPart || ""));
  const parts = pathPart.split("/").filter(Boolean);
  if (!session) {
    if (parts[0] === "forgot") return { name: "forgot", params: {}, query };
    if (parts[0] === "reset-password" || parts[0] === "reset") return { name: "reset", params: {}, query };
    return { name: "login", params: {}, query };
  }
  const a = parts[0] || "dashboard";
  const b = parts[1];
  const c = parts[2];
  if (a === "leads" && (b === "new" || b === "create")) return { name: "leadForm", params: {}, query };
  if (a === "leads" && b && c === "edit") return { name: "leadForm", params: { id: b }, query };
  if (a === "leads" && b) return { name: "leadDetail", params: { id: b }, query };
  if (a === "quotations" && (b === "new" || b === "create")) return { name: "quotationForm", params: {}, query };
  if (a === "quotations" && b && c === "edit") return { name: "quotationForm", params: { id: b }, query };
  if (a === "quotations" && b) return { name: "quotationDetail", params: { id: b }, query };
  if (a === "warranties" && (b === "new" || b === "create")) return { name: "warrantyForm", params: {}, query };
  if (a === "warranties" && b && c === "edit") return { name: "warrantyForm", params: { id: b }, query };
  if (a === "warranties" && b) return { name: "warrantyDetail", params: { id: b }, query };
  if ((a === "follow-ups" || a === "tasks") && (b === "new" || b === "create")) return { name: "followUpForm", params: {}, query };
  if ((a === "follow-ups" || a === "tasks") && b && c === "edit") return { name: "followUpForm", params: { id: b }, query };
  if ((a === "follow-ups" || a === "tasks") && b) return { name: "followUpDetail", params: { id: b }, query };
  if ((a === "visits" || a === "site-visits") && (b === "new" || b === "create")) return { name: "visitForm", params: {}, query };
  if ((a === "visits" || a === "site-visits") && b) return { name: "visitDetail", params: { id: b }, query };
  if (a === "attendance") return { name: "attendance", params: {}, query };
  if (a === "staff" && (b === "new" || b === "create")) return { name: "staffForm", params: {}, query };
  if (a === "staff" && b && c === "edit") return { name: "staffForm", params: { id: b }, query };
  if (a === "staff" && b) return { name: "staffDetail", params: { id: b }, query };
  if (a === "teams" && (b === "new" || b === "create")) return { name: "teamForm", params: {}, query };
  if (a === "teams" && b) return { name: "teamForm", params: { id: b }, query };
  if (a === "targets" && (b === "new" || b === "create")) return { name: "targetForm", params: {}, query };
  if (a === "targets" && b && c === "edit") return { name: "targetForm", params: { id: b }, query };
  if (a === "targets" && b) return { name: "targetDetail", params: { id: b }, query };
  if (a === "performance" && b) return { name: "performanceDetail", params: { id: b }, query };
  if (a === "catalog" && b) return { name: "catalogKind", params: { kind: b }, query };
  if (a === "settings" && b === "general" && c === "taxes") return { name: "taxesSettings", params: { parent: "/settings/general" }, query };
  if (a === "settings" && b === "general") return { name: "generalSettings", params: {}, query };
  if (a === "reports" && b) return { name: "report", params: { kind: b }, query };
  if (a === "dashboard" && b && b !== "me") return { name: "mtd", params: { widget: b }, query };
  if (a === "dashboard" && b === "me") return { name: "staffDash", params: {}, query };
  const names = {
    dashboard: "dashboard",
    leads: "leads",
    mtd: "mtd",
    performance: "performance",
    warranties: "warranties",
    reports: "reports",
    more: "more",
    settings: "more",
    notifications: "notifications",
    search: "search",
    "follow-ups": "followUps",
    tasks: "followUps",
    quotations: "quotations",
    pipeline: "pipeline",
    staff: "staff",
    teams: "teams",
    targets: "targets",
    sessions: "sessions",
    catalog: "catalog",
    timeline: "timeline",
    password: "password",
    "change-password": "password",
    visits: "visits",
    "site-visits": "visits",
    attendance: "attendance",
    roles: "roles",
    analytics: "analytics",
    forgot: "forgot",
    reset: "reset",
    "reset-password": "reset",
    "verify-warranty": "verify",
    login: "login",
  };
  return { name: names[a] || "dashboard", params: {}, query };
}

function go(path, { replace = false } = {}) {
  sheet = null;
  const next = path.startsWith("#") ? path.slice(1) : path;
  if (replace) location.replace(`#${next}`);
  else location.hash = next;
}

function back() {
  go("/dashboard");
}

window.addEventListener("hashchange", render);
window.addEventListener("click", (event) => {
  const a = event.target.closest("[data-go]");
  if (!a || a.closest("form")) return;
  event.preventDefault();
  go(a.dataset.go);
});

function bar(title, { backTo = "/dashboard", backBtn = true, action = "", menu = false } = {}) {
  const left = menu
    ? `<button class="icon-btn" data-go="/more" title="More">☰</button>`
    : backBtn
      ? `<button class="icon-btn" data-go="${esc(backTo)}" title="Back">←</button>`
      : `<span class="icon-btn"></span>`;
  return `<div class="bar">
    ${left}
    ${title === "logo" ? `<div class="logo">INTRA LEADS</div>` : `<h2>${esc(title)}</h2>`}
    ${action}
  </div>`;
}

function dock(active) {
  return `<nav class="nav">
    <button class="${active === "dashboard" ? "on" : ""}" data-go="/dashboard">⌂<br>Home</button>
    <button class="${active === "leads" ? "on" : ""}" data-go="/leads">👤<br>Leads</button>
    <span></span>
    <button class="${active === "reports" ? "on" : ""}" data-go="/reports">📊<br>Reports</button>
    <button class="${active === "more" ? "on" : ""}" data-go="/more">☰<br>More</button>
    <button class="plus" data-go="/leads/new">＋</button>
  </nav>`;
}

function loading(title, backTo = "/dashboard") {
  const showBack = title !== "INTRA LEADS" && title !== "logo";
  return `${bar(title, { backBtn: showBack, backTo })}<div class="empty">Loading…</div>`;
}

function fail(title, error, backTo = "/dashboard") {
  return `${bar(title, { backTo })}<div class="empty">${esc(error.message)}<br><br><button class="btn" id="retry">Retry</button></div>`;
}

function metric(widget, code, fallback = 0) {
  const hit = (widget?.metrics || []).find((item) => item.code === code);
  return hit ? hit.value : fallback;
}

function openSheet(html) {
  sheet = html;
  render();
}

function closeSheet() {
  sheet = null;
  render();
}

function options(list, value, labelFn = (x) => x.name || x.fullName || x.label || x.code, valueFn = (x) => x.id || x.code) {
  return (list || []).map((item) => {
    const val = valueFn(item);
    return `<option value="${esc(val)}" ${String(val) === String(value || "") ? "selected" : ""}>${esc(labelFn(item))}</option>`;
  }).join("");
}

function rowCard(href, title, sub) {
  return `<div class="card tap menu" ${href ? `data-go="${esc(href)}"` : ""}>
    <div><b>${esc(title)}</b>${sub ? `<div class="sub" style="margin:0">${esc(sub)}</div>` : ""}</div>
    ${href ? `<span class="chev">›</span>` : ""}
  </div>`;
}

async function login(email, password) {
  const data = await api("/auth/login", {
    method: "POST",
    body: { email, password, deviceId, deviceName: "INTRA LEADS Web Preview" },
  });
  session = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    tenantId: data.tenantId,
    userId: data.user?.id || data.userId,
    fullName: data.user?.fullName || "",
    email: data.user?.email || email,
    membershipId: data.membershipId || data.user?.membershipId,
    permissions: data.permissions || [],
    roles: data.roles || [],
  };
  try {
    const me = await api("/me");
    session = { ...session, ...me, userId: me.id, membershipId: me.membershipId ?? session.membershipId };
  } catch { /* login payload is enough */ }
  saveSession();
  go("/dashboard", { replace: true });
}

async function logout() {
  try { await api("/auth/logout", { method: "POST", body: { refreshToken: session?.refreshToken } }); } catch { /* ignore */ }
  session = null;
  cache = {};
  saveSession();
  go("/login", { replace: true });
}

function renderLogin() {
  app.innerHTML = `<section class="screen">
    <div class="login-hero">
      <div class="mark">🏢</div>
      <h2 style="margin:0">INTRA LEADS</h2>
      <p style="opacity:.8;font-size:13px">Sign in to your live workspace</p>
    </div>
    <div class="scroll no-dock">
      <div class="card">
        <b>Welcome back</b>
        <div class="sub">Use your staff email</div>
        <form id="login-form">
          <label>Email</label>
          <input name="email" type="email" value="admin@intraleads.local" required />
          <label>Password</label>
          <input name="password" type="password" value="IntraLeads1!" required />
          <p class="err" id="login-error" hidden></p>
          <button class="btn" type="submit">Login</button>
        </form>
        <button class="icon-btn" style="width:100%;color:var(--teal);margin-top:8px" data-go="/forgot">Forgot password</button>
      </div>
    </div>
  </section>`;
  app.querySelector("#login-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    const error = app.querySelector("#login-error");
    error.hidden = true;
    try {
      await login(form.email.value.trim(), form.password.value);
    } catch (err) {
      error.hidden = false;
      error.textContent = err.message;
    }
  };
}

function renderForgot() {
  app.innerHTML = `<section class="screen">${bar("Forgot password", { backTo: "/login" })}
    <div class="scroll no-dock">
      <div class="card">
        <form id="forgot-form">
          <label>Email</label>
          <input name="email" type="email" required />
          <button class="btn" type="submit">Send reset code</button>
        </form>
      </div>
    </div>
  </section>`;
  app.querySelector("#forgot-form").onsubmit = async (event) => {
    event.preventDefault();
    const email = event.target.email.value.trim();
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email } });
      toast("If the email exists, a reset code was sent.");
      go(`/reset-password?email=${encodeURIComponent(email)}`);
    } catch (err) { toast(err.message); }
  };
}

function renderReset() {
  const email = parseHash().query.email || "";
  app.innerHTML = `<section class="screen">${bar("Reset password", { backTo: "/login" })}
    <div class="scroll no-dock">
      <form id="reset-form" class="card">
        <label>Email</label>
        <input name="email" type="email" value="${esc(email)}" required />
        <label>6-digit code</label>
        <input name="otp" required minlength="6" maxlength="6" />
        <label>New password</label>
        <input name="newPassword" type="password" required minlength="8" />
        <button class="btn" type="submit">Reset password</button>
      </form>
    </div>
  </section>`;
  app.querySelector("#reset-form").onsubmit = async (event) => {
    event.preventDefault();
    const f = event.target;
    try {
      await api("/auth/reset-password", { method: "POST", body: { email: f.email.value.trim(), otp: f.otp.value.trim(), newPassword: f.newPassword.value } });
      toast("Password updated. Sign in.");
      go("/login");
    } catch (err) { toast(err.message); }
  };
}

async function renderDashboard() {
  app.innerHTML = loading("INTRA LEADS") + dock("dashboard");
  try {
    const [board, inbox] = await Promise.all([
      api("/dashboard"),
      api("/notifications").catch(() => []),
    ]);
    cache.dashboard = board;
    const widgets = board.widgets || {};
    const leads = widgets.leads || {};
    const follow = widgets.follow_ups || {};
    const quotes = widgets.quotations || {};
    const orders = widgets.orders || {};
    const sales = widgets.sales || {};
    const staff = widgets.staff_performance || {};
    const unread = items(inbox).filter((n) => n.unread || n.readAt == null).length;
    const target = metric(sales, "target");
    const achieved = sales.month || 0;
    const progress = target > 0 ? Math.min(100, (achieved / target) * 100) : 0;
    app.innerHTML = `<section class="screen">
      ${bar("logo", { menu: true, backBtn: false, action: `<button class="icon-btn" data-go="/notifications">🔔${unread ? `<span class="badge">${unread}</span>` : ""}</button>` })}
      <div class="scroll">
        <p class="title">Dashboard</p>
        <p class="sub">${esc(fmtDate(board.today))}</p>
        <div class="glance">
          <h3>Today at a Glance</h3>
          <div class="grid3">
            <div class="metric tap" data-go="/leads"><b>${leads.primary ?? 0}</b><span>New Leads</span></div>
            <div class="metric tap" data-go="/follow-ups"><b>${follow.primary ?? 0}</b><span>Follow-ups Today</span></div>
            <div class="metric tap" data-go="/quotations"><b>${metric(quotes, "open", quotes.month || 0)}</b><span>Quotation Follow-up</span></div>
            <div class="metric tap" data-go="/reports/sales"><b>${orders.primary ?? 0}</b><span>Orders Won</span></div>
            <div class="metric tap" data-go="/mtd"><b>${rupees(sales.primary)}</b><span>Today's Sales (₹)</span></div>
            <div class="metric tap" data-go="/mtd"><b>${rupees(target)}</b><span>Today's Target (₹)</span></div>
          </div>
        </div>
        <div class="card">
          <b>Follow-up Alerts</b>
          <div class="alert" data-go="/follow-ups"><div class="dot" style="background:#FDECEA;color:var(--danger)">⚠</div> Overdue Follow-ups <span class="count" style="color:var(--danger)">${metric(follow, "overdue")}</span></div>
          <div class="alert" data-go="/follow-ups"><div class="dot" style="background:#FDF3E0;color:var(--warning)">⏱</div> Follow-ups Due Today <span class="count" style="color:var(--warning)">${follow.primary ?? 0}</span></div>
          <div class="alert" data-go="/quotations"><div class="dot" style="background:#E8F0FE;color:var(--info)">₹</div> Quotation Follow-ups <span class="count" style="color:var(--info)">${metric(quotes, "open")}</span></div>
        </div>
        <div class="card tap" data-go="/mtd">
          <b>MTD Performance</b>
          <div style="display:flex;gap:12px;align-items:center;margin-top:8px">
            <div class="sub" style="margin:0">${esc(board.month?.label || "")}<br>Target<br><b>${rupees(target)}</b><br><br>Achievement<br><b>${rupees(achieved)}</b></div>
            <div class="donut" style="background:conic-gradient(var(--teal) 0 ${progress}%, var(--teal-soft) ${progress}% 100%)"><span>${progress.toFixed(1)}%<br><small style="font-weight:500;color:var(--muted)">Achievement</small></span></div>
          </div>
        </div>
        <div class="card">
          <b>Staff Performance (MTD)</b>
          ${((staff.series || []).slice(0, 5).map((point) => {
            const pct = Math.min(100, (point.value || 0) / 100);
            return `<div class="staff tap" data-go="/performance"><div class="avatar">${esc(initials(point.label))}</div><div style="flex:1">${esc(point.label)}<div class="barline"><i style="width:${pct}%"></i></div></div><span class="pct">${pct.toFixed(0)}%</span></div>`;
          }).join("") || `<p class="sub">No staff scores yet.</p>`)}
          <button class="out inline" data-go="/performance">View all</button>
        </div>
      </div>
      ${dock("dashboard")}
    </section>`;
  } catch (error) {
    app.innerHTML = fail("Dashboard", error) + dock("dashboard");
    app.querySelector("#retry").onclick = renderDashboard;
  }
}

async function renderLeads() {
  const scope = cache.leadScope || "all";
  app.innerHTML = loading("Leads") + dock("leads");
  try {
    const data = await api("/leads", { query: { limit: 50 } });
    const list = items(data);
    cache.leads = list;
    const mine = session.membershipId;
    const visible = list.filter((lead) => {
      if (scope === "mine") return lead.ownerMembershipId === mine;
      if (scope === "unassigned") return !lead.ownerMembershipId;
      return true;
    });
    app.innerHTML = `<section class="screen">
      ${bar("Leads", { backBtn: false, menu: true, action: `<button class="icon-btn" data-go="/search">🔍</button><button class="icon-btn" data-go="/pipeline">⚙</button>` })}
      <div class="tabs">
        <button class="chip ${scope === "all" ? "on" : ""}" data-scope="all">All Leads</button>
        <button class="chip ${scope === "mine" ? "on" : ""}" data-scope="mine">My Leads</button>
        <button class="chip ${scope === "unassigned" ? "on" : ""}" data-scope="unassigned">Unassigned</button>
      </div>
      <div class="scroll">
        ${visible.length ? visible.map((lead) => `<article class="lead" data-go="/leads/${lead.id}">
          <div style="display:flex;gap:8px;align-items:center"><b>${esc(lead.customerName || lead.title)}</b><span class="pill ${pillClass(lead.stageName || lead.lifecycleStatus)}">${esc(lead.stageName || lead.lifecycleStatus)}</span><span style="margin-left:auto;color:var(--muted);font-size:11px">${esc(relative(lead.lastActivityAt || lead.updatedAt))}</span></div>
          <div class="meta-row">${esc(lead.sourceName || "—")} · ${esc(lead.city || "—")} · ${esc(lead.requirement || lead.title || "")}</div>
          <div style="display:flex;align-items:center;color:var(--muted);font-size:12px">📅 ${lead.nextFollowUpAt ? fmtDate(lead.nextFollowUpAt) : "No follow-up"} <button class="call" data-call="${lead.id}">☎</button></div>
        </article>`).join("") : `<div class="empty">No leads in this view. Tap + to create one.</div>`}
      </div>
      <button class="fab" data-go="/leads/new">＋ Add Lead</button>
      ${dock("leads")}
    </section>`;
    app.querySelectorAll("[data-scope]").forEach((chip) => {
      chip.onclick = () => { cache.leadScope = chip.dataset.scope; renderLeads(); };
    });
    app.querySelectorAll("[data-call]").forEach((btn) => {
      btn.onclick = async (event) => {
        event.stopPropagation();
        event.preventDefault();
        try {
          const result = await api(`/leads/${btn.dataset.call}/comms/call`, { method: "POST", body: {} });
          if (result.launchUri) location.href = result.launchUri;
          else toast(result.warning || "Calling…");
        } catch (err) { toast(err.message); }
      };
    });
  } catch (error) {
    app.innerHTML = fail("Leads", error) + dock("leads");
    app.querySelector("#retry").onclick = renderLeads;
  }
}

async function renderLeadForm() {
  const id = parseHash().params.id;
  app.innerHTML = loading(id ? "Edit lead" : "Add Lead");
  try {
    const lookups = await api("/leads/lookups");
    const lead = id ? await api(`/leads/${id}`) : {};
    app.innerHTML = `<section class="screen">${bar(id ? "Edit lead" : "Add Lead", { backTo: "/leads" })}
      <div class="scroll no-dock">
        <form id="lead-form" class="card">
          <label>Title / product interest</label>
          <input name="title" required value="${esc(lead.title || "")}" />
          <label>Customer name</label>
          <input name="customerName" value="${esc(lead.customerName || "")}" />
          <label>Phone</label>
          <input name="primaryPhone" value="${esc(lead.primaryPhone || "")}" />
          <label>Email</label>
          <input name="primaryEmail" type="email" value="${esc(lead.primaryEmail || "")}" />
          <label>City</label>
          <input name="city" value="${esc(lead.city || "")}" />
          <label>Requirement</label>
          <textarea name="requirement" rows="3">${esc(lead.requirement || "")}</textarea>
          <label>Source</label>
          <select name="sourceId"><option value="">Select</option>${options(lookups.sources || [], lead.sourceId)}</select>
          <label>Quality</label>
          <select name="quality"><option value="">Select</option>${options(lookups.qualities || [], lead.quality, (q) => q.name || q, (q) => q.code || q)}</select>
          <label>Estimated value (₹)</label>
          <input name="value" type="number" min="0" value="${lead.estimatedValueMinor != null ? lead.estimatedValueMinor / 100 : ""}" />
          <label>Assign to</label>
          <select name="ownerMembershipId"><option value="">Unassigned</option>${options(lookups.staff || [], lead.ownerMembershipId)}</select>
          <p class="err" id="form-error" hidden></p>
          <button class="btn" type="submit">Save</button>
        </form>
      </div>
    </section>`;
    app.querySelector("#lead-form").onsubmit = async (event) => {
      event.preventDefault();
      const f = event.target;
      const payload = {
        title: f.title.value.trim(),
        customerName: f.customerName.value.trim() || undefined,
        primaryPhone: f.primaryPhone.value.trim() || undefined,
        primaryEmail: f.primaryEmail.value.trim() || undefined,
        city: f.city.value.trim() || undefined,
        requirement: f.requirement.value.trim() || undefined,
        sourceId: f.sourceId.value || undefined,
        quality: f.quality.value || undefined,
        estimatedValueMinor: f.value.value ? Math.round(Number(f.value.value) * 100) : undefined,
        ownerMembershipId: f.ownerMembershipId.value || undefined,
      };
      try {
        const saved = id
          ? await api(`/leads/${id}`, { method: "PATCH", body: { ...payload, version: lead.version } })
          : await api("/leads", { method: "POST", body: payload });
        toast("Lead saved");
        go(`/leads/${saved.id || id}`);
      } catch (err) {
        const box = app.querySelector("#form-error");
        box.hidden = false;
        box.textContent = err.message;
      }
    };
  } catch (error) {
    app.innerHTML = fail("Add Lead", error);
    app.querySelector("#retry").onclick = renderLeadForm;
  }
}

async function renderLeadDetail() {
  const { id } = parseHash().params;
  const tab = cache.leadTab || "details";
  app.innerHTML = loading("Lead Details");
  try {
    const [lead, board, timeline] = await Promise.all([
      api(`/leads/${id}`),
      api("/pipelines/board").catch(() => ({ columns: [] })),
      api(`/leads/${id}/timeline`).catch(() => []),
    ]);
    cache.currentLead = lead;
    const stages = (board.columns || []).map((col) => col.stage || col);
    const events = items(timeline);
    app.innerHTML = `<section class="screen">
      ${bar("Lead Details", { backTo: "/leads", action: `<button class="icon-btn" data-go="/leads/${id}/edit" style="color:var(--teal);font-weight:700;width:auto">Edit</button>` })}
      <div class="scroll no-dock" style="padding-bottom:8px">
        <div class="center">
          <div class="avatar lg">${esc(initials(lead.customerName || lead.title))}</div>
          <b style="font-size:20px">${esc(lead.customerName || lead.title)}</b>
          <div style="margin:6px 0"><span class="pill ${pillClass(lead.stageName || lead.lifecycleStatus)}">${esc(lead.stageName || lead.lifecycleStatus)}</span></div>
          <div class="sub">${esc(lead.primaryPhone || "")} ${lead.city ? `<br>📍 ${esc(lead.city)}` : ""}</div>
        </div>
        <div class="utabs">
          <button class="${tab === "details" ? "on" : ""}" data-tab="details">DETAILS</button>
          <button class="${tab === "activity" ? "on" : ""}" data-tab="activity">ACTIVITY</button>
        </div>
        ${tab === "details" ? `<div class="card">
          <div class="info">📢<div><small>Source</small>${esc(lead.sourceName || "—")}</div></div>
          <div class="info">👤<div><small>Assigned To</small>${esc(lead.ownerName || "Unassigned")}</div></div>
          <div class="info">🚪<div><small>Product Interest</small>${esc(lead.title || "—")}</div></div>
          <div class="info">📝<div><small>Requirements</small>${esc(lead.requirement || "—")}</div></div>
          <div class="info">₹<div><small>Lead Value (Est.)</small>${rupees(lead.estimatedValueMinor)}</div></div>
          <div class="info">🔥<div><small>Lead Quality</small>${esc(lead.quality || "—")}</div></div>
          <div class="info">📅<div><small>Created On</small>${fmtDate(lead.createdAt)}</div></div>
          <div class="info">📆<div><small>Next Follow-up</small>${fmtDate(lead.nextFollowUpAt)}</div></div>
        </div>
        <div class="card"><b>Status Pipeline</b><div style="margin-top:10px">${
          stages.map((stage) => {
            const current = stage.id === lead.stageId || stage.name === lead.stageName;
            return `<div class="step"><div class="rail"><div class="node ${current ? "on" : ""}"></div><div class="line"></div></div>${esc(stage.name)}</div>`;
          }).join("") || "No stages"
        }</div>
        <button class="out" id="change-stage">Change stage</button></div>` : `<div class="card">${
          events.length ? events.map((ev) => `<div class="list-row"><div><b>${esc(ev.title || ev.eventCode)}</b><div class="sub" style="margin:0">${esc(ev.actorName || "")} · ${fmtDate(ev.occurredAt)}<br>${esc(ev.body || "")}</div></div></div>`).join("") : "No timeline events yet"
        }</div>`}
      </div>
      <div class="dock">
        <button class="fill" id="call">☎ Call</button>
        <button class="out" id="wa">💬 WhatsApp</button>
        <button class="out more" id="more">⋯</button>
      </div>
    </section>${sheet || ""}`;
    app.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.onclick = () => { cache.leadTab = btn.dataset.tab; renderLeadDetail(); };
    });
    const comms = async (channel) => {
      try {
        if (channel === "call") {
          const result = await api(`/leads/${id}/comms/call`, { method: "POST", body: {} });
          if (result.launchUri) location.href = result.launchUri;
          toast(result.warning || "Call started");
          return;
        }
        const templates = await api("/comms/templates", { query: { channel } }).catch(() => []);
        const first = items(templates)[0];
        const body = first?.body || `Hello ${lead.customerName || ""}, this is INTRA LEADS regarding ${lead.title || "your enquiry"}.`;
        const result = await api(`/leads/${id}/comms/${channel}`, { method: "POST", body: { body, templateCode: first?.code } });
        if (result.launchUri) location.href = result.launchUri;
        toast(result.warning || "Message ready");
      } catch (err) { toast(err.message); }
    };
    app.querySelector("#call").onclick = () => comms("call");
    app.querySelector("#wa").onclick = () => comms("whatsapp");
    app.querySelector("#more").onclick = () => openSheet(`<div class="sheet" id="sheet"><div class="panel">
      <h3>More</h3>
      <button class="item" data-act="assign">Reassign staff</button>
      <button class="item" data-act="follow">Schedule follow-up</button>
      <button class="item" data-act="note">Add activity</button>
      <button class="item" data-act="quote">Create quotation</button>
      <button class="item" data-act="visit">Add site visit</button>
      <button class="item" data-act="warranty">Issue warranty</button>
      <button class="item" data-act="sms">Send SMS</button>
      <button class="item" data-act="close">Close</button>
    </div></div>`);
    const change = app.querySelector("#change-stage");
    if (change) change.onclick = () => {
      openSheet(`<div class="sheet" id="sheet"><div class="panel"><h3>Change stage</h3>${
        stages.map((stage) => `<button class="item" data-stage="${stage.id}">${esc(stage.name)}</button>`).join("")
      }<button class="item" data-act="close">Cancel</button></div></div>`);
    };
    const overlay = app.querySelector("#sheet");
    if (!overlay) return;
    overlay.onclick = (event) => { if (event.target.id === "sheet") closeSheet(); };
    overlay.querySelectorAll("[data-act]").forEach((btn) => {
      btn.onclick = async () => {
        const act = btn.dataset.act;
        if (act === "close") return closeSheet();
        if (act === "sms") { closeSheet(); return comms("sms"); }
        if (act === "note") {
          overlay.querySelector(".panel").innerHTML = `<h3>Add activity</h3>
            <form id="note-form"><textarea name="body" rows="3" required placeholder="What happened?"></textarea>
            <button class="btn" type="submit">Save</button></form>
            <button class="item" data-act="close">Cancel</button>`;
          overlay.querySelector("[data-act=close]").onclick = closeSheet;
          overlay.querySelector("#note-form").onsubmit = async (event) => {
            event.preventDefault();
            try {
              await api(`/leads/${id}/activities`, { method: "POST", body: { type: "note", body: event.target.body.value.trim() } });
              toast("Activity logged");
              cache.leadTab = "activity";
              closeSheet();
            } catch (err) { toast(err.message); }
          };
          return;
        }
        if (act === "assign") {
          const lookups = await api("/leads/lookups");
          overlay.querySelector(".panel").innerHTML = `<h3>Reassign staff</h3>
            <form id="assign-form"><select name="ownerMembershipId" required><option value="">Select staff</option>${options(lookups.staff || [], lead.ownerMembershipId)}</select>
            <button class="btn" type="submit">Assign</button></form>
            <button class="item" data-act="close">Cancel</button>`;
          overlay.querySelector("[data-act=close]").onclick = closeSheet;
          overlay.querySelector("#assign-form").onsubmit = async (event) => {
            event.preventDefault();
            try {
              await api(`/leads/${id}/assign`, { method: "POST", body: { ownerMembershipId: event.target.ownerMembershipId.value } });
              toast("Lead assigned");
              closeSheet();
            } catch (err) { toast(err.message); }
          };
          return;
        }
        if (act === "follow") {
          overlay.querySelector(".panel").innerHTML = `<h3>Schedule follow-up</h3>
            <form id="fu-form">
              <label>Type</label>
              <select name="type"><option value="call">Call</option><option value="whatsapp">WhatsApp</option><option value="visit">Visit</option><option value="meeting">Meeting</option></select>
              <label>Due</label>
              <input name="dueAt" type="datetime-local" value="${localInput()}" required />
              <label>Title</label>
              <input name="title" value="Follow-up" required />
              <button class="btn" type="submit">Schedule</button>
            </form>
            <button class="item" data-act="close">Cancel</button>`;
          overlay.querySelector("[data-act=close]").onclick = closeSheet;
          overlay.querySelector("#fu-form").onsubmit = async (event) => {
            event.preventDefault();
            const f = event.target;
            try {
              await api(`/leads/${id}/follow-ups`, { method: "POST", body: { dueAt: isoFromLocal(f.dueAt.value), title: f.title.value, type: f.type.value } });
              toast("Follow-up scheduled");
              closeSheet();
            } catch (err) { toast(err.message); }
          };
          return;
        }
        if (act === "quote") {
          closeSheet();
          return go(`/quotations/new?leadId=${id}`);
        }
        if (act === "visit") {
          closeSheet();
          return go(`/visits/new?leadId=${id}`);
        }
        if (act === "warranty") {
          closeSheet();
          return go(`/warranties/new?leadId=${id}`);
        }
      };
    });
    overlay.querySelectorAll("[data-stage]").forEach((btn) => {
      btn.onclick = async () => {
        try {
          const stage = stages.find((item) => item.id === btn.dataset.stage);
          let lostReasonId;
          if (stage?.isLost) {
            const reason = (board.lossReasons || [])[0];
            if (!reason) return toast("No loss reason configured");
            lostReasonId = reason.id;
          }
          await api(`/leads/${id}/stage-changes`, { method: "POST", body: { stageId: btn.dataset.stage, version: lead.version, lostReasonId } });
          toast("Stage updated");
          closeSheet();
        } catch (err) { toast(err.message); }
      };
    });
  } catch (error) {
    app.innerHTML = fail("Lead Details", error);
    app.querySelector("#retry").onclick = renderLeadDetail;
  }
}

async function renderMtd() {
  app.innerHTML = loading("MTD Performance");
  try {
    const code = parseHash().params.widget || "sales";
    const board = cache.dashboard || await api("/dashboard");
    const sales = board.widgets?.[code] || await api(`/dashboard/${code}`).catch(() => board.widgets?.sales || {});
    const target = metric(sales, "target");
    const achieved = sales.month || 0;
    const progress = target > 0 ? Math.min(100, (achieved / target) * 100) : 0;
    const mix = sales.mix || [];
    const mixTotal = mix.reduce((sum, slice) => sum + (slice.value || 0), 0) || 1;
    app.innerHTML = `<section class="screen">${bar("MTD Performance", { backTo: "/dashboard" })}
      <div class="scroll">
        <p class="title">${esc(board.month?.label || sales.title || "")}</p>
        <div class="card" style="display:flex;gap:12px;align-items:center">
          <div>Target<br><b>${rupees(target)}</b><br><br>Achievement<br><b>${rupees(achieved)}</b></div>
          <div class="donut" style="background:conic-gradient(var(--teal) 0 ${progress}%, var(--teal-soft) ${progress}% 100%)"><span>${progress.toFixed(1)}%</span></div>
        </div>
        <div class="card"><b>Category-wise Performance</b>${
          mix.length ? mix.map((slice) => {
            const pct = Math.round((slice.value / mixTotal) * 100);
            return `<div style="margin-top:12px">${esc(slice.label)} <span style="float:right;color:var(--muted)">${rupees(slice.value)}</span><div class="barline" style="margin-top:6px"><i style="width:${pct}%"></i></div></div>`;
          }).join("") : `<p class="sub">No category mix yet.</p>`
        }</div>
        <button class="btn" data-go="/performance">Target &amp; Achievement</button>
      </div>
      ${dock("dashboard")}
    </section>`;
  } catch (error) {
    app.innerHTML = fail("MTD Performance", error);
    app.querySelector("#retry").onclick = renderMtd;
  }
}

async function renderPerformance() {
  const period = cache.perfPeriod || "monthly";
  app.innerHTML = loading("Target & Achievement");
  try {
    const board = await api("/performance/leaderboard", { query: { periodType: period } });
    const rows = board.standings || board.leaderboards?.overall || items(board);
    const leads = rows.reduce((s, r) => s + (r.leadsCreated || 0), 0);
    const follow = rows.reduce((s, r) => s + (r.followUpsCompleted || 0), 0);
    const quotes = rows.reduce((s, r) => s + (r.quotationsSent || 0), 0);
    const won = rows.reduce((s, r) => s + (r.leadsWon || 0), 0);
    app.innerHTML = `<section class="screen">${bar("Target & Achievement", { backTo: "/dashboard" })}
      <div class="tabs">
        <button class="chip ${period === "monthly" ? "on" : ""}" data-p="monthly">Monthly</button>
        <button class="chip ${period === "daily" ? "on" : ""}" data-p="daily">Daily</button>
      </div>
      <div class="center" style="padding:12px 0;font-weight:700">${esc(board.period?.label || "")}</div>
      <div class="scroll">
        <div class="card"><table>
          <thead><tr><th>Staff</th><th class="right">Target</th><th class="right">Ach.</th><th class="right">%</th></tr></thead>
          <tbody>${rows.map((row) => `<tr class="tap" data-go="/performance/${row.membershipId || row.id}">
            <td><div style="display:flex;gap:8px;align-items:center"><div class="avatar" style="width:28px;height:28px;font-size:10px">${esc(initials(row.name))}</div>${esc(row.name)}</div></td>
            <td class="right">${rupees(row.salesTargetMinor)}</td>
            <td class="right">${rupees(row.revenueMinor)}</td>
            <td class="right pct">${row.salesAchievementBps != null ? Math.round(row.salesAchievementBps / 100) : "—"}%</td>
          </tr>`).join("") || `<tr><td colspan="4">No standings</td></tr>`}</tbody>
        </table></div>
        <div class="grid2">
          <div class="card tap" data-go="/leads"><b>${leads}</b><div class="sub">Leads Received</div></div>
          <div class="card tap" data-go="/follow-ups"><b>${follow}</b><div class="sub">Follow-ups Done</div></div>
          <div class="card tap" data-go="/quotations"><b>${quotes}</b><div class="sub">Quotations Sent</div></div>
          <div class="card tap" data-go="/reports/sales"><b>${won}</b><div class="sub">Orders Won</div></div>
        </div>
      </div>
      ${dock("reports")}
    </section>`;
    app.querySelectorAll("[data-p]").forEach((chip) => {
      chip.onclick = () => { cache.perfPeriod = chip.dataset.p; renderPerformance(); };
    });
  } catch (error) {
    app.innerHTML = fail("Target & Achievement", error);
    app.querySelector("#retry").onclick = renderPerformance;
  }
}

function bpsPct(bps) {
  return bps == null || bps === "" ? "—" : `${Math.round(Number(bps) / 100)}%`;
}

function scoreBandLabel(band) {
  return ({
    outstanding: "Outstanding",
    strong: "Strong",
    average: "Average",
    needs_work: "Needs work",
    no_data: "No data",
  })[band] || band || "—";
}

function bandClass(band) {
  return ({ outstanding: "won", strong: "won", average: "contact", needs_work: "overdue", no_data: "open" })[band] || "open";
}

function kpiRow(title, bps, detail, weightBps) {
  const pct = bps == null ? 0 : Math.min(100, Math.max(0, Number(bps) / 100));
  const weight = weightBps == null ? "" : `Weight ${Math.round(Number(weightBps) / 100)}%`;
  return `<div style="margin-top:12px">
    <div class="menu"><span>${esc(title)}${weight ? `<div class="sub" style="margin:0">${esc(weight)}</div>` : ""}</span><b>${esc(bpsPct(bps))}</b></div>
    <div class="sub">${esc(detail)}</div>
    <div class="barline" style="margin-top:8px"><i style="width:${pct}%"></i></div>
  </div>`;
}

async function renderPerformanceDetail() {
  const { id } = parseHash().params;
  const period = cache.perfPeriod || "monthly";
  app.innerHTML = loading("Staff performance", `/staff/${id}`);
  try {
    const card = await api(`/performance/${id}`, { query: { periodType: period } });
    const item = card.staff || {};
    const weights = card.weights || {};
    app.innerHTML = `<section class="screen">${bar(item.name || "Staff performance", { backTo: `/staff/${id}` })}
      <div class="tabs">
        <button type="button" class="chip ${period === "monthly" ? "on" : ""}" data-p="monthly">Monthly</button>
        <button type="button" class="chip ${period === "daily" ? "on" : ""}" data-p="daily">Daily</button>
      </div>
      <div class="scroll no-dock">
        <div class="card">
          <div class="menu"><b>${esc(item.name || "Staff")}</b><span class="pill ${bandClass(item.scoreBand)}">${esc(scoreBandLabel(item.scoreBand))}</span></div>
          <div class="sub">${esc([item.designation, item.teamName, card.period?.label].filter(Boolean).join(" · ") || "—")}</div>
        </div>
        <div class="stats">
          <div class="stat"><span>Score</span><b>${esc(bpsPct(item.scoreBps))}</b></div>
          <div class="stat"><span>Rank</span><b>${item.rank ? `#${item.rank} of ${item.rankedOutOf || "—"}` : "—"}</b></div>
          <div class="stat"><span>Team rank</span><b>${item.teamRank ? `#${item.teamRank}` : "—"}</b></div>
          <div class="stat"><span>Sales</span><b>${esc(item.salesTargetMinor == null ? rupees(item.revenueMinor) : `${rupees(item.revenueMinor)} of ${rupees(item.salesTargetMinor)}`)}</b></div>
        </div>
        <div class="card">
          <b>KPIs</b>
          ${kpiRow("Lead conversion", item.leadConversionBps, `${item.leadsWon || 0} won · ${item.leadsLost || 0} lost · ${item.leadsCreated || 0} created`, weights.lead_conversion)}
          ${kpiRow("Follow-up completion", item.followUpCompletionBps, `${item.followUpsCompleted || 0} completed of ${item.followUpsDue || 0} due`, weights.follow_up_completion)}
          ${kpiRow("Sales achievement", item.salesAchievementBps, item.salesTargetMinor == null ? "No revenue target this period" : `${rupees(item.revenueMinor)} of ${rupees(item.salesTargetMinor)}`, weights.sales_achievement)}
          ${kpiRow("Quotation conversion", item.quotationConversionBps, `${item.quotationsWon || 0} won · ${item.quotationsLost || 0} lost · ${item.quotationsSent || 0} sent`, weights.quotation_conversion)}
        </div>
        <div class="stack">
          <button class="out" data-go="/staff/${id}">Open staff profile</button>
        </div>
      </div>
    </section>`;
    app.querySelectorAll("[data-p]").forEach((chip) => {
      chip.onclick = () => { cache.perfPeriod = chip.dataset.p; renderPerformanceDetail(); };
    });
  } catch (error) {
    app.innerHTML = fail("Staff performance", error, `/staff/${id}`);
    app.querySelector("#retry").onclick = renderPerformanceDetail;
  }
}

async function renderWarranties() {
  app.innerHTML = loading("Warranties") + dock("more");
  try {
    const list = items(await api("/warranties", { query: { limit: 50 } }));
    app.innerHTML = `<section class="screen">${bar("Warranties", { backTo: "/more", action: `<button class="icon-btn" data-go="/warranties/new" style="color:var(--teal);width:auto;font-weight:700">＋</button>` })}
      <div class="scroll">${list.length ? list.map((item) => rowCard(`/warranties/${item.id}`, item.customerName || item.cardNumber, `${item.statusLabel || item.status} · ${item.warrantyStartOn || ""} – ${item.warrantyEndOn || ""}`)).join("") : `<div class="empty">No warranty cards yet.</div>`}</div>
      ${dock("more")}
    </section>`;
  } catch (error) {
    app.innerHTML = fail("Warranties", error) + dock("more");
    app.querySelector("#retry").onclick = renderWarranties;
  }
}

async function renderWarrantyForm() {
  const id = parseHash().params.id;
  const leadId = parseHash().query.leadId;
  app.innerHTML = loading(id ? "Edit warranty" : "Issue warranty", "/warranties");
  try {
    const existing = id ? await api(`/warranties/${id}`) : null;
    const leads = leadId || existing?.leadId
      ? [{ id: existing?.leadId || leadId, customerName: existing?.customerName || cache.currentLead?.customerName, title: existing?.leadTitle || cache.currentLead?.title }]
      : items(await api("/leads", { query: { limit: 50 } }));
    const lead = cache.currentLead && cache.currentLead.id === (existing?.leadId || leadId) ? cache.currentLead : existing || {};
    const lines = (existing?.items || []).map((line) => ({
      description: line.description,
      quantity: line.quantity,
      serialNumber: line.serialNumber || "",
    }));
    if (!lines.length) lines.push({ description: lead.title || lead.leadTitle || "Product", quantity: 1, serialNumber: "" });
    const start = existing?.warrantyStartOn || new Date().toISOString().slice(0, 10);
    app.innerHTML = `<section class="screen">${bar(id ? "Edit warranty" : "Issue warranty", { backTo: id ? `/warranties/${id}` : "/warranties" })}
      <form id="w-form" class="scroll no-dock">
        <div class="card">
          <label>Lead</label>
          <select name="leadId" required ${id ? "disabled" : ""}>${options(leads, existing?.leadId || leadId, (l) => l.customerName || l.title)}</select>
          <label>Start date</label>
          <input name="warrantyStartOn" type="date" required value="${esc(start)}" />
        </div>
        <p class="group">Covered items</p>
        <div id="lines">${lines.map((line) => lineCard(line, false)).join("")}</div>
        <button type="button" class="out" id="add-line">＋ Add item</button>
        <p class="err" id="form-error" hidden></p>
        <button class="btn" type="submit">${id ? "Save changes" : "Issue card"}</button>
      </form>
    </section>`;
    bindLines({ price: false });
    app.querySelector("#w-form").onsubmit = async (event) => {
      event.preventDefault();
      const f = event.target;
      const covered = collectLines(false);
      if (!covered.length) {
        const box = app.querySelector("#form-error");
        box.hidden = false;
        box.textContent = "Add at least one covered item";
        return;
      }
      try {
        if (id) {
          await api(`/warranties/${id}`, { method: "PATCH", body: { version: existing.version, warrantyStartOn: f.warrantyStartOn.value, items: covered } });
          toast("Warranty updated");
          go(`/warranties/${id}`);
        } else {
          const created = await api("/warranties", { method: "POST", body: { leadId: f.leadId.value, warrantyStartOn: f.warrantyStartOn.value, items: covered } });
          toast("Warranty issued");
          go(`/warranties/${created.id}`);
        }
      } catch (err) {
        const box = app.querySelector("#form-error");
        box.hidden = false;
        box.textContent = err.message;
      }
    };
  } catch (error) {
    app.innerHTML = fail(id ? "Edit warranty" : "Issue warranty", error, "/warranties");
    app.querySelector("#retry").onclick = renderWarrantyForm;
  }
}

async function renderWarrantyDetail() {
  const { id } = parseHash().params;
  app.innerHTML = loading("Warranty Card");
  try {
    const [item, qr] = await Promise.all([
      api(`/warranties/${id}`),
      api(`/warranties/${id}/qr`).catch(() => null),
    ]);
    const product = item.items?.[0]?.productName || item.items?.[0]?.description || item.leadTitle || "—";
    const qrSrc = qr?.contentBase64 ? `data:${qr.mimeType || "image/png"};base64,${qr.contentBase64}` : "";
    const editable = String(item.status || "").toLowerCase() !== "void";
    app.innerHTML = `<section class="screen">${bar("Warranty Card", { backTo: "/warranties", action: `<button class="icon-btn" id="share">⤴</button>` })}
      <div class="scroll no-dock">
        <div class="card">
          <h3 style="color:var(--teal);text-align:center">INTRA WARRANTY CERTIFICATE</h3>
          <div class="center"><div class="avatar lg">✔</div><div style="color:var(--teal);font-weight:700">Quality Assured</div></div>
          <div class="row"><b>Customer Name</b>${esc(item.customerName || item.displayTitle || "—")}</div>
          <div class="row"><b>Order No.</b>${esc(item.quotationNumber || item.cardNumber)}</div>
          <div class="row"><b>Product</b>${esc(product)}</div>
          <div class="row"><b>Installation Date</b>${esc(item.warrantyStartOn)}</div>
          <div class="row"><b>Warranty Period</b>${esc(item.warrantyStartOn)} – ${esc(item.warrantyEndOn)}</div>
          <div style="display:flex;gap:12px;align-items:start;border-top:1px solid var(--line);padding-top:12px;margin-top:12px">
            <div class="sub">Scan to verify ${esc(item.verifyUrl || "")}</div>
            ${qrSrc ? `<img class="qr" alt="QR" src="${qrSrc}" />` : ""}
          </div>
        </div>
        <p class="group">Covered items</p>
        ${(item.items || []).map((line, index) => `<div class="card">
          <div class="menu"><b>${esc(line.description)}</b></div>
          <div class="sub" style="margin:0">${intQty(line.quantity)} unit${intQty(line.quantity) === 1 ? "" : "s"}${line.serialNumber ? ` · SN ${esc(line.serialNumber)}` : ""}</div>
          ${editable ? `<div class="stack" style="margin-top:10px">
            <button class="out line-edit" data-i="${index}">Edit</button>
            <button class="out line-remove" data-i="${index}">Delete</button>
          </div>` : ""}
        </div>`).join("") || `<div class="empty">No covered items</div>`}
        <div class="stack">
          <button class="btn" id="pdf">Download Warranty Card</button>
          ${editable ? `<button class="out" data-go="/warranties/${id}/edit">Edit warranty</button>` : ""}
          ${item.leadId ? `<button class="out" data-go="/leads/${item.leadId}">Open lead</button>` : ""}
        </div>
      </div>
    </section>`;
    app.querySelector("#share").onclick = async () => {
      await navigator.clipboard.writeText(item.verifyUrl || "");
      toast("Verification URL copied");
    };
    app.querySelector("#pdf").onclick = async () => {
      try {
        const pdf = await api(`/warranties/${id}/pdf`);
        const bytes = Uint8Array.from(atob(pdf.contentBase64), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        const a = document.createElement("a");
        a.href = url; a.download = pdf.fileName || "warranty.pdf"; a.click();
        toast("Download started");
      } catch (err) { toast(err.message); }
    };
    app.querySelectorAll(".line-edit").forEach((btn) => {
      btn.onclick = () => go(`/warranties/${id}/edit`);
    });
    app.querySelectorAll(".line-remove").forEach((btn) => {
      btn.onclick = async () => {
        const next = (item.items || []).filter((_, index) => index !== Number(btn.dataset.i)).map((line) => ({
          description: line.description,
          quantity: intQty(line.quantity),
          ...(line.serialNumber ? { serialNumber: line.serialNumber } : {}),
          ...(line.productId ? { productId: line.productId } : {}),
        }));
        if (!next.length) return toast("Keep at least one covered item");
        try {
          await api(`/warranties/${id}`, { method: "PATCH", body: { items: next, version: item.version } });
          toast("Item deleted");
          renderWarrantyDetail();
        } catch (err) { toast(err.message); }
      };
    });
  } catch (error) {
    app.innerHTML = fail("Warranty Card", error);
    app.querySelector("#retry").onclick = renderWarrantyDetail;
  }
}

const REPORTS = [
  { kind: "mtd", title: "MTD Performance", path: "/mtd", perm: "dashboard:read" },
  { kind: "performance", title: "Target & Achievement", path: "/performance", perm: "performance:read" },
  { kind: "leads", title: "Lead report", api: "/reports/leads", perm: "lead:read" },
  { kind: "follow-ups", title: "Follow-up report", api: "/reports/follow-ups", perm: "follow_up:read" },
  { kind: "quotations", title: "Quotation report", api: "/reports/quotations", perm: "quotation:read" },
  { kind: "sales", title: "Sales report", api: "/reports/sales", perm: "quotation:read" },
  { kind: "funnel", title: "Funnel report", api: "/reports/funnel", perm: "dashboard:read" },
  { kind: "analytics", title: "Analytics", api: "/reports/analytics", perm: "dashboard:read" },
  { kind: "warranties", title: "Warranty report", api: "/reports/warranties", perm: "warranty:read" },
  { kind: "staff", title: "Staff report", api: "/reports/staff", perm: "tenant:manage_users" },
  { kind: "performance-report", title: "Performance report", api: "/reports/performance", perm: "performance:read" },
  { kind: "pipeline", title: "Pipeline analytics", api: "/pipelines/analytics", perm: "lead:read" },
  { kind: "tracks", title: "Track report", api: "/reports/tracks", perm: "audit:read" },
  { kind: "site-visits", title: "Site visit report", api: "/reports/site-visits", perm: "site_visit:read" },
  { kind: "attendance", title: "Attendance report", api: "/reports/attendance", perm: "attendance:read" },
  { kind: "targets", title: "Target report", api: "/reports/targets", perm: "target:read" },
];

function renderReports() {
  const list = REPORTS.filter((item) => !item.perm || can(item.perm));
  const shown = list.length ? list : REPORTS;
  app.innerHTML = `<section class="screen">${bar("Reports", { backBtn: false, menu: true })}
    <div class="scroll">${shown.map((item) => rowCard(item.path || `/reports/${item.kind}`, item.title, "Open live report")).join("")}</div>
    ${dock("reports")}
  </section>`;
}

async function renderReport() {
  const { kind } = parseHash().params;
  const spec = REPORTS.find((item) => item.kind === kind);
  if (!spec?.api) return go("/reports");
  app.innerHTML = loading(spec.title);
  try {
    const data = await api(spec.api);
    app.innerHTML = `<section class="screen">${bar(spec.title, { backTo: "/reports" })}
      <div class="scroll no-dock">${reportView(data)}</div>
    </section>`;
  } catch (error) {
    app.innerHTML = fail(spec.title, error, "/reports");
    app.querySelector("#retry").onclick = renderReport;
  }
}

const REPORT_SKIP = new Set([
  "generatedAt", "timezone", "today", "from", "to", "lateAfter", "charts", "series", "mix",
  "id", "membershipId", "sourceId", "roleId", "teamId", "productId", "pipelineId", "stageId",
  "userId", "version", "period", "month",
]);

const FIELD_LABELS = {
  total: "Total",
  open: "Open",
  won: "Won",
  lost: "Lost",
  unqualified: "Unqualified",
  recycled: "Recycled",
  unassigned: "Unassigned",
  unassignedTeam: "No team",
  estimatedValueMinor: "Pipeline value",
  wonValueMinor: "Won value",
  lostValueMinor: "Lost value",
  openValueMinor: "Open value",
  pendingValueMinor: "Pending value",
  winRateBps: "Win rate",
  completionRateBps: "Completion rate",
  averagePredictionBps: "Avg. close chance",
  averageDealMinor: "Average deal",
  averageRating: "Avg. rating",
  averageAttainmentBps: "Avg. attainment",
  averageForecastBps: "Avg. forecast",
  revenueMinor: "Revenue",
  valueMinor: "Value",
  deals: "Deals won",
  lostDeals: "Lost deals",
  closedDeals: "Closed deals",
  pending: "Pending",
  completed: "Completed",
  cancelled: "Cancelled",
  skipped: "Skipped",
  overdue: "Overdue",
  upcoming: "Upcoming",
  rescheduled: "Rescheduled",
  draft: "Draft",
  sent: "Sent",
  followUp: "Follow-up",
  customerDeciding: "Customer deciding",
  negotiation: "Negotiation",
  approved: "Approved",
  overdueReminders: "Overdue reminders",
  closingSoon: "Closing soon",
  closingOverdue: "Closing overdue",
  noFollowUp: "No follow-up",
  scheduled: "Scheduled",
  inProgress: "In progress",
  noShow: "No-show",
  withGps: "With GPS",
  withPhotos: "With photos",
  withFeedback: "With feedback",
  presentDays: "Present days",
  lateDays: "Late days",
  openNow: "Open now",
  hoursWorked: "Hours",
  minutesWorked: "Time worked",
  staffCount: "Staff",
  active: "Active",
  expired: "Expired",
  claimed: "Claimed",
  void: "Void",
  invited: "Invited",
  inactive: "Inactive",
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  assign: "Assignments",
  statusChange: "Status changes",
  onTrack: "On track",
  behind: "Behind",
  hit: "Hit",
  missed: "Missed",
  ahead: "Ahead",
  atRisk: "At risk",
  count: "Count",
  targetValue: "Target",
  achievedValue: "Achieved",
  balance: "Balance",
  currentCount: "Now",
  reachedCount: "Reached",
  currentValueMinor: "Current value",
  reachedValueMinor: "Reached value",
  conversionFromPreviousBps: "Conversion",
  dropOffCount: "Drop-off",
  leadToQualifiedBps: "Lead → Qualified",
  qualifiedToQuotationBps: "Qualified → Quotation",
  quotationToNegotiationBps: "Quotation → Negotiation",
  negotiationToWonBps: "Negotiation → Won",
  overallBps: "Lead → Won",
  byLifecycle: "By lifecycle",
  byQuality: "By quality",
  bySource: "By source",
  byOwner: "By owner",
  byStage: "By stage",
  byCity: "By city",
  byStatus: "By status",
  byType: "By type",
  byAssignee: "By staff",
  byStaff: "By staff",
  byDay: "By day",
  byMonth: "By month",
  byRole: "By role",
  byTeam: "By team",
  byPeriod: "By period",
  roster: "Roster",
  stages: "Funnel stages",
  conversion: "Conversion",
  widgets: "Widgets",
  funnel: "Funnel",
  products: "Products",
  teams: "Teams",
  top: "Top staff",
  neighbors: "Nearby ranks",
  standings: "Standings",
  leaderboards: "Leaderboards",
  outstanding: "Outstanding",
  strong: "Strong",
  average: "Average",
  needsWork: "Needs work",
  noData: "No data",
  scored: "Scored",
  staff: "Staff",
  present: "Present",
  late: "Late",
};

const FIELD_WORDS = {
  open: "Open",
  won: "Won",
  lost: "Lost",
  unqualified: "Unqualified",
  recycled: "Recycled",
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
  pending: "Pending",
  completed: "Completed",
  cancelled: "Cancelled",
  skipped: "Skipped",
  draft: "Draft",
  sent: "Sent",
  follow_up: "Follow-up",
  customer_deciding: "Customer deciding",
  negotiation: "Negotiation",
  approved: "Approved",
  scheduled: "Scheduled",
  in_progress: "In progress",
  no_show: "No-show",
  active: "Active",
  expired: "Expired",
  claimed: "Claimed",
  void: "Void",
  invited: "Invited",
  suspended: "Inactive",
  present: "Present",
  late: "Late",
  absent: "Absent",
  call: "Call",
  meeting: "Meeting",
  whatsapp: "WhatsApp",
  email: "Email",
  visit: "Visit",
  other: "Other",
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  assign: "Assigned",
  status_change: "Status change",
};

function prettyKey(key) {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return String(key || "")
    .replace(/Minor$/, "")
    .replace(/Bps$/, "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^by /, "By ")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function prettyWord(value) {
  if (value == null || value === "") return "";
  const s = String(value);
  if (FIELD_WORDS[s]) return FIELD_WORDS[s];
  const kind = prettyKind(s);
  if (kind && kind !== s) return kind;
  if (scoreBandLabel(s) !== s && FIELD_WORDS[s] == null && /_/.test(s)) return scoreBandLabel(s);
  if (/^[a-z]+(_[a-z0-9]+)+$/.test(s)) return s.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  if (/^[a-z][a-z0-9]*$/.test(s) && s.length < 28) return s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}

function prettyValue(key, value) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map((item) => prettyWord(item)).filter(Boolean).join(", ") || "—";
  if (isUuid(value)) return "—";
  if (/Bps$/i.test(key)) return bpsPct(value);
  if (/Minor$/i.test(key) || key === "revenueMinor") return rupees(value);
  if (key === "minutesWorked") return formatMinutes(value);
  if (key === "hoursWorked") return `${value}h`;
  if (key === "generatedAt" || /At$/.test(key)) return `${fmtDate(value)} ${/At$/.test(key) ? fmtClock(value) : ""}`.trim();
  if (typeof value === "number") return String(value);
  return prettyWord(value) || "—";
}

function rowTitle(row) {
  if (row == null || typeof row !== "object") return prettyWord(row) || "—";
  if (row.metricName) return targetTitle(row);
  const raw = row.label || row.title || row.name || row.staffName || row.fullName || row.user?.fullName
    || row.roleName || row.teamName || row.stageName || row.city || row.productName || row.metricName
    || row.scopeName || row.customerName || row.quotationNumber || row.cardNumber || row.leadNumber
    || row.subject || row.status || row.quality || row.type || row.code || row.band || row.month
    || row.date || row.periodType || row.scopeType || row.forecastBand || row.action || "";
  if (!raw || isUuid(raw)) return prettyWord(row.status || row.quality || row.code || row.type || "") || "—";
  return prettyWord(raw);
}

function rowSub(row) {
  if (!row || typeof row !== "object") return "";
  const bits = [];
  if (row.valueMinor != null) bits.push(rupees(row.valueMinor));
  if (row.revenueMinor != null) bits.push(rupees(row.revenueMinor));
  if (row.wonValueMinor != null && row.deals == null) bits.push(`Won ${rupees(row.wonValueMinor)}`);
  if (row.open != null && row.won != null && row.total != null) bits.push(`Open ${row.open} · Won ${row.won} · Lost ${row.lost ?? 0}`);
  if (row.pending != null && row.completed != null && row.total != null) bits.push(`Pending ${row.pending} · Done ${row.completed}${row.overdue != null ? ` · Overdue ${row.overdue}` : ""}`);
  if (row.currentCount != null) bits.push(`Now ${row.currentCount} · Reached ${row.reachedCount ?? 0}`);
  if (row.conversionFromPreviousBps != null) bits.push(`Conv ${bpsPct(row.conversionFromPreviousBps)}`);
  if (row.dropOffCount != null) bits.push(`Drop-off ${row.dropOffCount}`);
  if (row.email) bits.push(row.email);
  if (row.presentDays != null) bits.push(`Present ${row.presentDays} · Late ${row.lateDays ?? 0} · Open ${row.openNow ?? 0}`);
  if (row.minutesWorked != null && (row.presentDays != null || row.staffName)) bits.push(formatMinutes(row.minutesWorked));
  if (row.present != null && row.date) bits.push(`Present ${row.present} · Late ${row.late ?? 0} · Open ${row.open ?? 0}`);
  if (row.designation) bits.push(row.designation);
  if (Array.isArray(row.roles) && row.roles.length) bits.push(row.roles.join(", "));
  if (Array.isArray(row.teams) && row.teams.length) bits.push(row.teams.join(", "));
  if (row.onTrack != null && row.count != null) bits.push(`On track ${row.onTrack}`);
  if (row.averageAttainmentBps != null) bits.push(bpsPct(row.averageAttainmentBps));
  if (row.completed != null && row.type) bits.push(`${row.completed} completed`);
  if (row.deals != null) bits.push(`${row.deals} deals · ${rupees(row.revenueMinor)} · Lost ${row.lostDeals ?? 0}`);
  if (row.targetValue != null && row.achievedValue != null) bits.push(`${row.achievedValue} of ${row.targetValue}`);
  if (row.scoreBps != null) bits.push(bpsPct(row.scoreBps));
  if (row.rank) bits.push(`#${row.rank}`);
  if (row.statusLabel) bits.push(row.statusLabel);
  else if (row.status && prettyWord(row.status) !== rowTitle(row)) bits.push(prettyWord(row.status));
  if (row.primaryPhone) bits.push(row.primaryPhone);
  return bits.filter(Boolean).join(" · ");
}

function breakdownRow(row) {
  if (row == null || typeof row !== "object") return `<div class="list-row">${esc(prettyWord(row) || "—")}</div>`;
  const title = rowTitle(row);
  const sub = rowSub(row);
  const trail = row.count ?? (row.total != null && !String(sub).includes(String(row.total)) ? row.total : null);
  const href = guessLink(row);
  return `<div class="list-row ${href ? "tap" : ""}" ${href ? `data-go="${esc(href)}"` : ""}>
    <div style="flex:1"><b>${esc(title)}</b>${sub ? `<div class="sub" style="margin:0">${esc(sub)}</div>` : ""}</div>
    ${trail != null ? `<b>${esc(trail)}</b>` : ""}
  </div>`;
}

function renderStats(obj) {
  const entries = Object.entries(obj || {}).filter(([key, value]) => !REPORT_SKIP.has(key) && typeof value !== "object");
  if (!entries.length) return "";
  return `<div class="stats">${entries.map(([key, value]) => `<div class="stat"><span>${esc(prettyKey(key))}</span><b>${esc(prettyValue(key, value))}</b></div>`).join("")}</div>`;
}

function reportCaption(data) {
  if (!data || typeof data !== "object") return "";
  const bits = [];
  if (data.period?.label) bits.push(data.period.label);
  if (data.month?.label) bits.push(data.month.label);
  if (data.from && data.to) bits.push(`${data.from} – ${data.to}`);
  if (data.lateAfter) bits.push(`Late after ${data.lateAfter}`);
  if (data.today) bits.push(`Today ${data.today}`);
  if (data.timezone) bits.push(data.timezone);
  if (data.generatedAt) bits.push(`Updated ${fmtDate(data.generatedAt)}`);
  return bits.join(" · ");
}

function widgetCard(widget) {
  if (!widget || typeof widget !== "object") return "";
  return `<div class="card">
    <div class="menu"><b>${esc(widget.title || prettyKey(widget.code))}</b>${widget.deltaBps != null ? `<span class="pill">${esc(bpsPct(widget.deltaBps))}</span>` : ""}</div>
    <div>${esc(widget.primaryLabel != null ? widget.primaryLabel : widget.primary)}</div>
    ${Array.isArray(widget.metrics) && widget.metrics.length ? `<div class="sub">${esc(widget.metrics.map((item) => `${item.label}: ${item.value}`).join(" · "))}</div>` : ""}
  </div>`;
}

function reportView(data, depth = 0) {
  if (data == null) return `<div class="empty">No data</div>`;
  if (Array.isArray(data)) {
    if (!data.length) return `<div class="empty">None</div>`;
    return `<div class="card">${data.slice(0, 80).map(breakdownRow).join("")}</div>`;
  }
  if (typeof data !== "object") return `<div class="card">${esc(prettyWord(data) || String(data))}</div>`;
  if (depth > 3) return "";
  const caption = depth === 0 ? reportCaption(data) : "";
  let html = caption ? `<div class="sub" style="padding:0 4px 10px">${esc(caption)}</div>` : "";
  const extras = {};
  for (const [key, value] of Object.entries(data)) {
    if (REPORT_SKIP.has(key) || key === "totals") continue;
    if (value == null || ["string", "number", "boolean"].includes(typeof value)) extras[key] = value;
  }
  const metrics = { ...(data.totals && typeof data.totals === "object" ? data.totals : {}), ...extras };
  if (Object.keys(metrics).length) html += renderStats(metrics);
  for (const [key, value] of Object.entries(data)) {
    if (REPORT_SKIP.has(key) || key === "totals") continue;
    if (Array.isArray(value)) {
      html += `<div class="card"><b>${esc(prettyKey(key))}</b>${value.length ? value.slice(0, 80).map(breakdownRow).join("") : `<div class="sub">None</div>`}</div>`;
      continue;
    }
    if (!value || typeof value !== "object") continue;
    if (key === "widgets") {
      html += Object.values(value).map(widgetCard).join("");
      continue;
    }
    if (key === "leaderboards") {
      for (const [board, rows] of Object.entries(value)) {
        if (!Array.isArray(rows) || !rows.length) continue;
        html += `<div class="card"><b>${esc(prettyKey(board))}</b>${rows.slice(0, 20).map(breakdownRow).join("")}</div>`;
      }
      continue;
    }
    const nestedScalars = Object.entries(value).filter(([, item]) => item == null || ["string", "number", "boolean"].includes(typeof item));
    const nestedArrays = Object.entries(value).filter(([, item]) => Array.isArray(item));
    if (nestedScalars.length && !nestedArrays.length && !Object.values(value).some((item) => item && typeof item === "object" && !Array.isArray(item))) {
      html += `<p class="group">${esc(prettyKey(key))}</p>${renderStats(value)}`;
      continue;
    }
    html += `<p class="group">${esc(prettyKey(key))}</p>${reportView(value, depth + 1)}`;
  }
  return html || `<div class="empty">No data</div>`;
}

function renderJson(data) {
  return reportView(data);
}

function guessLink(row) {
  if (!row || typeof row !== "object") return "";
  if (row.type === "quotation" || row.quotationNumber) return `/quotations/${row.quotationId || row.id}`;
  if (row.cardNumber) return `/warranties/${row.id}`;
  if (row.type === "lead" || row.leadNumber) return `/leads/${row.leadId || row.id}`;
  if (row.leadId && !row.dueAt) return `/leads/${row.leadId}`;
  if (row.dueAt && row.id) return `/follow-ups/${row.id}`;
  if (row.scheduledAt && row.id) return `/visits/${row.id}`;
  if (row.membershipId && row.name) return `/performance/${row.membershipId}`;
  return "";
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function prettyKind(code) {
  return ({
    daily: "Daily",
    monthly: "Monthly",
    quarterly: "Quarterly",
    yearly: "Yearly",
    custom: "Custom",
    tenant: "Company",
    team: "Team",
    membership: "Staff",
    branch: "Branch",
    product: "Product",
    revenue: "Revenue",
  })[code] || code || "";
}

function forecastLabel(band) {
  return ({
    hit: "Hit",
    ahead: "Ahead",
    on_track: "On track",
    at_risk: "At risk",
    behind: "Behind",
    missed: "Missed",
    not_started: "Not started",
  })[band] || band || "—";
}

function targetTitle(item) {
  const metric = item.metricName || prettyKind(item.metricCode) || "Target";
  if (item.productName) return `${item.productName} · ${metric}`;
  const scope = item.scopeName || prettyKind(item.scopeType);
  return scope ? `${metric} · ${scope}` : metric;
}

function isMoneyMetric(item) {
  return item.metricUnit === "minor_currency" || item.metricCode === "revenue";
}

function formatTargetValue(item, value = item.targetValue) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (isMoneyMetric(item)) return rupees(n);
  return String(Math.round(n));
}

function targetBps(item) {
  const bps = item.achievementBps ?? item.attainmentBps;
  return Number.isFinite(Number(bps)) ? Number(bps) : null;
}

function targetPercent(item) {
  const bps = targetBps(item);
  return bps == null ? "—" : `${Math.round(bps / 100)}%`;
}

function targetFraction(item) {
  const bps = targetBps(item);
  return bps == null ? 0 : Math.min(100, Math.max(0, bps / 100));
}

function kv(row) {
  if (typeof row !== "object" || !row) return esc(row);
  const title = rowTitle(row);
  const sub = rowSub(row);
  return `<div><b>${esc(title)}</b>${sub ? `<div class="sub" style="margin:0">${esc(sub)}</div>` : ""}</div>`;
}

function formatVal(value) {
  return prettyValue("", value);
}

function toInt(value, fallback = 1) {
  const n = parseInt(String(value ?? "").replace(/\D+/g, ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function intQty(value) {
  return Math.max(1, toInt(value, 1));
}

function intMoney(value) {
  return Math.max(0, toInt(value, 0));
}

function bindIntegerFields(root = app) {
  root.querySelectorAll("input[data-int]").forEach((input) => {
    if (input.dataset.intBound) return;
    input.dataset.intBound = "1";
    const min = Number(input.dataset.min ?? 1);
    const fallback = Number.isFinite(min) ? min : 1;
    input.addEventListener("keydown", (event) => {
      if ([".", ",", "e", "E", "+", "-"].includes(event.key)) event.preventDefault();
    });
    input.addEventListener("wheel", () => input.blur());
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D+/g, "");
    });
    input.addEventListener("blur", () => {
      const n = parseInt(input.value, 10);
      input.value = String(Number.isFinite(n) ? Math.max(fallback, n) : fallback);
    });
  });
}

function lineCard(line, price) {
  const selected = line.taxRateIds || defaultTaxIds();
  return `<div class="card line">
    <div class="menu"><b>Line item</b></div>
    <label>Line item</label>
    <input class="line-desc" required minlength="2" value="${esc(line.description || "")}" />
    ${price ? "" : `<label>Serial number</label><input class="line-serial" value="${esc(line.serialNumber || "")}" />`}
    <label>Quantity</label>
    <input class="line-qty" data-int data-min="1" type="number" min="1" step="1" inputmode="numeric" required value="${intQty(line.quantity)}" />
    ${price ? `<label>Unit price (₹)</label><input class="line-price" data-int data-min="0" type="number" min="0" step="1" inputmode="numeric" value="${intMoney(line.unitPrice)}" />` : ""}
    ${price ? taxPicks(selected) : ""}
    <button type="button" class="out line-del">Delete</button>
  </div>`;
}

function defaultTaxIds() {
  const taxes = cache.taxes || [];
  const gst18 = taxes.find((tax) => tax.code === "gst_18" || Number(tax.rateBps) === 1800);
  return gst18 ? [gst18.id] : [];
}

function taxPicks(selectedIds = []) {
  const taxes = cache.taxes || [];
  if (!taxes.length) return `<div class="sub">Add taxes in General settings to apply GST or other rates.</div>`;
  return `<label>Tax</label><div class="tax-picks">${taxes.map((tax) => {
    const on = selectedIds.includes(tax.id);
    return `<label class="tax-chip"><input type="checkbox" class="line-tax" value="${esc(tax.id)}" ${on ? "checked" : ""} /> ${esc(tax.name)}</label>`;
  }).join("")}</div>`;
}

function collectLines(price = true) {
  return [...app.querySelectorAll(".line")].map((row) => {
    const item = {
      description: row.querySelector(".line-desc").value.trim(),
      quantity: intQty(row.querySelector(".line-qty").value),
    };
    if (price) item.unitPriceMinor = Math.round(intMoney(row.querySelector(".line-price").value) * 100);
    if (price) item.taxRateIds = [...row.querySelectorAll(".line-tax:checked")].map((el) => el.value);
    else {
      const serial = row.querySelector(".line-serial")?.value.trim();
      if (serial) item.serialNumber = serial;
    }
    return item;
  }).filter((item) => item.description.length >= 2);
}

function bindLines({ price = true } = {}) {
  bindIntegerFields();
  const box = app.querySelector("#lines");
  const add = app.querySelector("#add-line");
  if (add) add.onclick = () => {
    box.insertAdjacentHTML("beforeend", lineCard({ description: "", quantity: 1, unitPrice: 0 }, price));
    bindIntegerFields(box.lastElementChild);
  };
  if (box) box.onclick = (event) => {
    const del = event.target.closest(".line-del");
    if (!del) return;
    if (box.querySelectorAll(".line").length <= 1) return toast("Keep at least one line item");
    del.closest(".line").remove();
  };
}

async function renderList(title, path, hrefFor, extra = "", { parent = "/more", tab = "more" } = {}) {
  app.innerHTML = loading(title, parent) + dock(tab);
  try {
    const list = items(await api(path, { query: { limit: 50 } }));
    app.innerHTML = `<section class="screen">${bar(title, { backTo: parent, action: extra })}
      <div class="scroll">${list.length ? list.map((item) => {
        const href = hrefFor(item);
        return `<div class="card ${href ? "tap" : ""}" ${href ? `data-go="${esc(href)}"` : ""}>${kv(item)}</div>`;
      }).join("") : `<div class="empty">Nothing here yet.</div>`}</div>
      ${dock(tab)}
    </section>`;
  } catch (error) {
    app.innerHTML = fail(title, error, parent) + dock(tab);
    app.querySelector("#retry").onclick = () => renderList(title, path, hrefFor, extra, { parent, tab });
  }
}

async function renderQuotationForm() {
  const id = parseHash().params.id;
  const leadId = parseHash().query.leadId;
  app.innerHTML = loading(id ? "Edit quotation" : "New quotation", "/quotations");
  try {
    const existing = id ? await api(`/quotations/${id}`) : null;
    const catalog = await api("/quotations/catalog").catch(() => ({ products: [], taxes: [] }));
    cache.taxes = catalog.taxes || [];
    const leads = leadId || existing?.leadId
      ? [{ id: existing?.leadId || leadId, customerName: cache.currentLead?.customerName || existing?.customerName, title: cache.currentLead?.title || existing?.title }]
      : items(await api("/leads", { query: { limit: 50 } }));
    const lead = cache.currentLead && cache.currentLead.id === (existing?.leadId || leadId) ? cache.currentLead : existing || {};
    const amount = lead.estimatedValueMinor ? Math.round(lead.estimatedValueMinor / 100) : 1000;
    const lines = (existing?.items || []).map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPriceMinor != null ? Math.round(line.unitPriceMinor / 100) : amount,
      taxRateIds: line.taxRateIds || [],
    }));
    if (!lines.length) lines.push({ description: lead.title || "Supply", quantity: 1, unitPrice: amount });
    app.innerHTML = `<section class="screen">${bar(id ? "Edit quotation" : "New quotation", { backTo: id ? `/quotations/${id}` : "/quotations" })}
      <form id="q-form" class="scroll no-dock">
        <div class="card">
          <label>Lead</label>
          <select name="leadId" required ${id ? "disabled" : ""}>${options(leads, existing?.leadId || leadId, (l) => l.customerName || l.title)}</select>
          <label>Title</label>
          <input name="title" value="${esc(existing?.title || lead.title || "Quotation")}" />
        </div>
        <p class="group">Line items</p>
        <div id="lines">${lines.map((line) => lineCard(line, true)).join("")}</div>
        <button type="button" class="out" id="add-line">＋ Add line item</button>
        <p class="err" id="form-error" hidden></p>
        <button class="btn" type="submit">${id ? "Save changes" : "Create"}</button>
      </form>
    </section>`;
    bindLines({ price: true });
    app.querySelector("#q-form").onsubmit = async (event) => {
      event.preventDefault();
      const f = event.target;
      const quoteItems = collectLines(true);
      if (!quoteItems.length) {
        const box = app.querySelector("#form-error");
        box.hidden = false;
        box.textContent = "Add at least one line item";
        return;
      }
      try {
        if (id) {
          await api(`/quotations/${id}`, { method: "PATCH", body: { title: f.title.value, items: quoteItems, version: existing.version } });
          toast("Quotation updated");
          go(`/quotations/${id}`);
        } else {
          const created = await api("/quotations", { method: "POST", body: { leadId: f.leadId.value, title: f.title.value, items: quoteItems } });
          toast("Quotation created");
          go(`/quotations/${created.id}`);
        }
      } catch (err) {
        const box = app.querySelector("#form-error");
        box.hidden = false;
        box.textContent = err.message;
      }
    };
  } catch (error) {
    app.innerHTML = fail(id ? "Edit quotation" : "New quotation", error, "/quotations");
    app.querySelector("#retry").onclick = renderQuotationForm;
  }
}

async function renderQuotationDetail() {
  const { id } = parseHash().params;
  app.innerHTML = loading("Quotation", "/quotations");
  try {
    const item = await api(`/quotations/${id}`);
    const draft = String(item.status || "").toLowerCase() === "draft";
    app.innerHTML = `<section class="screen">${bar("Quotation", { backTo: "/quotations" })}
      <div class="scroll no-dock">
        <div class="card">
          <b>${esc(item.number || item.title || "Quotation")}</b>
          <div class="sub">${esc(item.statusLabel || item.status)} · ${rupees(item.grandTotalMinor || item.totalMinor)}</div>
        </div>
        <p class="group">Line items</p>
        ${(item.items || []).map((line, index) => `<div class="card">
          <div class="menu"><b>${esc(line.description)}</b></div>
          <div class="sub" style="margin:0">${intQty(line.quantity)} × ${rupees(line.unitPriceMinor)}${line.taxBps ? ` · ${(line.taxBps / 100).toFixed(0)}% tax` : ""}</div>
          ${draft ? `<div class="stack" style="margin-top:10px">
            <button class="out line-edit" data-i="${index}">Edit</button>
            <button class="out line-remove" data-i="${index}">Delete</button>
          </div>` : ""}
        </div>`).join("") || `<div class="empty">No line items</div>`}
        <div class="stack">
          ${item.leadId ? `<button class="out" data-go="/leads/${item.leadId}">Open lead</button>` : ""}
          ${draft ? `<button class="out" data-go="/quotations/${id}/edit">Edit quotation</button>` : ""}
          <button class="btn" id="send">Send quotation</button>
          <button class="out" id="follow">Schedule follow-up</button>
          ${draft ? `<button class="out" id="delete">Delete quotation</button>` : ""}
        </div>
      </div>
    </section>`;
    app.querySelector("#send").onclick = async () => {
      try {
        await api(`/quotations/${id}/send`, { method: "POST", body: {} });
        toast("Quotation sent");
        renderQuotationDetail();
      } catch (err) { toast(err.message); }
    };
    app.querySelector("#follow").onclick = async () => {
      try {
        await api(`/quotations/${id}/follow-up`, { method: "POST", body: { nextFollowUpAt: new Date(Date.now() + 86400000).toISOString() } });
        toast("Follow-up scheduled");
      } catch (err) { toast(err.message); }
    };
    const del = app.querySelector("#delete");
    if (del) del.onclick = async () => {
      if (!confirm("Delete this quotation?")) return;
      try {
        await api(`/quotations/${id}`, { method: "DELETE" });
        toast("Quotation deleted");
        go("/quotations");
      } catch (err) { toast(err.message); }
    };
    app.querySelectorAll(".line-edit").forEach((btn) => {
      btn.onclick = () => go(`/quotations/${id}/edit`);
    });
    app.querySelectorAll(".line-remove").forEach((btn) => {
      btn.onclick = async () => {
        const next = (item.items || []).filter((_, index) => index !== Number(btn.dataset.i)).map((line) => ({
          description: line.description,
          quantity: intQty(line.quantity),
          unitPriceMinor: line.unitPriceMinor,
          ...(line.productId ? { productId: line.productId } : {}),
          ...(line.discountMinor != null ? { discountMinor: line.discountMinor } : {}),
          ...(line.taxBps != null ? { taxBps: line.taxBps } : {}),
        }));
        if (!next.length) return toast("Keep at least one line item");
        try {
          await api(`/quotations/${id}`, { method: "PATCH", body: { items: next, version: item.version } });
          toast("Line deleted");
          renderQuotationDetail();
        } catch (err) { toast(err.message); }
      };
    });
  } catch (error) {
    app.innerHTML = fail("Quotation", error, "/quotations");
    app.querySelector("#retry").onclick = renderQuotationDetail;
  }
}

async function renderFollowUpForm() {
  const id = parseHash().params.id;
  const leadId = parseHash().query.leadId;
  app.innerHTML = loading(id ? "Edit follow-up" : "New follow-up");
  try {
    const existing = id ? await api(`/follow-ups/${id}`) : {};
    const leads = items(await api("/leads", { query: { limit: 50 } }));
    app.innerHTML = `<section class="screen">${bar(id ? "Edit follow-up" : "New follow-up", { backTo: "/follow-ups" })}
      <form id="fu" class="scroll no-dock card">
        <label>Lead</label>
        <select name="leadId" required>${options(leads, existing.leadId || leadId, (l) => l.customerName || l.title)}</select>
        <label>Type</label>
        <select name="type"><option value="call">Call</option><option value="whatsapp">WhatsApp</option><option value="visit">Visit</option><option value="meeting">Meeting</option></select>
        <label>Due</label>
        <input name="dueAt" type="datetime-local" required value="${localInput()}" />
        <label>Title</label>
        <input name="title" required value="${esc(existing.title || "Follow-up")}" />
        <label>Notes</label>
        <textarea name="notes" rows="3">${esc(existing.notes || "")}</textarea>
        <button class="btn" type="submit">Save</button>
      </form>
    </section>`;
    if (existing.type) app.querySelector("[name=type]").value = existing.type;
    app.querySelector("#fu").onsubmit = async (event) => {
      event.preventDefault();
      const f = event.target;
      const payload = { leadId: f.leadId.value, type: f.type.value, dueAt: isoFromLocal(f.dueAt.value), title: f.title.value, notes: f.notes.value || undefined };
      try {
        const saved = id
          ? await api(`/follow-ups/${id}`, { method: "PATCH", body: { ...payload, version: existing.version } })
          : await api("/follow-ups", { method: "POST", body: payload });
        toast("Follow-up saved");
        go(`/follow-ups/${saved.id || id}`);
      } catch (err) { toast(err.message); }
    };
  } catch (error) {
    app.innerHTML = fail("Follow-up", error);
    app.querySelector("#retry").onclick = renderFollowUpForm;
  }
}

async function renderFollowUpDetail() {
  const { id } = parseHash().params;
  app.innerHTML = loading("Follow-up");
  try {
    const item = await api(`/follow-ups/${id}`);
    const pending = !["completed", "cancelled", "done"].includes(String(item.status || "").toLowerCase());
    app.innerHTML = `<section class="screen">${bar("Follow-up", { backTo: "/follow-ups" })}
      <div class="scroll no-dock">
        <div class="card">
          <b>${esc(item.title)}</b>
          <div class="sub">${esc(item.status)} · ${fmtDate(item.dueAt)}</div>
          ${item.notes ? `<p>${esc(item.notes)}</p>` : ""}
        </div>
        <div class="stack">
          ${item.leadId ? `<button class="out" data-go="/leads/${item.leadId}">Open lead</button>` : ""}
          ${pending ? `<button class="btn" id="done">Complete follow-up</button>
          <button class="out" data-go="/follow-ups/${id}/edit">Reschedule / edit</button>` : ""}
        </div>
      </div>
    </section>`;
    const done = app.querySelector("#done");
    if (done) done.onclick = async () => {
      try {
        await api(`/follow-ups/${id}/complete`, { method: "POST", body: {} });
        toast("Completed");
        renderFollowUpDetail();
      } catch (err) { toast(err.message); }
    };
  } catch (error) {
    app.innerHTML = fail("Follow-up", error);
    app.querySelector("#retry").onclick = renderFollowUpDetail;
  }
}

async function renderVisitForm() {
  const leadId = parseHash().query.leadId;
  app.innerHTML = loading("Schedule visit");
  try {
    const leads = leadId ? [{ id: leadId, customerName: cache.currentLead?.customerName, title: cache.currentLead?.title }] : items(await api("/leads", { query: { limit: 50 } }));
    app.innerHTML = `<section class="screen">${bar("Schedule visit", { backTo: "/visits" })}
      <form id="v-form" class="scroll no-dock card">
        <label>Lead</label>
        <select name="leadId" required>${options(leads, leadId, (l) => l.customerName || l.title)}</select>
        <label>When</label>
        <input name="scheduledAt" type="datetime-local" required value="${localInput()}" />
        <label>Purpose</label>
        <input name="purpose" value="Site assessment" />
        <label>City</label>
        <input name="city" value="${esc(cache.currentLead?.city || "")}" />
        <button class="btn" type="submit">Schedule</button>
      </form>
    </section>`;
    app.querySelector("#v-form").onsubmit = async (event) => {
      event.preventDefault();
      const f = event.target;
      try {
        const created = await api("/site-visits", { method: "POST", body: { leadId: f.leadId.value, scheduledAt: isoFromLocal(f.scheduledAt.value), purpose: f.purpose.value, city: f.city.value || undefined } });
        toast("Site visit scheduled");
        go(`/visits/${created.id}`);
      } catch (err) { toast(err.message); }
    };
  } catch (error) {
    app.innerHTML = fail("Schedule visit", error);
    app.querySelector("#retry").onclick = renderVisitForm;
  }
}

async function renderVisitDetail() {
  const { id } = parseHash().params;
  app.innerHTML = loading("Site visit");
  try {
    const item = await api(`/site-visits/${id}`);
    const open = isOpenVisit(item.status);
    const meta = [item.leadNumber, item.customerName].filter(Boolean).join(" · ");
    app.innerHTML = `<section class="screen">${bar("Site visit", { backTo: "/visits" })}
      <div class="scroll no-dock">
        <div class="card">
          <b>${esc(item.purpose || "Site visit")}</b>
          <div class="sub">${esc(visitStatusLabel(item.status))} · ${fmtDate(item.scheduledAt)}</div>
          ${meta ? `<div class="sub">${esc(meta)}</div>` : ""}
        </div>
        ${open ? "" : `<p class="err" id="visit-note">This visit is ${esc(visitStatusLabel(item.status).toLowerCase())}. Check in, complete, and cancel are only available while a visit is scheduled or in progress.</p>`}
        <p class="err" id="visit-err" hidden></p>
        <div class="stack">
          ${item.leadId ? `<button type="button" class="out" id="open-lead">Open lead</button>` : ""}
          ${item.status === "scheduled" ? `<button type="button" class="btn" id="checkin">Check in</button>` : ""}
          ${item.status === "in_progress" ? `<button type="button" class="out" id="checkout">Check out</button>` : ""}
          ${open ? `<button type="button" class="out" id="complete">Complete visit</button>` : ""}
          ${open ? `<button type="button" class="out" id="cancel">Cancel visit</button>` : ""}
        </div>
      </div>
    </section>`;
    const errBox = app.querySelector("#visit-err");
    const showErr = (msg) => { errBox.hidden = false; errBox.textContent = msg; };
    const setBusy = (btn, busy) => {
      if (!btn) return;
      btn.disabled = busy;
      if (!btn.dataset.label) btn.dataset.label = btn.textContent;
      btn.textContent = busy ? "Working…" : btn.dataset.label;
    };
    const run = (btn, okLabel, action) => async () => {
      errBox.hidden = true;
      setBusy(btn, true);
      try {
        await action();
        toast(okLabel);
        renderVisitDetail();
      } catch (err) {
        setBusy(btn, false);
        showErr(err.message);
        toast(err.message);
      }
    };
    const openLead = app.querySelector("#open-lead");
    if (openLead) openLead.onclick = () => go(`/leads/${item.leadId}`);
    const checkin = app.querySelector("#checkin");
    if (checkin) checkin.onclick = run(checkin, "Checked in", async () => {
      const location = await previewGps();
      await api(`/site-visits/${id}/check-in`, { method: "POST", body: { location, version: item.version } });
    });
    const checkout = app.querySelector("#checkout");
    if (checkout) checkout.onclick = run(checkout, "Checked out", async () => {
      const location = await previewGps();
      await api(`/site-visits/${id}/check-out`, { method: "POST", body: { location, version: item.version } });
    });
    const complete = app.querySelector("#complete");
    if (complete) complete.onclick = run(complete, "Visit completed", async () => {
      const location = await previewGps();
      await api(`/site-visits/${id}/complete`, { method: "POST", body: { location, version: item.version } });
    });
    const cancel = app.querySelector("#cancel");
    if (cancel) cancel.onclick = async () => {
      if (!window.confirm("Cancel this site visit?")) return;
      await run(cancel, "Visit cancelled", async () => {
        await api(`/site-visits/${id}/cancel`, { method: "POST", body: { version: item.version } });
      })();
    };
  } catch (error) {
    app.innerHTML = fail("Site visit", error);
    app.querySelector("#retry").onclick = renderVisitDetail;
  }
}

async function renderAttendance() {
  app.innerHTML = loading("Attendance");
  try {
    const [today, days] = await Promise.all([api("/attendance/today"), api("/attendance/days")]);
    const open = today.open;
    app.innerHTML = `<section class="screen">${bar("Attendance", { backTo: "/more", action: `<button class="icon-btn" data-go="/reports/attendance" title="Report">📊</button>` })}
      <div class="scroll no-dock">
        <div class="card">
          <b>${esc(attendanceStatus(today.today?.status))}</b>
          <div class="sub">${open ? `Punched in at ${fmtClock(open.punchedInAt)} · ${formatMinutes(open.minutesWorked)}` : `Not punched in · late after ${esc(today.lateAfter || "10:15")}`}</div>
          ${open?.inLocation ? `<div class="sub">GPS ${open.inLocation.latitude.toFixed(5)}, ${open.inLocation.longitude.toFixed(5)}</div>` : ""}
          <p class="err" id="att-err" hidden></p>
          <div class="stack" style="margin-top:12px">
            ${open ? `<button type="button" class="btn" id="punch-out">Punch out</button>` : `<button type="button" class="btn" id="punch-in">Punch in</button>`}
          </div>
        </div>
        <p class="group">Day list</p>
        ${(days.items || []).map((day) => `<div class="card">
          <b>${esc(day.date)}${day.staffName ? ` · ${esc(day.staffName)}` : ""}</b>
          <div class="sub">${esc(attendanceStatus(day.status))} · In ${fmtClock(day.firstInAt)} · Out ${fmtClock(day.lastOutAt)} · ${formatMinutes(day.minutesWorked)}</div>
        </div>`).join("") || `<div class="empty">No days yet.</div>`}
      </div>
    </section>`;
    const errBox = app.querySelector("#att-err");
    const run = (btn, label, path) => async () => {
      errBox.hidden = true;
      btn.disabled = true;
      btn.textContent = "Working…";
      try {
        const location = await previewGps();
        await api(`/attendance/${path}`, { method: "POST", body: { location } });
        toast(label);
        renderAttendance();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = path === "punch-in" ? "Punch in" : "Punch out";
        errBox.hidden = false;
        errBox.textContent = err.message;
        toast(err.message);
      }
    };
    const punchIn = app.querySelector("#punch-in");
    if (punchIn) punchIn.onclick = run(punchIn, "Punched in", "punch-in");
    const punchOut = app.querySelector("#punch-out");
    if (punchOut) punchOut.onclick = run(punchOut, "Punched out", "punch-out");
  } catch (error) {
    app.innerHTML = fail("Attendance", error);
    app.querySelector("#retry").onclick = renderAttendance;
  }
}

async function renderNotifications() {
  app.innerHTML = loading("Notifications");
  try {
    const list = items(await api("/notifications"));
    app.innerHTML = `<section class="screen">${bar("Notifications", { backTo: "/dashboard" })}
      <div class="scroll">${list.length ? list.map((n) => `<div class="card tap" data-id="${n.id}" data-type="${esc(n.resourceType || "")}" data-rid="${esc(n.resourceId || "")}">
        <b>${esc(n.title || n.type)}</b><div class="sub">${esc(n.body || n.message || fmtDate(n.createdAt))}</div>
      </div>`).join("") : `<div class="empty">No notifications.</div>`}</div>
      ${dock("dashboard")}
    </section>`;
    app.querySelectorAll("[data-id]").forEach((row) => {
      row.onclick = async () => {
        try { await api(`/notifications/${row.dataset.id}/read`, { method: "POST", body: {} }); } catch { /* ignore */ }
        const type = row.dataset.type;
        const rid = row.dataset.rid;
        if (type === "lead" && rid) return go(`/leads/${rid}`);
        if (type === "follow_up" && rid) return go(`/follow-ups/${rid}`);
        if (type === "quotation" && rid) return go(`/quotations/${rid}`);
        toast("Marked read");
        renderNotifications();
      };
    });
  } catch (error) {
    app.innerHTML = fail("Notifications", error);
    app.querySelector("#retry").onclick = renderNotifications;
  }
}

async function renderSearch() {
  app.innerHTML = `<section class="screen">${bar("Search", { backTo: "/leads" })}
    <div class="scroll">
      <form id="search-form"><input name="q" placeholder="Search leads, quotations…" autofocus /><button class="btn" type="submit">Search</button></form>
      <div id="results"></div>
    </div>
    ${dock("leads")}
  </section>`;
  app.querySelector("#search-form").onsubmit = async (event) => {
    event.preventDefault();
    const q = event.target.q.value.trim();
    const box = app.querySelector("#results");
    box.innerHTML = `<div class="empty">Searching…</div>`;
    try {
      const data = await api("/search", { query: { q } });
      const hits = items(data);
      box.innerHTML = hits.length ? hits.map((row) => {
        const href = row.type === "quotation" ? `/quotations/${row.quotationId || row.id}` : `/leads/${row.leadId || row.id}`;
        return `<div class="card tap" data-go="${href}"><b>${esc(row.title || row.customerName)}</b><div class="sub">${esc(row.subtitle || row.leadNumber || row.quotationNumber || "")}</div></div>`;
      }).join("") : `<div class="empty">No matches.</div>`;
    } catch (err) { box.innerHTML = `<div class="err">${esc(err.message)}</div>`; }
  };
}

async function renderPipeline() {
  app.innerHTML = loading("Pipeline");
  try {
    const board = await api("/pipelines/board");
    app.innerHTML = `<section class="screen">${bar("Pipeline", { backTo: "/more" })}
      <div class="scroll">${(board.columns || []).map((col) => {
        const stage = col.stage || col;
        const leads = col.leads || col.cards || [];
        return `<div class="card"><b>${esc(stage.name)}</b> · ${col.count ?? leads.length}<div>${leads.map((lead) => `<div class="list-row" data-go="/leads/${lead.id || lead.leadId}">${esc(lead.customerName || lead.title)}</div>`).join("") || "<div class='sub'>Empty</div>"}</div></div>`;
      }).join("")}</div>
      ${dock("more")}
    </section>`;
  } catch (error) {
    app.innerHTML = fail("Pipeline", error);
    app.querySelector("#retry").onclick = renderPipeline;
  }
}

const CATALOG_KINDS = [
  { kind: "products", title: "Products", path: "/catalog/products" },
  { kind: "categories", title: "Categories", path: "/catalog/categories" },
  { kind: "sources", title: "Lead sources", path: "/catalog/sources" },
  { kind: "lead-qualities", title: "Lead qualities", path: "/catalog/lead-qualities" },
  { kind: "lead-statuses", title: "Lead statuses", path: "/catalog/lead-statuses" },
  { kind: "warranty-periods", title: "Warranty periods", path: "/catalog/warranty-periods" },
  { kind: "taxes", title: "Taxes", path: "/catalog/taxes" },
];

function renderCatalog() {
  app.innerHTML = `<section class="screen">${bar("Catalog", { backTo: "/more" })}
    <div class="scroll">${CATALOG_KINDS.map((item) => rowCard(`/catalog/${item.kind}`, item.title, "Manage live records")).join("")}</div>
    ${dock("more")}
  </section>`;
}

function renderGeneralSettings() {
  app.innerHTML = `<section class="screen">${bar("General settings", { backTo: "/more" })}
    <div class="scroll">
      ${rowCard("/settings/general/taxes", "Taxes", "Add GST, CGST, SGST and other rates")}
      ${rowCard("/catalog", "Catalog", "Products, statuses, and warranty periods")}
    </div>
    ${dock("more")}
  </section>`;
}

function taxEditorRow(tax = {}) {
  const rate = tax.ratePercent != null ? tax.ratePercent : Number(tax.rateBps || 0) / 100;
  return `<div class="card tax-row" data-id="${esc(tax.id || "")}">
    <div class="tax-grid">
      <div>
        <label>Name</label>
        <input class="tax-name" value="${esc(tax.name || "")}" placeholder="GST 18%" />
      </div>
      <div>
        <label>Rate %</label>
        <input class="tax-rate" type="number" min="0" max="100" step="0.01" value="${esc(String(rate || 0))}" />
      </div>
    </div>
    <label class="tax-chip"><input type="checkbox" class="tax-active" ${tax.isActive === false ? "" : "checked"} /> Active</label>
    <button type="button" class="out line-del tax-del">Delete</button>
  </div>`;
}

async function renderTaxesSettings() {
  const parent = parseHash().params.parent || "/settings/general";
  app.innerHTML = loading("Taxes", parent);
  try {
    const list = items(await api("/catalog/taxes", { query: { includeInactive: true } }));
    app.innerHTML = `<section class="screen">${bar("Taxes", { backTo: parent })}
      <div id="tax-form" class="scroll no-dock">
        <p class="group">Manage multiple taxes</p>
        <p class="err" id="form-error" hidden></p>
        <p class="ok" id="form-ok" hidden></p>
        <div id="tax-rows">${(list.length ? list : [{ name: "GST 18%", ratePercent: 18, isActive: true }]).map(taxEditorRow).join("")}</div>
        <button type="button" class="out" id="add-tax">＋ Add tax</button>
        <button class="btn" type="button" id="save-taxes">Save all taxes</button>
      </div>
    </section>`;
    const box = app.querySelector("#tax-rows");
    const errBox = app.querySelector("#form-error");
    const okBox = app.querySelector("#form-ok");
    const saveBtn = app.querySelector("#save-taxes");
    const showErr = (message) => {
      errBox.hidden = false;
      errBox.textContent = message;
      okBox.hidden = true;
      errBox.scrollIntoView({ block: "nearest" });
    };
    app.querySelector("#add-tax").onclick = () => {
      box.insertAdjacentHTML("beforeend", taxEditorRow({ name: "", ratePercent: 0, isActive: true }));
    };
    box.onclick = (event) => {
      const del = event.target.closest(".tax-del");
      if (!del) return;
      if (box.querySelectorAll(".tax-row").length <= 1) return toast("Keep at least one tax");
      del.closest(".tax-row").remove();
    };
    saveBtn.onclick = async () => {
      errBox.hidden = true;
      okBox.hidden = true;
      const rows = [...box.querySelectorAll(".tax-row")];
      const payload = {
        items: rows.map((row, index) => {
          const id = row.getAttribute("data-id");
          const name = row.querySelector(".tax-name").value.trim();
          const ratePercent = Number(row.querySelector(".tax-rate").value);
          return {
            ...(id ? { id } : {}),
            name,
            ratePercent: Number.isFinite(ratePercent) ? ratePercent : 0,
            isActive: Boolean(row.querySelector(".tax-active")?.checked),
            sortOrder: (index + 1) * 10,
          };
        }).filter((item) => item.name.length >= 2),
        deleteIds: list.map((item) => item.id).filter((id) => id && !rows.some((row) => row.getAttribute("data-id") === id)),
      };
      if (!payload.items.length) {
        showErr("Add at least one named tax");
        return;
      }
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving…";
      try {
        await api("/catalog/taxes/batch", { method: "POST", body: payload });
        toast("Taxes saved");
        okBox.hidden = false;
        okBox.textContent = "Taxes saved";
        await renderTaxesSettings();
      } catch (err) {
        showErr(err.message || "Could not save taxes");
        saveBtn.disabled = false;
        saveBtn.textContent = "Save all taxes";
      }
    };
  } catch (error) {
    app.innerHTML = fail("Taxes", error, parent);
    app.querySelector("#retry").onclick = renderTaxesSettings;
  }
}

function catalogSubtitle(kind, item) {
  const bits = [];
  if (item.sku) bits.push(item.sku);
  if (kind !== "products" && item.code) bits.push(item.code);
  if (kind === "taxes") {
    const rate = item.ratePercent != null ? item.ratePercent : Number(item.rateBps || 0) / 100;
    bits.push(`${rate}%`);
  }
  if (kind === "warranty-periods" && item.months) bits.push(`${item.months} months`);
  bits.push(item.isActive === false ? "Inactive" : "Active");
  return bits.join(" · ");
}

function catalogFormFields(kind, item = {}) {
  const name = esc(item.name || "");
  if (kind === "products") {
    return `<label>SKU</label><input name="sku" required value="${esc(item.sku || "")}" /><label>Name</label><input name="name" required value="${name}" />`;
  }
  const code = `<label>Code</label><input name="code" required pattern="[a-z][a-z0-9_]*" value="${esc(item.code || "")}" /><label>Name</label><input name="name" required value="${name}" />`;
  if (kind === "warranty-periods") {
    return `${code}<label>Months</label><input name="months" type="number" min="1" value="${esc(String(item.months || 12))}" />`;
  }
  if (kind === "taxes") {
    const rate = item.ratePercent != null ? item.ratePercent : Number(item.rateBps || 0) / 100;
    return `${code}<label>Rate %</label><input name="ratePercent" type="number" min="0" max="100" step="0.01" value="${esc(String(rate || 0))}" />`;
  }
  return code;
}

function catalogPayload(kind, form) {
  if (kind === "products") {
    return { sku: form.sku.value.trim(), name: form.name.value.trim() };
  }
  const body = {
    name: form.name.value.trim(),
    code: form.code.value.trim().toLowerCase().replace(/[\s-]+/g, "_"),
  };
  if (form.months) body.months = Number(form.months.value);
  if (form.ratePercent) body.ratePercent = Number(form.ratePercent.value);
  return body;
}

async function renderCatalogKind() {
  const { kind } = parseHash().params;
  const spec = CATALOG_KINDS.find((item) => item.kind === kind) || { title: kind, path: `/catalog/${kind}` };
  app.innerHTML = loading(spec.title, "/catalog");
  try {
    const list = items(await api(spec.path, { query: { includeInactive: true } }));
    app.innerHTML = `<section class="screen">${bar(spec.title, { backTo: "/catalog" })}
      <div class="scroll no-dock">
        ${list.map((item) => `<div class="card">
          <b>${esc(item.name || item.sku || item.code)}</b>
          <div class="sub" style="margin:0">${esc(catalogSubtitle(kind, item))}</div>
          <div class="stack" style="margin-top:10px">
            <button type="button" class="out cat-edit" data-id="${esc(item.id)}">Edit</button>
            <button type="button" class="out line-del cat-del" data-id="${esc(item.id)}" data-name="${esc(item.name || item.sku || item.code)}">Delete</button>
          </div>
        </div>`).join("") || `<div class="empty">None yet.</div>`}
        <form id="cat-form" class="card" data-edit-id="">
          <b id="cat-form-title">Add ${esc(spec.title.toLowerCase())}</b>
          <div id="cat-fields">${catalogFormFields(kind)}</div>
          <p class="err" id="form-error" hidden></p>
          <button class="btn" type="submit">Create</button>
          <button class="out" type="button" id="cat-cancel" hidden>Cancel</button>
        </form>
      </div>
    </section>`;
    const form = app.querySelector("#cat-form");
    const titleEl = app.querySelector("#cat-form-title");
    const fields = app.querySelector("#cat-fields");
    const submit = form.querySelector("button[type=submit]");
    const cancel = app.querySelector("#cat-cancel");
    const errBox = app.querySelector("#form-error");
    const setMode = (item) => {
      form.dataset.editId = item?.id || "";
      titleEl.textContent = item ? `Edit ${item.name}` : `Add ${spec.title.toLowerCase()}`;
      fields.innerHTML = catalogFormFields(kind, item || {});
      submit.textContent = item ? "Save changes" : "Create";
      cancel.hidden = !item;
      errBox.hidden = true;
      form.scrollIntoView({ block: "nearest" });
    };
    app.querySelectorAll(".cat-edit").forEach((btn) => {
      btn.onclick = () => setMode(list.find((item) => item.id === btn.dataset.id));
    });
    app.querySelectorAll(".cat-del").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm(`Delete ${btn.dataset.name}?`)) return;
        try {
          await api(`${spec.path}/${btn.dataset.id}`, { method: "DELETE" });
          toast("Deleted");
          renderCatalogKind();
        } catch (err) { toast(err.message); }
      };
    });
    cancel.onclick = () => setMode(null);
    form.onsubmit = async (event) => {
      event.preventDefault();
      errBox.hidden = true;
      const body = catalogPayload(kind, form);
      const currentId = form.dataset.editId;
      try {
        if (currentId) await api(`${spec.path}/${currentId}`, { method: "PATCH", body });
        else await api(spec.path, { method: "POST", body });
        toast(currentId ? "Updated" : "Created");
        renderCatalogKind();
      } catch (err) {
        errBox.hidden = false;
        errBox.textContent = err.message;
      }
    };
  } catch (error) {
    app.innerHTML = fail(spec.title, error, "/catalog");
    app.querySelector("#retry").onclick = renderCatalogKind;
  }
}

async function renderTeams() {
  app.innerHTML = loading("Teams", "/more") + dock("more");
  try {
    const list = items(await api("/teams", { query: { limit: 50 } }));
    app.innerHTML = `<section class="screen">${bar("Teams", { backTo: "/more", action: `<button class="icon-btn" data-go="/teams/new" style="color:var(--teal);width:auto;font-weight:700">＋</button>` })}
      <div class="scroll">${list.length ? list.map((item) => `<div class="card">
          <b>${esc(item.name)}</b>
          <div class="sub" style="margin:0">${esc([item.code, `${item.memberCount || 0} members`, item.isActive === false ? "Inactive" : "Active"].join(" · "))}</div>
          <div class="stack" style="margin-top:10px">
            <button type="button" class="out" data-go="/teams/${esc(item.id)}">Edit</button>
            <button type="button" class="out line-del team-del" data-id="${esc(item.id)}" data-name="${esc(item.name)}">Delete</button>
          </div>
        </div>`).join("") : `<div class="empty">No teams yet.</div>`}</div>
      ${dock("more")}
    </section>`;
    app.querySelectorAll(".team-del").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm(`Delete ${btn.dataset.name}? Staff stay in the directory.`)) return;
        try {
          await api(`/teams/${btn.dataset.id}`, { method: "DELETE" });
          toast("Team deleted");
          renderTeams();
        } catch (err) { toast(err.message); }
      };
    });
  } catch (error) {
    app.innerHTML = fail("Teams", error, "/more") + dock("more");
    app.querySelector("#retry").onclick = renderTeams;
  }
}

function teamCodeFromName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

function staffLabel(member) {
  if (!member) return "";
  return member.user?.fullName || member.fullName || member.name || member.email || member.id || "";
}

function staffEmail(member) {
  return member?.user?.email || member?.email || "";
}

function staffStatus(member) {
  if (member?.active === false || member?.status === "suspended") return "Inactive";
  if (member?.status === "invited") return "Invited";
  return "Active";
}

function namedList(list) {
  return (list || []).map((item) => item.name || item.title || item.code).filter(Boolean).join(", ");
}

async function renderStaff() {
  app.innerHTML = loading("Staff", "/more") + dock("more");
  try {
    const list = items(await api("/staff", { query: { limit: 100 } }));
    app.innerHTML = `<section class="screen">${bar("Staff", { backTo: "/more", action: `<button class="icon-btn" data-go="/staff/new" style="color:var(--teal);width:auto;font-weight:700">＋</button>` })}
      <div class="scroll">${list.length ? list.map((item) => {
        const sub = [staffEmail(item), item.designation, namedList(item.roles), namedList(item.teams), staffStatus(item)].filter(Boolean).join(" · ");
        return rowCard(`/staff/${item.id}`, staffLabel(item) || "Staff", sub);
      }).join("") : `<div class="empty">No staff yet.</div>`}</div>
      ${dock("more")}
    </section>`;
  } catch (error) {
    app.innerHTML = fail("Staff", error, "/more") + dock("more");
    app.querySelector("#retry").onclick = renderStaff;
  }
}

async function renderTeamForm() {
  const { id } = parseHash().params;
  const title = id ? "Edit team" : "New team";
  app.innerHTML = loading(title, "/teams");
  try {
    const [staff, existing] = await Promise.all([
      api("/staff", { query: { limit: 100 } }).then(items),
      id ? api(`/teams/${id}`) : Promise.resolve(null),
    ]);
    const selected = new Set((existing?.members || []).map((member) => member.id));
    const staffRows = staff.map((member) => {
      const email = member.user?.email || member.email || "";
      return `<label class="tax-chip" style="width:100%;border-radius:12px">
        <input type="checkbox" name="member" value="${esc(member.id)}" ${selected.has(member.id) ? "checked" : ""} />
        <span>${esc(staffLabel(member))}${email ? ` · ${esc(email)}` : ""}</span>
      </label>`;
    }).join("");
    app.innerHTML = `<section class="screen">${bar(title, { backTo: "/teams" })}
      <form id="team-form" class="scroll no-dock">
        <div class="card">
          <label>Team name</label>
          <input name="name" required minlength="2" maxlength="80" value="${esc(existing?.name || "")}" />
          ${id ? `<label>Code</label><input name="code" value="${esc(existing?.code || "")}" disabled />
            <label class="tax-chip" style="margin-top:10px">
              <input type="checkbox" name="isActive" ${existing?.isActive === false ? "" : "checked"} />
              <span>Active</span>
            </label>` : `<label>Code</label><input name="code" maxlength="40" placeholder="Optional — from name" />`}
        </div>
        <div class="card">
          <b>Members</b>
          <div class="tax-picks" style="flex-direction:column">${staffRows || `<div class="empty">No staff yet.</div>`}</div>
        </div>
        <p class="err" id="form-error" hidden></p>
        <button class="btn" type="submit">${id ? "Save team" : "Create team"}</button>
        ${id ? `<button class="out line-del" type="button" id="team-delete">Delete team</button>` : ""}
      </form>
    </section>`;
    const form = app.querySelector("#team-form");
    const errBox = app.querySelector("#form-error");
    form.onsubmit = async (event) => {
      event.preventDefault();
      errBox.hidden = true;
      const name = form.name.value.trim();
      const membershipIds = [...form.querySelectorAll("input[name=member]:checked")].map((el) => el.value);
      try {
        let teamId = id;
        if (id) {
          await api(`/teams/${id}`, { method: "PATCH", body: { name, isActive: Boolean(form.isActive?.checked) } });
        } else {
          const raw = form.code.value.trim() || teamCodeFromName(name);
          const code = raw.toLowerCase().replace(/[\s-]+/g, "_");
          if (code.length < 2) throw new Error("Code must be at least 2 characters.");
          const created = await api("/teams", { method: "POST", body: { name, code } });
          teamId = created.id;
        }
        await api(`/teams/${teamId}/members`, { method: "PUT", body: { membershipIds } });
        toast(id ? "Team updated" : "Team created");
        go("/teams");
      } catch (err) {
        errBox.hidden = false;
        errBox.textContent = err.message;
      }
    };
    const del = app.querySelector("#team-delete");
    if (del) del.onclick = async () => {
      if (!confirm(`Delete ${existing.name}? Staff stay in the directory.`)) return;
      try {
        await api(`/teams/${id}`, { method: "DELETE" });
        toast("Team deleted");
        go("/teams");
      } catch (err) { toast(err.message); }
    };
  } catch (error) {
    app.innerHTML = fail(title, error, "/teams");
    app.querySelector("#retry").onclick = renderTeamForm;
  }
}

async function renderStaffDetail() {
  const { id } = parseHash().params;
  app.innerHTML = loading("Staff", "/staff");
  try {
    const item = await api(`/staff/${id}`);
    const name = staffLabel(item) || "Staff";
    const email = staffEmail(item);
    const lastLogin = item.user?.lastLoginAt
      ? `${fmtDate(item.user.lastLoginAt)} ${fmtClock(item.user.lastLoginAt)}`
      : "—";
    app.innerHTML = `<section class="screen">${bar(name, { backTo: "/staff", action: `<button class="icon-btn" data-go="/staff/${id}/edit" style="color:var(--teal);font-weight:700;width:auto">Edit</button>` })}
      <div class="scroll no-dock">
        <div class="card">
          <div class="menu"><b>${esc(name)}</b><span class="pill ${pillClass(staffStatus(item))}">${esc(staffStatus(item))}</span></div>
          <div class="sub" style="margin:8px 0 0">${esc(email || "—")}</div>
        </div>
        <div class="card">
          <div class="row"><b>Designation</b>${esc(item.designation || "—")}</div>
          <div class="row"><b>Employee code</b>${esc(item.employeeCode || "—")}</div>
          <div class="row"><b>Roles</b>${esc(namedList(item.roles) || "—")}</div>
          <div class="row"><b>Teams</b>${esc(namedList(item.teams) || "—")}</div>
          <div class="row"><b>Last login</b>${esc(lastLogin)}</div>
        </div>
        <div class="stack">
          <button class="btn" data-go="/performance/${item.id || id}">Performance</button>
          <button class="out" type="button" id="staff-toggle">${item.active === false ? "Activate" : "Deactivate"}</button>
        </div>
      </div>
    </section>`;
    app.querySelector("#staff-toggle").onclick = async () => {
      try {
        await api(`/staff/${id}/status`, { method: "POST", body: { active: item.active === false } });
        toast(item.active === false ? "Staff activated" : "Staff deactivated");
        renderStaffDetail();
      } catch (err) { toast(err.message); }
    };
  } catch (error) {
    app.innerHTML = fail("Staff", error, "/staff");
    app.querySelector("#retry").onclick = renderStaffDetail;
  }
}

async function renderStaffForm() {
  const id = parseHash().params.id;
  const title = id ? "Edit staff" : "Add staff";
  app.innerHTML = loading(title, id ? `/staff/${id}` : "/staff");
  try {
    const [roles, teams, existing] = await Promise.all([
      api("/roles").then(items),
      api("/teams", { query: { limit: 100 } }).then(items),
      id ? api(`/staff/${id}`) : Promise.resolve(null),
    ]);
    const selectedRoles = new Set((existing?.roles || []).map((role) => role.id));
    const selectedTeams = new Set((existing?.teams || []).map((team) => team.id));
    app.innerHTML = `<section class="screen">${bar(title, { backTo: id ? `/staff/${id}` : "/staff" })}
      <form id="s-form" class="scroll no-dock">
        <div class="card">
          <label>Full name</label>
          <input name="fullName" required minlength="2" value="${esc(staffLabel(existing))}" />
          <label>Email</label>
          <input name="email" type="email" required value="${esc(staffEmail(existing))}" />
          <label>Designation</label>
          <input name="designation" value="${esc(existing?.designation || "")}" />
          <label>Employee code</label>
          <input name="employeeCode" value="${esc(existing?.employeeCode || "")}" />
        </div>
        <div class="card">
          <b>Roles</b>
          <div class="tax-picks" style="flex-direction:column">${roles.map((role) => `<label class="tax-chip" style="width:100%;border-radius:12px">
            <input type="checkbox" name="role" value="${esc(role.id)}" ${selectedRoles.has(role.id) ? "checked" : ""} />
            <span>${esc(role.name)}</span>
          </label>`).join("")}</div>
        </div>
        <div class="card">
          <b>Teams</b>
          <div class="tax-picks" style="flex-direction:column">${teams.map((team) => `<label class="tax-chip" style="width:100%;border-radius:12px">
            <input type="checkbox" name="team" value="${esc(team.id)}" ${selectedTeams.has(team.id) ? "checked" : ""} />
            <span>${esc(team.name)}</span>
          </label>`).join("") || `<div class="empty">No teams yet.</div>`}</div>
        </div>
        <p class="err" id="form-error" hidden></p>
        <button class="btn" type="submit">${id ? "Save staff" : "Create staff"}</button>
      </form>
    </section>`;
    const form = app.querySelector("#s-form");
    const errBox = app.querySelector("#form-error");
    form.onsubmit = async (event) => {
      event.preventDefault();
      errBox.hidden = true;
      const roleIds = [...form.querySelectorAll("input[name=role]:checked")].map((el) => el.value);
      const teamIds = [...form.querySelectorAll("input[name=team]:checked")].map((el) => el.value);
      if (!roleIds.length) {
        errBox.hidden = false;
        errBox.textContent = "Select at least one role";
        return;
      }
      const body = {
        fullName: form.fullName.value.trim(),
        email: form.email.value.trim(),
        roleIds,
        teamIds,
      };
      if (form.designation.value.trim()) body.designation = form.designation.value.trim();
      if (form.employeeCode.value.trim()) body.employeeCode = form.employeeCode.value.trim();
      try {
        if (id) {
          await api(`/staff/${id}`, { method: "PATCH", body });
          toast("Staff updated");
          go(`/staff/${id}`);
        } else {
          const created = await api("/staff", { method: "POST", body });
          toast("Staff created");
          go(`/staff/${created.id}`);
        }
      } catch (err) {
        errBox.hidden = false;
        errBox.textContent = err.message;
      }
    };
  } catch (error) {
    app.innerHTML = fail(title, error, "/staff");
    app.querySelector("#retry").onclick = renderStaffForm;
  }
}

async function renderTargets() {
  app.innerHTML = loading("Targets", "/more") + dock("more");
  try {
    const list = items(await api("/targets", { query: { limit: 50 } }));
    app.innerHTML = `<section class="screen">${bar("Targets", { backTo: "/more", action: `<button class="icon-btn" data-go="/targets/new" style="color:var(--teal);width:auto;font-weight:700">＋</button>` })}
      <div class="scroll">${list.length ? list.map((item) => {
        const pace = item.onTrack ? "won" : "overdue";
        return `<div class="card tap" data-go="/targets/${esc(item.id)}">
          <div class="menu"><b>${esc(targetTitle(item))}</b><span class="pill ${pace}">${esc(forecastLabel(item.forecastBand) || (item.onTrack ? "On track" : "Behind"))}</span></div>
          <div class="sub">${esc([prettyKind(item.periodType), item.periodLabel, `${formatTargetValue(item, item.achievedValue)} of ${formatTargetValue(item)}`, targetPercent(item)].filter(Boolean).join(" · "))}</div>
          <div class="barline" style="margin-top:8px"><i style="width:${targetFraction(item)}%"></i></div>
        </div>`;
      }).join("") : `<div class="empty">No targets yet.</div>`}</div>
      ${dock("more")}
    </section>`;
  } catch (error) {
    app.innerHTML = fail("Targets", error, "/more") + dock("more");
    app.querySelector("#retry").onclick = renderTargets;
  }
}

async function renderTargetDetail() {
  const { id } = parseHash().params;
  app.innerHTML = loading("Target", "/targets");
  try {
    const item = await api(`/targets/${id}`);
    const chips = [prettyKind(item.periodType), prettyKind(item.scopeType), item.productName ? "Product" : "", forecastLabel(item.forecastBand)]
      .filter((label) => label && label !== "—")
      .map((label) => `<span class="pill ${item.onTrack ? "won" : "overdue"}">${esc(label)}</span>`)
      .join("");
    app.innerHTML = `<section class="screen">${bar("Target", { backTo: "/targets" })}
      <div class="scroll no-dock">
        <div class="card">
          <b>${esc(targetTitle(item))}</b>
          <div class="sub" style="margin:8px 0">${chips}</div>
          <div>${esc(formatTargetValue(item, item.achievedValue))} of ${esc(formatTargetValue(item))} · ${esc(targetPercent(item))}</div>
          <div class="barline" style="margin-top:10px"><i style="width:${targetFraction(item)}%"></i></div>
        </div>
        <div class="stats">
          <div class="stat"><span>Achievement</span><b>${esc(targetPercent(item))}</b></div>
          <div class="stat"><span>Balance</span><b>${esc(formatTargetValue(item, item.balance ?? item.remaining))}</b></div>
          <div class="stat"><span>Need / day</span><b>${esc(item.dailyRequired == null ? "—" : formatTargetValue(item, item.dailyRequired))}</b></div>
          <div class="stat"><span>Forecast</span><b>${esc(forecastLabel(item.forecastBand))}</b></div>
        </div>
        <div class="card">
          <div class="row"><b>Period</b>${esc([prettyKind(item.periodType), item.periodLabel].filter(Boolean).join(" · "))}</div>
          <div class="row"><b>Dates</b>${esc(item.periodStart || "—")} – ${esc(item.periodEnd || "—")}</div>
          <div class="row"><b>Assigned to</b>${esc(item.scopeName || prettyKind(item.scopeType) || "—")}</div>
          <div class="row"><b>Metric</b>${esc(item.metricName || prettyKind(item.metricCode) || "—")}</div>
          ${item.productName ? `<div class="row"><b>Product</b>${esc(item.productName)}</div>` : ""}
          <div class="row"><b>Target</b>${esc(formatTargetValue(item))}</div>
          <div class="row"><b>Achieved</b>${esc(formatTargetValue(item, item.achievedValue))}</div>
          ${item.notes ? `<div class="row"><b>Notes</b>${esc(item.notes)}</div>` : ""}
        </div>
        <div class="stack">
          <button class="out" data-go="/targets/${id}/edit">Edit target</button>
          <button class="out" id="delete">Delete target</button>
        </div>
      </div>
    </section>`;
    app.querySelector("#delete").onclick = async () => {
      if (!confirm("Delete this target?")) return;
      try {
        await api(`/targets/${id}`, { method: "DELETE" });
        toast("Target deleted");
        go("/targets");
      } catch (err) { toast(err.message); }
    };
  } catch (error) {
    app.innerHTML = fail("Target", error, "/targets");
    app.querySelector("#retry").onclick = renderTargetDetail;
  }
}

function metricByCode(metrics, code) {
  return (metrics || []).find((metric) => (metric.code || metric) === code) || {};
}

async function renderTargetForm() {
  const id = parseHash().params.id;
  app.innerHTML = loading(id ? "Edit target" : "New target", "/targets");
  try {
    const [catalog, existing] = await Promise.all([
      api("/targets/catalog").catch(() => ({})),
      id ? api(`/targets/${id}`) : Promise.resolve(null),
    ]);
    const metrics = Array.isArray(catalog.metrics) ? catalog.metrics : [{ code: "revenue", name: "Revenue", unit: "minor_currency" }];
    const teams = catalog.teams || [];
    const staff = catalog.staff || [];
    const products = catalog.products || [];
    const periods = catalog.periods || [{ code: "monthly", title: "Monthly" }, { code: "quarterly", title: "Quarterly" }, { code: "daily", title: "Daily" }];
    const scopes = catalog.scopes || [{ code: "tenant", title: "Company" }, { code: "membership", title: "Staff" }, { code: "team", title: "Team" }];
    const metricCode = existing?.metricCode || metrics[0]?.code || "revenue";
    const metric = metricByCode(metrics, metricCode);
    const money = (metric.unit || existing?.metricUnit) === "minor_currency" || metricCode === "revenue";
    const displayValue = existing
      ? (money ? Math.round(Number(existing.targetValue || 0) / 100) : Math.round(Number(existing.targetValue || 0)))
      : "";
    app.innerHTML = `<section class="screen">${bar(id ? "Edit target" : "New target", { backTo: id ? `/targets/${id}` : "/targets" })}
      <form id="t-form" class="scroll no-dock">
        <div class="card">
          <label>Period</label>
          <select name="periodType">${options(periods, existing?.periodType || "monthly", (p) => p.title || prettyKind(p.code), (p) => p.code)}</select>
          <label>Assigned to</label>
          <select name="scopeType">${options(scopes, existing?.scopeType || "tenant", (s) => s.title || prettyKind(s.code), (s) => s.code)}</select>
          <div id="scope-staff" ${ (existing?.scopeType || "tenant") === "membership" ? "" : "hidden" }>
            <label>Staff</label>
            <select name="scopeId">${options(staff, existing?.scopeId, (s) => s.name, (s) => s.membershipId || s.id)}</select>
          </div>
          <div id="scope-team" ${ (existing?.scopeType || "tenant") === "team" ? "" : "hidden" }>
            <label>Team</label>
            <select name="teamId">${options(teams, existing?.scopeId, (t) => t.name, (t) => t.id)}</select>
          </div>
          <label>Metric</label>
          <select name="metricCode">${options(metrics, metricCode, (m) => m.name || m.code, (m) => m.code)}</select>
          <div id="product-wrap" ${existing?.productId ? "" : "hidden"}>
            <label>Product</label>
            <select name="productId"><option value="">None</option>${options(products, existing?.productId, (p) => p.name, (p) => p.id)}</select>
          </div>
          <label id="value-label">${money ? "Target (₹)" : "Target value"}</label>
          <input name="targetValue" data-int data-min="0" type="number" min="0" step="1" inputmode="numeric" required value="${esc(displayValue)}" />
        </div>
        <p class="err" id="form-error" hidden></p>
        <button class="btn" type="submit">${id ? "Save changes" : "Create"}</button>
      </form>
    </section>`;
    bindIntegerFields();
    const form = app.querySelector("#t-form");
    const toggleScope = () => {
      const scope = form.scopeType.value;
      app.querySelector("#scope-staff").hidden = scope !== "membership";
      app.querySelector("#scope-team").hidden = scope !== "team";
    };
    const toggleMetric = () => {
      const selected = metricByCode(metrics, form.metricCode.value);
      const rupee = selected.unit === "minor_currency" || form.metricCode.value === "revenue";
      app.querySelector("#value-label").textContent = rupee ? "Target (₹)" : "Target value";
      app.querySelector("#product-wrap").hidden = form.metricCode.value !== "units_sold" && !form.productId.value;
    };
    form.scopeType.onchange = toggleScope;
    form.metricCode.onchange = toggleMetric;
    form.onsubmit = async (event) => {
      event.preventDefault();
      const selected = metricByCode(metrics, form.metricCode.value);
      const rupee = selected.unit === "minor_currency" || form.metricCode.value === "revenue";
      const raw = intMoney(form.targetValue.value);
      const body = {
        periodType: form.periodType.value,
        scopeType: form.scopeType.value,
        metricCode: form.metricCode.value,
        targetValue: rupee ? raw * 100 : raw,
      };
      if (body.scopeType === "membership") body.scopeId = form.scopeId.value;
      if (body.scopeType === "team") body.scopeId = form.teamId.value;
      if (form.productId.value) body.productId = form.productId.value;
      if (body.scopeType !== "tenant" && !body.scopeId) {
        const box = app.querySelector("#form-error");
        box.hidden = false;
        box.textContent = body.scopeType === "team" ? "Select a team" : "Select a staff member";
        return;
      }
      try {
        if (id) {
          await api(`/targets/${id}`, { method: "PATCH", body: { ...body, version: existing.version } });
          toast("Target updated");
          go(`/targets/${id}`);
        } else {
          const created = await api("/targets", { method: "POST", body });
          toast("Target created");
          go(`/targets/${created.id}`);
        }
      } catch (err) {
        const box = app.querySelector("#form-error");
        box.hidden = false;
        box.textContent = err.message;
      }
    };
  } catch (error) {
    app.innerHTML = fail(id ? "Edit target" : "New target", error, "/targets");
    app.querySelector("#retry").onclick = renderTargetForm;
  }
}

async function renderSessions() {
  app.innerHTML = loading("Devices & sessions");
  try {
    const list = items(await api("/auth/sessions"));
    app.innerHTML = `<section class="screen">${bar("Devices & sessions", { backTo: "/more" })}
      <div class="scroll">${list.map((s) => `<div class="card"><b>${esc(s.deviceName || s.deviceId)}</b><div class="sub">${esc(s.ipAddress || "")} · ${fmtDate(s.lastSeenAt || s.createdAt)}</div>
        <button class="out" data-id="${s.id}">Revoke</button></div>`).join("") || `<div class="empty">No sessions.</div>`}</div>
      ${dock("more")}
    </section>`;
    app.querySelectorAll("[data-id]").forEach((btn) => {
      btn.onclick = async () => {
        try { await api(`/auth/sessions/${btn.dataset.id}`, { method: "DELETE" }); toast("Revoked"); renderSessions(); }
        catch (err) { toast(err.message); }
      };
    });
  } catch (error) {
    app.innerHTML = fail("Devices & sessions", error);
    app.querySelector("#retry").onclick = renderSessions;
  }
}

function renderPassword() {
  app.innerHTML = `<section class="screen">${bar("Change password", { backTo: "/more" })}
    <div class="scroll no-dock"><form id="pw" class="card">
      <label>Current password</label><input name="currentPassword" type="password" required />
      <label>New password</label><input name="newPassword" type="password" required minlength="8" />
      <button class="btn">Save</button>
    </form></div>
  </section>`;
  app.querySelector("#pw").onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api("/auth/change-password", { method: "POST", body: { currentPassword: event.target.currentPassword.value, newPassword: event.target.newPassword.value } });
      toast("Password updated");
      go("/more");
    } catch (err) { toast(err.message); }
  };
}

function renderVerify() {
  app.innerHTML = `<section class="screen">${bar("Verify warranty", { backTo: "/more" })}
    <div class="scroll no-dock">
      <form id="vfy" class="card">
        <label>Verification token or URL</label>
        <input name="token" required placeholder="Paste token" />
        <button class="btn" type="submit">Verify</button>
      </form>
      <div id="vfy-out"></div>
    </div>
  </section>`;
  app.querySelector("#vfy").onsubmit = async (event) => {
    event.preventDefault();
    let token = event.target.token.value.trim();
    token = token.split("/").filter(Boolean).pop();
    const box = app.querySelector("#vfy-out");
    try {
      const item = await api(`/public/warranty/${token}`);
      box.innerHTML = reportView(item);
    } catch (err) { box.innerHTML = `<div class="err">${esc(err.message)}</div>`; }
  };
}

function renderMore() {
  const daily = [
    ["/search", "Search"],
    ["/follow-ups", "Follow-ups"],
    ["/quotations", "Quotations"],
    ["/visits", "Site visits"],
    ["/attendance", "Attendance"],
    ["/warranties", "Warranty cards"],
    ["/pipeline", "Pipeline"],
    ["/timeline", "Timeline"],
    ["/verify-warranty", "Verify warranty"],
  ];
  const performance = [
    ["/dashboard", "Dashboard"],
    ["/mtd", "MTD Performance"],
    ["/performance", "Target & Achievement"],
    ["/targets", "Targets"],
    ["/analytics", "Analytics"],
    ["/reports", "Reports"],
  ];
  const team = [
    ["/staff", "Staff"],
    ["/teams", "Teams"],
    ["/catalog", "Catalog"],
    ["/settings/general", "General settings"],
    ["/roles", "Roles"],
  ];
  const account = [
    ["/notifications", "Notifications"],
    ["/sessions", "Devices & sessions"],
    ["/password", "Change password"],
  ];
  const block = (title, links) => `<p class="group">${title}</p>${links.map(([href, label]) => rowCard(href, label)).join("")}`;
  app.innerHTML = `<section class="screen">${bar("More", { backTo: "/dashboard" })}
    <div class="scroll">
      <div class="card" style="display:flex;gap:12px;align-items:center">
        <div class="avatar" style="width:52px;height:52px">${esc(initials(session.fullName || session.email))}</div>
        <div><b>${esc(session.fullName || "INTRA user")}</b><div class="sub" style="margin:0">${esc(session.email || "")}</div></div>
      </div>
      ${block("Daily work", daily)}
      ${block("Performance", performance)}
      ${can("tenant:manage_users") || can("tenant:manage_settings") ? block("Team & setup", team) : ""}
      ${block("Account", account)}
      <button class="btn" id="out" style="background:var(--teal-soft);color:var(--teal)">Sign out</button>
    </div>
    ${dock("more")}
  </section>`;
  app.querySelector("#out").onclick = logout;
}

async function ping() {
  const el = document.getElementById("live-status");
  try {
    const res = await fetch(`${API.replace(/\/api\/v1$/, "")}/api/v1/health/live`, { headers: { Accept: "application/json" } });
    el.textContent = res.ok ? "API is online" : "API responded with an error";
    el.style.color = res.ok ? "var(--success)" : "var(--danger)";
  } catch {
    el.textContent = "API offline — start apps/api on port 3000";
    el.style.color = "var(--danger)";
  }
}

async function render() {
  const mine = ++renderGen;
  const route = parseHash();
  if (!session && route.name !== "login" && route.name !== "forgot" && route.name !== "reset") {
    renderLogin();
    return;
  }
  const map = {
    login: renderLogin,
    forgot: renderForgot,
    reset: renderReset,
    dashboard: renderDashboard,
    staffDash: () => api("/dashboard/me").then((data) => {
      app.innerHTML = `${bar("My dashboard", { backTo: "/dashboard" })}<div class="scroll no-dock">${reportView(data)}</div>${dock("dashboard")}`;
    }).catch((error) => {
      app.innerHTML = fail("My dashboard", error);
      app.querySelector("#retry").onclick = () => render();
    }),
    leads: renderLeads,
    leadForm: renderLeadForm,
    leadDetail: renderLeadDetail,
    mtd: renderMtd,
    performance: renderPerformance,
    performanceDetail: renderPerformanceDetail,
    warranties: renderWarranties,
    warrantyForm: renderWarrantyForm,
    warrantyDetail: renderWarrantyDetail,
    reports: renderReports,
    report: renderReport,
    more: renderMore,
    notifications: renderNotifications,
    search: renderSearch,
    followUps: () => renderList("Follow-ups", "/follow-ups", (item) => `/follow-ups/${item.id}`, `<button class="icon-btn" data-go="/follow-ups/new" style="color:var(--teal);width:auto;font-weight:700">＋</button>`),
    followUpForm: renderFollowUpForm,
    followUpDetail: renderFollowUpDetail,
    quotations: () => renderList("Quotations", "/quotations", (item) => `/quotations/${item.id}`, `<button class="icon-btn" data-go="/quotations/new" style="color:var(--teal);width:auto;font-weight:700">＋</button>`),
    quotationForm: renderQuotationForm,
    quotationDetail: renderQuotationDetail,
    visits: () => renderList("Site visits", "/site-visits", (item) => `/visits/${item.id}`, `<button class="icon-btn" data-go="/visits/new" style="color:var(--teal);width:auto;font-weight:700">＋</button>`),
    visitForm: renderVisitForm,
    visitDetail: renderVisitDetail,
    attendance: renderAttendance,
    pipeline: renderPipeline,
    staff: renderStaff,
    staffDetail: renderStaffDetail,
    staffForm: renderStaffForm,
    teams: renderTeams,
    teamForm: renderTeamForm,
    targets: renderTargets,
    targetDetail: renderTargetDetail,
    targetForm: renderTargetForm,
    catalog: renderCatalog,
    catalogKind: renderCatalogKind,
    generalSettings: renderGeneralSettings,
    taxesSettings: renderTaxesSettings,
    timeline: () => renderList("Timeline", "/timeline", (item) => item.leadId ? `/leads/${item.leadId}` : "/timeline"),
    sessions: renderSessions,
    password: renderPassword,
    roles: () => renderList("Roles", "/roles", () => "/roles"),
    analytics: () => api("/reports/analytics").then((data) => {
      app.innerHTML = `${bar("Analytics", { backTo: "/reports" })}<div class="scroll no-dock">${reportView(data)}</div>${dock("reports")}`;
    }).catch((error) => {
      app.innerHTML = fail("Analytics", error);
      app.querySelector("#retry").onclick = () => render();
    }),
    verify: renderVerify,
  };
  await (map[route.name] || renderDashboard)();
  if (mine !== renderGen) return;
}

if (!location.hash) location.hash = session ? "/dashboard" : "/login";
ping();
render();
