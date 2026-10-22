// Il mondo in 3D (Three.js): terreno e strada, pavimenti con texture, muri "tagliati" come in The Sims, mobili
// (modelli Kenney, CC0) o costruiti con forme semplici, Sim animati, luce del giorno e lampade la sera.
// Le caselle del gioco (x, y) diventano il piano (x, z) della scena; ogni piano è alto LH.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { TYPES, footprint, point } from './catalog.js';

export const LH = 2.4;            // altezza di un piano
const WH = 2.25;                  // altezza dei muri
const WT = 0.12;                  // spessore dei muri
const LOW = 0.32;                 // muri abbassati
const CS = 1.5;                   // scala dei Sim (alti circa una casella)
export const CHAR_MODELS = ['female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f', 'male-a', 'male-b', 'male-c', 'male-d', 'male-e', 'male-f'];
const lvY = lv => lv * LH;

// ---------------------------------------------------------------- materiali e forme riusati
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 18);
const SPH = new THREE.SphereGeometry(1, 18, 12);
const CONE = new THREE.ConeGeometry(1, 1, 18);
const ICO = new THREE.IcosahedronGeometry(1, 1);
const mats = new Map();
function mat(color, o = {}) {
  const key = `${color}|${o.opacity ?? 1}|${o.emissive ?? ''}|${o.rough ?? 0.8}|${o.metal ?? 0}`;
  if (!mats.has(key)) {
    mats.set(key, new THREE.MeshStandardMaterial({
      color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0, transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1,
      emissive: o.emissive ?? '#000000', emissiveIntensity: o.emissive ? 1 : 0, depthWrite: (o.opacity ?? 1) >= 1,
    }));
  }
  return mats.get(key);
}
const tints = new Map();
function tinted(m, color) {
  const key = m.uuid + color;
  if (!tints.has(key)) { const t = m.clone(); t.color = new THREE.Color(color); tints.set(key, t); }
  return tints.get(key);
}
const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });

/** Texture disegnata al volo su un canvas (pavimenti, prato, scacchiera). */
function canvasTex(draw, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
function shadeHex(c, k) {
  const col = new THREE.Color(c);
  return k > 0 ? col.lerp(new THREE.Color('#ffffff'), k) : col.lerp(new THREE.Color('#000000'), -k);
}
const PATTERN = { legno: 'planks', legnoScuro: 'planks', camera: 'carpet', moquetteRossa: 'carpet', cucina: 'tiles', bagno: 'tiles', marmo: 'marble', cemento: 'plain', pietra: 'stones', erba: 'grass' };
function floorTexture(id, c1, c2) {
  const p = PATTERN[id] ?? 'plain';
  return canvasTex((x, s) => {
    x.fillStyle = c1; x.fillRect(0, 0, s, s);
    if (p === 'planks') {
      for (let r = 0; r < 4; r++) {
        const y0 = (r * s) / 4, off = (r % 2) * s * 0.5;
        x.fillStyle = r % 2 ? c2 : c1; x.fillRect(0, y0, s, s / 4);
        x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 2;
        x.beginPath(); x.moveTo(0, y0); x.lineTo(s, y0); x.moveTo(off, y0); x.lineTo(off, y0 + s / 4); x.stroke();
        x.strokeStyle = 'rgba(0,0,0,.05)'; x.lineWidth = 1;
        for (let k = 0; k < 3; k++) { const yy = y0 + 6 + k * 8 + rnd() * 3; x.beginPath(); x.moveTo(0, yy); x.bezierCurveTo(s / 3, yy + 2, (2 * s) / 3, yy - 2, s, yy); x.stroke(); }
      }
    } else if (p === 'tiles') {
      x.fillStyle = c2; x.fillRect(0, 0, s / 2, s / 2); x.fillRect(s / 2, s / 2, s / 2, s / 2);
      x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 3; x.strokeRect(0, 0, s / 2, s / 2); x.strokeRect(s / 2, 0, s / 2, s / 2); x.strokeRect(0, s / 2, s / 2, s / 2); x.strokeRect(s / 2, s / 2, s / 2, s / 2);
    } else if (p === 'marble') {
      x.strokeStyle = 'rgba(100,116,139,.25)'; x.lineWidth = 1.5;
      for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(0, rnd() * s); x.bezierCurveTo(s / 3, rnd() * s, (2 * s) / 3, rnd() * s, s, rnd() * s); x.stroke(); }
      x.strokeStyle = 'rgba(0,0,0,.08)'; x.lineWidth = 2; x.strokeRect(0, 0, s, s);
    } else if (p === 'stones') {
      x.fillStyle = 'rgba(0,0,0,.15)'; x.fillRect(0, 0, s, s);
      for (let k = 0; k < 7; k++) { x.fillStyle = k % 2 ? c1 : c2; x.beginPath(); x.ellipse(rnd() * s, rnd() * s, 14 + rnd() * 12, 10 + rnd() * 10, rnd() * 3, 0, Math.PI * 2); x.fill(); }
    } else {
      const n = p === 'grass' ? 500 : 260;
      for (let k = 0; k < n; k++) { x.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.06)'; x.fillRect(rnd() * s, rnd() * s, 2, p === 'grass' ? 4 : 2); }
    }
  });
}

// ---------------------------------------------------------------- modelli 3D
const loader = new GLTFLoader();
const ready = {};
/** Tutti i modelli usati dal catalogo e dai Sim: si caricano una volta all'avvio. */
const FURNITURE = ['bedDouble', 'bedSingle', 'sideTableDrawers', 'lampRoundTable', 'bookcaseClosedDoors', 'toilet', 'shower', 'bathtub', 'bathroomSinkSquare',
  'bathroomMirror', 'kitchenFridge', 'kitchenFridgeLarge', 'kitchenStove', 'kitchenStoveElectric', 'hoodModern', 'kitchenCabinet', 'kitchenMicrowave',
  'kitchenCabinetDrawer', 'toaster', 'kitchenSink', 'tableCloth', 'table', 'chairCushion', 'loungeSofa', 'loungeSofaLong', 'loungeChair', 'cabinetTelevision',
  'cabinetTelevisionDoors', 'televisionModern', 'televisionVintage', 'desk', 'computerScreen', 'computerKeyboard', 'chairDesk', 'bookcaseOpen', 'books',
  'sideTable', 'radio', 'speakerSmall', 'pottedPlant', 'plantSmall1', 'lampSquareFloor', 'rugRectangle', 'rugSquare', 'bookcaseOpenLow', 'benchCushion',
  'kitchenBar', 'stoolBar', 'kitchenCoffeeMachine', 'washer', 'cardboardBoxClosed', 'trashcan', 'coatRackStanding'];
export async function loadModels(onProgress) {
  const jobs = [
    ...FURNITURE.map(n => ['m:' + n, `models/furniture/${n}.glb`]),
    ...CHAR_MODELS.map(n => ['c:' + n, `models/characters/character-${n}.glb`]),
  ];
  let done = 0;
  await Promise.all(jobs.map(async ([k, url]) => {
    try { ready[k] = await loader.loadAsync(url); } catch (e) { console.warn('modello mancante', url, e); }
    onProgress?.(++done / jobs.length);
  }));
}

// ---------------------------------------------------------------- costruzione degli oggetti
/**
 * Aiutante per disegnare un oggetto nel suo verso di base: x da 0 a w (larghezza), z da 0 a d (profondità, il davanti
 * verso +z), y in alto. `m` mette un modello Kenney adattandolo all'ingombro; box/cyl/ball/cone sono forme semplici.
 */
function maker(base, o, T) {
  const put = mesh => { mesh.castShadow = mesh.receiveShadow = true; base.add(mesh); return mesh; };
  const shape = (geo, x, z, sx, sy, sz, color, y, opt) => { const m = put(new THREE.Mesh(geo, mat(color, opt))); m.scale.set(sx, sy, sz); m.position.set(x, y, z); return m; };
  return {
    o, T,
    m(name, sp = {}) {
      const src = ready['m:' + name];
      if (!src) return { top: 0, cx: T.w / 2, cz: T.d / 2 };
      const inner = src.scene.clone(true);
      inner.rotation.y = ((sp.ry ?? 0) * Math.PI) / 2;
      inner.traverse(m => {
        if (!m.isMesh) return;
        m.castShadow = m.receiveShadow = true;
        const n = m.material.name ?? '';
        if (sp.tint && o.color && /^carpet(?!White)/.test(n)) m.material = tinted(m.material, o.color);
        else if (sp.tint && typeof sp.tint === 'string' && /^carpet(?!White)/.test(n)) m.material = tinted(m.material, sp.tint);
        if (sp.wood && /^wood/.test(n)) m.material = tinted(m.material, n === 'woodDark' ? shadeHex(sp.wood, -0.2).getStyle() : sp.wood);
        if (sp.metal && /^metal/.test(n)) m.material = tinted(m.material, sp.metal);
      });
      const wrap = new THREE.Group();
      wrap.add(inner);
      inner.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(inner);
      const size = b.getSize(new THREE.Vector3());
      const fw = sp.w ?? T.w, fd = sp.d ?? T.d;
      const s = sp.s ?? Math.min(sp.smax ?? 1.8, (fw * 0.96) / size.x, (fd * 0.96) / size.z);
      inner.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
      wrap.scale.setScalar(s);
      const cx = sp.x ?? this.last?.cx ?? T.w / 2;
      let cz = sp.z ?? (sp.y === 'top' ? this.last?.cz : null) ?? T.d / 2;
      if (sp.back) cz = (sp.z0 ?? 0.04) + (size.z * s) / 2;
      const y = sp.y === 'top' ? this.last?.top ?? 0 : sp.y ?? 0;
      wrap.position.set(cx, y, cz);
      base.add(wrap);
      this.last = { top: y + size.y * s, cx, cz, w: size.x * s, d: size.z * s };
      return this.last;
    },
    box: (x, z, w, d, h, color, y = 0, opt) => shape(BOX, x, z, w, h, d, color, y + h / 2, opt),
    cyl: (x, z, r, h, color, y = 0, opt) => shape(CYL, x, z, r, h, r, color, y + h / 2, opt),
    ball: (x, z, r, color, y = 0, opt, sy = 1) => shape(SPH, x, z, r, r * sy, r, color, y, opt),
    ico: (x, z, r, color, y = 0, opt) => shape(ICO, x, z, r, r, r, color, y, opt),
    cone: (x, z, r, h, color, y = 0, opt) => shape(CONE, x, z, r, h, r, color, y + h / 2, opt),
    add: put,
  };
}

let chessTex = null;
const PAINT = ['#f472b6', '#60a5fa', '#facc15', '#34d399', '#f97316'];
/** Come si costruisce ogni oggetto del catalogo (b = aiutante, coordinate nel verso di base). */
const BUILD = {
  letto: b => b.m('bedDouble', { tint: 1, smax: 2.2 }),
  lettoLusso: b => { b.m('bedDouble', { tint: 1, smax: 2.2, wood: '#7c4a2d' }); b.box(1, 0.06, 2, 0.08, 1.5, '#5b3420'); },
  lettoSingolo: b => b.m('bedSingle', { tint: 1, smax: 2.2 }),
  comodino: b => { b.m('sideTableDrawers', { back: 1, smax: 1.5 }); b.m('lampRoundTable', { y: 'top', s: 1.6 }); },
  armadio: b => b.m('bookcaseClosedDoors', { back: 1, smax: 2.4, wood: '#e8d5bf' }),
  specchio: b => {
    b.box(0.5, 0.15, 0.7, 0.08, 1.75, '#a16207', 0);
    b.box(0.5, 0.2, 0.56, 0.02, 1.55, '#e0f2fe', 0.1, { rough: 0.1, metal: 0.6 });
    b.box(0.5, 0.3, 0.7, 0.3, 0.04, '#78350f');
  },
  wc: b => b.m('toilet', { back: 1, smax: 1.9 }),
  doccia: b => b.m('shower', { smax: 2.1 }),
  vasca: b => b.m('bathtub', { smax: 2 }),
  lavandino: b => { b.m('bathroomSinkSquare', { back: 1, smax: 2 }); b.m('bathroomMirror', { back: 1, y: 1.3, s: 1.7 }); },
  frigo: b => b.m('kitchenFridge', { back: 1, smax: 2.1 }),
  frigoLusso: b => b.m('kitchenFridgeLarge', { back: 1, smax: 2.1 }),
  fornello: b => b.m('kitchenStove', { back: 1, smax: 2.1 }),
  cucinaPro: b => { b.m('kitchenStoveElectric', { back: 1, smax: 2.1 }); b.m('hoodModern', { back: 1, y: 1.55, s: 2.1 }); },
  microonde: b => { b.m('kitchenCabinet', { back: 1, smax: 2.1 }); b.m('kitchenMicrowave', { y: 'top', s: 2 }); },
  bancone: b => { b.m('kitchenCabinetDrawer', { back: 1, smax: 2.1 }); b.m('kitchenCoffeeMachine', { y: 'top', s: 2 }); },
  lavello: b => b.m('kitchenSink', { back: 1, smax: 2.1 }),
  lavastoviglie: b => { const c = b.m('kitchenCabinet', { back: 1, smax: 2.1 }); b.box(0.5, c.cz + c.d / 2, 0.8, 0.02, c.top * 0.8, '#cbd5e1', 0.06, { metal: 0.5, rough: 0.3 }); },
  tavolo: b => {
    b.m('tableCloth', { w: 1.5, d: 1.0, smax: 2, tint: '#f8fafc' });
    b.m('chairCushion', { x: 1, z: 0.3, s: 1.9, ry: 2, tint: '#b45309' });
    b.m('chairCushion', { x: 1, z: 1.7, s: 1.9, tint: '#b45309' });
  },
  tavoloQuattro: b => {
    b.m('table', { w: 2.5, d: 1.0, smax: 2.4 });
    for (const x of [0.95, 2.05]) { b.m('chairCushion', { x, z: 0.3, s: 1.9, ry: 2 }); b.m('chairCushion', { x, z: 1.7, s: 1.9 }); }
  },
  divano: b => b.m('loungeSofa', { tint: 1, smax: 2.2 }),
  divanoLusso: b => b.m('loungeSofaLong', { tint: 1, smax: 2.2, wood: '#3f2a1d' }),
  poltrona: b => b.m('loungeChair', { tint: 1, smax: 2.2 }),
  tv: b => { b.m('cabinetTelevision', { back: 1, smax: 1.3 }); b.m('televisionModern', { y: 'top', s: 1.6 }); },
  tvGrande: b => { b.m('cabinetTelevisionDoors', { back: 1, smax: 2.2 }); b.m('televisionModern', { y: 'top', s: 2.7 }); },
  console: b => {
    const c = b.m('cabinetTelevision', { back: 1, smax: 1.3 });
    b.m('televisionVintage', { y: 'top', s: 1.6 });
    b.box(0.75, c.cz + 0.3, 0.16, 0.1, 0.04, '#111827', 0.02);
    b.box(0.3, c.cz + 0.32, 0.2, 0.12, 0.08, '#6d28d9', 0.02);
  },
  computer: b => {
    const d = b.m('desk', { d: 1, back: 1, smax: 1.9 });
    b.m('computerScreen', { y: d.top, z: d.cz - 0.12, s: 1.6 });
    b.m('computerKeyboard', { y: d.top, z: d.cz + 0.15, s: 1.6 });
    b.m('chairDesk', { x: 0.5, z: 1.45, s: 1.8 });
  },
  libreria: b => {
    const c = b.m('bookcaseOpen', { back: 1, smax: 2.2 });
    for (const k of [0.32, 0.58, 0.84]) b.m('books', { y: c.top * k - 0.08, z: c.cz, x: 0.5, s: 1.6 });
  },
  stereo: b => { const t = b.m('sideTable', { back: 1, smax: 1.4 }); b.m('radio', { y: t.top, x: 0.5, s: 1.7 }); b.m('speakerSmall', { x: 0.12, y: 0, s: 1.8, z: 0.3 }); b.m('speakerSmall', { x: 0.88, y: 0, s: 1.8, z: 0.3 }); },
  acquario: b => {
    b.box(1, 0.5, 1.8, 0.6, 0.55, '#78350f');
    b.box(1, 0.5, 1.75, 0.55, 0.65, '#38bdf8', 0.55, { opacity: 0.45, rough: 0.1 });
    b.box(1, 0.5, 1.8, 0.6, 0.05, '#1f2937', 1.2);
    for (const [x, y, c] of [[0.6, 0.85, '#f97316'], [1.3, 0.75, '#facc15'], [1, 1.0, '#ef4444']]) b.ball(x, 0.5, 0.06, c, y, {}, 0.6);
    b.box(1, 0.5, 1.7, 0.5, 0.05, '#fde68a', 0.56);
  },
  scacchi: b => {
    b.cyl(0.5, 0.4, 0.06, 0.55, '#78350f');
    chessTex ??= canvasTex((x, s) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.fillStyle = (i + j) % 2 ? '#1f2937' : '#f5f5f4'; x.fillRect((i * s) / 8, (j * s) / 8, s / 8, s / 8); } }, 64);
    const top = b.add(new THREE.Mesh(BOX, [mat('#78350f'), mat('#78350f'), new THREE.MeshStandardMaterial({ map: chessTex }), mat('#78350f'), mat('#78350f'), mat('#78350f')]));
    top.scale.set(0.6, 0.05, 0.6); top.position.set(0.5, 0.58, 0.4);
    b.m('chairCushion', { x: 0.5, z: 0.85, s: 1.6 });
  },
  chitarra: b => {
    b.box(0.5, 0.5, 0.3, 0.3, 0.05, '#1f2937');
    b.ball(0.5, 0.5, 0.2, '#b45309', 0.35, {}, 1.2).scale.z = 0.08;
    b.ball(0.5, 0.5, 0.15, '#b45309', 0.6, {}, 1.1).scale.z = 0.08;
    b.box(0.5, 0.5, 0.06, 0.04, 0.6, '#3f2a1d', 0.7);
  },
  cavalletto: b => {
    b.box(0.3, 0.5, 0.05, 0.05, 1.6, '#a16207'); b.box(0.7, 0.5, 0.05, 0.05, 1.6, '#a16207'); b.box(0.5, 0.3, 0.05, 0.05, 1.5, '#a16207');
    b.box(0.5, 0.56, 0.6, 0.03, 0.75, '#ffffff', 0.7);
    b.box(0.5, 0.58, 0.4, 0.01, 0.3, PAINT[(b.o.x + b.o.y) % 5], 0.9);
  },
  tapis: b => {
    b.box(0.5, 1, 0.75, 1.8, 0.18, '#334155');
    b.box(0.5, 1, 0.6, 1.6, 0.02, '#111827', 0.18);
    b.box(0.15, 1.85, 0.05, 0.05, 1.1, '#94a3b8'); b.box(0.85, 1.85, 0.05, 0.05, 1.1, '#94a3b8');
    b.box(0.5, 1.85, 0.75, 0.2, 0.1, '#1e293b', 1.1);
  },
  pesi: b => {
    b.box(0.5, 1.1, 0.4, 1.2, 0.35, '#111827');
    b.box(0.5, 1.1, 0.42, 1.22, 0.08, '#dc2626', 0.35);
    b.box(0.2, 0.45, 0.05, 0.05, 1.0, '#94a3b8'); b.box(0.8, 0.45, 0.05, 0.05, 1.0, '#94a3b8');
    const bar = b.cyl(0.5, 0.45, 0.025, 1.0, '#cbd5e1', 0.98); bar.rotation.z = Math.PI / 2; bar.position.y = 1.0;
    for (const x of [0.05, 0.95]) { const p = b.cyl(x, 0.45, 0.18, 0.06, '#1f2937'); p.rotation.z = Math.PI / 2; p.position.y = 1.0; }
  },
  pianta: b => b.m('pottedPlant', { smax: 2.2 }),
  piantaGrande: b => b.m('pottedPlant', { s: 3.4 }),
  lampada: b => b.m('lampSquareFloor', { s: 2 }),
  tappeto: b => b.m('rugRectangle', { tint: 1, s: 1.25 }),
  tappetoGrande: b => b.m('rugSquare', { tint: 1, smax: 3 }),
  quadro: b => {
    const c = b.m('bookcaseOpenLow', { back: 1, smax: 1.6 });
    for (const [x, col] of [[0.3, '#60a5fa'], [0.7, '#f472b6']]) { b.box(x, c.cz, 0.25, 0.03, 0.3, '#78350f', c.top); b.box(x, c.cz + 0.02, 0.19, 0.01, 0.24, col, c.top + 0.03); }
  },
  dipinto: b => BUILD.cavalletto(b),
  statua: b => {
    b.box(0.5, 0.5, 0.6, 0.6, 0.5, '#e2e8f0');
    b.cyl(0.5, 0.5, 0.14, 0.7, '#f8fafc', 0.5, { rough: 0.3 });
    b.ball(0.5, 0.5, 0.14, '#f8fafc', 1.32, { rough: 0.3 });
    b.ball(0.5, 0.5, 0.2, '#f1f5f9', 0.6, { rough: 0.3 }, 0.5);
  },
  albero: b => {
    b.cyl(0.5, 0.5, 0.12, 1.4, '#7c4a2d');
    b.ico(0.5, 0.5, 0.75, '#22c55e', 1.9); b.ico(0.25, 0.6, 0.45, '#16a34a', 1.55); b.ico(0.8, 0.35, 0.5, '#15803d', 1.7);
  },
  pino: b => { b.cyl(0.5, 0.5, 0.1, 0.6, '#7c4a2d'); b.cone(0.5, 0.5, 0.6, 1.2, '#166534', 0.5); b.cone(0.5, 0.5, 0.45, 1.0, '#15803d', 1.2); b.cone(0.5, 0.5, 0.3, 0.8, '#16a34a', 1.85); },
  siepe: b => { b.box(0.5, 0.5, 0.98, 0.8, 0.75, '#15803d'); b.ico(0.3, 0.5, 0.35, '#16a34a', 0.7); b.ico(0.72, 0.5, 0.35, '#16a34a', 0.72); },
  aiuola: b => {
    b.box(0.5, 0.5, 0.95, 0.95, 0.16, '#78716c');
    b.box(0.5, 0.5, 0.85, 0.85, 0.02, '#57381f', 0.16);
    for (let i = 0; i < 6; i++) { const x = 0.2 + (i % 3) * 0.3, z = 0.3 + Math.floor(i / 3) * 0.4; b.cyl(x, z, 0.015, 0.25, '#15803d', 0.16); b.ball(x, z, 0.08, b.o.color ?? '#f472b6', 0.43); }
  },
  panchina: b => b.m('benchCushion', { smax: 2.4, tint: '#16a34a' }),
  barbecue: b => {
    for (const [x, z] of [[0.3, 0.3], [0.7, 0.3], [0.5, 0.75]]) b.box(x, z, 0.04, 0.04, 0.7, '#1f2937');
    b.ball(0.5, 0.5, 0.35, '#111827', 0.75, { metal: 0.4, rough: 0.5 }, 0.55);
    b.box(0.5, 0.5, 0.55, 0.55, 0.02, '#94a3b8', 0.95, { metal: 0.6 });
  },
  amaca: b => {
    b.box(0.08, 0.5, 0.1, 0.1, 1.3, '#7c4a2d'); b.box(1.92, 0.5, 0.1, 0.1, 1.3, '#7c4a2d');
    b.box(1, 0.5, 1.6, 0.6, 0.06, '#f59e0b', 0.55);
    b.box(1, 0.5, 1.6, 0.04, 0.03, '#ef4444', 0.6);
  },
  altalena: b => {
    for (const x of [0.1, 1.9]) { b.box(x, 0.2, 0.08, 0.08, 1.9, '#2563eb'); b.box(x, 0.8, 0.08, 0.08, 1.9, '#2563eb'); }
    b.box(1, 0.5, 1.9, 0.08, 0.08, '#1d4ed8', 1.85);
    b.box(0.75, 0.5, 0.02, 0.02, 1.4, '#cbd5e1', 0.45); b.box(1.25, 0.5, 0.02, 0.02, 1.4, '#cbd5e1', 0.45);
    b.box(1, 0.5, 0.6, 0.3, 0.05, '#ef4444', 0.42);
  },
  fontana: b => {
    b.cyl(1, 1, 0.95, 0.4, '#cbd5e1');
    b.cyl(1, 1, 0.85, 0.02, '#38bdf8', 0.37, { rough: 0.1, opacity: 0.85 });
    b.cyl(1, 1, 0.15, 1.1, '#e2e8f0', 0.4);
    b.cyl(1, 1, 0.45, 0.12, '#cbd5e1', 1.4);
    b.cyl(1, 1, 0.38, 0.02, '#7dd3fc', 1.51, { rough: 0.1 });
    b.ball(1, 1, 0.1, '#bae6fd', 1.65, { opacity: 0.8 });
  },
  piscina: b => {
    b.box(1.5, 2, 3, 4, 0.06, '#e2e8f0');
    b.box(1.5, 2, 2.6, 3.6, 0.02, '#0ea5e9', 0.06, { rough: 0.05, opacity: 0.8 });
    b.box(1.5, 2, 2.6, 3.6, 0.01, '#0369a1', 0.02);
    b.box(2.6, 0.3, 0.05, 0.05, 0.7, '#cbd5e1'); b.box(2.9, 0.3, 0.05, 0.05, 0.7, '#cbd5e1');
  },
  lampione: b => { b.box(0.5, 0.5, 0.25, 0.25, 0.1, '#1f2937'); b.cyl(0.5, 0.5, 0.05, 2.1, '#1f2937'); b.ball(0.5, 0.5, 0.17, '#fef3c7', 2.2, { emissive: '#fde68a' }); },
  cassetta: b => { b.box(0.5, 0.5, 0.06, 0.06, 0.95, '#57534e'); b.box(0.5, 0.5, 0.3, 0.45, 0.25, '#dc2626', 0.95); b.box(0.68, 0.45, 0.02, 0.15, 0.1, '#facc15', 1.1); },
  scala: b => {
    const n = 12;
    for (let i = 0; i < n; i++) b.box(0.5, 3 - (i + 0.5) * (3 / n), 0.95, 3 / n, ((i + 1) * LH) / n, i % 2 ? '#b45309' : '#c2783a');
    for (const x of [0.03, 0.97]) {
      const rail = b.box(x, 1.5, 0.04, 3.3, 0.06, '#1f2937', 0);
      rail.position.y = LH / 2 + 0.9; rail.rotation.x = Math.atan2(LH, 3);
    }
  },
  antifurto: b => { b.box(0.5, 0.5, 0.06, 0.06, 1.2, '#64748b'); b.box(0.5, 0.5, 0.35, 0.12, 0.45, '#f8fafc', 1.1); b.ball(0.5, 0.56, 0.06, '#ef4444', 1.45, { emissive: '#ef4444' }); },
  baule: b => { b.box(0.5, 0.5, 0.85, 0.55, 0.45, '#92400e'); b.box(0.5, 0.5, 0.87, 0.57, 0.08, '#facc15', 0.38, { metal: 0.6 }); b.box(0.5, 0.78, 0.1, 0.02, 0.12, '#facc15', 0.25); },
  auto: b => car(b, false),
  suv: b => car(b, true),
  banco: b => {
    b.box(1, 0.45, 1.9, 0.8, 0.08, '#a16207', 0.85);
    for (const [x, z] of [[0.1, 0.1], [1.9, 0.1], [0.1, 0.8], [1.9, 0.8]]) b.box(x, z, 0.08, 0.08, 0.85, '#57381f');
    b.box(1, 0.08, 1.9, 0.06, 0.8, '#78716c', 0.93);
    b.box(0.5, 0.45, 0.4, 0.25, 0.2, '#dc2626', 0.93); b.box(1.4, 0.5, 0.3, 0.05, 0.03, '#94a3b8', 0.93);
  },
  biliardo: b => {
    for (const [x, z] of [[0.25, 0.3], [1.75, 0.3], [0.25, 2.7], [1.75, 2.7]]) b.box(x, z, 0.16, 0.16, 0.75, '#3f2a1d');
    b.box(1, 1.5, 1.8, 2.8, 0.15, '#57381f', 0.72);
    b.box(1, 1.5, 1.6, 2.6, 0.03, '#15803d', 0.87);
    for (const [x, z, c] of [[1, 1, '#f8fafc'], [0.9, 2, '#ef4444'], [1.1, 2.05, '#facc15'], [1, 2.15, '#111827']]) b.ball(x, z, 0.05, c, 0.95);
  },
  freccette: b => {
    b.box(0.5, 0.15, 0.08, 0.08, 1.5, '#57381f');
    const d = b.cyl(0.5, 0.22, 0.3, 0.05, '#111827', 1.5); d.rotation.x = Math.PI / 2; d.position.y = 1.5;
    const r = b.cyl(0.5, 0.25, 0.2, 0.02, '#dc2626', 1.5); r.rotation.x = Math.PI / 2; r.position.y = 1.5;
    const c = b.cyl(0.5, 0.26, 0.05, 0.02, '#22c55e', 1.5); c.rotation.x = Math.PI / 2; c.position.y = 1.5;
  },
  bar: b => {
    b.m('kitchenBar', { x: 0.5, w: 1, d: 0.8, smax: 2.2 }); b.m('kitchenBar', { x: 1.5, w: 1, d: 0.8, smax: 2.2 });
    for (const [x, c] of [[0.3, '#16a34a'], [0.5, '#b45309'], [1.6, '#7c3aed']]) b.cyl(x, 0.35, 0.05, 0.3, c, 1.05, { opacity: 0.85 });
  },
  jukebox: b => {
    b.box(0.5, 0.5, 0.7, 0.5, 1.1, '#7c2d12');
    const top = b.cyl(0.5, 0.5, 0.35, 0.5, '#facc15', 1.1, { emissive: '#f59e0b' }); top.rotation.x = Math.PI / 2; top.position.y = 1.1; top.scale.set(0.35, 0.5, 0.35);
    b.box(0.5, 0.76, 0.5, 0.02, 0.4, '#38bdf8', 0.5, { emissive: '#0ea5e9' });
  },
  pizza: b => { b.box(0.5, 0.5, 0.5, 0.5, 0.06, '#d6a35c'); b.cyl(0.5, 0.5, 0.21, 0.02, '#f59e0b', 0.06); b.cyl(0.5, 0.5, 0.17, 0.01, '#dc2626', 0.08); },
};
function car(b, suv) {
  const c = b.o.color ?? '#dc2626', h = suv ? 0.75 : 0.6;
  b.box(1, 1.5, 1.6, 2.8, h, c, 0.25, { rough: 0.35, metal: 0.3 });
  b.box(1, suv ? 1.45 : 1.6, 1.45, suv ? 2.0 : 1.5, suv ? 0.6 : 0.5, '#0f172a', 0.25 + h, { rough: 0.15, opacity: 0.85 });
  b.box(1, suv ? 1.45 : 1.6, 1.5, suv ? 1.9 : 1.4, 0.05, c, 0.25 + h + (suv ? 0.6 : 0.5), { rough: 0.35 });
  for (const [x, z] of [[0.25, 0.6], [1.75, 0.6], [0.25, 2.4], [1.75, 2.4]]) { const w = b.cyl(x, z, suv ? 0.32 : 0.27, 0.22, '#111827', 0); w.rotation.z = Math.PI / 2; w.position.y = suv ? 0.32 : 0.27; }
  for (const x of [0.5, 1.5]) b.box(x, 2.9, 0.3, 0.02, 0.12, '#fef9c3', 0.6, { emissive: '#fde68a' });
  for (const x of [0.5, 1.5]) b.box(x, 0.1, 0.3, 0.02, 0.1, '#ef4444', 0.6, { emissive: '#7f1d1d' });
}

/** Il gruppo 3D di un oggetto, già girato e messo al suo posto (il verso di base è ruotato di rot × 90°). */
function buildObject(o) {
  const T = TYPES[o.type];
  const group = new THREE.Group();
  const base = new THREE.Group();
  base.position.set(-T.w / 2, 0, -T.d / 2);
  group.add(base);
  const b = maker(base, o, T);
  (BUILD[o.type] ?? (x => x.box(T.w / 2, T.d / 2, T.w * 0.9, T.d * 0.9, 0.8, '#a78bfa')))(b);
  group.rotation.y = ((o.rot ?? 0) * Math.PI) / 2;
  place(group, o);
  group.traverse(m => { m.userData.obj = o.id; });
  return group;
}
function place(group, o) {
  const f = footprint(o);
  group.position.set(f.x + f.w / 2, lvY(o.lv ?? 0), f.y + f.d / 2);
}

// Oggetti dove ci si siede guardando il centro (tavoli, scrivania, scacchi) invece del davanti
const SIT_IN = new Set(['tavolo', 'tavoloQuattro', 'computer', 'scacchi']);
const WATCH = new Set(['tv', 'tvCucina', 'acquario', 'fontana', 'leggi', 'studiaCucina', 'specchio', 'parla', 'console', 'cambiati', 'freccette']);
const SOCIAL_ANIM = { chiacchiera: 'interact-right', scherza: 'emote-yes', abbraccia: 'holding-both', solletico: 'interact-left', bacia: 'emote-yes', litiga: 'emote-no' };
const DANCE = ['emote-yes', 'jump', 'interact-left', 'interact-right'];

// ---------------------------------------------------------------- il mondo
export function createWorld(canvas, FLOORS) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.3, 300);
  const hemi = new THREE.HemisphereLight('#ffffff', '#6b8e5a', 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4e0', 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 90 });
  scene.add(sun, sun.target);
  const lamps = Array.from({ length: 6 }, () => { const l = new THREE.PointLight('#ffd59a', 0, 8, 1.6); scene.add(l); return l; });

  const cam = { tx: 12, ty: 0, tz: 10, yaw: Math.PI / 4, pitch: 0.82, dist: 26 };
  let W = 24, H = 20, built = false, wallMode = 'cut';

  // Terreno, marciapiede, strada e qualche casa dei vicini
  const outside = new THREE.Group();
  scene.add(outside);
  const grassTex = floorTexture('erba', '#5cc25f', '#55b858');
  function buildOutside() {
    outside.clear();
    grassTex.repeat.set(120, 120);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(W / 2, -0.005, H / 2);
    ground.receiveShadow = true;
    outside.add(ground);
    const strip = (z0, z1, color, y = 0.002) => { const m = new THREE.Mesh(BOX, mat(color, { rough: 0.95 })); m.scale.set(120, 0.02, z1 - z0); m.position.set(W / 2, y, (z0 + z1) / 2); m.receiveShadow = true; outside.add(m); };
    strip(H, H + 0.7, '#d6d3d1', 0.01);
    strip(H + 0.7, H + 4, '#475569');
    for (let x = -50; x < W + 50; x += 2) { const d = new THREE.Mesh(BOX, mat('#f8fafc')); d.scale.set(1, 0.025, 0.12); d.position.set(x, 0.005, H + 2.35); outside.add(d); }
    strip(H + 4, H + 4.7, '#d6d3d1', 0.01);
    const house = (x, z, w, d, wall, roof) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(BOX, mat(wall)); body.scale.set(w, 2.6, d); body.position.y = 1.3; body.castShadow = body.receiveShadow = true; g.add(body);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.01, w * 0.75, 1.6, 4, 1), mat(roof)); r.rotation.y = Math.PI / 4; r.scale.z = d / w; r.position.y = 3.4; r.castShadow = true; g.add(r);
      for (const k of [-0.25, 0.25]) { const win = new THREE.Mesh(BOX, mat('#bae6fd', { rough: 0.2 })); win.scale.set(w * 0.2, 0.7, 0.05); win.position.set(k * w, 1.5, -d / 2 - 0.02); g.add(win); }
      const door = new THREE.Mesh(BOX, mat('#7c2d12')); door.scale.set(0.9, 1.6, 0.05); door.position.set(0, 0.8, -d / 2 - 0.02); g.add(door);
      g.position.set(x, 0, z);
      outside.add(g);
    };
    house(-2, H + 10, 8, 6, '#fde68a', '#b91c1c');
    house(9, H + 10.5, 7, 6, '#bfdbfe', '#334155');
    house(19, H + 10, 8, 6, '#fecaca', '#7c2d12');
    house(30, H + 10.5, 7, 6, '#d9f99d', '#1e3a8a');
    for (const [x, z] of [[4, H + 6], [14, H + 6.2], [25, H + 6], [-6, H + 6.3], [-6, 4], [-5, 12], [W + 5, 3], [W + 6, 14]]) {
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(CYL, mat('#7c4a2d')); trunk.scale.set(0.15, 1.4, 0.15); trunk.position.y = 0.7; trunk.castShadow = true; t.add(trunk);
      const top = new THREE.Mesh(ICO, mat('#22c55e')); top.scale.setScalar(0.9); top.position.y = 1.9; top.castShadow = true; t.add(top);
      t.position.set(x, 0, z);
      outside.add(t);
    }
    // bordo del lotto
    const pts = [[0, 0], [W, 0], [W, H], [0, H], [0, 0]].map(([x, z]) => new THREE.Vector3(x, 0.03, z));
    outside.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35 })));
  }
  const cellar = new THREE.Mesh(BOX, mat('#3b2f2a'));
  scene.add(cellar);

  // Piani: pavimenti (un InstancedMesh per tipo di pavimento) e muri (InstancedMesh con colore per pezzo)
  const floorTex = {};
  const floorMat = id => {
    if (!floorTex[id]) { const f = FLOORS[id] ?? FLOORS.legno; floorTex[id] = new THREE.MeshStandardMaterial({ map: floorTexture(id, f[1], f[2]), roughness: id === 'marmo' ? 0.35 : 0.85 }); }
    return floorTex[id];
  };
  const levels = {};
  for (const lv of [-1, 0, 1]) {
    const group = new THREE.Group();
    scene.add(group);
    levels[lv] = { group, floors: new THREE.Group(), walls: new THREE.Group(), floorSig: '', wallSig: '' };
    group.add(levels[lv].floors, levels[lv].walls);
  }
  const wallMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#bae6fd', roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false });
  const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), col = new THREE.Color();

  function buildFloors(g, lv) {
    const L = levels[lv], floors = g.levels[lv].floors;
    const sig = floors.join();
    if (sig === L.floorSig) return;
    L.floorSig = sig;
    for (const c of L.floors.children) c.dispose?.();
    L.floors.clear();
    const by = {};
    floors.forEach((id, i) => { if (id != null && !(lv === 0 && id === 'erba')) (by[id] ??= []).push(i); });
    const th = lv === 0 ? 0.04 : 0.2;
    for (const [id, list] of Object.entries(by)) {
      const im = new THREE.InstancedMesh(BOX, floorMat(id), list.length);
      list.forEach((i, k) => {
        const x = i % g.W, y = Math.floor(i / g.W);
        m4.compose(v1.set(x + 0.5, lvY(lv) - th / 2 + 0.01, y + 0.5), q0, v2.set(1, th, 1));
        im.setMatrixAt(k, m4);
      });
      im.receiveShadow = true;
      im.castShadow = lv > 0;
      im.userData.floor = lv;
      L.floors.add(im);
    }
  }

  /** Pezzi di un muro: ogni pezzo è [da, a] lungo il muro (0-1) e [y0, y1] in altezza. */
  function wallPieces(wl, h) {
    if (wl.door) return { solid: [[0, 0.14, 0, h], [0.86, 1, 0, h], ...(h > 1.75 ? [[0.14, 0.86, 1.75, h]] : [])] };
    if (wl.win) return { solid: [[0, 1, 0, Math.min(h, 0.9)], ...(h > 1.7 ? [[0, 1, 1.7, h]] : [])], glass: h > 0.9 ? [[0, 1, 0.9, Math.min(h, 1.7)]] : [] };
    if (wl.garage) return { solid: h > 1.9 ? [[0, 1, 1.9, h]] : [], metal: [[0.02, 0.98, 0, Math.min(h, 1.9)]] };
    return { solid: [[0, 1, 0, h]] };
  }
  /** Muro tagliato: si abbassa se dalla parte lontana dalla telecamera c'è una stanza (copre la vista dentro casa). */
  function wallLow(g, lv, k, cdx, cdz) {
    if (wallMode === 'down') return true;
    if (wallMode === 'up') return false;
    const [t, a, b] = k.split(':'), p = +a, q = +b;
    const indoor = (x, y) => { const f = x < 0 || y < 0 || x >= g.W || y >= g.H ? null : g.levels[lv].floors[y * g.W + x]; return f != null && f !== 'erba'; };
    if (t === 'v') return indoor(cdx > 0 ? p - 1 : p, q);
    return indoor(p, cdz > 0 ? q - 1 : q);
  }
  function buildWalls(g, lv, top) {
    const L = levels[lv], walls = g.levels[lv].walls;
    const cdx = Math.sign(Math.sin(cam.yaw)), cdz = Math.sign(Math.cos(cam.yaw));
    const sig = JSON.stringify(walls) + (top ? `${wallMode}${cdx}${cdz}` : 'full') + L.floorSig.length;
    if (sig === L.wallSig) return;
    L.wallSig = sig;
    L.walls.clear();
    const solid = [], glass = [], metal = [];
    for (const k in walls) {
      const wl = walls[k];
      const h = top && wallLow(g, lv, k, cdx, cdz) ? LOW : WH;
      const p = wallPieces(wl, h);
      const c = wl.color ?? '#ede9fe';
      for (const s of p.solid ?? []) solid.push([k, s, c]);
      for (const s of p.glass ?? []) glass.push([k, s]);
      for (const s of p.metal ?? []) metal.push([k, s, '#94a3b8']);
    }
    const setPiece = (im, i, k, [a0, a1, y0, y1], thick = WT) => {
      const [t, a, b] = k.split(':'), p = +a, q = +b;
      const e0 = a0 === 0 ? -WT / 2 : 0, e1 = a1 === 1 ? WT / 2 : 0;
      const len = a1 - a0 - e0 + e1, mid = (a0 + e0 + a1 + e1) / 2;
      if (t === 'v') m4.compose(v1.set(p, lvY(lv) + (y0 + y1) / 2, q + mid), q0, v2.set(thick, y1 - y0, len));
      else m4.compose(v1.set(p + mid, lvY(lv) + (y0 + y1) / 2, q), q0, v2.set(len, y1 - y0, thick));
      im.setMatrixAt(i, m4);
    };
    const mk = (list, material, thick) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(BOX, material, list.length);
      list.forEach((it, i) => { setPiece(im, i, it[0], it[1], thick); if (it[2]) im.setColorAt(i, col.set(it[2])); });
      im.castShadow = material !== glassMat;
      im.receiveShadow = true;
      L.walls.add(im);
    };
    mk(solid, wallMat);
    mk(metal, wallMat, WT * 0.6);
    mk(glass, glassMat, WT * 0.4);
  }

  // Oggetti
  const objs = new Map();     // id → { group, sig }
  const objRoot = new THREE.Group();
  scene.add(objRoot);
  const seatCache = new Map();
  const ray = new THREE.Raycaster();
  function syncObjects(g, viewLv, build) {
    const seen = new Set();
    for (const o of g.objects) {
      seen.add(o.id);
      const sig = `${o.type}|${o.x}|${o.y}|${o.rot}|${o.color}|${o.lv}`;
      let r = objs.get(o.id);
      if (!r || r.sig !== sig) {
        if (r) objRoot.remove(r.group);
        r = { group: buildObject(o), sig, o };
        objRoot.add(r.group);
        objs.set(o.id, r);
        for (const k of [...seatCache.keys()]) if (k.startsWith(o.id + '|')) seatCache.delete(k);
      }
      r.o = o;
      const lv = o.lv ?? 0;
      r.group.visible = levelShown(lv, viewLv) && !(o.inUse != null && o.inUse >= 0) && build?.placing?.moveId !== o.id;
    }
    for (const [id, r] of objs) if (!seen.has(id)) { objRoot.remove(r.group); objs.delete(id); }
  }
  const levelShown = (lv, viewLv) => (viewLv === -1 ? lv === -1 : lv >= 0 && lv <= viewLv);
  /** Altezza della superficie di un oggetto in un punto (materasso, cuscino del divano, sedia…). */
  function surfaceAt(o, x, z, key, max = 1.3) {
    if (key && seatCache.has(key)) return seatCache.get(key);
    const r = objs.get(o.id);
    let y = 0;
    if (r) {
      r.group.updateMatrixWorld(true);
      const base = lvY(o.lv ?? 0);
      ray.set(v1.set(x, base + max, z), v2.set(0, -1, 0));
      const hit = ray.intersectObject(r.group, true).find(h => h.object.material?.visible !== false && !h.object.material?.transparent);
      if (hit) y = hit.point.y - base;
    }
    if (key) seatCache.set(key, y);
    return y;
  }

  // Sim
  const sims = new Map();
  const simRoot = new THREE.Group();
  scene.add(simRoot);
  const plumbob = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), new THREE.MeshStandardMaterial({ color: '#22c55e', emissive: '#16a34a', emissiveIntensity: 0.6, roughness: 0.3 }));
  plumbob.scale.y = 1.7;
  scene.add(plumbob);
  const modelOf = s => (CHAR_MODELS.includes(s.look?.model) ? s.look.model : s.gender === 'lei' ? 'female-a' : 'male-a');
  function simRec(s) {
    const model = modelOf(s);
    let r = sims.get(s.id);
    if (r && r.model === model) return r;
    if (r) simRoot.remove(r.root);
    const gl = ready['c:' + model];
    if (!gl) return null;
    const body = cloneSkinned(gl.scene);
    body.scale.setScalar(CS);
    body.traverse(m => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
    const pivot = new THREE.Group();
    pivot.add(body);
    const root = new THREE.Group();
    root.add(pivot);
    const hitbox = new THREE.Mesh(BOX, HIDDEN);
    hitbox.scale.set(0.8, 1.4, 0.8);
    hitbox.position.y = 0.7;
    hitbox.userData.sim = s.id;
    root.add(hitbox);
    simRoot.add(root);
    const mixer = new THREE.AnimationMixer(body);
    r = { model, root, pivot, body, mixer, clips: Object.fromEntries(gl.animations.map(c => [c.name, c])), actions: {}, anim: null, cur: null, heading: 0, px: s.x, py: s.y, speed: 0, t: 0 };
    sims.set(s.id, r);
    return r;
  }
  function play(r, name, once = false, timeScale = 1) {
    if (!r.clips[name]) name = 'idle';
    const a = (r.actions[name] ??= r.mixer.clipAction(r.clips[name]));
    a.timeScale = timeScale;
    if (r.anim === name) return;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat);
    a.clampWhenFinished = once;
    a.play();
    if (r.cur) a.crossFadeFrom(r.cur, 0.18, false);
    r.cur = a;
    r.anim = name;
  }
  const angTo = (x0, z0, x1, z1) => Math.atan2(x1 - x0, z1 - z0);
  function lerpAngle(a, b, k) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; }

  function updateSim(g, s, r, dt, viewLv) {
    r.root.visible = !s.atWork && levelShown(s.lv, viewLv) && (s.lv === viewLv || viewLv > s.lv);
    const moved = Math.hypot(s.x - r.px, s.y - r.py);
    const realSpeed = dt > 0 ? moved / dt : 0;
    r.speed += (realSpeed - r.speed) * Math.min(1, dt * 8);
    const c = s.cur;
    let x = s.x, z = s.y, y = lvY(s.lv), heading = r.heading, anim = 'idle', once = false, lie = null, ts = 1;
    if (moved > 0.0005 && moved < 2) heading = angTo(r.px, r.py, s.x, s.y);
    r.px = s.x; r.py = s.y;
    const o = c?.objRef;
    if (c?.state === 'walk' || (!c && r.speed > 0.05)) {
      anim = 'walk';
      ts = Math.max(0.7, Math.min(3, r.speed / 1.6));
    } else if (c?.state === 'do') {
      if (c.floor) { anim = 'die'; once = true; }
      else if (c.social) {
        const p = g.sims.find(q => q.id === c.partner);
        if (p) heading = angTo(s.x, s.y, p.x, p.y);
        anim = SOCIAL_ANIM[c.id] ?? 'emote-yes';
      } else if (c.dish) {
        const d = g.dishes.find(q => q.id === c.dish);
        if (d) heading = angTo(s.x, s.y, d.x, d.y);
        anim = 'pick-up'; once = true;
      } else if (c.dance) {
        anim = DANCE[Math.floor(r.t / 1.4) % DANCE.length];
      } else if (o && c.seat != null) {
        const T = TYPES[o.type];
        const front = ((o.rot ?? 0) * Math.PI) / 2;
        const [lx, ly] = T.seats[c.seat];
        const f = footprint(o);
        if (s.pose === 'lie') {
          const alongX = T.w > T.d;
          const [cx, cz] = alongX ? point(o, T.w / 2, ly) : [x, z];
          x = cx; z = cz;
          y += surfaceAt(o, x, z, `${o.id}|${c.seat}|lie`) + 0.12;
          heading = front + (alongX ? Math.PI / 2 : 0);
          lie = true;
          anim = c.id === 'pesi' ? 'holding-both' : 'static';
        } else if (s.pose === 'swim') {
          y -= 0.3;
          anim = 'walk'; ts = 0.6;
          heading = front + Math.sin(r.t * 0.3) * 2;
        } else if (s.pose === 'sit') {
          y += surfaceAt(o, x, z, `${o.id}|${c.seat}`) - 0.04;
          heading = SIT_IN.has(o.type) ? angTo(x, z, f.x + f.w / 2, f.y + f.d / 2) : front;
          anim = c.id === 'gioca' || c.id === 'programma' || c.id === 'social' || c.id === 'lavoro' ? 'sit' : 'sit';
          once = true;
          if (o.type === 'altalena') { const sw = Math.sin(r.t * 2.5) * 0.25; z += Math.cos(front) * sw; x += Math.sin(front) * sw; }
        } else {
          y += Math.min(0.25, surfaceAt(o, x, z, `${o.id}|${c.seat}|stand`, 0.4));
          heading = front;
          anim = c.run ? 'sprint' : 'idle';
        }
        void lx;
      } else if (o) {
        const f = footprint(o);
        heading = angTo(s.x, s.y, f.x + f.w / 2, f.y + f.d / 2);
        anim = WATCH.has(c.id) ? 'idle' : c.id === 'spegni' ? 'interact-left' : 'interact-right';
      } else anim = 'interact-right';
    } else if (s.pose === 'lie') { anim = 'die'; once = true; }
    r.t += dt;
    r.heading = lerpAngle(r.heading, heading, lie ? 1 : Math.min(1, dt * 10));
    r.root.position.set(x, y, z);
    r.root.rotation.y = r.heading;
    if (lie) { r.pivot.rotation.x = -Math.PI / 2; r.pivot.position.set(0, 0, 0.62); }
    else { r.pivot.rotation.x = 0; r.pivot.position.set(0, 0, 0); }
    play(r, anim, once, ts);
    r.mixer.update(dt);
    r.top = lie ? 0.5 : anim === 'sit' ? 1.0 : 1.25;
  }

  // Piatti, fuoco, sporco, fumo
  const fx = new THREE.Group();
  scene.add(fx);
  const dishes = new Map();
  function syncDishes(g, viewLv) {
    const seen = new Set();
    for (const d of g.dishes ?? []) {
      seen.add(d.id);
      let m = dishes.get(d.id);
      if (!m) {
        m = new THREE.Group();
        const plate = new THREE.Mesh(CYL, mat('#f8fafc', { rough: 0.3 })); plate.scale.set(0.16, 0.02, 0.16); m.add(plate);
        const food = new THREE.Mesh(SPH, mat('#a16207')); food.scale.set(0.09, 0.03, 0.09); food.position.y = 0.02; m.add(food);
        m.traverse(k => { k.userData.dish = d.id; k.castShadow = true; });
        let h = 0;
        if (d.h) {   // sul tavolo: l'altezza del piano del tavolo più vicino
          for (const r of objs.values()) {
            if ((r.o.lv ?? 0) !== (d.lv ?? 0) || !TYPES[r.o.type].eat) continue;
            const f = footprint(r.o);
            if (d.x >= f.x && d.x <= f.x + f.w && d.y >= f.y && d.y <= f.y + f.d) h = surfaceAt(r.o, d.x, d.y, null, 1.0);
          }
        }
        m.userData.h = h;
        fx.add(m);
        dishes.set(d.id, m);
      }
      m.position.set(d.x, lvY(d.lv ?? 0) + m.userData.h + 0.02, d.y);
      m.visible = levelShown(d.lv ?? 0, viewLv);
    }
    for (const [id, m] of dishes) if (!seen.has(id)) { fx.remove(m); dishes.delete(id); }
  }
  const effects = new Map();
  function syncEffects(g, viewLv, t) {
    const seen = new Set();
    for (const o of g.objects) {
      const kind = o.fire ? 'fire' : o.broken ? 'smoke' : (o.dirt ?? 0) >= 4 ? 'dirt' : null;
      if (!kind) continue;
      const key = o.id + kind;
      seen.add(key);
      let e = effects.get(key);
      if (!e) {
        e = new THREE.Group();
        if (kind === 'fire') for (let i = 0; i < 6; i++) { const f = new THREE.Mesh(CONE, mat(i % 2 ? '#f97316' : '#facc15', { emissive: i % 2 ? '#ea580c' : '#f59e0b', opacity: 0.9 })); f.userData.i = i; e.add(f); }
        if (kind === 'smoke') for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(SPH, mat('#64748b', { opacity: 0.5 })); f.userData.i = i; e.add(f); }
        if (kind === 'dirt') {
          for (const [dx, dz] of [[-0.3, 0.4], [0.25, 0.5], [0.05, 0.75]]) { const p = new THREE.Mesh(CYL, mat('#78350f', { opacity: 0.6 })); p.scale.set(0.16, 0.01, 0.1); p.position.set(dx, 0.02, dz); e.add(p); }
          for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(SPH, mat('#111827')); f.scale.setScalar(0.025); f.userData.i = i; f.userData.fly = true; e.add(f); }
        }
        e.userData.kind = kind;
        fx.add(e);
        effects.set(key, e);
      }
      const f = footprint(o);
      e.position.set(f.x + f.w / 2, lvY(o.lv ?? 0), f.y + f.d / 2);
      e.visible = levelShown(o.lv ?? 0, viewLv);
      for (const c of e.children) {
        const i = c.userData.i;
        if (i == null) continue;
        if (kind === 'fire') { const k = (t * 1.6 + i / 6) % 1; c.scale.set(0.25 - k * 0.15, 0.5 + Math.sin(t * 9 + i) * 0.15, 0.25 - k * 0.15); c.position.set(Math.sin(i * 2.1) * 0.3, 0.3 + k * 0.6, Math.cos(i * 1.7) * 0.3); }
        else if (kind === 'smoke') { const k = (t * 0.5 + i / 4) % 1; c.scale.setScalar(0.15 + k * 0.25); c.position.set(Math.sin(i * 3) * 0.15, 1 + k * 1.2, 0); c.material.opacity = 0.5 * (1 - k); }
        else if (c.userData.fly) c.position.set(Math.sin(t * 4 + i * 2) * 0.35, 0.8 + Math.cos(t * 5 + i) * 0.2, Math.cos(t * 3 + i) * 0.35);
      }
    }
    for (const [k, e] of effects) if (!seen.has(k)) { fx.remove(e); effects.delete(k); }
  }

  // Anteprime della costruzione: l'oggetto da piazzare e i muri da tirare
  let ghost = null;
  const ghostMats = new Map();
  const footMat = { ok: new THREE.MeshBasicMaterial({ color: '#22c55e', transparent: true, opacity: 0.35, depthWrite: false }), no: new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.4, depthWrite: false }) };
  const foot = new THREE.Mesh(BOX, footMat.ok);
  scene.add(foot);
  const preview = new THREE.Group();
  scene.add(preview);
  let previewSig = '';
  function syncBuild(build, canPlaceFn) {
    const p = build?.placing;
    const sig = p ? `${p.type}|${p.rot}|${p.color}|${p.lv}` : '';
    if (ghost && ghost.userData.sig !== sig) { scene.remove(ghost); ghost = null; }
    if (p && !ghost) {
      ghost = buildObject(p);
      ghost.traverse(m => {
        if (!m.isMesh) return;
        m.castShadow = false;
        m.material = [].concat(m.material).map(x => { if (!ghostMats.has(x.uuid)) { const c = x.clone(); c.transparent = true; c.opacity = 0.7; ghostMats.set(x.uuid, c); } return ghostMats.get(x.uuid); });
        if (m.material.length === 1) m.material = m.material[0];
        m.userData.obj = null;
      });
      ghost.userData.sig = sig;
      scene.add(ghost);
    }
    foot.visible = !!p;
    if (p) {
      ghost.rotation.y = ((p.rot ?? 0) * Math.PI) / 2;
      place(ghost, p);
      ghost.position.y += 0.03;
      const f = footprint(p);
      foot.material = canPlaceFn(p) ? footMat.ok : footMat.no;
      foot.scale.set(f.w, 0.02, f.d);
      foot.position.set(f.x + f.w / 2, lvY(p.lv ?? 0) + 0.03, f.y + f.d / 2);
    }
    const wp = build?.wallPreview ?? [];
    const ps = JSON.stringify(wp.map(u => [u.k, u.ok]));
    if (ps !== previewSig) {
      previewSig = ps;
      preview.clear();
      for (const u of wp) {
        const [t, a, b2] = u.k.split(':'), x = +a, z = +b2;
        const m = new THREE.Mesh(BOX, u.ok ? footMat.ok : footMat.no);
        if (t === 'v') { m.scale.set(WT * 1.5, WH, 1); m.position.set(x, WH / 2, z + 0.5); } else { m.scale.set(1, WH, WT * 1.5); m.position.set(x + 0.5, WH / 2, z); }
        preview.add(m);
      }
    }
    preview.position.y = lvY(build?.lv ?? 0);
  }

  // Luce: sole che gira, cielo, lampade la sera
  const sky = new THREE.Color(), skyDay = new THREE.Color('#8fd3ff'), skyDusk = new THREE.Color('#f9a66c'), skyNight = new THREE.Color('#141a3a');
  let lampT = 0;
  function lighting(g, viewLv, dt) {
    const hr = g.minute / 60;
    const day = Math.max(0, Math.sin(((hr - 6) / 14) * Math.PI));   // 6 → 20
    const dusk = Math.max(0, 1 - Math.abs(hr - 19.5) / 1.5) + Math.max(0, 1 - Math.abs(hr - 6.5) / 1.2);
    sky.copy(skyNight).lerp(skyDay, Math.min(1, day * 1.6));
    if (dusk > 0) sky.lerp(skyDusk, Math.min(0.6, dusk * 0.6));
    if (viewLv === -1) sky.set('#1c1512');
    scene.background = sky;
    scene.fog = new THREE.Fog(sky, 45, 110);
    const ang = ((hr - 6) / 14) * Math.PI;
    sun.position.set(cam.tx + Math.cos(ang) * 30, Math.max(4, Math.sin(ang) * 35), cam.tz + 14);
    sun.target.position.set(cam.tx, 0, cam.tz);
    sun.intensity = 0.25 + 2.5 * day;
    sun.color.set(dusk > 0.3 ? '#ffd2a1' : '#fff4e0');
    hemi.intensity = 0.55 + 0.95 * day;
    hemi.color.set(day > 0.15 ? '#ffffff' : '#8ea2ff');
    // Lampade (e fuoco): poche luci, sugli oggetti più vicini al centro della vista
    lampT -= dt;
    if (lampT > 0) return;
    lampT = 0.5;
    const night = day < 0.25;
    const list = [];
    for (const o of g.objects) {
      if (!levelShown(o.lv ?? 0, viewLv)) continue;
      const lamp = o.fire ? 3 : night && (o.type === 'lampada' || o.type === 'lampione' || o.type === 'comodino' || o.type === 'jukebox') && (g.power || o.type === 'lampione') ? 1 : 0;
      if (!lamp) continue;
      const f = footprint(o);
      list.push({ o, f, pri: lamp * 100 - Math.hypot(f.x - cam.tx, f.y - cam.tz) });
    }
    list.sort((a, b) => b.pri - a.pri);
    lamps.forEach((l, i) => {
      const it = list[i];
      if (!it) { l.intensity = 0; return; }
      const fire = it.o.fire;
      l.color.set(fire ? '#ff7a1a' : '#ffd59a');
      l.intensity = fire ? 9 : 6;
      l.position.set(it.f.x + it.f.w / 2, lvY(it.o.lv ?? 0) + (it.o.type === 'lampione' ? 2.2 : it.o.type === 'comodino' ? 0.9 : 1.6), it.f.y + it.f.d / 2);
    });
  }

  // ---------------------------------------------------------------- telecamera
  function updateCamera() {
    cam.pitch = Math.max(0.35, Math.min(1.35, cam.pitch));
    cam.dist = Math.max(5, Math.min(70, cam.dist));
    cam.tx = Math.max(-6, Math.min(W + 6, cam.tx));
    cam.tz = Math.max(-6, Math.min(H + 8, cam.tz));
    const cp = Math.cos(cam.pitch);
    camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * cam.dist, cam.ty + Math.sin(cam.pitch) * cam.dist, cam.tz + Math.cos(cam.yaw) * cp * cam.dist);
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    camera.updateMatrixWorld();
  }
  const ndc = new THREE.Vector2();
  function rayFrom(sx, sy) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((sx - r.left) / r.width) * 2 - 1, -((sy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray;
  }
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  /** Punto del pavimento (a quel piano) sotto il dito, in caselle con i decimali. */
  function tileAt(sx, sy, lv = 0) {
    plane.constant = -lvY(lv);
    const p = rayFrom(sx, sy).ray.intersectPlane(plane, v1);
    return p ? [p.x, p.z] : [NaN, NaN];
  }

  const api = {
    renderer, scene, camera, cam, _sims: sims,
    get wallMode() { return wallMode; },
    set wallMode(m) { wallMode = m; },
    resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      // Il punto guardato sta in alto (al 38%): sotto c'è il pannello del Sim
      const d = Math.round(h * 0.24);
      camera.aspect = w / Math.max(1, h + d);
      camera.fov = camera.aspect < 0.8 ? 52 : 40;   // telefono in verticale: più largo
      camera.setViewOffset(w, h + d, 0, d, w, h);
      camera.updateProjectionMatrix();
    },
    setLot(g) {
      if (built && W === g.W && H === g.H) return;
      W = g.W; H = g.H;
      buildOutside();
      cellar.scale.set(W + 2, 0.05, H + 2);
      cellar.position.set(W / 2, -LH - 0.04, H / 2);
      built = true;
    },
    centerOn(x, y, lv = 0) { cam.tx = x; cam.tz = y; cam.ty = lvY(lv); updateCamera(); },
    tileAt,
    panStart(sx, sy) { const [x, z] = tileAt(sx, sy, cam.ty / LH); return { x, z }; },
    panMove(start, sx, sy) {
      const [x, z] = tileAt(sx, sy, cam.ty / LH);
      if (!Number.isFinite(x) || !Number.isFinite(start.x)) return;
      cam.tx += start.x - x; cam.tz += start.z - z;
      updateCamera();
    },
    zoom(f) { cam.dist /= f; updateCamera(); },
    rotate(da) { cam.yaw += da; updateCamera(); },
    tilt(dp) { cam.pitch += dp; updateCamera(); },
    /** Cosa c'è sotto il dito: un Sim, dei piatti, un oggetto o una casella del piano che si guarda. */
    pick(sx, sy, g, viewLv, withSims = true) {
      const r = rayFrom(sx, sy);
      if (withSims) {
        const hs = r.intersectObjects([...sims.values()].filter(x => x.root.visible).map(x => x.root.children[1]), false);
        const s = hs[0] && g.sims.find(q => q.id === hs[0].object.userData.sim);
        if (s && s.lv === viewLv) return { sim: s };
        const hd = r.intersectObjects([...dishes.values()].filter(m => m.visible), true);
        const d = hd[0] && g.dishes.find(q => q.id === hd[0].object.userData.dish);
        if (d) return { dish: d };
      }
      const ho = r.intersectObjects([...objs.values()].filter(x => x.group.visible && (x.o.lv ?? 0) === viewLv).map(x => x.group), true);
      const hits = ho.map(h => objs.get(h.object.userData.obj)?.o).filter(Boolean);
      const solid = hits.find(o => !TYPES[o.type].flat) ?? hits[0];
      if (solid) return { obj: solid };
      const [x, z] = tileAt(sx, sy, viewLv);
      const tx = Math.floor(x), ty = Math.floor(z);
      if (tx >= 0 && ty >= 0 && tx < g.W && ty < g.H && g.levels[viewLv].floors[ty * g.W + tx] != null) return { tile: [tx, ty] };
      return {};
    },
    /** Punto della scena → punto sullo schermo (in pixel CSS), o null se è dietro la telecamera. */
    project(x, y, z) {
      v1.set(x, y, z).project(camera);
      if (v1.z > 1) return null;
      return [((v1.x + 1) / 2) * canvas.clientWidth, ((1 - v1.y) / 2) * canvas.clientHeight];
    },
    simAnchor(s) {
      const r = sims.get(s.id);
      if (!r || !r.root.visible) return null;
      const p = r.root.position;
      return { head: api.project(p.x, p.y + (r.top ?? 1.25) + 0.25, p.z), feet: api.project(p.x, p.y, p.z) };
    },
    objAnchor(o, h = 1.2) { const f = footprint(o); return api.project(f.x + f.w / 2, lvY(o.lv ?? 0) + h, f.y + f.d / 2); },
    /** Disegna tutto: si chiama a ogni fotogramma. */
    render(g, st, dt) {
      api.setLot(g);
      const { viewLv } = st;
      for (const lv of [-1, 0, 1]) {
        const L = levels[lv];
        const shown = levelShown(lv, viewLv);
        L.group.visible = shown;
        if (!shown) continue;
        buildFloors(g, lv);
        buildWalls(g, lv, lv === viewLv);
      }
      outside.visible = viewLv !== -1;
      cellar.visible = viewLv === -1;
      syncObjects(g, viewLv, st.build);
      syncDishes(g, viewLv);
      syncEffects(g, viewLv, performance.now() / 1000);
      for (const s of g.sims) { const r = simRec(s); if (r) updateSim(g, s, r, dt, viewLv); }
      const sel = sims.get(st.sel), ss = g.sims[st.sel];
      plumbob.visible = !!sel && sel.root.visible && !st.build && ss?.pose !== 'lie';
      if (plumbob.visible) {
        const p = sel.root.position;
        plumbob.position.set(p.x, p.y + (sel.top ?? 1.25) + 0.45 + Math.sin(performance.now() / 400) * 0.04, p.z);
        plumbob.rotation.y += dt * 1.5;
        const m = st.mood ?? 80;
        plumbob.material.color.setHSL((m * 1.2) / 360, 0.75, 0.5);
        plumbob.material.emissive.setHSL((m * 1.2) / 360, 0.75, 0.3);
      }
      syncBuild(st.build ? { ...st.build, lv: viewLv } : null, st.canPlace);
      lighting(g, viewLv, dt);
      updateCamera();
      renderer.render(scene, camera);
    },
  };
  updateCamera();
  return api;
}

/** Ritratto di un personaggio (per la creazione della coppia e i ritratti in alto): immagine PNG, fatta una volta. */
const portraits = new Map();
let portraitKit = null;
export function portrait(model) {
  if (portraits.has(model)) return portraits.get(model);
  const gl = ready['c:' + model];
  if (!gl) return '';
  if (!portraitKit) {
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(160, 200, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#8b7a99', 2.2));
    const d = new THREE.DirectionalLight('#ffffff', 1.6); d.position.set(1, 2, 3); scene.add(d);
    const camera = new THREE.PerspectiveCamera(28, 160 / 200, 0.1, 20);
    camera.position.set(0.35, 0.62, 1.9);
    camera.lookAt(0, 0.4, 0);
    portraitKit = { renderer, scene, camera, canvas };
  }
  const { renderer, scene, camera, canvas } = portraitKit;
  const body = cloneSkinned(gl.scene);
  const mixer = new THREE.AnimationMixer(body);
  const clip = gl.animations.find(c => c.name === 'idle');
  if (clip) { mixer.clipAction(clip).play(); mixer.update(0.3); }
  body.rotation.y = 0.25;
  scene.add(body);
  renderer.render(scene, camera);
  const url = canvas.toDataURL('image/png');
  scene.remove(body);
  portraits.set(model, url);
  return url;
}
