/* ============================================================
   WERKZEUGLISTE – Logik (Supabase)
   Optik/Verhalten analog Tankbuch
   ============================================================ */

// ---------- ZUGANGSDATEN (aus "API Daten.txt") ----------
const SUPABASE_URL      = "https://qnjdxajhlmixmfpimzkf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_3kG5HjJeEbvDBT1BKtGiEw_wID12RiX";

// WICHTIG: Nicht "supabase" benennen – das ist ein nicht-konfigurierbares
// globales Property der SDK. Stattdessen: "client"
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- SPALTEN-DEFINITIONEN ----------
const TABLES = {
  werkzeuge: {
    db: "werkzeuge",
    title: "Werkzeuge",
    columns: [
      { key: "hersteller",  label: "Hersteller",  type: "txt" },
      { key: "gerat",       label: "Gerät",       type: "txt" },
      { key: "bezeichnung", label: "Bezeichnung", type: "txt" },
      { key: "gewerk_art",  label: "Gewerk/Art",  type: "txt" },
      { key: "bemerkung",   label: "Bemerkung",   type: "txt" }
    ]
  },
  baumaterialien: {
    db: "baumaterialien",
    title: "Baumaterialien",
    columns: [
      { key: "hersteller",  label: "Hersteller",  type: "txt" },
      { key: "bezeichnung", label: "Bezeichnung", type: "txt" },
      { key: "gewerk_art",  label: "Gewerk/Art",  type: "txt" },
      { key: "menge",       label: "Menge",       type: "num" },
      { key: "einheit",     label: "Einheit",     type: "txt" },
      { key: "bemerkung",   label: "Bemerkung",   type: "txt" }
    ]
  }
};

const state = {
  tab: "werkzeuge",
  data:   { werkzeuge: [], baumaterialien: [] },
  search: ""
};

let currentRole = "reader";
let sheetTab = null;

/* ============================================================
   THEME (Dark/Light, gespeichert)
   ============================================================ */
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  const btn = document.getElementById("themeToggle");
  if (btn) btn.textContent = (t === "dark") ? "🌙" : "☀️";
}
function initTheme() {
  const saved = localStorage.getItem("wl-theme") || "dark";
  applyTheme(saved);
  document.getElementById("themeToggle").addEventListener("click", () => {
    const next = (document.documentElement.getAttribute("data-theme") === "dark") ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("wl-theme", next);
  });
}

/* ============================================================
   AUTH
   ============================================================ */
async function init() {
  initTheme();
  bindUI();
  const { data } = await client.auth.getSession();
  if (data?.session) showApp(data.session.user);
  else showLogin();

  client.auth.onAuthStateChange((_e, session) => {
    if (session) showApp(session.user);
    else showLogin();
  });
}

function showLogin() {
  document.getElementById("appScreen").style.display = "none";
  document.getElementById("loginScreen").style.display = "flex";
}

function showApp(user) {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("appScreen").style.display = "block";

  currentRole = (user?.app_metadata?.role === "editor") ? "editor" : "reader";
  document.getElementById("roleTag").textContent =
    (currentRole === "editor") ? "Editor" : "Nur Lesen";
  updateRoleUI();

  loadAll();
}

function updateRoleUI() {
  document.querySelectorAll(".editor-only").forEach(el => {
    el.style.display = (currentRole === "editor") ? "" : "none";
  });
}

async function loadAll() {
  await Promise.all([loadTable("werkzeuge"), loadTable("baumaterialien")]);
  render();
}

async function loadTable(tab) {
  const { data, error } = await client
    .from(TABLES[tab].db).select("*").order("id");
  if (error) { console.error(error); return; }
  state.data[tab] = data || [];
}

/* ============================================================
   UI-BINDINGS
   ============================================================ */
function bindUI() {
  // Login
  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email    = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPass").value;
    const errEl    = document.getElementById("loginError");
    errEl.textContent = "";
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) errEl.textContent = "Anmeldung fehlgeschlagen: " + error.message;
  });

  // Logout
  document.getElementById("logoutBtn").addEventListener("click", () => client.auth.signOut());

  // Tabs
  document.querySelectorAll("#tabTabs .vehicle-tab").forEach(tabEl => {
    tabEl.addEventListener("click", () => {
      state.tab = tabEl.dataset.tab;
      state.search = "";
      document.getElementById("searchBar").value = "";
      document.querySelectorAll("#tabTabs .vehicle-tab")
        .forEach(t => t.classList.toggle("active", t === tabEl));
      document.getElementById("sectionTitle").textContent = TABLES[state.tab].title;
      render();
    });
  });

  // Suche
  document.getElementById("searchBar").addEventListener("input", (e) => {
    state.search = e.target.value.trim().toLowerCase();
    render();
  });

  // FAB -> Bottom Sheet (nur Editor)
  document.getElementById("openSheet").addEventListener("click", () => {
    if (currentRole === "editor") openSheet(state.tab);
  });

  // Sheet schließen
  document.getElementById("sheetClose").addEventListener("click", closeSheet);
  document.getElementById("sheetOverlay").addEventListener("click", (e) => {
    if (e.target.id === "sheetOverlay") closeSheet();
  });

  // Eintrag speichern
  document.getElementById("sheetForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const obj = {};
    TABLES[sheetTab].columns.forEach(c => {
      const val = form.elements[c.key].value.trim();
      if (c.type === "num") obj[c.key] = (val === "" ? null : Number(val));
      else obj[c.key] = val;
    });
    const { error } = await client.from(TABLES[sheetTab].db).insert(obj);
    if (error) { alert("Fehler: " + error.message); return; }
    closeSheet();
    await loadTable(sheetTab);
    render();
  });
}

/* ============================================================
   RENDER
   ============================================================ */
function matchesSearch(row, tab) {
  const q = state.search;
  if (!q) return true;
  return TABLES[tab].columns.some(c =>
    (row[c.key] ?? "").toString().toLowerCase().includes(q));
}

function render() {
  const tab    = state.tab;
  const wrap   = document.getElementById("tableWrap");
  const empty  = document.getElementById("emptyState");
  const status = document.getElementById("status");
  const rows   = state.data[tab].filter(r => matchesSearch(r, tab));

  status.textContent = rows.length + " Einträge";

  if (!rows.length) {
    wrap.style.display = "none";
    empty.style.display = "block";
    return;
  }
  wrap.style.display = "block";
  empty.style.display = "none";

  let html = '<table class="entry-table"><thead><tr>';
  TABLES[tab].columns.forEach(c => {
    html += `<th class="${c.type === 'txt' ? 'txt' : ''}">${c.label}</th>`;
  });
  if (currentRole === "editor") html += "<th></th>";
  html += "</tr></thead><tbody>";

  rows.forEach(row => {
    html += "<tr>";
    TABLES[tab].columns.forEach(c => {
      const val = row[c.key] ?? "";
      html += `<td class="${c.type === 'txt' ? 'txt' : ''}">${escapeHtml(val)}</td>`;
    });
    if (currentRole === "editor") {
      html += `<td><button class="entry-del" data-id="${row.id}" title="Löschen">🗑</button></td>`;
    }
    html += "</tr>";
  });
  html += "</tbody></table>";
  wrap.innerHTML = html;

  wrap.querySelectorAll(".entry-del").forEach(btn => {
    btn.addEventListener("click", () => deleteRow(tab, Number(btn.dataset.id)));
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[m]);
}

async function deleteRow(tab, id) {
  if (!confirm("Eintrag wirklich löschen?")) return;
  const { error } = await client.from(TABLES[tab].db).delete().eq("id", id);
  if (error) { alert("Fehler: " + error.message); return; }
  state.data[tab] = state.data[tab].filter(r => r.id !== id);
  render();
}

/* ============================================================
   BOTTOM SHEET (Neu anlegen)
   ============================================================ */
function openSheet(tab) {
  sheetTab = tab;
  document.getElementById("sheetTitle").textContent =
    tab === "werkzeuge" ? "Neues Werkzeug" : "Neues Baumaterial";

  const form = document.getElementById("sheetForm");
  form.innerHTML = "";
  TABLES[tab].columns.forEach(c => {
    const label = document.createElement("label");
    label.className = (c.type === "txt") ? "full" : "";
    const type = (c.type === "num") ? "number" : "text";
    const inp = document.createElement("input");
    inp.name = c.key;
    inp.type = type;
    if (c.type === "num") inp.step = "any";
    label.textContent = c.label + "\n";
    label.appendChild(inp);
    form.appendChild(label);
  });
  const btn = document.createElement("button");
  btn.type = "submit";
  btn.className = "sheet-submit";
  btn.textContent = "Speichern";
  form.appendChild(btn);

  document.getElementById("sheetOverlay").style.display = "flex";
}

function closeSheet() {
  document.getElementById("sheetOverlay").style.display = "none";
}

/* ============================================================
   START
   ============================================================ */
init();
