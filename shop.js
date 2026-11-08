import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore, collection, doc, updateDoc, setDoc, onSnapshot, query, where, increment
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  firebaseConfig, DEFAULT_WA, esc, fmt, money, isImg, dayKey, digits, validWa, safeUrl, FB_HOSTS
} from "./common.js";

const NAME = "AETERNA STORE";
const db = getFirestore(initializeApp(firebaseConfig));
const $ = (id) => document.getElementById(id);
const q1 = (s, r = document) => r.querySelector(s);

/* ===== Réglages de la boutique (modifiables dans l'espace propriétaire) ===== */
let cfg = { whatsapp: DEFAULT_WA, paused: false };
const waNum = () => (validWa(cfg.whatsapp) ? digits(cfg.whatsapp) : DEFAULT_WA);
const waShow = () => {
  const d = waNum();
  return d.startsWith("225") && d.length === 13 ? `+225 ${d.slice(3).replace(/(\d{2})(?=\d)/g, "$1 ").trim()}` : `+${d}`;
};
const waUrl = (text) => `https://wa.me/${waNum()}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
const paused = () => cfg.paused === true;
const pauseMsg = () => cfg.pauseMsg || "La boutique est en pause. Écrivez-nous sur WhatsApp, nous vous répondons dès notre retour.";

function setText(id, v) { const e = $(id); if (e && typeof v === "string" && v.trim()) e.textContent = v.trim(); }

function applySettings() {
  setText("hero-h", cfg.slogan);
  setText("hero-p", cfg.intro);
  setText("info-delivery", cfg.deliveryInfo);
  setText("info-pay", cfg.paymentInfo);
  const tb = $("topbar");
  if (typeof cfg.banner === "string") { tb.hidden = !cfg.banner.trim(); if (cfg.banner.trim()) tb.textContent = cfg.banner.trim(); }
  const ps = $("pause");
  ps.hidden = !paused();
  ps.textContent = paused() ? pauseMsg() : "";
  const rows = [`<p><a href="${waUrl("")}" target="_blank" rel="noopener noreferrer">WhatsApp : ${esc(waShow())}</a></p>`];
  if (cfg.address) rows.push(`<p>${esc(cfg.address)}</p>`);
  if (cfg.hours) rows.push(`<p>${esc(cfg.hours)}</p>`);
  if (cfg.email && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(cfg.email)) rows.push(`<p><a href="mailto:${esc(cfg.email)}">${esc(cfg.email)}</a></p>`);
  const fb = safeUrl(cfg.facebook, FB_HOSTS);
  if (fb) rows.push(`<p><a href="${esc(fb)}" target="_blank" rel="noopener noreferrer">Notre page Facebook</a></p>`);
  $("ftr-contact").innerHTML = rows.join("");
}

/* ===== Origine de la visite et compteurs anonymes ===== */
const params = new URLSearchParams(location.search);
let fromFb = false;
try {
  const s = (params.get("utm_source") || "").toLowerCase();
  if (/^(facebook|fb|instagram|ig)$/.test(s) || params.has("fbclid")) sessionStorage.setItem("aeterna_src", "fb");
  fromFb = sessionStorage.getItem("aeterna_src") === "fb";
} catch { fromFb = /facebook|fb/.test(params.get("utm_source") || "") || params.has("fbclid"); }

function bump(fields) {
  const o = {};
  for (const [k, v] of Object.entries(fields)) if (v) o[k] = increment(v);
  if (Object.keys(o).length) setDoc(doc(db, "stats", dayKey()), o, { merge: true }).catch(() => {});
}
try {
  if (!sessionStorage.getItem("aeterna_v")) {
    sessionStorage.setItem("aeterna_v", "1");
    bump({ visits: 1, visitsFb: fromFb ? 1 : 0 });
  }
} catch { /* navigation privée : pas de comptage */ }

async function countClick(id) {
  try {
    await updateDoc(doc(db, "products", id), { clicks: increment(1) });
    if (fromFb) await updateDoc(doc(db, "products", id), { clicksFb: increment(1) });
  } catch { /* comptage non bloquant */ }
}
function trackOrder(ids) {
  ids.forEach(countClick);
  bump({ waClicks: 1, waClicksFb: fromFb ? 1 : 0 });
}

/* ===== Icônes et utilitaires ===== */
const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  bag: '<path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  chat: '<path d="M20 12a8 8 0 0 1-11.7 7.1L4 20l1-4A8 8 0 1 1 20 12Z"/><path d="M9.2 9.5c0 2.9 2.4 5.3 5.3 5.3l1-1.3-1.9-.9-.8.8a3.2 3.2 0 0 1-1.5-1.5l.8-.8-.9-1.9-2 .3Z"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>'
};
const INF = "M100 50C130 8 190 8 190 50C190 92 130 92 100 50C70 8 10 8 10 50C10 92 70 92 100 50Z";
const ic = (n, s = 20) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
const mark = (s) => `<svg width="${s}" height="${Math.round(s / 2)}" viewBox="0 0 200 100" fill="none" stroke="currentColor" stroke-width="9" stroke-linejoin="round" aria-hidden="true"><path d="${INF}"/></svg>`;
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* navigation privée */ } };

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}
function openExternal(url) {
  const a = document.createElement("a");
  a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
  document.body.appendChild(a); a.click(); a.remove();
}

/* ===== Boutique ===== */
let publicProducts = [];
let shopLoaded = false;
let shopError = false;
let deepLinkDone = false;
const ui = { cat: "Tous", q: "", sort: "new" };
let cart = [];
try { cart = (JSON.parse(localStorage.getItem("aeterna_cart_v1")) || []).filter((i) => i && i.id && i.qty > 0); } catch { cart = []; }
const cust = { name: "", address: "", note: "" };
try { Object.assign(cust, JSON.parse(localStorage.getItem("aeterna_cust_v1")) || {}); } catch { /* ignoré */ }
let pm = null;
const layer = $("layer");

const createdMs = (p) => p.createdAt?.toMillis?.() ?? 0;
const find = (id) => publicProducts.find((p) => p.id === id);
const isOut = (p) => p.stock === 0;
const maxQty = (p) => (typeof p.stock === "number" && p.stock > 0 ? Math.min(99, p.stock) : 99);
const discount = (p) => (p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0);
const isNewP = (p) => p.isNew === true || (createdMs(p) > 0 && Date.now() - createdMs(p) < 14 * 864e5);
const imgTag = (p, alt) => isImg(p.imageUrl)
  ? `<img src="${esc(p.imageUrl)}" alt="${esc(alt)}" loading="lazy" decoding="async">`
  : `<div class="noimg" aria-hidden="true">${mark(56)}</div>`;
const orderLink = (p) => waUrl(p.stock === 0
  ? `Bonjour ${NAME}, le produit « ${p.name} » est-il de nouveau disponible ?`
  : `Bonjour ${NAME}, je souhaite commander : ${p.name} (${fmt(p.price)} FCFA)`);

function list() {
  let a = publicProducts.slice();
  if (ui.cat !== "Tous") a = a.filter((p) => p.category === ui.cat);
  const q = ui.q.trim().toLowerCase();
  if (q) a = a.filter((p) => `${p.name || ""} ${p.description || ""} ${p.category || ""}`.toLowerCase().includes(q));
  if (ui.sort === "asc") a.sort((x, y) => (Number(x.price) || 0) - (Number(y.price) || 0));
  if (ui.sort === "desc") a.sort((x, y) => (Number(y.price) || 0) - (Number(x.price) || 0));
  return a;
}

function card(p) {
  const out = isOut(p), off = discount(p);
  return `<article class="card${out ? " out" : ""}" data-action="open" data-id="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(p.name)}">` +
    `<div class="ph">${imgTag(p, p.name || "")}` +
    (out ? '<span class="badge out">Épuisé</span>' : off ? `<span class="badge">-${off} %</span>` : isNewP(p) ? '<span class="badge new">Nouveau</span>' : "") +
    (out ? "" : `<button class="quick" data-action="add" data-id="${esc(p.id)}" aria-label="Ajouter ${esc(p.name)} au panier">${ic("plus", 20)}</button>`) +
    `</div><div class="meta"><span class="cat">${esc(p.category || "")}</span><h3>${esc(p.name)}</h3><p class="price"><b>${money(p.price)}</b>${off ? `<s>${money(p.oldPrice)}</s>` : ""}</p></div></article>`;
}

function renderCategories() {
  const cats = ["Tous", ...new Set(publicProducts.map((p) => p.category).filter(Boolean))];
  if (!cats.includes(ui.cat)) ui.cat = "Tous";
  $("chips").innerHTML = cats.length > 1
    ? cats.map((c) => `<button class="chip" data-action="chip" data-cat="${esc(c)}" aria-pressed="${c === ui.cat}">${esc(c)}</button>`).join("")
    : "";
}

function renderPublic() {
  const a = list();
  $("n").textContent = shopLoaded && !shopError ? `${a.length} ${a.length > 1 ? "articles" : "article"}` : "";
  let html;
  if (shopError) html = '<p class="empty">Les produits ne peuvent pas être chargés pour le moment. Réessayez dans un instant.</p>';
  else if (!shopLoaded) html = '<p class="empty">Chargement de la collection.</p>';
  else if (!publicProducts.length) html = '<p class="empty">La collection arrive bientôt. En attendant, écrivez-nous sur WhatsApp pour connaître les articles disponibles.</p>';
  else if (!a.length) html = '<p class="empty">Aucun article ne correspond. Essayez une autre recherche ou une autre catégorie.</p>';
  else html = a.map(card).join("");
  $("grid").innerHTML = html;
}

/* ===== Panier ===== */
function updateCount() {
  const n = cart.reduce((t, i) => t + i.qty, 0);
  $("count").textContent = n ? String(n) : "";
}
function saveCart() { lsSet("aeterna_cart_v1", cart); updateCount(); }
function addToCart(id, q) {
  const p = find(id);
  if (!p || isOut(p)) return;
  const it = cart.find((i) => i.id === id);
  if (it) it.qty = Math.min(maxQty(p), it.qty + q); else cart.push({ id, qty: Math.min(maxQty(p), q) });
  saveCart();
}

function showLayer(inner, cls) {
  layer.innerHTML = `<div class="scrim" data-action="close"></div><div class="${cls}" role="dialog" aria-modal="true">${inner}</div>`;
  document.body.classList.add("lock");
  const f = q1("[data-focus]", layer);
  if (f) f.focus();
}
function closeLayer() { layer.innerHTML = ""; document.body.classList.remove("lock"); pm = null; }

function openCart() {
  showLayer(`<div class="sh-head"><h2>Mon panier</h2><button class="iconbtn" data-action="close" data-focus aria-label="Fermer">${ic("close")}</button></div><div class="sh-body" id="cbody"></div>`, "sheet");
  renderCart();
}
const cartRows = () => cart.map((i) => ({ p: find(i.id), qty: i.qty })).filter((r) => r.p && !isOut(r.p));
function renderCart() {
  const b = $("cbody");
  if (!b) return;
  const rows = cartRows();
  cart = rows.map((r) => ({ id: r.p.id, qty: Math.min(r.qty, maxQty(r.p)) }));
  saveCart();
  if (!rows.length) {
    b.innerHTML = '<p class="empty">Votre panier est vide.<br>Ajoutez des articles depuis la collection.</p><button class="btn block" data-action="close">Voir la collection</button>';
    return;
  }
  const total = rows.reduce((t, r) => t + (Number(r.p.price) || 0) * r.qty, 0);
  b.innerHTML = rows.map((r) =>
    `<div class="line-i"><div class="lt">${imgTag(r.p, "")}</div><div><h4>${esc(r.p.name)}</h4><span class="cat">${money(r.p.price)}</span>` +
    `<div class="r"><div class="qty"><button data-action="dec" data-id="${esc(r.p.id)}" aria-label="Retirer une unité">${ic("minus", 16)}</button><span>${r.qty}</span><button data-action="inc" data-id="${esc(r.p.id)}" aria-label="Ajouter une unité">${ic("plus", 16)}</button></div>` +
    `<button class="rm" data-action="rm" data-id="${esc(r.p.id)}" aria-label="Supprimer ${esc(r.p.name)}">${ic("trash", 18)}</button></div></div></div>`
  ).join("") +
    `<div class="total"><span>Total</span><span>${money(total)}</span></div>` +
    '<p class="note tight">Frais de livraison non inclus. Ils vous sont indiqués sur WhatsApp avant que vous validiez.</p>' +
    `<label class="fld"><span>Votre nom</span><input data-c="name" autocomplete="name" value="${esc(cust.name)}" placeholder="Ex. Aïcha K."></label>` +
    `<label class="fld"><span>Adresse ou zone de livraison</span><input data-c="address" autocomplete="street-address" value="${esc(cust.address)}" placeholder="Ville, quartier, repère"></label>` +
    `<label class="fld"><span>Message (facultatif)</span><textarea data-c="note" rows="2" placeholder="Taille, couleur, horaire de livraison">${esc(cust.note)}</textarea></label>` +
    `<button class="btn wa block" data-action="order">${ic("chat", 20)}Commander sur WhatsApp</button>` +
    '<p class="note">Un message prêt à envoyer s\'ouvre dans WhatsApp. Votre commande est confirmée avec vous par discussion.</p>';
}

function orderText(rows) {
  const total = rows.reduce((t, r) => t + (Number(r.p.price) || 0) * r.qty, 0);
  const L = [`Bonjour ${NAME}, je souhaite commander :`];
  rows.forEach((r) => L.push(`- ${r.qty} x ${r.p.name} (${money((Number(r.p.price) || 0) * r.qty)})`));
  L.push("", `Total : ${money(total)} (livraison à confirmer)`);
  if (cust.name.trim()) L.push(`Nom : ${cust.name.trim()}`);
  if (cust.address.trim()) L.push(`Livraison : ${cust.address.trim()}`);
  if (cust.note.trim()) L.push(`Message : ${cust.note.trim()}`);
  L.push("", "Merci de me confirmer la disponibilité et la livraison.");
  return L.join("\n");
}
function sendOrder() {
  if (paused()) { toast(pauseMsg()); return; }
  const rows = cartRows();
  if (!rows.length) return;
  if (!cust.name.trim() || !cust.address.trim()) { toast("Indiquez votre nom et votre adresse de livraison."); return; }
  trackOrder(rows.map((r) => r.p.id));
  openExternal(waUrl(orderText(rows)));
}

/* ===== Fiche produit ===== */
function openProduct(id) {
  if (!find(id)) return;
  pm = { id, qty: 1 };
  showLayer('<div class="pm" id="pbody"></div>', "dialog");
  renderProduct();
}
function renderProduct() {
  const p = pm && find(pm.id), b = $("pbody");
  if (!p || !b) return;
  const out = isOut(p), off = discount(p);
  const stockTxt = out ? "Épuisé pour le moment"
    : typeof p.stock === "number" ? (p.stock <= 5 ? `Plus que ${p.stock} en stock` : "En stock")
    : "Disponibilité confirmée sur WhatsApp";
  b.innerHTML = `<div class="pm-img">${imgTag(p, p.name || "")}</div><div class="pm-in">` +
    `<button class="iconbtn x" data-action="close" data-focus aria-label="Fermer">${ic("close")}</button>` +
    `<span class="cat">${esc(p.category || "")}</span><h2>${esc(p.name)}</h2>` +
    `<p class="price big"><b>${money(p.price)}</b>${off ? `<s>${money(p.oldPrice)}</s>` : ""}</p>` +
    (p.description ? `<p class="desc">${esc(p.description)}</p>` : "") +
    `<p class="stock${out ? " no" : ""}">${stockTxt}</p>` +
    (out
      ? `<div class="pm-act"><button class="btn wa" data-action="pnotify">${ic("chat", 20)}Me prévenir sur WhatsApp</button></div>`
      : `<div class="pm-act"><div class="row"><div class="qty"><button data-action="pdec" aria-label="Diminuer la quantité">${ic("minus", 16)}</button><span>${pm.qty}</span><button data-action="pinc" aria-label="Augmenter la quantité">${ic("plus", 16)}</button></div><span class="cat">${money((Number(p.price) || 0) * pm.qty)}</span></div>` +
        `<button class="btn" data-action="padd">${ic("bag", 20)}Ajouter au panier</button><button class="btn wa" data-action="pwa">${ic("chat", 20)}Commander sur WhatsApp</button></div>`) +
    `<button class="btn line small shr" data-action="pshare">${ic("share", 16)}Partager</button></div>`;
}
async function shareProduct(p) {
  const url = `${location.origin}${location.pathname}?p=${encodeURIComponent(p.id)}`;
  try { if (navigator.share) { await navigator.share({ title: p.name, text: `${p.name} : ${money(p.price)}`, url }); return; } }
  catch (e) { if (e && e.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(url); toast("Lien copié"); }
  catch { openExternal(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`); }
}

/* ===== Événements ===== */
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-action]");
  if (!t) return;
  const a = t.dataset.action, id = t.dataset.id;
  const p = pm && find(pm.id);
  switch (a) {
    case "top": window.scrollTo({ top: 0, behavior: "smooth" }); break;
    case "cart": openCart(); break;
    case "close": closeLayer(); break;
    case "open": openProduct(id); break;
    case "add": {
      if (paused()) { toast(pauseMsg()); break; }
      const x = find(id); addToCart(id, 1); if (x) toast(`${x.name} ajouté au panier`); break;
    }
    case "chip": ui.cat = t.dataset.cat; renderCategories(); renderPublic(); break;
    case "inc": addToCart(id, 1); renderCart(); break;
    case "dec": {
      const it = cart.find((i) => i.id === id);
      if (it) { it.qty -= 1; if (it.qty <= 0) cart = cart.filter((i) => i.id !== id); }
      saveCart(); renderCart(); break;
    }
    case "rm": cart = cart.filter((i) => i.id !== id); saveCart(); renderCart(); break;
    case "order": sendOrder(); break;
    case "wa-hello": openExternal(waUrl(`Bonjour ${NAME}, j'ai une question.`)); break;
    case "pdec": if (pm && pm.qty > 1) { pm.qty -= 1; renderProduct(); } break;
    case "pinc": if (pm && p && pm.qty < maxQty(p)) { pm.qty += 1; renderProduct(); } break;
    case "padd":
      if (paused()) { toast(pauseMsg()); break; }
      if (pm && p) { addToCart(p.id, pm.qty); toast(`${p.name} ajouté au panier`); closeLayer(); }
      break;
    case "pwa":
      if (paused()) { toast(pauseMsg()); break; }
      if (pm && p) { trackOrder([p.id]); openExternal(waUrl(orderText([{ p, qty: pm.qty }]))); }
      break;
    case "pnotify": if (p) { countClick(p.id); openExternal(orderLink(p)); } break;
    case "pshare": if (p) shareProduct(p); break;
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && layer.innerHTML) closeLayer();
  if (e.key === "Enter" && e.target.classList && e.target.classList.contains("card")) openProduct(e.target.dataset.id);
});
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.id === "q") { ui.q = t.value; renderPublic(); }
  else if (t.dataset && t.dataset.c) { cust[t.dataset.c] = t.value; lsSet("aeterna_cust_v1", cust); }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "sort") { ui.sort = e.target.value; renderPublic(); }
});

/* ===== Données en direct ===== */
updateCount();
applySettings();
renderCategories();
renderPublic();

onSnapshot(doc(db, "settings", "shop"), (snap) => {
  if (snap.exists()) { cfg = { ...cfg, ...snap.data() }; applySettings(); }
}, () => { /* réglages par défaut */ });

onSnapshot(
  query(collection(db, "products"), where("active", "==", true)),
  (snap) => {
    publicProducts = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => createdMs(b) - createdMs(a));
    shopLoaded = true; shopError = false;
    renderCategories();
    renderPublic();
    if (pm) renderProduct();
    if ($("cbody")) renderCart();
    const pid = params.get("p");
    if (pid && !deepLinkDone && find(pid)) { deepLinkDone = true; openProduct(pid); }
  },
  () => { shopError = true; renderPublic(); }
);

/* ===== Bannière technique ===== */
const cookie = $("cookie");
let cookieSeen = false;
try { cookieSeen = !!localStorage.getItem("aeterna-cookies"); } catch { /* navigation privée */ }
if (!cookieSeen) cookie.hidden = false;
$("cookie-ok").addEventListener("click", () => {
  try { localStorage.setItem("aeterna-cookies", "1"); } catch { /* navigation privée */ }
  cookie.hidden = true;
});
if (location.hash === "#espace") location.replace("admin.html");
$("year").textContent = String(new Date().getFullYear());
