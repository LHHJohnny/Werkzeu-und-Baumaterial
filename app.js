/* ============================================================
   WERKZUGLISTE – Logik (Supabase)
   ============================================================ */

// ---------- ZUGANGSDATEN (aus "API Daten.txt") [1] ----------
// Hinweis: createClient braucht die BASIS-URL (ohne /rest/v1/)
const SUPABASE_URL      = "https://qnjdxajhlmixmfpimzkf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_3kG5HjJeEbvDBT1BKtGiEw_wID12RiX";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Spalten pro Tabelle
const TABLES = {
  werkzeuge: {
    db: "werkzeuge",
    columns: [
      { key: "hersteller",  label: "Hersteller"  },
      { key: "gerat",       label: "Gerät"       },
      { key: "bezeichnung", label: "Bezeichnung" },
      { key: "gewerk_art",  label: "Gewerk/Art"  },
      { key: "bemerkung",   label: "Bemerkung"   }
    ]
  },
  baumaterialien: {
    db: "baumaterialien",
    columns: [
      { key: "hersteller",  label: "Hersteller"  },
      { key: "bezeichnung", label: "Bezeichnung" },
      { key: "gewerk_art",  label: "Gewerk/Art"  },
      { key: "menge",       label: "Menge"       },
      { key: "einheit",     label: "Einheit"     },
      { key: "bemerkung",   label: "Bemerkung"   }
    ]
  }
};

const state = {
  tab: "werkzeuge",
  data:   { werkzeuge: [], baumaterialien: [] },
  search: { werkzeuge: "", baumaterialien: "" }
};

let currentRole = "reader"; // default = nur lesen
let modalTab = null;

/* ============================================================
   AUTH
   ============================================================ */
async function init() {
  bindUI();
  const { data } = await supabase.auth.getSession();
  if (data?.session) showApp(data.session.user);
  else showLogin();

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) showApp(session.user);
    else showLogin();
  });
}

function showLogin() {
  document.getElementById("app-view").classList.add("hidden");
  document.getElementById("login-view").classList.remove("hidden");
}

function showApp(user) {
  document.getElementById("login-view").classList.add("hidden");
  document.getElementById("app-view").classList.remove("hidden");
  document.getElementById("user-email").textContent = user.email;

  currentRole = getUserRole(user);
  updateRoleUI();

  loadAll();
}

function getUserRole(user) {
  // Rolle kommt aus dem JWT -> app_metadata (gesetzt via RLS/SQL)
  return user?.app_metadata?.role === "editor" ? "editor" : "reader";
}

function updateRoleUI() {
  const isEditor = currentRole === "editor";
  const badge = document.getElementById("role-badge");
  badge.textContent = isEditor ? "Editor" : "Nur Lesen";
  badge.className = "badge " + (isEditor ? "badge-editor" : "badge-reader");

  // + Button nur für Editor
  document.querySelectorAll(".editor-only").forEach(el => {
    el.style.display = isEditor ? "" : "none";
  });
}

async function loadAll() {
  await Promise.all([loadTable("werkzeuge"), loadTable("baumaterialien")]);
  render();
}

async function loadTable(tab) {
  const { data, error } = await supabase
    .from(TABLES[tab].db).select("*").order("id");
  if (error) { console.error(error); return; }
  state.data[tab] = data || [];
}

/* ============================================================
   UI-BINDINGS
   ============================================================ */
function bindUI() {
  // Login
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email    = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const errEl    = document.getElementById("login-error");
    errEl.textContent = "";
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) errEl.textContent = "Anmeldung fehlgeschlagen: " + error.message;
  });

  // Logout
  document.getElementById("logout-btn").addEventListener("click", () => supabase.auth.signOut());

  // Tabs
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      state.tab = btn.dataset.tab;
      switchTab();
    });
  });

  // Suche + Anlegen
  ["werkzeuge", "baumaterialien"].forEach(tab => {
    document.getElementById("search-" + tab).addEventListener("input", (e) => {
      state.search[tab] = e.target.value.trim().toLowerCase();
      render();
    });
    document.getElementById("add-" + tab).addEventListener("click", () => {
      if (currentRole === "editor") openAddModal(tab);
    });
  });

  // Modal schließen
  document.getElementById("modal-close").addEventListener("click", closeAddModal);
  document.getElementById("modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") closeAddModal();
  });

  // Eintrag speichern
  document.getElementById("add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const obj = {};
    TABLES[modalTab].columns.forEach(c => {
      const val = form.elements[c.key].value.trim();
      obj[c.key] = (c.key === "menge") ? (val === "" ? null : Number(val)) : val;
    });
    const { error } = await supabase.from(TABLES[modalTab].db).insert(obj);
    if (error) { alert("Fehler: " + error.message); return; }
    closeAddModal();
    await loadTable(modalTab);
    render();
  });
}

function switchTab() {
  document.querySelectorAll(".tab").forEach(b =>
    b.classList.toggle("active", b.dataset.tab === state.tab));
  document.getElementById("tab-werkzeuge").classList.toggle("hidden", state.tab !== "werkzeuge");
  document.getElementById("tab-baumaterialien").classList.toggle("hidden", state.tab !== "baumaterialien");
}

/* ============================================================
   RENDER
   ============================================================ */
function matchesSearch(row, tab) {
  const q = state.search[tab];
  if (!q) return true;
  return TABLES[tab].columns.some(c =>
    (row[c.key] ?? "").toString().toLowerCase().includes(q));
}

function render() {
  ["werkzeuge", "baumaterialien"].forEach(tab => {
    const tbody = document.getElementById("rows-" + tab);
    const rows  = state.data[tab].filter(r => matchesSearch(r, tab));
    tbody.innerHTML = "";

    rows.forEach(row => {
      const tr = document.createElement("tr");
      TABLES[tab].columns.forEach(c => {
        const td = document.createElement("td");
        td.textContent = row[c.key] ?? "";
        tr.appendChild(td);
      });
      const tdDel = document.createElement("td");
      tdDel.className = "cell-actions";
      if (currentRole === "editor") {
        const btn = document.createElement("button");
        btn.className = "btn-icon";
        btn.textContent = "🗑";
        btn.title = "Löschen";
        btn.onclick = () => deleteRow(tab, row.id);
        tdDel.appendChild(btn);
      }
      tr.appendChild(tdDel);
      tbody.appendChild(tr);
    });

    if (!rows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = TABLES[tab].columns.length + 1;
      td.className = "empty";
      td.textContent = "Keine Einträge gefunden.";
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  });
}

async function deleteRow(tab, id) {
  if (!confirm("Eintrag wirklich löschen?")) return;
  const { error } = await supabase.from(TABLES[tab].db).delete().eq("id", id);
  if (error) { alert("Fehler: " + error.message); return; }
  state.data[tab] = state.data[tab].filter(r => r.id !== id);
  render();
}

/* ============================================================
   MODAL (Eintrag anlegen)
   ============================================================ */
function openAddModal(tab) {
  modalTab = tab;
  document.getElementById("modal-title").textContent =
    tab === "werkzeuge" ? "Neues Werkzeug" : "Neues Baumaterial";

  const form = document.getElementById("add-form");
  form.innerHTML = "";
  TABLES[tab].columns.forEach(c => {
    const div = document.createElement("div");
    div.className = "field";
    const type = (c.key === "menge") ? "number" : "text";
    div.innerHTML = `<label>${c.label}</label>
      <input name="${c.key}" type="${type}" step="any">`;
    form.appendChild(div);
  });
  const btn = document.createElement("button");
  btn.type = "submit";
  btn.className = "btn btn-primary";
  btn.textContent = "Speichern";
  form.appendChild(btn);

  document.getElementById("modal").classList.remove("hidden");
}

function closeAddModal() {
  document.getElementById("modal").classList.add("hidden");
}

/* ============================================================
   START
   ============================================================ */
init();
