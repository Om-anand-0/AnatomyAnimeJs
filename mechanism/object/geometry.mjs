import * as G from "../kit/lathe.mjs";
const TAU = Math.PI * 2;
const unit = G.unit3;
const sub = G.sub3;
const mul = G.mul3;
const dot = G.dot3;
const cross = G.cross3;
export const frame = (o, a, u) => {
  const A = unit(a);
  const U = unit(sub(u, mul(A, dot(u, A))));
  return { o, a: A, u: U, v: cross(A, U) };
};
const X = [1, 0, 0];
const Z = [0, 0, 1];
const NZ = [0, 0, -1];
const ring = (r, steps = 72) =>
  Array.from({ length: steps }, (_, j) => {
    const a = (TAU * j) / steps;
    return `${j ? "L" : "M"}${(r * Math.cos(a)).toFixed(3)} ${(r * Math.sin(a)).toFixed(3)}`;
  }).join("") + "Z";
const line = (d, tone = "lo") => `<path class="iso-line" data-tone="${tone}" d="${d}"/>`;
const ngon = (n, r, phase = 0) => Array.from({ length: n }, (_, j) => [r * Math.cos(phase + (TAU * j) / n), r * Math.sin(phase + (TAU * j) / n)]);
// A convex rounded-ish block in the xy plane: radial from r0 to r1, tangential half-width w, at angle a.
const pod = (a, r0, r1, w, chamfer = 3) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const at = (rr, t) => [rr * c - t * s, rr * s + t * c];
  return [at(r0, -w), at(r1 - chamfer, -w), at(r1, -w + chamfer), at(r1, w - chamfer), at(r1 - chamfer, w), at(r0, w)];
};

// The mechanism: a turned stack along z, 300 mm long, Ø ~120 mm. One explode assembly per anime.js module.
// z: 0 bottom flange … 300 top lens. Every stacked module keeps a 2 mm gap so modules can also slide out sideways.
export const MODULES = {
  scope: { z: [0, 10], kb: 0.18 },
  scroll: { z: [12, 30], kb: 0.12 },
  draggable: { z: [32, 80], kb: 3.89 },
  easings: { z: [82, 100], kb: 2.25 },
  timer: { z: [102, 114], kb: 0.44 },
  animation: { z: [116, 186], kb: 5.64 },
  spring: { z: [188, 206], kb: 1.06 },
  svg: { z: [208, 218], kb: 2.73 },
  stagger: { z: [220, 234], kb: 1.84 },
  timeline: { z: [236, 262], kb: 2.58 },
  waapi: { z: [264, 300], kb: 0.29 },
};
// Modules that pop out sideways in the bundle section, with their side.
export const POPS = { timeline: 1, stagger: -1, svg: 1, spring: -1, timer: 1, easings: -1 };

export function buildObject(T, { layer }) {
  const parts = {};
  const groups = {};
  const explode = [];
  const anchors = {};
  const features = [];
  const L = layer;
  const root = T.group("root", { free: { origin: [0, 0, 150] } });
  groups.root = root;
  const slide = (name, dir, travel, parent = root) => (groups[name] = T.group(name, { parent, slide: { direction: unit(dir), travel } }));
  const assembly = (name, dir, travel, delay = 0, parent = root) => {
    const g = slide(name, dir, travel, parent);
    explode.push({ name, travel, delay });
    return g;
  };
  // A module hangs off a sideways "pop" slide when it is one of POPS, so the bundle section can pull it out.
  const moduleGroup = (name, dir, travel, delay) => {
    const parent = POPS[name] ? slide(`pop.${name}`, [POPS[name], 0, 0], 150) : root;
    return assembly(name, dir, travel, delay, parent);
  };
  const part = (p) => (parts[p.name] = p);
  const up = frame([0, 0, 0], Z, X);
  const round = (name, group, s0, s1, r, o = {}, F = up) =>
    part(
      T.round({
        name,
        group,
        layer: L,
        F,
        s0,
        s1,
        r,
        ends: o.ends,
        tone: o.tone ?? "hi",
        crease: o.crease ?? "lo",
        material: o.material ?? "steel",
        lit: o.lit,
        details: o.details,
      }),
    );
  const prismZ = (name, group, poly, s0, s1, o = {}) =>
    part(
      T.prism({
        name,
        group,
        layer: L,
        F: up,
        polygon: poly,
        s0,
        s1,
        steps: 5,
        tone: o.tone ?? "hi",
        crease: o.crease ?? "lo",
        bevel: o.bevel ?? 0,
        material: o.material ?? "steel",
        lit: o.lit,
        details: o.details,
      }),
    );
  const plane = (p, o, u, v, svg, normal, fade = [0.04, 0.3]) => T.plane({ part: p, o, u, v, svg, normal, fade });
  const TOP = { u: [1, 0, 0], v: [0, -1, 0] };
  const BOTTOM = { u: [1, 0, 0], v: [0, 1, 0] };
  const knurl = (s0, s1, count, tone = "lo") => ({ ribs: { s0: s0 + 1, s1: s1 - 1, count, fade: [0.08, 0.55], seams: true, tone } });
  const mid = (name) => (MODULES[name].z[0] + MODULES[name].z[1]) / 2;

  // ── scope: base flange, wide and thin, with a recessed face drawing underneath.
  {
    const [z0, z1] = MODULES.scope.z;
    const g = moduleGroup("scope", NZ, 120, 0);
    const p = round("scope.flange", g, z0, z1 - 4, 72, { material: "gunmetal", details: { seams: [z0 + 3], bolts: [{ s: z1 - 4, r: 66, count: 12, size: 1.1, tone: "lo" }] } });
    round("scope.lip", g, z1 - 4, z1, [62, 58], { material: "steel" });
    plane(p, [0, 0, z0 - 0.02], BOTTOM.u, BOTTOM.v, line(ring(60, 80) + ring(46, 64) + ring(18, 40), "mid"), NZ);
    anchors.scope = [72, 0, mid("scope")];
  }

  // ── scroll: knurled rear ring.
  {
    const [z0, z1] = MODULES.scroll.z;
    const g = moduleGroup("scroll", NZ, 92, 0.04);
    round("scroll.ring", g, z0, z1, 56, { material: "steel", details: knurl(z0, z1, 120) });
    anchors.scroll = [56, 0, mid("scroll")];
  }

  // ── draggable: lobed cage, a core with eight pods that fan outward.
  {
    const [z0, z1] = MODULES.draggable.z;
    const g = moduleGroup("draggable", NZ, 64, 0.08);
    round("draggable.core", g, z0, z1, 30, { material: "gunmetal", details: { seams: [z0 + 10, z1 - 10] } });
    for (let i = 0; i < 8; i++) {
      const a = (TAU * i) / 8 + TAU / 16;
      const pg = assembly(`draggable.pod${i}`, [Math.cos(a), Math.sin(a), 0], 22, 0.1, g);
      prismZ(`draggable.pod${i}`, pg, pod(a, 32, 52, 10, 4), z0 + 4, z1 - 4, { material: "steel", bevel: 1.4 });
      round(`draggable.pin${i}`, pg, 52, 57, 3.4, { material: "chrome", tone: "mid" }, frame([0, 0, (z0 + z1) / 2], [Math.cos(a), Math.sin(a), 0], Z));
    }
    anchors.draggable = [52, 0, mid("draggable")];
  }

  // ── easings: two cam bands with six lobes between them.
  {
    const [z0, z1] = MODULES.easings.z;
    const g = moduleGroup("easings", NZ, 40, 0.14);
    round("easings.band.a", g, z0, z0 + 7, 50, { material: "steel", details: { seams: [z0 + 3.5] } });
    round("easings.band.b", g, z1 - 9, z1, 48, { material: "steel", details: knurl(z1 - 9, z1, 90, "faint") });
    for (let i = 0; i < 6; i++) {
      const a = (TAU * i) / 6;
      prismZ(`easings.cam${i}`, g, pod(a, 26, 51, 7, 2.5), z0 + 7, z1 - 9, { material: "gunmetal" });
    }
    round("easings.hub", g, z0 + 7, z1 - 9, 24, { material: "gunmetal" });
    anchors.easings = [50, 0, mid("easings")];
  }

  // ── timer: dot ring.
  {
    const [z0, z1] = MODULES.timer.z;
    const g = moduleGroup("timer", NZ, 22, 0.2);
    round("timer.ring", g, z0, z1, 54, { material: "steel", details: { bolts: [{ s: z1, r: 48, count: 24, size: 1.2, tone: "lo" }], seams: [z0 + 6] } });
    anchors.timer = [54, 0, mid("timer")];
  }

  // ── animation: the main drum, an octagon collar and four side pods. It stays put; everything leaves it.
  {
    const [z0, z1] = MODULES.animation.z;
    const g = moduleGroup("animation", Z, 0, 0);
    prismZ("animation.collar", g, ngon(8, 64, TAU / 16), z0, z0 + 12, { material: "gunmetal", bevel: 1.6 });
    for (let i = 0; i < 8; i++) {
      const a = (TAU * i) / 8;
      round(`animation.bolt${i}`, g, z0 + 12, z0 + 14.5, 1.6, { material: "chrome", tone: "mid" }, frame([61.5 * Math.cos(a), 61.5 * Math.sin(a), 0], Z, X));
    }
    const drum = round("animation.drum", g, z0 + 12, z1 - 8, 58, { material: "steel", details: { seams: [z0 + 22, z1 - 18] } });
    round("animation.cap", g, z1 - 8, z1, [58, 54], { material: "gunmetal" });
    for (let i = 0; i < 4; i++) {
      const a = (TAU * i) / 4 + TAU / 8;
      const pg = assembly(`animation.pod${i}`, [Math.cos(a), Math.sin(a), 0], 36, 0.12, g);
      const F = frame([0, 0, (z0 + z1) / 2 + 4], [Math.cos(a), Math.sin(a), 0], Z);
      round(`animation.pod${i}`, pg, 59.5, 68, 11, { material: "gunmetal", details: { seams: [63] } }, F);
      round(`animation.pod${i}.cap`, pg, 68, 71, 7, { material: "chrome", tone: "mid" }, F);
    }
    // A window of ticks on the drum, facing +y.
    let d = "";
    for (let k = -8; k <= 8; k++) d += `M${k * 4} -8V${k % 4 ? -4 : 0}`;
    plane(drum, [0, 58.2, (z0 + z1) / 2 - 14], [1, 0, 0], [0, 0, -1], line(d, "mid") + line("M-36 4H36", "faint"), [0, 1, 0]);
    anchors.animation = [64, 0, mid("animation")];
    anchors.body = [0, 0, 150];
  }

  // ── spring: coil band, many fine ribs.
  {
    const [z0, z1] = MODULES.spring.z;
    const g = moduleGroup("spring", Z, 24, 0.2);
    for (let i = 0; i < 5; i++) round(`spring.coil${i}`, g, z0 + i * 3.6, z0 + i * 3.6 + 3, i % 2 ? 48 : 50, { material: "copper", details: { ribs: { s0: z0 + i * 3.6 + 0.4, s1: z0 + i * 3.6 + 2.6, count: 40, fade: [0.08, 0.55], tone: "lo" } } });
    anchors.spring = [50, 0, mid("spring")];
  }

  // ── svg: clip band with six clips standing on it.
  {
    const [z0, z1] = MODULES.svg.z;
    const g = moduleGroup("svg", Z, 40, 0.16);
    round("svg.band", g, z0, z1, 52, { material: "steel", details: { bolts: [{ s: z1, r: 46, count: 6, size: 1.4, tone: "lo" }] } });
    for (let i = 0; i < 6; i++) {
      const a = (TAU * i) / 6 + TAU / 12;
      round(`svg.clip${i}`, g, 52.5, 58, 3.6, { material: "chrome", tone: "mid" }, frame([0, 0, (z0 + z1) / 2], [Math.cos(a), Math.sin(a), 0], Z));
    }
    anchors.svg = [52, 0, mid("svg")];
  }

  // ── stagger: gear ring.
  {
    const [z0, z1] = MODULES.stagger.z;
    const g = moduleGroup("stagger", Z, 58, 0.1);
    round("stagger.gear", g, z0, z1, 54, { material: "gunmetal", details: { seams: [z0 + 7] } });
    for (let i = 0; i < 24; i++) prismZ(`stagger.tooth${i}`, g, pod((TAU * i) / 24, 55, 62, 3.2, 1.5), z0 + 1, z1 - 1, { material: "gunmetal" });
    anchors.stagger = [60, 0, mid("stagger")];
  }

  // ── timeline: ribbed collar, a cone with seams.
  {
    const [z0, z1] = MODULES.timeline.z;
    const g = moduleGroup("timeline", Z, 78, 0.05);
    [50, 48, 46, 44].forEach((r, i) => round(`timeline.step${i}`, g, z0 + i * 6.5, z0 + i * 6.5 + 6.5, r, { material: "steel", details: { seams: [z0 + i * 6.5 + 3.2] } }));
    anchors.timeline = [50, 0, mid("timeline")];
  }

  // ── waapi: knurled front ring holding a glass element; the glass leads.
  {
    const [z0, z1] = MODULES.waapi.z;
    const g = moduleGroup("waapi", Z, 100, 0.02);
    round("waapi.ring", g, z0, z1 - 8, 62, { material: "steel", details: knurl(z0, z1 - 8, 140) });
    const gg = assembly("waapi.glass", Z, 140, 0, g);
    const glass = round("waapi.glass", gg, z1 - 8, z1, [56, 52], { material: "glass" });
    plane(glass, [0, 0, z1 + 0.02], TOP.u, TOP.v, line(ring(44, 72) + ring(30, 60), "mid") + line(ring(14, 40), "lo"), Z);
    anchors.waapi = [62, 0, mid("waapi")];
  }

  // Prove draw order for every pop state too.
  for (const n of Object.keys(POPS)) features.push({ [`pop.${n}`]: 150 });
  features.push(Object.fromEntries(Object.keys(POPS).map((n) => [`pop.${n}`, 150])));
  return { parts, groups, explode, root, anchors, features, counts: { modules: Object.keys(MODULES).length } };
}
export function explodeValues(explode, apart, { stretch = 0.55 } = {}) {
  const out = {};
  for (const { name, travel, delay } of explode) {
    const t = Math.max(0, Math.min(1, (apart - delay * stretch) / (1 - stretch)));
    out[name] = travel * t * t * (3 - 2 * t);
  }
  return out;
}
