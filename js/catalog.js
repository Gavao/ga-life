// Catalogo degli oggetti di casa e giardino: prezzo, ingombro (w × d caselle), azioni, qualità e disegno.
// Ogni oggetto è disegnato nel suo verso "di base" (davanti verso +y) e ruotato a passi di 90°:
// rot 0 davanti verso +y, 1 verso +x, 2 verso -y, 3 verso -x.
import { box, facePanel, shade } from './iso.js';

// Bisogni dei Sim
export const NEEDS = [
  ['fame', '🍔', 'Fame'], ['energia', '⚡', 'Energia'], ['igiene', '🚿', 'Igiene'],
  ['vescica', '🚽', 'Vescica'], ['svago', '🎮', 'Svago'], ['socialita', '💬', 'Socialità'],
];
// Abilità (da 0 a 10): salgono facendo le attività giuste
export const SKILLS = [
  ['cucina', '🍳', 'Cucina'], ['fitness', '🏃', 'Fitness'], ['logica', '♟️', 'Logica'],
  ['creativita', '🎨', 'Creatività'], ['carisma', '🗣️', 'Carisma'],
];

/*
 * Azione: { id, label, emoji, dur (minuti di gioco) | until (finché il bisogno è pieno), gain: { bisogno: punti in
 * tutta l'azione (o all'ora se until) }, pose: 'sit' | 'lie' | 'swim', inside (si entra nell'oggetto), skill,
 * then: azione che segue, dishes: lascia i piatti sporchi }.
 */
const A = {
  spuntino: { id: 'spuntino', label: 'Fai uno spuntino', emoji: '🥪', dur: 12, gain: { fame: 28, vescica: -5 } },
  scalda: { id: 'scalda', label: 'Scalda qualcosa al microonde', emoji: '🍲', dur: 15, gain: { fame: 40, vescica: -6 } },
  cucina: { id: 'cucina', label: 'Cucina un pasto', emoji: '🍳', dur: 30, gain: { fame: 5 }, skill: 'cucina', then: 'mangia' },
  grigliata: { id: 'grigliata', label: 'Fai una grigliata', emoji: '🍖', dur: 35, gain: { fame: 8, svago: 10 }, skill: 'cucina', then: 'mangia' },
  mangia: { id: 'mangia', label: 'Mangia', emoji: '🍝', dur: 20, gain: { fame: 60, vescica: -10, socialita: 4 }, pose: 'sit', hidden: true, dishes: true },
  dormi: { id: 'dormi', label: 'Dormi', emoji: '💤', until: 'energia', gain: { energia: 13 }, pose: 'lie' },
  pisolino: { id: 'pisolino', label: 'Fai un pisolino', emoji: '😴', dur: 60, gain: { energia: 10 }, pose: 'lie' },
  doccia: { id: 'doccia', label: 'Fai la doccia', emoji: '🚿', dur: 18, gain: { igiene: 85, vescica: -2 }, inside: true },
  vasca: { id: 'vasca', label: 'Fai un bagno rilassante', emoji: '🛁', dur: 40, gain: { igiene: 95, svago: 22, energia: 6 }, pose: 'lie', inside: true },
  bagno: { id: 'bagno', label: 'Usa il bagno', emoji: '🚽', dur: 6, gain: { vescica: 100, igiene: -3 }, pose: 'sit', inside: true },
  siediti: { id: 'siediti', label: 'Siediti a riposare', emoji: '🛋️', dur: 40, gain: { energia: 6, svago: 8 }, pose: 'sit' },
  divanoPisolino: { id: 'divanoPisolino', label: 'Pisolino sul divano', emoji: '😴', dur: 60, gain: { energia: 9 }, pose: 'lie' },
  tv: { id: 'tv', label: 'Guarda la TV', emoji: '📺', dur: 60, gain: { svago: 38, energia: -2 } },
  tvCucina: { id: 'tvCucina', label: 'Guarda un programma di cucina', emoji: '👩‍🍳', dur: 60, gain: { svago: 20 }, skill: 'cucina' },
  console: { id: 'console', label: 'Gioca alla console', emoji: '🕹️', dur: 60, gain: { svago: 50, energia: -4 } },
  gioca: { id: 'gioca', label: 'Gioca al computer', emoji: '🎮', dur: 60, gain: { svago: 45, energia: -4 }, pose: 'sit' },
  lavoro: { id: 'lavoro', label: 'Cerca lavoro', emoji: '💼', dur: 10, gain: {}, pose: 'sit', special: 'jobs' },
  social: { id: 'social', label: 'Chatta con gli amici', emoji: '📱', dur: 40, gain: { socialita: 22, svago: 8 }, pose: 'sit' },
  programma: { id: 'programma', label: 'Impara a programmare', emoji: '👨‍💻', dur: 60, gain: { svago: 5 }, pose: 'sit', skill: 'logica' },
  leggi: { id: 'leggi', label: 'Leggi un libro', emoji: '📖', dur: 50, gain: { svago: 26 } },
  studiaCucina: { id: 'studiaCucina', label: 'Studia un libro di ricette', emoji: '📕', dur: 60, gain: { svago: 8 }, skill: 'cucina' },
  balla: { id: 'balla', label: 'Balla', emoji: '💃', dur: 30, gain: { svago: 32, energia: -6, igiene: -4 }, dance: true },
  allenati: { id: 'allenati', label: 'Corri sul tapis roulant', emoji: '🏃', dur: 45, gain: { svago: 10, energia: -14, igiene: -18, fame: -8 }, skill: 'fitness', run: true },
  pesi: { id: 'pesi', label: 'Solleva pesi', emoji: '🏋️', dur: 45, gain: { svago: 8, energia: -12, igiene: -14, fame: -6 }, skill: 'fitness', pose: 'lie' },
  lavamani: { id: 'lavamani', label: 'Lavati le mani', emoji: '🧼', dur: 4, gain: { igiene: 12 } },
  specchio: { id: 'specchio', label: 'Sistemati allo specchio', emoji: '🪞', dur: 8, gain: { igiene: 6, svago: 4 } },
  parla: { id: 'parla', label: 'Esercitati a parlare', emoji: '🗣️', dur: 40, gain: { svago: 6 }, skill: 'carisma' },
  scacchi: { id: 'scacchi', label: 'Studia gli scacchi', emoji: '♟️', dur: 50, gain: { svago: 18 }, pose: 'sit', skill: 'logica' },
  chitarra: { id: 'chitarra', label: 'Suona la chitarra', emoji: '🎸', dur: 45, gain: { svago: 28 }, skill: 'creativita' },
  dipingi: { id: 'dipingi', label: 'Dipingi un quadro', emoji: '🎨', dur: 90, gain: { svago: 22 }, skill: 'creativita', special: 'quadro' },
  acquario: { id: 'acquario', label: 'Guarda i pesci', emoji: '🐠', dur: 25, gain: { svago: 14, energia: 3 } },
  cambiati: { id: 'cambiati', label: 'Cambiati i vestiti', emoji: '👕', dur: 6, gain: { igiene: 8 } },
  nuota: { id: 'nuota', label: 'Nuota in piscina', emoji: '🏊', dur: 45, gain: { svago: 34, igiene: 10, energia: -10 }, skill: 'fitness', pose: 'swim', inside: true },
  amaca: { id: 'amaca', label: 'Riposa sull\'amaca', emoji: '🌴', dur: 60, gain: { energia: 10, svago: 12 }, pose: 'lie' },
  dondola: { id: 'dondola', label: 'Dondolati', emoji: '🎠', dur: 20, gain: { svago: 18 }, pose: 'sit' },
  fontana: { id: 'fontana', label: 'Ammira la fontana', emoji: '⛲', dur: 15, gain: { svago: 10 } },
  sparecchia: { id: 'sparecchia', label: 'Porta via i piatti', emoji: '🍽️', dur: 4, gain: { igiene: -2 }, hidden: true },
};
export const ACTIONS = A;

// Interazioni tra i due Sim (rel: rapporto guadagnato, min: rapporto minimo richiesto)
export const SOCIAL = [
  { id: 'chiacchiera', label: 'Chiacchiera', emoji: '💬', dur: 20, gain: { socialita: 26, svago: 6 }, rel: 3, min: 0, skill: 'carisma' },
  { id: 'scherza', label: 'Racconta una barzelletta', emoji: '😂', dur: 10, gain: { socialita: 14, svago: 18 }, rel: 3, min: 0 },
  { id: 'abbraccia', label: 'Abbraccia', emoji: '🤗', dur: 6, gain: { socialita: 18 }, rel: 4, min: 30 },
  { id: 'solletico', label: 'Fai il solletico', emoji: '🤭', dur: 8, gain: { svago: 20, socialita: 10 }, rel: 3, min: 40 },
  { id: 'bacia', label: 'Bacia', emoji: '💋', dur: 6, gain: { socialita: 22, svago: 10 }, rel: 5, min: 55 },
  { id: 'balliamo', label: 'Balliamo insieme', emoji: '💃', dur: 25, gain: { svago: 30, socialita: 20, energia: -6 }, rel: 4, min: 45 },
];

// ---------------------------------------------------------------- pezzi ruotati
/** Rettangolo nel verso di base (lx, ly, lw, ld dentro w0 × d0) → rettangolo sulla casa, secondo la rotazione. */
export function part(o, lx, ly, lw, ld) {
  const T = TYPES[o.type], W0 = T.w, D0 = T.d;
  switch (o.rot) {
    case 1: return { x: o.x + ly, y: o.y + (W0 - lx - lw), w: ld, d: lw };
    case 2: return { x: o.x + (W0 - lx - lw), y: o.y + (D0 - ly - ld), w: lw, d: ld };
    case 3: return { x: o.x + (D0 - ly - ld), y: o.y + lx, w: ld, d: lw };
    default: return { x: o.x + lx, y: o.y + ly, w: lw, d: ld };
  }
}
/** Punto nel verso di base → punto sulla casa. */
export function point(o, lx, ly) {
  const r = part(o, lx, ly, 0, 0);
  return [r.x, r.y];
}
export const footprint = o => part(o, 0, 0, TYPES[o.type].w, TYPES[o.type].d);
/** Faccia su cui sta il "davanti" dell'oggetto, se è visibile ('L' o 'R'), altrimenti null. */
export const frontFace = o => (o.rot === 0 ? 'L' : o.rot === 1 ? 'R' : null);

const pb = (ctx, v, o, lx, ly, lw, ld, h, color, opt = {}) => {
  const r = part(o, lx, ly, lw, ld);
  box(ctx, v, r.x, r.y, r.w, r.d, h, color, opt);
  return r;
};
const blob = (ctx, v, o, lx, ly, h, r, color) => {   // chioma, cespuglio, fiore
  const [x, y] = point(o, lx, ly);
  const [sx, sy] = v.at(x, y, h);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(sx, sy, r * v.z, 0, Math.PI * 2); ctx.fill();
};

// ---------------------------------------------------------------- disegni riusati
function drawBed(ctx, v, o, w, frame, color, lux) {
  pb(ctx, v, o, 0, 0, w, 0.25, lux ? 44 : 34, frame);
  pb(ctx, v, o, 0, 0.2, w, 1.8, 12, shade(frame, 0.15));
  pb(ctx, v, o, 0.05, 0.25, w - 0.1, 1.7, 8, '#f8fafc', { z0: 12 });
  for (let i = 0; i < w; i++) pb(ctx, v, o, i + 0.12, 0.3, 0.75, 0.38, 6, '#ffffff', { z0: 20 });
  pb(ctx, v, o, 0.05, 0.85, w - 0.1, 1.1, 3, color, { z0: 20 });
  if (lux) pb(ctx, v, o, 0.05, 1.6, w - 0.1, 0.35, 1.5, shade(color, -0.25), { z0: 23 });
}
function drawSofa(ctx, v, o, w, c, lux) {
  pb(ctx, v, o, 0, 0, w, 0.32, lux ? 36 : 32, shade(c, -0.15));
  pb(ctx, v, o, 0, 0.3, w, 0.65, 14, c);
  pb(ctx, v, o, 0, 0.3, 0.2, 0.65, 22, shade(c, -0.1));
  pb(ctx, v, o, w - 0.2, 0.3, 0.2, 0.65, 22, shade(c, -0.1));
  for (let i = 0; i < w; i++) pb(ctx, v, o, i + (i ? 0.02 : 0.22), 0.35, i === w - 1 && i ? 0.76 : 0.76, 0.56, 3, shade(c, 0.12), { z0: 14 });
  if (lux) { pb(ctx, v, o, 0.3, 0.05, 0.4, 0.2, 12, '#fde68a', { z0: 18 }); pb(ctx, v, o, w - 0.7, 0.05, 0.4, 0.2, 12, '#fde68a', { z0: 18 }); }
}
/**
 * Tavolo in due strati: 'back' = le sedie dalla parte lontana (sullo schermo), 'front' = gambe, piano e sedie
 * dalla parte vicina. In mezzo si disegnano i Sim seduti: così chi sta dietro non finisce sopra il tavolo.
 */
function drawTable(ctx, v, o, which, chairX, seat, back, top, leg, legs, plane) {
  const T = TYPES[o.type];
  const f = footprint(o);
  const center = f.x + f.w / 2 + f.y + f.d / 2;
  for (const ly of [0.02, 1.62]) {
    for (const lx of chairX) {
      const r = part(o, lx, ly, 0.5, 0.36);
      const far = r.x + r.w / 2 + r.y + r.d / 2 < center;
      if (far !== (which === 'back')) continue;
      pb(ctx, v, o, lx, ly, 0.5, 0.36, 16, seat);
      pb(ctx, v, o, lx, ly < 1 ? 0.02 : 1.9, 0.5, 0.08, 34, back);
    }
  }
  if (which === 'front') {
    for (const l of legs) pb(ctx, v, o, ...l, 24, leg);
    pb(ctx, v, o, ...plane, 4, top, { z0: 24 });
  }
  return T;
}

function counter(ctx, v, o, top = '#111827') {
  const r = pb(ctx, v, o, 0, 0.05, 1, 0.9, 34, '#f1f5f9');
  pb(ctx, v, o, 0.02, 0.07, 0.96, 0.86, 1.5, top, { z0: 34 });
  return r;
}

// ---------------------------------------------------------------- oggetti
/*
 * Tipo: { name, cat, price, w, d, actions, seats: [[lx, ly]] (dove ci si siede/sdraia), seatH (altezza del posto),
 * q (qualità: moltiplica i benefici), amb (ambiente: fa bella la stanza), passable, flat, colors, draw }.
 */
export const TYPES = {
  // ---------------- Camera
  letto: {
    name: 'Letto matrimoniale', cat: 'Camera', price: 600, w: 2, d: 2, actions: ['dormi', 'pisolino'],
    seats: [[0.5, 1.0], [1.5, 1.0]], seatH: 20, colors: ['#60a5fa', '#f472b6', '#a78bfa', '#34d399'],
    draw(ctx, v, o) { drawBed(ctx, v, o, 2, '#92400e', o.color ?? '#60a5fa'); },
  },
  lettoLusso: {
    name: 'Letto matrimoniale di lusso', cat: 'Camera', price: 1600, w: 2, d: 2, actions: ['dormi', 'pisolino'], q: 1.4, amb: 3,
    seats: [[0.5, 1.0], [1.5, 1.0]], seatH: 20, colors: ['#7c3aed', '#be123c', '#0f766e', '#1e3a8a'],
    draw(ctx, v, o) { drawBed(ctx, v, o, 2, '#1f2937', o.color ?? '#7c3aed', true); },
  },
  lettoSingolo: {
    name: 'Letto singolo', cat: 'Camera', price: 300, w: 1, d: 2, actions: ['dormi', 'pisolino'],
    seats: [[0.5, 1.0]], seatH: 20, colors: ['#60a5fa', '#f472b6', '#facc15'],
    draw(ctx, v, o) { drawBed(ctx, v, o, 1, '#a16207', o.color ?? '#60a5fa'); },
  },
  comodino: {
    name: 'Comodino con abat-jour', cat: 'Camera', price: 110, w: 1, d: 1, actions: [], amb: 1,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.2, 0.15, 0.6, 0.55, 22, '#92400e');
      pb(ctx, v, o, 0.42, 0.35, 0.16, 0.16, 12, '#6b7280', { z0: 22 });
      pb(ctx, v, o, 0.32, 0.25, 0.36, 0.36, 10, '#fef3c7', { z0: 34 });
    },
  },
  armadio: {
    name: 'Armadio', cat: 'Camera', price: 380, w: 2, d: 1, actions: ['cambiati'], amb: 1,
    draw(ctx, v, o) {
      const r = pb(ctx, v, o, 0.05, 0.1, 1.9, 0.7, 78, '#a16207');
      const f = frontFace(o);
      if (f) { facePanel(ctx, v, r, f, 0.49, 0.51, 4, 74, '#78350f'); facePanel(ctx, v, r, f, 0.4, 0.44, 36, 46, '#fde68a'); facePanel(ctx, v, r, f, 0.56, 0.6, 36, 46, '#fde68a'); }
    },
  },
  specchio: {
    name: 'Specchio a figura intera', cat: 'Camera', price: 200, w: 1, d: 1, actions: ['parla', 'specchio'], amb: 1,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.15, 0.3, 0.7, 0.2, 4, '#78350f');
      const r = pb(ctx, v, o, 0.2, 0.35, 0.6, 0.08, 70, '#78350f', { z0: 4 });
      const f = frontFace(o);
      if (f) facePanel(ctx, v, r, f, 0.1, 0.9, 10, 70, '#bae6fd');
    },
  },
  // ---------------- Bagno
  wc: {
    name: 'Water', cat: 'Bagno', price: 220, w: 1, d: 1, actions: ['bagno'], seats: [[0.5, 0.55]], seatH: 18,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.22, 0.05, 0.56, 0.22, 34, '#f8fafc');
      pb(ctx, v, o, 0.3, 0.25, 0.4, 0.55, 18, '#ffffff');
      pb(ctx, v, o, 0.28, 0.25, 0.44, 0.6, 2, '#e2e8f0', { z0: 18 });
    },
  },
  doccia: {
    name: 'Doccia', cat: 'Bagno', price: 520, w: 1, d: 1, actions: ['doccia'], seats: [[0.5, 0.5]], seatH: 4, behind: true,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0, 0, 1, 1, 5, '#f8fafc');
      pb(ctx, v, o, 0.45, 0.02, 0.1, 0.06, 12, '#94a3b8', { z0: 74 });
    },
    // il vetro si disegna davanti al Sim
    front(ctx, v, o) { pb(ctx, v, o, 0.02, 0.02, 0.96, 0.96, 80, 'rgba(147,197,253,.22)', { z0: 5, top: 'rgba(191,219,254,.15)', right: 'rgba(96,165,250,.2)', line: 'rgba(255,255,255,.6)' }); },
  },
  vasca: {
    name: 'Vasca da bagno', cat: 'Bagno', price: 950, w: 2, d: 1, actions: ['vasca'], seats: [[1, 0.5]], seatH: 8, q: 1.2, amb: 2, behind: true,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.05, 0.05, 1.9, 0.9, 22, '#f8fafc');
      pb(ctx, v, o, 0.15, 0.15, 1.7, 0.7, 2, '#7dd3fc', { z0: 18 });
      pb(ctx, v, o, 0.1, 0.4, 0.1, 0.2, 10, '#94a3b8', { z0: 22 });
    },
    front(ctx, v, o) { pb(ctx, v, o, 0.05, 0.75, 1.9, 0.2, 22, '#f1f5f9'); },
  },
  lavandino: {
    name: 'Lavandino con specchio', cat: 'Bagno', price: 240, w: 1, d: 1, actions: ['lavamani', 'specchio'],
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.15, 0.05, 0.7, 0.55, 30, '#e2e8f0');
      pb(ctx, v, o, 0.25, 0.12, 0.5, 0.36, 1, '#94a3b8', { z0: 30 });
      pb(ctx, v, o, 0.15, 0, 0.7, 0.05, 30, '#bae6fd', { z0: 42 });
    },
  },
  // ---------------- Cucina
  frigo: {
    name: 'Frigorifero', cat: 'Cucina', price: 450, w: 1, d: 1, actions: ['spuntino'],
    draw(ctx, v, o) {
      const r = pb(ctx, v, o, 0.08, 0.1, 0.84, 0.8, 76, '#e5e7eb');
      const f = frontFace(o);
      if (f) { facePanel(ctx, v, r, f, 0.02, 0.98, 46, 47.5, '#9ca3af'); facePanel(ctx, v, r, f, 0.8, 0.86, 52, 66, '#6b7280'); facePanel(ctx, v, r, f, 0.8, 0.86, 22, 40, '#6b7280'); }
    },
  },
  frigoLusso: {
    name: 'Frigo americano', cat: 'Cucina', price: 1150, w: 1, d: 1, actions: ['spuntino'], q: 1.3, amb: 1,
    draw(ctx, v, o) {
      const r = pb(ctx, v, o, 0.04, 0.08, 0.92, 0.84, 82, '#94a3b8');
      const f = frontFace(o);
      if (f) { facePanel(ctx, v, r, f, 0.49, 0.51, 2, 80, '#475569'); facePanel(ctx, v, r, f, 0.1, 0.4, 50, 64, '#0ea5e9'); }
    },
  },
  fornello: {
    name: 'Cucina con fornelli', cat: 'Cucina', price: 380, w: 1, d: 1, actions: ['cucina'],
    draw(ctx, v, o) {
      const r = counter(ctx, v, o);
      const f = frontFace(o);
      if (f) facePanel(ctx, v, r, f, 0.15, 0.85, 6, 26, '#1f2937');
      for (const [lx, ly] of [[0.28, 0.3], [0.68, 0.3], [0.28, 0.68], [0.68, 0.68]]) {
        const [x, y] = point(o, lx, ly);
        const [sx, sy] = v.at(x, y, 35.5);
        ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(sx, sy, 7 * v.z, 3.5 * v.z, 0, 0, Math.PI * 2); ctx.stroke();
      }
    },
  },
  cucinaPro: {
    name: 'Cucina professionale', cat: 'Cucina', price: 1300, w: 1, d: 1, actions: ['cucina'], q: 1.3, amb: 1,
    draw(ctx, v, o) {
      const r = pb(ctx, v, o, 0, 0.05, 1, 0.9, 34, '#9ca3af');
      pb(ctx, v, o, 0.02, 0.07, 0.96, 0.86, 1.5, '#111827', { z0: 34 });
      pb(ctx, v, o, 0.1, 0.05, 0.8, 0.1, 24, '#d1d5db', { z0: 35 });
      const f = frontFace(o);
      if (f) { facePanel(ctx, v, r, f, 0.1, 0.9, 6, 28, '#111827'); facePanel(ctx, v, r, f, 0.15, 0.85, 26, 28, '#f59e0b'); }
    },
  },
  microonde: {
    name: 'Mobile con microonde', cat: 'Cucina', price: 260, w: 1, d: 1, actions: ['scalda'],
    draw(ctx, v, o) {
      counter(ctx, v, o, '#475569');
      const r = pb(ctx, v, o, 0.15, 0.15, 0.7, 0.5, 18, '#e5e7eb', { z0: 35 });
      const f = frontFace(o);
      if (f) facePanel(ctx, v, r, f, 0.1, 0.65, 39, 50, '#111827');
    },
  },
  bancone: {
    name: 'Bancone', cat: 'Cucina', price: 140, w: 1, d: 1, actions: [],
    draw(ctx, v, o) { counter(ctx, v, o, '#78716c'); },
  },
  lavello: {
    name: 'Lavello', cat: 'Cucina', price: 160, w: 1, d: 1, actions: ['lavamani'], sink: true,
    draw(ctx, v, o) {
      counter(ctx, v, o, '#cbd5e1');
      pb(ctx, v, o, 0.2, 0.25, 0.6, 0.5, 1, '#94a3b8', { z0: 35 });
      pb(ctx, v, o, 0.45, 0.08, 0.1, 0.12, 12, '#cbd5e1', { z0: 35 });
    },
  },
  lavastoviglie: {
    name: 'Lavastoviglie', cat: 'Cucina', price: 480, w: 1, d: 1, actions: [], sink: true, amb: 1,
    draw(ctx, v, o) {
      const r = counter(ctx, v, o, '#cbd5e1');
      const f = frontFace(o);
      if (f) { facePanel(ctx, v, r, f, 0.08, 0.92, 4, 30, '#e5e7eb'); facePanel(ctx, v, r, f, 0.3, 0.7, 26, 28, '#334155'); }
    },
  },
  tavolo: {
    name: 'Tavolo con 2 sedie', cat: 'Cucina', price: 280, w: 2, d: 2, actions: [], seats: [[1, 0.25], [1, 1.75]], seatH: 16, eat: true, top: 28,
    draw(ctx, v, o) { drawTable(ctx, v, o, 'back', [0.75], '#b45309', '#92400e', '#d97706', '#78350f', [[0.92, 0.6, 0.16, 0.8]], [0.35, 0.45, 1.3, 1.1]); },
    front(ctx, v, o) { drawTable(ctx, v, o, 'front', [0.75], '#b45309', '#92400e', '#d97706', '#78350f', [[0.92, 0.6, 0.16, 0.8]], [0.35, 0.45, 1.3, 1.1]); },
  },
  tavoloQuattro: {
    name: 'Tavolo da pranzo per 4', cat: 'Cucina', price: 620, w: 3, d: 2, actions: [], seats: [[0.95, 0.25], [2.05, 0.25], [0.95, 1.75], [2.05, 1.75]], seatH: 16, eat: true, amb: 1, top: 28,
    draw(ctx, v, o) { drawTable(ctx, v, o, 'back', [0.7, 1.8], '#57534e', '#44403c', '#f5f5f4', '#292524', [[0.5, 0.6, 0.16, 0.8], [2.34, 0.6, 0.16, 0.8]], [0.3, 0.45, 2.4, 1.1]); },
    front(ctx, v, o) { drawTable(ctx, v, o, 'front', [0.7, 1.8], '#57534e', '#44403c', '#f5f5f4', '#292524', [[0.5, 0.6, 0.16, 0.8], [2.34, 0.6, 0.16, 0.8]], [0.3, 0.45, 2.4, 1.1]); },
  },
  // ---------------- Soggiorno
  divano: {
    name: 'Divano', cat: 'Soggiorno', price: 420, w: 2, d: 1, actions: ['siediti', 'divanoPisolino'], seats: [[0.55, 0.62], [1.45, 0.62]], seatH: 14,
    colors: ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f59e0b'],
    draw(ctx, v, o) { drawSofa(ctx, v, o, 2, o.color ?? '#ef4444'); },
  },
  divanoLusso: {
    name: 'Divano in pelle', cat: 'Soggiorno', price: 1200, w: 3, d: 1, actions: ['siediti', 'divanoPisolino'], seats: [[0.7, 0.62], [1.5, 0.62], [2.3, 0.62]], seatH: 14, q: 1.3, amb: 2,
    colors: ['#78350f', '#111827', '#f5f5f4'],
    draw(ctx, v, o) { drawSofa(ctx, v, o, 3, o.color ?? '#78350f', true); },
  },
  poltrona: {
    name: 'Poltrona', cat: 'Soggiorno', price: 220, w: 1, d: 1, actions: ['siediti'], seats: [[0.5, 0.62]], seatH: 14,
    colors: ['#f59e0b', '#3b82f6', '#10b981'],
    draw(ctx, v, o) {
      const c = o.color ?? '#f59e0b';
      pb(ctx, v, o, 0.05, 0.05, 0.9, 0.3, 32, shade(c, -0.15));
      pb(ctx, v, o, 0.05, 0.32, 0.9, 0.6, 14, c);
      pb(ctx, v, o, 0.05, 0.32, 0.15, 0.6, 22, shade(c, -0.1));
      pb(ctx, v, o, 0.8, 0.32, 0.15, 0.6, 22, shade(c, -0.1));
    },
  },
  tv: {
    name: 'TV', cat: 'Soggiorno', price: 500, w: 1, d: 1, actions: ['tv', 'tvCucina'],
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.05, 0.1, 0.9, 0.6, 18, '#78350f');
      const r = pb(ctx, v, o, 0.08, 0.25, 0.84, 0.08, 30, '#111827', { z0: 18 });
      const f = frontFace(o);
      if (f) facePanel(ctx, v, r, f, 0.06, 0.94, 21, 45, `hsl(${(performance.now() / 40) % 360}, 60%, 55%)`);
    },
  },
  tvGrande: {
    name: 'TV 75 pollici', cat: 'Soggiorno', price: 1500, w: 2, d: 1, actions: ['tv', 'tvCucina'], q: 1.4, amb: 2,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.1, 0.15, 1.8, 0.55, 16, '#111827');
      const r = pb(ctx, v, o, 0.12, 0.3, 1.76, 0.06, 44, '#020617', { z0: 16 });
      const f = frontFace(o);
      if (f) facePanel(ctx, v, r, f, 0.03, 0.97, 19, 58, `hsl(${(performance.now() / 40) % 360}, 65%, 55%)`);
    },
  },
  console: {
    name: 'Console per videogiochi', cat: 'Soggiorno', price: 320, w: 1, d: 1, actions: ['console'],
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.1, 0.2, 0.8, 0.5, 14, '#374151');
      pb(ctx, v, o, 0.25, 0.3, 0.5, 0.3, 6, '#f8fafc', { z0: 14 });
      pb(ctx, v, o, 0.6, 0.62, 0.2, 0.1, 3, '#1f2937', { z0: 14 });
    },
  },
  computer: {
    name: 'Scrivania con computer', cat: 'Soggiorno', price: 800, w: 1, d: 2, actions: ['gioca', 'social', 'programma', 'lavoro'], seats: [[0.5, 1.4]], seatH: 16,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0, 0.05, 1, 0.7, 28, '#e5e7eb');
      const r = pb(ctx, v, o, 0.2, 0.12, 0.6, 0.06, 20, '#111827', { z0: 28 });
      const f = frontFace(o);
      if (f) facePanel(ctx, v, r, f, 0.08, 0.92, 31, 46, '#38bdf8');
      pb(ctx, v, o, 0.25, 0.4, 0.5, 0.15, 1.5, '#374151', { z0: 28 });
      pb(ctx, v, o, 0.28, 1.15, 0.44, 0.44, 15, '#1f2937');            // sedia
      pb(ctx, v, o, 0.28, 1.5, 0.44, 0.08, 34, '#111827');
    },
  },
  libreria: {
    name: 'Libreria', cat: 'Soggiorno', price: 180, w: 1, d: 1, actions: ['leggi', 'studiaCucina'], amb: 1,
    draw(ctx, v, o) {
      const r = pb(ctx, v, o, 0.05, 0.05, 0.9, 0.45, 72, '#92400e');
      const f = frontFace(o);
      if (f) {
        const colors = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7'];
        for (let row = 0; row < 3; row++) for (let b = 0; b < 5; b++) facePanel(ctx, v, r, f, 0.1 + b * 0.16, 0.22 + b * 0.16, 8 + row * 22, 24 + row * 22 - (b % 2) * 3, colors[(b + row) % 5]);
      }
    },
  },
  stereo: {
    name: 'Stereo', cat: 'Soggiorno', price: 220, w: 1, d: 1, actions: ['balla'],
    draw(ctx, v, o) {
      const r = pb(ctx, v, o, 0.1, 0.15, 0.8, 0.5, 26, '#1f2937');
      const f = frontFace(o);
      if (f) { facePanel(ctx, v, r, f, 0.1, 0.35, 6, 20, '#4b5563'); facePanel(ctx, v, r, f, 0.65, 0.9, 6, 20, '#4b5563'); facePanel(ctx, v, r, f, 0.42, 0.58, 14, 20, '#22d3ee'); }
    },
  },
  acquario: {
    name: 'Acquario', cat: 'Soggiorno', price: 650, w: 2, d: 1, actions: ['acquario'], amb: 3,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.1, 0.2, 1.8, 0.6, 24, '#1f2937');
      const r = pb(ctx, v, o, 0.12, 0.22, 1.76, 0.56, 30, 'rgba(56,189,248,.55)', { z0: 24, top: 'rgba(125,211,252,.5)' });
      const f = frontFace(o);
      if (f) {
        const t = performance.now() / 1000;
        for (let i = 0; i < 3; i++) facePanel(ctx, v, r, f, (0.2 + i * 0.25 + Math.sin(t + i) * 0.08 + 1) % 1 * 0.8 + 0.05, (0.2 + i * 0.25 + Math.sin(t + i) * 0.08 + 1) % 1 * 0.8 + 0.12, 34 + i * 6, 38 + i * 6, ['#f97316', '#facc15', '#ef4444'][i]);
      }
    },
  },
  scacchi: {
    name: 'Tavolino degli scacchi', cat: 'Hobby', price: 260, w: 1, d: 1, actions: ['scacchi'], seats: [[0.5, 0.85]], seatH: 14,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.42, 0.25, 0.16, 0.3, 20, '#78350f');
      pb(ctx, v, o, 0.15, 0.1, 0.7, 0.6, 3, '#fef3c7', { z0: 20 });
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) pb(ctx, v, o, 0.2 + i * 0.15, 0.13 + j * 0.13, 0.15, 0.13, 0.5, '#1f2937', { z0: 23 });
    },
  },
  // ---------------- Hobby
  chitarra: {
    name: 'Chitarra', cat: 'Hobby', price: 300, w: 1, d: 1, actions: ['chitarra'],
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.35, 0.4, 0.3, 0.2, 4, '#374151');
      pb(ctx, v, o, 0.3, 0.42, 0.4, 0.12, 24, '#b45309', { z0: 4 });
      pb(ctx, v, o, 0.46, 0.45, 0.08, 0.06, 26, '#78350f', { z0: 28 });
    },
  },
  cavalletto: {
    name: 'Cavalletto da pittore', cat: 'Hobby', price: 350, w: 1, d: 1, actions: ['dipingi'],
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.2, 0.4, 0.08, 0.08, 54, '#a16207');
      pb(ctx, v, o, 0.72, 0.4, 0.08, 0.08, 54, '#a16207');
      const r = pb(ctx, v, o, 0.15, 0.36, 0.7, 0.06, 34, '#f8fafc', { z0: 20 });
      const f = frontFace(o);
      if (f) { facePanel(ctx, v, r, f, 0.15, 0.5, 26, 40, '#60a5fa'); facePanel(ctx, v, r, f, 0.5, 0.85, 30, 48, '#f472b6'); }
    },
  },
  tapis: {
    name: 'Tapis roulant', cat: 'Hobby', price: 700, w: 1, d: 2, actions: ['allenati'], seats: [[0.5, 1.2]], seatH: 8,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.1, 0.4, 0.8, 1.55, 8, '#374151');
      pb(ctx, v, o, 0.18, 0.45, 0.64, 1.45, 1, '#111827', { z0: 8 });
      pb(ctx, v, o, 0.1, 0.25, 0.08, 0.2, 40, '#6b7280');
      pb(ctx, v, o, 0.82, 0.25, 0.08, 0.2, 40, '#6b7280');
      pb(ctx, v, o, 0.1, 0.18, 0.8, 0.2, 8, '#4ade80', { z0: 40 });
    },
  },
  pesi: {
    name: 'Panca per i pesi', cat: 'Hobby', price: 480, w: 1, d: 2, actions: ['pesi'], seats: [[0.5, 1.0]], seatH: 16,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.3, 0.3, 0.4, 1.5, 14, '#1f2937');
      pb(ctx, v, o, 0.1, 0.25, 0.08, 0.1, 36, '#6b7280');
      pb(ctx, v, o, 0.82, 0.25, 0.08, 0.1, 36, '#6b7280');
      pb(ctx, v, o, 0.05, 0.27, 0.9, 0.05, 3, '#9ca3af', { z0: 36 });
      pb(ctx, v, o, 0, 0.22, 0.1, 0.15, 14, '#111827', { z0: 28 });
      pb(ctx, v, o, 0.9, 0.22, 0.1, 0.15, 14, '#111827', { z0: 28 });
    },
  },
  // ---------------- Decorazioni
  pianta: {
    name: 'Pianta', cat: 'Decorazioni', price: 60, w: 1, d: 1, actions: [], amb: 1,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.3, 0.3, 0.4, 0.4, 14, '#c2410c');
      for (const [dx, dy, r] of [[0, -6, 11], [-8, 2, 9], [8, 2, 9], [0, 4, 9]]) blob(ctx, v, o, 0.5 + dx / 64, 0.5 + dy / 64, 26, r, '#16a34a');
      blob(ctx, v, o, 0.45, 0.4, 30, 6, '#22c55e');
    },
  },
  piantaGrande: {
    name: 'Pianta grande', cat: 'Decorazioni', price: 190, w: 1, d: 1, actions: [], amb: 2,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.25, 0.25, 0.5, 0.5, 18, '#f5f5f4');
      pb(ctx, v, o, 0.47, 0.47, 0.06, 0.06, 30, '#78350f', { z0: 18 });
      for (const [lx, ly, h, r] of [[0.5, 0.5, 52, 16], [0.3, 0.5, 44, 11], [0.7, 0.5, 44, 11], [0.5, 0.3, 46, 11], [0.5, 0.7, 40, 11]]) blob(ctx, v, o, lx, ly, h, r, '#15803d');
    },
  },
  lampada: {
    name: 'Lampada', cat: 'Decorazioni', price: 90, w: 1, d: 1, actions: [], amb: 1,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.35, 0.35, 0.3, 0.3, 3, '#374151');
      pb(ctx, v, o, 0.47, 0.47, 0.06, 0.06, 52, '#6b7280', { z0: 3 });
      pb(ctx, v, o, 0.28, 0.28, 0.44, 0.44, 16, '#fef3c7', { z0: 52 });
    },
  },
  tappeto: {
    name: 'Tappeto', cat: 'Decorazioni', price: 120, w: 2, d: 2, actions: [], passable: true, flat: true, amb: 1,
    colors: ['#b91c1c', '#1d4ed8', '#047857', '#7c3aed'],
    draw(ctx, v, o) {
      const c = o.color ?? '#b91c1c';
      pb(ctx, v, o, 0.1, 0.1, 1.8, 1.8, 1, c);
      pb(ctx, v, o, 0.35, 0.35, 1.3, 1.3, 0.5, shade(c, 0.35), { z0: 1 });
      pb(ctx, v, o, 0.6, 0.6, 0.8, 0.8, 0.5, c, { z0: 1.5 });
    },
  },
  tappetoGrande: {
    name: 'Tappeto grande', cat: 'Decorazioni', price: 260, w: 3, d: 3, actions: [], passable: true, flat: true, amb: 2,
    colors: ['#a16207', '#334155', '#9f1239'],
    draw(ctx, v, o) {
      const c = o.color ?? '#a16207';
      pb(ctx, v, o, 0.1, 0.1, 2.8, 2.8, 1, c);
      pb(ctx, v, o, 0.3, 0.3, 2.4, 2.4, 0.5, shade(c, 0.4), { z0: 1 });
      pb(ctx, v, o, 0.6, 0.6, 1.8, 1.8, 0.5, shade(c, 0.1), { z0: 1.5 });
    },
  },
  quadro: {
    name: 'Mensola con cornici', cat: 'Decorazioni', price: 70, w: 1, d: 1, actions: [], amb: 1,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.1, 0.1, 0.8, 0.35, 30, '#a16207');
      pb(ctx, v, o, 0.18, 0.18, 0.25, 0.08, 14, '#fbbf24', { z0: 30 });
      pb(ctx, v, o, 0.55, 0.18, 0.25, 0.08, 10, '#f472b6', { z0: 30 });
    },
  },
  dipinto: {
    name: 'Quadro su cavalletto', cat: 'Decorazioni', price: 150, w: 1, d: 1, actions: [], amb: 2,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.3, 0.45, 0.06, 0.06, 40, '#78350f');
      pb(ctx, v, o, 0.64, 0.45, 0.06, 0.06, 40, '#78350f');
      const r = pb(ctx, v, o, 0.15, 0.4, 0.7, 0.05, 32, '#fbbf24', { z0: 18 });
      const f = frontFace(o);
      if (f) { facePanel(ctx, v, r, f, 0.08, 0.92, 21, 47, '#1e3a8a'); facePanel(ctx, v, r, f, 0.2, 0.6, 24, 34, '#facc15'); }
    },
  },
  statua: {
    name: 'Statua di marmo', cat: 'Decorazioni', price: 850, w: 1, d: 1, actions: [], amb: 4,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.2, 0.2, 0.6, 0.6, 20, '#d6d3d1');
      pb(ctx, v, o, 0.38, 0.38, 0.24, 0.24, 30, '#f5f5f4', { z0: 20 });
      blob(ctx, v, o, 0.5, 0.5, 58, 7, '#f5f5f4');
    },
  },
  // ---------------- Giardino
  albero: {
    name: 'Albero', cat: 'Giardino', price: 160, w: 1, d: 1, actions: [], amb: 2, outdoor: true,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.42, 0.42, 0.16, 0.16, 40, '#78350f');
      for (const [lx, ly, h, r] of [[0.5, 0.5, 70, 26], [0.3, 0.55, 56, 18], [0.7, 0.45, 58, 18], [0.5, 0.3, 62, 18]]) blob(ctx, v, o, lx, ly, h, r, '#166534');
      blob(ctx, v, o, 0.45, 0.45, 78, 14, '#16a34a');
    },
  },
  pino: {
    name: 'Pino', cat: 'Giardino', price: 140, w: 1, d: 1, actions: [], amb: 1, outdoor: true,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.44, 0.44, 0.12, 0.12, 18, '#78350f');
      const [x, y] = point(o, 0.5, 0.5);
      for (const [h0, h1, r] of [[18, 50, 22], [36, 70, 17], [54, 88, 11]]) {
        const [bx, by] = v.at(x, y, h0), [, ty] = v.at(x, y, h1);
        ctx.fillStyle = '#14532d';
        ctx.beginPath(); ctx.moveTo(bx - r * v.z, by); ctx.lineTo(bx + r * v.z, by); ctx.lineTo(bx, ty); ctx.closePath(); ctx.fill();
      }
    },
  },
  siepe: {
    name: 'Siepe', cat: 'Giardino', price: 40, w: 1, d: 1, actions: [], amb: 1, outdoor: true,
    draw(ctx, v, o) { pb(ctx, v, o, 0.05, 0.25, 0.9, 0.5, 26, '#15803d', { top: '#22c55e' }); },
  },
  aiuola: {
    name: 'Aiuola fiorita', cat: 'Giardino', price: 70, w: 1, d: 1, actions: [], amb: 2, outdoor: true, passable: false,
    colors: ['#f472b6', '#facc15', '#a78bfa', '#f87171'],
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.08, 0.08, 0.84, 0.84, 6, '#78350f', { top: '#57534e' });
      for (const [lx, ly] of [[0.3, 0.3], [0.7, 0.3], [0.5, 0.5], [0.3, 0.7], [0.7, 0.7]]) { blob(ctx, v, o, lx, ly, 9, 5, '#16a34a'); blob(ctx, v, o, lx, ly, 12, 3.5, o.color ?? '#f472b6'); }
    },
  },
  panchina: {
    name: 'Panchina', cat: 'Giardino', price: 200, w: 2, d: 1, actions: ['siediti'], seats: [[0.6, 0.55], [1.4, 0.55]], seatH: 14, outdoor: true,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.15, 0.4, 0.1, 0.4, 14, '#374151');
      pb(ctx, v, o, 1.75, 0.4, 0.1, 0.4, 14, '#374151');
      pb(ctx, v, o, 0.05, 0.35, 1.9, 0.5, 3, '#b45309', { z0: 14 });
      pb(ctx, v, o, 0.05, 0.3, 1.9, 0.08, 18, '#92400e', { z0: 17 });
    },
  },
  barbecue: {
    name: 'Barbecue', cat: 'Giardino', price: 380, w: 1, d: 1, actions: ['grigliata'], outdoor: true,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.25, 0.25, 0.5, 0.5, 26, '#111827');
      pb(ctx, v, o, 0.2, 0.2, 0.6, 0.6, 3, '#374151', { z0: 26 });
      pb(ctx, v, o, 0.28, 0.28, 0.44, 0.44, 1, '#f97316', { z0: 29 });
    },
  },
  amaca: {
    name: 'Amaca', cat: 'Giardino', price: 300, w: 2, d: 1, actions: ['amaca'], seats: [[1, 0.5]], seatH: 22, outdoor: true,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0, 0.4, 0.1, 0.2, 40, '#78350f');
      pb(ctx, v, o, 1.9, 0.4, 0.1, 0.2, 40, '#78350f');
      pb(ctx, v, o, 0.15, 0.3, 1.7, 0.4, 3, '#f59e0b', { z0: 20 });
    },
  },
  altalena: {
    name: 'Altalena', cat: 'Giardino', price: 420, w: 2, d: 1, actions: ['dondola'], seats: [[1, 0.5]], seatH: 18, outdoor: true,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.1, 0.45, 0.1, 0.1, 64, '#dc2626');
      pb(ctx, v, o, 1.8, 0.45, 0.1, 0.1, 64, '#dc2626');
      pb(ctx, v, o, 0.1, 0.45, 1.8, 0.1, 4, '#dc2626', { z0: 64 });
      pb(ctx, v, o, 0.75, 0.35, 0.5, 0.3, 3, '#2563eb', { z0: 16 });
    },
  },
  fontana: {
    name: 'Fontana', cat: 'Giardino', price: 950, w: 2, d: 2, actions: ['fontana'], amb: 4, outdoor: true,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.1, 0.1, 1.8, 1.8, 14, '#d6d3d1');
      pb(ctx, v, o, 0.25, 0.25, 1.5, 1.5, 1, '#38bdf8', { z0: 13 });
      pb(ctx, v, o, 0.85, 0.85, 0.3, 0.3, 30, '#e7e5e4', { z0: 14 });
      blob(ctx, v, o, 1, 1, 50, 6, 'rgba(186,230,253,.9)');
    },
  },
  piscina: {
    name: 'Piscina', cat: 'Giardino', price: 2600, w: 3, d: 4, actions: ['nuota'], seats: [[1.5, 2]], seatH: -10, amb: 3, outdoor: true, behind: true, flat: true,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0, 0, 3, 4, 2, '#e7e5e4');
      pb(ctx, v, o, 0.2, 0.2, 2.6, 3.6, 1.5, '#0ea5e9', { z0: 0.5, top: `hsl(199, 85%, ${55 + Math.sin(performance.now() / 500) * 4}%)` });
      pb(ctx, v, o, 0.2, 0.2, 0.15, 0.6, 14, '#cbd5e1', { z0: 2 });
    },
  },
  lampione: {
    name: 'Lampione da giardino', cat: 'Giardino', price: 120, w: 1, d: 1, actions: [], amb: 1, outdoor: true,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.44, 0.44, 0.12, 0.12, 60, '#1f2937');
      pb(ctx, v, o, 0.35, 0.35, 0.3, 0.3, 12, '#fef9c3', { z0: 60 });
    },
  },
};
export const CATS = ['Camera', 'Bagno', 'Cucina', 'Soggiorno', 'Hobby', 'Decorazioni', 'Giardino'];
