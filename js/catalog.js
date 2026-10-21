// Catalogo degli oggetti di casa: prezzo, ingombro (w × d caselle), azioni e disegno isometrico.
// Ogni oggetto è disegnato nel suo verso "di base" (davanti verso +y) e ruotato a passi di 90°:
// rot 0 davanti verso +y, 1 verso +x, 2 verso -y, 3 verso -x.
import { box, facePanel, shade } from './iso.js';

// Bisogni dei Sim
export const NEEDS = [
  ['fame', '🍔', 'Fame'], ['energia', '⚡', 'Energia'], ['igiene', '🚿', 'Igiene'],
  ['vescica', '🚽', 'Vescica'], ['svago', '🎮', 'Svago'], ['socialita', '💬', 'Socialità'],
];

/*
 * Azione: { id, label, emoji, dur (minuti di gioco) | until (finché il bisogno è pieno), gain: { bisogno: punti in
 * tutta l'azione (o all'ora se until) }, pose: 'stand' | 'sit' | 'lie', skill, then: azione che segue }.
 */
const A = {
  spuntino: { id: 'spuntino', label: 'Fai uno spuntino', emoji: '🥪', dur: 12, gain: { fame: 28, vescica: -5 } },
  cucina: { id: 'cucina', label: 'Cucina un pasto', emoji: '🍳', dur: 30, gain: { fame: 5 }, skill: 'cucina', then: 'mangia' },
  mangia: { id: 'mangia', label: 'Mangia', emoji: '🍝', dur: 20, gain: { fame: 60, vescica: -10, socialita: 4 }, pose: 'sit', hidden: true },
  dormi: { id: 'dormi', label: 'Dormi', emoji: '💤', until: 'energia', gain: { energia: 13 }, pose: 'lie' },
  pisolino: { id: 'pisolino', label: 'Fai un pisolino', emoji: '😴', dur: 60, gain: { energia: 10 }, pose: 'lie' },
  doccia: { id: 'doccia', label: 'Fai la doccia', emoji: '🚿', dur: 18, gain: { igiene: 85, vescica: -2 }, inside: true },
  bagno: { id: 'bagno', label: 'Usa il bagno', emoji: '🚽', dur: 6, gain: { vescica: 100, igiene: -3 }, pose: 'sit', inside: true },
  siediti: { id: 'siediti', label: 'Siediti a riposare', emoji: '🛋️', dur: 40, gain: { energia: 6, svago: 8 }, pose: 'sit' },
  divanoPisolino: { id: 'divanoPisolino', label: 'Pisolino sul divano', emoji: '😴', dur: 60, gain: { energia: 9 }, pose: 'lie' },
  tv: { id: 'tv', label: 'Guarda la TV', emoji: '📺', dur: 60, gain: { svago: 38, energia: -2 } },
  gioca: { id: 'gioca', label: 'Gioca al computer', emoji: '🎮', dur: 60, gain: { svago: 45, energia: -4 }, pose: 'sit' },
  lavoro: { id: 'lavoro', label: 'Cerca lavoro', emoji: '💼', dur: 10, gain: {}, pose: 'sit', special: 'jobs' },
  social: { id: 'social', label: 'Chatta con gli amici', emoji: '📱', dur: 40, gain: { socialita: 22, svago: 8 }, pose: 'sit' },
  leggi: { id: 'leggi', label: 'Leggi un libro', emoji: '📖', dur: 50, gain: { svago: 26 } },
  balla: { id: 'balla', label: 'Balla', emoji: '💃', dur: 30, gain: { svago: 32, energia: -6, igiene: -4 }, dance: true },
  allenati: { id: 'allenati', label: 'Allenati', emoji: '🏃', dur: 45, gain: { svago: 10, energia: -14, igiene: -18, fame: -8 }, skill: 'fitness', run: true },
  lavamani: { id: 'lavamani', label: 'Lavati le mani', emoji: '🧼', dur: 4, gain: { igiene: 12 } },
  specchio: { id: 'specchio', label: 'Sistemati allo specchio', emoji: '🪞', dur: 8, gain: { igiene: 6, svago: 4 } },
};
export const ACTIONS = A;

// Interazioni tra i due Sim (rel: rapporto minimo richiesto)
export const SOCIAL = [
  { id: 'chiacchiera', label: 'Chiacchiera', emoji: '💬', dur: 20, gain: { socialita: 26, svago: 6 }, rel: 3, min: 0 },
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

// ---------------------------------------------------------------- oggetti
/*
 * Tipo: { name, cat, price, w, d, actions, seats: [[lx, ly]] (dove ci si siede/sdraia), passable, draw }.
 * colore personalizzabile: o.color (se il tipo ha colors).
 */
export const TYPES = {
  letto: {
    name: 'Letto matrimoniale', cat: 'Camera', price: 600, w: 2, d: 2, actions: ['dormi', 'pisolino'],
    seats: [[0.5, 1.15], [1.5, 1.15]], colors: ['#60a5fa', '#f472b6', '#a78bfa', '#34d399'],
    draw(ctx, v, o) {
      pb(ctx, v, o, 0, 0, 2, 0.25, 34, '#92400e');                   // testiera
      pb(ctx, v, o, 0, 0.2, 2, 1.8, 12, '#a16207');                  // struttura
      pb(ctx, v, o, 0.05, 0.25, 1.9, 1.7, 8, '#f8fafc', { z0: 12 }); // materasso
      pb(ctx, v, o, 0.12, 0.3, 0.75, 0.38, 6, '#ffffff', { z0: 20 }); // cuscini
      pb(ctx, v, o, 1.13, 0.3, 0.75, 0.38, 6, '#ffffff', { z0: 20 });
      pb(ctx, v, o, 0.05, 0.8, 1.9, 1.15, 3, o.color ?? '#60a5fa', { z0: 20 });   // coperta
    },
  },
  lettoSingolo: {
    name: 'Letto singolo', cat: 'Camera', price: 300, w: 1, d: 2, actions: ['dormi', 'pisolino'],
    seats: [[0.5, 1.15]], colors: ['#60a5fa', '#f472b6', '#facc15'],
    draw(ctx, v, o) {
      pb(ctx, v, o, 0, 0, 1, 0.25, 30, '#92400e');
      pb(ctx, v, o, 0, 0.2, 1, 1.8, 12, '#a16207');
      pb(ctx, v, o, 0.05, 0.25, 0.9, 1.7, 8, '#f8fafc', { z0: 12 });
      pb(ctx, v, o, 0.15, 0.3, 0.7, 0.38, 6, '#ffffff', { z0: 20 });
      pb(ctx, v, o, 0.05, 0.8, 0.9, 1.15, 3, o.color ?? '#60a5fa', { z0: 20 });
    },
  },
  frigo: {
    name: 'Frigorifero', cat: 'Cucina', price: 450, w: 1, d: 1, actions: ['spuntino'],
    draw(ctx, v, o) {
      const r = pb(ctx, v, o, 0.08, 0.1, 0.84, 0.8, 76, '#e5e7eb');
      const f = frontFace(o);
      if (f) {
        facePanel(ctx, v, r, f, 0.02, 0.98, 46, 47.5, '#9ca3af');
        facePanel(ctx, v, r, f, 0.8, 0.86, 52, 66, '#6b7280');
        facePanel(ctx, v, r, f, 0.8, 0.86, 22, 40, '#6b7280');
      }
    },
  },
  fornello: {
    name: 'Cucina con fornelli', cat: 'Cucina', price: 380, w: 1, d: 1, actions: ['cucina'],
    draw(ctx, v, o) {
      const r = pb(ctx, v, o, 0, 0.05, 1, 0.9, 34, '#f1f5f9');
      const f = frontFace(o);
      if (f) facePanel(ctx, v, r, f, 0.15, 0.85, 6, 26, '#1f2937');
      pb(ctx, v, o, 0.04, 0.09, 0.92, 0.82, 1, '#111827', { z0: 34 });
      for (const [lx, ly] of [[0.28, 0.3], [0.68, 0.3], [0.28, 0.68], [0.68, 0.68]]) {
        const [x, y] = point(o, lx, ly);
        const [sx, sy] = v.at(x, y, 35.5);
        ctx.strokeStyle = '#6b7280';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(sx, sy, 7 * v.z, 3.5 * v.z, 0, 0, Math.PI * 2); ctx.stroke();
      }
    },
  },
  lavello: {
    name: 'Lavello', cat: 'Cucina', price: 160, w: 1, d: 1, actions: ['lavamani'],
    draw(ctx, v, o) {
      pb(ctx, v, o, 0, 0.05, 1, 0.9, 34, '#f1f5f9');
      pb(ctx, v, o, 0.2, 0.25, 0.6, 0.5, 1, '#94a3b8', { z0: 34 });
      pb(ctx, v, o, 0.45, 0.08, 0.1, 0.12, 12, '#cbd5e1', { z0: 34 });
    },
  },
  tavolo: {
    name: 'Tavolo con sedie', cat: 'Cucina', price: 280, w: 2, d: 2, actions: [], seats: [[1, 0.25], [1, 1.75]], eat: true,
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.75, 0.02, 0.5, 0.36, 16, '#b45309');            // sedia dietro
      pb(ctx, v, o, 0.75, 0.02, 0.5, 0.08, 30, '#92400e');
      pb(ctx, v, o, 0.92, 0.6, 0.16, 0.8, 24, '#78350f');             // gamba centrale
      pb(ctx, v, o, 0.35, 0.45, 1.3, 1.1, 4, '#d97706', { z0: 24 });  // piano
      pb(ctx, v, o, 0.75, 1.62, 0.5, 0.36, 16, '#b45309');            // sedia davanti
      pb(ctx, v, o, 0.75, 1.9, 0.5, 0.08, 30, '#92400e');
    },
  },
  doccia: {
    name: 'Doccia', cat: 'Bagno', price: 520, w: 1, d: 1, actions: ['doccia'], seats: [[0.5, 0.5]],
    draw(ctx, v, o) {
      pb(ctx, v, o, 0, 0, 1, 1, 5, '#f8fafc');
      pb(ctx, v, o, 0.45, 0.02, 0.1, 0.06, 12, '#94a3b8', { z0: 74 });
      const r = pb(ctx, v, o, 0.02, 0.02, 0.96, 0.96, 80, 'rgba(147,197,253,.25)', { z0: 5, top: 'rgba(191,219,254,.18)', right: 'rgba(96,165,250,.22)', line: 'rgba(255,255,255,.6)' });
      return r;
    },
  },
  wc: {
    name: 'Water', cat: 'Bagno', price: 220, w: 1, d: 1, actions: ['bagno'], seats: [[0.5, 0.5]],
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.22, 0.05, 0.56, 0.22, 34, '#f8fafc');           // cassetta
      pb(ctx, v, o, 0.3, 0.25, 0.4, 0.55, 18, '#ffffff');             // vaso
      pb(ctx, v, o, 0.28, 0.25, 0.44, 0.6, 2, '#e2e8f0', { z0: 18 }); // tavoletta
    },
  },
  lavandino: {
    name: 'Lavandino con specchio', cat: 'Bagno', price: 240, w: 1, d: 1, actions: ['lavamani', 'specchio'],
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.15, 0.05, 0.7, 0.55, 30, '#e2e8f0');
      pb(ctx, v, o, 0.25, 0.12, 0.5, 0.36, 1, '#94a3b8', { z0: 30 });
      pb(ctx, v, o, 0.15, 0, 0.7, 0.05, 30, '#bae6fd', { z0: 42 });   // specchio
    },
  },
  divano: {
    name: 'Divano', cat: 'Soggiorno', price: 420, w: 2, d: 1, actions: ['siediti', 'divanoPisolino'], seats: [[0.55, 0.55], [1.45, 0.55]],
    colors: ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f59e0b'],
    draw(ctx, v, o) {
      const c = o.color ?? '#ef4444';
      pb(ctx, v, o, 0, 0, 2, 0.32, 32, shade(c, -0.15));              // schienale
      pb(ctx, v, o, 0, 0.3, 2, 0.65, 14, c);                         // seduta
      pb(ctx, v, o, 0, 0.3, 0.2, 0.65, 22, shade(c, -0.1));           // braccioli
      pb(ctx, v, o, 1.8, 0.3, 0.2, 0.65, 22, shade(c, -0.1));
      pb(ctx, v, o, 0.22, 0.35, 0.76, 0.56, 3, shade(c, 0.12), { z0: 14 });   // cuscini
      pb(ctx, v, o, 1.02, 0.35, 0.76, 0.56, 3, shade(c, 0.12), { z0: 14 });
    },
  },
  poltrona: {
    name: 'Poltrona', cat: 'Soggiorno', price: 220, w: 1, d: 1, actions: ['siediti'], seats: [[0.5, 0.55]],
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
    name: 'TV', cat: 'Soggiorno', price: 500, w: 1, d: 1, actions: ['tv'],
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.05, 0.1, 0.9, 0.6, 18, '#78350f');               // mobile
      const r = pb(ctx, v, o, 0.08, 0.25, 0.84, 0.08, 30, '#111827', { z0: 18 });
      const f = frontFace(o);
      if (f) facePanel(ctx, v, r, f, 0.06, 0.94, 21, 45, `hsl(${(performance.now() / 40) % 360}, 60%, 55%)`);
    },
  },
  computer: {
    name: 'Scrivania con computer', cat: 'Soggiorno', price: 800, w: 1, d: 1, actions: ['gioca', 'social', 'lavoro'], seats: [[0.5, 0.85]],
    draw(ctx, v, o) {
      pb(ctx, v, o, 0, 0.05, 1, 0.6, 28, '#e5e7eb');
      const r = pb(ctx, v, o, 0.2, 0.12, 0.6, 0.06, 20, '#111827', { z0: 28 });
      const f = frontFace(o);
      if (f) facePanel(ctx, v, r, f, 0.08, 0.92, 31, 46, '#38bdf8');
      pb(ctx, v, o, 0.25, 0.35, 0.5, 0.15, 1.5, '#374151', { z0: 28 });   // tastiera
    },
  },
  libreria: {
    name: 'Libreria', cat: 'Soggiorno', price: 180, w: 1, d: 1, actions: ['leggi'],
    draw(ctx, v, o) {
      const r = pb(ctx, v, o, 0.05, 0.05, 0.9, 0.45, 72, '#92400e');
      const f = frontFace(o);
      if (f) {
        const colors = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7'];
        for (let row = 0; row < 3; row++) {
          for (let b = 0; b < 5; b++) facePanel(ctx, v, r, f, 0.1 + b * 0.16, 0.22 + b * 0.16, 8 + row * 22, 24 + row * 22 - (b % 2) * 3, colors[(b + row) % 5]);
        }
      }
    },
  },
  stereo: {
    name: 'Stereo', cat: 'Soggiorno', price: 220, w: 1, d: 1, actions: ['balla'],
    draw(ctx, v, o) {
      const r = pb(ctx, v, o, 0.1, 0.15, 0.8, 0.5, 26, '#1f2937');
      const f = frontFace(o);
      if (f) {
        facePanel(ctx, v, r, f, 0.1, 0.35, 6, 20, '#4b5563');
        facePanel(ctx, v, r, f, 0.65, 0.9, 6, 20, '#4b5563');
        facePanel(ctx, v, r, f, 0.42, 0.58, 14, 20, '#22d3ee');
      }
    },
  },
  tapis: {
    name: 'Tapis roulant', cat: 'Svago', price: 700, w: 1, d: 2, actions: ['allenati'], seats: [[0.5, 1.2]],
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.1, 0.4, 0.8, 1.55, 8, '#374151');
      pb(ctx, v, o, 0.18, 0.45, 0.64, 1.45, 1, '#111827', { z0: 8 });
      pb(ctx, v, o, 0.1, 0.25, 0.08, 0.2, 40, '#6b7280');
      pb(ctx, v, o, 0.82, 0.25, 0.08, 0.2, 40, '#6b7280');
      pb(ctx, v, o, 0.1, 0.18, 0.8, 0.2, 8, '#4ade80', { z0: 40 });
    },
  },
  pianta: {
    name: 'Pianta', cat: 'Decorazioni', price: 60, w: 1, d: 1, actions: [],
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.3, 0.3, 0.4, 0.4, 14, '#c2410c');
      const [x, y] = point(o, 0.5, 0.5);
      const [sx, sy] = v.at(x, y, 26);
      ctx.fillStyle = '#16a34a';
      for (const [dx, dy, r] of [[0, -6, 11], [-8, 2, 9], [8, 2, 9], [0, 4, 9]]) { ctx.beginPath(); ctx.arc(sx + dx * v.z, sy + dy * v.z, r * v.z, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#22c55e';
      ctx.beginPath(); ctx.arc(sx - 3 * v.z, sy - 9 * v.z, 6 * v.z, 0, Math.PI * 2); ctx.fill();
    },
  },
  lampada: {
    name: 'Lampada', cat: 'Decorazioni', price: 90, w: 1, d: 1, actions: [],
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.35, 0.35, 0.3, 0.3, 3, '#374151');
      pb(ctx, v, o, 0.47, 0.47, 0.06, 0.06, 52, '#6b7280', { z0: 3 });
      pb(ctx, v, o, 0.28, 0.28, 0.44, 0.44, 16, '#fef3c7', { z0: 52 });
    },
  },
  tappeto: {
    name: 'Tappeto', cat: 'Decorazioni', price: 120, w: 2, d: 2, actions: [], passable: true, flat: true,
    colors: ['#b91c1c', '#1d4ed8', '#047857', '#7c3aed'],
    draw(ctx, v, o) {
      const c = o.color ?? '#b91c1c';
      pb(ctx, v, o, 0.1, 0.1, 1.8, 1.8, 1, c);
      pb(ctx, v, o, 0.35, 0.35, 1.3, 1.3, 0.5, shade(c, 0.35), { z0: 1 });
      pb(ctx, v, o, 0.6, 0.6, 0.8, 0.8, 0.5, c, { z0: 1.5 });
    },
  },
  quadro: {
    name: 'Mensola con cornici', cat: 'Decorazioni', price: 70, w: 1, d: 1, actions: [],
    draw(ctx, v, o) {
      pb(ctx, v, o, 0.1, 0.1, 0.8, 0.35, 30, '#a16207');
      pb(ctx, v, o, 0.18, 0.18, 0.25, 0.08, 14, '#fbbf24', { z0: 30 });
      pb(ctx, v, o, 0.55, 0.18, 0.25, 0.08, 10, '#f472b6', { z0: 30 });
    },
  },
};
export const CATS = ['Camera', 'Cucina', 'Bagno', 'Soggiorno', 'Svago', 'Decorazioni'];
