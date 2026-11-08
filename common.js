export const firebaseConfig = {
  apiKey: "AIzaSyD_oSltrEodR8ut1FWmrCbOPBVslHJogZg",
  authDomain: "white-house667.firebaseapp.com",
  projectId: "white-house667",
  storageBucket: "white-house667.firebasestorage.app",
  messagingSenderId: "499541870918",
  appId: "1:499541870918:web:ea0e30bf7214129344fd47",
  measurementId: "G-RNCC9N4WYB"
};

export const OWNER_EMAIL = "doumbiamoussa0one@gmail.com";
export const DEFAULT_WA = "2250797034070";
export const SITE_URL = "https://aeternastore.netlify.app";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmt = (n) => new Intl.NumberFormat("fr-FR").format(Number(n) || 0);
export const money = (n) => `${fmt(n)}\u00a0FCFA`;
export const digits = (s) => String(s ?? "").replace(/\D/g, "").replace(/^00/, "");
export const validWa = (s) => /^\d{8,15}$/.test(digits(s));
export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

/* Photo acceptée : adresse https ou image intégrée (webp, jpeg, png). */
export const isImg = (u) =>
  typeof u === "string" &&
  (/^https:\/\/\S+$/.test(u) || /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(u));

/* Lien externe sûr : https et domaine autorisé. */
export function safeUrl(u, hosts) {
  try {
    const x = new URL(String(u));
    if (x.protocol !== "https:") return "";
    const h = x.hostname.toLowerCase();
    return hosts.some((d) => h === d || h.endsWith("." + d)) ? x.href : "";
  } catch { return ""; }
}
export const FB_HOSTS = ["facebook.com", "fb.com", "fb.me", "m.me"];

/* Réduit une photo et la convertit en WebP pour la stocker dans la base. */
export function compressImage(file, maxSide = 900, maxChars = 450000) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error("type"));
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("read"));
    fr.onload = () => {
      const im = new Image();
      im.onerror = () => reject(new Error("img"));
      im.onload = () => {
        let side = maxSide, q = 0.78, out = "";
        for (let i = 0; i < 8; i++) {
          const k = Math.min(1, side / Math.max(im.naturalWidth, im.naturalHeight));
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(im.naturalWidth * k));
          c.height = Math.max(1, Math.round(im.naturalHeight * k));
          c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
          out = c.toDataURL("image/webp", q);
          if (!out.startsWith("data:image/webp")) out = c.toDataURL("image/jpeg", q);
          if (out.length <= maxChars) return resolve(out);
          q = Math.max(0.5, q - 0.08);
          side = Math.round(side * 0.85);
        }
        out.length <= 700000 ? resolve(out) : reject(new Error("big"));
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
