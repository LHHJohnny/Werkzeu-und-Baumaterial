import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/* ============================================================
   WERKZEUGLISTE – Logik (Supabase)
   ============================================================ */

// ---------- ZUGANGSDATEN ----------
const SUPABASE_URL      = "https://qnjdxajhlmixmfpimzkf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_3kG5HjJeEbvDBT1BKtGiEw_wID12RiX";

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- SPALTEN-DEFINITIONEN ----------
// layout: "pair" = halbe Breite (2er-Reihe), "full" = ganze Breite
const TABLES = {
  werkzeuge: {
    db: "werkzeuge",
    title: "Werkzeuge",
    columns: [
      { key: "hersteller",    label: "Hersteller",    type: "txt",  layout: "pair" },
      { key: "gerat",         label: "Gerät",         type: "txt",  layout: "pair" },
      { key: "bezeichnung",   label: "Bezeichnung",   type: "txt",  layout: "pair" },
      { key: "gewerk_art",    label: "Gewerk/Art",    type: "txt",  layout: "pair" },
      { key: "verliehen_an",  label: "Verliehen an",  type: "txt",  layout: "pair" },
      { key: "bemerkung",     label: "Bemerkung",     type: "txt",  layout: "full" }
    ]
  },
  baumaterialien: {
    db: "baumaterialien",
    title: "Baumaterialien",
    columns: [
      { key: "bezeichnung", label: "Bezeichnung", type: "txt",  layout: "pair" },
      { key: "gewerk_art",  label: "Gewerk/Art",  type: "txt",  layout: "pair" },
      { key: "menge",       label: "Menge",       type: "num",  layout: "pair" },
      { key: "einheit",     label: "Einheit",     type: "txt",  layout: "pair" },
      { key: "abmessungen", label: "Abmessungen", type: "txt",  layout: "full" },
      { key: "hersteller",  label: "Hersteller",  type: "txt",  layout: "pair" },
      { key: "bezogen_am",  label: "Bezogen am",  type: "date", layout: "pair" },
      { key: "bemerkung",   label: "Bemerkung",   type: "txt",  layout: "full" }
    ]
  }
};

const state = {
  tab: "werkzeuge",
  data:   { werkzeuge: [], baumaterialien: [] },
  search: "",
  sort:   { key: null, dir: 1 }
};

let currentRole = "reader";
let sheetTab = null;
let editingId = null;

/* ============================================================
   THEME
   ============================================================ */
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  const btn = document.getElementById("themeToggle");
  if (btn) btn.textContent = (t === "dark") ? "🌙" : "☀️";
}
function initTheme() {
  const saved = localStorage.getItem("wl-theme") || "dark";
  applyTheme(saved);
  const btn = document.getElementById("themeToggle");
  if (btn) btn.addEventListener("click", () => {
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

  currentRole = (user?.user_metadata?.role === "editor") ? "editor" : "reader";
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
  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email    = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPass").value;
    const errEl    = document.getElementById("loginError");
    errEl.textContent = "";
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) errEl.textContent = "Anmeldung fehlgeschlagen: " + error.message;
  });

  document.getElementById("logoutBtn").addEventListener("click", () => client.auth.signOut());

  document.querySelectorAll("#tabTabs .vehicle-tab").forEach(tabEl => {
    tabEl.addEventListener("click", () => {
      state.tab = tabEl.dataset.tab;
      state.search = "";
      state.sort = { key: null, dir: 1 };
      document.getElementById("searchBar").value = "";
      document.querySelectorAll("#tabTabs .vehicle-tab")
        .forEach(t => t.classList.toggle("active", t === tabEl));
      document.getElementById("sectionTitle").textContent = TABLES[state.tab].title;
      render();
    });
  });

  document.getElementById("searchBar").addEventListener("input", (e) => {
    state.search = e.target.value.trim().toLowerCase();
    render();
  });

  document.getElementById("openSheet").addEventListener("click", () => {
    if (currentRole === "editor") openSheet(state.tab, null);
  });

  document.getElementById("sheetClose").addEventListener("click", closeSheet);
  document.getElementById("sheetOverlay").addEventListener("click", (e) => {
    if (e.target.id === "sheetOverlay") closeSheet();
  });

  document.getElementById("sheetForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const obj = {};
    TABLES[sheetTab].columns.forEach(c => {
      const raw = form.elements[c.key].value.trim();
      if (c.type === "num")  obj[c.key] = (raw === "" ? null : Number(raw));
      else if (c.type === "date") obj[c.key] = (raw === "" ? null : raw);
      else obj[c.key] = (raw === "" ? null : raw);
    });

    let error;
    if (editingId !== null) {
      const res = await client.from(TABLES[sheetTab].db)
        .update(obj).eq("id", editingId);
      error = res.error;
    } else {
      const res = await client.from(TABLES[sheetTab].db).insert(obj);
      error = res.error;
    }
    if (error) { alert("Fehler: " + error.message); return; }
    closeSheet();
    await loadTable(sheetTab);
    render();
  });
}

/* ============================================================
   SORTIEREN
   ============================================================ */
function sortRows(rows, tab) {
  const s = state.sort;
  if (!s.key) return rows;
  const col  = TABLES[tab].columns.find(c => c.key === s.key);
  const type = col ? col.type : "txt";
  return [...rows].sort((a, b) => {
    let va = (a[s.key] == null) ? "" : a[s.key];
    let vb = (b[s.key] == null) ? "" : b[s.key];
    let r;
    if (type === "num") {
      r = (Number(va) || 0) - (Number(vb) || 0);
    } else {
      r = String(va).localeCompare(String(vb), "de", { sensitivity: "base" });
    }
    return r * s.dir;
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
  const rows   = sortRows(state.data[tab].filter(r => matchesSearch(r, tab)), tab);

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
    const active = state.sort.key === c.key;
    const ind = active
      ? `<span class="sort-ind">${state.sort.dir === 1 ? "▲" : "▼"}</span>`
      : "";
    html += `<th class="sortable ${c.type === 'txt' ? 'txt' : ''}" data-key="${c.key}">${c.label}${ind}</th>`;
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
      html += `<td class="actions">
        <button class="entry-edit" data-id="${row.id}" title="Ändern">✏️</button>
        <button class="entry-del"  data-id="${row.id}" title="Löschen">🗑</button>
      </td>`;
    }
    html += "</tr>";
  });
  html += "</tbody></table>";
  wrap.innerHTML = html;

  wrap.querySelectorAll("th.sortable").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (state.sort.key === key) state.sort.dir *= -1;
      else state.sort = { key, dir: 1 };
      render();
    });
  });

  if (currentRole === "editor") {
    wrap.querySelectorAll(".entry-del").forEach(btn => {
      btn.addEventListener("click", () => deleteRow(tab, Number(btn.dataset.id)));
    });
    wrap.querySelectorAll(".entry-edit").forEach(btn => {
      btn.addEventListener("click", () => {
        const row = state.data[tab].find(r => r.id === Number(btn.dataset.id));
        if (row) openSheet(tab, row);
      });
    });
  }
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
   BOTTOM SHEET (anlegen + ändern)
   ============================================================ */
function openSheet(tab, row) {
  sheetTab = tab;
  editingId = row ? row.id : null;
  document.getElementById("sheetTitle").textContent =
    row
      ? "Eintrag ändern"
      : (tab === "werkzeuge" ? "Neues Werkzeug" : "Neues Baumaterial");

  const form = document.getElementById("sheetForm");
  form.innerHTML = "";
  TABLES[tab].columns.forEach(c => {
    const label = document.createElement("label");
    label.className = (c.layout === "full") ? "full" : "";

    let field;
    if (c.type === "num") {
      field = document.createElement("input");
      field.type = "text";
      field.inputMode = "decimal";
      field.placeholder = "z. B. 2,5";
    } else if (c.type === "date") {
      field = document.createElement("input");
      field.type = "date";
    } else {
      field = document.createElement("input");
      field.type = "text";
      if (c.key === "bemerkung") field.placeholder = "optional";
    }
    field.name = c.key;
    if (row) field.value = (row[c.key] == null) ? "" : row[c.key];

    const labelText = document.createElement("span");
    labelText.textContent = c.label;
    label.appendChild(labelText);
    label.appendChild(field);
    form.appendChild(label);
  });

  const btn = document.createElement("button");
  btn.type = "submit";
  btn.className = "sheet-submit";
  btn.textContent = row ? "Speichern" : "Anlegen";
  form.appendChild(btn);

  document.getElementById("sheetOverlay").style.display = "flex";
}

function closeSheet() {
  document.getElementById("sheetOverlay").style.display = "none";
  editingId = null;
}

/* ============================================================
   START
   ============================================================ */
init();
