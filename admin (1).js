import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
  setPersistence, browserSessionPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, orderBy, limit, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  firebaseConfig, OWNER_EMAIL, DEFAULT_WA, SITE_URL, esc, fmt, money, isImg, dayKey, digits, validWa,
  safeUrl, FB_HOSTS, compressImage
} from "./common.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

const $ = (id) => document.getElementById(id);
const ICONS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  circle: '<circle cx="12" cy="12" r="9"/>'
};
const ic = (n, s = 18) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3800);
}

/* ===== État ===== */
const S = {
  user: null, role: null, products: [], orders: [], stats: {}, settings: {}, admins: [], log: [],
  tab: "dash", period: 14, unsubs: []
};
const isOwner = () => S.role === "owner";
const ms = (x) => x.createdAt?.toMillis?.() ?? 0;
const snapDocs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));
const num = (v) => { const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? n : NaN; };
const slug = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const hashtag = (s) => "#" + String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]/g, "");
const dateFr = (t) => (t ? new Date(t).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "");
const STATUS = { new: "Nouvelle", confirmed: "Confirmée", delivered: "Livrée", cancelled: "Annulée" };
const SOURCES = { whatsapp: "WhatsApp direct", facebook: "Facebook", other: "Autre" };

function download(name, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
const cell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;           // protège contre l'injection de formules
  return `"${s.replace(/"/g, '""')}"`;
};
const csv = (rows) => "\uFEFF" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast("Copié"); return; } catch { /* repli */ }
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { /* ignoré */ }
  ta.remove();
  toast(ok ? "Copié" : "Copie impossible, sélectionnez le texte à la main.");
}
function openExternal(url) {
  const a = document.createElement("a");
  a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
  document.body.appendChild(a); a.click(); a.remove();
}

/* ===== Statistiques ===== */
function daysList(n, offset = 0) {
  const out = [];
  for (let i = offset + n - 1; i >= offset; i--) out.push(dayKey(new Date(Date.now() - i * 864e5)));
  return out;
}
function periodStats(n, offset = 0) {
  const ds = daysList(n, offset);
  const r = { ds, v: 0, vf: 0, w: 0, wf: 0 };
  ds.forEach((d) => { const s = S.stats[d] || {}; r.v += s.visits || 0; r.vf += s.visitsFb || 0; r.w += s.waClicks || 0; r.wf += s.waClicksFb || 0; });
  return r;
}
const delta = (a, b) => {
  if (!b) return "";
  const d = Math.round(((a - b) / b) * 100);
  return `<span class="k-d ${d >= 0 ? "up" : "down"}">${d >= 0 ? "+" : ""}${d} % sur la période précédente</span>`;
};
const live = () => S.products.filter((p) => p.active !== false);
const hasPhoto = (p) => isImg(p.imageUrl);

/* ===== Onglets ===== */
const MODS = {};
const TABS = [["dash", "Tableau de bord"], ["products", "Produits"], ["orders", "Commandes"], ["fb", "Facebook"], ["settings", "Réglages", true], ["access", "Accès et sécurité"]];

function paintTabs() {
  $("tabs").innerHTML = TABS.filter((t) => !t[2] || isOwner()).map((t) =>
    `<button role="tab" type="button" data-act="tab" data-v="${t[0]}" aria-selected="${S.tab === t[0]}">${t[1]}</button>`).join("");
}
function setTab(t) {
  if (!MODS[t] || (TABS.find((x) => x[0] === t)[2] && !isOwner())) t = "dash";
  S.tab = t;
  paintTabs();
  $("panel").innerHTML = MODS[t].html();
  if (MODS[t].mount) MODS[t].mount();
  if (MODS[t].update) MODS[t].update();
  window.scrollTo(0, 0);
}
function refresh() { const m = MODS[S.tab]; if (m && m.update) m.update(); }

/* ================= Tableau de bord ================= */
MODS.dash = {
  html: () => `<div class="row between"><h2>Vue d'ensemble</h2><div class="seg" role="group" aria-label="Période">${[7, 14, 30].map((n) => `<button type="button" data-act="period" data-v="${n}" aria-pressed="${S.period === n}">${n} jours</button>`).join("")}</div></div>
<div id="d-kpi" class="kpis"></div>
<div class="panel"><h3>Visites et clics WhatsApp</h3><div id="d-chart"></div></div>
<div class="cols2"><div class="panel"><h3>Produits les plus demandés</h3><div id="d-top"></div></div><div class="panel"><h3>À traiter</h3><ul id="d-alerts" class="plain"></ul></div></div>
<div class="panel"><h3>Santé de la boutique</h3><div id="d-health"></div></div>`,
  update() {
    if (!$("d-kpi")) return;
    const n = S.period, cur = periodStats(n), prev = periodStats(n, n);
    const first = cur.ds[0];
    const ords = S.orders.filter((o) => o.date >= first);
    const paid = ords.filter((o) => o.status === "confirmed" || o.status === "delivered");
    const rev = paid.reduce((t, o) => t + (Number(o.total) || 0), 0);
    const prevOrds = S.orders.filter((o) => o.date >= prev.ds[0] && o.date < first && (o.status === "confirmed" || o.status === "delivered"));
    const prevRev = prevOrds.reduce((t, o) => t + (Number(o.total) || 0), 0);
    const lv = live(), stockVal = lv.reduce((t, p) => t + (typeof p.stock === "number" ? (Number(p.price) || 0) * p.stock : 0), 0);
    const K = (l, v, d = "") => `<div class="kpi"><span class="k-l">${l}</span><strong>${v}</strong>${d}</div>`;
    $("d-kpi").innerHTML =
      K("Visites", fmt(cur.v), delta(cur.v, prev.v)) +
      K("Clics WhatsApp", fmt(cur.w), delta(cur.w, prev.w)) +
      K("Taux de clic", cur.v ? `${Math.round((cur.w / cur.v) * 100)} %` : "-", '<span class="k-d">clics divisés par visites</span>') +
      K("Visites depuis Facebook", fmt(cur.vf), `<span class="k-d">${cur.v ? Math.round((cur.vf / cur.v) * 100) : 0} % des visites</span>`) +
      K("Commandes notées", fmt(ords.filter((o) => o.status !== "cancelled").length), `<span class="k-d">${paid.length} confirmée(s) ou livrée(s)</span>`) +
      K("Chiffre d'affaires", money(rev), delta(rev, prevRev)) +
      K("Panier moyen", paid.length ? money(Math.round(rev / paid.length)) : "-") +
      K("Produits publiés", fmt(lv.length), `<span class="k-d">${S.products.length - lv.length} masqué(s)</span>`) +
      K("Valeur du stock", money(stockVal), '<span class="k-d">produits publiés avec stock suivi</span>');

    /* graphique */
    const ds = cur.ds, W = 640, H = 210, L = 34, B = 24, T = 10;
    const mx = Math.max(1, ...ds.map((d) => Math.max((S.stats[d] || {}).visits || 0, (S.stats[d] || {}).waClicks || 0)));
    const bw = (W - L) / ds.length, gw = Math.max(2, bw * 0.38);
    let g = "";
    for (let i = 0; i <= 4; i++) {
      const y = T + ((H - T - B) * i) / 4;
      g += `<line x1="${L}" x2="${W}" y1="${y}" y2="${y}" class="gl"/><text x="${L - 6}" y="${y + 4}" class="axis" text-anchor="end">${Math.round(mx - (mx * i) / 4)}</text>`;
    }
    ds.forEach((d, i) => {
      const s = S.stats[d] || {}, x = L + i * bw + bw * 0.1;
      const hv = ((s.visits || 0) / mx) * (H - T - B), hc = ((s.waClicks || 0) / mx) * (H - T - B);
      g += `<rect x="${x.toFixed(1)}" y="${(H - B - hv).toFixed(1)}" width="${gw.toFixed(1)}" height="${hv.toFixed(1)}" class="bar-v"><title>${d} : ${s.visits || 0} visite(s)</title></rect>`;
      g += `<rect x="${(x + gw + 1).toFixed(1)}" y="${(H - B - hc).toFixed(1)}" width="${gw.toFixed(1)}" height="${hc.toFixed(1)}" class="bar-c"><title>${d} : ${s.waClicks || 0} clic(s) WhatsApp</title></rect>`;
      if (ds.length <= 14 || i % Math.ceil(ds.length / 10) === 0) g += `<text x="${(x + gw).toFixed(1)}" y="${H - 6}" class="axis" text-anchor="middle">${d.slice(8)}/${d.slice(5, 7)}</text>`;
    });
    $("d-chart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Histogramme des visites et des clics WhatsApp par jour">${g}</svg>
<p class="legend"><span class="sw v"></span>Visites <span class="sw c"></span>Clics WhatsApp</p>
<details><summary>Voir les chiffres jour par jour</summary><div class="table-wrap"><table><thead><tr><th>Jour</th><th>Visites</th><th>Dont Facebook</th><th>Clics WhatsApp</th></tr></thead><tbody>${ds.slice().reverse().map((d) => { const s = S.stats[d] || {}; return `<tr><td>${d}</td><td>${s.visits || 0}</td><td>${s.visitsFb || 0}</td><td>${s.waClicks || 0}</td></tr>`; }).join("")}</tbody></table></div></details>`;

    /* produits les plus demandés */
    const top = S.products.filter((p) => p.clicks > 0).sort((a, b) => b.clicks - a.clicks).slice(0, 5);
    const topMax = top.length ? top[0].clicks : 1;
    $("d-top").innerHTML = top.length ? top.map((p) => `<div class="toprow"><span>${esc(p.name)}</span><progress max="${topMax}" value="${p.clicks}"></progress><span class="small">${p.clicks} clic(s)${p.clicksFb ? `, dont ${p.clicksFb} Facebook` : ""}</span></div>`).join("") : '<p class="small">Aucun clic pour le moment.</p>';

    /* alertes */
    const A = [], goto = (v, t) => `<button type="button" class="link" data-act="goto" data-v="${v}">${t}</button>`;
    const out = lv.filter((p) => p.stock === 0), low = lv.filter((p) => typeof p.stock === "number" && p.stock > 0 && p.stock <= 3);
    const noPh = lv.filter((p) => !hasPhoto(p)), noDesc = lv.filter((p) => !p.description);
    const cold = lv.filter((p) => !(p.clicks > 0) && ms(p) && Date.now() - ms(p) > 14 * 864e5);
    const newOrd = S.orders.filter((o) => o.status === "new");
    if (S.settings.paused) A.push(`La boutique est en pause : les clients ne peuvent pas commander. ${isOwner() ? goto("settings", "Réglages") : ""}`);
    if (newOrd.length) A.push(`${newOrd.length} commande(s) à traiter. ${goto("orders", "Voir les commandes")}`);
    if (out.length) A.push(`En rupture : ${esc(out.map((p) => p.name).join(", "))}`);
    if (low.length) A.push(`Stock bas (3 ou moins) : ${esc(low.map((p) => `${p.name} (${p.stock})`).join(", "))}`);
    if (noPh.length) A.push(`Sans photo : ${esc(noPh.map((p) => p.name).join(", "))}`);
    if (noDesc.length) A.push(`Sans description : ${esc(noDesc.map((p) => p.name).join(", "))}`);
    if (cold.length) A.push(`Aucun clic depuis plus de 14 jours : ${esc(cold.map((p) => p.name).join(", "))}. ${goto("fb", "Les promouvoir sur Facebook")}`);
    if (S.products.length - lv.length) A.push(`${S.products.length - lv.length} produit(s) masqué(s), invisibles pour les clients.`);
    $("d-alerts").innerHTML = (A.length ? A : ["Rien à signaler."]).map((x) => `<li>${x}</li>`).join("");

    /* santé */
    const s = S.settings;
    const H2 = [
      [validWa(s.whatsapp || DEFAULT_WA), "Numéro WhatsApp valide"],
      [lv.length > 0, "Au moins un produit publié"],
      [lv.length > 0 && !noPh.length, "Chaque produit publié a une photo"],
      [lv.length > 0 && !noDesc.length, "Chaque produit publié a une description"],
      [!!safeUrl(s.facebook, FB_HOSTS), "Page Facebook renseignée dans les Réglages"],
      [!!s.address, "Adresse de la boutique renseignée"],
      [!!s.email, "Adresse e-mail de contact renseignée"],
      [!s.paused, "Boutique ouverte (pas en pause)"]
    ];
    const ok = H2.filter((x) => x[0]).length;
    $("d-health").innerHTML = `<p><strong>${Math.round((ok / H2.length) * 100)} %</strong> des points sont en place.</p><progress max="${H2.length}" value="${ok}" class="wide"></progress><ul class="checks">${H2.map((x) => `<li class="${x[0] ? "ok" : "no"}">${ic(x[0] ? "check" : "circle")}<span>${x[1]}</span></li>`).join("")}</ul>`;
  }
};

/* ================= Produits ================= */
const PUI = { q: "", f: "all", s: "recent", edit: null, confirm: null };
const blankProduct = () => ({ id: null, name: "", category: "", price: "", oldPrice: "", stock: "", description: "", imageUrl: "", active: true, isNew: false });

MODS.products = {
  html: () => `<div class="toolbar"><input id="p-q" type="search" placeholder="Rechercher un produit" aria-label="Rechercher un produit">
<select id="p-f" aria-label="Filtrer"><option value="all">Tous</option><option value="live">Publiés</option><option value="hidden">Masqués</option><option value="out">En rupture</option><option value="nophoto">Sans photo</option></select>
<select id="p-s" aria-label="Trier"><option value="recent">Plus récents</option><option value="name">Nom</option><option value="asc">Prix croissant</option><option value="desc">Prix décroissant</option><option value="clicks">Plus de clics</option></select></div>
<div class="row"><button class="btn" type="button" data-act="p-new">Ajouter un produit</button><button class="btn ghost" type="button" data-act="p-csv">Exporter en CSV</button></div>
<div id="pform"></div><div id="plist"></div>`,
  mount() { $("p-q").value = PUI.q; $("p-f").value = PUI.f; $("p-s").value = PUI.s; this.form(); },
  form() {
    const e = PUI.edit, box = $("pform");
    if (!e) { box.innerHTML = ""; return; }
    const cats = [...new Set(S.products.map((p) => p.category).filter(Boolean))];
    box.innerHTML = `<div class="panel"><h3>${e.id ? "Modifier le produit" : "Nouveau produit"}</h3><div class="f">
<label>Nom du produit *<input id="pf-name" maxlength="120" value="${esc(e.name)}"></label>
<div class="grid2"><label>Catégorie<input id="pf-category" maxlength="60" list="cat-list" autocomplete="off" value="${esc(e.category)}"><datalist id="cat-list">${cats.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
<label>Prix (FCFA) *<input id="pf-price" type="number" inputmode="numeric" min="0" max="100000000" step="1" value="${esc(e.price)}"></label></div>
<div class="grid2"><label>Ancien prix (pour afficher une promotion)<input id="pf-old" type="number" inputmode="numeric" min="0" step="1" value="${esc(e.oldPrice)}"></label>
<label>Stock (vide si non suivi)<input id="pf-stock" type="number" inputmode="numeric" min="0" max="100000" step="1" value="${esc(e.stock)}"></label></div>
<label>Description<textarea id="pf-desc" maxlength="800">${esc(e.description)}</textarea></label>
<div class="photo"><div id="pf-prev" class="thumb big"></div><div class="f"><label>Photo depuis votre téléphone<input id="pf-file" type="file" accept="image/*"></label>
<label>ou adresse de la photo (https://...)<input id="pf-url" type="url" maxlength="500" placeholder="https://" value="${e.imageUrl && e.imageUrl.startsWith("https://") ? esc(e.imageUrl) : ""}"></label>
<div><button class="btn ghost small-btn" type="button" data-act="p-img-rm">Retirer la photo</button></div></div></div>
<label class="check"><input id="pf-active" type="checkbox" ${e.active ? "checked" : ""}>Publier sur la boutique</label>
<label class="check"><input id="pf-isnew" type="checkbox" ${e.isNew ? "checked" : ""}>Afficher le badge « Nouveau »</label>
<p id="pf-msg" class="msg" role="alert"></p>
<div class="row"><button class="btn" type="button" data-act="p-save">Enregistrer</button><button class="btn ghost" type="button" data-act="p-cancel">Annuler</button></div></div></div>`;
    this.prev();
  },
  prev() {
    const e = PUI.edit, b = $("pf-prev");
    if (!b || !e) return;
    b.innerHTML = isImg(e.imageUrl) ? `<img src="${esc(e.imageUrl)}" alt="Aperçu de la photo">` : '<span class="small">Pas de photo</span>';
  },
  update() { this.list(); },
  list() {
    const box = $("plist");
    if (!box) return;
    const q = PUI.q.trim().toLowerCase();
    let a = S.products.filter((p) => !q || `${p.name || ""} ${p.category || ""}`.toLowerCase().includes(q));
    if (PUI.f === "live") a = a.filter((p) => p.active !== false);
    if (PUI.f === "hidden") a = a.filter((p) => p.active === false);
    if (PUI.f === "out") a = a.filter((p) => p.stock === 0);
    if (PUI.f === "nophoto") a = a.filter((p) => !hasPhoto(p));
    const by = { name: (x, y) => String(x.name).localeCompare(String(y.name), "fr"), asc: (x, y) => x.price - y.price, desc: (x, y) => y.price - x.price, clicks: (x, y) => (y.clicks || 0) - (x.clicks || 0) };
    if (by[PUI.s]) a.sort(by[PUI.s]);
    if (!S.products.length) { box.innerHTML = '<div class="empty">Aucun produit. Touchez « Ajouter un produit » pour créer le premier.</div>'; return; }
    box.innerHTML = `<p class="small">${a.length} produit(s) affiché(s) sur ${S.products.length}.</p>` + a.map((p) => {
      const off = p.oldPrice > p.price;
      return `<div class="prow"><div class="thumb">${hasPhoto(p) ? `<img src="${esc(p.imageUrl)}" alt="" loading="lazy">` : ""}</div>
<div class="pinfo"><strong>${esc(p.name)}</strong><span class="small">${esc(p.category || "Sans catégorie")}, ${money(p.price)}${off ? ` (avant ${money(p.oldPrice)})` : ""}${typeof p.stock === "number" ? `, stock ${p.stock}` : ""}</span>
<span class="pills"><span class="pill ${p.active === false ? "off" : "on"}">${p.active === false ? "Masqué" : "Publié"}</span>${p.stock === 0 ? '<span class="pill warn">Rupture</span>' : ""}${p.isNew ? '<span class="pill">Nouveau</span>' : ""}${off ? '<span class="pill">Promo</span>' : ""}${hasPhoto(p) ? "" : '<span class="pill warn">Sans photo</span>'}</span>
<span class="small">${p.clicks || 0} clic(s) WhatsApp${p.clicksFb ? `, dont ${p.clicksFb} depuis Facebook` : ""}</span></div>
<div class="pact"><button class="btn ghost small-btn" type="button" data-act="p-edit" data-id="${esc(p.id)}">Modifier</button><button class="btn ghost small-btn" type="button" data-act="p-fb" data-id="${esc(p.id)}">Facebook</button><button class="btn ghost small-btn" type="button" data-act="p-toggle" data-id="${esc(p.id)}">${p.active === false ? "Publier" : "Masquer"}</button><button class="btn ghost small-btn" type="button" data-act="p-dup" data-id="${esc(p.id)}">Dupliquer</button>${PUI.confirm === p.id ? `<button class="btn danger small-btn" type="button" data-act="p-del-ok" data-id="${esc(p.id)}">Confirmer</button>` : `<button class="btn danger small-btn" type="button" data-act="p-del" data-id="${esc(p.id)}">Supprimer</button>`}</div></div>`;
    }).join("");
  }
};

function readProduct() {
  const e = PUI.edit, msg = (t) => { $("pf-msg").textContent = t; $("pf-msg").className = "msg err"; return null; };
  const name = e.name.trim();
  if (!name) return msg("Donnez un nom au produit.");
  const price = num(e.price);
  if (e.price === "" || !Number.isFinite(price) || price < 0 || price > 1e8) return msg("Indiquez un prix valide en FCFA.");
  let old = 0;
  if (String(e.oldPrice).trim() !== "") { old = num(e.oldPrice); if (!Number.isFinite(old) || old < 0 || old > 1e8) return msg("L'ancien prix n'est pas valide."); }
  let stock = null;
  if (String(e.stock).trim() !== "") { stock = num(e.stock); if (!Number.isInteger(stock) || stock < 0 || stock > 100000) return msg("Le stock doit être un nombre entier."); }
  if (e.imageUrl && !isImg(e.imageUrl)) return msg("L'adresse de la photo doit commencer par https://");
  return {
    name, category: e.category.trim().slice(0, 60), price: Math.round(price), oldPrice: Math.round(old), stock,
    description: e.description.trim().slice(0, 800), imageUrl: e.imageUrl || "", active: !!e.active, isNew: !!e.isNew
  };
}

/* ================= Commandes ================= */
const OUI = { q: "", f: "all", edit: null, confirm: null };
const blankOrder = () => ({ customer: "", phone: "", source: "whatsapp", status: "new", items: [], total: "", totalManual: false, note: "" });
const itemsTotal = (items) => items.reduce((t, i) => t + i.price * i.qty, 0);

MODS.orders = {
  html: () => `<p class="small">Notez ici les commandes reçues sur WhatsApp pour suivre vos ventes. Ces informations restent privées.</p>
<div class="toolbar"><input id="o-q" type="search" placeholder="Rechercher un client" aria-label="Rechercher une commande">
<select id="o-f" aria-label="Filtrer par statut"><option value="all">Toutes</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
<div class="row"><button class="btn" type="button" data-act="o-new">Ajouter une commande</button><button class="btn ghost" type="button" data-act="o-csv">Exporter en CSV</button></div>
<div id="oform"></div><div id="osum" class="kpis small-k"></div><div id="olist"></div>`,
  mount() { $("o-q").value = OUI.q; $("o-f").value = OUI.f; this.form(); },
  form() {
    const e = OUI.edit, box = $("oform");
    if (!e) { box.innerHTML = ""; return; }
    box.innerHTML = `<div class="panel"><h3>Nouvelle commande</h3><div class="f">
<div class="grid2"><label>Nom du client *<input id="of-customer" maxlength="80" value="${esc(e.customer)}"></label><label>Téléphone (facultatif)<input id="of-phone" maxlength="30" inputmode="tel" value="${esc(e.phone)}"></label></div>
<div class="grid2"><label>Origine<select id="of-source">${Object.entries(SOURCES).map(([k, v]) => `<option value="${k}"${e.source === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>
<label>Statut<select id="of-status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${e.status === k ? " selected" : ""}>${v}</option>`).join("")}</select></label></div>
<div class="grid2"><label>Produit<select id="of-prod"><option value="">Choisir un produit</option>${S.products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${money(p.price)})</option>`).join("")}</select></label>
<label>Quantité<input id="of-qty" type="number" min="1" max="999" step="1" value="1" inputmode="numeric"></label></div>
<div><button class="btn ghost small-btn" type="button" data-act="o-addline">Ajouter cette ligne</button></div>
<div id="of-lines"></div>
<label>Total (FCFA)<input id="of-total" type="number" min="0" step="1" inputmode="numeric" value="${esc(e.total)}"></label>
<label>Note (facultatif)<textarea id="of-note" maxlength="300">${esc(e.note)}</textarea></label>
<p id="of-msg" class="msg" role="alert"></p>
<div class="row"><button class="btn" type="button" data-act="o-save">Enregistrer la commande</button><button class="btn ghost" type="button" data-act="o-cancel">Annuler</button></div></div></div>`;
    this.lines();
  },
  lines() {
    const e = OUI.edit, b = $("of-lines");
    if (!e || !b) return;
    b.innerHTML = e.items.length ? `<ul class="plain">${e.items.map((i, k) => `<li>${i.qty} x ${esc(i.name)} (${money(i.price * i.qty)}) <button type="button" class="link" data-act="o-rmline" data-id="${k}">retirer</button></li>`).join("")}</ul>` : '<p class="small">Aucune ligne. Ajoutez au moins un produit, ou saisissez le total à la main.</p>';
    if (!e.totalManual) { e.total = e.items.length ? String(itemsTotal(e.items)) : ""; $("of-total").value = e.total; }
  },
  update() {
    const box = $("olist");
    if (!box) return;
    const q = OUI.q.trim().toLowerCase();
    const a = S.orders.filter((o) => (OUI.f === "all" || o.status === OUI.f) && (!q || `${o.customer || ""} ${o.phone || ""}`.toLowerCase().includes(q)));
    const paid = S.orders.filter((o) => o.status === "confirmed" || o.status === "delivered");
    $("osum").innerHTML = `<div class="kpi"><span class="k-l">Commandes</span><strong>${S.orders.length}</strong></div><div class="kpi"><span class="k-l">À traiter</span><strong>${S.orders.filter((o) => o.status === "new").length}</strong></div><div class="kpi"><span class="k-l">Chiffre d'affaires</span><strong>${money(paid.reduce((t, o) => t + (Number(o.total) || 0), 0))}</strong></div>`;
    box.innerHTML = a.length ? a.map((o) => {
      const canStock = (o.status === "confirmed" || o.status === "delivered") && !o.stockDeducted && (o.items || []).some((i) => { const p = S.products.find((x) => x.id === i.id); return p && typeof p.stock === "number"; });
      return `<div class="prow"><div class="pinfo"><strong>${esc(o.customer)}</strong><span class="small">${esc(o.date || "")}, ${esc(SOURCES[o.source] || "")}${o.phone ? `, ${esc(o.phone)}` : ""}</span>
<span class="small">${(o.items || []).map((i) => `${i.qty} x ${esc(i.name)}`).join(", ") || "Sans détail"}</span><strong>${money(o.total)}</strong>${o.note ? `<span class="small">${esc(o.note)}</span>` : ""}${o.stockDeducted ? '<span class="pill">Stock déduit</span>' : ""}</div>
<div class="pact"><select data-act="o-status" data-id="${esc(o.id)}" aria-label="Statut de la commande de ${esc(o.customer)}">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${o.status === k ? " selected" : ""}>${v}</option>`).join("")}</select>
${canStock ? `<button class="btn ghost small-btn" type="button" data-act="o-stock" data-id="${esc(o.id)}">Déduire du stock</button>` : ""}
${OUI.confirm === o.id ? `<button class="btn danger small-btn" type="button" data-act="o-del-ok" data-id="${esc(o.id)}">Confirmer</button>` : `<button class="btn danger small-btn" type="button" data-act="o-del" data-id="${esc(o.id)}">Supprimer</button>`}</div></div>`;
    }).join("") : '<div class="empty">Aucune commande à afficher.</div>';
  }
};

/* ================= Facebook ================= */
const FBU = { pid: "", style: "announce", paid: false, tags: true, caption: "" };
const fbLink = (p) => {
  const q = new URLSearchParams();
  if (p) q.set("p", p.id);
  q.set("utm_source", "facebook"); q.set("utm_medium", FBU.paid ? "paid" : "social"); q.set("utm_campaign", p ? slug(p.name) : "boutique");
  return `${SITE_URL}/?${q}`;
};
function genCaption() {
  const p = S.products.find((x) => x.id === FBU.pid), link = fbLink(p);
  const cta = `Pour commander, écrivez-nous sur WhatsApp ou passez commande ici : ${link}`;
  let t;
  if (!p) {
    t = `Découvrez toute la collection AETERNA STORE.\n\nCommande simple : vous choisissez, vous envoyez votre panier sur WhatsApp, nous confirmons avec vous la disponibilité, le prix et la livraison.\n\n${link}`;
  } else {
    const d = p.description ? `${p.description.replace(/\s+/g, " ").slice(0, 200)}\n\n` : "";
    const off = p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
    const stk = typeof p.stock === "number" && p.stock > 0 ? p.stock : 0;
    if (FBU.style === "promo") t = `${off ? `PROMO -${off} %` : "OFFRE"} : ${p.name}\n\n${off ? `Au lieu de ${money(p.oldPrice)}, maintenant ${money(p.price)}.` : `Prix : ${money(p.price)}.`}\n\n${d}${cta}`;
    else if (FBU.style === "last") t = `Dernières pièces : ${p.name}\n\n${stk ? `Il n'en reste que ${stk}.` : "Quantité limitée."} Prix : ${money(p.price)}.\n\n${d}${cta}`;
    else if (FBU.style === "new") t = `Nouveauté : ${p.name}\n\n${d}Prix : ${money(p.price)}.\n\n${cta}`;
    else if (FBU.style === "ask") t = `Qui est tenté par ${p.name} à ${money(p.price)} ? Dites-le nous en commentaire.\n\n${d}${cta}`;
    else t = `${p.name}\n\n${d}Prix : ${money(p.price)}.\n\n${cta}`;
  }
  if (FBU.tags) t += `\n\n${["#AETERNASTORE", p && p.category ? hashtag(p.category) : "", "#BoutiqueEnLigne", "#CoteDIvoire"].filter((x) => x && x !== "#").join(" ")}`;
  return t;
}

MODS.fb = {
  html: () => `<div class="panel"><h3>1. Préparer la publication</h3><div class="f">
<label>Produit à promouvoir<select id="fb-prod"><option value="">Toute la boutique</option>${live().map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label>
<div class="grid2"><label>Style du texte<select id="fb-style"><option value="announce">Annonce simple</option><option value="promo">Promotion</option><option value="last">Dernières pièces</option><option value="new">Nouveauté</option><option value="ask">Question pour les commentaires</option></select></label>
<label>Type de lien<select id="fb-kind"><option value="free">Publication gratuite</option><option value="paid">Publicité (boost)</option></select></label></div>
<label class="check"><input id="fb-tags" type="checkbox" checked>Ajouter des hashtags</label>
<label>Texte de la publication (vous pouvez le modifier)<textarea id="fb-caption" rows="9"></textarea></label>
<label>Lien suivi (compté dans votre tableau de bord)<input id="fb-link" readonly></label>
<div class="row"><button class="btn" type="button" data-act="fb-copy">Copier le texte</button><button class="btn ghost" type="button" data-act="fb-copylink">Copier le lien</button><button class="btn ghost" type="button" data-act="fb-regen">Régénérer</button></div>
<div class="row"><button class="btn ghost" type="button" data-act="fb-share">Partager (Facebook, WhatsApp...)</button><button class="btn ghost" type="button" data-act="fb-photo">Télécharger la photo</button><button class="btn ghost" type="button" data-act="fb-open-page">Ouvrir ma Page Facebook</button></div></div></div>
<div class="panel"><h3>2. Booster la publication</h3><p class="small">Préparez la publicité, puis lancez-la depuis Facebook : seule votre Page peut créer la campagne.</p><div class="f">
<div class="grid2"><label>Budget par jour (FCFA)<input id="bp-budget" type="number" min="0" step="100" inputmode="numeric" value="1500"></label><label>Durée (jours)<input id="bp-days" type="number" min="1" max="60" step="1" inputmode="numeric" value="5"></label></div>
<div class="grid2"><label>Lieu ciblé<input id="bp-where" maxlength="80" value="Côte d'Ivoire"></label><label>Public<select id="bp-gender"><option value="tous">Tout le monde</option><option value="femmes">Femmes</option><option value="hommes">Hommes</option></select></label></div>
<div class="grid2"><label>Âge minimum<input id="bp-amin" type="number" min="13" max="65" value="18" inputmode="numeric"></label><label>Âge maximum<input id="bp-amax" type="number" min="13" max="65" value="45" inputmode="numeric"></label></div>
<label>Récapitulatif de la campagne<textarea id="bp-sum" rows="6" readonly></textarea></label>
<label>Texte principal de la publicité<textarea id="bp-primary" rows="3" readonly></textarea></label>
<div class="grid2"><label>Titre<input id="bp-head" readonly></label><label>Description<input id="bp-desc" readonly></label></div>
<div class="row"><button class="btn ghost" type="button" data-act="bp-copysum">Copier le récapitulatif</button><button class="btn ghost" type="button" data-act="fb-open-ads">Ouvrir le Gestionnaire de publicités</button><button class="btn ghost" type="button" data-act="fb-open-biz">Ouvrir Meta Business Suite</button></div></div>
<h4>Étapes pour lancer le boost</h4><ol class="plain"><li>Publiez le texte ci-dessus sur votre Page, avec la photo du produit.</li><li>Sur la publication, touchez « Booster la publication » (ou « Promouvoir »).</li><li>Objectif : « Messages », avec WhatsApp comme destination. Reliez votre numéro WhatsApp à la Page si Facebook le demande.</li><li>Audience : reprenez le lieu, l'âge et le public du récapitulatif.</li><li>Budget et durée : reprenez les valeurs du récapitulatif, puis vérifiez le total.</li><li>Lancez la campagne, puis revenez ici : les visites venant de Facebook et les clics WhatsApp s'affichent dans le tableau de bord.</li></ol>
<p class="small">Les intitulés exacts peuvent changer selon l'application Facebook et le minimum de budget accepté. Les conseils de départ ne garantissent aucun résultat.</p></div>
<div class="panel"><h3>3. Résultats venant de Facebook</h3><div id="fb-stats"></div></div>`,
  mount() {
    $("fb-prod").value = FBU.pid; $("fb-style").value = FBU.style; $("fb-kind").value = FBU.paid ? "paid" : "free"; $("fb-tags").checked = FBU.tags;
    this.regen();
  },
  regen() {
    if (!$("fb-caption")) return;
    FBU.caption = genCaption();
    $("fb-caption").value = FBU.caption;
    this.link(); this.plan();
  },
  link() { const p = S.products.find((x) => x.id === FBU.pid); $("fb-link").value = fbLink(p); },
  plan() {
    if (!$("bp-sum")) return;
    const p = S.products.find((x) => x.id === FBU.pid);
    const b = Math.max(0, num($("bp-budget").value) || 0), d = Math.max(1, Math.round(num($("bp-days").value) || 1));
    const g = { tous: "tout le monde", femmes: "les femmes", hommes: "les hommes" }[$("bp-gender").value];
    $("bp-sum").value = `Objectif : Messages (WhatsApp)\nProduit : ${p ? p.name : "toute la boutique"}\nLieu : ${$("bp-where").value}\nAge : ${$("bp-amin").value} à ${$("bp-amax").value} ans, ${g}\nBudget : ${money(b)} par jour pendant ${d} jour(s)\nTotal prévu : ${money(b * d)}`;
    const first = (FBU.caption || "").split("\n").filter(Boolean)[0] || "";
    $("bp-primary").value = (p ? `${p.name} à ${money(p.price)}. ` : "") + "Envoyez-nous un message sur WhatsApp pour commander.";
    $("bp-head").value = (p ? p.name : "AETERNA STORE").slice(0, 40);
    $("bp-desc").value = p ? `À partir de ${money(p.price)}`.slice(0, 40) : (first || "Commandez sur WhatsApp").slice(0, 40);
  },
  update() {
    const box = $("fb-stats");
    if (!box) return;
    const c7 = periodStats(7), c30 = periodStats(30);
    const top = S.products.filter((p) => p.clicksFb > 0).sort((a, b) => b.clicksFb - a.clicksFb).slice(0, 5);
    box.innerHTML = `<div class="kpis small-k"><div class="kpi"><span class="k-l">Visites Facebook, 7 jours</span><strong>${fmt(c7.vf)}</strong></div><div class="kpi"><span class="k-l">Clics WhatsApp Facebook, 7 jours</span><strong>${fmt(c7.wf)}</strong></div><div class="kpi"><span class="k-l">Visites Facebook, 30 jours</span><strong>${fmt(c30.vf)}</strong></div><div class="kpi"><span class="k-l">Clics WhatsApp Facebook, 30 jours</span><strong>${fmt(c30.wf)}</strong></div></div>
${top.length ? `<p><strong>Produits qui attirent le plus depuis Facebook</strong></p><ul class="plain">${top.map((p) => `<li>${esc(p.name)} : ${p.clicksFb} clic(s)</li>`).join("")}</ul>` : '<p class="small">Pas encore de clic venant de Facebook. Utilisez le lien suivi ci-dessus dans vos publications.</p>'}`;
  }
};

/* ================= Réglages ================= */
const SET_FIELDS = [
  ["Boutique", [
    ["whatsapp", "Numéro WhatsApp, avec l'indicatif, chiffres seulement", "text", "Exemple : 2250797034070"],
    ["slogan", "Titre de la page d'accueil", "text"],
    ["intro", "Texte sous le titre", "textarea"],
    ["banner", "Bandeau en haut de page (vide pour le masquer)", "text"]
  ]],
  ["Livraison et paiement", [
    ["deliveryInfo", "Texte sur la livraison", "textarea"],
    ["paymentInfo", "Texte sur le paiement", "textarea"]
  ]],
  ["Contact", [
    ["address", "Adresse de la boutique", "text"],
    ["hours", "Horaires", "text", "Exemple : lundi au samedi, 9 h à 18 h"],
    ["email", "Adresse e-mail de contact", "email"],
    ["facebook", "Lien de votre Page Facebook", "url", "https://www.facebook.com/..."]
  ]]
];
const SET_DEFAULTS = {
  whatsapp: DEFAULT_WA,
  slogan: "Choisissez vos articles, commandez sur WhatsApp.",
  intro: "Parcourez la collection, remplissez votre panier et envoyez la commande sur WhatsApp. Nous confirmons avec vous le produit, le prix et la livraison.",
  banner: "Commande simple : ajoutez au panier, puis envoyez sur WhatsApp.",
  deliveryInfo: "Les frais dépendent de votre adresse et vous sont indiqués avant que vous validiez.",
  paymentInfo: "Le mode de paiement est confirmé avec vous sur WhatsApp avant toute validation."
};
MODS.settings = {
  html: () => `<p class="small">Ces réglages s'appliquent tout de suite à la boutique.</p>` + SET_FIELDS.map(([t, fs]) => `<div class="panel"><h3>${t}</h3><div class="f">${fs.map(([k, l, ty, h]) => `<label>${l}${ty === "textarea" ? `<textarea id="st-${k}" maxlength="400"></textarea>` : `<input id="st-${k}" type="${ty}" maxlength="300">`}${h ? `<span class="small">${esc(h)}</span>` : ""}</label>`).join("")}</div></div>`).join("") +
    `<div class="panel"><h3>Mode pause</h3><p class="small">Utile pendant vos absences : les clients voient le message et ne peuvent plus commander.</p><div class="f"><label class="check"><input id="st-paused" type="checkbox">Mettre la boutique en pause</label><label>Message affiché<textarea id="st-pauseMsg" maxlength="300" placeholder="La boutique est en pause. Écrivez-nous sur WhatsApp, nous vous répondons dès notre retour."></textarea></label></div></div>
<p id="st-msg" class="msg" role="alert"></p><div class="row"><button class="btn" type="button" data-act="st-save">Enregistrer les réglages</button><a class="btn ghost" href="/" target="_blank" rel="noopener noreferrer">Voir la boutique</a></div>`,
  mount() {
    SET_FIELDS.forEach(([, fs]) => fs.forEach(([k]) => { const v = S.settings[k]; $(`st-${k}`).value = v !== undefined ? v : (SET_DEFAULTS[k] || ""); }));
    $("st-paused").checked = S.settings.paused === true;
    $("st-pauseMsg").value = S.settings.pauseMsg || "";
  }
};
async function saveSettings() {
  const msg = $("st-msg"), v = (k) => $(`st-${k}`).value.trim();
  const fail = (t) => { msg.textContent = t; msg.className = "msg err"; };
  if (!validWa(v("whatsapp"))) return fail("Le numéro WhatsApp doit contenir de 8 à 15 chiffres, avec l'indicatif du pays.");
  if (v("email") && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v("email"))) return fail("L'adresse e-mail n'est pas valide.");
  if (v("facebook") && !safeUrl(v("facebook"), FB_HOSTS)) return fail("Le lien Facebook doit commencer par https:// et venir de facebook.com.");
  const data = {
    whatsapp: digits(v("whatsapp")), slogan: v("slogan").slice(0, 150), intro: v("intro").slice(0, 400), banner: v("banner").slice(0, 200),
    deliveryInfo: v("deliveryInfo").slice(0, 400), paymentInfo: v("paymentInfo").slice(0, 400), address: v("address").slice(0, 200),
    hours: v("hours").slice(0, 120), email: v("email").slice(0, 120), facebook: v("facebook") ? safeUrl(v("facebook"), FB_HOSTS) : "",
    paused: $("st-paused").checked, pauseMsg: v("pauseMsg").slice(0, 300), updatedAt: serverTimestamp()
  };
  try { await setDoc(doc(db, "settings", "shop"), data); msg.textContent = "Réglages enregistrés."; msg.className = "msg ok"; toast("Réglages enregistrés"); }
  catch { fail("Enregistrement refusé. Vérifiez que les règles Firestore sont à jour."); }
}

/* ================= Accès et sécurité ================= */
let idleTimer = null;
const idleMin = () => { try { return Math.min(120, Math.max(5, Number(localStorage.getItem("aeterna_idle")) || 30)); } catch { return 30; } };
function resetIdle() {
  if (!S.user) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { toast("Session fermée après inactivité."); signOut(auth); }, idleMin() * 60000);
}
["click", "keydown", "pointermove", "touchstart"].forEach((ev) => document.addEventListener(ev, resetIdle, { passive: true }));

MODS.access = {
  html: () => `<div class="panel"><h3>Mon compte</h3><ul class="plain"><li>Adresse : <strong>${esc(S.user ? S.user.email : "")}</strong></li><li>Rôle : <strong>${isOwner() ? "Propriétaire" : "Gestionnaire"}</strong></li><li>Dernière connexion : ${esc(S.user && S.user.metadata ? dateFr(Date.parse(S.user.metadata.lastSignInTime)) : "inconnue")}</li></ul>
<div class="f"><label>Déconnexion automatique après inactivité<select id="ac-idle">${[15, 30, 60, 120].map((m) => `<option value="${m}">${m} minutes</option>`).join("")}</select></label></div>
<div class="row"><button class="btn" type="button" data-act="signout">Me déconnecter</button><a class="btn ghost" href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer">Sécurité de mon compte Google</a><a class="btn ghost" href="https://myaccount.google.com/signinoptions/two-step-verification" target="_blank" rel="noopener noreferrer">Validation en deux étapes</a></div></div>
${isOwner() ? `<div class="panel"><h3>Équipe</h3><p class="small">Un gestionnaire peut gérer les produits, les commandes et Facebook. Il ne voit ni les réglages ni la liste des accès. Il doit se connecter avec un compte Google dont l'adresse est vérifiée.</p><div id="ac-team"></div><div class="f"><label>Adresse Google du gestionnaire<input id="ac-email" type="email" maxlength="120" autocomplete="off"></label></div><p id="ac-msg" class="msg" role="alert"></p><button class="btn ghost" type="button" data-act="ac-add">Ajouter ce gestionnaire</button></div>
<div class="panel"><h3>Journal des connexions</h3><div id="ac-log"></div></div>` : ""}
<div class="panel"><h3>Sauvegardes</h3><p class="small">Gardez une copie de vos données. La sauvegarde contient vos produits, vos commandes et vos réglages.</p><div class="row"><button class="btn" type="button" data-act="backup">Télécharger la sauvegarde (JSON)</button><button class="btn ghost" type="button" data-act="p-csv">Produits (CSV)</button><button class="btn ghost" type="button" data-act="o-csv">Commandes (CSV)</button></div></div>
<div class="panel"><h3>Conseils de sécurité</h3><ul class="plain"><li>Activez la validation en deux étapes sur votre compte Google.</li><li>Ne partagez jamais l'accès à votre compte Google. Ajoutez plutôt un gestionnaire.</li><li>Déconnectez-vous sur les appareils partagés. Ne cochez pas « Rester connectée » dans ce cas.</li><li>Gardez les règles Firestore du fichier fourni : elles réservent l'écriture aux personnes autorisées.</li><li>Téléchargez une sauvegarde de temps en temps.</li></ul></div>`,
  mount() { $("ac-idle").value = String(idleMin()); this.update(); },
  update() {
    if (!isOwner()) return;
    const t = $("ac-team"), l = $("ac-log");
    if (t) t.innerHTML = S.admins.length ? `<ul class="plain">${S.admins.map((a) => `<li>${esc(a.id)} <button type="button" class="link" data-act="ac-rm" data-id="${esc(a.id)}">retirer</button></li>`).join("")}</ul>` : '<p class="small">Aucun gestionnaire pour le moment.</p>';
    if (l) l.innerHTML = S.log.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Compte</th><th>Rôle</th><th>Appareil</th></tr></thead><tbody>${S.log.map((x) => `<tr><td>${esc(dateFr(ms({ createdAt: x.at })))}</td><td>${esc(x.email)}</td><td>${esc(x.role)}</td><td class="small">${esc(String(x.ua || "").slice(0, 70))}</td></tr>`).join("")}</tbody></table></div>` : '<p class="small">Aucune connexion enregistrée.</p>';
  }
};

/* ===== Actions ===== */
async function run(label, fn) { try { await fn(); } catch { toast(`${label} refusé. Vérifiez les règles Firestore.`); } }

document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-act]");
  if (!t || t.tagName === "SELECT") return;
  const a = t.dataset.act, id = t.dataset.id, v = t.dataset.v;
  const prod = S.products.find((p) => p.id === id);
  switch (a) {
    case "tab": setTab(v); break;
    case "goto": setTab(v); break;
    case "period": S.period = Number(v); $("panel").innerHTML = MODS.dash.html(); MODS.dash.update(); break;
    case "signout": signOut(auth); break;
    /* produits */
    case "p-new": PUI.edit = blankProduct(); MODS.products.form(); $("pform").scrollIntoView(); break;
    case "p-edit": if (prod) { PUI.edit = { id: prod.id, name: prod.name || "", category: prod.category || "", price: prod.price ?? "", oldPrice: prod.oldPrice || "", stock: typeof prod.stock === "number" ? prod.stock : "", description: prod.description || "", imageUrl: prod.imageUrl || "", active: prod.active !== false, isNew: prod.isNew === true }; MODS.products.form(); $("pform").scrollIntoView(); } break;
    case "p-cancel": PUI.edit = null; MODS.products.form(); break;
    case "p-img-rm": if (PUI.edit) { PUI.edit.imageUrl = ""; $("pf-url").value = ""; MODS.products.prev(); } break;
    case "p-save": {
      const d = readProduct();
      if (!d) break;
      const edit = PUI.edit;
      await run("Enregistrement", async () => {
        if (edit.id) await updateDoc(doc(db, "products", edit.id), { ...d, updatedAt: serverTimestamp() });
        else await addDoc(collection(db, "products"), { ...d, clicks: 0, clicksFb: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        PUI.edit = null; MODS.products.form(); toast("Produit enregistré");
      });
      break;
    }
    case "p-toggle": if (prod) run("Modification", () => updateDoc(doc(db, "products", id), { active: prod.active === false, updatedAt: serverTimestamp() })); break;
    case "p-dup": if (prod) run("Duplication", () => addDoc(collection(db, "products"), { name: `${prod.name} (copie)`.slice(0, 120), category: prod.category || "", price: prod.price, oldPrice: prod.oldPrice || 0, stock: typeof prod.stock === "number" ? prod.stock : null, description: prod.description || "", imageUrl: prod.imageUrl || "", active: false, isNew: false, clicks: 0, clicksFb: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }).then(() => toast("Copie créée, masquée par défaut"))); break;
    case "p-del": PUI.confirm = id; MODS.products.list(); break;
    case "p-del-ok": PUI.confirm = null; run("Suppression", () => deleteDoc(doc(db, "products", id))); break;
    case "p-fb": FBU.pid = id; setTab("fb"); break;
    case "p-csv": download(`aeterna-produits-${dayKey()}.csv`, csv([["Nom", "Catégorie", "Prix", "Ancien prix", "Stock", "Publié", "Nouveau", "Clics WhatsApp", "Clics Facebook", "Description"], ...S.products.map((p) => [p.name, p.category || "", p.price, p.oldPrice || "", typeof p.stock === "number" ? p.stock : "", p.active === false ? "non" : "oui", p.isNew ? "oui" : "non", p.clicks || 0, p.clicksFb || 0, p.description || ""])]), "text/csv;charset=utf-8"); break;
    /* commandes */
    case "o-new": OUI.edit = blankOrder(); MODS.orders.form(); $("oform").scrollIntoView(); break;
    case "o-cancel": OUI.edit = null; MODS.orders.form(); break;
    case "o-addline": {
      const e = OUI.edit, p = S.products.find((x) => x.id === $("of-prod").value), q = Math.round(num($("of-qty").value));
      if (!e || !p || !(q >= 1)) { toast("Choisissez un produit et une quantité."); break; }
      const ex = e.items.find((i) => i.id === p.id);
      if (ex) ex.qty += q; else e.items.push({ id: p.id, name: p.name, qty: q, price: Number(p.price) || 0 });
      MODS.orders.lines(); break;
    }
    case "o-rmline": if (OUI.edit) { OUI.edit.items.splice(Number(id), 1); MODS.orders.lines(); } break;
    case "o-save": {
      const e = OUI.edit, msg = (m) => { $("of-msg").textContent = m; $("of-msg").className = "msg err"; };
      if (!e.customer.trim()) { msg("Indiquez le nom du client."); break; }
      const total = num(e.total);
      if (!Number.isFinite(total) || total < 0 || (!e.items.length && total === 0)) { msg("Ajoutez un produit ou indiquez le total."); break; }
      await run("Enregistrement", async () => {
        await addDoc(collection(db, "orders"), { customer: e.customer.trim().slice(0, 80), phone: e.phone.trim().slice(0, 30), source: e.source, status: e.status, items: e.items, total: Math.round(total), note: e.note.trim().slice(0, 300), date: dayKey(), createdAt: serverTimestamp(), stockDeducted: false });
        OUI.edit = null; MODS.orders.form(); toast("Commande enregistrée");
      });
      break;
    }
    case "o-stock": {
      const o = S.orders.find((x) => x.id === id);
      if (!o) break;
      await run("Mise à jour du stock", async () => {
        const b = writeBatch(db);
        (o.items || []).forEach((i) => { const p = S.products.find((x) => x.id === i.id); if (p && typeof p.stock === "number") b.update(doc(db, "products", p.id), { stock: Math.max(0, p.stock - i.qty), updatedAt: serverTimestamp() }); });
        b.update(doc(db, "orders", id), { stockDeducted: true });
        await b.commit(); toast("Stock mis à jour");
      });
      break;
    }
    case "o-del": OUI.confirm = id; MODS.orders.update(); break;
    case "o-del-ok": OUI.confirm = null; run("Suppression", () => deleteDoc(doc(db, "orders", id))); break;
    case "o-csv": download(`aeterna-commandes-${dayKey()}.csv`, csv([["Date", "Client", "Téléphone", "Origine", "Statut", "Produits", "Total", "Note"], ...S.orders.map((o) => [o.date, o.customer, o.phone || "", SOURCES[o.source] || "", STATUS[o.status] || "", (o.items || []).map((i) => `${i.qty} x ${i.name}`).join(" ; "), o.total, o.note || ""])]), "text/csv;charset=utf-8"); break;
    /* facebook */
    case "fb-copy": copy($("fb-caption").value); break;
    case "fb-copylink": copy($("fb-link").value); break;
    case "fb-regen": MODS.fb.regen(); break;
    case "fb-share": {
      const text = $("fb-caption").value;
      try { if (navigator.share) { await navigator.share({ text }); break; } } catch (err) { if (err && err.name === "AbortError") break; }
      copy(text); openExternal(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent($("fb-link").value)}`);
      break;
    }
    case "fb-photo": {
      const p = S.products.find((x) => x.id === FBU.pid);
      if (!p || !isImg(p.imageUrl)) { toast("Choisissez un produit qui a une photo."); break; }
      if (p.imageUrl.startsWith("https://")) { openExternal(p.imageUrl); break; }
      const l = document.createElement("a"); l.href = p.imageUrl; l.download = `${slug(p.name) || "produit"}.webp`; document.body.appendChild(l); l.click(); l.remove();
      break;
    }
    case "fb-open-page": openExternal(safeUrl(S.settings.facebook, FB_HOSTS) || "https://www.facebook.com/pages/?category=your_pages"); break;
    case "fb-open-ads": openExternal("https://adsmanager.facebook.com/"); break;
    case "fb-open-biz": openExternal("https://business.facebook.com/"); break;
    case "bp-copysum": copy($("bp-sum").value); break;
    /* réglages et accès */
    case "st-save": saveSettings(); break;
    case "ac-add": {
      const m = $("ac-email").value.trim().toLowerCase(), msg = $("ac-msg");
      if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(m)) { msg.textContent = "Adresse e-mail non valide."; msg.className = "msg err"; break; }
      if (m === OWNER_EMAIL) { msg.textContent = "Ce compte est déjà propriétaire."; msg.className = "msg err"; break; }
      await run("Ajout", async () => { await setDoc(doc(db, "admins", m), { role: "editor", addedBy: S.user.email, addedAt: serverTimestamp() }); $("ac-email").value = ""; msg.textContent = "Gestionnaire ajouté."; msg.className = "msg ok"; });
      break;
    }
    case "ac-rm": run("Retrait", () => deleteDoc(doc(db, "admins", id))); break;
    case "backup": {
      const clean = (arr) => arr.map(({ id: i, ...r }) => ({ id: i, ...JSON.parse(JSON.stringify(r)) }));
      download(`aeterna-sauvegarde-${dayKey()}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), settings: S.settings, products: clean(S.products), orders: clean(S.orders) }, null, 2), "application/json");
      break;
    }
  }
});

document.addEventListener("input", (e) => {
  const t = e.target, id = t.id || "";
  if (id.startsWith("pf-") && PUI.edit) {
    const k = { "pf-name": "name", "pf-category": "category", "pf-price": "price", "pf-old": "oldPrice", "pf-stock": "stock", "pf-desc": "description" }[id];
    if (k) PUI.edit[k] = t.value;
    if (id === "pf-url") { PUI.edit.imageUrl = t.value.trim(); MODS.products.prev(); }
  } else if (id === "p-q") { PUI.q = t.value; MODS.products.list(); }
  else if (id === "o-q") { OUI.q = t.value; MODS.orders.update(); }
  else if (id.startsWith("of-") && OUI.edit) {
    const k = { "of-customer": "customer", "of-phone": "phone", "of-total": "total", "of-note": "note" }[id];
    if (k) { OUI.edit[k] = t.value; if (id === "of-total") OUI.edit.totalManual = t.value !== ""; }
  } else if (id === "fb-caption") FBU.caption = t.value;
  else if (id.startsWith("bp-")) MODS.fb.plan();
});

document.addEventListener("change", async (e) => {
  const t = e.target, id = t.id || "";
  if (id === "pf-active" && PUI.edit) PUI.edit.active = t.checked;
  else if (id === "pf-isnew" && PUI.edit) PUI.edit.isNew = t.checked;
  else if (id === "pf-file" && PUI.edit && t.files && t.files[0]) {
    try { PUI.edit.imageUrl = await compressImage(t.files[0]); $("pf-url").value = ""; MODS.products.prev(); toast("Photo prête"); }
    catch { toast("Cette image ne peut pas être utilisée. Essayez une autre photo."); }
  }
  else if (id === "p-f") { PUI.f = t.value; MODS.products.list(); }
  else if (id === "p-s") { PUI.s = t.value; MODS.products.list(); }
  else if (id === "o-f") { OUI.f = t.value; MODS.orders.update(); }
  else if (id === "of-source" && OUI.edit) OUI.edit.source = t.value;
  else if (id === "of-status" && OUI.edit) OUI.edit.status = t.value;
  else if (t.dataset && t.dataset.act === "o-status") run("Changement de statut", () => updateDoc(doc(db, "orders", t.dataset.id), { status: t.value }));
  else if (id === "fb-prod") { FBU.pid = t.value; MODS.fb.regen(); }
  else if (id === "fb-style") { FBU.style = t.value; MODS.fb.regen(); }
  else if (id === "fb-kind") { FBU.paid = t.value === "paid"; MODS.fb.regen(); }
  else if (id === "fb-tags") { FBU.tags = t.checked; MODS.fb.regen(); }
  else if (id === "bp-gender") MODS.fb.plan();
  else if (id === "ac-idle") { try { localStorage.setItem("aeterna_idle", t.value); } catch { /* ignoré */ } resetIdle(); toast("Délai enregistré"); }
});

/* ===== Connexion ===== */
const AUTH_HINTS = {
  "auth/unauthorized-domain": "Ce site n'est pas dans les domaines autorisés de Firebase. Vérifiez Authentication, Paramètres, Domaines autorisés : l'adresse doit être écrite en minuscules.",
  "auth/operation-not-allowed": "La connexion Google n'est pas activée. Ouvrez Firebase, Authentication, Méthode de connexion, activez Google et enregistrez.",
  "auth/popup-blocked": "Le navigateur a bloqué la fenêtre de connexion. Autorisez les fenêtres surgissantes pour ce site, puis réessayez.",
  "auth/popup-closed-by-user": "La fenêtre de connexion a été fermée avant la fin. Réessayez.",
  "auth/cancelled-popup-request": "Une autre fenêtre de connexion était déjà ouverte. Réessayez.",
  "auth/network-request-failed": "Problème de réseau. Vérifiez votre connexion internet.",
  "auth/invalid-api-key": "La clé de l'application est refusée. Vérifiez ses restrictions dans Google Cloud.",
  "auth/api-key-not-valid": "La clé de l'application est refusée. Vérifiez ses restrictions dans Google Cloud.",
  "auth/internal-error": "Erreur interne de Firebase. Réessayez dans un instant."
};
function loginError(e) {
  const code = (e && e.code) || "inconnu";
  return `${AUTH_HINTS[code] || "Connexion impossible."} (code : ${code})`;
}
function sub(ref, fn) {
  S.unsubs.push(onSnapshot(ref, fn, () => toast("Lecture refusée. Vérifiez les règles Firestore.")));
}
function startData() {
  sub(collection(db, "products"), (s) => { S.products = snapDocs(s).sort((a, b) => ms(b) - ms(a)); refresh(); });
  sub(query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(300)), (s) => { S.orders = snapDocs(s); refresh(); });
  sub(collection(db, "stats"), (s) => { S.stats = {}; s.docs.forEach((d) => { S.stats[d.id] = d.data(); }); refresh(); });
  sub(doc(db, "settings", "shop"), (s) => { S.settings = s.exists() ? s.data() : {}; refresh(); });
  if (isOwner()) {
    sub(collection(db, "admins"), (s) => { S.admins = snapDocs(s); refresh(); });
    sub(query(collection(db, "accessLog"), orderBy("at", "desc"), limit(25)), (s) => { S.log = snapDocs(s); refresh(); });
  }
}
function leave() {
  S.unsubs.forEach((u) => u()); S.unsubs = [];
  Object.assign(S, { user: null, role: null, products: [], orders: [], stats: {}, settings: {}, admins: [], log: [] });
  PUI.edit = null; OUI.edit = null;
  clearTimeout(idleTimer);
  $("admin-box").hidden = true; $("login-box").hidden = false; $("btn-out").hidden = true;
}
function deny(msg) { $("login-msg").textContent = msg; signOut(auth); leave(); }

async function enter(user, role) {
  S.user = user; S.role = role;
  $("login-box").hidden = true; $("admin-box").hidden = false; $("btn-out").hidden = false; $("login-msg").textContent = "";
  $("who").textContent = `${user.email} (${role === "owner" ? "propriétaire" : "gestionnaire"})`;
  S.tab = "dash";
  setTab("dash");
  startData();
  resetIdle();
  try {
    if (!sessionStorage.getItem("aeterna_adm_log")) {
      sessionStorage.setItem("aeterna_adm_log", "1");
      await addDoc(collection(db, "accessLog"), { email: user.email, role, at: serverTimestamp(), ua: navigator.userAgent.slice(0, 140) });
    }
  } catch { /* journal non bloquant */ }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { leave(); return; }
  const email = (user.email || "").toLowerCase();
  if (!user.emailVerified) { deny("L'adresse e-mail de ce compte Google n'est pas vérifiée."); return; }
  let role = email === OWNER_EMAIL ? "owner" : null;
  if (!role) { try { if ((await getDoc(doc(db, "admins", email))).exists()) role = "editor"; } catch { /* refusé */ } }
  if (!role) { deny("Ce compte Google n'est pas autorisé."); return; }
  if (S.user && S.user.uid === user.uid) return;
  enter(user, role);
});

$("btn-google").addEventListener("click", async () => {
  $("login-msg").textContent = "";
  try {
    await setPersistence(auth, $("remember").checked ? browserLocalPersistence : browserSessionPersistence);
    await signInWithPopup(auth, provider);
  } catch (e) { $("login-msg").textContent = loginError(e); }
});
$("btn-out").addEventListener("click", () => signOut(auth));
