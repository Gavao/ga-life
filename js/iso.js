// Disegno isometrico: le caselle della casa (x verso destra-giù, y verso sinistra-giù) diventano rombi.
// Tutto è fatto di "blocchi" (box) con tre facce visibili: sopra, davanti-sinistra, davanti-destra.

/** Vista: zoom e spostamento. Una casella è larga TW e alta TH pixel sullo schermo. */
export function makeView() {
  const v = {
    z: 1, ox: 0, oy: 0,
    get TW() { return 64 * this.z; },
    get TH() { return 32 * this.z; },
    /** Casella (x, y) e altezza h (in pixel a zoom 1) → punto sullo schermo. */
    at(x, y, h = 0) { return [this.ox + (x - y) * this.TW / 2, this.oy + (x + y) * this.TH / 2 - h * this.z]; },
    /** Punto sullo schermo → casella (con decimali), sul pavimento. */
    tile(sx, sy) {
      const a = (sx - this.ox) / (this.TW / 2), b = (sy - this.oy) / (this.TH / 2);
      return [(a + b) / 2, (b - a) / 2];
    },
  };
  return v;
}

// ---------------------------------------------------------------- colori
const hex = c => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export function shade(c, k) {   // k > 0 schiarisce, k < 0 scurisce
  if (!c.startsWith('#')) return c;
  const [r, g, b] = hex(c);
  const f = v => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function poly(ctx, pts, fill, stroke = null) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

/**
 * Blocco dalla casella (x, y), largo w e profondo d caselle, da altezza z0 a z0 + h (pixel a zoom 1).
 * color: colore base; top/left/right: colori delle facce se si vogliono diversi.
 */
export function box(ctx, v, x, y, w, d, h, color, o = {}) {
  const z0 = o.z0 ?? 0;
  const A = v.at(x, y, z0 + h), B = v.at(x + w, y, z0 + h), C = v.at(x + w, y + d, z0 + h), D = v.at(x, y + d, z0 + h);
  const Cb = v.at(x + w, y + d, z0), Db = v.at(x, y + d, z0), Bb = v.at(x + w, y, z0);
  const line = o.line ?? 'rgba(0,0,0,.18)';
  poly(ctx, [D, C, Cb, Db], o.left ?? color, line);                 // faccia davanti-sinistra
  poly(ctx, [C, B, Bb, Cb], o.right ?? shade(color, -0.2), line);    // faccia davanti-destra
  poly(ctx, [A, B, C, D], o.top ?? shade(color, 0.15), line);        // sopra
}

/** Punto su una faccia visibile di un rettangolo: face 'L' (davanti-sinistra) o 'R'; u lungo la faccia, h altezza. */
export function onFace(v, r, face, u, h) {
  return face === 'L' ? v.at(r.x + r.w * u, r.y + r.d, h) : v.at(r.x + r.w, r.y + r.d * (1 - u), h);
}

/** Quadrilatero disegnato su una faccia (es. lo schermo della TV): da u0 a u1, da h0 a h1. */
export function facePanel(ctx, v, r, face, u0, u1, h0, h1, fill) {
  poly(ctx, [onFace(v, r, face, u0, h0), onFace(v, r, face, u1, h0), onFace(v, r, face, u1, h1), onFace(v, r, face, u0, h1)], fill);
}

export function floorTile(ctx, v, x, y, color, line = 'rgba(0,0,0,.08)') {
  poly(ctx, [v.at(x, y), v.at(x + 1, y), v.at(x + 1, y + 1), v.at(x, y + 1)], color, line);
}

/** Muro di fondo: lungo il bordo y = 0 (from x0 a x1) o x = 0 (da y0 a y1), alto h. */
export function wallY0(ctx, v, x0, x1, h, color) {
  poly(ctx, [v.at(x0, 0), v.at(x1, 0), v.at(x1, 0, h), v.at(x0, 0, h)], color, 'rgba(0,0,0,.15)');
  poly(ctx, [v.at(x0, 0, h), v.at(x1, 0, h), v.at(x1, -0.15, h), v.at(x0, -0.15, h)], shade(color, 0.3));
}
export function wallX0(ctx, v, y0, y1, h, color) {
  poly(ctx, [v.at(0, y0), v.at(0, y1), v.at(0, y1, h), v.at(0, y0, h)], shade(color, -0.12), 'rgba(0,0,0,.15)');
  poly(ctx, [v.at(0, y0, h), v.at(0, y1, h), v.at(-0.15, y1, h), v.at(-0.15, y0, h)], shade(color, 0.3));
}
/** Finestra disegnata sul muro di fondo. */
export function windowY0(ctx, v, x, w, h0, h1) {
  poly(ctx, [v.at(x, 0, h0), v.at(x + w, 0, h0), v.at(x + w, 0, h1), v.at(x, 0, h1)], '#bfe3ff', '#f8fafc');
  poly(ctx, [v.at(x + w / 2 - 0.03, 0, h0), v.at(x + w / 2 + 0.03, 0, h0), v.at(x + w / 2 + 0.03, 0, h1), v.at(x + w / 2 - 0.03, 0, h1)], '#f8fafc');
}
export function windowX0(ctx, v, y, w, h0, h1) {
  poly(ctx, [v.at(0, y, h0), v.at(0, y + w, h0), v.at(0, y + w, h1), v.at(0, y, h1)], '#a9d4f5', '#f8fafc');
}

// ---------------------------------------------------------------- Sim
/**
 * Sim in piedi (o seduto/sdraiato) con i piedi nel punto (sx, sy) dello schermo. look: aspetto;
 * face: 1 guarda a destra, -1 a sinistra; walk: fase del passo; mood 0-100 per il rombo sopra la testa.
 */
export function drawSim(ctx, v, sx, sy, look, o = {}) {
  const z = v.z;
  const t = performance.now() / 1000;
  ctx.save();
  ctx.translate(sx, sy);
  if (o.pose === 'sleep') { ctx.rotate(-Math.PI / 2 * (o.face ?? 1)); ctx.translate(0, 6 * z); }
  if (o.scaleX) ctx.scale(o.scaleX, 1);
  const k = 0.9 * z;
  const bob = o.walk ? Math.abs(Math.sin(o.walk)) * 2 * k : 0;
  const sit = o.pose === 'sit';
  // ombra (in piscina: cerchi nell'acqua e si vede solo dal petto in su)
  if (o.pose === 'swim') {
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.lineWidth = 1.5;
    const r = 12 + Math.sin(performance.now() / 300) * 2;
    ctx.beginPath(); ctx.ellipse(0, -20 * k, r * k, r * 0.45 * k, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.rect(-40 * k, -120 * k, 80 * k, 100 * k); ctx.clip();
  } else if (o.pose !== 'sleep') {
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.beginPath(); ctx.ellipse(0, 0, 11 * k, 4.5 * k, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.translate(0, -bob - (sit ? 8 * k : 0));
  // gambe
  const step = o.walk ? Math.sin(o.walk) * 3 * k : 0;
  ctx.fillStyle = look.pants;
  if (sit) {
    ctx.fillRect(-6 * k, -6 * k, 5 * k, 6 * k);
    ctx.fillRect(1 * k, -6 * k, 5 * k, 6 * k);
  } else {
    ctx.fillRect(-6 * k, -14 * k + step, 5 * k, 14 * k - step);
    ctx.fillRect(1 * k, -14 * k - step, 5 * k, 14 * k + step);
  }
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(-7 * k, -2 * k + (sit ? -4 * k : step), 6 * k, 3 * k);
  ctx.fillRect(1 * k, -2 * k + (sit ? -4 * k : -step), 6 * k, 3 * k);
  // corpo
  const bodyTop = sit ? -24 * k : -30 * k;
  ctx.fillStyle = look.shirt;
  rr(ctx, -9 * k, bodyTop, 18 * k, 17 * k, 5 * k);
  ctx.fill();
  ctx.fillStyle = look.skin;   // braccia
  const arm = o.walk ? Math.sin(o.walk) * 3 * k : 0;
  ctx.fillRect(-12 * k, bodyTop + 3 * k + arm, 4 * k, 11 * k);
  ctx.fillRect(8 * k, bodyTop + 3 * k - arm, 4 * k, 11 * k);
  // testa
  const hy = bodyTop - 12 * k;
  if (look.long) {   // capelli lunghi dietro la testa
    ctx.fillStyle = look.hair;
    rr(ctx, -12 * k, hy - 4 * k, 24 * k, 24 * k, 8 * k);
    ctx.fill();
  }
  ctx.fillStyle = look.skin;
  ctx.beginPath(); ctx.arc(0, hy, 11 * k, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = look.hair;
  ctx.beginPath(); ctx.arc(0, hy - 2 * k, 11.5 * k, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  ctx.fillRect(-11.5 * k, hy - 4 * k, 23 * k, 3 * k);
  if (o.pose !== 'sleep' && !o.back) {
    ctx.fillStyle = '#111827';
    const ex = (o.face ?? 1) * 2 * k;
    ctx.beginPath(); ctx.arc(ex - 4 * k, hy + 2 * k, 1.6 * k, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + 4 * k, hy + 2 * k, 1.6 * k, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7c2d12';
    ctx.lineWidth = 1.2 * k;
    ctx.beginPath();
    const happy = (o.mood ?? 60) >= 40;
    ctx.arc(ex, hy + (happy ? 5 : 9) * k, 3 * k, happy ? 0.15 * Math.PI : 1.15 * Math.PI, happy ? 0.85 * Math.PI : 1.85 * Math.PI);
    ctx.stroke();
  }
  // rombo sopra la testa: verde se sta bene, giallo, rosso se sta male
  if (o.plumbob) {
    const m = o.mood ?? 60;
    const py = hy - 26 * k + Math.sin(t * 2) * 2 * k;
    const sw = Math.abs(Math.cos(t * 1.6)) * 6 * k + 1.5 * k;
    ctx.fillStyle = `hsl(${Math.round(m * 1.2)}, 75%, 48%)`;
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, py - 9 * k); ctx.lineTo(sw, py); ctx.lineTo(0, py + 9 * k); ctx.lineTo(-sw, py);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Nuvoletta sopra la testa con un'emoji (cosa sta facendo o cosa gli manca). */
export function bubble(ctx, v, sx, sy, text, alert = false) {
  const z = v.z;
  const x = sx + 16 * z, y = sy - 78 * z;
  ctx.fillStyle = alert ? '#fee2e2' : '#fff';
  ctx.strokeStyle = alert ? '#ef4444' : 'rgba(0,0,0,.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, 13 * z, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(x - 9 * z, y + 13 * z, 3 * z, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.font = `${14 * z}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(text, x, y + 1);
}
