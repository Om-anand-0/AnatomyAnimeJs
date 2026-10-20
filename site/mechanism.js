const T3_ROOT = Math.sqrt(1.6);
const T3_TAU = Math.PI * 2;
const T3_RAD = Math.PI / 180;
const T3_LB = [0, 0.2, 0.42, 0.62];
const T3_EB = [0.25, 0.5, 0.75];
const T3_SOFT = 0.035;
const T3_LEVELS = 32;
const T3_Q = 64;
const t3State = { detail: 1, exact: false };

function t3Num(v) {
  if (t3State.exact) return String(Math.round(v * 1e6) / 1e6);
  let t = Math.round(v * 100);
  if (t === 0) return "0";
  let sign = "";
  if (t < 0) {
    sign = "-";
    t = -t;
  }
  const whole = Math.floor(t / 100);
  const part = t - whole * 100;
  if (part === 0) return sign + whole;
  if (part < 10) return sign + whole + ".0" + part;
  return sign + whole + "." + (part % 10 === 0 ? part / 10 : part);
}

function t3Fix(v, scale) {
  const t = Math.round(v * scale) / scale;
  return t === 0 ? "0" : String(t);
}

function t3Path(buf, count, closed) {
  if (count < 2) return "";
  let s = "M" + t3Num(buf[0]) + " " + t3Num(buf[1]);
  for (let i = 1; i < count; i++) s += "L" + t3Num(buf[2 * i]) + " " + t3Num(buf[2 * i + 1]);
  return closed ? s + "Z" : s;
}

const t3Step = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function t3Level(score, bands) {
  let u = 0;
  for (let i = 0; i < bands.length; i++) u += t3Step(bands[i] - T3_SOFT, bands[i] + T3_SOFT, score);
  return Math.round(u * T3_Q);
}

function t3Grow(f, name, size, Kind) {
  if (!f[name] || f[name].length < size) f[name] = new Kind(Math.max(size, f[name] ? f[name].length * 2 : 16));
  return f[name];
}

function t3Box(buf, count, box) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < count; i++) {
    const x = buf[2 * i];
    const y = buf[2 * i + 1];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  box[0] = x0;
  box[1] = y0;
  box[2] = x1;
  box[3] = y1;
}

function t3Unit(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function t3Rot(axis, degrees) {
  const [x, y, z] = t3Unit(axis);
  const c = Math.cos(degrees * T3_RAD);
  const s = Math.sin(degrees * T3_RAD);
  const C = 1 - c;
  return new Float64Array([c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C]);
}

function t3Mul(A, B) {
  const out = new Float64Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return out;
}

const t3Apply = (R, v) => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];

const T3_EYE = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

function t3Camera(P, pose) {
  const a = (P.azimuth ?? 45) * T3_RAD;
  const e = (P.elevation ?? 30) * T3_RAD;
  const k = P.scale * T3_ROOT;
  const sa = Math.sin(a);
  const ca = Math.cos(a);
  const se = Math.sin(e);
  const ce = Math.cos(e);
  const cam = { m: new Float64Array(6), ox: 0, oy: 0, V: [0, 0, 0], L: [0, 0, 0], k, turn: 0, R: T3_EYE, t: [0, 0, 0], lx: 0, ly: 1, sa, ca, se, ce, origin: P.origin };
  const lw = Math.hypot(sa, ca, 1.2);
  if (pose && pose.R && !(pose.turn !== undefined && pose.root)) {
    const R = pose.R;
    const t = pose.t ?? [0, 0, 0];
    const r0 = [sa * k, -ca * k, 0];
    const r1 = [ca * se * k, sa * se * k, -ce * k];
    for (let c = 0; c < 3; c++) {
      cam.m[c] = r0[0] * R[c] + r0[1] * R[3 + c] + r0[2] * R[6 + c];
      cam.m[3 + c] = r1[0] * R[c] + r1[1] * R[3 + c] + r1[2] * R[6 + c];
    }
    cam.ox = P.origin[0] + r0[0] * t[0] + r0[1] * t[1] + r0[2] * t[2];
    cam.oy = P.origin[1] + r1[0] * t[0] + r1[1] * t[1] + r1[2] * t[2];
    const V = [ca * ce, sa * ce, se];
    const L = [-sa / lw, ca / lw, 1.2 / lw];
    for (let c = 0; c < 3; c++) {
      cam.V[c] = R[c] * V[0] + R[3 + c] * V[1] + R[6 + c] * V[2];
      cam.L[c] = R[c] * L[0] + R[3 + c] * L[1] + R[6 + c] * L[2];
    }
    cam.R = R;
    cam.t = t;
  } else {
    const turn = pose ? pose.turn ?? 0 : 0;
    const pivot = pose && pose.pivot ? pose.pivot : [0, 0];
    const b = a - turn * T3_RAD;
    const sb = Math.sin(b);
    const cb = Math.cos(b);
    cam.m[0] = sb * k;
    cam.m[1] = -cb * k;
    cam.m[2] = 0;
    cam.m[3] = cb * se * k;
    cam.m[4] = sb * se * k;
    cam.m[5] = -ce * k;
    cam.ox = P.origin[0] + (pivot[0] * sa - pivot[1] * ca) * k;
    cam.oy = P.origin[1] + (pivot[0] * ca + pivot[1] * sa) * se * k;
    cam.V = [cb * ce, sb * ce, se];
    cam.L = [-sb / lw, cb / lw, 1.2 / lw];
    cam.turn = turn;
    const c = Math.cos(turn * T3_RAD);
    const s = Math.sin(turn * T3_RAD);
    cam.R = new Float64Array([c, -s, 0, s, c, 0, 0, 0, 1]);
    cam.t = [pivot[0], pivot[1], 0];
  }
  const lh = Math.hypot(cam.L[0], cam.L[1]) || 1;
  cam.lx = cam.L[0] / lh;
  cam.ly = cam.L[1] / lh;
  return cam;
}

function t3Quat(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  const x = q[0] / l;
  const y = q[1] / l;
  const z = q[2] / l;
  const w = q[3] / l;
  return new Float64Array([1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]);
}

function t3FreeRot(v) {
  if (v.R) return v.R instanceof Float64Array ? v.R : Float64Array.from(v.R);
  if (v.q) return t3Quat(v.q);
  if (v.axis) return t3Rot(v.axis, v.angle ?? 0);
  return T3_EYE;
}

function t3Poses(groups, values) {
  const get = (name) => (values instanceof Map ? values.get(name) : values ? values[name] : undefined) ?? 0;
  const list = [];
  for (let index = 0; index < groups.length; index++) {
    const g = groups[index];
    const v = get(g.name);
    let parent = g.parent === undefined || g.parent === null || g.parent < 0 ? null : list[g.parent];
    let po = parent ? groups[g.parent].origin : [0, 0, 0];
    let R = T3_EYE;
    let t = [g.origin[0] - po[0], g.origin[1] - po[1], g.origin[2] - po[2]];
    if (g.kind === "turn") R = t3Rot([0, 0, 1], v);
    else if (g.kind === "hinge") R = t3Rot(g.axis, v);
    else if (g.kind === "slide") {
      const d = t3Unit(g.direction);
      t[0] += d[0] * v;
      t[1] += d[1] * v;
      t[2] += d[2] * v;
    } else if (g.kind === "free" && v && typeof v === "object") {
      R = t3FreeRot(v);
      if (v.world) {
        parent = null;
        po = [0, 0, 0];
        t = [g.origin[0], g.origin[1], g.origin[2]];
      }
      if (v.t) {
        t[0] += v.t[0];
        t[1] += v.t[1];
        t[2] += v.t[2];
      }
    }
    if (!parent) {
      const pose = { R, t, value: v };
      if (g.kind === "turn") Object.assign(pose, { turn: v, pivot: [g.origin[0], g.origin[1]], root: true });
      list.push(pose);
      continue;
    }
    const tw = t3Apply(parent.R, t);
    list.push({ R: t3Mul(parent.R, R), t: [tw[0] + parent.t[0], tw[1] + parent.t[1], tw[2] + parent.t[2]], value: v });
  }
  return list;
}

function t3PosesMap(groups, values) {
  const list = t3Poses(groups, values);
  return new Map(groups.map((g, index) => [g.name, list[index]]));
}

function t3Roles(part) {
  const roles = [];
  const spec = part.spec;
  const details = part.details ?? {};
  const add = (name, type, extra = {}) => roles.push({ name, type, ...extra });
  const tone = part.tone ?? "hi";
  const crease = part.crease ?? "faint";
  const fadedSlots = (prefix, count, cls, lineTone) => {
    for (let j = 0; j < count; j++) add(`${prefix}${j}`, "slot", { cls, tone: lineTone });
  };
  const planes = () => (part.planes ?? []).forEach((_, j) => add(`plane${j}`, "plane"));
  const dots = () => (part.dots ?? []).forEach((dot, j) => add(`c${j}`, "dot", { tone: dot.tone ?? "mid", size: dot.size ?? 0.5 }));
  const sheets = (top) => {
    for (let t = 0; t < 4; t++) add(`s${t}`, "path", { cls: "iso-shade", shade: t });
    if (top) add("s4", "path", { cls: "iso-top" });
  };
  const inner = () => {
    if ((details.seams && details.seams.length) || (details.ribs && details.ribs.seams)) add("inner", "path", { cls: "iso-line", tone: "faint" });
  };
  const ribs = () => {
    if (details.ribs) fadedSlots("r", spec.slots?.ribs ?? 6, "iso-line", details.ribs.tone ?? "lo");
  };
  if (part.kind === "prism") {
    add("fill", "path", { cls: "iso-fill" });
    const faces = spec.ring.length / 2 + (spec.up ? 0 : 2);
    for (let j = 0; j < faces; j++) add(`f${j}`, "face");
    if (spec.up) add("top", "xform", { cls: "iso-top" });
    if (crease !== "none") add("crease", "path", { cls: "iso-line iso-crease", tone: crease });
    if (spec.bevel && crease !== "none") fadedSlots("v", spec.slots?.bevel ?? 6, "iso-line iso-bevel", crease);
    if (details.seams && details.seams.length) add("inner", "path", { cls: "iso-line", tone: "faint" });
    planes();
    add("edge", "path", { cls: "iso-line iso-edge", tone });
    dots();
  } else if (part.kind === "round" || part.kind === "lathe") {
    add("fill", "path", { cls: "iso-fill" });
    sheets(true);
    const ends = part.kind === "round" ? spec.ends : spec.caps.map((cap) => (cap ? "flat" : "open"));
    ends.forEach((end, j) => end === "flat" && add(`k${j}`, "face"));
    if (crease !== "none") add("crease", "path", { cls: "iso-line iso-crease", tone: crease });
    inner();
    ribs();
    planes();
    add("edge", "path", { cls: "iso-line iso-edge", tone });
    dots();
  } else if (part.kind === "ball") {
    add("fill", "path", { cls: "iso-fill" });
    sheets(false);
    spec.flats.forEach((_, j) => add(`f${j}`, "face"));
    if (crease !== "none") add("crease", "path", { cls: "iso-line iso-crease", tone: crease });
    planes();
    add("edge", "path", { cls: "iso-line iso-edge", tone });
    dots();
  } else if (part.kind === "tube") {
    add("body", "path", { cls: "tb-body" });
    if (spec.wide) {
      add("shine", "path", { cls: "tb-shine" });
      add("shade", "path", { cls: "tb-shade" });
    }
    if (spec.rings) fadedSlots("r", spec.slots?.ribs ?? 6, "tb-ring", spec.rings.tone ?? "lo");
    add("edges", "path", { cls: "iso-line tb-edge", tone });
  } else if (part.kind === "fixed") {
    add("move", "self");
    ribs();
    planes();
    dots();
  }
  return roles;
}

function t3Planes(list) {
  return (list ?? []).map((plane) => ({ o: plane.o, u: plane.u, v: plane.v, n: plane.n, fade: plane.fade ?? [0.04, 0.3], billboard: Boolean(plane.billboard) }));
}

function t3Dots(list) {
  return (list ?? []).map((dot) => ({ p: dot.p, n: dot.n ?? null, size: dot.size ?? 0.5, fade: dot.fade ?? [0.04, 0.42] }));
}

function t3PreparePrism(run, part) {
  const spec = part.spec;
  const n = spec.ring.length / 2;
  run.n = n;
  run.up = Boolean(spec.up);
  const ring = Float64Array.from(spec.ring);
  run.ring = ring;
  const nx = new Float64Array(n);
  const ny = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = ring[2 * j] - ring[2 * i];
    const dy = ring[2 * j + 1] - ring[2 * i + 1];
    const l = Math.hypot(dx, dy) || 1;
    nx[i] = dy / l;
    ny[i] = -dx / l;
  }
  run.nx = nx;
  run.ny = ny;
  const F = spec.up ? { o: [0, 0, 0], a: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] } : spec.F;
  run.F = F;
  run.s0 = spec.up ? spec.z0 : spec.s0;
  run.s1 = spec.up ? spec.z1 : spec.s1;
  const lo = new Float64Array(3 * n);
  const hi = new Float64Array(3 * n);
  const N3 = new Float64Array(3 * n);
  for (let i = 0; i < n; i++) {
    const x = ring[2 * i];
    const y = ring[2 * i + 1];
    for (let c = 0; c < 3; c++) {
      const base = F.o[c] + F.u[c] * x + F.v[c] * y;
      lo[3 * i + c] = base + F.a[c] * run.s0;
      hi[3 * i + c] = base + F.a[c] * run.s1;
      N3[3 * i + c] = F.u[c] * nx[i] + F.v[c] * ny[i];
    }
  }
  run.lo = lo;
  run.hi = hi;
  run.N3 = N3;
  run.sharp = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = (i - 1 + n) % n;
    run.sharp[i] = nx[p] * nx[i] + ny[p] * ny[i] < Math.cos(0.35) ? 1 : 0;
  }
  if (spec.bevel) {
    const inset = new Float64Array(2 * n);
    for (let i = 0; i < n; i++) {
      const p = (i - 1 + n) % n;
      const mx = nx[p] + nx[i];
      const my = ny[p] + ny[i];
      const l = Math.hypot(mx, my) || 1;
      inset[2 * i] = ring[2 * i] - (mx / l) * spec.bevel;
      inset[2 * i + 1] = ring[2 * i + 1] - (my / l) * spec.bevel;
    }
    run.inset = inset;
  }
  run.seams = part.details && part.details.seams ? part.details.seams.slice() : null;
  run.cut = spec.cuts && spec.cuts.length ? spec.cuts : null;
}

function t3Axes(run, part) {
  if (run.kind === "ball") return run.flats.map((flat) => flat.n);
  if (run.kind === "tube") return run.tips.slice();
  if (run.kind === "prism") {
    const out = [run.F.a];
    for (let i = 0; i < run.n; i++) {
      const n = [run.N3[3 * i], run.N3[3 * i + 1], run.N3[3 * i + 2]];
      if (out.every((m) => Math.abs(m[0] * n[0] + m[1] * n[1] + m[2] * n[2]) < 0.9995)) out.push(n);
    }
    return out;
  }
  if (run.F) return [run.F.a];
  if (part.spec && part.spec.F) return [part.spec.F.a];
  return [];
}

function t3Cloud(run, part) {
  const out = [];
  const ring = (F, s, r, count) => {
    for (let j = 0; j < count; j++) {
      const c = Math.cos((j / count) * T3_TAU);
      const n = Math.sin((j / count) * T3_TAU);
      out.push(F.o[0] + F.a[0] * s + r * (c * F.u[0] + n * F.v[0]), F.o[1] + F.a[1] * s + r * (c * F.u[1] + n * F.v[1]), F.o[2] + F.a[2] * s + r * (c * F.u[2] + n * F.v[2]));
    }
  };
  if (run.kind === "prism") {
    for (let i = 0; i < 3 * run.n; i++) out.push(run.lo[i]);
    for (let i = 0; i < 3 * run.n; i++) out.push(run.hi[i]);
  } else if (run.kind === "round") {
    ring(run.F, run.s0, run.r0, 24);
    ring(run.F, run.s1, run.r1, 24);
    for (const [end, s, r] of [[0, run.s0, run.r0], [1, run.s1, run.r1]]) {
      if (run.ends[end] !== "dome") continue;
      const sign = end ? 1 : -1;
      for (const b of [0.5, 1.0, 1.35]) ring(run.F, s + sign * r * Math.sin(b), r * Math.cos(b), 6);
      out.push(run.F.o[0] + run.F.a[0] * (s + sign * r), run.F.o[1] + run.F.a[1] * (s + sign * r), run.F.o[2] + run.F.a[2] * (s + sign * r));
    }
  } else if (run.kind === "ball") {
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < 64; i++) {
      const y = 1 - (2 * (i + 0.5)) / 64;
      const rad = Math.sqrt(1 - y * y);
      const w = [Math.cos(golden * i) * rad, Math.sin(golden * i) * rad, y];
      const p = [run.c[0] + run.r * w[0], run.c[1] + run.r * w[1], run.c[2] + run.r * w[2]];
      let inside = true;
      for (const flat of run.flats) if ((p[0] - run.c[0]) * flat.n[0] + (p[1] - run.c[1]) * flat.n[1] + (p[2] - run.c[2]) * flat.n[2] > flat.d + 1e-9) inside = false;
      if (inside) out.push(p[0], p[1], p[2]);
    }
    for (const flat of run.flats)
      for (let j = 0; j < 12; j++) {
        const c = Math.cos((j / 12) * T3_TAU) * flat.rho;
        const n = Math.sin((j / 12) * T3_TAU) * flat.rho;
        out.push(run.c[0] + flat.n[0] * flat.d + c * flat.u[0] + n * flat.v[0], run.c[1] + flat.n[1] * flat.d + c * flat.u[1] + n * flat.v[1], run.c[2] + flat.n[2] * flat.d + c * flat.u[2] + n * flat.v[2]);
      }
  } else if (run.kind === "lathe") {
    const lv = run.levels;
    const step = Math.max(4, Math.floor(lv.length / 4 / 8)) * 4;
    for (let i = 0; i < lv.length; i += step) ring(run.F, lv[i], lv[i + 1], 8);
    ring(run.F, lv[lv.length - 4], lv[lv.length - 3], 8);
  } else if (run.kind === "tube") {
    const b = run.body;
    const stride = Math.max(1, Math.floor(b.count / 8));
    for (let i = 0; i < b.count; i += stride) {
      const T = t3Unit([b.D3[3 * i], b.D3[3 * i + 1], b.D3[3 * i + 2]]);
      const [u, v] = t3Basis(T);
      ring({ o: [b.P3[3 * i], b.P3[3 * i + 1], b.P3[3 * i + 2]], a: T, u, v }, 0, run.r, 8);
    }
  } else if (part.cloud) for (const v of part.cloud) out.push(v);
  return Float64Array.from(out);
}

function t3Unpack(value, grouped) {
  if (!value) return new Float64Array(0);
  if (typeof value !== "string") return Float64Array.from(value);
  const text = atob(value);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const size = grouped ? 10 : 8;
  const stride = grouped ? 6 : 5;
  const count = bytes.length / size;
  const out = new Float64Array(count * stride);
  for (let e = 0; e < count; e++) {
    let o = e * size;
    const at = e * stride;
    out[at] = view.getUint16(o);
    out[at + 1] = view.getUint16(o + 2);
    o += 4;
    if (grouped) {
      out[at + 2] = view.getUint16(o) - 1;
      o += 2;
    }
    let x = (view.getUint16(o) / 65535) * 2 - 1;
    let y = (view.getUint16(o + 2) / 65535) * 2 - 1;
    const z = 1 - Math.abs(x) - Math.abs(y);
    if (z < 0) {
      const ox = (1 - Math.abs(y)) * (x >= 0 ? 1 : -1);
      const oy = (1 - Math.abs(x)) * (y >= 0 ? 1 : -1);
      x = ox;
      y = oy;
    }
    const l = Math.hypot(x, y, z) || 1;
    out[at + stride - 3] = x / l;
    out[at + stride - 2] = y / l;
    out[at + stride - 1] = z / l;
  }
  return out;
}

function t3Prepare(data, { unit = 1 } = {}) {
  const P = data.P;
  const runs = data.parts.map((part, index) => {
    const run = { index, name: part.name, kind: part.kind, group: part.group ?? -1, layer: part.layer, part, roles: t3Roles(part), planes: t3Planes(part.planes), dots: t3Dots(part.dots), unit };
    run.role = Object.fromEntries(run.roles.map((role, j) => [role.name, j]));
    if (part.kind === "prism") t3PreparePrism(run, part);
    else if (part.kind === "round") t3PrepareRound(run, part, P, unit);
    else if (part.kind === "ball") t3PrepareBall(run, part, P, unit);
    else if (part.kind === "lathe") t3PrepareLathe(run, part, P, unit);
    else if (part.kind === "tube") t3PrepareTube(run, part, data);
    else if (part.kind === "fixed") {
      run.anchor = part.spec.anchor;
      run.home = part.spec.home;
      run.box0 = part.spec.box;
      run.hull0 = Float64Array.from(part.spec.hull);
      run.F = part.spec.F ?? null;
      run.ribs = part.details && part.details.ribs ? part.details.ribs : null;
    }
    run.slots = part.spec.slots ?? {};
    run.cloud = t3Cloud(run, part);
    run.axes = t3Axes(run, part);
    const cn = run.cloud.length / 3;
    run.centroid = [0, 0, 0];
    for (let i = 0; i < cn; i++) for (let c = 0; c < 3; c++) run.centroid[c] += run.cloud[3 * i + c] / Math.max(1, cn);
    return run;
  });
  const layers = data.layers.map((layer, index) => {
    const parts = Int32Array.from(layer.parts);
    const local = new Map();
    parts.forEach((global, at) => local.set(global, at));
    const planar = t3Unpack(data.planes && data.planes[layer.name], false);
    const dynamic = Int32Array.from((data.dynamic && data.dynamic[layer.name]) ?? []);
    const free = Int32Array.from((data.free && data.free[layer.name]) ?? []);
    const framed = t3Unpack(data.framed && data.framed[layer.name], true);
    const groupPairs = [];
    const raw = (data.groupPairs && data.groupPairs[layer.name]) ?? [];
    const members = new Map();
    for (const global of parts) {
      const g = runs[global].group;
      if (!members.has(g)) members.set(g, []);
      members.get(g).push(global);
    }
    for (let p = 0; p < raw.length; p += 6) groupPairs.push({ a: Int32Array.from(members.get(raw[p]) ?? []), b: Int32Array.from(members.get(raw[p + 1]) ?? []), frame: raw[p + 2], n: [raw[p + 3], raw[p + 4], raw[p + 5]], boxA: new Float64Array(4), boxB: new Float64Array(4) });
    const looseAt = new Uint8Array(parts.length);
    for (const global of free) looseAt[local.get(global)] = 1;
    return { index, name: layer.name, parts, local, rest: Int32Array.from(layer.rest ?? layer.parts), planar, framed, groupPairs, dynamic, free, looseAt, warm: new Map() };
  });
  return { P, data, unit, groups: data.groups, runs, layers };
}

function t3Frame(run) {
  const count = run.roles.length;
  return { d: new Array(count).fill(""), q: new Int32Array(count), w: new Float64Array(count).fill(-1), t: new Array(count).fill(""), o: new Float64Array(count).fill(1), box: new Float64Array(4), hull: new Float64Array(64), hullN: 0, cx: new Float64Array(count), cy: new Float64Array(count), quads: null, quadN: 0 };
}

const t3Buf = { a: new Float64Array(1024), b: new Float64Array(1024), c: new Float64Array(1024) };

function t3Scratch(name, size) {
  if (t3Buf[name].length < size) t3Buf[name] = new Float64Array(size * 2);
  return t3Buf[name];
}

function t3SetHull(f, buf, count) {
  const hull = t3Grow(f, "hull", 2 * count, Float64Array);
  for (let i = 0; i < 2 * count; i++) hull[i] = buf[i];
  f.hullN = count;
}

function t3Faded(f, run, prefix, lines, count) {
  if (!f.fade) f.fade = {};
  const detail = t3State.detail;
  if (detail < 1) for (let i = 0; i < count; i++) lines.alpha[i] *= detail;
  if (detail < 0.01) count = 0;
  f.fade[prefix] = { key: lines.key.slice(0, count), alpha: lines.alpha.slice(0, count) };
  const slots = run.slots[prefix === "v" ? "bevel" : "ribs"] ?? 6;
  const levels = run._levels ?? (run._levels = new Array(T3_LEVELS + 1));
  for (let l = 0; l <= T3_LEVELS; l++) levels[l] = "";
  for (let i = 0; i < count; i++) {
    const alpha = lines.alpha[i];
    const level = Math.min(T3_LEVELS, Math.round(alpha * T3_LEVELS));
    if (level <= 0) continue;
    levels[level] += lines.d[i];
  }
  const present = [];
  for (let l = T3_LEVELS; l >= 1; l--) if (levels[l]) present.push([l, levels[l]]);
  while (present.length > slots) {
    let best = 1;
    let gap = Infinity;
    for (let i = 1; i < present.length; i++) {
      const g = present[i - 1][0] - present[i][0];
      if (g < gap) {
        gap = g;
        best = i;
      }
    }
    const [a, da] = present[best - 1];
    const [b, db] = present[best];
    present.splice(best - 1, 2, [(a + b) / 2, da + db]);
  }
  for (let j = 0; j < slots; j++) {
    const role = run.role[`${prefix}${j}`];
    if (role === undefined) continue;
    if (j < present.length) {
      f.d[role] = present[j][1];
      f.o[role] = present[j][0] / T3_LEVELS;
    } else {
      f.d[role] = "";
      f.o[role] = 0;
    }
  }
  return present.length;
}

const t3Lines = { d: [], alpha: [], key: [] };
const t3None = { d: [], alpha: [], key: [] };

function t3EmitPrism(run, cam, f) {
  const n = run.n;
  const m = cam.m;
  const ox = cam.ox;
  const oy = cam.oy;
  const V = cam.V;
  const L = cam.L;
  const lo = run.lo;
  const hi = run.hi;
  const N3 = run.N3;
  const bot = t3Scratch("a", 2 * n);
  const top = t3Scratch("b", 2 * n);
  for (let i = 0; i < n; i++) {
    const a = 3 * i;
    bot[2 * i] = ox + m[0] * lo[a] + m[1] * lo[a + 1] + m[2] * lo[a + 2];
    bot[2 * i + 1] = oy + m[3] * lo[a] + m[4] * lo[a + 1] + m[5] * lo[a + 2];
    top[2 * i] = ox + m[0] * hi[a] + m[1] * hi[a + 1] + m[2] * hi[a + 2];
    top[2 * i + 1] = oy + m[3] * hi[a] + m[4] * hi[a + 1] + m[5] * hi[a + 2];
  }
  const F = run.F;
  const aV = F.a[0] * V[0] + F.a[1] * V[1] + F.a[2] * V[2];
  const near = aV >= 0 ? top : bot;
  const far = aV >= 0 ? bot : top;
  const facing = run._facing ?? (run._facing = new Float64Array(n));
  for (let i = 0; i < n; i++) facing[i] = N3[3 * i] * V[0] + N3[3 * i + 1] * V[1] + N3[3 * i + 2] * V[2];
  const on = (i) => facing[((i % n) + n) % n] > 1e-9;
  let i0 = -1;
  for (let i = 0; i < n; i++)
    if (on(i) && !on(i - 1)) {
      i0 = i;
      break;
    }
  const sil = t3Scratch("c", 4 * n + 8);
  const silAt = run._silAt ?? (run._silAt = new Int32Array(2 * n + 4));
  let count = 0;
  let i1 = i0;
  const nearSet = aV >= 0 ? hi : lo;
  const farSet = aV >= 0 ? lo : hi;
  if (i0 < 0) {
    for (let i = 0; i < n; i++) {
      sil[2 * count] = near[2 * i];
      sil[2 * count + 1] = near[2 * i + 1];
      silAt[count] = i;
      count++;
    }
  } else {
    while (on(i1)) i1++;
    for (let j = i0; j <= i1; j++) {
      const i = j % n;
      sil[2 * count] = far[2 * i];
      sil[2 * count + 1] = far[2 * i + 1];
      silAt[count] = -1 - i;
      count++;
    }
    for (let j = i1; j <= i0 + n; j++) {
      const i = j % n;
      sil[2 * count] = near[2 * i];
      sil[2 * count + 1] = near[2 * i + 1];
      silAt[count] = i;
      count++;
    }
    if (count > 2 && Math.abs(sil[0] - sil[2 * count - 2]) < 1e-9 && Math.abs(sil[1] - sil[2 * count - 1]) < 1e-9) count--;
  }
  const outline = t3Path(sil, count, true);
  f.d[run.role.fill] = outline;
  if (run.cut) {
    const inPlane = (index) => {
      const at = silAt[index];
      const set = at < 0 ? farSet : nearSet;
      const v = at < 0 ? -1 - at : at;
      return run.cut.some((cut) => Math.abs(cut.n[0] * set[3 * v] + cut.n[1] * set[3 * v + 1] + cut.n[2] * set[3 * v + 2] - cut.d) < 1e-3);
    };
    const flags = new Uint8Array(count);
    const onSame = (i, j) => {
      const at = (index) => {
        const a = silAt[index];
        const set = a < 0 ? farSet : nearSet;
        const v = a < 0 ? -1 - a : a;
        return [set[3 * v], set[3 * v + 1], set[3 * v + 2]];
      };
      const p = at(i);
      const q = at(j);
      return run.cut.some((cut) => Math.abs(cut.n[0] * p[0] + cut.n[1] * p[1] + cut.n[2] * p[2] - cut.d) < 1e-3 && Math.abs(cut.n[0] * q[0] + cut.n[1] * q[1] + cut.n[2] * q[2] - cut.d) < 1e-3);
    };
    for (let j = 0; j < count; j++) flags[j] = inPlane(j) && onSame(j, (j + 1) % count) ? 1 : 0;
    f.d[run.role.edge] = t3Broken(sil, count, flags);
  } else f.d[run.role.edge] = outline;
  t3Box(sil, count, f.box);
  t3SetHull(f, sil, count);
  const quad = new Float64Array(8);
  for (let i = 0; i < n; i++) {
    const role = run.role[`f${i}`];
    if (!(facing[i] > 1e-6)) {
      f.d[role] = "";
      continue;
    }
    const j = (i + 1) % n;
    quad[0] = top[2 * i];
    quad[1] = top[2 * i + 1];
    quad[2] = top[2 * j];
    quad[3] = top[2 * j + 1];
    quad[4] = bot[2 * j];
    quad[5] = bot[2 * j + 1];
    quad[6] = bot[2 * i];
    quad[7] = bot[2 * i + 1];
    f.d[role] = t3Path(quad, 4, true);
    let score;
    if (run.up) {
      score = (run.nx[i] * cam.lx + run.ny[i] * cam.ly + 1) / 2;
      f.q[role] = t3Level(score, T3_EB);
    } else {
      score = N3[3 * i] * L[0] + N3[3 * i + 1] * L[1] + N3[3 * i + 2] * L[2];
      f.q[role] = t3Level(score, T3_LB);
    }
    const e1 = Math.hypot(quad[2] - quad[0], quad[3] - quad[1]);
    const e2 = Math.hypot(quad[6] - quad[0], quad[7] - quad[1]);
    const area = Math.abs((quad[2] - quad[0]) * (quad[7] - quad[1]) - (quad[3] - quad[1]) * (quad[6] - quad[0]));
    const wide = area / (Math.max(e1, e2) || 1);
    f.w[role] = wide < 0.4 ? Math.round(wide * 100) / 100 : -1;
  }
  if (run.up) {
    const z = run.s1;
    f.t[run.role.top] = `matrix(${t3Fix(m[0], 1e5)} ${t3Fix(m[3], 1e5)} ${t3Fix(m[1], 1e5)} ${t3Fix(m[4], 1e5)} ${t3Fix(ox + m[2] * z, 100)} ${t3Fix(oy + m[5] * z, 100)})`;
  } else {
    for (let side = 0; side < 2; side++) {
      const role = run.role[`f${n + side}`];
      const sign = side ? 1 : -1;
      const face = sign * aV;
      if (!(face > 1e-6)) {
        f.d[role] = "";
        continue;
      }
      const ring = side ? top : bot;
      f.d[role] = t3Path(ring, n, true);
      f.q[role] = t3Level(sign * (F.a[0] * L[0] + F.a[1] * L[1] + F.a[2] * L[2]), T3_LB);
      let minor = Infinity;
      let x0 = Infinity;
      let x1 = -Infinity;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ex = ring[2 * j] - ring[2 * i];
        const ey = ring[2 * j + 1] - ring[2 * i + 1];
        const l = Math.hypot(ex, ey);
        if (l < 1e-9) continue;
        let lo2 = Infinity;
        let hi2 = -Infinity;
        for (let q = 0; q < n; q++) {
          const v = ((ring[2 * q] - ring[2 * i]) * ey - (ring[2 * q + 1] - ring[2 * i + 1]) * ex) / l;
          if (v < lo2) lo2 = v;
          if (v > hi2) hi2 = v;
        }
        minor = Math.min(minor, hi2 - lo2);
        x0 = Math.min(x0, lo2);
        x1 = Math.max(x1, hi2);
      }
      f.w[role] = minor < 0.4 ? Math.round(minor * 100) / 100 : -1;
    }
  }
  if (run.role.crease !== undefined) {
    let crease = "";
    if (run.up) {
      if (i0 >= 0) {
        const buf = t3Scratch("a", 0);
        let c = 0;
        const rim = t3Scratch("c", 2 * n + 4);
        for (let j = i0; j <= i1; j++) {
          const i = j % n;
          rim[2 * c] = top[2 * i];
          rim[2 * c + 1] = top[2 * i + 1];
          c++;
        }
        crease = t3Path(rim, c, false);
        void buf;
      }
    } else {
      const capOn = [-aV > 1e-6, aV > 1e-6];
      const seg = new Float64Array(4);
      for (let i = 0; i < n; i++) {
        const p = (i - 1 + n) % n;
        if (run.sharp[i] && facing[i] > 1e-6 && facing[p] > 1e-6) {
          seg[0] = bot[2 * i];
          seg[1] = bot[2 * i + 1];
          seg[2] = top[2 * i];
          seg[3] = top[2 * i + 1];
          crease += t3Path(seg, 2, false);
        }
      }
      for (let side = 0; side < 2; side++) {
        if (!capOn[side] || i0 < 0) continue;
        const ring = side ? top : bot;
        const rim = t3Scratch("c", 2 * n + 4);
        let c = 0;
        for (let j = i0; j <= i1; j++) {
          const i = j % n;
          rim[2 * c] = ring[2 * i];
          rim[2 * c + 1] = ring[2 * i + 1];
          c++;
        }
        crease += t3Path(rim, c, false);
      }
    }
    f.d[run.role.crease] = crease;
  }
  if (run.inset && run.role.v0 !== undefined && t3State.detail < 0.01) f.levels = t3Faded(f, run, "v", t3None, 0);
  else if (run.inset && run.role.v0 !== undefined) {
    const lines = t3Lines;
    lines.d.length = 0;
    lines.alpha.length = 0;
  lines.key.length = 0;
    lines.key.length = 0;
    const capSide = aV >= 0 ? 1 : 0;
    const s = capSide ? run.s1 : run.s0;
    const capAlpha = run.up ? 1 : t3Step(0.02, 0.2, Math.abs(aV));
    const ins = t3Scratch("c", 2 * n);
    for (let i = 0; i < n; i++) {
      const x = run.inset[2 * i];
      const y = run.inset[2 * i + 1];
      const px = F.o[0] + F.a[0] * s + F.u[0] * x + F.v[0] * y;
      const py = F.o[1] + F.a[1] * s + F.u[1] * x + F.v[1] * y;
      const pz = F.o[2] + F.a[2] * s + F.u[2] * x + F.v[2] * y;
      ins[2 * i] = ox + m[0] * px + m[1] * py + m[2] * pz;
      ins[2 * i + 1] = oy + m[3] * px + m[4] * py + m[5] * pz;
    }
    const rim = capSide ? top : bot;
    const seg = new Float64Array(4);
    for (let i = 0; i < n; i++) {
      const p = (i - 1 + n) % n;
      const ai = capAlpha * t3Step(0, 0.14, facing[i]);
      const ap = capAlpha * t3Step(0, 0.14, facing[p]);
      if (ai > 0.01) {
        const j = (i + 1) % n;
        seg[0] = ins[2 * i];
        seg[1] = ins[2 * i + 1];
        seg[2] = ins[2 * j];
        seg[3] = ins[2 * j + 1];
        lines.d.push(t3Path(seg, 2, false));
        lines.alpha.push(ai);
        lines.key.push(2 * i);
      }
      const corner = ai * (1 - ap) + ap * (1 - ai);
      if (corner > 0.01) {
        seg[0] = ins[2 * i];
        seg[1] = ins[2 * i + 1];
        seg[2] = rim[2 * i];
        seg[3] = rim[2 * i + 1];
        lines.d.push(t3Path(seg, 2, false));
        lines.alpha.push(corner);
        lines.key.push(2 * i + 1);
      }
    }
    f.levels = t3Faded(f, run, "v", lines, lines.d.length);
  }
  if (run.seams && run.role.inner !== undefined) {
    let inner = "";
    if (i0 >= 0) {
      const rim = t3Scratch("c", 2 * n + 4);
      for (const s of run.seams) {
        let c = 0;
        for (let j = i0; j <= i1; j++) {
          const i = j % n;
          const x = run.ring[2 * i];
          const y = run.ring[2 * i + 1];
          const px = F.o[0] + F.a[0] * s + F.u[0] * x + F.v[0] * y;
          const py = F.o[1] + F.a[1] * s + F.u[1] * x + F.v[1] * y;
          const pz = F.o[2] + F.a[2] * s + F.u[2] * x + F.v[2] * y;
          rim[2 * c] = ox + m[0] * px + m[1] * py + m[2] * pz;
          rim[2 * c + 1] = oy + m[3] * px + m[4] * py + m[5] * pz;
          c++;
        }
        inner += t3Path(rim, c, false);
      }
    }
    f.d[run.role.inner] = inner;
  }
}

function t3Broken(buf, count, skip) {
  let start = -1;
  for (let j = 0; j < count; j++)
    if (skip[(j - 1 + count) % count] && !skip[j]) {
      start = j;
      break;
    }
  if (start < 0) return skip[0] ? "" : t3Path(buf, count, true);
  let out = "";
  let run = [];
  for (let step = 0; step < count; step++) {
    const j = (start + step) % count;
    if (skip[j]) {
      if (run.length) {
        run.push((j + 0) % count);
        out += t3PathOf(run.map((i) => [buf[2 * i], buf[2 * i + 1]]), false);
        run = [];
      }
      continue;
    }
    run.push(j);
  }
  if (run.length) {
    run.push((start + count) % count);
    out += t3PathOf(run.map((i) => [buf[2 * i], buf[2 * i + 1]]), false);
  }
  return out;
}

function t3EmitPlanes(run, cam, f, sx = 0, sy = 0) {
  const m = cam.m;
  const V = cam.V;
  for (let j = 0; j < run.planes.length; j++) {
    const plane = run.planes[j];
    const role = run.role[`plane${j}`];
    const o = plane.o;
    const X = cam.ox - sx + m[0] * o[0] + m[1] * o[1] + m[2] * o[2];
    const Y = cam.oy - sy + m[3] * o[0] + m[4] * o[1] + m[5] * o[2];
    const facing = plane.n[0] * V[0] + plane.n[1] * V[1] + plane.n[2] * V[2];
    const alpha = Math.round(t3Step(plane.fade[0], plane.fade[1], facing) * 100) / 100;
    f.o[role] = alpha;
    if (plane.billboard) {
      f.t[role] = `translate(${t3Num(X)} ${t3Num(Y)})`;
      continue;
    }
    const u = plane.u;
    const v = plane.v;
    const a = m[0] * u[0] + m[1] * u[1] + m[2] * u[2];
    const b = m[3] * u[0] + m[4] * u[1] + m[5] * u[2];
    const c = m[0] * v[0] + m[1] * v[1] + m[2] * v[2];
    const d = m[3] * v[0] + m[4] * v[1] + m[5] * v[2];
    f.t[role] = `matrix(${t3Fix(a, 1e5)} ${t3Fix(b, 1e5)} ${t3Fix(c, 1e5)} ${t3Fix(d, 1e5)} ${t3Fix(X, 100)} ${t3Fix(Y, 100)})`;
  }
}

function t3EmitDots(run, cam, f, sx = 0, sy = 0) {
  const m = cam.m;
  const V = cam.V;
  for (let j = 0; j < run.dots.length; j++) {
    const dot = run.dots[j];
    const role = run.role[`c${j}`];
    const p = dot.p;
    f.cx[role] = cam.ox - sx + m[0] * p[0] + m[1] * p[1] + m[2] * p[2];
    f.cy[role] = cam.oy - sy + m[3] * p[0] + m[4] * p[1] + m[5] * p[2];
    const alpha = (dot.n ? t3Step(dot.fade[0], dot.fade[1], dot.n[0] * V[0] + dot.n[1] * V[1] + dot.n[2] * V[2]) : 1) * t3State.detail;
    f.o[role] = alpha < 0.005 ? 0 : Math.round(alpha * 100) / 100;
  }
}

function t3EmitFixed(run, cam, f) {
  const a = run.anchor;
  const m = cam.m;
  const X = cam.ox + m[0] * a[0] + m[1] * a[1] + m[2] * a[2];
  const Y = cam.oy + m[3] * a[0] + m[4] * a[1] + m[5] * a[2];
  const dx = X - run.home[0];
  const dy = Y - run.home[1];
  const rx = Math.round(dx * 100) / 100;
  const ry = Math.round(dy * 100) / 100;
  f.t[run.role.move] = rx || ry ? `translate(${t3Num(rx)} ${t3Num(ry)})` : "";
  f.shiftX = rx;
  f.shiftY = ry;
  const b = run.box0;
  f.box[0] = b[0] + rx;
  f.box[1] = b[1] + ry;
  f.box[2] = b[2] + rx;
  f.box[3] = b[3] + ry;
  const count = run.hull0.length / 2;
  const hull = t3Grow(f, "hull", 2 * count, Float64Array);
  for (let i = 0; i < count; i++) {
    hull[2 * i] = run.hull0[2 * i] + rx;
    hull[2 * i + 1] = run.hull0[2 * i + 1] + ry;
  }
  f.hullN = count;
  if (run.ribs && run.F) t3EmitRibs(run, cam, f, run.F, run.ribs, rx, ry);
  t3EmitPlanes(run, cam, f, rx, ry);
  t3EmitDots(run, cam, f, rx, ry);
}

function t3EmitRibs(run, cam, f, F, ribs, sx, sy) {
  if (t3State.detail < 0.01) {
    f.levels = t3Faded(f, run, "r", t3None, 0);
    return;
  }
  const m = cam.m;
  const V = cam.V;
  const lines = t3Lines;
  lines.d.length = 0;
  lines.alpha.length = 0;
  lines.key.length = 0;
  const { s0, s1, count, phase = 0, twist = 0, fade = [0.1, 0.55] } = ribs;
  const r0 = ribs.r0 ?? ribs.r;
  const r1 = ribs.r1 ?? r0;
  const slope = (r1 - r0) / (s1 - s0 || 1);
  const norm = Math.hypot(1, slope);
  const aV = F.a[0] * V[0] + F.a[1] * V[1] + F.a[2] * V[2];
  const uV = F.u[0] * V[0] + F.u[1] * V[1] + F.u[2] * V[2];
  const vV = F.v[0] * V[0] + F.v[1] * V[1] + F.v[2] * V[2];
  const seg = new Float64Array(4);
  const at = (s, r, t, out, index) => {
    const c = Math.cos(t);
    const n = Math.sin(t);
    const px = F.o[0] + F.a[0] * s + r * (c * F.u[0] + n * F.v[0]);
    const py = F.o[1] + F.a[1] * s + r * (c * F.u[1] + n * F.v[1]);
    const pz = F.o[2] + F.a[2] * s + r * (c * F.u[2] + n * F.v[2]);
    out[index] = cam.ox - sx + m[0] * px + m[1] * py + m[2] * pz;
    out[index + 1] = cam.oy - sy + m[3] * px + m[4] * py + m[5] * pz;
  };
  for (let i = 0; i < count; i++) {
    const t = phase + (i / count) * T3_TAU;
    const tm = t + twist / 2;
    const facing = (Math.cos(tm) * uV + Math.sin(tm) * vV - slope * aV) / norm;
    const alpha = t3Step(fade[0], fade[1], facing);
    if (alpha * T3_LEVELS < 0.5) continue;
    at(s0, r0, t, seg, 0);
    at(s1, r1, t + twist, seg, 2);
    lines.d.push(t3Path(seg, 2, false));
    lines.alpha.push(alpha);
    lines.key.push(i);
  }
  f.levels = t3Faded(f, run, "r", lines, lines.d.length);
}


function t3Geo(F, cam) {
  const m = cam.m;
  const V = cam.V;
  const L = cam.L;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const lin = (w) => [m[0] * w[0] + m[1] * w[1] + m[2] * w[2], m[3] * w[0] + m[4] * w[1] + m[5] * w[2]];
  const O = [cam.ox + m[0] * F.o[0] + m[1] * F.o[1] + m[2] * F.o[2], cam.oy + m[3] * F.o[0] + m[4] * F.o[1] + m[5] * F.o[2]];
  const aV = dot(F.a, V);
  const uV = dot(F.u, V);
  const vV = dot(F.v, V);
  const aL = dot(F.a, L);
  const uL = dot(F.u, L);
  const vL = dot(F.v, L);
  return { O, SA: lin(F.a), SU: lin(F.u), SV: lin(F.v), aV, aL, view: { a: aV, flat: Math.hypot(uV, vV), phi: Math.atan2(vV, uV) }, light: { a: aL, flat: Math.hypot(uL, vL), phi: Math.atan2(vL, uL) } };
}

function t3At(geo, s, r, t, buf, index) {
  const c = Math.cos(t);
  const n = Math.sin(t);
  buf[index] = geo.O[0] + s * geo.SA[0] + r * (c * geo.SU[0] + n * geo.SV[0]);
  buf[index + 1] = geo.O[1] + s * geo.SA[1] + r * (c * geo.SU[1] + n * geo.SV[1]);
}

function t3Arcs(nr, na, view, light) {
  const cuts = [];
  if (Math.abs(nr) > 1e-9) {
    const visibleCut = -(na * view.a) / (nr * view.flat);
    if (visibleCut > -1 && visibleCut < 1) {
      const d = Math.acos(visibleCut);
      cuts.push(view.phi - d, view.phi + d);
    }
    for (let b = 0; b < T3_LB.length; b++) {
      const c = (T3_LB[b] - na * light.a) / (nr * light.flat);
      if (c > -1 && c < 1) {
        const d = Math.acos(c);
        cuts.push(light.phi - d, light.phi + d);
      }
    }
  }
  for (let i = 0; i < cuts.length; i++) {
    const w = ((cuts[i] % T3_TAU) + T3_TAU) % T3_TAU;
    cuts[i] = Math.round(w * 1e9) / 1e9;
  }
  cuts.sort((a, b) => a - b);
  const sorted = [];
  for (let i = 0; i < cuts.length; i++) if (!sorted.length || cuts[i] !== sorted[sorted.length - 1]) sorted.push(cuts[i]);
  const label = (angle) => {
    const facing = nr * view.flat * Math.cos(angle - view.phi) + na * view.a;
    if (facing <= 1e-9) return -1;
    const score = nr * light.flat * Math.cos(angle - light.phi) + na * light.a;
    let tone = 0;
    while (tone < T3_LB.length && score >= T3_LB[tone]) tone++;
    return tone;
  };
  if (!sorted.length) {
    const tone = label(0);
    return tone < 0 ? [] : [{ tone, from: 0, to: T3_TAU, full: true }];
  }
  const merged = [];
  for (let index = 0; index < sorted.length; index++) {
    const from = sorted[index];
    const to = index + 1 < sorted.length ? sorted[index + 1] : sorted[0] + T3_TAU;
    const tone = label((from + to) / 2);
    const last = merged[merged.length - 1];
    if (last && last.tone === tone && Math.abs(last.to - from) < 1e-9) last.to = to;
    else merged.push({ tone, from, to });
  }
  if (merged.length > 1 && merged[0].tone === merged[merged.length - 1].tone && Math.abs(merged[merged.length - 1].to - T3_TAU - merged[0].from) < 1e-9) {
    const last = merged.pop();
    merged[0].from = last.from - T3_TAU;
  }
  const out = [];
  for (const arc of merged) if (arc.tone >= 0) out.push(arc);
  return out;
}

function t3Strip(geo, s0, r0, s1, r1, from, to, step) {
  const count = Math.max(1, Math.ceil((to - from) / step));
  const buf = t3Scratch("c", 4 * count + 8);
  for (let j = 0; j <= count; j++) {
    const t = from + ((to - from) * j) / count;
    t3At(geo, s0, r0, t, buf, 2 * j);
    t3At(geo, s1, r1, t, buf, 2 * (2 * count + 1 - j));
  }
  return t3Path(t3Oriented(buf, 2 * count + 2), 2 * count + 2, true);
}

function t3Oriented(buf, count) {
  let area = 0;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    area += buf[2 * i] * buf[2 * j + 1] - buf[2 * j] * buf[2 * i + 1];
  }
  if (area >= 0) return buf;
  for (let i = 0, j = count - 1; i < j; i++, j--) {
    const x = buf[2 * i];
    const y = buf[2 * i + 1];
    buf[2 * i] = buf[2 * j];
    buf[2 * i + 1] = buf[2 * j + 1];
    buf[2 * j] = x;
    buf[2 * j + 1] = y;
  }
  return buf;
}

function t3Hull(points) {
  const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-12) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-12) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function t3PathOf(points, closed) {
  if (points.length < 2) return "";
  let s = "M" + t3Num(points[0][0]) + " " + t3Num(points[0][1]);
  for (let i = 1; i < points.length; i++) s += "L" + t3Num(points[i][0]) + " " + t3Num(points[i][1]);
  return closed ? s + "Z" : s;
}

function t3Basis(w) {
  const helper = Math.abs(w[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const u = t3Unit([helper[1] * w[2] - helper[2] * w[1], helper[2] * w[0] - helper[0] * w[2], helper[0] * w[1] - helper[1] * w[0]]);
  return [u, [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]]];
}

function t3Meet(A, a, B, b) {
  const ab = A[0] * B[0] + A[1] * B[1] + A[2] * B[2];
  const det = 1 - ab * ab;
  if (det < 1e-12) return [];
  const alpha = (a - b * ab) / det;
  const beta = (b - a * ab) / det;
  const base = [A[0] * alpha + B[0] * beta, A[1] * alpha + B[1] * beta, A[2] * alpha + B[2] * beta];
  const rest = 1 - (base[0] * base[0] + base[1] * base[1] + base[2] * base[2]);
  if (rest < 0) return [];
  const cr = [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]];
  const k = Math.sqrt(rest / det);
  return [
    [base[0] + cr[0] * k, base[1] + cr[1] * k, base[2] + cr[2] * k],
    [base[0] - cr[0] * k, base[1] - cr[1] * k, base[2] - cr[2] * k],
  ];
}

const t3Tables = new Map();
function t3Table(count) {
  let table = t3Tables.get(count);
  if (!table) {
    table = new Float64Array(2 * count);
    for (let j = 0; j < count; j++) {
      table[2 * j] = Math.cos((j / count) * T3_TAU);
      table[2 * j + 1] = Math.sin((j / count) * T3_TAU);
    }
    t3Tables.set(count, table);
  }
  return table;
}

function t3Dome(cam, C, e, r, count, sheets) {
  const m = cam.m;
  const V = cam.V;
  const L = cam.L;
  const Sx = cam.ox + m[0] * C[0] + m[1] * C[1] + m[2] * C[2];
  const Sy = cam.oy + m[3] * C[0] + m[4] * C[1] + m[5] * C[2];
  const flat = (n) => [Sx + r * (m[0] * n[0] + m[1] * n[1] + m[2] * n[2]), Sy + r * (m[3] * n[0] + m[4] * n[1] + m[5] * n[2])];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const table = t3Table(count);
  const circle = (W, value, keep) => {
    const [U, Q] = t3Basis(W);
    const rad = Math.sqrt(Math.max(0, 1 - value * value));
    const out = [];
    for (let j = 0; j < count; j++) {
      const cs = table[2 * j] * rad;
      const sn = table[2 * j + 1] * rad;
      const n = [W[0] * value + U[0] * cs + Q[0] * sn, W[1] * value + U[1] * cs + Q[1] * sn, W[2] * value + U[2] * cs + Q[2] * sn];
      if (keep(n)) out.push(n);
    }
    return out;
  };
  const rim = circle(V, 0, (n) => dot(n, e) >= -1e-9).map((n) => [flat(n), dot(n, L)]);
  const base = circle(e, 0, (n) => dot(n, V) >= -1e-9).map((n) => [flat(n), dot(n, L)]);
  const corners = t3Meet(V, 0, e, 0).map((n) => [flat(n), dot(n, L)]);
  for (let tone = 0; tone < 5; tone++) {
    const tau = tone === 0 ? -Infinity : T3_LB[tone - 1];
    const candidates = [];
    for (const list of [rim, base, corners]) for (const [p, lit] of list) if (lit >= tau - 1e-9) candidates.push(p);
    if (tone > 0) {
      for (const n of circle(L, tau, (n) => dot(n, V) >= -1e-9 && dot(n, e) >= -1e-9)) candidates.push(flat(n));
      for (const n of t3Meet(L, tau, V, 0)) if (dot(n, e) >= -1e-9) candidates.push(flat(n));
      for (const n of t3Meet(L, tau, e, 0)) if (dot(n, V) >= -1e-9) candidates.push(flat(n));
    }
    if (candidates.length < 3) continue;
    const region = t3Hull(candidates);
    if (region.length >= 3) sheets[tone] += t3PathOf(region, true);
  }
}

function t3BoxOf(pts, box) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  box[0] = x0;
  box[1] = y0;
  box[2] = x1;
  box[3] = y1;
}

function t3Thin(points, most) {
  if (points.length <= most) return points;
  const n = points.length;
  const picks = [];
  for (let i = 0; i < most; i++) picks.push(Math.floor((i * n) / most));
  const thin = picks.map((i) => points[i]);
  let err = 0;
  for (let j = 0; j < most; j++) {
    const a = thin[j];
    const b = thin[(j + 1) % most];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const end = j + 1 < most ? picks[j + 1] : picks[0] + n;
    for (let i = picks[j] + 1; i < end; i++) {
      const p = points[i % n];
      const out = ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / l;
      if (Math.abs(out) > err) err = Math.abs(out);
    }
  }
  return t3Grown(thin, err);
}

function t3Grown(poly, by) {
  if (!(by > 0)) return poly;
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sign = area >= 0 ? 1 : -1;
  const n = poly.length;
  const normals = poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(sign * (b[1] - a[1])) / l, (-sign * (b[0] - a[0])) / l];
  });
  return poly.map((p, i) => {
    const na = normals[(i - 1 + n) % n];
    const nb = normals[i];
    const mx = na[0] + nb[0];
    const my = na[1] + nb[1];
    const dd = (mx * mx + my * my) / 2 || 1;
    return [p[0] + (mx * by) / dd, p[1] + (my * by) / dd];
  });
}

function t3HullOut(f, points, most = 32) {
  const thin = t3Thin(points, most);
  const hull = t3Grow(f, "hull", 2 * thin.length, Float64Array);
  for (let i = 0; i < thin.length; i++) {
    hull[2 * i] = thin[i][0];
    hull[2 * i + 1] = thin[i][1];
  }
  f.hullN = thin.length;
}

function t3SupportHull(geo, cam, components, dirs) {
  const table = t3Table(dirs);
  const pts = [];
  const { O, SA, SU, SV } = geo;
  for (let j = 0; j < dirs; j++) {
    const dx = table[2 * j];
    const dy = table[2 * j + 1];
    const pa = SA[0] * dx + SA[1] * dy;
    const pu = SU[0] * dx + SU[1] * dy;
    const pv = SV[0] * dx + SV[1] * dy;
    const w = Math.hypot(pu, pv);
    let best = -Infinity;
    let px = 0;
    let py = 0;
    for (let c = 0; c < components.length; c += 3) {
      const kind = components[c];
      const s = components[c + 1];
      const r = components[c + 2];
      if (kind === 0) {
        const value = s * pa + r * w;
        if (value > best) {
          best = value;
          const cs = w > 1e-12 ? pu / w : 1;
          const sn = w > 1e-12 ? pv / w : 0;
          px = O[0] + s * SA[0] + r * (cs * SU[0] + sn * SV[0]);
          py = O[1] + s * SA[1] + r * (cs * SU[1] + sn * SV[1]);
        }
      } else {
        const rk = r * cam.k;
        const value = s * pa + rk;
        if (value > best) {
          best = value;
          px = O[0] + s * SA[0] + rk * dx;
          py = O[1] + s * SA[1] + rk * dy;
        }
      }
    }
    const last = pts[pts.length - 1];
    if (!last || Math.abs(last[0] - px) + Math.abs(last[1] - py) > 0.02) pts.push([px, py]);
  }
  if (pts.length > 2) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) <= 0.02) pts.pop();
  }
  return pts;
}

function t3ArcPoints(geo, s, r, from, to, k, out, cut = false) {
  const count = Math.max(2, Math.ceil((Math.abs(to - from) * 48) / T3_TAU), Math.ceil((Math.abs(to - from) * Math.max(r, 1e-6) * k) / 1.5));
  for (let j = 0; j <= count; j++) {
    const t = from + ((to - from) * j) / count;
    const c = Math.cos(t);
    const n = Math.sin(t);
    const p = [geo.O[0] + s * geo.SA[0] + r * (c * geo.SU[0] + n * geo.SV[0]), geo.O[1] + s * geo.SA[1] + r * (c * geo.SU[1] + n * geo.SV[1])];
    if (cut) p.cut = true;
    out.push(p);
  }
}

function t3RoundOutline(run, geo, cam) {
  const k = cam.k;
  const { s0, s1, r0, r1, ends } = run;
  const domes = (ends[0] === "dome" ? 1 : 0) + (ends[1] === "dome" ? 1 : 0);
  if (domes === 2) {
    const c0 = [geo.O[0] + s0 * geo.SA[0], geo.O[1] + s0 * geo.SA[1]];
    const c1 = [geo.O[0] + s1 * geo.SA[0], geo.O[1] + s1 * geo.SA[1]];
    const rk = r0 * k;
    const dx = c1[0] - c0[0];
    const dy = c1[1] - c0[1];
    const l = Math.hypot(dx, dy);
    const count = Math.max(24, Math.ceil((Math.PI * rk) / 1.5));
    const out = [];
    if (l < 1e-6) {
      for (let j = 0; j < 2 * count; j++) {
        const t = (j / (2 * count)) * T3_TAU;
        out.push([c1[0] + rk * Math.cos(t), c1[1] + rk * Math.sin(t)]);
      }
      return out;
    }
    const beta = Math.atan2(dy, dx);
    for (let j = 0; j <= count; j++) {
      const t = beta - Math.PI / 2 + (Math.PI * j) / count;
      out.push([c1[0] + rk * Math.cos(t), c1[1] + rk * Math.sin(t)]);
    }
    for (let j = 0; j <= count; j++) {
      const t = beta + Math.PI / 2 + (Math.PI * j) / count;
      out.push([c0[0] + rk * Math.cos(t), c0[1] + rk * Math.sin(t)]);
    }
    return out;
  }
  if (domes === 1) {
    const pts = [];
    for (const [end, s, r] of [[0, s0, r0], [1, s1, r1]]) {
      t3ArcPoints(geo, s, r, 0, T3_TAU, k, pts);
      if (ends[end] !== "dome") continue;
      const sign = end ? 1 : -1;
      const c = [geo.O[0] + s * geo.SA[0], geo.O[1] + s * geo.SA[1]];
      const rk = r * k;
      const beta = Math.atan2(sign * geo.SA[1], sign * geo.SA[0]);
      const count = Math.max(24, Math.ceil((Math.PI * rk) / 1.5));
      for (let j = 0; j <= count; j++) {
        const t = beta - Math.PI / 2 + (Math.PI * j) / count;
        pts.push([c[0] + rk * Math.cos(t), c[1] + rk * Math.sin(t)]);
      }
    }
    return t3Hull(pts);
  }
  const view = geo.view;
  const out = [];
  let c;
  if (view.flat < 1e-9) c = run.na * view.a > 0 ? -2 : 2;
  else c = -(run.na * view.a) / (run.nr * view.flat);
  if (c <= -1 || c >= 1) {
    const side = c <= -1;
    const capFirst = -geo.aV > 0;
    const keepFirst = side ? !capFirst : capFirst;
    const s = keepFirst ? s0 : s1;
    const r = keepFirst ? r0 : r1;
    t3ArcPoints(geo, s, r, 0, T3_TAU, k, out, run.cutS !== null && Math.abs(run.cutS - s) < 1e-6);
    out.pop();
    return out;
  }
  const d = Math.acos(c);
  const lo = view.phi - d;
  const hi = view.phi + d;
  const cut0 = run.cutS !== null && Math.abs(run.cutS - s0) < 1e-6;
  const cut1 = run.cutS !== null && Math.abs(run.cutS - s1) < 1e-6;
  if (-geo.aV > 0) t3ArcPoints(geo, s0, r0, hi, lo + T3_TAU, k, out, cut0);
  else t3ArcPoints(geo, s0, r0, lo, hi, k, out, cut0);
  const tail = [];
  if (geo.aV > 0) t3ArcPoints(geo, s1, r1, hi, lo + T3_TAU, k, tail, cut1);
  else t3ArcPoints(geo, s1, r1, lo, hi, k, tail, cut1);
  const first = out[out.length - 1];
  const a = tail[0];
  const b = tail[tail.length - 1];
  if (Math.hypot(a[0] - first[0], a[1] - first[1]) > Math.hypot(b[0] - first[0], b[1] - first[1])) tail.reverse();
  for (const p of tail) out.push(p);
  return out;
}

function t3LatheMid(a, b) {
  const h = b.s - a.s;
  const ga = -a.na / a.nr;
  const gb = -b.na / b.nr;
  const nr = a.nr + b.nr;
  const na = a.na + b.na;
  const l = Math.hypot(nr, na) || 1;
  return { s: (a.s + b.s) / 2, r: (a.r + b.r) / 2 + (h * (ga - gb)) / 8, nr: nr / l, na: na / l };
}

function t3LatheOutline(run, geo, cam) {
  const k = cam.k;
  const view = geo.view;
  const lv = run.levels;
  const pts = [];
  const cut = (L) => (view.flat < 1e-9 ? Infinity : -(L.na * view.a) / (L.nr * view.flat));
  const inside = (L) => L.r <= 1e-9 || Math.abs(cut(L)) < 1;
  const sides = (L) => {
    if (L.r <= 1e-9) {
      const p = [geo.O[0] + L.s * geo.SA[0], geo.O[1] + L.s * geo.SA[1]];
      return [p, p];
    }
    const c = Math.max(-1, Math.min(1, cut(L)));
    const d = Math.acos(c);
    return [view.phi - d, view.phi + d].map((t) => {
      const cs = Math.cos(t);
      const sn = Math.sin(t);
      return [geo.O[0] + L.s * geo.SA[0] + L.r * (cs * geo.SU[0] + sn * geo.SV[0]), geo.O[1] + L.s * geo.SA[1] + L.r * (cs * geo.SU[1] + sn * geo.SV[1])];
    });
  };
  const span = (a, b) => {
    const pa = sides(a);
    const pb = sides(b);
    return Math.max(Math.hypot(pa[0][0] - pb[0][0], pa[0][1] - pb[0][1]), Math.hypot(pa[1][0] - pb[1][0], pa[1][1] - pb[1][1]));
  };
  const refine = (a, b, depth) => {
    if (depth >= 10 || span(a, b) < 1.2) return;
    const mid = t3LatheMid(a, b);
    refine(a, mid, depth + 1);
    pts.push(...sides(mid));
    refine(mid, b, depth + 1);
  };
  let previous = null;
  for (let i = 0; i < lv.length; i += 4) {
    const L = { s: lv[i], r: lv[i + 1], nr: lv[i + 2], na: lv[i + 3] };
    if (inside(L)) pts.push(...sides(L));
    if (previous) {
      const pin = inside(previous);
      const lin = inside(L);
      if (pin && lin) refine(previous, L, 0);
      else if (pin !== lin) {
        let a = pin ? previous : L;
        let b = pin ? L : previous;
        const start = a;
        for (let it = 0; it < 14; it++) {
          const mid = t3LatheMid(a.s < b.s ? a : b, a.s < b.s ? b : a);
          if (inside(mid)) a = mid;
          else b = mid;
        }
        pts.push(...sides(a));
        refine(start.s < a.s ? start : a, start.s < a.s ? a : start, 0);
      }
    }
    previous = L;
  }
  for (const i of [0, lv.length - 4]) if (lv[i + 1] > 1e-9) t3ArcPoints(geo, lv[i], lv[i + 1], 0, T3_TAU, k, pts);
  return t3Hull(pts);
}

function t3SeamArc(geo, s, r, slope, k, trim = 0.3) {
  const view = geo.view;
  const norm = Math.hypot(1, slope);
  let lo;
  let hi;
  if (view.flat < 1e-9) {
    if (!((-slope * view.a) / norm > 0)) return "";
    lo = view.phi;
    hi = view.phi + T3_TAU;
  } else {
    const cc = (slope * view.a) / view.flat;
    if (cc >= 1) return "";
    if (cc <= -1) {
      lo = view.phi;
      hi = view.phi + T3_TAU;
    } else {
      const d = Math.acos(cc);
      lo = view.phi - d;
      hi = view.phi + d;
    }
  }
  const full = hi - lo >= T3_TAU - 1e-9;
  const buf = t3Scratch("c", 2 * 520);
  if (!full) {
    const span = hi - lo;
    const cutAt = (from, sign) => {
      t3At(geo, s, r, from, buf, 0);
      const px = buf[0];
      const py = buf[1];
      let a = 0;
      let b = span * 0.25;
      t3At(geo, s, r, from + sign * b, buf, 0);
      if (Math.hypot(buf[0] - px, buf[1] - py) <= trim) return b;
      for (let it = 0; it < 18; it++) {
        const mid = (a + b) / 2;
        t3At(geo, s, r, from + sign * mid, buf, 0);
        if (Math.hypot(buf[0] - px, buf[1] - py) < trim) a = mid;
        else b = mid;
      }
      return (a + b) / 2;
    };
    const d0 = cutAt(lo, 1);
    const d1 = cutAt(hi, -1);
    lo += d0;
    hi -= d1;
  }
  const count = Math.min(512, Math.max(4, Math.ceil(((hi - lo) * r * k) / 1.5)));
  for (let j = 0; j <= count; j++) t3At(geo, s, r, lo + ((hi - lo) * j) / count, buf, 2 * j);
  return t3Path(buf, full ? count : count + 1, full);
}

function t3RibLines(geo, F, cam, ribs, sx, sy) {
  const lines = t3Lines;
  lines.d.length = 0;
  lines.alpha.length = 0;
  lines.key.length = 0;
  const { s0, s1, count, phase = 0, twist = 0, fade = [0.1, 0.55] } = ribs;
  const r0 = ribs.r0 ?? ribs.r;
  const r1 = ribs.r1 ?? r0;
  const slope = (r1 - r0) / (s1 - s0 || 1);
  const norm = Math.hypot(1, slope);
  const view = geo.view;
  const seg = new Float64Array(4);
  for (let i = 0; i < count; i++) {
    const t = phase + (i / count) * T3_TAU;
    const tm = t + twist / 2;
    const facing = (view.flat * Math.cos(tm - view.phi) - slope * view.a) / norm;
    const alpha = t3Step(fade[0], fade[1], facing);
    if (alpha * T3_LEVELS < 0.5) continue;
    t3At(geo, s0, r0, t, seg, 0);
    t3At(geo, s1, r1, t + twist, seg, 2);
    seg[0] -= sx;
    seg[1] -= sy;
    seg[2] -= sx;
    seg[3] -= sy;
    lines.d.push(t3Path(seg, 2, false));
    lines.alpha.push(alpha);
    lines.key.push(i);
  }
  return lines;
}

function t3PrepareRound(run, part, P, unit) {
  const spec = part.spec;
  const k = P.scale * T3_ROOT;
  run.F = spec.F;
  run.s0 = spec.s0;
  run.s1 = spec.s1;
  run.r0 = spec.r0;
  run.r1 = spec.r1;
  run.ends = spec.ends;
  const g = (spec.r1 - spec.r0) / (spec.s1 - spec.s0 || 1);
  const norm = Math.hypot(1, g);
  run.nr = 1 / norm;
  run.na = -g / norm;
  run.g = g;
  const rmax = Math.max(spec.r0, spec.r1);
  const around = T3_TAU * rmax * k * unit;
  run.fine = Math.max(around < 30 ? 16 : 24, Math.min(96, Math.ceil(around / 2.2)));
  run.dirs = Math.max(around < 30 ? 16 : 32, Math.min(256, Math.ceil(around / 1.5)));
  run.capCount = Math.max(around < 30 ? 16 : 24, Math.min(160, Math.ceil(around / 1.5)));
  run.domeCount = Math.max(around < 30 ? 12 : 16, Math.min(48, Math.round(run.fine * 0.75)));
  const comps = [];
  for (const [end, s, r] of [[0, spec.s0, spec.r0], [1, spec.s1, spec.r1]]) comps.push(spec.ends[end] === "dome" ? 1 : 0, s, r);
  run.components = comps;
  const details = part.details ?? {};
  run.seams = (details.seams ?? []).map((s) => ({ s, r: spec.r0 + g * (s - spec.s0), slope: g }));
  run.ribs = details.ribs ? { ...details.ribs, r0: details.ribs.r0 ?? spec.r0 + g * (details.ribs.s0 - spec.s0), r1: details.ribs.r1 ?? spec.r0 + g * (details.ribs.s1 - spec.s0) } : null;
  run.cutS = null;
  for (const cut of spec.cuts ?? []) {
    const along = cut.n[0] * spec.F.a[0] + cut.n[1] * spec.F.a[1] + cut.n[2] * spec.F.a[2];
    const sCut = (cut.d - (cut.n[0] * spec.F.o[0] + cut.n[1] * spec.F.o[1] + cut.n[2] * spec.F.o[2])) / along;
    if (Math.abs(sCut - spec.s0) < 1e-6 || Math.abs(sCut - spec.s1) < 1e-6) run.cutS = sCut;
  }
}

function t3EmitRound(run, cam, f) {
  const geo = t3Geo(run.F, cam);
  const k = cam.k;
  const step = T3_TAU / run.fine;
  const sheets = ["", "", "", "", ""];
  const { s0, s1, r0, r1 } = run;
  for (const arc of t3Arcs(run.nr, run.na, geo.view, geo.light)) sheets[arc.tone] += t3Strip(geo, s0, r0, s1, r1, arc.from, arc.to, step);
  const F = run.F;
  for (let end = 0; end < 2; end++) {
    if (run.ends[end] !== "dome") continue;
    const s = end ? s1 : s0;
    const sign = end ? 1 : -1;
    const C = [F.o[0] + F.a[0] * s, F.o[1] + F.a[1] * s, F.o[2] + F.a[2] * s];
    t3Dome(cam, C, [F.a[0] * sign, F.a[1] * sign, F.a[2] * sign], end ? r1 : r0, run.domeCount, sheets);
  }
  for (let t = 0; t < 5; t++) f.d[run.role[`s${t}`]] = sheets[t];
  const pts = t3RoundOutline(run, geo, cam);
  const outline = t3PathOf(pts, true);
  f.d[run.role.fill] = outline;
  if (run.cutS !== null) {
    const buf = new Float64Array(2 * pts.length);
    const skip = new Uint8Array(pts.length);
    pts.forEach((p, j) => {
      buf[2 * j] = p[0];
      buf[2 * j + 1] = p[1];
    });
    for (let j = 0; j < pts.length; j++) skip[j] = pts[j].cut && pts[(j + 1) % pts.length].cut ? 1 : 0;
    f.d[run.role.edge] = t3Broken(buf, pts.length, skip);
  } else f.d[run.role.edge] = outline;
  t3BoxOf(pts, f.box);
  t3HullOut(f, pts);
  const view = geo.view;
  let crease = "";
  for (let end = 0; end < 2; end++) {
    if (run.ends[end] !== "flat") continue;
    const role = run.role[`k${end}`];
    const sign = end ? 1 : -1;
    const s = end ? s1 : s0;
    const r = end ? r1 : r0;
    const face = sign * geo.aV;
    if (!(face > 1e-9)) {
      f.d[role] = "";
      continue;
    }
    const n = run.capCount;
    const buf = t3Scratch("c", 2 * n);
    const table = t3Table(n);
    for (let j = 0; j < n; j++) {
      const c = table[2 * j];
      const q = table[2 * j + 1];
      buf[2 * j] = geo.O[0] + s * geo.SA[0] + r * (c * geo.SU[0] + q * geo.SV[0]);
      buf[2 * j + 1] = geo.O[1] + s * geo.SA[1] + r * (c * geo.SU[1] + q * geo.SV[1]);
    }
    f.d[role] = t3Path(buf, n, true);
    f.q[role] = t3Level(sign * geo.aL, T3_LB);
    const minor = 2 * r * k * Math.abs(face);
    f.w[role] = minor < 0.4 ? Math.round(minor * 100) / 100 : -1;
    if (run.role.crease === undefined) continue;
    let lo;
    let hi;
    if (view.flat < 1e-9) {
      if (!(run.na * view.a > 1e-9)) continue;
      lo = 0;
      hi = T3_TAU;
    } else {
      const cc = -(run.na * view.a) / (run.nr * view.flat);
      if (cc >= 1) continue;
      if (cc <= -1) {
        lo = view.phi;
        hi = view.phi + T3_TAU;
      } else {
        const d = Math.acos(cc);
        lo = view.phi - d;
        hi = view.phi + d;
      }
    }
    const count = Math.min(400, Math.max(4, Math.ceil(((hi - lo) * r * k) / 1.5)));
    const arc = t3Scratch("c", 2 * count + 2);
    for (let j = 0; j <= count; j++) t3At(geo, s, r, lo + ((hi - lo) * j) / count, arc, 2 * j);
    crease += t3Path(arc, count + 1, false);
  }
  if (run.role.crease !== undefined) f.d[run.role.crease] = crease;
  if (run.role.inner !== undefined) {
    let inner = "";
    for (const seam of run.seams) inner += t3SeamArc(geo, seam.s, seam.r, seam.slope, k);
    if (run.ribs && run.ribs.seams) {
      const rs = run.ribs;
      const slope = (rs.r1 - rs.r0) / (rs.s1 - rs.s0 || 1);
      if (rs.seams !== "last") inner += t3SeamArc(geo, rs.s0, rs.r0, slope, k);
      if (rs.seams !== "first") inner += t3SeamArc(geo, rs.s1, rs.r1, slope, k);
    }
    f.d[run.role.inner] = inner;
  }
  if (run.ribs) {
    const lines = t3State.detail < 0.01 ? t3None : t3RibLines(geo, run.F, cam, run.ribs, 0, 0);
    f.levels = t3Faded(f, run, "r", lines, lines.d.length);
  }
}

function t3PrepareBall(run, part, P, unit) {
  const spec = part.spec;
  const k = P.scale * T3_ROOT;
  run.c = spec.c;
  run.r = spec.r;
  run.flats = spec.flats.map((flat) => {
    const n = t3Unit(flat.n);
    const rho = Math.sqrt(Math.max(0, spec.r * spec.r - flat.d * flat.d));
    const [u, v] = t3Basis(n);
    return { n, d: flat.d, rho, u, v };
  });
  run.limb = Math.max(32, Math.min(160, Math.ceil((T3_TAU * spec.r * k * unit) / 1.5)));
  run.rimCount = run.flats.map((flat) => Math.max(20, Math.min(120, Math.ceil((T3_TAU * flat.rho * k * unit) / 1.5))));
}

function t3ClipConvex(subject, clip) {
  if (subject.length < 3 || clip.length < 3) return [];
  let area = 0;
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sign = area >= 0 ? 1 : -1;
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const side = (p) => sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j];
      const q = input[(j + 1) % input.length];
      const sp = side(p);
      const sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) {
        const t = sp / (sp - sq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
  }
  return out;
}

function t3EmitBall(run, cam, f) {
  const m = cam.m;
  const V = cam.V;
  const L = cam.L;
  const { c, r, flats } = run;
  const Cx = cam.ox + m[0] * c[0] + m[1] * c[1] + m[2] * c[2];
  const Cy = cam.oy + m[3] * c[0] + m[4] * c[1] + m[5] * c[2];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const flat = (w) => [Cx + r * (m[0] * w[0] + m[1] * w[1] + m[2] * w[2]), Cy + r * (m[3] * w[0] + m[4] * w[1] + m[5] * w[2])];
  const inside = (w, skip = -1) => {
    for (let i = 0; i < flats.length; i++) if (i !== skip && dot(w, flats[i].n) * r > flats[i].d + 1e-7) return false;
    return true;
  };
  const [U, W] = t3Basis(V);
  const n = run.limb;
  const table = t3Table(n);
  const limb = [];
  for (let j = 0; j < n; j++) limb.push([U[0] * table[2 * j] + W[0] * table[2 * j + 1], U[1] * table[2 * j] + W[1] * table[2 * j + 1], U[2] * table[2 * j] + W[2] * table[2 * j + 1]]);
  const sil = [];
  for (const w of limb) if (inside(w)) sil.push(flat(w));
  const rims = flats.map((cut, ci) => {
    const count = run.rimCount[ci];
    const t = t3Table(count);
    const list = [];
    for (let j = 0; j < count; j++) {
      const w = [(cut.n[0] * cut.d + cut.rho * (cut.u[0] * t[2 * j] + cut.v[0] * t[2 * j + 1])) / r, (cut.n[1] * cut.d + cut.rho * (cut.u[1] * t[2 * j] + cut.v[1] * t[2 * j + 1])) / r, (cut.n[2] * cut.d + cut.rho * (cut.u[2] * t[2 * j] + cut.v[2] * t[2 * j + 1])) / r];
      list.push({ w, keep: inside(w, ci), p: flat(w) });
    }
    return list;
  });
  flats.forEach((cut, ci) => {
    for (const w of t3Meet(V, 0, cut.n, cut.d / r)) if (inside(w, ci)) sil.push(flat(w));
    rims[ci].forEach(({ keep, p }) => keep && sil.push(p));
  });
  const hull = t3Hull(sil);
  const outline = t3PathOf(hull, true);
  f.d[run.role.fill] = outline;
  f.d[run.role.edge] = outline;
  f.d[run.role.s0] = outline;
  const capOf = (threshold) => {
    const points = [];
    for (const w of limb) if (dot(w, L) >= threshold && inside(w)) points.push(flat(w));
    const radius = Math.sqrt(Math.max(0, 1 - threshold * threshold));
    const [LU, LW] = t3Basis(L);
    for (let j = 0; j < n; j++) {
      const w = [L[0] * threshold + radius * (LU[0] * table[2 * j] + LW[0] * table[2 * j + 1]), L[1] * threshold + radius * (LU[1] * table[2 * j] + LW[1] * table[2 * j + 1]), L[2] * threshold + radius * (LU[2] * table[2 * j] + LW[2] * table[2 * j + 1])];
      if (dot(w, V) >= -1e-9) points.push(flat(w));
    }
    if (dot(L, V) > threshold) points.push(flat(V));
    for (const w of t3Meet(L, threshold, V, 0)) if (inside(w)) points.push(flat(w));
    flats.forEach((cut, ci) => {
      for (const w of t3Meet(V, 0, cut.n, cut.d / r)) if (inside(w, ci) && dot(w, L) >= threshold) points.push(flat(w));
      for (const w of t3Meet(L, threshold, cut.n, cut.d / r)) if (inside(w, ci) && dot(w, V) >= -1e-9) points.push(flat(w));
      for (const { w, keep, p } of rims[ci]) if (keep && dot(w, L) >= threshold && dot(w, V) >= -1e-9) points.push(p);
    });
    if (points.length < 3) return "";
    const region = t3ClipConvex(t3Hull(points), hull);
    return region.length >= 3 ? t3PathOf(region, true) : "";
  };
  f.d[run.role.s1] = capOf(T3_LB[1]);
  f.d[run.role.s2] = capOf(T3_LB[2]);
  f.d[run.role.s3] = capOf(T3_LB[3]);
  let crease = "";
  flats.forEach((cut, ci) => {
    const role = run.role[`f${ci}`];
    const face = dot(cut.n, V);
    if (!(face > 1e-9)) {
      f.d[role] = "";
      return;
    }
    const pts = t3ClipConvex(rims[ci].map(({ p }) => p), hull);
    f.d[role] = t3PathOf(pts, true);
    f.q[role] = t3Level(dot(cut.n, L), T3_LB);
    const minor = 2 * cut.rho * cam.k * face;
    f.w[role] = minor < 0.4 ? Math.round(minor * 100) / 100 : -1;
    const list = rims[ci];
    const seen = list.map(({ w, keep }) => keep && dot(w, V) > 0);
    const start = seen.indexOf(false);
    if (start < 0) {
      crease += t3PathOf(list.map(({ p }) => p), true);
      return;
    }
    let cur = null;
    for (let s = 1; s <= list.length; s++) {
      const i = (start + s) % list.length;
      if (seen[i]) (cur ??= []).push(list[i].p);
      else if (cur) {
        if (cur.length > 1) crease += t3PathOf(cur, false);
        cur = null;
      }
    }
    if (cur && cur.length > 1) crease += t3PathOf(cur, false);
  });
  if (run.role.crease !== undefined) f.d[run.role.crease] = crease;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of hull) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  f.box[0] = x0;
  f.box[1] = y0;
  f.box[2] = x1;
  f.box[3] = y1;
  t3HullOut(f, hull);
}

function t3PrepareLathe(run, part, P, unit) {
  const spec = part.spec;
  const k = P.scale * T3_ROOT;
  run.F = spec.F;
  run.levels = spec.levels;
  run.caps = spec.caps;
  let rmax = 0;
  for (let i = 0; i < spec.levels.length; i += 4) rmax = Math.max(rmax, spec.levels[i + 1]);
  run.fine = Math.max(24, Math.min(96, Math.ceil((T3_TAU * rmax * k * unit) / 2.2)));
  run.dirs = Math.max(32, Math.min(256, Math.ceil((T3_TAU * rmax * k * unit) / 1.5)));
  run.capCount = Math.max(24, Math.min(160, Math.ceil((T3_TAU * rmax * k * unit) / 1.5)));
  const comps = [];
  for (let i = 0; i < spec.levels.length; i += 4) comps.push(0, spec.levels[i], spec.levels[i + 1]);
  run.components = comps;
  const details = part.details ?? {};
  run.seams = (details.seams ?? []).map((seam) => (typeof seam === "number" ? t3LatheSeam(spec.levels, seam) : seam));
  run.ribs = details.ribs ?? null;
}

function t3LatheSeam(levels, s) {
  for (let i = 0; i + 4 < levels.length; i += 4) {
    const sa = levels[i];
    const sb = levels[i + 4];
    if ((s - sa) * (s - sb) <= 0 && sa !== sb) {
      const t = (s - sa) / (sb - sa);
      const r = levels[i + 1] + (levels[i + 5] - levels[i + 1]) * t;
      const slope = (levels[i + 5] - levels[i + 1]) / (sb - sa);
      return { s, r, slope };
    }
  }
  return { s, r: levels[1], slope: 0 };
}

function t3LatheSheets(levels, geo, step, buckets) {
  const at = (L, t) => {
    const c = Math.cos(t);
    const n = Math.sin(t);
    return [geo.O[0] + L.s * geo.SA[0] + L.r * (c * geo.SU[0] + n * geo.SV[0]), geo.O[1] + L.s * geo.SA[1] + L.r * (c * geo.SU[1] + n * geo.SV[1])];
  };
  const arcPoints = (L, from, to) => {
    const count = Math.max(1, Math.ceil((to - from) / step));
    const out = new Array(count + 1);
    for (let index = 0; index <= count; index++) out[index] = at(L, from + ((to - from) * index) / count);
    return out;
  };
  const oriented = (points) => {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    return area < 0 ? points.reverse() : points;
  };
  const centreOf = (arc, reference) => {
    let mid = (arc.from + arc.to) / 2 - reference;
    mid = ((mid % T3_TAU) + T3_TAU) % T3_TAU;
    return mid;
  };
  const present = [false, false, false, false, false];
  for (const L of levels) {
    const groups = [null, null, null, null, null];
    for (const arc of L.arcs) {
      if (!groups[arc.tone]) groups[arc.tone] = [];
      groups[arc.tone].push(arc);
      present[arc.tone] = true;
    }
    for (const list of groups) if (list && list.length > 1) list.sort((x, y) => centreOf(x, geo.light.phi) - centreOf(y, geo.light.phi));
    L.groups = groups;
  }
  const align = (reference, arc) => {
    const out = { ...arc };
    const centre = (reference.from + reference.to) / 2;
    while ((out.from + out.to) / 2 - centre > Math.PI) {
      out.from -= T3_TAU;
      out.to -= T3_TAU;
    }
    while (centre - (out.from + out.to) / 2 > Math.PI) {
      out.from += T3_TAU;
      out.to += T3_TAU;
    }
    return out;
  };
  const overlap = (x, y) => Math.min(x.to, y.to) - Math.max(x.from, y.from);
  const sheet = (tone, run) => {
    const chains = run[0].groups[tone].map((arc) => [arc]);
    for (let q = 1; q < run.length; q++) {
      const next = run[q].groups[tone];
      const used = new Uint8Array(next.length);
      for (const chain of chains) {
        const prev = chain[q - 1];
        let best = -1;
        let score = -Infinity;
        for (let j = 0; j < next.length; j++) {
          if (used[j]) continue;
          const value = overlap(prev, align(prev, next[j]));
          if (value > score) {
            score = value;
            best = j;
          }
        }
        used[best] = 1;
        chain.push(align(prev, next[best]));
      }
    }
    chains.forEach((chain) => {
      const last = run.length - 1;
      const points = arcPoints(run[0], chain[0].from, chain[0].to);
      for (let q = 1; q < last; q++) points.push(at(run[q], chain[q].to));
      points.push(...arcPoints(run[last], chain[last].from, chain[last].to).reverse());
      for (let q = last - 1; q >= 1; q--) points.push(at(run[q], chain[q].from));
      buckets[tone] += t3PathOf(oriented(points), true);
    });
  };
  const strip = (tone, a, b) => {
    const below = a.groups[tone] ?? [];
    const above = b.groups[tone] ?? [];
    const whole = (arc) => arc.to - arc.from >= T3_TAU - 1e-6;
    const seat = (ring, arc) => {
      const gap = T3_TAU - (arc.to - arc.from);
      return { from: arc.from - gap / 2, to: arc.to + gap / 2 };
    };
    const quad = (lo, hi) => {
      if (whole(hi) && !whole(lo)) hi = seat(hi, lo);
      else if (whole(lo) && !whole(hi)) lo = seat(lo, hi);
      const points = [...arcPoints(a, lo.from, lo.to), ...arcPoints(b, hi.from, hi.to).reverse()];
      buckets[tone] += t3PathOf(oriented(points), true);
    };
    const links = below.map(() => []);
    const back = above.map(() => []);
    below.forEach((lo, i) =>
      above.forEach((hi, j) => {
        if (overlap(lo, align(lo, hi)) > -0.05) {
          links[i].push(j);
          back[j].push(i);
        }
      }),
    );
    const doneLo = new Uint8Array(below.length);
    const doneHi = new Uint8Array(above.length);
    const share = (span, parts, flip) => {
      if (whole(span)) {
        const base = parts[0].from;
        const sorted = parts.map((arc) => {
          const shift = T3_TAU * Math.floor((arc.from - base) / T3_TAU);
          return { from: arc.from - shift, to: arc.to - shift };
        }).sort((x, y) => x.from - y.from);
        const n = sorted.length;
        const cuts = sorted.map((arc, q) => {
          const next = q + 1 < n ? sorted[q + 1].from : sorted[0].from + T3_TAU;
          return (arc.to + next) / 2;
        });
        sorted.forEach((arc, q) => {
          const piece = { from: q ? cuts[q - 1] : cuts[n - 1] - T3_TAU, to: cuts[q] };
          if (flip) quad(arc, piece);
          else quad(piece, arc);
        });
        return;
      }
      const sorted = parts.map((arc) => align(span, arc)).sort((x, y) => x.from - y.from);
      const cuts = [span.from];
      for (let q = 1; q < sorted.length; q++) cuts.push(Math.min(span.to, Math.max(span.from, (sorted[q - 1].to + sorted[q].from) / 2)));
      cuts.push(span.to);
      sorted.forEach((arc, q) => {
        const piece = { from: cuts[q], to: cuts[q + 1] };
        if (flip) quad(arc, piece);
        else quad(piece, arc);
      });
    };
    for (let j = 0; j < above.length; j++) {
      if (back[j].length < 2 || back[j].some((i) => links[i].length !== 1)) continue;
      share(above[j], back[j].map((i) => below[i]), false);
      doneHi[j] = 1;
      for (const i of back[j]) doneLo[i] = 1;
    }
    for (let i = 0; i < below.length; i++) {
      if (doneLo[i] || links[i].length < 2 || links[i].some((j) => back[j].length !== 1)) continue;
      share(below[i], links[i].map((j) => above[j]), true);
      doneLo[i] = 1;
      for (const j of links[i]) doneHi[j] = 1;
    }
    for (let i = 0; i < below.length; i++) {
      if (doneLo[i]) continue;
      const lo = below[i];
      let best = -1;
      let score = -Infinity;
      for (const j of links[i]) {
        if (doneHi[j]) continue;
        const value = overlap(lo, align(lo, above[j]));
        if (value > score) {
          score = value;
          best = j;
        }
      }
      if (best >= 0) {
        doneHi[best] = 1;
        quad(lo, align(lo, above[best]));
      } else {
        const centre = (lo.from + lo.to) / 2;
        quad(lo, { from: centre, to: centre });
      }
    }
    for (let j = 0; j < above.length; j++) {
      if (doneHi[j]) continue;
      const centre = (above[j].from + above[j].to) / 2;
      quad({ from: centre, to: centre }, above[j]);
    }
  };
  for (let tone = 0; tone < 5; tone++) {
    if (!present[tone]) continue;
    for (let q = 1; q < levels.length; q++) strip(tone, levels[q - 1], levels[q]);
  }
  void sheet;
}

function t3EmitLathe(run, cam, f) {
  const geo = t3Geo(run.F, cam);
  const k = cam.k;
  const step = T3_TAU / run.fine;
  const sheets = ["", "", "", "", ""];
  const lv = run.levels;
  const levelAt = (s, r, nr, na) => ({ s, r, nr, na, arcs: t3Arcs(nr, na, geo.view, geo.light) });
  const same = (a, b) => {
    if (a.arcs.length !== b.arcs.length) return false;
    for (let i = 0; i < a.arcs.length; i++) if (a.arcs[i].tone !== b.arcs[i].tone || Boolean(a.arcs[i].full) !== Boolean(b.arcs[i].full)) return false;
    return true;
  };
  const reach = (a, b) => Math.hypot((b.s - a.s) * Math.hypot(geo.SA[0], geo.SA[1]), (b.r - a.r) * k) + Math.abs(b.r - a.r) * k;
  const levels = [];
  const wrap = (x, ref) => x + T3_TAU * Math.round((ref - x) / T3_TAU);
  const close = (a, mid, b) => {
    const r = Math.max(a.r, b.r) * k;
    for (let i = 0; i < mid.arcs.length; i++) {
      const m = mid.arcs[i];
      if (m.full) continue;
      for (const key of ["from", "to"]) {
        const x = m[key];
        const guess = (wrap(a.arcs[i][key], x) + wrap(b.arcs[i][key], x)) / 2;
        if (Math.abs(guess - x) * r > 0.25) return false;
      }
    }
    return true;
  };
  const refine = (a, b, depth) => {
    if (depth >= 8 || reach(a, b) < 0.1) {
      levels.push(b);
      return;
    }
    const m = t3LatheMid(a, b);
    const mid = levelAt(m.s, m.r, m.nr, m.na);
    if (same(a, b) && same(a, mid) && close(a, mid, b)) {
      levels.push(b);
      return;
    }
    refine(a, mid, depth + 1);
    refine(mid, b, depth + 1);
  };
  let previous = levelAt(lv[0], lv[1], lv[2], lv[3]);
  levels.push(previous);
  for (let i = 4; i < lv.length; i += 4) {
    const next = levelAt(lv[i], lv[i + 1], lv[i + 2], lv[i + 3]);
    refine(previous, next, 0);
    previous = next;
  }
  t3LatheSheets(levels, geo, step, sheets);
  for (let t = 0; t < 5; t++) f.d[run.role[`s${t}`]] = sheets[t];
  const pts = t3LatheOutline(run, geo, cam);
  const outline = t3PathOf(pts, true);
  f.d[run.role.fill] = outline;
  f.d[run.role.edge] = outline;
  t3BoxOf(pts, f.box);
  t3HullOut(f, pts);
  let crease = "";
  const view = geo.view;
  const ends = [[0, lv[0], lv[1], -1, 4], [1, lv[lv.length - 4], lv[lv.length - 3], 1, lv.length - 8]];
  for (const [end, s, r, sign, near] of ends) {
    const role = run.role[`k${end}`];
    if (role === undefined) continue;
    const face = sign * geo.aV;
    if (!(face > 1e-9) || r <= 1e-9) {
      f.d[role] = "";
      continue;
    }
    const n = run.capCount;
    const buf = t3Scratch("c", 2 * n);
    const table = t3Table(n);
    for (let j = 0; j < n; j++) {
      const c = table[2 * j];
      const q = table[2 * j + 1];
      buf[2 * j] = geo.O[0] + s * geo.SA[0] + r * (c * geo.SU[0] + q * geo.SV[0]);
      buf[2 * j + 1] = geo.O[1] + s * geo.SA[1] + r * (c * geo.SU[1] + q * geo.SV[1]);
    }
    f.d[role] = t3Path(buf, n, true);
    f.q[role] = t3Level(sign * geo.aL, T3_LB);
    const minor = 2 * r * k * Math.abs(face);
    f.w[role] = minor < 0.4 ? Math.round(minor * 100) / 100 : -1;
    if (run.role.crease === undefined) continue;
    const nr = lv[near + 2];
    const na = lv[near + 3];
    let lo;
    let hi;
    if (view.flat < 1e-9) {
      if (!(na * view.a > 1e-9)) continue;
      lo = 0;
      hi = T3_TAU;
    } else {
      const cc = -(na * view.a) / (nr * view.flat);
      if (cc >= 1) continue;
      if (cc <= -1) {
        lo = view.phi;
        hi = view.phi + T3_TAU;
      } else {
        const d = Math.acos(cc);
        lo = view.phi - d;
        hi = view.phi + d;
      }
    }
    const count = Math.min(400, Math.max(4, Math.ceil(((hi - lo) * r * k) / 1.5)));
    const arc = t3Scratch("c", 2 * count + 2);
    for (let j = 0; j <= count; j++) t3At(geo, s, r, lo + ((hi - lo) * j) / count, arc, 2 * j);
    crease += t3Path(arc, count + 1, false);
  }
  if (run.role.crease !== undefined) f.d[run.role.crease] = crease;
  if (run.role.inner !== undefined) {
    let inner = "";
    for (const seam of run.seams) inner += t3SeamArc(geo, seam.s, seam.r, seam.slope, k);
    f.d[run.role.inner] = inner;
  }
  if (run.ribs) {
    const lines = t3State.detail < 0.01 ? t3None : t3RibLines(geo, run.F, cam, run.ribs, 0, 0);
    f.levels = t3Faded(f, run, "r", lines, lines.d.length);
  }
}

const T3_SHINE = (() => {
  const l = Math.hypot(-0.55, -0.835);
  return [-0.55 / l, -0.835 / l];
})();

function t3RouteOf(flat) {
  const n = flat.length / 3;
  const along = new Float64Array(n);
  for (let i = 1; i < n; i++) along[i] = along[i - 1] + Math.hypot(flat[3 * i] - flat[3 * i - 3], flat[3 * i + 1] - flat[3 * i - 2], flat[3 * i + 2] - flat[3 * i - 1]);
  return { flat, n, along, total: along[n - 1] };
}

function t3PointAlong(route, at) {
  const { flat, n, along } = route;
  if (at <= 0) return [flat[0], flat[1], flat[2]];
  if (at >= along[n - 1]) return [flat[3 * n - 3], flat[3 * n - 2], flat[3 * n - 1]];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (along[mid] <= at) lo = mid;
    else hi = mid;
  }
  const span = along[hi] - along[lo] || 1;
  const t = (at - along[lo]) / span;
  return [flat[3 * lo] + (flat[3 * hi] - flat[3 * lo]) * t, flat[3 * lo + 1] + (flat[3 * hi + 1] - flat[3 * lo + 1]) * t, flat[3 * lo + 2] + (flat[3 * hi + 2] - flat[3 * lo + 2]) * t];
}

function t3Cut(route, from, to) {
  const { flat, n, along } = route;
  const out = [];
  for (let i = 1; i < n; i++) {
    const start = along[i - 1];
    const end = along[i];
    if (end >= from && start <= to) {
      const length = end - start || 1;
      const t0 = Math.max(0, (from - start) / length);
      const t1 = Math.min(1, (to - start) / length);
      const at = (t) => [flat[3 * i - 3] + (flat[3 * i] - flat[3 * i - 3]) * t, flat[3 * i - 2] + (flat[3 * i + 1] - flat[3 * i - 2]) * t, flat[3 * i - 1] + (flat[3 * i + 2] - flat[3 * i - 1]) * t];
      if (!out.length) out.push(at(t0));
      out.push(at(t1));
    }
  }
  return out;
}

function t3TangentAlong(route, at) {
  const a = t3PointAlong(route, Math.max(0, at - 0.6));
  const b = t3PointAlong(route, Math.min(route.total, at + 0.6));
  return t3Unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
}

const t3RouteCache = new WeakMap();

function t3PrepareTube(run, part, data) {
  const spec = part.spec;
  const source = data.routes[spec.route];
  let route = t3RouteCache.get(source);
  if (!route) {
    route = t3RouteOf(source.points);
    t3RouteCache.set(source, route);
  }
  const total = route.total;
  const r = source.r;
  const step = Math.max(0.05, Math.min(source.spacing, total / 4) * 0.5);
  const lead = 0.5;
  run.r = r;
  run.wide = Boolean(source.wide);
  run.hue = source.hue ?? null;
  const partOf = (start, end) => {
    const points = t3Cut(route, Math.max(0, start), Math.min(total, end));
    let walked = Math.max(0, start);
    const count = points.length;
    const P3 = new Float64Array(3 * count);
    const D3 = new Float64Array(3 * count);
    for (let i = 0; i < count; i++) {
      if (i > 0) walked += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1], points[i][2] - points[i - 1][2]);
      const a = t3PointAlong(route, Math.max(0, Math.min(total, walked - step)));
      const b = t3PointAlong(route, Math.max(0, Math.min(total, walked + step)));
      for (let c = 0; c < 3; c++) {
        P3[3 * i + c] = points[i][c];
        D3[3 * i + c] = b[c] - a[c];
      }
    }
    return { count, P3, D3 };
  };
  const openStart = spec.open0 && spec.from > 0;
  const openEnd = spec.open1 && spec.to < total;
  run.body = partOf(openStart ? spec.from - lead : spec.from, openEnd ? spec.to + lead : spec.to);
  run.stripe = openStart || openEnd ? partOf(openStart ? spec.from - 2 * lead : spec.from, openEnd ? spec.to + 2 * lead : spec.to) : run.body;
  const ends = [!spec.open0 && (spec.from <= 1e-6 || spec.gap0), !spec.open1 && (spec.to >= total - 1e-6 || spec.gap1)];
  run.capped = [ends[0] && (spec.gap0 || spec.caps[0]), ends[1] && (spec.gap1 || spec.caps[1])];
  const P3 = run.body.P3;
  const last = run.body.count - 1;
  const vec = (i, j) => t3Unit([P3[3 * i] - P3[3 * j], P3[3 * i + 1] - P3[3 * j + 1], P3[3 * i + 2] - P3[3 * j + 2]]);
  run.tips = [vec(1, 0), vec(last, last - 1)];
  run.rings = null;
  if (source.rings) {
    const { pitch = 3, twist = 0, cross = false, fade = [0.1, 0.55], phase = 0, steps = 16 } = source.rings;
    const lo = openStart ? spec.from - 2 * lead : spec.from;
    const hi = openEnd ? spec.to + 2 * lead : spec.to;
    const margin = twist ? 0 : Math.min(pitch * 0.35, (hi - lo) / 2);
    const from = Math.max(lo, !openStart ? lo + margin : lo);
    const to = Math.min(hi, !openEnd ? hi - margin : hi);
    const segments = [];
    if (to > from) {
      const hands = twist ? (cross ? [1, -1] : [1]) : [0];
      const reach = Math.abs(twist) * r;
      const first = Math.ceil((from - reach - phase) / pitch);
      const lastIndex = Math.floor((to + reach - phase) / pitch);
      const surface = (t, theta) => {
        const at = Math.max(0, Math.min(total, t));
        return { c: t3PointAlong(route, at), T: t3TangentAlong(route, at), theta };
      };
      for (let index = first; index <= lastIndex; index++) {
        const station = phase + index * pitch;
        for (const hand of hands) {
          const samples = [];
          for (let k = 0; k <= steps; k++) {
            const theta = (k / steps) * Math.PI;
            const t = station + hand * twist * r * (k / steps - 0.5);
            samples.push({ t, theta });
          }
          for (let k = 0; k < steps; k++) {
            let a = samples[k];
            let b = samples[k + 1];
            if ((a.t < from && b.t < from) || (a.t > to && b.t > to)) continue;
            const clipTo = (x, y, edge) => ({ t: edge, theta: x.theta + ((y.theta - x.theta) * (edge - x.t)) / (y.t - x.t || 1e-9) });
            if (a.t < from) a = clipTo(a, b, from);
            if (b.t < from) b = clipTo(b, a, from);
            if (a.t > to) a = clipTo(a, b, to);
            if (b.t > to) b = clipTo(b, a, to);
            segments.push([surface(a.t, a.theta), surface(b.t, b.theta)]);
          }
        }
      }
    }
    run.rings = { segments, fade, tone: source.rings.tone ?? "lo" };
  }
}

function t3Sides(part, cam, r) {
  const m = cam.m;
  const k = cam.k;
  const n = part.count;
  const out = { n, flat: new Float64Array(2 * n), left: new Float64Array(2 * n), right: new Float64Array(2 * n), shineA: new Float64Array(2 * n), shineB: new Float64Array(2 * n), shadeA: new Float64Array(2 * n), shadeB: new Float64Array(2 * n), frames: [] };
  const half = r * k;
  for (let i = 0; i < n; i++) {
    const x = part.P3[3 * i];
    const y = part.P3[3 * i + 1];
    const z = part.P3[3 * i + 2];
    const px = cam.ox + m[0] * x + m[1] * y + m[2] * z;
    const py = cam.oy + m[3] * x + m[4] * y + m[5] * z;
    const dx = m[0] * part.D3[3 * i] + m[1] * part.D3[3 * i + 1] + m[2] * part.D3[3 * i + 2];
    const dy = m[3] * part.D3[3 * i] + m[4] * part.D3[3 * i + 1] + m[5] * part.D3[3 * i + 2];
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l;
    const ny = dx / l;
    out.flat[2 * i] = px;
    out.flat[2 * i + 1] = py;
    out.frames.push({ p: [px, py], nx, ny, half });
    out.left[2 * i] = px + nx * half;
    out.left[2 * i + 1] = py + ny * half;
    out.right[2 * i] = px - nx * half;
    out.right[2 * i + 1] = py - ny * half;
    const toward = nx * T3_SHINE[0] + ny * T3_SHINE[1];
    const shineAt = half * 0.44 * toward;
    const shineHalf = half * 0.24;
    out.shineA[2 * i] = px + nx * (shineAt + shineHalf);
    out.shineA[2 * i + 1] = py + ny * (shineAt + shineHalf);
    out.shineB[2 * i] = px + nx * (shineAt - shineHalf);
    out.shineB[2 * i + 1] = py + ny * (shineAt - shineHalf);
    const shadeAt = -half * 0.62 * toward;
    const shadeHalf = half * 0.2;
    out.shadeA[2 * i] = px + nx * (shadeAt + shadeHalf);
    out.shadeA[2 * i + 1] = py + ny * (shadeAt + shadeHalf);
    out.shadeB[2 * i] = px + nx * (shadeAt - shadeHalf);
    out.shadeB[2 * i + 1] = py + ny * (shadeAt - shadeHalf);
  }
  return out;
}

const t3Pts = (buf, n) => {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = [buf[2 * i], buf[2 * i + 1]];
  return out;
};

function t3TubeCap(cam, centre, tangent, radius, inward) {
  const V = cam.V;
  const m = cam.m;
  let n1 = [tangent[1] * V[2] - tangent[2] * V[1], tangent[2] * V[0] - tangent[0] * V[2], tangent[0] * V[1] - tangent[1] * V[0]];
  if (Math.hypot(n1[0], n1[1], n1[2]) < 1e-6) {
    const helper = Math.abs(tangent[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    n1 = [helper[1] * tangent[2] - helper[2] * tangent[1], helper[2] * tangent[0] - helper[0] * tangent[2], helper[0] * tangent[1] - helper[1] * tangent[0]];
  }
  n1 = t3Unit(n1);
  const n2 = t3Unit([tangent[1] * n1[2] - tangent[2] * n1[1], tangent[2] * n1[0] - tangent[0] * n1[2], tangent[0] * n1[1] - tangent[1] * n1[0]]);
  const steps = 28;
  const proj = (p) => [cam.ox + m[0] * p[0] + m[1] * p[1] + m[2] * p[2], cam.oy + m[3] * p[0] + m[4] * p[1] + m[5] * p[2]];
  const ring = new Array(steps);
  for (let index = 0; index < steps; index++) {
    const angle = (index / steps) * T3_TAU;
    const cs = radius * Math.cos(angle);
    const sn = radius * Math.sin(angle);
    ring[index] = proj([centre[0] + n1[0] * cs + n2[0] * sn, centre[1] + n1[1] * cs + n2[1] * sn, centre[2] + n1[2] * cs + n2[2] * sn]);
  }
  const C = proj(centre);
  const probe = proj([centre[0] + n2[0], centre[1] + n2[1], centre[2] + n2[2]]);
  const along = (probe[0] - C[0]) * inward[0] + (probe[1] - C[1]) * inward[1];
  const from = along > 0 ? steps / 2 : 0;
  const half = (start) => Array.from({ length: steps / 2 + 1 }, (_, index) => ring[(start + index) % steps]);
  return { ring, arc: half(from), inner: half((from + steps / 2) % steps) };
}

function t3StripeEnd(half, centre, nx, ny, from, to) {
  const offset = (p) => (p[0] - centre[0]) * nx + (p[1] - centre[1]) * ny;
  const values = half.map(offset);
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const points = [];
  const cross = (k, level) => {
    const t = (level - values[k]) / (values[k + 1] - values[k] || 1e-9);
    return [half[k][0] + (half[k + 1][0] - half[k][0]) * t, half[k][1] + (half[k + 1][1] - half[k][1]) * t];
  };
  for (let k = 0; k < half.length; k++) {
    if (values[k] >= lo && values[k] <= hi) points.push(half[k]);
    if (k < half.length - 1) for (const level of [lo, hi]) if ((values[k] - level) * (values[k + 1] - level) < 0) points.push(cross(k, level));
  }
  return points
    .map((p) => [p, offset(p)])
    .sort((x, y) => (from > to ? y[1] - x[1] : x[1] - y[1]))
    .map(([p]) => p);
}

function t3EmitTube(run, cam, f) {
  const r = run.r;
  const sides = t3Sides(run.body, cam, r);
  const bands = run.stripe === run.body ? sides : t3Sides(run.stripe, cam, r);
  const n = sides.n;
  const left = t3Pts(sides.left, n);
  const right = t3Pts(sides.right, n);
  const loop = left.concat(right.slice().reverse());
  let area = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sign = Math.sign(area);
  let body = t3PathOf(loop, true);
  let edges = t3PathOf(left, false) + t3PathOf(right, false);
  const tips = [null, null];
  const last = n - 1;
  const quads = [];
  for (let i = 0; i < last; i++) quads.push([left[i], left[i + 1], right[i + 1], right[i]]);
  for (const side of [0, 1]) {
    if (!run.capped[side]) continue;
    const at = side ? last : 0;
    const other = side ? last - 1 : 1;
    const tangent = run.tips[side];
    const outward = side ? tangent : [-tangent[0], -tangent[1], -tangent[2]];
    const inward = [sides.flat[2 * other] - sides.flat[2 * at], sides.flat[2 * other + 1] - sides.flat[2 * at + 1]];
    const centre = [run.body.P3[3 * at], run.body.P3[3 * at + 1], run.body.P3[3 * at + 2]];
    const { ring, arc, inner } = t3TubeCap(cam, centre, tangent, r, inward);
    let ringArea = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      ringArea += a[0] * b[1] - b[0] * a[1];
    }
    body += t3PathOf(Math.sign(ringArea) === sign ? ring : ring.slice().reverse(), true);
    edges += t3PathOf(arc, false);
    const V = cam.V;
    const open = outward[0] * V[0] + outward[1] * V[1] + outward[2] * V[2] > 0;
    if (open) edges += t3PathOf(inner, false);
    tips[side] = { half: open ? inner : arc, frame: sides.frames[at] };
    quads.push(ring);
  }
  f.d[run.role.body] = body;
  f.d[run.role.edges] = edges;
  if (run.wide) {
    const toward = (frame) => frame.nx * T3_SHINE[0] + frame.ny * T3_SHINE[1];
    const shineOffsets = (frame) => [frame.half * 0.44 * toward(frame) + frame.half * 0.24, frame.half * 0.44 * toward(frame) - frame.half * 0.24];
    const shadeOffsets = (frame) => [-frame.half * 0.62 * toward(frame) + frame.half * 0.2, -frame.half * 0.62 * toward(frame) - frame.half * 0.2];
    const bn = bands.n;
    const band = (A, B, offsets) => {
      const head = tips[1] ? t3StripeEnd(tips[1].half, tips[1].frame.p, tips[1].frame.nx, tips[1].frame.ny, offsets(tips[1].frame)[0], offsets(tips[1].frame)[1]) : [];
      const tail = tips[0] ? t3StripeEnd(tips[0].half, tips[0].frame.p, tips[0].frame.nx, tips[0].frame.ny, offsets(tips[0].frame)[1], offsets(tips[0].frame)[0]) : [];
      return t3PathOf([...t3Pts(A, bn), ...head, ...t3Pts(B, bn).reverse(), ...tail], true);
    };
    f.d[run.role.shine] = band(bands.shineA, bands.shineB, shineOffsets);
    f.d[run.role.shade] = band(bands.shadeA, bands.shadeB, shadeOffsets);
  }
  if (run.rings) {
    const lines = t3Lines;
    lines.d.length = 0;
    lines.alpha.length = 0;
  lines.key.length = 0;
    lines.key.length = 0;
    const V = cam.V;
    const m = cam.m;
    const seg = new Float64Array(4);
    const surface = (sample, out, index) => {
      const T = sample.T;
      let n1 = [T[1] * V[2] - T[2] * V[1], T[2] * V[0] - T[0] * V[2], T[0] * V[1] - T[1] * V[0]];
      const l1 = Math.hypot(n1[0], n1[1], n1[2]);
      if (l1 < 1e-6) return null;
      n1 = [n1[0] / l1, n1[1] / l1, n1[2] / l1];
      let n2 = t3Unit([T[1] * n1[2] - T[2] * n1[1], T[2] * n1[0] - T[0] * n1[2], T[0] * n1[1] - T[1] * n1[0]]);
      if (n2[0] * V[0] + n2[1] * V[1] + n2[2] * V[2] < 0) n2 = [-n2[0], -n2[1], -n2[2]];
      const cs = Math.cos(sample.theta);
      const sn = Math.sin(sample.theta);
      const normal = [n1[0] * cs + n2[0] * sn, n1[1] * cs + n2[1] * sn, n1[2] * cs + n2[2] * sn];
      const p = [sample.c[0] + normal[0] * r, sample.c[1] + normal[1] * r, sample.c[2] + normal[2] * r];
      out[index] = cam.ox + m[0] * p[0] + m[1] * p[1] + m[2] * p[2];
      out[index + 1] = cam.oy + m[3] * p[0] + m[4] * p[1] + m[5] * p[2];
      return normal[0] * V[0] + normal[1] * V[1] + normal[2] * V[2];
    };
    const fade = run.rings.fade;
    let index = -1;
    for (const [a, b] of run.rings.segments) {
      index++;
      const fa = surface(a, seg, 0);
      const fb = surface(b, seg, 2);
      if (fa === null || fb === null) continue;
      const alpha = fade ? t3Step(fade[0], fade[1], (fa + fb) / 2) : 1;
      if (alpha * T3_LEVELS < 0.5) continue;
      lines.d.push(t3Path(seg, 2, false));
      lines.alpha.push(alpha);
      lines.key.push(index);
    }
    f.levels = t3Faded(f, run, "r", lines, lines.d.length);
  }
  const all = left.concat(right);
  t3BoxOf(all, f.box);
  for (const q of quads) for (const p of q) {
    if (p[0] < f.box[0]) f.box[0] = p[0];
    if (p[1] < f.box[1]) f.box[1] = p[1];
    if (p[0] > f.box[2]) f.box[2] = p[0];
    if (p[1] > f.box[3]) f.box[3] = p[1];
  }
  const list = f.quadList && f.quadList.length === quads.length ? f.quadList : (f.quadList = quads.map(() => [new Float64Array(0), 0]));
  for (let qi = 0; qi < quads.length; qi++) {
    const q = quads[qi];
    let entry = list[qi];
    if (entry[0].length < 2 * q.length) entry[0] = new Float64Array(2 * q.length);
    const buf = entry[0];
    for (let i = 0; i < q.length; i++) {
      buf[2 * i] = q[i][0];
      buf[2 * i + 1] = q[i][1];
    }
    entry[1] = q.length;
  }
  f.quadN = quads.length;
  f.quads = f.quadList;
  f.hullN = 0;
}

function t3Emit(run, cam, out) {
  const f = out ?? t3Frame(run);
  if (run.kind === "prism") t3EmitPrism(run, cam, f);
  else if (run.kind === "round") t3EmitRound(run, cam, f);
  else if (run.kind === "ball") t3EmitBall(run, cam, f);
  else if (run.kind === "lathe") t3EmitLathe(run, cam, f);
  else if (run.kind === "tube") {
    t3EmitTube(run, cam, f);
    return f;
  } else if (run.kind === "fixed") {
    t3EmitFixed(run, cam, f);
    return f;
  }
  t3EmitPlanes(run, cam, f);
  t3EmitDots(run, cam, f);
  return f;
}

function t3Overlap(a, b, pad) {
  return a[0] < b[2] - pad && b[0] < a[2] - pad && a[1] < b[3] - pad && b[1] < a[3] - pad;
}

function t3Apart(A, an, B, bn, pad) {
  for (let pass = 0; pass < 2; pass++) {
    const P = pass ? B : A;
    const pn = pass ? bn : an;
    for (let i = 0; i < pn; i++) {
      const j = (i + 1) % pn;
      const nx = P[2 * j + 1] - P[2 * i + 1];
      const ny = P[2 * i] - P[2 * j];
      const l = Math.hypot(nx, ny);
      if (l < 1e-9) continue;
      let a0 = Infinity;
      let a1 = -Infinity;
      for (let q = 0; q < an; q++) {
        const v = (A[2 * q] * nx + A[2 * q + 1] * ny) / l;
        if (v < a0) a0 = v;
        if (v > a1) a1 = v;
      }
      let b0 = Infinity;
      let b1 = -Infinity;
      for (let q = 0; q < bn; q++) {
        const v = (B[2 * q] * nx + B[2 * q + 1] * ny) / l;
        if (v < b0) b0 = v;
        if (v > b1) b1 = v;
      }
      if (a1 < b0 + pad || b1 < a0 + pad) return true;
    }
  }
  return false;
}

function t3Disjoint(fa, fb, pad) {
  const qa = fa.quadN ? fa.quads : null;
  const qb = fb.quadN ? fb.quads : null;
  if (!qa && !qb) return t3Apart(fa.hull, fa.hullN, fb.hull, fb.hullN, pad);
  const listA = qa ? fa.quadList : [[fa.hull, fa.hullN]];
  const listB = qb ? fb.quadList : [[fb.hull, fb.hullN]];
  for (const [A, an] of listA) for (const [B, bn] of listB) if (!t3Apart(A, an, B, bn, pad)) return false;
  return true;
}

function t3Support(cloud, R, t, dir, world) {
  let best = -Infinity;
  let at = 0;
  const n = cloud.length / 3;
  const dx = R[0] * dir[0] + R[3] * dir[1] + R[6] * dir[2];
  const dy = R[1] * dir[0] + R[4] * dir[1] + R[7] * dir[2];
  const dz = R[2] * dir[0] + R[5] * dir[1] + R[8] * dir[2];
  for (let i = 0; i < n; i++) {
    const v = cloud[3 * i] * dx + cloud[3 * i + 1] * dy + cloud[3 * i + 2] * dz;
    if (v > best) {
      best = v;
      at = i;
    }
  }
  const x = cloud[3 * at];
  const y = cloud[3 * at + 1];
  const z = cloud[3 * at + 2];
  world[0] = R[0] * x + R[1] * y + R[2] * z + t[0];
  world[1] = R[3] * x + R[4] * y + R[5] * z + t[1];
  world[2] = R[6] * x + R[7] * y + R[8] * z + t[2];
  return best + dir[0] * t[0] + dir[1] * t[1] + dir[2] * t[2];
}

function t3Gjk(cloudA, camA, cloudB, camB, warm, rounds = 8, hints = null) {
  let w = warm && (warm[0] || warm[1] || warm[2]) ? [warm[0], warm[1], warm[2]] : null;
  const a = [0, 0, 0];
  const b = [0, 0, 0];
  if (!w) {
    t3Support(cloudA, camA.R, camA.t, [1, 0, 0], a);
    t3Support(cloudB, camB.R, camB.t, [-1, 0, 0], b);
    w = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  }
  let margin = -Infinity;
  let best = w;
  const step = (limit) => {
    for (let it = 0; it < limit; it++) {
      const l = Math.hypot(w[0], w[1], w[2]);
      if (l < 1e-12) break;
      const n = [w[0] / l, w[1] / l, w[2] / l];
      const hiA = t3Support(cloudA, camA.R, camA.t, n, a);
      const loB = -t3Support(cloudB, camB.R, camB.t, [-n[0], -n[1], -n[2]], b);
      const value = loB - hiA;
      if (value > margin) {
        margin = value;
        best = n;
      }
      const s = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ds = [w[0] - s[0], w[1] - s[1], w[2] - s[2]];
      const dd = ds[0] * ds[0] + ds[1] * ds[1] + ds[2] * ds[2];
      if (dd < 1e-14) break;
      const tt = Math.max(0, Math.min(1, (w[0] * ds[0] + w[1] * ds[1] + w[2] * ds[2]) / dd));
      w = [w[0] - ds[0] * tt, w[1] - ds[1] * tt, w[2] - ds[2] * tt];
    }
  };
  step(rounds);
  if (margin < 0) step(24);
  if (margin < 0.05 && hints) {
    if (hints.centroids) {
      const [ca, cb] = hints.centroids;
      const wa = [camA.R[0] * ca[0] + camA.R[1] * ca[1] + camA.R[2] * ca[2] + camA.t[0], camA.R[3] * ca[0] + camA.R[4] * ca[1] + camA.R[5] * ca[2] + camA.t[1], camA.R[6] * ca[0] + camA.R[7] * ca[1] + camA.R[8] * ca[2] + camA.t[2]];
      const wb = [camB.R[0] * cb[0] + camB.R[1] * cb[1] + camB.R[2] * cb[2] + camB.t[0], camB.R[3] * cb[0] + camB.R[4] * cb[1] + camB.R[5] * cb[2] + camB.t[1], camB.R[6] * cb[0] + camB.R[7] * cb[1] + camB.R[8] * cb[2] + camB.t[2]];
      const n = t3Unit([wb[0] - wa[0], wb[1] - wa[1], wb[2] - wa[2]]);
      const hiA = t3Support(cloudA, camA.R, camA.t, n, a);
      const loB = -t3Support(cloudB, camB.R, camB.t, [-n[0], -n[1], -n[2]], b);
      if (loB - hiA > margin) {
        margin = loB - hiA;
        best = n;
      }
    }
    for (const [axis, cam] of hints) {
      const R = cam.R;
      const w0 = [R[0] * axis[0] + R[1] * axis[1] + R[2] * axis[2], R[3] * axis[0] + R[4] * axis[1] + R[5] * axis[2], R[6] * axis[0] + R[7] * axis[1] + R[8] * axis[2]];
      for (const sign of [1, -1]) {
        const n = [w0[0] * sign, w0[1] * sign, w0[2] * sign];
        const hiA = t3Support(cloudA, camA.R, camA.t, n, a);
        const loB = -t3Support(cloudB, camB.R, camB.t, [-n[0], -n[1], -n[2]], b);
        if (loB - hiA > margin) {
          margin = loB - hiA;
          best = n;
        }
      }
    }
  }
  const l = Math.hypot(best[0], best[1], best[2]) || 1;
  return { n: [best[0] / l, best[1] / l, best[2] / l], margin };
}

function t3Order(layer, frames, cams, previous, stats, scene) {
  const parts = layer.parts;
  const count = parts.length;
  const local = layer.local;
  const rank = layer._rank ?? (layer._rank = new Int32Array(count));
  if (previous) for (let at = 0; at < count; at++) rank[local.get(previous[at])] = at;
  else for (let at = 0; at < count; at++) rank[local.get(layer.rest[at])] = at;
  let groupEdges = 0;
  if (layer.groupPairs) for (const gp of layer.groupPairs) groupEdges += gp.a.length * gp.b.length;
  const maxEdges = layer.planar.length / 5 + (layer.framed ? layer.framed.length / 6 : 0) + groupEdges + layer.dynamic.length / 2 + (layer.free ? layer.free.length * count : 0) + 1;
  const head = layer._head ?? (layer._head = new Int32Array(count));
  const next = layer._next && layer._next.length >= maxEdges ? layer._next : (layer._next = new Int32Array(maxEdges));
  const to = layer._to && layer._to.length >= maxEdges ? layer._to : (layer._to = new Int32Array(maxEdges));
  const live = layer._live && layer._live.length >= maxEdges ? layer._live : (layer._live = new Uint8Array(maxEdges));
  const indeg = layer._indeg ?? (layer._indeg = new Int32Array(count));
  head.fill(-1);
  indeg.fill(0);
  let edges = 0;
  const addEdge = (back, front) => {
    to[edges] = front;
    next[edges] = head[back];
    live[edges] = 1;
    head[back] = edges;
    indeg[front]++;
    edges++;
  };
  const runs = scene ? scene.runs : null;
  const groupOf = (global) => (runs ? runs[global].group : -1);
  const planar = layer.planar;
  for (let p = 0; p < planar.length; p += 5) {
    const i = planar[p];
    const j = planar[p + 1];
    const fi = frames[i];
    const fj = frames[j];
    if (!t3Overlap(fi.box, fj.box, -0.05)) continue;
    const g = groupOf(i);
    const V = g >= 0 ? cams[g].V : cams.world.V;
    const s = planar[p + 2] * V[0] + planar[p + 3] * V[1] + planar[p + 4] * V[2];
    if (s < 1e-7 && s > -1e-7) continue;
    const li = local.get(i);
    const lj = local.get(j);
    if (s > 0) addEdge(li, lj);
    else addEdge(lj, li);
  }
  const framed = layer.framed;
  if (framed)
    for (let p = 0; p < framed.length; p += 6) {
      const i = framed[p];
      const j = framed[p + 1];
      if (!t3Overlap(frames[i].box, frames[j].box, -0.05)) continue;
      const g = framed[p + 2];
      const V = g >= 0 ? cams[g].V : cams.world.V;
      const s = framed[p + 3] * V[0] + framed[p + 4] * V[1] + framed[p + 5] * V[2];
      if (s < 1e-7 && s > -1e-7) continue;
      const li = local.get(i);
      const lj = local.get(j);
      if (s > 0) addEdge(li, lj);
      else addEdge(lj, li);
    }
  if (layer.groupPairs)
    for (const gp of layer.groupPairs) {
      const union = (list, box) => {
        box[0] = Infinity;
        box[1] = Infinity;
        box[2] = -Infinity;
        box[3] = -Infinity;
        for (let q = 0; q < list.length; q++) {
          const b = frames[list[q]].box;
          if (b[0] < box[0]) box[0] = b[0];
          if (b[1] < box[1]) box[1] = b[1];
          if (b[2] > box[2]) box[2] = b[2];
          if (b[3] > box[3]) box[3] = b[3];
        }
      };
      union(gp.a, gp.boxA);
      union(gp.b, gp.boxB);
      if (!t3Overlap(gp.boxA, gp.boxB, -0.05)) continue;
      const V = gp.frame >= 0 ? cams[gp.frame].V : cams.world.V;
      const s = gp.n[0] * V[0] + gp.n[1] * V[1] + gp.n[2] * V[2];
      if (s < 1e-7 && s > -1e-7) continue;
      for (let x = 0; x < gp.a.length; x++) {
        const i = gp.a[x];
        const bi = frames[i].box;
        if (!t3Overlap(bi, gp.boxB, -0.05)) continue;
        for (let y = 0; y < gp.b.length; y++) {
          const j = gp.b[y];
          if (!t3Overlap(bi, frames[j].box, -0.05)) continue;
          if (s > 0) addEdge(local.get(i), local.get(j));
          else addEdge(local.get(j), local.get(i));
        }
      }
    }
  const dynamic = layer.dynamic;
  let unseparated = 0;
  let solved = 0;
  const rel = layer.rel ?? (layer.rel = new Map());
  const cross = (i, j) => {
    const ri = runs[i];
    const rj = runs[j];
    const ci = ri.group >= 0 ? cams[ri.group] : cams.world;
    const cj = rj.group >= 0 ? cams[rj.group] : cams.world;
    const A = ci.R;
    const B = cj.R;
    const dx = cj.t[0] - ci.t[0];
    const dy = cj.t[1] - ci.t[1];
    const dz = cj.t[2] - ci.t[2];
    const key = i * 65536 + j;
    let memo = rel.get(key);
    if (!memo) {
      memo = { pose: new Float64Array(12), n: [0, 0, 0], margin: -Infinity, fresh: false };
      rel.set(key, memo);
    }
    const pose = memo.pose;
    let same = memo.fresh;
    let at = 0;
    for (let c = 0; c < 3; c++)
      for (let r = 0; r < 3; r++) {
        const v = A[c] * B[r] + A[3 + c] * B[3 + r] + A[6 + c] * B[6 + r];
        if (same && Math.abs(pose[at] - v) > 1e-12) same = false;
        pose[at++] = v;
      }
    for (let c = 0; c < 3; c++) {
      const v = A[c] * dx + A[3 + c] * dy + A[6 + c] * dz;
      if (same && Math.abs(pose[at] - v) > 1e-9) same = false;
      pose[at++] = v;
    }
    let nx;
    let ny;
    let nz;
    if (same) {
      const n = memo.n;
      nx = A[0] * n[0] + A[1] * n[1] + A[2] * n[2];
      ny = A[3] * n[0] + A[4] * n[1] + A[5] * n[2];
      nz = A[6] * n[0] + A[7] * n[1] + A[8] * n[2];
    } else {
      const n = memo.n;
      const warm = memo.fresh ? [A[0] * n[0] + A[1] * n[1] + A[2] * n[2], A[3] * n[0] + A[4] * n[1] + A[5] * n[2], A[6] * n[0] + A[7] * n[1] + A[8] * n[2]] : null;
      const hints = [...ri.axes.map((axis) => [axis, ci]), ...rj.axes.map((axis) => [axis, cj]), [[0, 0, 1], cams.world]];
      hints.centroids = [ri.centroid, rj.centroid];
      const hit = t3Gjk(ri.cloud, ci, rj.cloud, cj, warm, 8, hints);
      solved++;
      nx = hit.n[0];
      ny = hit.n[1];
      nz = hit.n[2];
      n[0] = A[0] * nx + A[3] * ny + A[6] * nz;
      n[1] = A[1] * nx + A[4] * ny + A[7] * nz;
      n[2] = A[2] * nx + A[5] * ny + A[8] * nz;
      memo.margin = hit.margin;
      memo.fresh = true;
    }
    if (memo.margin < -0.08) {
      unseparated++;
      if (globalThis.__t3unsep) globalThis.__t3unsep.push([ri.part?.name ?? ri.name ?? i, rj.part?.name ?? rj.name ?? j, memo.margin]);
    }
    const V = cams.world.V;
    return nx * V[0] + ny * V[1] + nz * V[2];
  };
  for (let p = 0; p < dynamic.length; p += 2) {
    const i = dynamic[p];
    const j = dynamic[p + 1];
    if (!t3Overlap(frames[i].box, frames[j].box, -0.05)) continue;
    const s = cross(i, j);
    if (s < 1e-7 && s > -1e-7) continue;
    const li = local.get(i);
    const lj = local.get(j);
    if (s > 0) addEdge(li, lj);
    else addEdge(lj, li);
  }
  const loose = layer.free;
  if (loose && loose.length) {
    const isLoose = layer.looseAt;
    for (let a = 0; a < loose.length; a++) {
      const i = loose[a];
      const gi = runs[i].group;
      const bi = frames[i].box;
      for (let b = 0; b < count; b++) {
        const j = parts[b];
        if (j === i || runs[j].group === gi) continue;
        if (isLoose[b] && j < i) continue;
        if (!t3Overlap(bi, frames[j].box, -0.05)) continue;
        const s = cross(i, j);
        if (s < 1e-7 && s > -1e-7) continue;
        const li = local.get(i);
        if (s > 0) addEdge(li, b);
        else addEdge(b, li);
      }
    }
  }
  const heap = layer._heap ?? (layer._heap = new Int32Array(count));
  const done = layer._done ?? (layer._done = new Uint8Array(count));
  done.fill(0);
  let size = 0;
  const less = (a, b) => rank[a] < rank[b];
  const push = (v) => {
    let i = size++;
    heap[i] = v;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(heap[i], heap[p])) break;
      const tmp = heap[i];
      heap[i] = heap[p];
      heap[p] = tmp;
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    heap[0] = heap[--size];
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let s = i;
      if (l < size && less(heap[l], heap[s])) s = l;
      if (r < size && less(heap[r], heap[s])) s = r;
      if (s === i) break;
      const tmp = heap[i];
      heap[i] = heap[s];
      heap[s] = tmp;
      i = s;
    }
    return top;
  };
  for (let v = 0; v < count; v++) if (indeg[v] === 0) push(v);
  const out = new Int32Array(count);
  let placed = 0;
  let forced = 0;
  let refined = 0;
  let tested = false;
  const mark = layer._mark && layer._mark.length >= count ? layer._mark : (layer._mark = new Uint8Array(count));
  const via = layer._via && layer._via.length >= count ? layer._via : (layer._via = new Int32Array(count));
  const iter = layer._iter && layer._iter.length >= count ? layer._iter : (layer._iter = new Int32Array(count));
  const stack = layer._stack && layer._stack.length >= count ? layer._stack : (layer._stack = new Int32Array(count));
  const checked = layer._checked && layer._checked.length >= maxEdges ? layer._checked : (layer._checked = new Uint8Array(maxEdges));
  checked.fill(0, 0, edges);
  const breakCycle = () => {
    mark.fill(0, 0, count);
    for (let root = 0; root < count; root++) {
      if (done[root] || mark[root]) continue;
      let top = 0;
      stack[top++] = root;
      mark[root] = 1;
      iter[root] = head[root];
      while (top) {
        const v = stack[top - 1];
        let e = iter[v];
        while (e >= 0 && (!live[e] || done[to[e]] || mark[to[e]] === 2)) e = next[e];
        if (e < 0) {
          mark[v] = 2;
          top--;
          continue;
        }
        iter[v] = next[e];
        const w = to[e];
        if (mark[w] === 1) {
          let dropped = false;
          let x = v;
          let edge = e;
          for (;;) {
            if (!checked[edge]) {
              checked[edge] = 1;
              const a = x;
              const b = to[edge];
              if (t3Disjoint(frames[parts[a]], frames[parts[b]], 0.1)) {
                live[edge] = 0;
                indeg[b]--;
                refined++;
                dropped = true;
                if (indeg[b] === 0) push(b);
              }
            }
            if (x === w) break;
            edge = via[x];
            let from = -1;
            for (let s = 0; s < top; s++) if (stack[s] === x) from = s > 0 ? stack[s - 1] : -1;
            if (from < 0) break;
            x = from;
          }
          return dropped ? 1 : 0;
        }
        via[w] = e;
        mark[w] = 1;
        iter[w] = head[w];
        stack[top++] = w;
      }
    }
    return -1;
  };
  while (placed < count) {
    if (size === 0) {
      let broken = 0;
      for (let tries = 0; tries < 64 && size === 0; tries++) {
        const result = breakCycle();
        if (result <= 0) break;
        broken++;
      }
      if (size) continue;
      void broken;
      void tested;
      let pick = -1;
      for (let v = 0; v < count; v++) if (!done[v] && (pick < 0 || indeg[v] < indeg[pick] || (indeg[v] === indeg[pick] && rank[v] < rank[pick]))) pick = v;
      forced++;
      if (globalThis.__t3forced) globalThis.__t3forced.push(parts[pick]);
      indeg[pick] = 0;
      push(pick);
    }
    const v = pop();
    if (done[v]) continue;
    done[v] = 1;
    out[placed++] = parts[v];
    for (let e = head[v]; e >= 0; e = next[e]) {
      if (!live[e]) continue;
      const w = to[e];
      if (done[w]) continue;
      if (--indeg[w] === 0) push(w);
    }
  }
  if (stats) {
    stats.edges = (stats.edges ?? 0) + edges;
    stats.forced = (stats.forced ?? 0) + forced;
    stats.refined = (stats.refined ?? 0) + refined;
    stats.unseparated = (stats.unseparated ?? 0) + unseparated;
    stats.solved = (stats.solved ?? 0) + solved;
  }
  return out;
}

function t3Keep(values) {
  const n = values.length;
  const tails = [];
  const tailAt = [];
  const back = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < values[i]) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = values[i];
    tailAt[lo] = i;
    back[i] = lo > 0 ? tailAt[lo - 1] : -1;
  }
  const keep = new Uint8Array(n);
  let k = tails.length ? tailAt[tails.length - 1] : -1;
  while (k >= 0) {
    keep[k] = 1;
    k = back[k];
  }
  return keep;
}

function t3Cams(scene, values) {
  const poses = t3Poses(scene.groups, values);
  const cams = poses.map((pose) => t3Camera(scene.P, pose));
  cams.world = t3Camera(scene.P, null);
  cams.poses = poses;
  return cams;
}

function t3Mount(stage, data, { onHold = null, onFrame = null, follow = null, painter = "svg" } = {}) {
  void painter;
  const layerEls = new Map([...stage.querySelectorAll("svg[data-live]")].map((svg) => [svg.dataset.live, svg]));
  const first = layerEls.values().next().value;
  const viewWidth = first && first.viewBox && first.viewBox.baseVal ? first.viewBox.baseVal.width : 0;
  const unitOf = () => {
    const width = first ? first.getBoundingClientRect().width : 0;
    return viewWidth && width ? Math.round((width / viewWidth) * 100) / 100 : 1;
  };
  let unit = unitOf();
  let scene = t3Prepare(data, { unit });
  const runs = () => scene.runs;
  const count = data.parts.length;
  const nodes = new Array(count);
  const bound = new Array(count);
  const cache = new Array(count);
  const containers = new Map();
  for (const [name, svg] of layerEls) containers.set(name, svg.querySelector(".iso-parts") ?? svg);
  for (const run of scene.runs) {
    const layer = data.layers[run.layer];
    const container = containers.get(layer.name);
    const node = container ? container.querySelector(`[data-p="${run.index}"]`) : null;
    nodes[run.index] = node;
    const map = {};
    if (node) {
      map.move = node;
      node.querySelectorAll("[data-r]").forEach((el) => (map[el.getAttribute("data-r")] = el));
    }
    bound[run.index] = run.roles.map((role) => map[role.name] ?? null);
    cache[run.index] = run.roles.map(() => ({ d: null, q: null, b: null, f: null, w: null, t: null, o: null, cx: null, cy: null }));
  }
  const frames = scene.runs.map((run) => t3Frame(run));
  const values = Object.fromEntries(data.groups.map((g) => [g.name, data.values ? data.values[g.name] ?? 0 : 0]));
  let lastPoses = null;
  let cams = null;
  const orders = scene.layers.map((layer) => Int32Array.from(layer.rest));
  const changes = [];
  const stats = { ms: 0, writes: 0, moved: 0, forced: 0, refined: 0, unseparated: 0, emitted: 0 };
  let writes = 0;
  const write = (index) => {
    const run = scene.runs[index];
    const f = frames[index];
    const els = bound[index];
    const memo = cache[index];
    for (let r = 0; r < run.roles.length; r++) {
      const el = els[r];
      if (!el) continue;
      const role = run.roles[r];
      const c = memo[r];
      const type = role.type;
      if (type === "path" || type === "face" || type === "slot") {
        const d = f.d[r];
        if (c.d !== d) {
          el.setAttribute("d", d);
          c.d = d;
          writes++;
        }
        if (type === "face") {
          const q = f.q[r];
          if (c.q !== q) {
            const band = Math.min(3, Math.floor(q / T3_Q));
            const mix = (q - T3_Q * band) / T3_Q;
            if (c.b !== band) {
              el.setAttribute("data-b", String(band));
              c.b = band;
              writes++;
            }
            if (c.f !== mix) {
              if (mix) el.style.setProperty("--f", String(mix));
              else el.style.removeProperty("--f");
              c.f = mix;
              writes++;
            }
            c.q = q;
          }
          const w = f.w[r];
          if (c.w !== w) {
            if (w < 0) el.style.removeProperty("stroke-width");
            else el.style.strokeWidth = String(w);
            c.w = w;
            writes++;
          }
        } else if (type === "slot") {
          const o = f.o[r];
          if (c.o !== o) {
            el.setAttribute("opacity", String(Math.round(o * 1000) / 1000));
            c.o = o;
            writes++;
          }
        }
      } else if (type === "xform" || type === "self" || type === "plane") {
        const t = f.t[r];
        if (c.t !== t) {
          if (t) el.setAttribute("transform", t);
          else el.removeAttribute("transform");
          c.t = t;
          writes++;
        }
        if (type === "plane") {
          const o = f.o[r];
          if (c.o !== o) {
            el.setAttribute("opacity", String(o));
            c.o = o;
            writes++;
          }
        }
      } else if (type === "dot") {
        const x = Math.round(f.cx[r] * 100) / 100;
        const y = Math.round(f.cy[r] * 100) / 100;
        const o = f.o[r];
        if (c.cx !== x) {
          el.setAttribute("cx", String(x));
          c.cx = x;
          writes++;
        }
        if (c.cy !== y) {
          el.setAttribute("cy", String(y));
          c.cy = y;
          writes++;
        }
        if (c.o !== o) {
          el.setAttribute("fill-opacity", String(o));
          c.o = o;
          writes++;
        }
      }
    }
  };
  const samePose = (a, b) => {
    if (!a || !b) return false;
    for (let i = 0; i < 9; i++) if (a.R[i] !== b.R[i]) return false;
    return a.t[0] === b.t[0] && a.t[1] === b.t[1] && a.t[2] === b.t[2];
  };
  let lastUnit = unit;
  let moved = 0;
  const render = () => {
    const t0 = performance.now();
    writes = 0;
    moved = 0;
    cams = t3Cams(scene, values);
    t3State.detail = detail;
    const poses = cams.poses;
    const fresh = lastUnit !== unit || !lastPoses;
    let emitted = 0;
    for (const run of scene.runs) {
      const g = run.group;
      const changed = fresh || (g >= 0 ? !samePose(poses[g], lastPoses[g]) : false);
      if (!changed) continue;
      t3Emit(run, g >= 0 ? cams[g] : cams.world, frames[run.index]);
      write(run.index);
      emitted++;
    }
    lastPoses = poses;
    lastUnit = unit;
    const orderStats = { forced: 0, refined: 0, unseparated: 0, edges: 0 };
    scene.layers.forEach((layer, index) => {
      const previous = orders[index];
      const order = t3Order(layer, frames, cams, previous, orderStats, scene);
      let same = true;
      for (let j = 0; j < order.length; j++)
        if (order[j] !== previous[j]) {
          same = false;
          break;
        }
      if (same) return;
      const container = containers.get(layer.name);
      const position = new Map();
      previous.forEach((global, at) => position.set(global, at));
      const keep = t3Keep(Array.from(order, (global) => position.get(global)));
      let after = null;
      const shifted = [];
      for (let j = order.length - 1; j >= 0; j--) {
        const node = nodes[order[j]];
        if (!keep[j] && node && container) {
          container.insertBefore(node, after);
          moved++;
          shifted.push(scene.runs[order[j]].name);
        }
        if (node) after = node;
      }
      orders[index] = order;
      if (shifted.length) changes.push({ layer: layer.name, moved: shifted });
    });
    stats.ms = performance.now() - t0;
    stats.writes = writes;
    stats.moved = moved;
    stats.forced = orderStats.forced;
    stats.refined = orderStats.refined;
    stats.unseparated = orderStats.unseparated;
    stats.emitted = emitted;
    t3State.detail = 1;
    if (onFrame) onFrame(controller);
    return { ...stats };
  };
  let detail = 1;
  const set = (next, options) => {
    if (options && options.detail !== undefined) {
      const value = Math.max(0, Math.min(1, options.detail));
      if (value !== detail) {
        detail = value;
        lastPoses = null;
      }
    }
    if (typeof next === "number") {
      const g = data.groups.find((group) => group.kind === "turn");
      if (g) values[g.name] = next;
    } else if (next) for (const [name, value] of Object.entries(next)) values[name] = value;
    if (follow) Object.assign(values, follow({ ...values }));
    return render();
  };
  let unwrap = new Map();
  const angleAt = (clientX, clientY, z = 0, groupName) => {
    const svg = first;
    const box = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const x = vb.x + ((clientX - box.left) / box.width) * vb.width;
    const y = vb.y + ((clientY - box.top) / box.height) * vb.height;
    const c = t3Camera(scene.P, null);
    const p = (x - c.ox) / c.k;
    const q = (y - c.oy + z * c.ce * c.k) / (c.se * c.k);
    const wx = p * c.sa + q * c.ca;
    const wy = -p * c.ca + q * c.sa;
    const group = data.groups.find((g) => g.name === groupName) ?? data.groups.find((g) => g.kind === "turn");
    const pivot = group ? group.origin : [0, 0, 0];
    const raw = (Math.atan2(wy - pivot[1], wx - pivot[0]) * 180) / Math.PI;
    const key = group ? group.name : "";
    const last = unwrap.get(key);
    let angle = raw;
    if (last !== undefined) angle = last + ((((raw - last) % 360) + 540) % 360) - 180;
    unwrap.set(key, angle);
    return angle;
  };
  const observer = typeof ResizeObserver === "function" && first
    ? new ResizeObserver(() => {
        const next = unitOf();
        if (Math.abs(next - unit) < 0.05) return;
        unit = next;
        scene = t3Prepare(data, { unit });
        render();
      })
    : null;
  if (observer) observer.observe(first);
  if (follow) Object.assign(values, follow({ ...values }));
  const controller = {
    set,
    render,
    angleAt,
    get values() {
      return { ...values };
    },
    cover: (names, options) => t3Cover(controller, names, options),
    order: (name) => {
      const index = name === undefined ? 0 : scene.layers.findIndex((layer) => layer.name === name);
      return index < 0 ? [] : Array.from(orders[index], (global) => scene.runs[global].name);
    },
    orderIndex: (name) => {
      const index = name === undefined ? 0 : scene.layers.findIndex((layer) => layer.name === name);
      return index < 0 ? null : orders[index];
    },
    events: () => changes.splice(0, changes.length),
    stats: () => ({ ...stats }),
    frames: () => frames,
    cams: () => cams,
    scene: () => scene,
    pose: (name) => t3PoseOf(scene, cams, name),
    detach: (name) => {
      const index = scene.groups.findIndex((g) => g.name === name);
      const pose = t3PoseOf(scene, cams, name);
      const o = scene.groups[index].origin;
      return { world: true, R: pose.R, t: [pose.t[0] - o[0], pose.t[1] - o[1], pose.t[2] - o[2]] };
    },
    anchor: (name, point, direction) => t3Anchor(scene, cams, name, point, direction),
    destroy: () => {
      if (observer) observer.disconnect();
      if (typeof window !== "undefined" && window.__isoTurn && window.__isoTurn.controller === controller) delete window.__isoTurn;
    },
  };
  const hold = () => {
    if (onHold) onHold();
  };
  if (typeof window !== "undefined") {
    window.__isoTurn = {
      controller,
      set(next) {
        hold();
        return set(next);
      },
      get() {
        hold();
        return { ...values };
      },
      order(name) {
        hold();
        return controller.order(name);
      },
      events() {
        hold();
        return controller.events();
      },
      stats() {
        hold();
        return controller.stats();
      },
      layers() {
        hold();
        return scene.layers.map((layer) => layer.name);
      },
    };
  }
  render();
  return controller;
}

function t3Enclose(points, edges) {
  const hull = t3Hull(points);
  const n = hull.length;
  if (n < 3) return [];
  let area = 0;
  for (let i = 0; i < n; i++) area += hull[i][0] * hull[(i + 1) % n][1] - hull[(i + 1) % n][0] * hull[i][1];
  const sign = area >= 0 ? 1 : -1;
  let lines = [];
  for (let i = 0; i < n; i++) {
    const p = hull[i];
    const q = hull[(i + 1) % n];
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const l = Math.hypot(dx, dy);
    if (l < 1e-9) continue;
    const nx = (sign * dy) / l;
    const ny = (-sign * dx) / l;
    lines.push([nx, ny, -(nx * p[0] + ny * p[1])]);
  }
  const meet = (A, B) => {
    const det = A[0] * B[1] - A[1] * B[0];
    if (Math.abs(det) < 1e-12) return null;
    return [(-A[2] * B[1] + B[2] * A[1]) / det, (-A[0] * B[2] + B[0] * A[2]) / det];
  };
  while (lines.length > edges) {
    let best = -1;
    let cost = Infinity;
    const m = lines.length;
    for (let i = 0; i < m; i++) {
      const prev = lines[(i - 1 + m) % m];
      const self = lines[i];
      const next = lines[(i + 1) % m];
      const turn = prev[0] * next[1] - prev[1] * next[0];
      if (sign * turn <= 1e-9) continue;
      const apex = meet(prev, next);
      const a = meet(prev, self);
      const b = meet(self, next);
      if (!apex || !a || !b) continue;
      const added = Math.abs((a[0] - apex[0]) * (b[1] - apex[1]) - (a[1] - apex[1]) * (b[0] - apex[0])) / 2;
      if (added < cost) {
        cost = added;
        best = i;
      }
    }
    if (best < 0) break;
    lines.splice(best, 1);
  }
  return lines;
}

function t3Cover(controller, names, { polygons = 6, edges = 10, pad = 0.3, layers = null } = {}) {
  const uCoverEdge = new Float32Array(polygons * edges * 3);
  const uCoverCount = new Float32Array(polygons);
  const scene = controller.scene();
  const frames = controller.frames();
  const sets = Array.isArray(names) ? (names.length && Array.isArray(names[0]) ? names : [names]) : [[names]];
  const candidates = [];
  const taken = new Set();
  for (const list of sets) {
    const targets = scene.runs.filter((run) => list.includes(run.name));
    if (!targets.length) continue;
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const run of targets) {
      const b = frames[run.index].box;
      box[0] = Math.min(box[0], b[0]);
      box[1] = Math.min(box[1], b[1]);
      box[2] = Math.max(box[2], b[2]);
      box[3] = Math.max(box[3], b[3]);
    }
    const home = targets[0].layer;
    scene.layers.forEach((layer, index) => {
      const order = controller.orderIndex(layer.name);
      if (!order) return;
      let from = 0;
      if (index === home) {
        for (let at = 0; at < order.length; at++) if (targets.some((run) => run.index === order[at])) from = at + 1;
      } else if (!(layers && layers.includes(layer.name)) || index < home) return;
      for (let at = from; at < order.length; at++) {
        const run = scene.runs[order[at]];
        if (list.includes(run.name) || taken.has(run.index)) continue;
        const f = frames[run.index];
        const b = f.box;
        if (!(b[0] < box[2] + pad && box[0] < b[2] + pad && b[1] < box[3] + pad && box[1] < b[3] + pad)) continue;
        if (!targets.some((target) => !t3Disjoint(frames[target.index], f, -pad))) continue;
        taken.add(run.index);
        const share = (Math.min(b[2], box[2]) - Math.max(b[0], box[0])) * (Math.min(b[3], box[3]) - Math.max(b[1], box[1]));
        candidates.push({ run, f, share });
      }
    });
  }
  candidates.sort((a, b) => b.share - a.share);
  const parts = [];
  let slot = 0;
  for (const { run, f } of candidates) {
    if (slot >= polygons) break;
    const points = [];
    if (f.quadN) for (const [buf, count] of f.quadList) for (let i = 0; i < count; i++) points.push([buf[2 * i], buf[2 * i + 1]]);
    else for (let i = 0; i < f.hullN; i++) points.push([f.hull[2 * i], f.hull[2 * i + 1]]);
    const lines = t3Enclose(points, edges);
    if (!lines.length) continue;
    lines.forEach((line, e) => {
      const at = (slot * edges + e) * 3;
      uCoverEdge[at] = line[0];
      uCoverEdge[at + 1] = line[1];
      uCoverEdge[at + 2] = line[2] - pad;
    });
    uCoverCount[slot] = lines.length;
    parts.push(run.name);
    slot++;
  }
  return { uCoverEdge, uCoverCount, dropped: Math.max(0, candidates.length - slot), parts };
}

function t3PoseOf(scene, cams, name) {
  const index = scene.groups.findIndex((g) => g.name === name);
  const cam = index >= 0 && cams ? cams[index] : null;
  return { R: cam ? Array.from(cam.R) : Array.from(T3_EYE), t: cam ? [cam.t[0], cam.t[1], cam.t[2]] : [0, 0, 0] };
}

function t3Anchor(scene, cams, name, point, direction) {
  const index = name === null || name === undefined ? -1 : scene.groups.findIndex((g) => g.name === name);
  const cam = index >= 0 ? cams[index] : cams.world;
  const o = index >= 0 ? scene.groups[index].origin : [0, 0, 0];
  const R = cam.R;
  const q = [point[0] - o[0], point[1] - o[1], point[2] - o[2]];
  const world = [R[0] * q[0] + R[1] * q[1] + R[2] * q[2] + cam.t[0], R[3] * q[0] + R[4] * q[1] + R[5] * q[2] + cam.t[1], R[6] * q[0] + R[7] * q[1] + R[8] * q[2] + cam.t[2]];
  const w = cams.world;
  const screen = [w.ox + w.m[0] * world[0] + w.m[1] * world[1] + w.m[2] * world[2], w.oy + w.m[3] * world[0] + w.m[4] * world[1] + w.m[5] * world[2]];
  const out = { world, screen };
  if (direction) out.direction = [R[0] * direction[0] + R[1] * direction[1] + R[2] * direction[2], R[3] * direction[0] + R[4] * direction[1] + R[5] * direction[2], R[6] * direction[0] + R[7] * direction[1] + R[8] * direction[2]];
  return out;
}

function t3FloorOf(scene, name, R = T3_EYE) {
  const index = scene.groups.findIndex((g) => g.name === name);
  let low = Infinity;
  for (const run of scene.runs) {
    if (run.group !== index) continue;
    const c = run.cloud;
    for (let i = 0; i < c.length; i += 3) {
      const z = R[6] * c[i] + R[7] * c[i + 1] + R[8] * c[i + 2];
      if (z < low) low = z;
    }
  }
  return low;
}

function t3Compose(A, B) {
  return Array.from(t3Mul(A, B));
}

function t3PoseUniforms(controller, group, prefix = "uGroup") {
  const scene = controller.scene();
  const index = scene.groups.findIndex((g) => g.name === group);
  const cams = controller.cams();
  const cam = index >= 0 && cams ? cams[index] : null;
  const R = cam ? cam.R : T3_EYE;
  const t = cam ? cam.t : [0, 0, 0];
  const o = index >= 0 ? scene.groups[index].origin : [0, 0, 0];
  const T = [t[0] - (R[0] * o[0] + R[1] * o[1] + R[2] * o[2]), t[1] - (R[3] * o[0] + R[4] * o[1] + R[5] * o[2]), t[2] - (R[6] * o[0] + R[7] * o[1] + R[8] * o[2])];
  return { [`${prefix}X`]: [R[0], R[3], R[6]], [`${prefix}Y`]: [R[1], R[4], R[7]], [`${prefix}Z`]: [R[2], R[5], R[8]], [`${prefix}T`]: T };
}

const T3_MAT_KEYS = ["paper", "face", "top", "shade-0", "shade-1", "shade-2", "shade-3", "lit-top", "lit-shade", "hi", "mid", "lo", "faint", "dot", "lit"];
const T3_MAT_TUBE = ["body", "shine", "shade", "edge"];

const T3_MATERIALS = {
  gold: {
    light: ["#d3bb88", "#e4d2a8", "#f1e5c6", "#a1844f", "#bc9f69", "#d3bb88", "#e4d2a8", "#f8efd8", "#dfcb9c", "#4b3920", "#86693f", "#a98c5b", "#c1a676", "#4a381f", "#2a1d0c", "#cdb07a", "#f3e8cc", "#8e7044", "#4b3920"],
    dark: ["#3f3521", "#4b3f28", "#5a4c31", "#2b2416", "#352c1b", "#3f3521", "#4b3f28", "#6a5a3b", "#4f4329", "#e6d2a3", "#8a7550", "#5e4e33", "#463a26", "#e6d2a3", "#fff3d6", "#4a3e27", "#8c7853", "#251f13", "#e6d2a3"],
  },
  chrome: {
    light: ["#8e959c", "#c3c8cd", "#f7f8f9", "#a2a9b0", "#6f767d", "#454b52", "#cacfd4", "#ffffff", "#bcc2c8", "#202428", "#585e65", "#878d94", "#a9afb5", "#2a2e33", "#000000", "#8b9299", "#fbfcfd", "#3c4248", "#202428"],
    dark: ["#2a2e32", "#4a5056", "#6e757c", "#2e3236", "#24272b", "#1a1d20", "#4a5056", "#848b92", "#3a3f44", "#dfe3e7", "#7c838a", "#4d5359", "#363b40", "#e4e7ea", "#ffffff", "#34393e", "#9aa1a8", "#16191b", "#dfe3e7"],
  },
  steel: {
    light: ["#b8bdc1", "#cdd1d4", "#e5e8ea", "#8f959b", "#a4aaaf", "#b8bdc1", "#cdd1d4", "#f1f3f4", "#c6cacd", "#2b2f33", "#6b7177", "#959ba1", "#aeb3b8", "#33373b", "#000000", "#b3b8bd", "#eef0f2", "#7d8389", "#2b2f33"],
    dark: ["#2c3034", "#34393d", "#3e4348", "#1f2225", "#25292c", "#2c3034", "#34393d", "#4a5056", "#33383c", "#d0d4d8", "#727980", "#4a5056", "#33383d", "#d8dce0", "#ffffff", "#30353a", "#5c6369", "#1a1d20", "#d0d4d8"],
  },
  gunmetal: {
    light: ["#444a51", "#50575e", "#5f666e", "#2f3439", "#393f45", "#444a51", "#50575e", "#6d757d", "#4b5258", "#0f1113", "#1d2125", "#272b30", "#30353a", "#b0b5ba", "#000000", "#3d4349", "#6e757c", "#24282c", "#0f1113"],
    dark: ["#1d2125", "#22272b", "#2a2f34", "#15181b", "#191c20", "#1d2125", "#22272b", "#323840", "#20252a", "#a9b0b7", "#5c636a", "#3a4046", "#2a2f34", "#b8bec4", "#ffffff", "#1f2327", "#3a4046", "#111316", "#a9b0b7"],
  },
  rubber: {
    light: ["#2a2b2e", "#34363a", "#46484d", "#1b1c1e", "#222326", "#2a2b2e", "#34363a", "#55575c", "#2f3134", "#070708", "#111214", "#18191b", "#1f2023", "#6a6c70", "#000000", "#27282b", "#5b5d62", "#121314", "#050506"],
    dark: ["#121213", "#161618", "#1c1c1f", "#0c0c0d", "#0f0f10", "#121213", "#161618", "#232327", "#141416", "#8c8e92", "#4a4c50", "#2c2d30", "#1f2023", "#9a9ca0", "#ffffff", "#131315", "#2b2c30", "#0a0a0b", "#8c8e92"],
  },
  brass: {
    light: ["#bd9646", "#d2ad5b", "#e6c87e", "#8a6a2c", "#a47f38", "#bd9646", "#d2ad5b", "#f0d796", "#c8a252", "#3f2e0e", "#765a24", "#9a7a3c", "#b08c46", "#3a2a0c", "#1f1606", "#b8913f", "#efd795", "#7d5f26", "#3f2e0e"],
    dark: ["#3d3017", "#49391c", "#574523", "#2a210f", "#332813", "#3d3017", "#49391c", "#66522b", "#45371b", "#e9cf8a", "#8e7438", "#5e4c25", "#44371c", "#e9cf8a", "#fff0c8", "#433419", "#8a6f36", "#21190b", "#e9cf8a"],
  },
  copper: {
    light: ["#b3633e", "#c9784f", "#df9670", "#7c4128", "#9a5132", "#b3633e", "#c9784f", "#eaa985", "#be6d46", "#3a1a0c", "#6e3820", "#925037", "#a65d3f", "#3a1a0c", "#1c0b04", "#ad5f3b", "#f0b896", "#6e3720", "#3a1a0c"],
    dark: ["#3d1f13", "#492617", "#582e1c", "#2a160d", "#331a10", "#3d1f13", "#492617", "#673722", "#432215", "#eaa985", "#8f5236", "#5f3624", "#45271a", "#eaa985", "#ffe0cc", "#42221a", "#8a4c31", "#1f0f08", "#eaa985"],
  },
  glass: {
    light: ["#e3eff2", "#eef7f9", "#f7fcfd", "#b9d2d8", "#c8dde2", "#d6e7eb", "#e3eff2", "#ffffff", "#e0eef1", "#1f4954", "#5f8e99", "#97bcc5", "#c3dbe0", "#2a5b66", "#000000", "#d3e6ea", "#ffffff", "#9fbfc7", "#1f4954"],
    dark: ["#0a1519", "#0e1c21", "#1a3640", "#08161b", "#0c1f25", "#112a32", "#17363f", "#2b5a66", "#1b4652", "#9ad7e3", "#4f8b97", "#2a5560", "#173a43", "#c8f0f8", "#ffffff", "#0e2026", "#2b5a66", "#071216", "#9ad7e3"],
  },
  pcb: {
    light: ["#cfe6d5", "#dcefe0", "#e9f6ec", "#9cc7a6", "#acd3b5", "#bddcc4", "#cfe6d5", "#f2fbf4", "#d6ecdb", "#17432a", "#4a8a5d", "#86b994", "#b5d8bd", "#7a6420", "#000000", "#c3e0ca", "#f2fbf4", "#8fbf9b", "#17432a"],
    dark: ["#0c1d12", "#0f2618", "#1b4a2a", "#0a1a0f", "#0d2415", "#12301c", "#173c23", "#2c6a3c", "#1e5230", "#8fe0a5", "#3f8f56", "#2a5c38", "#1a3d25", "#e8d17a", "#ffffff", "#0f2618", "#2c6a3c", "#071209", "#8fe0a5"],
  },
  sensor: {
    light: ["#e4dcf2", "#efe9f8", "#f7f3fc", "#c2b2e0", "#cfc1e8", "#dacfee", "#e4dcf2", "#ffffff", "#e8e1f5", "#3b2366", "#7458a8", "#a893cf", "#cdbfe6", "#3b2366", "#000000", "#dcd2ee", "#ffffff", "#ad9ad1", "#3b2366"],
    dark: ["#170d22", "#1e122d", "#3d2560", "#140b1e", "#1c1029", "#251537", "#2f1b46", "#5a3a8c", "#43296b", "#d2b8ff", "#8a68c4", "#553d80", "#33244f", "#f0e0ff", "#ffffff", "#1e122d", "#5a3a8c", "#0d0614", "#d2b8ff"],
  },
  signal: {
    light: ["#e45a52", "#ec7067", "#f48a80", "#b8352f", "#c9423b", "#d84d46", "#e45a52", "#ff9d94", "#ec7067", "#5e0f0c", "#9e2a25", "#c4524b", "#e08a83", "#5e0f0c", "#000000", "#d84d46", "#ff9d94", "#a3302a", "#5e0f0c"],
    dark: ["#3a0a0c", "#4a0d10", "#7a1a1c", "#2e0709", "#3c0a0c", "#4d0e11", "#5e1316", "#a3282b", "#7a1a1d", "#ff9a96", "#c2484a", "#7a2224", "#4d1214", "#ffd0cc", "#ffffff", "#4a0d10", "#a3282b", "#240405", "#ff9a96"],
  },
  coffee: {
    light: ["#ad784e", "#b47d51", "#b98154", "#936541", "#9d6d46", "#a7734b", "#af7a4f", "#b98154", "#a8754c", "#3b2415", "#65432a", "#855b3a", "#9b6b45", "#442b1a", "#1e0f07", "#a8754c", "#b98154", "#8a5e3d", "#3b2415"],
    dark: ["#765033", "#7d5537", "#8b5f3d", "#4d3320", "#5c3e27", "#6b482e", "#795234", "#926540", "#724d31", "#24160d", "#3c2618", "#523622", "#65442b", "#1e110a", "#9a6a44", "#724d31", "#90633f", "#4d3320", "#24160d"],
  },
  bean: {
    light: ["#66442f", "#6a4731", "#6e4a33", "#543827", "#5b3d2a", "#61412d", "#674530", "#6e4a33", "#62422d", "#1c110c", "#352318", "#4a3122", "#593c29", "#21150e", "#0d0705", "#62422d", "#6e4a33", "#4e3424", "#1c110c"],
    dark: ["#422c1e", "#472f20", "#503524", "#281a12", "#312116", "#3b271a", "#442d1f", "#553927", "#3f2a1d", "#110b07", "#1e130d", "#2b1c13", "#372419", "#0e0906", "#5a3c29", "#3f2a1d", "#533726", "#281a12", "#110b07"],
  },
  milk: {
    light: ["#eee4d5", "#f4eadb", "#f8efe0", "#d7ccbd", "#e0d5c6", "#e8decf", "#f0e6d7", "#f8efe0", "#eae0d0", "#7c695a", "#ab9c8d", "#cabdae", "#ded3c4", "#867565", "#4a3424", "#eae0d0", "#f8efe0", "#cfc3b3", "#7c695a"],
    dark: ["#bdaf9b", "#c6b8a3", "#d5c7b2", "#8d7e6d", "#9f907e", "#b0a28f", "#c0b29e", "#ded0ba", "#b9aa97", "#564739", "#766758", "#938473", "#a99b88", "#4d3d30", "#e6d8c2", "#b9aa97", "#daccb7", "#8d7e6d", "#564739"],
  },
  smoke: {
    light: ["#8f969c", "#959da3", "#9aa2a8", "#767d82", "#80878c", "#899095", "#91989e", "#9aa2a8", "#8a9197", "#272a2c", "#4c5054", "#696f73", "#7e858a", "#2e3134", "#0f1113", "#8a9197", "#9aa2a8", "#6e7478", "#272a2c"],
    dark: ["#4f565b", "#555c61", "#60686e", "#303437", "#3b4144", "#474d51", "#51585d", "#666f74", "#4c5357", "#121416", "#232629", "#34383b", "#42484c", "#0e1011", "#6c757b", "#4c5357", "#646c72", "#303437", "#121416"],
  },
  porcelain: {
    light: ["#f4f3f1", "#fbfaf8", "#ffffff", "#d9d7d3", "#e4e2de", "#eeece9", "#f6f5f3", "#ffffff", "#efeeeb", "#5d5a56", "#a19d98", "#c9c6c1", "#e2e0dc", "#6d6a66", "#000000", "#efeeeb", "#ffffff", "#cfccc7", "#5d5a56"],
    dark: ["#cfccc8", "#dad7d3", "#ecebe8", "#8e8b87", "#a7a4a0", "#bebbb7", "#d3d0cc", "#f6f5f3", "#c9c6c2", "#3b3936", "#6e6b67", "#97938f", "#b5b2ae", "#2a2826", "#ffffff", "#c9c6c2", "#f2f1ef", "#8e8b87", "#3b3936"],
  },
  lavender: {
    light: ["#d9d4e6", "#e3dfee", "#eeebf5", "#a59cc0", "#b5adcc", "#c5bed8", "#d4cee3", "#f4f1fa", "#ddd8eb", "#3b3550", "#7d7596", "#aaa3c2", "#cbc6dc", "#4a4360", "#000000", "#ccc6dc", "#f1eef8", "#a199bd", "#3b3550"],
    dark: ["#8a83a0", "#9690ac", "#c3bdd6", "#5b5470", "#6c6582", "#7e7795", "#9089a8", "#d6d0e6", "#a8a1bf", "#2c2740", "#4f4866", "#6f6888", "#7e7795", "#ffffff", "#ffffff", "#8a83a0", "#c3bdd6", "#4a4360", "#2c2740"],
  },
  knit: {
    light: ["#cfccd6", "#dad7e0", "#e6e4eb", "#a29eae", "#b2aebd", "#c1bdcb", "#cfccd8", "#ece9f0", "#d4d1dc", "#4a4656", "#8b8798", "#b1adbd", "#cac6d3", "#5a5666", "#000000", "#c6c2cf", "#e6e4eb", "#a29eae", "#4a4656"],
    dark: ["#7d7988", "#888494", "#aeaabb", "#55515f", "#64606f", "#736f7f", "#827e8f", "#c1bdcd", "#8f8b9c", "#2e2b38", "#4a4656", "#5d5969", "#6c6878", "#ffffff", "#ffffff", "#7d7988", "#aeaabb", "#4a4656", "#2e2b38"],
  },
};

function t3MaterialCss() {
  const rules = [];
  const block = (values) => T3_MAT_KEYS.map((key, i) => `--anatomy-${key}:${values[i]}`).concat(T3_MAT_TUBE.map((key, i) => `--mat-${key}:${values[T3_MAT_KEYS.length + i]}`)).join(";");
  for (const [name, { light, dark }] of Object.entries(T3_MATERIALS)) {
    rules.push(`[data-mat="${name}"]{${block(dark)}}`);
    rules.push(`.iso[data-theme="light"] [data-mat="${name}"]{${block(light)}}`);
    rules.push(`.iso[data-theme="dark"] [data-mat="${name}"]{${block(dark)}}`);
  }
  rules.push("[data-mat] .tb-body{fill:var(--mat-body)}");
  rules.push("[data-mat] .tb-shine{fill:var(--mat-shine)}");
  rules.push("[data-mat] .tb-shade{fill:var(--mat-shade)}");
  rules.push("[data-mat] .tb-edge{stroke:var(--mat-edge)}");
  return rules.join("\n");
}

function t3Css() {
  const rules = [];
  const ramp = "--tn-0:var(--anatomy-shade-0);--tn-1:var(--anatomy-shade-1);--tn-2:var(--anatomy-shade-2);--tn-3:var(--anatomy-shade-3);--tn-4:var(--anatomy-top)";
  rules.push(`.iso-live{${ramp}}`);
  rules.push(`.iso-live [data-mat]{${ramp}}`);
  rules.push(".iso-live [data-lit]{--tn-0:var(--anatomy-lit-shade);--tn-1:var(--anatomy-lit-shade);--tn-2:var(--anatomy-lit-shade);--tn-3:var(--anatomy-lit-shade);--tn-4:var(--anatomy-lit-top)}");
  const colour = "color-mix(in srgb,var(--ta) calc(100% - var(--f,0) * 100%),var(--tb))";
  rules.push(`.iso-tn{stroke-width:.4;stroke-linejoin:round;--ta:var(--tn-0);--tb:var(--tn-1);fill:${colour};stroke:${colour}}`);
  for (let i = 1; i < 4; i++) rules.push(`.iso-tn[data-b="${i}"]{--ta:var(--tn-${i});--tb:var(--tn-${i + 1})}`);
  rules.push(t3MaterialCss());
  for (const hue of ["red", "green", "blue"]) rules.push(`.tb[data-hue="${hue}"]{--tb-ink:var(--anatomy-${hue})}`);
  rules.push(".tb[data-hue] .tb-body{fill:color-mix(in srgb,var(--tb-ink) 54%,var(--anatomy-shade-2))}");
  rules.push(".tb[data-hue] .tb-shine{fill:color-mix(in srgb,var(--tb-ink) 16%,var(--anatomy-top))}");
  rules.push(".tb[data-hue] .tb-shade{fill:color-mix(in srgb,var(--tb-ink) 30%,var(--anatomy-hi))}");
  rules.push(".tb[data-hue] .tb-edge{stroke:color-mix(in srgb,var(--tb-ink) 38%,var(--anatomy-hi))}");
  rules.push(".tb[data-hue][data-mat] .tb-body{fill:color-mix(in srgb,var(--tb-ink) 62%,var(--mat-body))}");
  rules.push(".tb[data-hue][data-mat] .tb-shine{fill:color-mix(in srgb,var(--tb-ink) 22%,var(--mat-shine))}");
  rules.push(".tb[data-hue][data-mat] .tb-shade{fill:color-mix(in srgb,var(--tb-ink) 46%,var(--mat-shade))}");
  rules.push(".tb[data-hue][data-mat] .tb-edge{stroke:color-mix(in srgb,var(--tb-ink) 30%,var(--mat-edge))}");
  rules.push(".iso-turn{position:relative}");
  rules.push(".iso-turn>.iso-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}");
  return rules.join("\n");
}

const TURN = { materials: Object.keys(T3_MATERIALS), materialCss: t3MaterialCss, rotation: (axis, degrees) => Array.from(t3Rot(axis, degrees)), quat: (q) => Array.from(t3Quat(q)), compose: t3Compose, floorOf: t3FloorOf, anchor: t3Anchor, camera: t3Camera, poses: t3PosesMap, prepare: t3Prepare, emit: t3Emit, order: t3Order, mount: t3Mount, cover: t3Cover, poseUniforms: t3PoseUniforms, css: t3Css, frame: t3Frame, cams: t3Cams, gjk: t3Gjk, hintsOf: (ri, ci, rj, cj, world) => Object.assign([...ri.axes.map((axis) => [axis, ci]), ...rj.axes.map((axis) => [axis, cj]), [[0, 0, 1], world]], { centroids: [ri.centroid, rj.centroid] }), disjoint: t3Disjoint, levels: T3_LEVELS, q: T3_Q, exact: (on) => { t3State.exact = Boolean(on); } };
const TURN_CSS = t3Css();

const DATA = {"turn":{"P":{"origin":[320,320],"scale":0.8584,"azimuth":45,"elevation":30},"groups":[{"name":"root","parent":-1,"kind":"free","origin":[0,0,150],"range":null,"upright":false,"loose":true},{"name":"scope","parent":0,"kind":"slide","origin":[0,0,150],"direction":[0,0,-1],"travel":120,"range":[0,120],"upright":false,"loose":true},{"name":"scroll","parent":0,"kind":"slide","origin":[0,0,150],"direction":[0,0,-1],"travel":92,"range":[0,92],"upright":false,"loose":true},{"name":"draggable","parent":0,"kind":"slide","origin":[0,0,150],"direction":[0,0,-1],"travel":64,"range":[0,64],"upright":false,"loose":true},{"name":"draggable.pod0","parent":3,"kind":"slide","origin":[0,0,150],"direction":[0.9239,0.3827,0],"travel":22,"range":[0,22],"upright":false,"loose":true},{"name":"draggable.pod1","parent":3,"kind":"slide","origin":[0,0,150],"direction":[0.3827,0.9239,0],"travel":22,"range":[0,22],"upright":false,"loose":true},{"name":"draggable.pod2","parent":3,"kind":"slide","origin":[0,0,150],"direction":[-0.3827,0.9239,0],"travel":22,"range":[0,22],"upright":false,"loose":true},{"name":"draggable.pod3","parent":3,"kind":"slide","origin":[0,0,150],"direction":[-0.9239,0.3827,0],"travel":22,"range":[0,22],"upright":false,"loose":true},{"name":"draggable.pod4","parent":3,"kind":"slide","origin":[0,0,150],"direction":[-0.9239,-0.3827,0],"travel":22,"range":[0,22],"upright":false,"loose":true},{"name":"draggable.pod5","parent":3,"kind":"slide","origin":[0,0,150],"direction":[-0.3827,-0.9239,0],"travel":22,"range":[0,22],"upright":false,"loose":true},{"name":"draggable.pod6","parent":3,"kind":"slide","origin":[0,0,150],"direction":[0.3827,-0.9239,0],"travel":22,"range":[0,22],"upright":false,"loose":true},{"name":"draggable.pod7","parent":3,"kind":"slide","origin":[0,0,150],"direction":[0.9239,-0.3827,0],"travel":22,"range":[0,22],"upright":false,"loose":true},{"name":"pop.easings","parent":0,"kind":"slide","origin":[0,0,150],"direction":[-1,0,0],"travel":150,"range":[0,150],"upright":false,"loose":true},{"name":"easings","parent":12,"kind":"slide","origin":[0,0,150],"direction":[0,0,-1],"travel":40,"range":[0,40],"upright":false,"loose":true},{"name":"pop.timer","parent":0,"kind":"slide","origin":[0,0,150],"direction":[1,0,0],"travel":150,"range":[0,150],"upright":false,"loose":true},{"name":"timer","parent":14,"kind":"slide","origin":[0,0,150],"direction":[0,0,-1],"travel":22,"range":[0,22],"upright":false,"loose":true},{"name":"animation","parent":0,"kind":"slide","origin":[0,0,150],"direction":[0,0,1],"travel":0,"range":[0,0],"upright":false,"loose":true},{"name":"animation.pod0","parent":16,"kind":"slide","origin":[0,0,150],"direction":[0.7071,0.7071,0],"travel":36,"range":[0,36],"upright":false,"loose":true},{"name":"animation.pod1","parent":16,"kind":"slide","origin":[0,0,150],"direction":[-0.7071,0.7071,0],"travel":36,"range":[0,36],"upright":false,"loose":true},{"name":"animation.pod2","parent":16,"kind":"slide","origin":[0,0,150],"direction":[-0.7071,-0.7071,0],"travel":36,"range":[0,36],"upright":false,"loose":true},{"name":"animation.pod3","parent":16,"kind":"slide","origin":[0,0,150],"direction":[0.7071,-0.7071,0],"travel":36,"range":[0,36],"upright":false,"loose":true},{"name":"pop.spring","parent":0,"kind":"slide","origin":[0,0,150],"direction":[-1,0,0],"travel":150,"range":[0,150],"upright":false,"loose":true},{"name":"spring","parent":21,"kind":"slide","origin":[0,0,150],"direction":[0,0,1],"travel":24,"range":[0,24],"upright":false,"loose":true},{"name":"pop.svg","parent":0,"kind":"slide","origin":[0,0,150],"direction":[1,0,0],"travel":150,"range":[0,150],"upright":false,"loose":true},{"name":"svg","parent":23,"kind":"slide","origin":[0,0,150],"direction":[0,0,1],"travel":40,"range":[0,40],"upright":false,"loose":true},{"name":"pop.stagger","parent":0,"kind":"slide","origin":[0,0,150],"direction":[-1,0,0],"travel":150,"range":[0,150],"upright":false,"loose":true},{"name":"stagger","parent":25,"kind":"slide","origin":[0,0,150],"direction":[0,0,1],"travel":58,"range":[0,58],"upright":false,"loose":true},{"name":"pop.timeline","parent":0,"kind":"slide","origin":[0,0,150],"direction":[1,0,0],"travel":150,"range":[0,150],"upright":false,"loose":true},{"name":"timeline","parent":27,"kind":"slide","origin":[0,0,150],"direction":[0,0,1],"travel":78,"range":[0,78],"upright":false,"loose":true},{"name":"waapi","parent":0,"kind":"slide","origin":[0,0,150],"direction":[0,0,1],"travel":100,"range":[0,100],"upright":false,"loose":true},{"name":"waapi.glass","parent":29,"kind":"slide","origin":[0,0,150],"direction":[0,0,1],"travel":140,"range":[0,140],"upright":false,"loose":true}],"layers":[{"name":"live","parts":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91],"rest":[15,13,0,1,11,17,2,14,12,36,10,16,46,45,37,35,3,18,8,19,9,58,77,4,6,20,26,25,27,28,24,78,76,38,34,75,79,22,7,5,80,74,47,48,43,44,23,21,29,30,39,81,40,49,50,51,52,82,53,59,57,31,33,54,73,72,83,71,32,60,41,42,56,61,86,84,70,85,87,88,89,90,69,91,62,68,55,63,67,64,66,65]}],"parts":[{"name":"scope.flange","kind":"round","group":1,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":0,"s1":6,"r0":72,"r1":72,"ends":["flat","flat"]},"details":{"seams":[3]},"planes":[{"o":[0,0,-150.02],"u":[1,0,0],"v":[0,1,0],"n":[0,0,-1],"fade":[0.04,0.3]}],"dots":[{"p":[66,0,-144],"n":[0,0,1],"size":1.1,"tone":"lo","fade":[0.04,0.42]},{"p":[57.158,33,-144],"n":[0,0,1],"size":1.1,"tone":"lo","fade":[0.04,0.42]},{"p":[33,57.158,-144],"n":[0,0,1],"size":1.1,"tone":"lo","fade":[0.04,0.42]},{"p":[0,66,-144],"n":[0,0,1],"size":1.1,"tone":"lo","fade":[0.04,0.42]},{"p":[-33,57.158,-144],"n":[0,0,1],"size":1.1,"tone":"lo","fade":[0.04,0.42]},{"p":[-57.158,33,-144],"n":[0,0,1],"size":1.1,"tone":"lo","fade":[0.04,0.42]},{"p":[-66,0,-144],"n":[0,0,1],"size":1.1,"tone":"lo","fade":[0.04,0.42]},{"p":[-57.158,-33,-144],"n":[0,0,1],"size":1.1,"tone":"lo","fade":[0.04,0.42]},{"p":[-33,-57.158,-144],"n":[0,0,1],"size":1.1,"tone":"lo","fade":[0.04,0.42]},{"p":[0,-66,-144],"n":[0,0,1],"size":1.1,"tone":"lo","fade":[0.04,0.42]},{"p":[33,-57.158,-144],"n":[0,0,1],"size":1.1,"tone":"lo","fade":[0.04,0.42]},{"p":[57.158,-33,-144],"n":[0,0,1],"size":1.1,"tone":"lo","fade":[0.04,0.42]}]},{"name":"scope.lip","kind":"round","group":1,"layer":0,"crease":"lo","mat":"steel","spec":{"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":6,"s1":10,"r0":62,"r1":58,"ends":["flat","flat"]}},{"name":"scroll.ring","kind":"round","group":2,"layer":0,"crease":"lo","mat":"steel","spec":{"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":12,"s1":30,"r0":56,"r1":56,"ends":["flat","flat"],"slots":{"bevel":0,"ribs":29}},"details":{"ribs":{"s0":13,"s1":29,"count":120,"fade":[0.08,0.55],"seams":true,"tone":"lo"}}},{"name":"draggable.core","kind":"round","group":3,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":32,"s1":80,"r0":30,"r1":30,"ends":["flat","flat"]},"details":{"seams":[42,70]}},{"name":"draggable.pod0","kind":"prism","group":4,"layer":0,"crease":"lo","mat":"steel","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[33.391,3.007,48.173,9.13,50.338,14.356,45.746,25.443,40.519,27.608,25.737,21.485],"s0":36,"s1":76,"bevel":1.4,"slots":{"bevel":4,"ribs":0}}},{"name":"draggable.pin0","kind":"round","group":4,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[0,0,-94],"a":[0.924,0.383,0],"u":[0,0,1],"v":[0.383,-0.924,0]},"s0":52,"s1":57,"r0":3.4,"r1":3.4,"ends":["flat","flat"]}},{"name":"draggable.pod1","kind":"prism","group":5,"layer":0,"crease":"lo","mat":"steel","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[21.485,25.737,27.608,40.519,25.443,45.746,14.356,50.338,9.13,48.173,3.007,33.391],"s0":36,"s1":76,"bevel":1.4,"slots":{"bevel":6,"ribs":0}}},{"name":"draggable.pin1","kind":"round","group":5,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[0,0,-94],"a":[0.383,0.924,0],"u":[0,0,1],"v":[0.924,-0.383,0]},"s0":52,"s1":57,"r0":3.4,"r1":3.4,"ends":["flat","flat"]}},{"name":"draggable.pod2","kind":"prism","group":6,"layer":0,"crease":"lo","mat":"steel","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[-3.007,33.391,-9.13,48.173,-14.356,50.338,-25.443,45.746,-27.608,40.519,-21.485,25.737],"s0":36,"s1":76,"bevel":1.4,"slots":{"bevel":6,"ribs":0}}},{"name":"draggable.pin2","kind":"round","group":6,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[0,0,-94],"a":[-0.383,0.924,0],"u":[0,0,1],"v":[0.924,0.383,0]},"s0":52,"s1":57,"r0":3.4,"r1":3.4,"ends":["flat","flat"]}},{"name":"draggable.pod3","kind":"prism","group":7,"layer":0,"crease":"lo","mat":"steel","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[-25.737,21.485,-40.519,27.608,-45.746,25.443,-50.338,14.356,-48.173,9.13,-33.391,3.007],"s0":36,"s1":76,"bevel":1.4,"slots":{"bevel":5,"ribs":0}}},{"name":"draggable.pin3","kind":"round","group":7,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[0,0,-94],"a":[-0.924,0.383,0],"u":[0,0,1],"v":[0.383,0.924,0]},"s0":52,"s1":57,"r0":3.4,"r1":3.4,"ends":["flat","flat"]}},{"name":"draggable.pod4","kind":"prism","group":8,"layer":0,"crease":"lo","mat":"steel","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[-33.391,-3.007,-48.173,-9.13,-50.338,-14.356,-45.746,-25.443,-40.519,-27.608,-25.737,-21.485],"s0":36,"s1":76,"bevel":1.4,"slots":{"bevel":5,"ribs":0}}},{"name":"draggable.pin4","kind":"round","group":8,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[0,0,-94],"a":[-0.924,-0.383,0],"u":[0,0,1],"v":[-0.383,0.924,0]},"s0":52,"s1":57,"r0":3.4,"r1":3.4,"ends":["flat","flat"]}},{"name":"draggable.pod5","kind":"prism","group":9,"layer":0,"crease":"lo","mat":"steel","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[-21.485,-25.737,-27.608,-40.519,-25.443,-45.746,-14.356,-50.338,-9.13,-48.173,-3.007,-33.391],"s0":36,"s1":76,"bevel":1.4,"slots":{"bevel":4,"ribs":0}}},{"name":"draggable.pin5","kind":"round","group":9,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[0,0,-94],"a":[-0.383,-0.924,0],"u":[0,0,1],"v":[-0.924,0.383,0]},"s0":52,"s1":57,"r0":3.4,"r1":3.4,"ends":["flat","flat"]}},{"name":"draggable.pod6","kind":"prism","group":10,"layer":0,"crease":"lo","mat":"steel","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[3.007,-33.391,9.13,-48.173,14.356,-50.338,25.443,-45.746,27.608,-40.519,21.485,-25.737],"s0":36,"s1":76,"bevel":1.4,"slots":{"bevel":4,"ribs":0}}},{"name":"draggable.pin6","kind":"round","group":10,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[0,0,-94],"a":[0.383,-0.924,0],"u":[0,0,1],"v":[-0.924,-0.383,0]},"s0":52,"s1":57,"r0":3.4,"r1":3.4,"ends":["flat","flat"]}},{"name":"draggable.pod7","kind":"prism","group":11,"layer":0,"crease":"lo","mat":"steel","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[25.737,-21.485,40.519,-27.608,45.746,-25.443,50.338,-14.356,48.173,-9.13,33.391,-3.007],"s0":36,"s1":76,"bevel":1.4,"slots":{"bevel":5,"ribs":0}}},{"name":"draggable.pin7","kind":"round","group":11,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[0,0,-94],"a":[0.924,-0.383,0],"u":[0,0,1],"v":[-0.383,-0.924,0]},"s0":52,"s1":57,"r0":3.4,"r1":3.4,"ends":["flat","flat"]}},{"name":"easings.band.a","kind":"round","group":13,"layer":0,"crease":"lo","mat":"steel","spec":{"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":82,"s1":89,"r0":50,"r1":50,"ends":["flat","flat"]},"details":{"seams":[85.5]}},{"name":"easings.band.b","kind":"round","group":13,"layer":0,"crease":"lo","mat":"steel","spec":{"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":91,"s1":100,"r0":48,"r1":48,"ends":["flat","flat"],"slots":{"bevel":0,"ribs":26}},"details":{"ribs":{"s0":92,"s1":99,"count":90,"fade":[0.08,0.55],"seams":true,"tone":"faint"}}},{"name":"easings.cam0","kind":"prism","group":13,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[26,-7,48.5,-7,51,-4.5,51,4.5,48.5,7,26,7],"s0":89,"s1":91,"bevel":0}},{"name":"easings.cam1","kind":"prism","group":13,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[19.062,19.017,30.312,38.502,29.397,41.917,21.603,46.417,18.188,45.502,6.938,26.017],"s0":89,"s1":91,"bevel":0}},{"name":"easings.cam2","kind":"prism","group":13,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[-6.938,26.017,-18.188,45.502,-21.603,46.417,-29.397,41.917,-30.312,38.502,-19.062,19.017],"s0":89,"s1":91,"bevel":0}},{"name":"easings.cam3","kind":"prism","group":13,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[-26,7,-48.5,7,-51,4.5,-51,-4.5,-48.5,-7,-26,-7],"s0":89,"s1":91,"bevel":0}},{"name":"easings.cam4","kind":"prism","group":13,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[-19.062,-19.017,-30.312,-38.502,-29.397,-41.917,-21.603,-46.417,-18.188,-45.502,-6.938,-26.017],"s0":89,"s1":91,"bevel":0}},{"name":"easings.cam5","kind":"prism","group":13,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[6.938,-26.017,18.188,-45.502,21.603,-46.417,29.397,-41.917,30.312,-38.502,19.062,-19.017],"s0":89,"s1":91,"bevel":0}},{"name":"easings.hub","kind":"round","group":13,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":89,"s1":91,"r0":24,"r1":24,"ends":["flat","flat"]}},{"name":"timer.ring","kind":"round","group":15,"layer":0,"crease":"lo","mat":"steel","spec":{"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":102,"s1":114,"r0":54,"r1":54,"ends":["flat","flat"]},"details":{"seams":[108]},"dots":[{"p":[48,0,-36],"n":[0,0,1],"size":1.2,"tone":"lo","fade":[0.04,0.42]},{"p":[46.364,12.423,-36],"n":[0,0,1],"size":1.2,"tone":"lo","fade":[0.04,0.42]},{"p":[41.569,24,-36],"n":[0,0,1],"size":1.2,"tone":"lo","fade":[0.04,0.42]},{"p":[33.941,33.941,-36],"n":[0,0,1],"size":1.2,"tone":"lo","fade":[0.04,0.42]},{"p":[24,41.569,-36],"n":[0,0,1],"size":1.2,"tone":"lo","fade":[0.04,0.42]},{"p":[12.423,46.364,-36],"n":[0,0,1],"size":1.2,"tone":"lo","fade":[0.04,0.42]},{"p":[0,48,-36],"n":[0,0,1],"size":1.2,"tone":"lo","fade":[0.04,0.42]},{"p":[-12.423,46.364,-36],"n":[0,0,1],"size":1.2,"tone":"lo","fade":[0.04,0.42]},{"p":[-24,41.569,-36],"n":[0,0,1],"size":1.2,"tone":"lo","fade":[0.04,0.42]},{"p":[-33.941,33.941,-36],"n":[0,0,1],"size":1.2,"tone":"lo","fade":[0.04,0.42]},{"p":[-41.569,24,-36],"n":[0,0,1],"size":1.2,"tone":"lo","fade":[0.04,0.42]},{"p":[-46.364,12.423,-36],"n":[0,0,1],"size":1.2,"tone":"lo","fade":[0.04,0.42]},{"p":[-48,0,-36],"n":[0,0,1],"size":1.2,"tone":"lo","fade":[0.04,0.42]},{"p":[-46.364,-12.423,-36],"n":[0,0,1],"size":1.2,"tone":"lo","fade":[0.04,0.42]},{"p":[-41.569,-24,-36],"n":[0,0,1],"size":1.2,"tone":"lo","fade":[0.04,0.42]},{"p":[-33.941,-33.941,-36],"n":[0,0,1],"size":1.2,"tone":"lo","fade":[0.04,0.42]},{"p":[-24,-41.569,-36],"n":[0,0,1],"size":1.2,"tone":"lo","fade":[0.04,0.42]},{"p":[-12.423,-46.364,-36],"n":[0,0,1],"size":1.2,"tone":"lo","fade":[0.04,0.42]},{"p":[0,-48,-36],"n":[0,0,1],"size":1.2,"tone":"lo","fade":[0.04,0.42]},{"p":[12.423,-46.364,-36],"n":[0,0,1],"size":1.2,"tone":"lo","fade":[0.04,0.42]},{"p":[24,-41.569,-36],"n":[0,0,1],"size":1.2,"tone":"lo","fade":[0.04,0.42]},{"p":[33.941,-33.941,-36],"n":[0,0,1],"size":1.2,"tone":"lo","fade":[0.04,0.42]},{"p":[41.569,-24,-36],"n":[0,0,1],"size":1.2,"tone":"lo","fade":[0.04,0.42]},{"p":[46.364,-12.423,-36],"n":[0,0,1],"size":1.2,"tone":"lo","fade":[0.04,0.42]}]},{"name":"animation.collar","kind":"prism","group":16,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[59.128,24.492,24.492,59.128,-24.492,59.128,-59.128,24.492,-59.128,-24.492,-24.492,-59.128,24.492,-59.128,59.128,-24.492],"s0":116,"s1":128,"bevel":1.6,"slots":{"bevel":6,"ribs":0}}},{"name":"animation.bolt0","kind":"round","group":16,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[61.5,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":128,"s1":130.5,"r0":1.6,"r1":1.6,"ends":["flat","flat"]}},{"name":"animation.bolt1","kind":"round","group":16,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[43.487,43.487,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":128,"s1":130.5,"r0":1.6,"r1":1.6,"ends":["flat","flat"]}},{"name":"animation.bolt2","kind":"round","group":16,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[0,61.5,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":128,"s1":130.5,"r0":1.6,"r1":1.6,"ends":["flat","flat"]}},{"name":"animation.bolt3","kind":"round","group":16,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[-43.487,43.487,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":128,"s1":130.5,"r0":1.6,"r1":1.6,"ends":["flat","flat"]}},{"name":"animation.bolt4","kind":"round","group":16,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[-61.5,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":128,"s1":130.5,"r0":1.6,"r1":1.6,"ends":["flat","flat"]}},{"name":"animation.bolt5","kind":"round","group":16,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[-43.487,-43.487,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":128,"s1":130.5,"r0":1.6,"r1":1.6,"ends":["flat","flat"]}},{"name":"animation.bolt6","kind":"round","group":16,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[0,-61.5,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":128,"s1":130.5,"r0":1.6,"r1":1.6,"ends":["flat","flat"]}},{"name":"animation.bolt7","kind":"round","group":16,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[43.487,-43.487,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":128,"s1":130.5,"r0":1.6,"r1":1.6,"ends":["flat","flat"]}},{"name":"animation.drum","kind":"round","group":16,"layer":0,"crease":"lo","mat":"steel","spec":{"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":128,"s1":178,"r0":58,"r1":58,"ends":["flat","flat"]},"details":{"seams":[138,168]},"planes":[{"o":[0,58.2,-13],"u":[1,0,0],"v":[0,0,-1],"n":[0,1,0],"fade":[0.04,0.3]}]},{"name":"animation.cap","kind":"round","group":16,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":178,"s1":186,"r0":58,"r1":54,"ends":["flat","flat"]}},{"name":"animation.pod0","kind":"round","group":17,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"F":{"o":[0,0,5],"a":[0.707,0.707,0],"u":[0,0,1],"v":[0.707,-0.707,0]},"s0":59.5,"s1":68,"r0":11,"r1":11,"ends":["flat","flat"]},"details":{"seams":[63]}},{"name":"animation.pod0.cap","kind":"round","group":17,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[0,0,5],"a":[0.707,0.707,0],"u":[0,0,1],"v":[0.707,-0.707,0]},"s0":68,"s1":71,"r0":7,"r1":7,"ends":["flat","flat"]}},{"name":"animation.pod1","kind":"round","group":18,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"F":{"o":[0,0,5],"a":[-0.707,0.707,0],"u":[0,0,1],"v":[0.707,0.707,0]},"s0":59.5,"s1":68,"r0":11,"r1":11,"ends":["flat","flat"]},"details":{"seams":[63]}},{"name":"animation.pod1.cap","kind":"round","group":18,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[0,0,5],"a":[-0.707,0.707,0],"u":[0,0,1],"v":[0.707,0.707,0]},"s0":68,"s1":71,"r0":7,"r1":7,"ends":["flat","flat"]}},{"name":"animation.pod2","kind":"round","group":19,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"F":{"o":[0,0,5],"a":[-0.707,-0.707,0],"u":[0,0,1],"v":[-0.707,0.707,0]},"s0":59.5,"s1":68,"r0":11,"r1":11,"ends":["flat","flat"]},"details":{"seams":[63]}},{"name":"animation.pod2.cap","kind":"round","group":19,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[0,0,5],"a":[-0.707,-0.707,0],"u":[0,0,1],"v":[-0.707,0.707,0]},"s0":68,"s1":71,"r0":7,"r1":7,"ends":["flat","flat"]}},{"name":"animation.pod3","kind":"round","group":20,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"F":{"o":[0,0,5],"a":[0.707,-0.707,0],"u":[0,0,1],"v":[-0.707,-0.707,0]},"s0":59.5,"s1":68,"r0":11,"r1":11,"ends":["flat","flat"]},"details":{"seams":[63]}},{"name":"animation.pod3.cap","kind":"round","group":20,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[0,0,5],"a":[0.707,-0.707,0],"u":[0,0,1],"v":[-0.707,-0.707,0]},"s0":68,"s1":71,"r0":7,"r1":7,"ends":["flat","flat"]}},{"name":"spring.coil0","kind":"round","group":22,"layer":0,"crease":"lo","mat":"copper","spec":{"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":188,"s1":191,"r0":50,"r1":50,"ends":["flat","flat"],"slots":{"bevel":0,"ribs":15}},"details":{"ribs":{"s0":188.4,"s1":190.6,"count":40,"fade":[0.08,0.55],"tone":"lo"}}},{"name":"spring.coil1","kind":"round","group":22,"layer":0,"crease":"lo","mat":"copper","spec":{"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":191.6,"s1":194.6,"r0":48,"r1":48,"ends":["flat","flat"],"slots":{"bevel":0,"ribs":15}},"details":{"ribs":{"s0":192,"s1":194.2,"count":40,"fade":[0.08,0.55],"tone":"lo"}}},{"name":"spring.coil2","kind":"round","group":22,"layer":0,"crease":"lo","mat":"copper","spec":{"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":195.2,"s1":198.2,"r0":50,"r1":50,"ends":["flat","flat"],"slots":{"bevel":0,"ribs":15}},"details":{"ribs":{"s0":195.6,"s1":197.8,"count":40,"fade":[0.08,0.55],"tone":"lo"}}},{"name":"spring.coil3","kind":"round","group":22,"layer":0,"crease":"lo","mat":"copper","spec":{"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":198.8,"s1":201.8,"r0":48,"r1":48,"ends":["flat","flat"],"slots":{"bevel":0,"ribs":15}},"details":{"ribs":{"s0":199.2,"s1":201.4,"count":40,"fade":[0.08,0.55],"tone":"lo"}}},{"name":"spring.coil4","kind":"round","group":22,"layer":0,"crease":"lo","mat":"copper","spec":{"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":202.4,"s1":205.4,"r0":50,"r1":50,"ends":["flat","flat"],"slots":{"bevel":0,"ribs":15}},"details":{"ribs":{"s0":202.8,"s1":205,"count":40,"fade":[0.08,0.55],"tone":"lo"}}},{"name":"svg.band","kind":"round","group":24,"layer":0,"crease":"lo","mat":"steel","spec":{"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":208,"s1":218,"r0":52,"r1":52,"ends":["flat","flat"]},"dots":[{"p":[46,0,68],"n":[0,0,1],"size":1.4,"tone":"lo","fade":[0.04,0.42]},{"p":[23,39.837,68],"n":[0,0,1],"size":1.4,"tone":"lo","fade":[0.04,0.42]},{"p":[-23,39.837,68],"n":[0,0,1],"size":1.4,"tone":"lo","fade":[0.04,0.42]},{"p":[-46,0,68],"n":[0,0,1],"size":1.4,"tone":"lo","fade":[0.04,0.42]},{"p":[-23,-39.837,68],"n":[0,0,1],"size":1.4,"tone":"lo","fade":[0.04,0.42]},{"p":[23,-39.837,68],"n":[0,0,1],"size":1.4,"tone":"lo","fade":[0.04,0.42]}]},{"name":"svg.clip0","kind":"round","group":24,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[0,0,63],"a":[0.866,0.5,0],"u":[0,0,1],"v":[0.5,-0.866,0]},"s0":52.5,"s1":58,"r0":3.6,"r1":3.6,"ends":["flat","flat"]}},{"name":"svg.clip1","kind":"round","group":24,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[0,0,63],"a":[0,1,0],"u":[0,0,1],"v":[1,0,0]},"s0":52.5,"s1":58,"r0":3.6,"r1":3.6,"ends":["flat","flat"]}},{"name":"svg.clip2","kind":"round","group":24,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[0,0,63],"a":[-0.866,0.5,0],"u":[0,0,1],"v":[0.5,0.866,0]},"s0":52.5,"s1":58,"r0":3.6,"r1":3.6,"ends":["flat","flat"]}},{"name":"svg.clip3","kind":"round","group":24,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[0,0,63],"a":[-0.866,-0.5,0],"u":[0,0,1],"v":[-0.5,0.866,0]},"s0":52.5,"s1":58,"r0":3.6,"r1":3.6,"ends":["flat","flat"]}},{"name":"svg.clip4","kind":"round","group":24,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[0,0,63],"a":[0,-1,0],"u":[0,0,1],"v":[-1,0,0]},"s0":52.5,"s1":58,"r0":3.6,"r1":3.6,"ends":["flat","flat"]}},{"name":"svg.clip5","kind":"round","group":24,"layer":0,"tone":"mid","crease":"lo","mat":"chrome","spec":{"F":{"o":[0,0,63],"a":[0.866,-0.5,0],"u":[0,0,1],"v":[-0.5,-0.866,0]},"s0":52.5,"s1":58,"r0":3.6,"r1":3.6,"ends":["flat","flat"]}},{"name":"stagger.gear","kind":"round","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":220,"s1":234,"r0":54,"r1":54,"ends":["flat","flat"]},"details":{"seams":[227]}},{"name":"stagger.tooth0","kind":"prism","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[55,-3.2,60.5,-3.2,62,-1.7,62,1.7,60.5,3.2,55,3.2],"s0":221,"s1":233,"bevel":0}},{"name":"stagger.tooth1","kind":"prism","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[53.954,11.144,59.267,12.568,60.327,14.405,59.447,17.689,57.61,18.75,52.298,17.326],"s0":221,"s1":233,"bevel":0}},{"name":"stagger.tooth2","kind":"prism","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[49.231,24.729,53.995,27.479,54.544,29.528,52.844,32.472,50.795,33.021,46.031,30.271],"s0":221,"s1":233,"bevel":0}},{"name":"stagger.tooth3","kind":"prism","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[41.154,36.628,45.043,40.517,45.043,42.639,42.639,45.043,40.517,45.043,36.628,41.154],"s0":221,"s1":233,"bevel":0}},{"name":"stagger.tooth4","kind":"prism","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[30.271,46.031,33.021,50.795,32.472,52.844,29.528,54.544,27.479,53.995,24.729,49.231],"s0":221,"s1":233,"bevel":0}},{"name":"stagger.tooth5","kind":"prism","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[17.326,52.298,18.75,57.61,17.689,59.447,14.405,60.327,12.568,59.267,11.144,53.954],"s0":221,"s1":233,"bevel":0}},{"name":"stagger.tooth6","kind":"prism","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[3.2,55,3.2,60.5,1.7,62,-1.7,62,-3.2,60.5,-3.2,55],"s0":221,"s1":233,"bevel":0}},{"name":"stagger.tooth7","kind":"prism","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[-11.144,53.954,-12.568,59.267,-14.405,60.327,-17.689,59.447,-18.75,57.61,-17.326,52.298],"s0":221,"s1":233,"bevel":0}},{"name":"stagger.tooth8","kind":"prism","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[-24.729,49.231,-27.479,53.995,-29.528,54.544,-32.472,52.844,-33.021,50.795,-30.271,46.031],"s0":221,"s1":233,"bevel":0}},{"name":"stagger.tooth9","kind":"prism","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[-36.628,41.154,-40.517,45.043,-42.639,45.043,-45.043,42.639,-45.043,40.517,-41.154,36.628],"s0":221,"s1":233,"bevel":0}},{"name":"stagger.tooth10","kind":"prism","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[-46.031,30.271,-50.795,33.021,-52.844,32.472,-54.544,29.528,-53.995,27.479,-49.231,24.729],"s0":221,"s1":233,"bevel":0}},{"name":"stagger.tooth11","kind":"prism","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[-52.298,17.326,-57.61,18.75,-59.447,17.689,-60.327,14.405,-59.267,12.568,-53.954,11.144],"s0":221,"s1":233,"bevel":0}},{"name":"stagger.tooth12","kind":"prism","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[-55,3.2,-60.5,3.2,-62,1.7,-62,-1.7,-60.5,-3.2,-55,-3.2],"s0":221,"s1":233,"bevel":0}},{"name":"stagger.tooth13","kind":"prism","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[-53.954,-11.144,-59.267,-12.568,-60.327,-14.405,-59.447,-17.689,-57.61,-18.75,-52.298,-17.326],"s0":221,"s1":233,"bevel":0}},{"name":"stagger.tooth14","kind":"prism","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[-49.231,-24.729,-53.995,-27.479,-54.544,-29.528,-52.844,-32.472,-50.795,-33.021,-46.031,-30.271],"s0":221,"s1":233,"bevel":0}},{"name":"stagger.tooth15","kind":"prism","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[-41.154,-36.628,-45.043,-40.517,-45.043,-42.639,-42.639,-45.043,-40.517,-45.043,-36.628,-41.154],"s0":221,"s1":233,"bevel":0}},{"name":"stagger.tooth16","kind":"prism","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[-30.271,-46.031,-33.021,-50.795,-32.472,-52.844,-29.528,-54.544,-27.479,-53.995,-24.729,-49.231],"s0":221,"s1":233,"bevel":0}},{"name":"stagger.tooth17","kind":"prism","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[-17.326,-52.298,-18.75,-57.61,-17.689,-59.447,-14.405,-60.327,-12.568,-59.267,-11.144,-53.954],"s0":221,"s1":233,"bevel":0}},{"name":"stagger.tooth18","kind":"prism","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[-3.2,-55,-3.2,-60.5,-1.7,-62,1.7,-62,3.2,-60.5,3.2,-55],"s0":221,"s1":233,"bevel":0}},{"name":"stagger.tooth19","kind":"prism","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[11.144,-53.954,12.568,-59.267,14.405,-60.327,17.689,-59.447,18.75,-57.61,17.326,-52.298],"s0":221,"s1":233,"bevel":0}},{"name":"stagger.tooth20","kind":"prism","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[24.729,-49.231,27.479,-53.995,29.528,-54.544,32.472,-52.844,33.021,-50.795,30.271,-46.031],"s0":221,"s1":233,"bevel":0}},{"name":"stagger.tooth21","kind":"prism","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[36.628,-41.154,40.517,-45.043,42.639,-45.043,45.043,-42.639,45.043,-40.517,41.154,-36.628],"s0":221,"s1":233,"bevel":0}},{"name":"stagger.tooth22","kind":"prism","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[46.031,-30.271,50.795,-33.021,52.844,-32.472,54.544,-29.528,53.995,-27.479,49.231,-24.729],"s0":221,"s1":233,"bevel":0}},{"name":"stagger.tooth23","kind":"prism","group":26,"layer":0,"crease":"lo","mat":"gunmetal","spec":{"up":0,"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"ring":[52.298,-17.326,57.61,-18.75,59.447,-17.689,60.327,-14.405,59.267,-12.568,53.954,-11.144],"s0":221,"s1":233,"bevel":0}},{"name":"timeline.step0","kind":"round","group":28,"layer":0,"crease":"lo","mat":"steel","spec":{"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":236,"s1":242.5,"r0":50,"r1":50,"ends":["flat","flat"]},"details":{"seams":[239.2]}},{"name":"timeline.step1","kind":"round","group":28,"layer":0,"crease":"lo","mat":"steel","spec":{"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":242.5,"s1":249,"r0":48,"r1":48,"ends":["flat","flat"]},"details":{"seams":[245.7]}},{"name":"timeline.step2","kind":"round","group":28,"layer":0,"crease":"lo","mat":"steel","spec":{"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":249,"s1":255.5,"r0":46,"r1":46,"ends":["flat","flat"]},"details":{"seams":[252.2]}},{"name":"timeline.step3","kind":"round","group":28,"layer":0,"crease":"lo","mat":"steel","spec":{"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":255.5,"s1":262,"r0":44,"r1":44,"ends":["flat","flat"]},"details":{"seams":[258.7]}},{"name":"waapi.ring","kind":"round","group":29,"layer":0,"crease":"lo","mat":"steel","spec":{"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":264,"s1":292,"r0":62,"r1":62,"ends":["flat","flat"],"slots":{"bevel":0,"ribs":30}},"details":{"ribs":{"s0":265,"s1":291,"count":140,"fade":[0.08,0.55],"seams":true,"tone":"lo"}}},{"name":"waapi.glass","kind":"round","group":30,"layer":0,"crease":"lo","mat":"glass","spec":{"F":{"o":[0,0,-150],"a":[0,0,1],"u":[1,0,0],"v":[0,1,0]},"s0":292,"s1":300,"r0":56,"r1":52,"ends":["flat","flat"]},"planes":[{"o":[0,0,150.02],"u":[1,0,0],"v":[0,-1,0],"n":[0,0,1],"fade":[0.04,0.3]}]}],"routes":[],"planes":{"live":"AAAAAYAAgAAABAAF2oKlfQAGAAelfdqCAAgACVqC2oIACgALJX2lfQAMAA0lfVqCAA4AD1qCJX0AEAARpX0lfQASABPaglqCABQAFYAAgAAAFAAWgACAAAAUABeAAIAAABQAGIAAgAAAFAAZgACAAAAUABqAAIAAABQAG4AAgAAAFAAcgACAAAAVABb/////ABUAF/////8AFQAY/////wAVABn/////ABUAGv////8AFQAb/////wAVABz/////ABYAHAAAgAAAFwAcUSYu2gAYAByu2S7aABkAHP//f/8AGgAcrtnRJQAbABxRJtElAB4AH///f/8AHgAgv/+//wAeACGAAP//AB4AIkAAv/8AHgAjAACAAAAeACRAAEAAAB4AJYAAAAAAHgAmv/9AAAAeACeAAIAAAB4AKIAAgAAAHwAnAAB//wAgACdAAEAAACEAJ4AAAAAAIgAnv/9AAAAjACf//3//ACQAJ7//v/8AJQAngAD//wAmACdAAL//ACcAKIAAgAAAKQAqv/+//wArACxAAL//AC0ALkAAQAAALwAwv/9AAAAxADKAAIAAADEAM4AAgAAAMQA0gACAAAAxADWAAIAAADIAM4AAgAAAMgA0gACAAAAyADWAAIAAADMANIAAgAAAMwA1gACAAAA0ADWAAIAAADYAN9ElrtkANgA4gAD//wA2ADku2q7ZADYAOi7aUSYANgA7f/8AAAA2ADzRJVEmAD0APv//gAAAPQA/5PKbDAA9AEDRJa7ZAD0AQb//v/8APQBCrtnRJQA9AEObDOTyAD0ARIAA//8APQBFZPPk8gA9AEZRJtElAD0AR0AAv/8APQBILtqu2QA9AEkbDZsMAD0ASgAAgAAAPQBLGw1k8wA9AEwu2lEmAD0ATUAAQAAAPQBOUSYu2gA9AE9k8xsNAD0AUH//AAAAPQBRmwwbDQA9AFKu2S7aAD0AU7//QAAAPQBU0SVRJgA9AFXk8mTzAD4AP3Eb8RsAPgBVcRsO5AA/AEBagtqCAEAAQUhtyGwAQQBCN5O3kgBCAEMlfaV9AEMARA7kjuQARABFDuRxGwBFAEYlfVqCAEYARzeTSG0ARwBISG03kwBIAElagiV9AEkASnEbDuQASgBLjuQO5ABLAEylfSV9AEwATbeSN5MATQBOyGxIbQBOAE/aglqCAE8AUPEbcRsAUABR8RuO5ABRAFLagqV9AFIAU8hst5IAUwBUt5LIbABUAFWlfdqCAFYAV4AAgAAAVgBYgACAAABWAFmAAIAAAFcAWIAAgAAAVwBZgACAAABYAFmAAH//"},"framed":{"live":""},"groupPairs":{"live":[]},"dynamic":{"live":[]},"free":{"live":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91]},"skip":{"live":[]},"values":{"root":null,"scope":0,"scroll":0,"draggable":0,"draggable.pod0":0,"draggable.pod1":0,"draggable.pod2":0,"draggable.pod3":0,"draggable.pod4":0,"draggable.pod5":0,"draggable.pod6":0,"draggable.pod7":0,"pop.easings":0,"easings":0,"pop.timer":0,"timer":0,"animation":0,"animation.pod0":0,"animation.pod1":0,"animation.pod2":0,"animation.pod3":0,"pop.spring":0,"spring":0,"pop.svg":0,"svg":0,"pop.stagger":0,"stagger":0,"pop.timeline":0,"timeline":0,"waapi":0,"waapi.glass":0}},"explode":[{"name":"scope","travel":120,"delay":0},{"name":"scroll","travel":92,"delay":0.04},{"name":"draggable","travel":64,"delay":0.08},{"name":"draggable.pod0","travel":22,"delay":0.1},{"name":"draggable.pod1","travel":22,"delay":0.1},{"name":"draggable.pod2","travel":22,"delay":0.1},{"name":"draggable.pod3","travel":22,"delay":0.1},{"name":"draggable.pod4","travel":22,"delay":0.1},{"name":"draggable.pod5","travel":22,"delay":0.1},{"name":"draggable.pod6","travel":22,"delay":0.1},{"name":"draggable.pod7","travel":22,"delay":0.1},{"name":"easings","travel":40,"delay":0.14},{"name":"timer","travel":22,"delay":0.2},{"name":"animation","travel":0,"delay":0},{"name":"animation.pod0","travel":36,"delay":0.12},{"name":"animation.pod1","travel":36,"delay":0.12},{"name":"animation.pod2","travel":36,"delay":0.12},{"name":"animation.pod3","travel":36,"delay":0.12},{"name":"spring","travel":24,"delay":0.2},{"name":"svg","travel":40,"delay":0.16},{"name":"stagger","travel":58,"delay":0.1},{"name":"timeline","travel":78,"delay":0.05},{"name":"waapi","travel":100,"delay":0.02},{"name":"waapi.glass","travel":140,"delay":0}],"basis":{"R":[0.7071067811865475,-0.7071067811865476,0],"D":[0.35355339059327373,0.3535533905932737,-0.8660254037844387],"V":[0.6123724356957946,0.6123724356957945,0.49999999999999994],"k":1.0858007511553212,"origin":[320,320]}};

const EXPLODE = DATA.explode;
function explodeValues(apart, stretch = 0.55) {
  const out = {};
  for (const { name, travel, delay } of EXPLODE) {
    const t = Math.max(0, Math.min(1, (apart - delay * stretch) / (1 - stretch)));
    out[name] = travel * t * t * (3 - 2 * t);
  }
  return out;
}
const mat3 = (a, b) => {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
};
const rotAbout = (axis, deg) => {
  const [x, y, z] = axis;
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
};
const M0 = [-1, 0, 0, 0, 0, 1, 0, 1, 0];
const BV = (() => {
  const { R, D, V } = DATA.basis;
  return [R[0], -D[0], V[0], R[1], -D[1], V[1], R[2], -D[2], V[2]];
})();
function orient(yaw, pitch = 0, roll = 0) {
  let M = mat3(rotAbout([0, 1, 0], yaw), M0);
  M = mat3(rotAbout([1, 0, 0], pitch), M);
  M = mat3(rotAbout([0, 0, 1], roll), M);
  return mat3(BV, M);
}

const FILM = {
  fig: "Fig 1",
  title: "Animation engine",
  radius: 185,
  label: "A turned mechanism of eleven stacked modules, one per anime.js API, taken apart along its axis.",
  bounds: [
    [-72, 72],
    [-72, 72],
    [0, 300],
  ],
};

const FIGURE = {
  title: "Animation engine · anatomy",
  start: { yaw: -30, pitch: 18 },
  label: "A turned mechanism built from {parts} solid parts in {modules} modules: flange, knurled rings, a lobed cage, cam bands, a dot ring, the main drum, a coil, a clip band, a gear, a collar and a glass element.",
  keys: [
    { mark: "raised", label: "Core: animation drum" },
    { mark: "lit", label: "Modules: timer, easings, draggable, scroll, scope, spring, svg, stagger, timeline, waapi" },
  ],
  caption: "{parts} convex parts in {assemblies} assemblies. B pops six modules out sideways.",
};

const FEATURE_DEFAULTS = { bundle: 0 };

const FEATURE_KEYS = [{ key: "b", channel: "bundle", name: "bundle", unit: "", values: [0, 1], ease: 0.3, verb: "pops modules out", tour: [0.75, 0.9] }];

const POP_ORDER = ["timeline", "stagger", "svg", "spring", "timer", "easings"];
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (t) => t * t * (3 - 2 * t);

// bundle 0…1 pops the six modules one after another, overlapping.
function featureValues(s, values) {
  const out = { ...values };
  POP_ORDER.forEach((n, i) => (out[`pop.${n}`] = 150 * smooth(clamp01(s.bundle * 2.2 - i * 0.24))));
  return out;
}

function featureTravel(a, b) {
  return Math.abs(b.bundle - a.bundle) * 150;
}

const NAMES = ["scope.flange","scope.lip","scroll.ring","draggable.core","draggable.pod0","draggable.pin0","draggable.pod1","draggable.pin1","draggable.pod2","draggable.pin2","draggable.pod3","draggable.pin3","draggable.pod4","draggable.pin4","draggable.pod5","draggable.pin5","draggable.pod6","draggable.pin6","draggable.pod7","draggable.pin7","easings.band.a","easings.band.b","easings.cam0","easings.cam1","easings.cam2","easings.cam3","easings.cam4","easings.cam5","easings.hub","timer.ring","animation.collar","animation.bolt0","animation.bolt1","animation.bolt2","animation.bolt3","animation.bolt4","animation.bolt5","animation.bolt6","animation.bolt7","animation.drum","animation.cap","animation.pod0","animation.pod0.cap","animation.pod1","animation.pod1.cap","animation.pod2","animation.pod2.cap","animation.pod3","animation.pod3.cap","spring.coil0","spring.coil1","spring.coil2","spring.coil3","spring.coil4","svg.band","svg.clip0","svg.clip1","svg.clip2","svg.clip3","svg.clip4","svg.clip5","stagger.gear","stagger.tooth0","stagger.tooth1","stagger.tooth2","stagger.tooth3","stagger.tooth4","stagger.tooth5","stagger.tooth6","stagger.tooth7","stagger.tooth8","stagger.tooth9","stagger.tooth10","stagger.tooth11","stagger.tooth12","stagger.tooth13","stagger.tooth14","stagger.tooth15","stagger.tooth16","stagger.tooth17","stagger.tooth18","stagger.tooth19","stagger.tooth20","stagger.tooth21","stagger.tooth22","stagger.tooth23","timeline.step0","timeline.step1","timeline.step2","timeline.step3","waapi.ring","waapi.glass"];
const host = document.getElementById("mechanism");
host.classList.add("iso");
document.head.insertAdjacentHTML("beforeend", "<style>\n.iso{\n  --anatomy-page:#0b0b0b;--anatomy-card:#131313;--anatomy-text:#a3a3a3;--anatomy-strong:#e6e6e6;--anatomy-muted:#6e6e6e;\n  --anatomy-paper:#131313;--anatomy-face:#1b1b1b;--anatomy-top:#1c1c1c;\n  --anatomy-shade-0:#0f0f0f;--anatomy-shade-1:#121212;--anatomy-shade-2:#151515;--anatomy-shade-3:#181818;\n  --anatomy-lit-top:#262626;--anatomy-lit-shade:#1d1d1d;\n  --anatomy-hi:#d4d4d4;--anatomy-mid:#6a6a6a;--anatomy-lo:#3e3e3e;--anatomy-faint:#2a2a2a;--anatomy-lit:#ffffff;\n  --anatomy-halo:#050505;--anatomy-halo-opacity:.9;--anatomy-dot:#e6e6e6;\n  --anatomy-red:#ff6b6b;--anatomy-green:#6be0a0;--anatomy-blue:#6b9bff;\n  --anatomy-weight:.6px;--anatomy-ease:cubic-bezier(.32,.72,0,1);\n  --anatomy-mono:ui-monospace,\"SF Mono\",Menlo,Consolas,monospace;\n  --anatomy-lift:inset 0 1px 0 0 #ffffff0a,inset 0 0 0 1px #ffffff06,0 0 0 1px #00000026,0 1px 1px -.5px #00000014,0 3px 3px -1.5px #00000014,0 6px 6px -3px #00000014,0 12px 12px -6px #00000014;\n}\n.iso[data-theme=\"light\"]{\n  --anatomy-page:#f2f2ef;--anatomy-card:#fbfbfa;--anatomy-text:#57575a;--anatomy-strong:#18181a;--anatomy-muted:#8c8c90;\n  --anatomy-paper:#fbfbfa;--anatomy-face:#ffffff;--anatomy-top:#ffffff;\n  --anatomy-shade-0:#dcdcd9;--anatomy-shade-1:#e5e5e2;--anatomy-shade-2:#ededea;--anatomy-shade-3:#f4f4f1;\n  --anatomy-lit-top:#ffffff;--anatomy-lit-shade:#eeeeeb;\n  --anatomy-hi:#26262a;--anatomy-mid:#8a8a8f;--anatomy-lo:#b4b4b8;--anatomy-faint:#d4d4d6;--anatomy-lit:#000000;\n  --anatomy-halo:#8a8a80;--anatomy-halo-opacity:.32;--anatomy-dot:#3a3a3e;\n  --anatomy-red:#e5484d;--anatomy-green:#30a46c;--anatomy-blue:#3e63dd;\n  --anatomy-lift:inset 0 1px 0 0 #ffffff,0 0 0 1px #0000000f,0 1px 1px -.5px #0000000a,0 3px 3px -1.5px #0000000a,0 6px 6px -3px #0000000a,0 12px 12px -6px #0000000a;\n}\n.iso-svg{display:block;width:100%;height:auto;overflow:visible}\n.iso-svg path,.iso-svg circle{vector-effect:non-scaling-stroke}\n.iso-fill{fill:var(--anatomy-paper);stroke:none}\n.iso-solid[data-lit]>.iso-fill{fill:var(--anatomy-face)}\n.iso-shade,.iso-top{stroke:none}\n.iso-shade[data-shade=\"0\"]{fill:var(--anatomy-shade-0)}\n.iso-shade[data-shade=\"1\"]{fill:var(--anatomy-shade-1)}\n.iso-shade[data-shade=\"2\"]{fill:var(--anatomy-shade-2)}\n.iso-shade[data-shade=\"3\"]{fill:var(--anatomy-shade-3)}\n.iso-top{fill:var(--anatomy-top)}\n.iso-solid[data-lit]>.iso-top{fill:var(--anatomy-lit-top)}\n.iso-solid[data-lit]>.iso-shade{fill:var(--anatomy-lit-shade)}\n.iso-solid[data-seamless]>.iso-shade,.iso-solid[data-seamless]>.iso-top{stroke-width:.4;stroke-linejoin:round}\n.iso-solid[data-seamless]>.iso-shade[data-shade=\"0\"]{stroke:var(--anatomy-shade-0)}\n.iso-solid[data-seamless]>.iso-shade[data-shade=\"1\"]{stroke:var(--anatomy-shade-1)}\n.iso-solid[data-seamless]>.iso-shade[data-shade=\"2\"]{stroke:var(--anatomy-shade-2)}\n.iso-solid[data-seamless]>.iso-shade[data-shade=\"3\"]{stroke:var(--anatomy-shade-3)}\n.iso-solid[data-seamless]>.iso-top{stroke:var(--anatomy-top)}\n.iso-solid[data-seamless][data-lit]>.iso-top{stroke:var(--anatomy-lit-top)}\n.iso-solid[data-seamless][data-lit]>.iso-shade{stroke:var(--anatomy-lit-shade)}\n.iso-solid[data-lit]>.iso-edge{stroke:var(--anatomy-lit)}\n.iso-halo{fill:var(--anatomy-halo);stroke:none;filter:blur(9px);opacity:var(--anatomy-halo-opacity);transform:translateY(3px)}\n.iso-line{fill:none;stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight);stroke-linecap:round;stroke-linejoin:round}\n.iso-line[data-tone=\"hi\"]{stroke:var(--anatomy-hi)}\n.iso-line[data-tone=\"mid\"]{stroke:var(--anatomy-mid)}\n.iso-line[data-tone=\"lo\"]{stroke:var(--anatomy-lo)}\n.iso-line[data-tone=\"faint\"]{stroke:var(--anatomy-faint)}\n.iso-line[data-tone=\"lit\"]{stroke:var(--anatomy-lit)}\n.iso-line[data-tone=\"red\"]{stroke:var(--anatomy-red)}\n.iso-line[data-tone=\"green\"]{stroke:var(--anatomy-green)}\n.iso-line[data-tone=\"blue\"]{stroke:var(--anatomy-blue)}\n.iso-line[data-dotted]{stroke-dasharray:.01 3.5;stroke-width:1}\n.iso-line[data-dashed]{stroke-dasharray:3 3}\n.iso-line[data-flow]{stroke-dasharray:2 6}\n.iso-wire-end{fill:var(--anatomy-paper);stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight)}\n.iso-wire[data-tone=\"hi\"] .iso-wire-end{stroke:var(--anatomy-hi)}\n.iso-wire[data-tone=\"mid\"] .iso-wire-end{stroke:var(--anatomy-mid)}\n.iso-wire[data-tone=\"faint\"] .iso-wire-end{stroke:var(--anatomy-faint)}\n.iso-wire[data-tone=\"lit\"] .iso-wire-end{stroke:var(--anatomy-lit)}\n.iso-dots circle{fill:var(--anatomy-dot);stroke:none;opacity:.32}\n.iso-dots[data-tone=\"hi\"] circle{opacity:.85}\n.iso-dots[data-tone=\"mid\"] circle{opacity:.45}\n.iso-dots[data-tone=\"lo\"] circle{opacity:.22}\n.iso-dots[data-tone=\"faint\"] circle{opacity:.12}\n.iso-face-text{fill:var(--anatomy-mid);font-family:var(--anatomy-mono);letter-spacing:.04em}\n.iso-face-text[data-tone=\"hi\"]{fill:var(--anatomy-hi)}\n.iso-face-text[data-tone=\"lo\"]{fill:var(--anatomy-lo)}\n.iso-face-text[data-tone=\"faint\"]{fill:var(--anatomy-faint)}\n.tb-body{fill:var(--anatomy-shade-2);stroke:none}\n.tb-shine{fill:var(--anatomy-top);stroke:none}\n.tb-shade{fill:var(--anatomy-shade-0);stroke:none}\n.tb-ring{fill:none;stroke:var(--anatomy-lo);stroke-width:.45;stroke-linecap:butt;stroke-linejoin:round}\n.tb-ring[data-tone=\"mid\"]{stroke:var(--anatomy-mid)}\n.tb-ring[data-tone=\"faint\"]{stroke:var(--anatomy-faint)}\n.tb-ring[data-tone=\"hi\"]{stroke:var(--anatomy-hi)}\n@keyframes iso-flow{to{stroke-dashoffset:-32}}\n@keyframes iso-pulse{0%,100%{opacity:.18}12%{opacity:1}40%{opacity:.18}}\n.iso-line[data-flow]{animation:iso-flow 1600ms linear infinite}\n.iso-dots circle[data-pulse]{animation:iso-pulse 1600ms steps(1,end) infinite;animation-delay:var(--pulse-at,0ms)}\n.iso-figure{margin:32px 0 36px}\n.iso-plate{position:relative;padding:52px 24px;border-radius:0;background:var(--anatomy-card);box-shadow:0 0 0 1px var(--anatomy-mid);--anatomy-paper:var(--anatomy-card)}\n.iso-plate-corners{position:absolute;inset:18px 20px;pointer-events:none}\n.iso-plate-corner{position:absolute;color:var(--anatomy-muted);font-family:var(--anatomy-mono);font-size:10.5px;line-height:1;letter-spacing:.04em;white-space:nowrap}\n.iso-plate-corner[data-corner=\"fig\"]{top:0;left:0;color:var(--anatomy-text)}\n.iso-plate-corner[data-corner=\"title\"]{top:0;right:0;text-transform:uppercase;letter-spacing:.1em}\n.iso-plate-corner[data-corner=\"hint\"]{bottom:0;left:0;text-transform:uppercase;letter-spacing:.1em}\n.iso-plate-corner[data-corner=\"readout\"]{right:0;bottom:0;color:var(--anatomy-text);font-variant-numeric:tabular-nums}\n.iso-plate .iso-svg{margin:0 auto}\n.iso-legend{display:grid;gap:8px;margin-top:12px;color:var(--anatomy-muted);font-size:13px;line-height:1.55}\n.iso-keys{display:flex;flex-wrap:wrap;gap:6px 18px}\n.iso-key{display:inline-flex;align-items:center;gap:7px}\n.iso-swatch{width:16px;height:10px;flex:none;overflow:visible}\n.iso-swatch path{fill:none;stroke:var(--anatomy-hi);stroke-width:1;vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round}\n.iso-swatch[data-mark=\"raised\"] path,.iso-swatch[data-mark=\"flat\"] path{stroke:var(--anatomy-mid)}\n.iso-swatch[data-mark=\"lit\"] path{stroke:var(--anatomy-lit)}\n.iso-swatch[data-mark=\"dim\"] path{stroke:var(--anatomy-lo)}\n.iso-swatch[data-mark=\"dotted\"] path{stroke-dasharray:.01 3;stroke-width:1.4}\n.iso-swatch[data-mark=\"dashed\"] path{stroke-dasharray:3 2.5}\n.iso-swatch[data-mark=\"red\"] path{stroke:var(--anatomy-red)}\n.iso-swatch[data-mark=\"green\"] path{stroke:var(--anatomy-green)}\n.iso-swatch[data-mark=\"blue\"] path{stroke:var(--anatomy-blue)}\n.iso-swatch-crease{stroke:var(--anatomy-lo)!important}\n@media (max-width:560px){.iso-plate{padding:48px 12px 70px}.iso-plate-corner[data-corner=\"hint\"]{bottom:18px}}\n@media (prefers-reduced-motion:reduce){.iso-line[data-flow],.iso-dots circle[data-pulse]{animation:none}}\n.iso-live{--tn-0:var(--anatomy-shade-0);--tn-1:var(--anatomy-shade-1);--tn-2:var(--anatomy-shade-2);--tn-3:var(--anatomy-shade-3);--tn-4:var(--anatomy-top)}\n.iso-live [data-mat]{--tn-0:var(--anatomy-shade-0);--tn-1:var(--anatomy-shade-1);--tn-2:var(--anatomy-shade-2);--tn-3:var(--anatomy-shade-3);--tn-4:var(--anatomy-top)}\n.iso-live [data-lit]{--tn-0:var(--anatomy-lit-shade);--tn-1:var(--anatomy-lit-shade);--tn-2:var(--anatomy-lit-shade);--tn-3:var(--anatomy-lit-shade);--tn-4:var(--anatomy-lit-top)}\n.iso-tn{stroke-width:.4;stroke-linejoin:round;--ta:var(--tn-0);--tb:var(--tn-1);fill:color-mix(in srgb,var(--ta) calc(100% - var(--f,0) * 100%),var(--tb));stroke:color-mix(in srgb,var(--ta) calc(100% - var(--f,0) * 100%),var(--tb))}\n.iso-tn[data-b=\"1\"]{--ta:var(--tn-1);--tb:var(--tn-2)}\n.iso-tn[data-b=\"2\"]{--ta:var(--tn-2);--tb:var(--tn-3)}\n.iso-tn[data-b=\"3\"]{--ta:var(--tn-3);--tb:var(--tn-4)}\n[data-mat=\"gold\"]{--anatomy-paper:#3f3521;--anatomy-face:#4b3f28;--anatomy-top:#5a4c31;--anatomy-shade-0:#2b2416;--anatomy-shade-1:#352c1b;--anatomy-shade-2:#3f3521;--anatomy-shade-3:#4b3f28;--anatomy-lit-top:#6a5a3b;--anatomy-lit-shade:#4f4329;--anatomy-hi:#e6d2a3;--anatomy-mid:#8a7550;--anatomy-lo:#5e4e33;--anatomy-faint:#463a26;--anatomy-dot:#e6d2a3;--anatomy-lit:#fff3d6;--mat-body:#4a3e27;--mat-shine:#8c7853;--mat-shade:#251f13;--mat-edge:#e6d2a3}\n.iso[data-theme=\"light\"] [data-mat=\"gold\"]{--anatomy-paper:#d3bb88;--anatomy-face:#e4d2a8;--anatomy-top:#f1e5c6;--anatomy-shade-0:#a1844f;--anatomy-shade-1:#bc9f69;--anatomy-shade-2:#d3bb88;--anatomy-shade-3:#e4d2a8;--anatomy-lit-top:#f8efd8;--anatomy-lit-shade:#dfcb9c;--anatomy-hi:#4b3920;--anatomy-mid:#86693f;--anatomy-lo:#a98c5b;--anatomy-faint:#c1a676;--anatomy-dot:#4a381f;--anatomy-lit:#2a1d0c;--mat-body:#cdb07a;--mat-shine:#f3e8cc;--mat-shade:#8e7044;--mat-edge:#4b3920}\n.iso[data-theme=\"dark\"] [data-mat=\"gold\"]{--anatomy-paper:#3f3521;--anatomy-face:#4b3f28;--anatomy-top:#5a4c31;--anatomy-shade-0:#2b2416;--anatomy-shade-1:#352c1b;--anatomy-shade-2:#3f3521;--anatomy-shade-3:#4b3f28;--anatomy-lit-top:#6a5a3b;--anatomy-lit-shade:#4f4329;--anatomy-hi:#e6d2a3;--anatomy-mid:#8a7550;--anatomy-lo:#5e4e33;--anatomy-faint:#463a26;--anatomy-dot:#e6d2a3;--anatomy-lit:#fff3d6;--mat-body:#4a3e27;--mat-shine:#8c7853;--mat-shade:#251f13;--mat-edge:#e6d2a3}\n[data-mat=\"chrome\"]{--anatomy-paper:#2a2e32;--anatomy-face:#4a5056;--anatomy-top:#6e757c;--anatomy-shade-0:#2e3236;--anatomy-shade-1:#24272b;--anatomy-shade-2:#1a1d20;--anatomy-shade-3:#4a5056;--anatomy-lit-top:#848b92;--anatomy-lit-shade:#3a3f44;--anatomy-hi:#dfe3e7;--anatomy-mid:#7c838a;--anatomy-lo:#4d5359;--anatomy-faint:#363b40;--anatomy-dot:#e4e7ea;--anatomy-lit:#ffffff;--mat-body:#34393e;--mat-shine:#9aa1a8;--mat-shade:#16191b;--mat-edge:#dfe3e7}\n.iso[data-theme=\"light\"] [data-mat=\"chrome\"]{--anatomy-paper:#8e959c;--anatomy-face:#c3c8cd;--anatomy-top:#f7f8f9;--anatomy-shade-0:#a2a9b0;--anatomy-shade-1:#6f767d;--anatomy-shade-2:#454b52;--anatomy-shade-3:#cacfd4;--anatomy-lit-top:#ffffff;--anatomy-lit-shade:#bcc2c8;--anatomy-hi:#202428;--anatomy-mid:#585e65;--anatomy-lo:#878d94;--anatomy-faint:#a9afb5;--anatomy-dot:#2a2e33;--anatomy-lit:#000000;--mat-body:#8b9299;--mat-shine:#fbfcfd;--mat-shade:#3c4248;--mat-edge:#202428}\n.iso[data-theme=\"dark\"] [data-mat=\"chrome\"]{--anatomy-paper:#2a2e32;--anatomy-face:#4a5056;--anatomy-top:#6e757c;--anatomy-shade-0:#2e3236;--anatomy-shade-1:#24272b;--anatomy-shade-2:#1a1d20;--anatomy-shade-3:#4a5056;--anatomy-lit-top:#848b92;--anatomy-lit-shade:#3a3f44;--anatomy-hi:#dfe3e7;--anatomy-mid:#7c838a;--anatomy-lo:#4d5359;--anatomy-faint:#363b40;--anatomy-dot:#e4e7ea;--anatomy-lit:#ffffff;--mat-body:#34393e;--mat-shine:#9aa1a8;--mat-shade:#16191b;--mat-edge:#dfe3e7}\n[data-mat=\"steel\"]{--anatomy-paper:#2c3034;--anatomy-face:#34393d;--anatomy-top:#3e4348;--anatomy-shade-0:#1f2225;--anatomy-shade-1:#25292c;--anatomy-shade-2:#2c3034;--anatomy-shade-3:#34393d;--anatomy-lit-top:#4a5056;--anatomy-lit-shade:#33383c;--anatomy-hi:#d0d4d8;--anatomy-mid:#727980;--anatomy-lo:#4a5056;--anatomy-faint:#33383d;--anatomy-dot:#d8dce0;--anatomy-lit:#ffffff;--mat-body:#30353a;--mat-shine:#5c6369;--mat-shade:#1a1d20;--mat-edge:#d0d4d8}\n.iso[data-theme=\"light\"] [data-mat=\"steel\"]{--anatomy-paper:#b8bdc1;--anatomy-face:#cdd1d4;--anatomy-top:#e5e8ea;--anatomy-shade-0:#8f959b;--anatomy-shade-1:#a4aaaf;--anatomy-shade-2:#b8bdc1;--anatomy-shade-3:#cdd1d4;--anatomy-lit-top:#f1f3f4;--anatomy-lit-shade:#c6cacd;--anatomy-hi:#2b2f33;--anatomy-mid:#6b7177;--anatomy-lo:#959ba1;--anatomy-faint:#aeb3b8;--anatomy-dot:#33373b;--anatomy-lit:#000000;--mat-body:#b3b8bd;--mat-shine:#eef0f2;--mat-shade:#7d8389;--mat-edge:#2b2f33}\n.iso[data-theme=\"dark\"] [data-mat=\"steel\"]{--anatomy-paper:#2c3034;--anatomy-face:#34393d;--anatomy-top:#3e4348;--anatomy-shade-0:#1f2225;--anatomy-shade-1:#25292c;--anatomy-shade-2:#2c3034;--anatomy-shade-3:#34393d;--anatomy-lit-top:#4a5056;--anatomy-lit-shade:#33383c;--anatomy-hi:#d0d4d8;--anatomy-mid:#727980;--anatomy-lo:#4a5056;--anatomy-faint:#33383d;--anatomy-dot:#d8dce0;--anatomy-lit:#ffffff;--mat-body:#30353a;--mat-shine:#5c6369;--mat-shade:#1a1d20;--mat-edge:#d0d4d8}\n[data-mat=\"gunmetal\"]{--anatomy-paper:#1d2125;--anatomy-face:#22272b;--anatomy-top:#2a2f34;--anatomy-shade-0:#15181b;--anatomy-shade-1:#191c20;--anatomy-shade-2:#1d2125;--anatomy-shade-3:#22272b;--anatomy-lit-top:#323840;--anatomy-lit-shade:#20252a;--anatomy-hi:#a9b0b7;--anatomy-mid:#5c636a;--anatomy-lo:#3a4046;--anatomy-faint:#2a2f34;--anatomy-dot:#b8bec4;--anatomy-lit:#ffffff;--mat-body:#1f2327;--mat-shine:#3a4046;--mat-shade:#111316;--mat-edge:#a9b0b7}\n.iso[data-theme=\"light\"] [data-mat=\"gunmetal\"]{--anatomy-paper:#444a51;--anatomy-face:#50575e;--anatomy-top:#5f666e;--anatomy-shade-0:#2f3439;--anatomy-shade-1:#393f45;--anatomy-shade-2:#444a51;--anatomy-shade-3:#50575e;--anatomy-lit-top:#6d757d;--anatomy-lit-shade:#4b5258;--anatomy-hi:#0f1113;--anatomy-mid:#1d2125;--anatomy-lo:#272b30;--anatomy-faint:#30353a;--anatomy-dot:#b0b5ba;--anatomy-lit:#000000;--mat-body:#3d4349;--mat-shine:#6e757c;--mat-shade:#24282c;--mat-edge:#0f1113}\n.iso[data-theme=\"dark\"] [data-mat=\"gunmetal\"]{--anatomy-paper:#1d2125;--anatomy-face:#22272b;--anatomy-top:#2a2f34;--anatomy-shade-0:#15181b;--anatomy-shade-1:#191c20;--anatomy-shade-2:#1d2125;--anatomy-shade-3:#22272b;--anatomy-lit-top:#323840;--anatomy-lit-shade:#20252a;--anatomy-hi:#a9b0b7;--anatomy-mid:#5c636a;--anatomy-lo:#3a4046;--anatomy-faint:#2a2f34;--anatomy-dot:#b8bec4;--anatomy-lit:#ffffff;--mat-body:#1f2327;--mat-shine:#3a4046;--mat-shade:#111316;--mat-edge:#a9b0b7}\n[data-mat=\"rubber\"]{--anatomy-paper:#121213;--anatomy-face:#161618;--anatomy-top:#1c1c1f;--anatomy-shade-0:#0c0c0d;--anatomy-shade-1:#0f0f10;--anatomy-shade-2:#121213;--anatomy-shade-3:#161618;--anatomy-lit-top:#232327;--anatomy-lit-shade:#141416;--anatomy-hi:#8c8e92;--anatomy-mid:#4a4c50;--anatomy-lo:#2c2d30;--anatomy-faint:#1f2023;--anatomy-dot:#9a9ca0;--anatomy-lit:#ffffff;--mat-body:#131315;--mat-shine:#2b2c30;--mat-shade:#0a0a0b;--mat-edge:#8c8e92}\n.iso[data-theme=\"light\"] [data-mat=\"rubber\"]{--anatomy-paper:#2a2b2e;--anatomy-face:#34363a;--anatomy-top:#46484d;--anatomy-shade-0:#1b1c1e;--anatomy-shade-1:#222326;--anatomy-shade-2:#2a2b2e;--anatomy-shade-3:#34363a;--anatomy-lit-top:#55575c;--anatomy-lit-shade:#2f3134;--anatomy-hi:#070708;--anatomy-mid:#111214;--anatomy-lo:#18191b;--anatomy-faint:#1f2023;--anatomy-dot:#6a6c70;--anatomy-lit:#000000;--mat-body:#27282b;--mat-shine:#5b5d62;--mat-shade:#121314;--mat-edge:#050506}\n.iso[data-theme=\"dark\"] [data-mat=\"rubber\"]{--anatomy-paper:#121213;--anatomy-face:#161618;--anatomy-top:#1c1c1f;--anatomy-shade-0:#0c0c0d;--anatomy-shade-1:#0f0f10;--anatomy-shade-2:#121213;--anatomy-shade-3:#161618;--anatomy-lit-top:#232327;--anatomy-lit-shade:#141416;--anatomy-hi:#8c8e92;--anatomy-mid:#4a4c50;--anatomy-lo:#2c2d30;--anatomy-faint:#1f2023;--anatomy-dot:#9a9ca0;--anatomy-lit:#ffffff;--mat-body:#131315;--mat-shine:#2b2c30;--mat-shade:#0a0a0b;--mat-edge:#8c8e92}\n[data-mat=\"brass\"]{--anatomy-paper:#3d3017;--anatomy-face:#49391c;--anatomy-top:#574523;--anatomy-shade-0:#2a210f;--anatomy-shade-1:#332813;--anatomy-shade-2:#3d3017;--anatomy-shade-3:#49391c;--anatomy-lit-top:#66522b;--anatomy-lit-shade:#45371b;--anatomy-hi:#e9cf8a;--anatomy-mid:#8e7438;--anatomy-lo:#5e4c25;--anatomy-faint:#44371c;--anatomy-dot:#e9cf8a;--anatomy-lit:#fff0c8;--mat-body:#433419;--mat-shine:#8a6f36;--mat-shade:#21190b;--mat-edge:#e9cf8a}\n.iso[data-theme=\"light\"] [data-mat=\"brass\"]{--anatomy-paper:#bd9646;--anatomy-face:#d2ad5b;--anatomy-top:#e6c87e;--anatomy-shade-0:#8a6a2c;--anatomy-shade-1:#a47f38;--anatomy-shade-2:#bd9646;--anatomy-shade-3:#d2ad5b;--anatomy-lit-top:#f0d796;--anatomy-lit-shade:#c8a252;--anatomy-hi:#3f2e0e;--anatomy-mid:#765a24;--anatomy-lo:#9a7a3c;--anatomy-faint:#b08c46;--anatomy-dot:#3a2a0c;--anatomy-lit:#1f1606;--mat-body:#b8913f;--mat-shine:#efd795;--mat-shade:#7d5f26;--mat-edge:#3f2e0e}\n.iso[data-theme=\"dark\"] [data-mat=\"brass\"]{--anatomy-paper:#3d3017;--anatomy-face:#49391c;--anatomy-top:#574523;--anatomy-shade-0:#2a210f;--anatomy-shade-1:#332813;--anatomy-shade-2:#3d3017;--anatomy-shade-3:#49391c;--anatomy-lit-top:#66522b;--anatomy-lit-shade:#45371b;--anatomy-hi:#e9cf8a;--anatomy-mid:#8e7438;--anatomy-lo:#5e4c25;--anatomy-faint:#44371c;--anatomy-dot:#e9cf8a;--anatomy-lit:#fff0c8;--mat-body:#433419;--mat-shine:#8a6f36;--mat-shade:#21190b;--mat-edge:#e9cf8a}\n[data-mat=\"copper\"]{--anatomy-paper:#3d1f13;--anatomy-face:#492617;--anatomy-top:#582e1c;--anatomy-shade-0:#2a160d;--anatomy-shade-1:#331a10;--anatomy-shade-2:#3d1f13;--anatomy-shade-3:#492617;--anatomy-lit-top:#673722;--anatomy-lit-shade:#432215;--anatomy-hi:#eaa985;--anatomy-mid:#8f5236;--anatomy-lo:#5f3624;--anatomy-faint:#45271a;--anatomy-dot:#eaa985;--anatomy-lit:#ffe0cc;--mat-body:#42221a;--mat-shine:#8a4c31;--mat-shade:#1f0f08;--mat-edge:#eaa985}\n.iso[data-theme=\"light\"] [data-mat=\"copper\"]{--anatomy-paper:#b3633e;--anatomy-face:#c9784f;--anatomy-top:#df9670;--anatomy-shade-0:#7c4128;--anatomy-shade-1:#9a5132;--anatomy-shade-2:#b3633e;--anatomy-shade-3:#c9784f;--anatomy-lit-top:#eaa985;--anatomy-lit-shade:#be6d46;--anatomy-hi:#3a1a0c;--anatomy-mid:#6e3820;--anatomy-lo:#925037;--anatomy-faint:#a65d3f;--anatomy-dot:#3a1a0c;--anatomy-lit:#1c0b04;--mat-body:#ad5f3b;--mat-shine:#f0b896;--mat-shade:#6e3720;--mat-edge:#3a1a0c}\n.iso[data-theme=\"dark\"] [data-mat=\"copper\"]{--anatomy-paper:#3d1f13;--anatomy-face:#492617;--anatomy-top:#582e1c;--anatomy-shade-0:#2a160d;--anatomy-shade-1:#331a10;--anatomy-shade-2:#3d1f13;--anatomy-shade-3:#492617;--anatomy-lit-top:#673722;--anatomy-lit-shade:#432215;--anatomy-hi:#eaa985;--anatomy-mid:#8f5236;--anatomy-lo:#5f3624;--anatomy-faint:#45271a;--anatomy-dot:#eaa985;--anatomy-lit:#ffe0cc;--mat-body:#42221a;--mat-shine:#8a4c31;--mat-shade:#1f0f08;--mat-edge:#eaa985}\n[data-mat=\"glass\"]{--anatomy-paper:#0a1519;--anatomy-face:#0e1c21;--anatomy-top:#1a3640;--anatomy-shade-0:#08161b;--anatomy-shade-1:#0c1f25;--anatomy-shade-2:#112a32;--anatomy-shade-3:#17363f;--anatomy-lit-top:#2b5a66;--anatomy-lit-shade:#1b4652;--anatomy-hi:#9ad7e3;--anatomy-mid:#4f8b97;--anatomy-lo:#2a5560;--anatomy-faint:#173a43;--anatomy-dot:#c8f0f8;--anatomy-lit:#ffffff;--mat-body:#0e2026;--mat-shine:#2b5a66;--mat-shade:#071216;--mat-edge:#9ad7e3}\n.iso[data-theme=\"light\"] [data-mat=\"glass\"]{--anatomy-paper:#e3eff2;--anatomy-face:#eef7f9;--anatomy-top:#f7fcfd;--anatomy-shade-0:#b9d2d8;--anatomy-shade-1:#c8dde2;--anatomy-shade-2:#d6e7eb;--anatomy-shade-3:#e3eff2;--anatomy-lit-top:#ffffff;--anatomy-lit-shade:#e0eef1;--anatomy-hi:#1f4954;--anatomy-mid:#5f8e99;--anatomy-lo:#97bcc5;--anatomy-faint:#c3dbe0;--anatomy-dot:#2a5b66;--anatomy-lit:#000000;--mat-body:#d3e6ea;--mat-shine:#ffffff;--mat-shade:#9fbfc7;--mat-edge:#1f4954}\n.iso[data-theme=\"dark\"] [data-mat=\"glass\"]{--anatomy-paper:#0a1519;--anatomy-face:#0e1c21;--anatomy-top:#1a3640;--anatomy-shade-0:#08161b;--anatomy-shade-1:#0c1f25;--anatomy-shade-2:#112a32;--anatomy-shade-3:#17363f;--anatomy-lit-top:#2b5a66;--anatomy-lit-shade:#1b4652;--anatomy-hi:#9ad7e3;--anatomy-mid:#4f8b97;--anatomy-lo:#2a5560;--anatomy-faint:#173a43;--anatomy-dot:#c8f0f8;--anatomy-lit:#ffffff;--mat-body:#0e2026;--mat-shine:#2b5a66;--mat-shade:#071216;--mat-edge:#9ad7e3}\n[data-mat=\"pcb\"]{--anatomy-paper:#0c1d12;--anatomy-face:#0f2618;--anatomy-top:#1b4a2a;--anatomy-shade-0:#0a1a0f;--anatomy-shade-1:#0d2415;--anatomy-shade-2:#12301c;--anatomy-shade-3:#173c23;--anatomy-lit-top:#2c6a3c;--anatomy-lit-shade:#1e5230;--anatomy-hi:#8fe0a5;--anatomy-mid:#3f8f56;--anatomy-lo:#2a5c38;--anatomy-faint:#1a3d25;--anatomy-dot:#e8d17a;--anatomy-lit:#ffffff;--mat-body:#0f2618;--mat-shine:#2c6a3c;--mat-shade:#071209;--mat-edge:#8fe0a5}\n.iso[data-theme=\"light\"] [data-mat=\"pcb\"]{--anatomy-paper:#cfe6d5;--anatomy-face:#dcefe0;--anatomy-top:#e9f6ec;--anatomy-shade-0:#9cc7a6;--anatomy-shade-1:#acd3b5;--anatomy-shade-2:#bddcc4;--anatomy-shade-3:#cfe6d5;--anatomy-lit-top:#f2fbf4;--anatomy-lit-shade:#d6ecdb;--anatomy-hi:#17432a;--anatomy-mid:#4a8a5d;--anatomy-lo:#86b994;--anatomy-faint:#b5d8bd;--anatomy-dot:#7a6420;--anatomy-lit:#000000;--mat-body:#c3e0ca;--mat-shine:#f2fbf4;--mat-shade:#8fbf9b;--mat-edge:#17432a}\n.iso[data-theme=\"dark\"] [data-mat=\"pcb\"]{--anatomy-paper:#0c1d12;--anatomy-face:#0f2618;--anatomy-top:#1b4a2a;--anatomy-shade-0:#0a1a0f;--anatomy-shade-1:#0d2415;--anatomy-shade-2:#12301c;--anatomy-shade-3:#173c23;--anatomy-lit-top:#2c6a3c;--anatomy-lit-shade:#1e5230;--anatomy-hi:#8fe0a5;--anatomy-mid:#3f8f56;--anatomy-lo:#2a5c38;--anatomy-faint:#1a3d25;--anatomy-dot:#e8d17a;--anatomy-lit:#ffffff;--mat-body:#0f2618;--mat-shine:#2c6a3c;--mat-shade:#071209;--mat-edge:#8fe0a5}\n[data-mat=\"sensor\"]{--anatomy-paper:#170d22;--anatomy-face:#1e122d;--anatomy-top:#3d2560;--anatomy-shade-0:#140b1e;--anatomy-shade-1:#1c1029;--anatomy-shade-2:#251537;--anatomy-shade-3:#2f1b46;--anatomy-lit-top:#5a3a8c;--anatomy-lit-shade:#43296b;--anatomy-hi:#d2b8ff;--anatomy-mid:#8a68c4;--anatomy-lo:#553d80;--anatomy-faint:#33244f;--anatomy-dot:#f0e0ff;--anatomy-lit:#ffffff;--mat-body:#1e122d;--mat-shine:#5a3a8c;--mat-shade:#0d0614;--mat-edge:#d2b8ff}\n.iso[data-theme=\"light\"] [data-mat=\"sensor\"]{--anatomy-paper:#e4dcf2;--anatomy-face:#efe9f8;--anatomy-top:#f7f3fc;--anatomy-shade-0:#c2b2e0;--anatomy-shade-1:#cfc1e8;--anatomy-shade-2:#dacfee;--anatomy-shade-3:#e4dcf2;--anatomy-lit-top:#ffffff;--anatomy-lit-shade:#e8e1f5;--anatomy-hi:#3b2366;--anatomy-mid:#7458a8;--anatomy-lo:#a893cf;--anatomy-faint:#cdbfe6;--anatomy-dot:#3b2366;--anatomy-lit:#000000;--mat-body:#dcd2ee;--mat-shine:#ffffff;--mat-shade:#ad9ad1;--mat-edge:#3b2366}\n.iso[data-theme=\"dark\"] [data-mat=\"sensor\"]{--anatomy-paper:#170d22;--anatomy-face:#1e122d;--anatomy-top:#3d2560;--anatomy-shade-0:#140b1e;--anatomy-shade-1:#1c1029;--anatomy-shade-2:#251537;--anatomy-shade-3:#2f1b46;--anatomy-lit-top:#5a3a8c;--anatomy-lit-shade:#43296b;--anatomy-hi:#d2b8ff;--anatomy-mid:#8a68c4;--anatomy-lo:#553d80;--anatomy-faint:#33244f;--anatomy-dot:#f0e0ff;--anatomy-lit:#ffffff;--mat-body:#1e122d;--mat-shine:#5a3a8c;--mat-shade:#0d0614;--mat-edge:#d2b8ff}\n[data-mat=\"signal\"]{--anatomy-paper:#3a0a0c;--anatomy-face:#4a0d10;--anatomy-top:#7a1a1c;--anatomy-shade-0:#2e0709;--anatomy-shade-1:#3c0a0c;--anatomy-shade-2:#4d0e11;--anatomy-shade-3:#5e1316;--anatomy-lit-top:#a3282b;--anatomy-lit-shade:#7a1a1d;--anatomy-hi:#ff9a96;--anatomy-mid:#c2484a;--anatomy-lo:#7a2224;--anatomy-faint:#4d1214;--anatomy-dot:#ffd0cc;--anatomy-lit:#ffffff;--mat-body:#4a0d10;--mat-shine:#a3282b;--mat-shade:#240405;--mat-edge:#ff9a96}\n.iso[data-theme=\"light\"] [data-mat=\"signal\"]{--anatomy-paper:#e45a52;--anatomy-face:#ec7067;--anatomy-top:#f48a80;--anatomy-shade-0:#b8352f;--anatomy-shade-1:#c9423b;--anatomy-shade-2:#d84d46;--anatomy-shade-3:#e45a52;--anatomy-lit-top:#ff9d94;--anatomy-lit-shade:#ec7067;--anatomy-hi:#5e0f0c;--anatomy-mid:#9e2a25;--anatomy-lo:#c4524b;--anatomy-faint:#e08a83;--anatomy-dot:#5e0f0c;--anatomy-lit:#000000;--mat-body:#d84d46;--mat-shine:#ff9d94;--mat-shade:#a3302a;--mat-edge:#5e0f0c}\n.iso[data-theme=\"dark\"] [data-mat=\"signal\"]{--anatomy-paper:#3a0a0c;--anatomy-face:#4a0d10;--anatomy-top:#7a1a1c;--anatomy-shade-0:#2e0709;--anatomy-shade-1:#3c0a0c;--anatomy-shade-2:#4d0e11;--anatomy-shade-3:#5e1316;--anatomy-lit-top:#a3282b;--anatomy-lit-shade:#7a1a1d;--anatomy-hi:#ff9a96;--anatomy-mid:#c2484a;--anatomy-lo:#7a2224;--anatomy-faint:#4d1214;--anatomy-dot:#ffd0cc;--anatomy-lit:#ffffff;--mat-body:#4a0d10;--mat-shine:#a3282b;--mat-shade:#240405;--mat-edge:#ff9a96}\n[data-mat=\"coffee\"]{--anatomy-paper:#765033;--anatomy-face:#7d5537;--anatomy-top:#8b5f3d;--anatomy-shade-0:#4d3320;--anatomy-shade-1:#5c3e27;--anatomy-shade-2:#6b482e;--anatomy-shade-3:#795234;--anatomy-lit-top:#926540;--anatomy-lit-shade:#724d31;--anatomy-hi:#24160d;--anatomy-mid:#3c2618;--anatomy-lo:#523622;--anatomy-faint:#65442b;--anatomy-dot:#1e110a;--anatomy-lit:#9a6a44;--mat-body:#724d31;--mat-shine:#90633f;--mat-shade:#4d3320;--mat-edge:#24160d}\n.iso[data-theme=\"light\"] [data-mat=\"coffee\"]{--anatomy-paper:#ad784e;--anatomy-face:#b47d51;--anatomy-top:#b98154;--anatomy-shade-0:#936541;--anatomy-shade-1:#9d6d46;--anatomy-shade-2:#a7734b;--anatomy-shade-3:#af7a4f;--anatomy-lit-top:#b98154;--anatomy-lit-shade:#a8754c;--anatomy-hi:#3b2415;--anatomy-mid:#65432a;--anatomy-lo:#855b3a;--anatomy-faint:#9b6b45;--anatomy-dot:#442b1a;--anatomy-lit:#1e0f07;--mat-body:#a8754c;--mat-shine:#b98154;--mat-shade:#8a5e3d;--mat-edge:#3b2415}\n.iso[data-theme=\"dark\"] [data-mat=\"coffee\"]{--anatomy-paper:#765033;--anatomy-face:#7d5537;--anatomy-top:#8b5f3d;--anatomy-shade-0:#4d3320;--anatomy-shade-1:#5c3e27;--anatomy-shade-2:#6b482e;--anatomy-shade-3:#795234;--anatomy-lit-top:#926540;--anatomy-lit-shade:#724d31;--anatomy-hi:#24160d;--anatomy-mid:#3c2618;--anatomy-lo:#523622;--anatomy-faint:#65442b;--anatomy-dot:#1e110a;--anatomy-lit:#9a6a44;--mat-body:#724d31;--mat-shine:#90633f;--mat-shade:#4d3320;--mat-edge:#24160d}\n[data-mat=\"bean\"]{--anatomy-paper:#422c1e;--anatomy-face:#472f20;--anatomy-top:#503524;--anatomy-shade-0:#281a12;--anatomy-shade-1:#312116;--anatomy-shade-2:#3b271a;--anatomy-shade-3:#442d1f;--anatomy-lit-top:#553927;--anatomy-lit-shade:#3f2a1d;--anatomy-hi:#110b07;--anatomy-mid:#1e130d;--anatomy-lo:#2b1c13;--anatomy-faint:#372419;--anatomy-dot:#0e0906;--anatomy-lit:#5a3c29;--mat-body:#3f2a1d;--mat-shine:#533726;--mat-shade:#281a12;--mat-edge:#110b07}\n.iso[data-theme=\"light\"] [data-mat=\"bean\"]{--anatomy-paper:#66442f;--anatomy-face:#6a4731;--anatomy-top:#6e4a33;--anatomy-shade-0:#543827;--anatomy-shade-1:#5b3d2a;--anatomy-shade-2:#61412d;--anatomy-shade-3:#674530;--anatomy-lit-top:#6e4a33;--anatomy-lit-shade:#62422d;--anatomy-hi:#1c110c;--anatomy-mid:#352318;--anatomy-lo:#4a3122;--anatomy-faint:#593c29;--anatomy-dot:#21150e;--anatomy-lit:#0d0705;--mat-body:#62422d;--mat-shine:#6e4a33;--mat-shade:#4e3424;--mat-edge:#1c110c}\n.iso[data-theme=\"dark\"] [data-mat=\"bean\"]{--anatomy-paper:#422c1e;--anatomy-face:#472f20;--anatomy-top:#503524;--anatomy-shade-0:#281a12;--anatomy-shade-1:#312116;--anatomy-shade-2:#3b271a;--anatomy-shade-3:#442d1f;--anatomy-lit-top:#553927;--anatomy-lit-shade:#3f2a1d;--anatomy-hi:#110b07;--anatomy-mid:#1e130d;--anatomy-lo:#2b1c13;--anatomy-faint:#372419;--anatomy-dot:#0e0906;--anatomy-lit:#5a3c29;--mat-body:#3f2a1d;--mat-shine:#533726;--mat-shade:#281a12;--mat-edge:#110b07}\n[data-mat=\"milk\"]{--anatomy-paper:#bdaf9b;--anatomy-face:#c6b8a3;--anatomy-top:#d5c7b2;--anatomy-shade-0:#8d7e6d;--anatomy-shade-1:#9f907e;--anatomy-shade-2:#b0a28f;--anatomy-shade-3:#c0b29e;--anatomy-lit-top:#ded0ba;--anatomy-lit-shade:#b9aa97;--anatomy-hi:#564739;--anatomy-mid:#766758;--anatomy-lo:#938473;--anatomy-faint:#a99b88;--anatomy-dot:#4d3d30;--anatomy-lit:#e6d8c2;--mat-body:#b9aa97;--mat-shine:#daccb7;--mat-shade:#8d7e6d;--mat-edge:#564739}\n.iso[data-theme=\"light\"] [data-mat=\"milk\"]{--anatomy-paper:#eee4d5;--anatomy-face:#f4eadb;--anatomy-top:#f8efe0;--anatomy-shade-0:#d7ccbd;--anatomy-shade-1:#e0d5c6;--anatomy-shade-2:#e8decf;--anatomy-shade-3:#f0e6d7;--anatomy-lit-top:#f8efe0;--anatomy-lit-shade:#eae0d0;--anatomy-hi:#7c695a;--anatomy-mid:#ab9c8d;--anatomy-lo:#cabdae;--anatomy-faint:#ded3c4;--anatomy-dot:#867565;--anatomy-lit:#4a3424;--mat-body:#eae0d0;--mat-shine:#f8efe0;--mat-shade:#cfc3b3;--mat-edge:#7c695a}\n.iso[data-theme=\"dark\"] [data-mat=\"milk\"]{--anatomy-paper:#bdaf9b;--anatomy-face:#c6b8a3;--anatomy-top:#d5c7b2;--anatomy-shade-0:#8d7e6d;--anatomy-shade-1:#9f907e;--anatomy-shade-2:#b0a28f;--anatomy-shade-3:#c0b29e;--anatomy-lit-top:#ded0ba;--anatomy-lit-shade:#b9aa97;--anatomy-hi:#564739;--anatomy-mid:#766758;--anatomy-lo:#938473;--anatomy-faint:#a99b88;--anatomy-dot:#4d3d30;--anatomy-lit:#e6d8c2;--mat-body:#b9aa97;--mat-shine:#daccb7;--mat-shade:#8d7e6d;--mat-edge:#564739}\n[data-mat=\"smoke\"]{--anatomy-paper:#4f565b;--anatomy-face:#555c61;--anatomy-top:#60686e;--anatomy-shade-0:#303437;--anatomy-shade-1:#3b4144;--anatomy-shade-2:#474d51;--anatomy-shade-3:#51585d;--anatomy-lit-top:#666f74;--anatomy-lit-shade:#4c5357;--anatomy-hi:#121416;--anatomy-mid:#232629;--anatomy-lo:#34383b;--anatomy-faint:#42484c;--anatomy-dot:#0e1011;--anatomy-lit:#6c757b;--mat-body:#4c5357;--mat-shine:#646c72;--mat-shade:#303437;--mat-edge:#121416}\n.iso[data-theme=\"light\"] [data-mat=\"smoke\"]{--anatomy-paper:#8f969c;--anatomy-face:#959da3;--anatomy-top:#9aa2a8;--anatomy-shade-0:#767d82;--anatomy-shade-1:#80878c;--anatomy-shade-2:#899095;--anatomy-shade-3:#91989e;--anatomy-lit-top:#9aa2a8;--anatomy-lit-shade:#8a9197;--anatomy-hi:#272a2c;--anatomy-mid:#4c5054;--anatomy-lo:#696f73;--anatomy-faint:#7e858a;--anatomy-dot:#2e3134;--anatomy-lit:#0f1113;--mat-body:#8a9197;--mat-shine:#9aa2a8;--mat-shade:#6e7478;--mat-edge:#272a2c}\n.iso[data-theme=\"dark\"] [data-mat=\"smoke\"]{--anatomy-paper:#4f565b;--anatomy-face:#555c61;--anatomy-top:#60686e;--anatomy-shade-0:#303437;--anatomy-shade-1:#3b4144;--anatomy-shade-2:#474d51;--anatomy-shade-3:#51585d;--anatomy-lit-top:#666f74;--anatomy-lit-shade:#4c5357;--anatomy-hi:#121416;--anatomy-mid:#232629;--anatomy-lo:#34383b;--anatomy-faint:#42484c;--anatomy-dot:#0e1011;--anatomy-lit:#6c757b;--mat-body:#4c5357;--mat-shine:#646c72;--mat-shade:#303437;--mat-edge:#121416}\n[data-mat=\"porcelain\"]{--anatomy-paper:#cfccc8;--anatomy-face:#dad7d3;--anatomy-top:#ecebe8;--anatomy-shade-0:#8e8b87;--anatomy-shade-1:#a7a4a0;--anatomy-shade-2:#bebbb7;--anatomy-shade-3:#d3d0cc;--anatomy-lit-top:#f6f5f3;--anatomy-lit-shade:#c9c6c2;--anatomy-hi:#3b3936;--anatomy-mid:#6e6b67;--anatomy-lo:#97938f;--anatomy-faint:#b5b2ae;--anatomy-dot:#2a2826;--anatomy-lit:#ffffff;--mat-body:#c9c6c2;--mat-shine:#f2f1ef;--mat-shade:#8e8b87;--mat-edge:#3b3936}\n.iso[data-theme=\"light\"] [data-mat=\"porcelain\"]{--anatomy-paper:#f4f3f1;--anatomy-face:#fbfaf8;--anatomy-top:#ffffff;--anatomy-shade-0:#d9d7d3;--anatomy-shade-1:#e4e2de;--anatomy-shade-2:#eeece9;--anatomy-shade-3:#f6f5f3;--anatomy-lit-top:#ffffff;--anatomy-lit-shade:#efeeeb;--anatomy-hi:#5d5a56;--anatomy-mid:#a19d98;--anatomy-lo:#c9c6c1;--anatomy-faint:#e2e0dc;--anatomy-dot:#6d6a66;--anatomy-lit:#000000;--mat-body:#efeeeb;--mat-shine:#ffffff;--mat-shade:#cfccc7;--mat-edge:#5d5a56}\n.iso[data-theme=\"dark\"] [data-mat=\"porcelain\"]{--anatomy-paper:#cfccc8;--anatomy-face:#dad7d3;--anatomy-top:#ecebe8;--anatomy-shade-0:#8e8b87;--anatomy-shade-1:#a7a4a0;--anatomy-shade-2:#bebbb7;--anatomy-shade-3:#d3d0cc;--anatomy-lit-top:#f6f5f3;--anatomy-lit-shade:#c9c6c2;--anatomy-hi:#3b3936;--anatomy-mid:#6e6b67;--anatomy-lo:#97938f;--anatomy-faint:#b5b2ae;--anatomy-dot:#2a2826;--anatomy-lit:#ffffff;--mat-body:#c9c6c2;--mat-shine:#f2f1ef;--mat-shade:#8e8b87;--mat-edge:#3b3936}\n[data-mat=\"lavender\"]{--anatomy-paper:#8a83a0;--anatomy-face:#9690ac;--anatomy-top:#c3bdd6;--anatomy-shade-0:#5b5470;--anatomy-shade-1:#6c6582;--anatomy-shade-2:#7e7795;--anatomy-shade-3:#9089a8;--anatomy-lit-top:#d6d0e6;--anatomy-lit-shade:#a8a1bf;--anatomy-hi:#2c2740;--anatomy-mid:#4f4866;--anatomy-lo:#6f6888;--anatomy-faint:#7e7795;--anatomy-dot:#ffffff;--anatomy-lit:#ffffff;--mat-body:#8a83a0;--mat-shine:#c3bdd6;--mat-shade:#4a4360;--mat-edge:#2c2740}\n.iso[data-theme=\"light\"] [data-mat=\"lavender\"]{--anatomy-paper:#d9d4e6;--anatomy-face:#e3dfee;--anatomy-top:#eeebf5;--anatomy-shade-0:#a59cc0;--anatomy-shade-1:#b5adcc;--anatomy-shade-2:#c5bed8;--anatomy-shade-3:#d4cee3;--anatomy-lit-top:#f4f1fa;--anatomy-lit-shade:#ddd8eb;--anatomy-hi:#3b3550;--anatomy-mid:#7d7596;--anatomy-lo:#aaa3c2;--anatomy-faint:#cbc6dc;--anatomy-dot:#4a4360;--anatomy-lit:#000000;--mat-body:#ccc6dc;--mat-shine:#f1eef8;--mat-shade:#a199bd;--mat-edge:#3b3550}\n.iso[data-theme=\"dark\"] [data-mat=\"lavender\"]{--anatomy-paper:#8a83a0;--anatomy-face:#9690ac;--anatomy-top:#c3bdd6;--anatomy-shade-0:#5b5470;--anatomy-shade-1:#6c6582;--anatomy-shade-2:#7e7795;--anatomy-shade-3:#9089a8;--anatomy-lit-top:#d6d0e6;--anatomy-lit-shade:#a8a1bf;--anatomy-hi:#2c2740;--anatomy-mid:#4f4866;--anatomy-lo:#6f6888;--anatomy-faint:#7e7795;--anatomy-dot:#ffffff;--anatomy-lit:#ffffff;--mat-body:#8a83a0;--mat-shine:#c3bdd6;--mat-shade:#4a4360;--mat-edge:#2c2740}\n[data-mat=\"knit\"]{--anatomy-paper:#7d7988;--anatomy-face:#888494;--anatomy-top:#aeaabb;--anatomy-shade-0:#55515f;--anatomy-shade-1:#64606f;--anatomy-shade-2:#736f7f;--anatomy-shade-3:#827e8f;--anatomy-lit-top:#c1bdcd;--anatomy-lit-shade:#8f8b9c;--anatomy-hi:#2e2b38;--anatomy-mid:#4a4656;--anatomy-lo:#5d5969;--anatomy-faint:#6c6878;--anatomy-dot:#ffffff;--anatomy-lit:#ffffff;--mat-body:#7d7988;--mat-shine:#aeaabb;--mat-shade:#4a4656;--mat-edge:#2e2b38}\n.iso[data-theme=\"light\"] [data-mat=\"knit\"]{--anatomy-paper:#cfccd6;--anatomy-face:#dad7e0;--anatomy-top:#e6e4eb;--anatomy-shade-0:#a29eae;--anatomy-shade-1:#b2aebd;--anatomy-shade-2:#c1bdcb;--anatomy-shade-3:#cfccd8;--anatomy-lit-top:#ece9f0;--anatomy-lit-shade:#d4d1dc;--anatomy-hi:#4a4656;--anatomy-mid:#8b8798;--anatomy-lo:#b1adbd;--anatomy-faint:#cac6d3;--anatomy-dot:#5a5666;--anatomy-lit:#000000;--mat-body:#c6c2cf;--mat-shine:#e6e4eb;--mat-shade:#a29eae;--mat-edge:#4a4656}\n.iso[data-theme=\"dark\"] [data-mat=\"knit\"]{--anatomy-paper:#7d7988;--anatomy-face:#888494;--anatomy-top:#aeaabb;--anatomy-shade-0:#55515f;--anatomy-shade-1:#64606f;--anatomy-shade-2:#736f7f;--anatomy-shade-3:#827e8f;--anatomy-lit-top:#c1bdcd;--anatomy-lit-shade:#8f8b9c;--anatomy-hi:#2e2b38;--anatomy-mid:#4a4656;--anatomy-lo:#5d5969;--anatomy-faint:#6c6878;--anatomy-dot:#ffffff;--anatomy-lit:#ffffff;--mat-body:#7d7988;--mat-shine:#aeaabb;--mat-shade:#4a4656;--mat-edge:#2e2b38}\n[data-mat] .tb-body{fill:var(--mat-body)}\n[data-mat] .tb-shine{fill:var(--mat-shine)}\n[data-mat] .tb-shade{fill:var(--mat-shade)}\n[data-mat] .tb-edge{stroke:var(--mat-edge)}\n.tb[data-hue=\"red\"]{--tb-ink:var(--anatomy-red)}\n.tb[data-hue=\"green\"]{--tb-ink:var(--anatomy-green)}\n.tb[data-hue=\"blue\"]{--tb-ink:var(--anatomy-blue)}\n.tb[data-hue] .tb-body{fill:color-mix(in srgb,var(--tb-ink) 54%,var(--anatomy-shade-2))}\n.tb[data-hue] .tb-shine{fill:color-mix(in srgb,var(--tb-ink) 16%,var(--anatomy-top))}\n.tb[data-hue] .tb-shade{fill:color-mix(in srgb,var(--tb-ink) 30%,var(--anatomy-hi))}\n.tb[data-hue] .tb-edge{stroke:color-mix(in srgb,var(--tb-ink) 38%,var(--anatomy-hi))}\n.tb[data-hue][data-mat] .tb-body{fill:color-mix(in srgb,var(--tb-ink) 62%,var(--mat-body))}\n.tb[data-hue][data-mat] .tb-shine{fill:color-mix(in srgb,var(--tb-ink) 22%,var(--mat-shine))}\n.tb[data-hue][data-mat] .tb-shade{fill:color-mix(in srgb,var(--tb-ink) 46%,var(--mat-shade))}\n.tb[data-hue][data-mat] .tb-edge{stroke:color-mix(in srgb,var(--tb-ink) 30%,var(--mat-edge))}\n.iso-turn{position:relative}\n.iso-turn>.iso-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}\n.iso-face-text[data-tone=\"lit\"]{fill:var(--anatomy-lit)}\n.iso-face-text[data-tone=\"mid\"]{fill:var(--anatomy-mid)}</style>");
host.innerHTML = '<div class="iso-stage iso-turn">' + "<svg xmlns=\"http://www.w3.org/2000/svg\" class=\"iso-svg\" viewBox=\"0 0 640 640\" role=\"img\" aria-label=\"A turned mechanism of eleven stacked modules, one per anime.js API, taken apart along its axis.\"></svg><svg xmlns=\"http://www.w3.org/2000/svg\" class=\"iso-svg iso-live iso-layer\" data-live=\"live\" viewBox=\"0 0 640 640\" aria-hidden=\"true\"><g class=\"iso-parts\" data-layer=\"live\"><g class=\"iso-solid\" data-p=\"15\" data-name=\"draggable.pin5\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M338.75 238.9L338.53 239.21L338.36 239.57L338.25 239.95L338.19 240.35L338.2 240.77L338.26 241.19L338.37 241.62L338.54 242.04L338.77 242.45L339.04 242.84L339.36 243.2L339.71 243.53L340.1 243.81L340.51 244.06L340.95 244.25L341.39 244.4L341.84 244.49L342.28 244.52L342.71 244.5L343.12 244.43L343.51 244.3L343.86 244.11L344.17 243.88L344.44 243.61L346.52 241.1L346.74 240.78L346.91 240.43L347.02 240.05L347.08 239.64L347.08 239.23L347.02 238.8L346.9 238.37L346.73 237.95L346.51 237.54L346.23 237.15L345.92 236.79L345.56 236.47L345.17 236.18L344.76 235.94L344.33 235.74L343.89 235.59L343.44 235.5L343 235.47L342.57 235.49L342.16 235.57L341.77 235.7L341.42 235.88L341.1 236.11L340.83 236.39Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M344.44 243.61L344.88 242.8L345.01 241.84L344.81 240.83L344.3 239.86L346.38 237.35L346.89 238.32L347.09 239.33L346.96 240.29L346.52 241.1Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M344.3 239.86L343.81 239.28L345.89 236.77L346.38 237.35Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M343.81 239.28L343.13 238.71L345.21 236.2L345.89 236.77Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M343.13 238.71L342.35 238.29L344.42 235.78L345.21 236.2Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M342.35 238.29L341.32 238.01L340.33 238.02L339.44 238.33L338.75 238.9L340.83 236.39L341.52 235.82L342.4 235.51L343.4 235.5L344.42 235.78Z\"/><path class=\"iso-tn\" data-r=\"k0\" data-b=\"2\" d=\"M341.6 238.05L340.29 238.03L339.19 238.49L338.45 239.38L338.19 240.54L338.45 241.82L339.19 243.01L340.29 243.93L341.6 244.45L342.9 244.47L344.01 244.01L344.75 243.13L345.01 241.96L344.75 240.68L344.01 239.49L342.9 238.57Z\"/><path class=\"iso-tn\" data-r=\"k1\" d=\"\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M344.44 243.61L344.95 242.56L344.94 241.31L344.43 240.05L343.48 238.98L342.25 238.25L340.92 237.98L339.69 238.2L338.75 238.9\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M338.75 238.9L338.53 239.21L338.36 239.57L338.25 239.95L338.19 240.35L338.2 240.77L338.26 241.19L338.37 241.62L338.54 242.04L338.77 242.45L339.04 242.84L339.36 243.2L339.71 243.53L340.1 243.81L340.51 244.06L340.95 244.25L341.39 244.4L341.84 244.49L342.28 244.52L342.71 244.5L343.12 244.43L343.51 244.3L343.86 244.11L344.17 243.88L344.44 243.61L346.52 241.1L346.74 240.78L346.91 240.43L347.02 240.05L347.08 239.64L347.08 239.23L347.02 238.8L346.9 238.37L346.73 237.95L346.51 237.54L346.23 237.15L345.92 236.79L345.56 236.47L345.17 236.18L344.76 235.94L344.33 235.74L343.89 235.59L343.44 235.5L343 235.47L342.57 235.49L342.16 235.57L341.77 235.7L341.42 235.88L341.1 236.11L340.83 236.39Z\"/></g><g class=\"iso-solid\" data-p=\"13\" data-name=\"draggable.pin4\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M295.56 243.61L295.82 243.87L296.11 244.1L296.45 244.28L296.82 244.41L297.21 244.49L297.62 244.52L298.04 244.5L298.47 244.43L298.9 244.31L299.31 244.14L299.72 243.93L300.1 243.67L300.46 243.37L300.78 243.04L301.07 242.69L301.32 242.31L301.52 241.91L301.67 241.5L301.76 241.09L301.81 240.68L301.8 240.28L301.74 239.9L301.62 239.54L301.46 239.2L301.25 238.9L299.17 236.39L298.9 236.11L298.58 235.88L298.23 235.7L297.84 235.57L297.43 235.49L297 235.47L296.56 235.5L296.11 235.59L295.67 235.74L295.24 235.94L294.83 236.18L294.44 236.47L294.08 236.79L293.77 237.15L293.49 237.54L293.27 237.95L293.1 238.37L292.98 238.8L292.92 239.23L292.92 239.64L292.98 240.05L293.09 240.43L293.26 240.78L293.48 241.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M301.25 238.9L301.1 238.74L299.03 236.23L299.17 236.39Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M295.33 243.27L295.56 243.61L293.48 241.1L293.25 240.76ZM301.1 238.74L300.62 238.36L298.54 235.85L299.03 236.23Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M295.06 242.6L295.33 243.27L293.25 240.76L292.99 240.09ZM300.62 238.36L299.94 238.08L297.86 235.57L298.54 235.85Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M294.99 241.84L295.06 242.6L292.99 240.09L292.91 239.33ZM299.94 238.08L299.15 237.98L297.07 235.47L297.86 235.57Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M299.15 237.98L297.96 238.17L296.82 238.74L295.88 239.62L295.24 240.69L294.99 241.84L292.91 239.33L293.17 238.19L293.8 237.11L294.75 236.23L295.88 235.66L297.07 235.47Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"M298.4 238.05L297.1 238.57L295.99 239.49L295.25 240.68L294.99 241.96L295.25 243.13L295.99 244.01L297.1 244.47L298.4 244.45L299.71 243.93L300.81 243.01L301.55 241.82L301.81 240.54L301.55 239.38L300.81 238.49L299.71 238.03Z\"/><path class=\"iso-tn\" data-r=\"k1\" d=\"\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M301.25 238.9L300.31 238.2L299.08 237.98L297.75 238.25L296.52 238.98L295.57 240.05L295.06 241.31L295.05 242.56L295.56 243.61\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M295.56 243.61L295.82 243.87L296.11 244.1L296.45 244.28L296.82 244.41L297.21 244.49L297.62 244.52L298.04 244.5L298.47 244.43L298.9 244.31L299.31 244.14L299.72 243.93L300.1 243.67L300.46 243.37L300.78 243.04L301.07 242.69L301.32 242.31L301.52 241.91L301.67 241.5L301.76 241.09L301.81 240.68L301.8 240.28L301.74 239.9L301.62 239.54L301.46 239.2L301.25 238.9L299.17 236.39L298.9 236.11L298.58 235.88L298.23 235.7L297.84 235.57L297.43 235.49L297 235.47L296.56 235.5L296.11 235.59L295.67 235.74L295.24 235.94L294.83 236.18L294.44 236.47L294.08 236.79L293.77 237.15L293.49 237.54L293.27 237.95L293.1 238.37L292.98 238.8L292.92 239.23L292.92 239.64L292.98 240.05L293.09 240.43L293.26 240.78L293.48 241.1Z\"/></g><g class=\"iso-solid\" data-p=\"0\" data-name=\"scope.flange\" data-mat=\"gunmetal\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M398.18 320L398.16 320.75L398.12 321.5L398.05 322.25L397.95 322.99L397.82 323.74L397.66 324.48L397.48 325.23L397.26 325.97L397.02 326.71L396.75 327.44L396.45 328.18L396.12 328.91L395.77 329.63L395.38 330.36L394.97 331.08L394.53 331.79L394.07 332.51L393.58 333.21L393.06 333.91L392.51 334.61L391.94 335.3L391.34 335.99L390.71 336.67L390.06 337.34L389.38 338.01L388.68 338.67L387.95 339.33L387.2 339.98L386.42 340.62L385.62 341.25L384.79 341.87L383.94 342.49L383.07 343.1L382.17 343.7L381.25 344.29L380.31 344.87L379.35 345.44L378.36 346.01L377.36 346.56L376.33 347.11L375.28 347.64L374.21 348.16L373.12 348.68L372.01 349.18L370.89 349.67L369.74 350.16L368.58 350.63L367.39 351.09L366.19 351.54L364.98 351.97L363.74 352.4L362.49 352.81L361.23 353.21L359.95 353.6L358.66 353.98L357.35 354.34L356.02 354.69L354.69 355.03L353.34 355.36L351.98 355.67L350.61 355.97L349.22 356.25L347.83 356.53L346.43 356.79L345.01 357.03L343.59 357.27L342.16 357.49L340.72 357.69L339.27 357.88L337.81 358.06L336.35 358.22L334.88 358.37L333.41 358.51L331.93 358.63L330.45 358.74L328.97 358.83L327.48 358.91L325.98 358.97L324.49 359.02L322.99 359.06L321.5 359.08L320 359.09L318.5 359.08L317.01 359.06L315.51 359.02L314.02 358.97L312.52 358.91L311.03 358.83L309.55 358.74L308.07 358.63L306.59 358.51L305.12 358.37L303.65 358.22L302.19 358.06L300.73 357.88L299.28 357.69L297.84 357.49L296.41 357.27L294.99 357.03L293.57 356.79L292.17 356.53L290.78 356.25L289.39 355.97L288.02 355.67L286.66 355.36L285.31 355.03L283.98 354.69L282.65 354.34L281.34 353.98L280.05 353.6L278.77 353.21L277.51 352.81L276.26 352.4L275.02 351.97L273.81 351.54L272.61 351.09L271.42 350.63L270.26 350.16L269.11 349.67L267.99 349.18L266.88 348.68L265.79 348.16L264.72 347.64L263.67 347.11L262.64 346.56L261.64 346.01L260.65 345.44L259.69 344.87L258.75 344.29L257.83 343.7L256.93 343.1L256.06 342.49L255.21 341.87L254.38 341.25L253.58 340.62L252.8 339.98L252.05 339.33L251.32 338.67L250.62 338.01L249.94 337.34L249.29 336.67L248.66 335.99L248.06 335.3L247.49 334.61L246.94 333.91L246.42 333.21L245.93 332.51L245.47 331.79L245.03 331.08L244.62 330.36L244.23 329.63L243.88 328.91L243.55 328.18L243.25 327.44L242.98 326.71L242.74 325.97L242.52 325.23L242.34 324.48L242.18 323.74L242.05 322.99L241.95 322.25L241.88 321.5L241.84 320.75L241.82 320L241.82 314.36L241.84 313.61L241.88 312.86L241.95 312.11L242.05 311.37L242.18 310.62L242.34 309.88L242.52 309.13L242.74 308.39L242.98 307.65L243.25 306.92L243.55 306.18L243.88 305.45L244.23 304.72L244.62 304L245.03 303.28L245.47 302.56L245.93 301.85L246.42 301.15L246.94 300.44L247.49 299.75L248.06 299.05L248.66 298.37L249.29 297.69L249.94 297.01L250.62 296.35L251.32 295.68L252.05 295.03L252.8 294.38L253.58 293.74L254.38 293.11L255.21 292.49L256.06 291.87L256.93 291.26L257.83 290.66L258.75 290.07L259.69 289.49L260.65 288.91L261.64 288.35L262.64 287.8L263.67 287.25L264.72 286.72L265.79 286.19L266.88 285.68L267.99 285.18L269.11 284.68L270.26 284.2L271.42 283.73L272.61 283.27L273.81 282.82L275.02 282.39L276.26 281.96L277.51 281.55L278.77 281.15L280.05 280.76L281.34 280.38L282.65 280.02L283.98 279.67L285.31 279.33L286.66 279L288.02 278.69L289.39 278.39L290.78 278.1L292.17 277.83L293.57 277.57L294.99 277.32L296.41 277.09L297.84 276.87L299.28 276.67L300.73 276.48L302.19 276.3L303.65 276.13L305.12 275.98L306.59 275.85L308.07 275.73L309.55 275.62L311.03 275.53L312.52 275.45L314.02 275.38L315.51 275.33L317.01 275.3L318.5 275.28L320 275.27L321.5 275.28L322.99 275.3L324.49 275.33L325.98 275.38L327.48 275.45L328.97 275.53L330.45 275.62L331.93 275.73L333.41 275.85L334.88 275.98L336.35 276.13L337.81 276.3L339.27 276.48L340.72 276.67L342.16 276.87L343.59 277.09L345.01 277.32L346.43 277.57L347.83 277.83L349.22 278.1L350.61 278.39L351.98 278.69L353.34 279L354.69 279.33L356.02 279.67L357.35 280.02L358.66 280.38L359.95 280.76L361.23 281.15L362.49 281.55L363.74 281.96L364.98 282.39L366.19 282.82L367.39 283.27L368.58 283.73L369.74 284.2L370.89 284.68L372.01 285.18L373.12 285.68L374.21 286.19L375.28 286.72L376.33 287.25L377.36 287.8L378.36 288.35L379.35 288.91L380.31 289.49L381.25 290.07L382.17 290.66L383.07 291.26L383.94 291.87L384.79 292.49L385.62 293.11L386.42 293.74L387.2 294.38L387.95 295.03L388.68 295.68L389.38 296.35L390.06 297.01L390.71 297.69L391.34 298.37L391.94 299.05L392.51 299.75L393.06 300.44L393.58 301.15L394.07 301.85L394.53 302.56L394.97 303.28L395.38 304L395.77 304.72L396.12 305.45L396.45 306.18L396.75 306.92L397.02 307.65L397.26 308.39L397.48 309.13L397.66 309.88L397.82 310.62L397.95 311.37L398.05 312.11L398.12 312.86L398.16 313.61L398.18 314.36Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M398.18 320L398.01 322.56L397.51 325.1L396.68 327.63L395.51 330.12L394.03 332.56L392.23 334.96L390.12 337.29L387.7 339.54L385 341.72L382.02 343.8L378.78 345.77L375.28 347.64L371.55 349.39L367.59 351.01L363.43 352.5L359.09 353.85L354.58 355.06L349.92 356.11L345.13 357.01L340.23 357.76L335.25 358.34L330.2 358.75L325.11 359.01L320 359.09L320 353.45L325.11 353.36L330.2 353.11L335.25 352.7L340.23 352.11L345.13 351.37L349.92 350.47L354.58 349.42L359.09 348.21L363.43 346.86L367.59 345.37L371.55 343.75L375.28 342L378.78 340.13L382.02 338.15L385 336.07L387.7 333.9L390.12 331.65L392.23 329.32L394.03 326.92L395.51 324.47L396.68 321.98L397.51 319.46L398.01 316.91L398.18 314.36Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M320 359.09L315.04 359.01L310.09 358.77L305.19 358.38L300.34 357.83L295.58 357.13L295.58 351.49L300.34 352.19L305.19 352.74L310.09 353.13L315.04 353.37L320 353.45Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M295.58 357.13L291.4 356.38L287.31 355.51L283.33 354.52L279.47 353.42L275.73 352.22L272.15 350.91L268.71 349.5L268.71 343.86L272.15 345.27L275.73 346.58L279.47 347.78L283.33 348.88L287.31 349.87L291.4 350.74L295.58 351.49Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M268.71 349.5L265.25 347.9L261.98 346.2L258.93 344.4L256.09 342.52L253.49 340.55L251.14 338.5L249.03 336.39L247.18 334.22L245.6 332L244.29 329.74L244.29 324.1L245.6 326.36L247.18 328.58L249.03 330.75L251.14 332.86L253.49 334.91L256.09 336.87L258.93 338.76L261.98 340.56L265.25 342.26L268.71 343.86Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M244.29 329.74L243.21 327.34L242.44 324.91L241.98 322.46L241.82 320L241.82 314.36L241.98 316.82L242.44 319.27L243.21 321.7L244.29 324.1Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M375.28 342L373.07 343.06L370.77 344.08L368.4 345.06L365.95 345.98L363.43 346.86L360.85 347.69L358.2 348.46L355.49 349.19L352.73 349.86L349.92 350.47L347.06 351.03L344.16 351.53L341.22 351.98L338.25 352.37L335.25 352.7L332.23 352.97L329.19 353.18L326.13 353.33L323.07 353.42L320 353.45L316.93 353.42L313.87 353.33L310.81 353.18L307.77 352.97L304.75 352.7L301.75 352.37L298.78 351.98L295.84 351.53L292.94 351.03L290.08 350.47L287.27 349.86L284.51 349.19L281.8 348.46L279.15 347.69L276.57 346.86L274.05 345.98L271.6 345.06L269.23 344.08L266.93 343.06L264.72 342L262.59 340.89L260.55 339.74L258.61 338.56L256.75 337.33L255 336.07L253.34 334.78L251.79 333.46L250.34 332.1L249 330.72L247.77 329.32L246.65 327.89L245.65 326.44L244.76 324.97L243.98 323.48L243.32 321.98L242.78 320.47L242.36 318.95L242.06 317.42L241.88 315.89L241.82 314.36L241.88 312.82L242.06 311.29L242.36 309.76L242.78 308.24L243.32 306.73L243.98 305.23L244.76 303.75L245.65 302.28L246.65 300.83L247.77 299.4L249 297.99L250.34 296.61L251.79 295.26L253.34 293.93L255 292.64L256.75 291.38L258.61 290.16L260.55 288.97L262.59 287.82L264.72 286.72L266.93 285.65L269.23 284.63L271.6 283.66L274.05 282.73L276.57 281.86L279.15 281.03L281.8 280.25L284.51 279.53L287.27 278.86L290.08 278.24L292.94 277.69L295.84 277.18L298.78 276.74L301.75 276.35L304.75 276.02L307.77 275.75L310.81 275.54L313.87 275.39L316.93 275.3L320 275.27L323.07 275.3L326.13 275.39L329.19 275.54L332.23 275.75L335.25 276.02L338.25 276.35L341.22 276.74L344.16 277.18L347.06 277.69L349.92 278.24L352.73 278.86L355.49 279.53L358.2 280.25L360.85 281.03L363.43 281.86L365.95 282.73L368.4 283.66L370.77 284.63L373.07 285.65L375.28 286.72L377.41 287.82L379.45 288.97L381.39 290.16L383.25 291.38L385 292.64L386.66 293.93L388.21 295.26L389.66 296.61L391 297.99L392.23 299.4L393.35 300.83L394.35 302.28L395.24 303.75L396.02 305.23L396.68 306.73L397.22 308.24L397.64 309.76L397.94 311.29L398.12 312.82L398.18 314.36L398.12 315.89L397.94 317.42L397.64 318.95L397.22 320.47L396.68 321.98L396.02 323.48L395.24 324.97L394.35 326.44L393.35 327.89L392.23 329.32L391 330.72L389.66 332.1L388.21 333.46L386.66 334.78L385 336.07L383.25 337.33L381.39 338.56L379.45 339.74L377.41 340.89Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M398.18 314.36L398.16 315.11L398.12 315.86L398.05 316.6L397.95 317.35L397.82 318.1L397.66 318.84L397.48 319.58L397.26 320.32L397.02 321.06L396.75 321.8L396.45 322.53L396.12 323.26L395.77 323.99L395.38 324.72L394.97 325.44L394.53 326.15L394.07 326.86L393.58 327.57L393.06 328.27L392.51 328.97L391.94 329.66L391.34 330.35L390.71 331.03L390.06 331.7L389.38 332.37L388.68 333.03L387.95 333.69L387.2 334.33L386.42 334.97L385.62 335.61L384.79 336.23L383.94 336.85L383.07 337.45L382.17 338.05L381.25 338.65L380.31 339.23L379.35 339.8L378.36 340.36L377.36 340.92L376.33 341.46L375.28 342L374.21 342.52L373.12 343.04L372.01 343.54L370.89 344.03L369.74 344.51L368.58 344.99L367.39 345.45L366.19 345.89L364.98 346.33L363.74 346.75L362.49 347.17L361.23 347.57L359.95 347.96L358.66 348.33L357.35 348.7L356.02 349.05L354.69 349.39L353.34 349.71L351.98 350.03L350.61 350.33L349.22 350.61L347.83 350.89L346.43 351.15L345.01 351.39L343.59 351.63L342.16 351.84L340.72 352.05L339.27 352.24L337.81 352.42L336.35 352.58L334.88 352.73L333.41 352.87L331.93 352.99L330.45 353.1L328.97 353.19L327.48 353.27L325.98 353.33L324.49 353.38L322.99 353.42L321.5 353.44L320 353.45L318.5 353.44L317.01 353.42L315.51 353.38L314.02 353.33L312.52 353.27L311.03 353.19L309.55 353.1L308.07 352.99L306.59 352.87L305.12 352.73L303.65 352.58L302.19 352.42L300.73 352.24L299.28 352.05L297.84 351.84L296.41 351.63L294.99 351.39L293.57 351.15L292.17 350.89L290.78 350.61L289.39 350.33L288.02 350.03L286.66 349.71L285.31 349.39L283.98 349.05L282.65 348.7L281.34 348.33L280.05 347.96L278.77 347.57L277.51 347.17L276.26 346.75L275.02 346.33L273.81 345.89L272.61 345.45L271.42 344.99L270.26 344.51L269.11 344.03L267.99 343.54L266.88 343.04L265.79 342.52L264.72 342L263.67 341.46L262.64 340.92L261.64 340.36L260.65 339.8L259.69 339.23L258.75 338.65L257.83 338.05L256.93 337.45L256.06 336.85L255.21 336.23L254.38 335.61L253.58 334.97L252.8 334.33L252.05 333.69L251.32 333.03L250.62 332.37L249.94 331.7L249.29 331.03L248.66 330.35L248.06 329.66L247.49 328.97L246.94 328.27L246.42 327.57L245.93 326.86L245.47 326.15L245.03 325.44L244.62 324.72L244.23 323.99L243.88 323.26L243.55 322.53L243.25 321.8L242.98 321.06L242.74 320.32L242.52 319.58L242.34 318.84L242.18 318.1L242.05 317.35L241.95 316.6L241.88 315.86L241.84 315.11L241.82 314.36\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"inner\" d=\"M398.18 317.48L398.15 318.23L398.09 318.98L398.01 319.73L397.9 320.47L397.76 321.22L397.59 321.97L397.39 322.71L397.17 323.45L396.91 324.19L396.63 324.92L396.32 325.66L395.98 326.39L395.61 327.11L395.21 327.84L394.79 328.56L394.34 329.27L393.86 329.98L393.36 330.69L392.83 331.39L392.27 332.09L391.68 332.78L391.07 333.46L390.44 334.14L389.77 334.81L389.08 335.48L388.37 336.14L387.63 336.79L386.86 337.43L386.07 338.07L385.26 338.7L384.42 339.32L383.56 339.94L382.68 340.54L381.77 341.14L380.84 341.73L379.89 342.3L378.91 342.87L377.92 343.43L376.9 343.99L375.86 344.53L374.8 345.06L373.72 345.58L372.62 346.09L371.5 346.59L370.37 347.07L369.21 347.55L368.04 348.02L366.84 348.47L365.64 348.92L364.41 349.35L363.17 349.77L361.91 350.18L360.64 350.57L359.35 350.96L358.05 351.33L356.73 351.69L355.4 352.03L354.05 352.36L352.7 352.68L351.33 352.99L349.95 353.29L348.56 353.57L347.16 353.83L345.75 354.09L344.33 354.33L342.9 354.55L341.46 354.77L340.02 354.96L338.56 355.15L337.1 355.32L335.64 355.48L334.17 355.62L332.69 355.75L331.21 355.86L329.72 355.96L328.23 356.05L326.74 356.12L325.24 356.18L323.75 356.22L322.25 356.25L320.75 356.27L319.25 356.27L317.75 356.25L316.25 356.22L314.76 356.18L313.26 356.12L311.77 356.05L310.28 355.96L308.79 355.86L307.31 355.75L305.83 355.62L304.36 355.48L302.9 355.32L301.44 355.15L299.98 354.96L298.54 354.77L297.1 354.55L295.67 354.33L294.25 354.09L292.84 353.83L291.44 353.57L290.05 353.29L288.67 352.99L287.3 352.68L285.95 352.36L284.6 352.03L283.27 351.69L281.95 351.33L280.65 350.96L279.36 350.57L278.09 350.18L276.83 349.77L275.59 349.35L274.36 348.92L273.16 348.47L271.96 348.02L270.79 347.55L269.63 347.07L268.5 346.59L267.38 346.09L266.28 345.58L265.2 345.06L264.14 344.53L263.1 343.99L262.08 343.43L261.09 342.87L260.11 342.3L259.16 341.73L258.23 341.14L257.32 340.54L256.44 339.94L255.58 339.32L254.74 338.7L253.93 338.07L253.14 337.43L252.37 336.79L251.63 336.14L250.92 335.48L250.23 334.81L249.56 334.14L248.93 333.46L248.32 332.78L247.73 332.09L247.17 331.39L246.64 330.69L246.14 329.98L245.66 329.27L245.21 328.56L244.79 327.84L244.39 327.11L244.02 326.39L243.68 325.66L243.37 324.92L243.09 324.19L242.83 323.45L242.61 322.71L242.41 321.97L242.24 321.22L242.1 320.47L241.99 319.73L241.91 318.98L241.85 318.23L241.82 317.48\"/><g data-r=\"plane0\" transform=\"matrix(0.76778 0.38389 -0.76778 0.38389 320 320.02)\" opacity=\"0\"><path class=\"iso-line\" data-tone=\"mid\" d=\"M60.000 0.000L59.815 4.708L59.261 9.386L58.342 14.007L57.063 18.541L55.433 22.961L53.460 27.239L51.158 31.350L48.541 35.267L45.624 38.967L42.426 42.426L38.967 45.624L35.267 48.541L31.350 51.158L27.239 53.460L22.961 55.433L18.541 57.063L14.007 58.342L9.386 59.261L4.708 59.815L0.000 60.000L-4.708 59.815L-9.386 59.261L-14.007 58.342L-18.541 57.063L-22.961 55.433L-27.239 53.460L-31.350 51.158L-35.267 48.541L-38.967 45.624L-42.426 42.426L-45.624 38.967L-48.541 35.267L-51.158 31.350L-53.460 27.239L-55.433 22.961L-57.063 18.541L-58.342 14.007L-59.261 9.386L-59.815 4.708L-60.000 0.000L-59.815 -4.708L-59.261 -9.386L-58.342 -14.007L-57.063 -18.541L-55.433 -22.961L-53.460 -27.239L-51.158 -31.350L-48.541 -35.267L-45.624 -38.967L-42.426 -42.426L-38.967 -45.624L-35.267 -48.541L-31.350 -51.158L-27.239 -53.460L-22.961 -55.433L-18.541 -57.063L-14.007 -58.342L-9.386 -59.261L-4.708 -59.815L-0.000 -60.000L4.708 -59.815L9.386 -59.261L14.007 -58.342L18.541 -57.063L22.961 -55.433L27.239 -53.460L31.350 -51.158L35.267 -48.541L38.967 -45.624L42.426 -42.426L45.624 -38.967L48.541 -35.267L51.158 -31.350L53.460 -27.239L55.433 -22.961L57.063 -18.541L58.342 -14.007L59.261 -9.386L59.815 -4.708ZM46.000 0.000L45.778 4.509L45.116 8.974L44.019 13.353L42.498 17.603L40.568 21.684L38.248 25.556L35.558 29.182L32.527 32.527L29.182 35.558L25.556 38.248L21.684 40.568L17.603 42.498L13.353 44.019L8.974 45.116L4.509 45.778L0.000 46.000L-4.509 45.778L-8.974 45.116L-13.353 44.019L-17.603 42.498L-21.684 40.568L-25.556 38.248L-29.182 35.558L-32.527 32.527L-35.558 29.182L-38.248 25.556L-40.568 21.684L-42.498 17.603L-44.019 13.353L-45.116 8.974L-45.778 4.509L-46.000 0.000L-45.778 -4.509L-45.116 -8.974L-44.019 -13.353L-42.498 -17.603L-40.568 -21.684L-38.248 -25.556L-35.558 -29.182L-32.527 -32.527L-29.182 -35.558L-25.556 -38.248L-21.684 -40.568L-17.603 -42.498L-13.353 -44.019L-8.974 -45.116L-4.509 -45.778L-0.000 -46.000L4.509 -45.778L8.974 -45.116L13.353 -44.019L17.603 -42.498L21.684 -40.568L25.556 -38.248L29.182 -35.558L32.527 -32.527L35.558 -29.182L38.248 -25.556L40.568 -21.684L42.498 -17.603L44.019 -13.353L45.116 -8.974L45.778 -4.509ZM18.000 0.000L17.778 2.816L17.119 5.562L16.038 8.172L14.562 10.580L12.728 12.728L10.580 14.562L8.172 16.038L5.562 17.119L2.816 17.778L0.000 18.000L-2.816 17.778L-5.562 17.119L-8.172 16.038L-10.580 14.562L-12.728 12.728L-14.562 10.580L-16.038 8.172L-17.119 5.562L-17.778 2.816L-18.000 0.000L-17.778 -2.816L-17.119 -5.562L-16.038 -8.172L-14.562 -10.580L-12.728 -12.728L-10.580 -14.562L-8.172 -16.038L-5.562 -17.119L-2.816 -17.778L-0.000 -18.000L2.816 -17.778L5.562 -17.119L8.172 -16.038L10.580 -14.562L12.728 -12.728L14.562 -10.580L16.038 -8.172L17.119 -5.562L17.778 -2.816Z\"/></g><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M398.18 320L398.16 320.75L398.12 321.5L398.05 322.25L397.95 322.99L397.82 323.74L397.66 324.48L397.48 325.23L397.26 325.97L397.02 326.71L396.75 327.44L396.45 328.18L396.12 328.91L395.77 329.63L395.38 330.36L394.97 331.08L394.53 331.79L394.07 332.51L393.58 333.21L393.06 333.91L392.51 334.61L391.94 335.3L391.34 335.99L390.71 336.67L390.06 337.34L389.38 338.01L388.68 338.67L387.95 339.33L387.2 339.98L386.42 340.62L385.62 341.25L384.79 341.87L383.94 342.49L383.07 343.1L382.17 343.7L381.25 344.29L380.31 344.87L379.35 345.44L378.36 346.01L377.36 346.56L376.33 347.11L375.28 347.64L374.21 348.16L373.12 348.68L372.01 349.18L370.89 349.67L369.74 350.16L368.58 350.63L367.39 351.09L366.19 351.54L364.98 351.97L363.74 352.4L362.49 352.81L361.23 353.21L359.95 353.6L358.66 353.98L357.35 354.34L356.02 354.69L354.69 355.03L353.34 355.36L351.98 355.67L350.61 355.97L349.22 356.25L347.83 356.53L346.43 356.79L345.01 357.03L343.59 357.27L342.16 357.49L340.72 357.69L339.27 357.88L337.81 358.06L336.35 358.22L334.88 358.37L333.41 358.51L331.93 358.63L330.45 358.74L328.97 358.83L327.48 358.91L325.98 358.97L324.49 359.02L322.99 359.06L321.5 359.08L320 359.09L318.5 359.08L317.01 359.06L315.51 359.02L314.02 358.97L312.52 358.91L311.03 358.83L309.55 358.74L308.07 358.63L306.59 358.51L305.12 358.37L303.65 358.22L302.19 358.06L300.73 357.88L299.28 357.69L297.84 357.49L296.41 357.27L294.99 357.03L293.57 356.79L292.17 356.53L290.78 356.25L289.39 355.97L288.02 355.67L286.66 355.36L285.31 355.03L283.98 354.69L282.65 354.34L281.34 353.98L280.05 353.6L278.77 353.21L277.51 352.81L276.26 352.4L275.02 351.97L273.81 351.54L272.61 351.09L271.42 350.63L270.26 350.16L269.11 349.67L267.99 349.18L266.88 348.68L265.79 348.16L264.72 347.64L263.67 347.11L262.64 346.56L261.64 346.01L260.65 345.44L259.69 344.87L258.75 344.29L257.83 343.7L256.93 343.1L256.06 342.49L255.21 341.87L254.38 341.25L253.58 340.62L252.8 339.98L252.05 339.33L251.32 338.67L250.62 338.01L249.94 337.34L249.29 336.67L248.66 335.99L248.06 335.3L247.49 334.61L246.94 333.91L246.42 333.21L245.93 332.51L245.47 331.79L245.03 331.08L244.62 330.36L244.23 329.63L243.88 328.91L243.55 328.18L243.25 327.44L242.98 326.71L242.74 325.97L242.52 325.23L242.34 324.48L242.18 323.74L242.05 322.99L241.95 322.25L241.88 321.5L241.84 320.75L241.82 320L241.82 314.36L241.84 313.61L241.88 312.86L241.95 312.11L242.05 311.37L242.18 310.62L242.34 309.88L242.52 309.13L242.74 308.39L242.98 307.65L243.25 306.92L243.55 306.18L243.88 305.45L244.23 304.72L244.62 304L245.03 303.28L245.47 302.56L245.93 301.85L246.42 301.15L246.94 300.44L247.49 299.75L248.06 299.05L248.66 298.37L249.29 297.69L249.94 297.01L250.62 296.35L251.32 295.68L252.05 295.03L252.8 294.38L253.58 293.74L254.38 293.11L255.21 292.49L256.06 291.87L256.93 291.26L257.83 290.66L258.75 290.07L259.69 289.49L260.65 288.91L261.64 288.35L262.64 287.8L263.67 287.25L264.72 286.72L265.79 286.19L266.88 285.68L267.99 285.18L269.11 284.68L270.26 284.2L271.42 283.73L272.61 283.27L273.81 282.82L275.02 282.39L276.26 281.96L277.51 281.55L278.77 281.15L280.05 280.76L281.34 280.38L282.65 280.02L283.98 279.67L285.31 279.33L286.66 279L288.02 278.69L289.39 278.39L290.78 278.1L292.17 277.83L293.57 277.57L294.99 277.32L296.41 277.09L297.84 276.87L299.28 276.67L300.73 276.48L302.19 276.3L303.65 276.13L305.12 275.98L306.59 275.85L308.07 275.73L309.55 275.62L311.03 275.53L312.52 275.45L314.02 275.38L315.51 275.33L317.01 275.3L318.5 275.28L320 275.27L321.5 275.28L322.99 275.3L324.49 275.33L325.98 275.38L327.48 275.45L328.97 275.53L330.45 275.62L331.93 275.73L333.41 275.85L334.88 275.98L336.35 276.13L337.81 276.3L339.27 276.48L340.72 276.67L342.16 276.87L343.59 277.09L345.01 277.32L346.43 277.57L347.83 277.83L349.22 278.1L350.61 278.39L351.98 278.69L353.34 279L354.69 279.33L356.02 279.67L357.35 280.02L358.66 280.38L359.95 280.76L361.23 281.15L362.49 281.55L363.74 281.96L364.98 282.39L366.19 282.82L367.39 283.27L368.58 283.73L369.74 284.2L370.89 284.68L372.01 285.18L373.12 285.68L374.21 286.19L375.28 286.72L376.33 287.25L377.36 287.8L378.36 288.35L379.35 288.91L380.31 289.49L381.25 290.07L382.17 290.66L383.07 291.26L383.94 291.87L384.79 292.49L385.62 293.11L386.42 293.74L387.2 294.38L387.95 295.03L388.68 295.68L389.38 296.35L390.06 297.01L390.71 297.69L391.34 298.37L391.94 299.05L392.51 299.75L393.06 300.44L393.58 301.15L394.07 301.85L394.53 302.56L394.97 303.28L395.38 304L395.77 304.72L396.12 305.45L396.45 306.18L396.75 306.92L397.02 307.65L397.26 308.39L397.48 309.13L397.66 309.88L397.82 310.62L397.95 311.37L398.05 312.11L398.12 312.86L398.16 313.61L398.18 314.36Z\"/><g class=\"iso-dots\" data-tone=\"lo\"><circle data-r=\"c0\" cx=\"370.67\" cy=\"339.69\" r=\"1.1\" fill-opacity=\"1\"/><circle data-r=\"c1\" cx=\"338.55\" cy=\"348.97\" r=\"1.1\" fill-opacity=\"1\"/><circle data-r=\"c2\" cx=\"301.45\" cy=\"348.97\" r=\"1.1\" fill-opacity=\"1\"/><circle data-r=\"c3\" cx=\"269.33\" cy=\"339.69\" r=\"1.1\" fill-opacity=\"1\"/><circle data-r=\"c4\" cx=\"250.78\" cy=\"323.63\" r=\"1.1\" fill-opacity=\"1\"/><circle data-r=\"c5\" cx=\"250.78\" cy=\"305.08\" r=\"1.1\" fill-opacity=\"1\"/><circle data-r=\"c6\" cx=\"269.33\" cy=\"289.02\" r=\"1.1\" fill-opacity=\"1\"/><circle data-r=\"c7\" cx=\"301.45\" cy=\"279.75\" r=\"1.1\" fill-opacity=\"1\"/><circle data-r=\"c8\" cx=\"338.55\" cy=\"279.75\" r=\"1.1\" fill-opacity=\"1\"/><circle data-r=\"c9\" cx=\"370.67\" cy=\"289.02\" r=\"1.1\" fill-opacity=\"1\"/><circle data-r=\"c10\" cx=\"389.22\" cy=\"305.08\" r=\"1.1\" fill-opacity=\"1\"/><circle data-r=\"c11\" cx=\"389.22\" cy=\"323.63\" r=\"1.1\" fill-opacity=\"1\"/></g></g><g class=\"iso-solid\" data-p=\"1\" data-name=\"scope.lip\" data-mat=\"steel\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M374.97 294.92L375.82 295.54L376.64 296.16L377.43 296.8L378.2 297.44L378.93 298.09L379.64 298.75L380.32 299.41L380.97 300.08L381.59 300.76L382.17 301.45L382.73 302.14L383.26 302.84L383.75 303.55L384.22 304.26L384.65 304.97L385.05 305.69L385.42 306.42L385.76 307.15L386.06 307.88L386.33 308.61L386.57 309.35L386.78 310.09L386.95 310.83L387.09 311.57L387.2 312.32L387.27 313.07L387.31 313.81L387.32 314.56L387.29 315.31L387.23 316.05L387.14 316.8L387.02 317.54L386.86 318.29L386.67 319.03L386.44 319.77L386.19 320.5L385.9 321.24L385.58 321.96L385.22 322.69L384.84 323.41L384.42 324.13L383.97 324.84L383.49 325.55L382.98 326.25L382.43 326.95L381.86 327.64L381.26 328.32L380.62 329L379.96 329.67L379.26 330.33L378.54 330.98L377.79 331.63L377 332.26L376.2 332.89L375.36 333.51L374.5 334.12L373.61 334.72L372.69 335.31L371.75 335.89L370.78 336.46L369.78 337.02L368.77 337.56L367.72 338.1L366.66 338.62L365.57 339.13L364.46 339.63L363.33 340.12L362.17 340.59L361 341.06L359.8 341.5L358.59 341.94L357.35 342.36L356.1 342.77L354.83 343.16L353.54 343.54L352.24 343.91L350.92 344.26L349.59 344.59L348.24 344.91L346.87 345.22L345.5 345.51L344.11 345.79L342.71 346.05L341.29 346.29L339.87 346.52L338.44 346.73L337 346.93L335.55 347.11L334.09 347.27L332.63 347.42L331.15 347.55L329.68 347.67L328.2 347.77L326.71 347.85L325.22 347.92L323.73 347.97L322.24 348L320.75 348.02L319.25 348.02L317.76 348L316.27 347.97L314.78 347.92L313.29 347.85L311.8 347.77L310.32 347.67L308.85 347.55L307.37 347.42L305.91 347.27L304.45 347.11L303 346.93L301.56 346.73L300.13 346.52L298.71 346.29L297.29 346.05L295.89 345.79L294.5 345.51L293.13 345.22L291.76 344.91L290.41 344.59L289.08 344.26L287.76 343.91L286.46 343.54L285.17 343.16L283.9 342.77L282.65 342.36L281.41 341.94L280.2 341.5L279 341.06L277.83 340.59L276.67 340.12L275.54 339.63L274.43 339.13L273.34 338.62L272.28 338.1L271.23 337.56L270.22 337.02L269.22 336.46L268.25 335.89L267.31 335.31L266.39 334.72L265.5 334.12L264.64 333.51L263.8 332.89L263 332.26L262.21 331.63L261.46 330.98L260.74 330.33L260.04 329.67L259.38 329L258.74 328.32L258.14 327.64L257.57 326.95L257.02 326.25L256.51 325.55L256.03 324.84L255.58 324.13L255.16 323.41L254.78 322.69L254.42 321.96L254.1 321.24L253.81 320.5L253.56 319.77L253.33 319.03L253.14 318.29L252.98 317.54L252.86 316.8L252.77 316.05L252.71 315.31L252.68 314.56L252.69 313.81L252.73 313.07L252.8 312.32L252.91 311.57L253.05 310.83L253.22 310.09L253.43 309.35L253.67 308.61L253.94 307.88L254.24 307.15L254.58 306.42L254.95 305.69L255.35 304.97L255.78 304.26L256.25 303.55L256.74 302.84L257.27 302.14L257.83 301.45L258.41 300.76L259.03 300.08L259.68 299.41L260.36 298.75L261.07 298.09L261.8 297.44L262.57 296.8L263.36 296.16L264.18 295.54L265.03 294.92L268.58 292.42L269.45 291.82L270.35 291.22L271.28 290.64L272.23 290.08L273.22 289.52L274.22 288.97L275.26 288.44L276.31 287.92L277.4 287.41L278.5 286.91L279.63 286.43L280.78 285.96L281.95 285.5L283.15 285.06L284.36 284.63L285.6 284.22L286.85 283.82L288.12 283.44L289.41 283.07L290.72 282.72L292.04 282.38L293.38 282.06L294.74 281.75L296.1 281.46L297.48 281.19L298.88 280.93L300.28 280.69L301.7 280.47L303.13 280.26L304.56 280.07L306.01 279.9L307.46 279.74L308.92 279.6L310.38 279.48L311.85 279.37L313.33 279.29L314.81 279.22L316.29 279.16L317.77 279.13L319.26 279.11L320.74 279.11L322.23 279.13L323.71 279.16L325.19 279.22L326.67 279.29L328.15 279.37L329.62 279.48L331.08 279.6L332.54 279.74L333.99 279.9L335.44 280.07L336.87 280.26L338.3 280.47L339.72 280.69L341.12 280.93L342.52 281.19L343.9 281.46L345.26 281.75L346.62 282.06L347.96 282.38L349.28 282.72L350.59 283.07L351.88 283.44L353.15 283.82L354.4 284.22L355.64 284.63L356.85 285.06L358.05 285.5L359.22 285.96L360.37 286.43L361.5 286.91L362.6 287.41L363.69 287.92L364.74 288.44L365.78 288.97L366.78 289.52L367.77 290.08L368.72 290.64L369.65 291.22L370.55 291.82L371.42 292.42Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M374.97 294.92L377.31 296.7L379.42 298.54L381.3 300.45L382.93 302.41L384.32 304.42L385.44 306.47L386.31 308.55L386.91 310.65L387.24 312.77L387.31 314.89L387.11 317.01L386.64 319.12L385.91 321.22L384.91 323.28L383.65 325.31L382.15 327.3L380.39 329.23L378.39 331.11L376.16 332.92L373.71 334.65L371.04 336.31L367.75 331.13L370.24 329.58L372.54 327.96L374.62 326.27L376.49 324.51L378.14 322.7L379.55 320.84L380.72 318.95L381.65 317.01L382.34 315.06L382.78 313.08L382.97 311.1L382.91 309.11L382.59 307.13L382.03 305.16L381.22 303.21L380.17 301.3L378.87 299.42L377.35 297.58L375.59 295.8L373.61 294.08L371.42 292.42Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M371.04 336.31L368.08 337.92L364.92 339.43L361.57 340.83L358.04 342.13L354.36 343.3L350.53 344.36L346.56 345.29L342.49 346.08L338.32 346.75L337.14 340.9L341.04 340.28L344.85 339.53L348.56 338.66L352.14 337.68L355.59 336.57L358.89 335.36L362.02 334.05L364.98 332.64L367.75 331.13Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M338.32 346.75L334.16 347.26L329.94 347.65L325.68 347.9L321.4 348.01L317.11 347.99L312.83 347.83L308.58 347.53L309.32 341.63L313.29 341.91L317.29 342.06L321.31 342.08L325.31 341.97L329.3 341.74L333.25 341.38L337.14 340.9Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M308.58 347.53L304.29 347.09L300.07 346.51L295.94 345.79L291.9 344.95L287.99 343.97L284.21 342.87L280.58 341.64L277.11 340.3L273.83 338.86L270.75 337.3L267.87 335.66L265.21 333.92L262.79 332.09L260.6 330.2L258.67 328.24L256.99 326.21L255.59 324.14L254.45 322.03L253.59 319.88L253.02 317.71L252.72 315.53L252.71 313.34L252.99 311.16L253.54 308.99L254.38 306.84L255.5 304.72L256.89 302.65L258.54 300.62L260.46 298.65L262.62 296.75L265.03 294.92L268.58 292.42L266.33 294.13L264.3 295.9L262.51 297.75L260.96 299.64L259.66 301.58L258.62 303.56L257.83 305.57L257.31 307.6L257.05 309.64L257.06 311.69L257.34 313.73L257.88 315.76L258.68 317.77L259.74 319.75L261.06 321.69L262.62 323.58L264.43 325.42L266.48 327.19L268.75 328.89L271.23 330.52L273.92 332.06L276.81 333.51L279.88 334.87L283.12 336.12L286.52 337.27L290.05 338.3L293.72 339.21L297.49 340L301.36 340.67L305.31 341.22L309.32 341.63Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M364.53 332.86L362.75 333.72L360.9 334.54L358.99 335.32L357.02 336.07L354.99 336.78L352.91 337.44L350.77 338.07L348.59 338.65L346.37 339.19L344.1 339.69L341.8 340.14L339.46 340.54L337.09 340.9L334.7 341.21L332.29 341.48L329.85 341.7L327.4 341.87L324.94 341.99L322.47 342.06L320 342.08L317.53 342.06L315.06 341.99L312.6 341.87L310.15 341.7L307.71 341.48L305.3 341.21L302.91 340.9L300.54 340.54L298.2 340.14L295.9 339.69L293.63 339.19L291.41 338.65L289.23 338.07L287.09 337.44L285.01 336.78L282.98 336.07L281.01 335.32L279.1 334.54L277.25 333.72L275.47 332.86L273.76 331.97L272.11 331.05L270.54 330.09L269.05 329.1L267.64 328.09L266.3 327.05L265.05 325.98L263.89 324.89L262.81 323.78L261.82 322.65L260.92 321.5L260.11 320.33L259.39 319.14L258.76 317.95L258.23 316.74L257.8 315.52L257.46 314.3L257.22 313.07L257.07 311.83L257.02 310.6L257.07 309.36L257.22 308.13L257.46 306.9L257.8 305.67L258.23 304.45L258.76 303.25L259.39 302.05L260.11 300.87L260.92 299.7L261.82 298.55L262.81 297.41L263.89 296.3L265.05 295.21L266.3 294.14L267.64 293.1L269.05 292.09L270.54 291.1L272.11 290.15L273.76 289.22L275.47 288.33L277.25 287.47L279.1 286.65L281.01 285.87L282.98 285.12L285.01 284.42L287.09 283.75L289.23 283.12L291.41 282.54L293.63 282L295.9 281.51L298.2 281.05L300.54 280.65L302.91 280.29L305.3 279.98L307.71 279.71L310.15 279.5L312.6 279.33L315.06 279.21L317.53 279.13L320 279.11L322.47 279.13L324.94 279.21L327.4 279.33L329.85 279.5L332.29 279.71L334.7 279.98L337.09 280.29L339.46 280.65L341.8 281.05L344.1 281.51L346.37 282L348.59 282.54L350.77 283.12L352.91 283.75L354.99 284.42L357.02 285.12L358.99 285.87L360.9 286.65L362.75 287.47L364.53 288.33L366.24 289.22L367.89 290.15L369.46 291.1L370.95 292.09L372.36 293.1L373.7 294.14L374.95 295.21L376.11 296.3L377.19 297.41L378.18 298.55L379.08 299.7L379.89 300.87L380.61 302.05L381.24 303.25L381.77 304.45L382.2 305.67L382.54 306.9L382.78 308.13L382.93 309.36L382.98 310.6L382.93 311.83L382.78 313.07L382.54 314.3L382.2 315.52L381.77 316.74L381.24 317.95L380.61 319.14L379.89 320.33L379.08 321.5L378.18 322.65L377.19 323.78L376.11 324.89L374.95 325.98L373.7 327.05L372.36 328.09L370.95 329.1L369.46 330.09L367.89 331.05L366.24 331.97Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M371.42 292.42L372.27 293.03L373.09 293.66L373.88 294.29L374.64 294.94L375.37 295.59L376.06 296.25L376.73 296.93L377.36 297.6L377.97 298.29L378.53 298.98L379.07 299.68L379.57 300.38L380.04 301.09L380.48 301.81L380.88 302.53L381.24 303.26L381.57 303.99L381.87 304.72L382.13 305.46L382.36 306.2L382.55 306.94L382.71 307.68L382.83 308.43L382.91 309.18L382.96 309.92L382.98 310.67L382.95 311.42L382.9 312.17L382.81 312.91L382.68 313.66L382.51 314.4L382.32 315.15L382.08 315.88L381.81 316.62L381.51 317.35L381.17 318.08L380.8 318.81L380.39 319.53L379.95 320.24L379.47 320.95L378.97 321.65L378.42 322.35L377.85 323.04L377.24 323.73L376.6 324.4L375.93 325.07L375.22 325.73L374.49 326.38L373.72 327.03L372.93 327.66L372.1 328.28L371.25 328.9L370.36 329.5L369.45 330.1L368.51 330.68L367.54 331.25L366.55 331.81L365.52 332.35L364.48 332.89L363.41 333.41L362.31 333.92L361.19 334.42L360.05 334.9L358.88 335.37L357.69 335.82L356.48 336.26L355.25 336.69L354 337.1L352.73 337.5L351.44 337.88L350.14 338.24L348.82 338.59L347.48 338.93L346.12 339.25L344.76 339.55L343.37 339.84L341.98 340.11L340.57 340.36L339.15 340.59L337.72 340.81L336.28 341.02L334.83 341.2L333.37 341.37L331.9 341.52L330.43 341.65L328.95 341.77L327.47 341.86L325.98 341.94L324.49 342L322.99 342.05L321.5 342.08L320 342.08L318.5 342.08L317.01 342.05L315.51 342L314.02 341.94L312.53 341.86L311.05 341.77L309.57 341.65L308.1 341.52L306.63 341.37L305.17 341.2L303.72 341.02L302.28 340.81L300.85 340.59L299.43 340.36L298.02 340.11L296.63 339.84L295.24 339.55L293.88 339.25L292.52 338.93L291.18 338.59L289.86 338.24L288.56 337.88L287.27 337.5L286 337.1L284.75 336.69L283.52 336.26L282.31 335.82L281.12 335.37L279.95 334.9L278.81 334.42L277.69 333.92L276.59 333.41L275.52 332.89L274.48 332.35L273.45 331.81L272.46 331.25L271.49 330.68L270.55 330.1L269.64 329.5L268.75 328.9L267.9 328.28L267.07 327.66L266.28 327.03L265.51 326.38L264.78 325.73L264.07 325.07L263.4 324.4L262.76 323.73L262.15 323.04L261.58 322.35L261.03 321.65L260.53 320.95L260.05 320.24L259.61 319.53L259.2 318.81L258.83 318.08L258.49 317.35L258.19 316.62L257.92 315.88L257.68 315.15L257.49 314.4L257.32 313.66L257.19 312.91L257.1 312.17L257.05 311.42L257.02 310.67L257.04 309.92L257.09 309.18L257.17 308.43L257.29 307.68L257.45 306.94L257.64 306.2L257.87 305.46L258.13 304.72L258.43 303.99L258.76 303.26L259.12 302.53L259.52 301.81L259.96 301.09L260.43 300.38L260.93 299.68L261.47 298.98L262.03 298.29L262.64 297.6L263.27 296.93L263.94 296.25L264.63 295.59L265.36 294.94L266.12 294.29L266.91 293.66L267.73 293.03L268.58 292.42\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M374.97 294.92L375.82 295.54L376.64 296.16L377.43 296.8L378.2 297.44L378.93 298.09L379.64 298.75L380.32 299.41L380.97 300.08L381.59 300.76L382.17 301.45L382.73 302.14L383.26 302.84L383.75 303.55L384.22 304.26L384.65 304.97L385.05 305.69L385.42 306.42L385.76 307.15L386.06 307.88L386.33 308.61L386.57 309.35L386.78 310.09L386.95 310.83L387.09 311.57L387.2 312.32L387.27 313.07L387.31 313.81L387.32 314.56L387.29 315.31L387.23 316.05L387.14 316.8L387.02 317.54L386.86 318.29L386.67 319.03L386.44 319.77L386.19 320.5L385.9 321.24L385.58 321.96L385.22 322.69L384.84 323.41L384.42 324.13L383.97 324.84L383.49 325.55L382.98 326.25L382.43 326.95L381.86 327.64L381.26 328.32L380.62 329L379.96 329.67L379.26 330.33L378.54 330.98L377.79 331.63L377 332.26L376.2 332.89L375.36 333.51L374.5 334.12L373.61 334.72L372.69 335.31L371.75 335.89L370.78 336.46L369.78 337.02L368.77 337.56L367.72 338.1L366.66 338.62L365.57 339.13L364.46 339.63L363.33 340.12L362.17 340.59L361 341.06L359.8 341.5L358.59 341.94L357.35 342.36L356.1 342.77L354.83 343.16L353.54 343.54L352.24 343.91L350.92 344.26L349.59 344.59L348.24 344.91L346.87 345.22L345.5 345.51L344.11 345.79L342.71 346.05L341.29 346.29L339.87 346.52L338.44 346.73L337 346.93L335.55 347.11L334.09 347.27L332.63 347.42L331.15 347.55L329.68 347.67L328.2 347.77L326.71 347.85L325.22 347.92L323.73 347.97L322.24 348L320.75 348.02L319.25 348.02L317.76 348L316.27 347.97L314.78 347.92L313.29 347.85L311.8 347.77L310.32 347.67L308.85 347.55L307.37 347.42L305.91 347.27L304.45 347.11L303 346.93L301.56 346.73L300.13 346.52L298.71 346.29L297.29 346.05L295.89 345.79L294.5 345.51L293.13 345.22L291.76 344.91L290.41 344.59L289.08 344.26L287.76 343.91L286.46 343.54L285.17 343.16L283.9 342.77L282.65 342.36L281.41 341.94L280.2 341.5L279 341.06L277.83 340.59L276.67 340.12L275.54 339.63L274.43 339.13L273.34 338.62L272.28 338.1L271.23 337.56L270.22 337.02L269.22 336.46L268.25 335.89L267.31 335.31L266.39 334.72L265.5 334.12L264.64 333.51L263.8 332.89L263 332.26L262.21 331.63L261.46 330.98L260.74 330.33L260.04 329.67L259.38 329L258.74 328.32L258.14 327.64L257.57 326.95L257.02 326.25L256.51 325.55L256.03 324.84L255.58 324.13L255.16 323.41L254.78 322.69L254.42 321.96L254.1 321.24L253.81 320.5L253.56 319.77L253.33 319.03L253.14 318.29L252.98 317.54L252.86 316.8L252.77 316.05L252.71 315.31L252.68 314.56L252.69 313.81L252.73 313.07L252.8 312.32L252.91 311.57L253.05 310.83L253.22 310.09L253.43 309.35L253.67 308.61L253.94 307.88L254.24 307.15L254.58 306.42L254.95 305.69L255.35 304.97L255.78 304.26L256.25 303.55L256.74 302.84L257.27 302.14L257.83 301.45L258.41 300.76L259.03 300.08L259.68 299.41L260.36 298.75L261.07 298.09L261.8 297.44L262.57 296.8L263.36 296.16L264.18 295.54L265.03 294.92L268.58 292.42L269.45 291.82L270.35 291.22L271.28 290.64L272.23 290.08L273.22 289.52L274.22 288.97L275.26 288.44L276.31 287.92L277.4 287.41L278.5 286.91L279.63 286.43L280.78 285.96L281.95 285.5L283.15 285.06L284.36 284.63L285.6 284.22L286.85 283.82L288.12 283.44L289.41 283.07L290.72 282.72L292.04 282.38L293.38 282.06L294.74 281.75L296.1 281.46L297.48 281.19L298.88 280.93L300.28 280.69L301.7 280.47L303.13 280.26L304.56 280.07L306.01 279.9L307.46 279.74L308.92 279.6L310.38 279.48L311.85 279.37L313.33 279.29L314.81 279.22L316.29 279.16L317.77 279.13L319.26 279.11L320.74 279.11L322.23 279.13L323.71 279.16L325.19 279.22L326.67 279.29L328.15 279.37L329.62 279.48L331.08 279.6L332.54 279.74L333.99 279.9L335.44 280.07L336.87 280.26L338.3 280.47L339.72 280.69L341.12 280.93L342.52 281.19L343.9 281.46L345.26 281.75L346.62 282.06L347.96 282.38L349.28 282.72L350.59 283.07L351.88 283.44L353.15 283.82L354.4 284.22L355.64 284.63L356.85 285.06L358.05 285.5L359.22 285.96L360.37 286.43L361.5 286.91L362.6 287.41L363.69 287.92L364.74 288.44L365.78 288.97L366.78 289.52L367.77 290.08L368.72 290.64L369.65 291.22L370.55 291.82L371.42 292.42Z\"/></g><g class=\"iso-solid\" data-p=\"11\" data-name=\"draggable.pin3\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M267.07 260.16L267.23 260.16L267.41 260.1L267.59 259.98L267.77 259.8L267.95 259.56L268.14 259.27L268.31 258.94L268.48 258.56L268.64 258.15L268.78 257.72L268.91 257.26L269.02 256.79L269.1 256.32L269.17 255.84L269.21 255.39L269.23 254.95L269.22 254.54L269.19 254.16L269.14 253.82L269.07 253.53L268.97 253.3L268.85 253.11L268.72 252.99L268.57 252.93L263.55 251.89L263.39 251.89L263.21 251.95L263.03 252.07L262.85 252.25L262.67 252.48L262.48 252.77L262.31 253.11L262.14 253.48L261.98 253.89L261.84 254.33L261.71 254.79L261.6 255.26L261.52 255.73L261.45 256.2L261.41 256.66L261.39 257.1L261.4 257.51L261.43 257.89L261.48 258.22L261.55 258.51L261.65 258.75L261.77 258.93L261.9 259.06L262.05 259.12Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M266.47 259.14L266.7 259.85L267.07 260.16L262.05 259.12L261.69 258.81L261.46 258.1Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M266.41 258.43L266.47 259.14L261.46 258.1L261.39 257.39Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M266.45 257.44L266.41 258.43L261.39 257.39L261.43 256.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M266.63 256.26L266.45 257.44L261.43 256.4L261.61 255.22ZM268.57 252.93L268.35 252.94L263.33 251.9L263.55 251.89Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M268.35 252.94L267.87 253.28L267.39 254.01L266.96 255.05L266.63 256.26L261.61 255.22L261.94 254.01L262.37 252.98L262.86 252.24L263.33 251.9Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"M267.82 253.34L267.28 254.24L266.82 255.49L266.51 256.89L266.41 258.25L266.51 259.34L266.82 260.01L267.28 260.15L267.82 259.74L268.36 258.84L268.82 257.6L269.12 256.19L269.23 254.84L269.12 253.74L268.82 253.07L268.36 252.94Z\"/><path class=\"iso-tn\" data-r=\"k1\" d=\"\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M268.57 252.93L268.05 253.11L267.5 253.81L267 254.93L266.62 256.29L266.43 257.7L266.44 258.92L266.67 259.79L267.07 260.16\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M267.07 260.16L267.23 260.16L267.41 260.1L267.59 259.98L267.77 259.8L267.95 259.56L268.14 259.27L268.31 258.94L268.48 258.56L268.64 258.15L268.78 257.72L268.91 257.26L269.02 256.79L269.1 256.32L269.17 255.84L269.21 255.39L269.23 254.95L269.22 254.54L269.19 254.16L269.14 253.82L269.07 253.53L268.97 253.3L268.85 253.11L268.72 252.99L268.57 252.93L263.55 251.89L263.39 251.89L263.21 251.95L263.03 252.07L262.85 252.25L262.67 252.48L262.48 252.77L262.31 253.11L262.14 253.48L261.98 253.89L261.84 254.33L261.71 254.79L261.6 255.26L261.52 255.73L261.45 256.2L261.41 256.66L261.39 257.1L261.4 257.51L261.43 257.89L261.48 258.22L261.55 258.51L261.65 258.75L261.77 258.93L261.9 259.06L262.05 259.12Z\"/></g><g class=\"iso-solid\" data-p=\"17\" data-name=\"draggable.pin6\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M371.43 252.93L371.28 252.99L371.15 253.11L371.03 253.3L370.93 253.53L370.86 253.82L370.81 254.16L370.78 254.54L370.77 254.95L370.79 255.39L370.83 255.84L370.9 256.32L370.98 256.79L371.09 257.26L371.22 257.72L371.36 258.15L371.52 258.56L371.69 258.94L371.86 259.27L372.05 259.56L372.23 259.8L372.41 259.98L372.59 260.1L372.77 260.16L372.93 260.16L377.95 259.12L378.1 259.06L378.23 258.93L378.35 258.75L378.45 258.51L378.52 258.22L378.57 257.89L378.6 257.51L378.61 257.1L378.59 256.66L378.55 256.2L378.48 255.73L378.4 255.26L378.29 254.79L378.16 254.33L378.02 253.89L377.86 253.48L377.69 253.11L377.52 252.77L377.33 252.48L377.15 252.25L376.97 252.07L376.79 251.95L376.61 251.89L376.45 251.89Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M372.93 260.16L373.28 259.88L373.51 259.25L373.59 258.32L373.53 257.2L378.54 256.16L378.61 257.28L378.52 258.21L378.29 258.84L377.95 259.12Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M373.53 257.2L373.38 256.29L378.4 255.25L378.54 256.16Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M373.38 256.29L373.11 255.24L378.12 254.21L378.4 255.25Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M373.11 255.24L372.71 254.22L377.73 253.18L378.12 254.21Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M372.71 254.22L372.28 253.47L371.84 253.03L371.43 252.93L376.45 251.89L376.86 251.99L377.3 252.43L377.73 253.18Z\"/><path class=\"iso-tn\" data-r=\"k0\" data-b=\"3\" style=\"--f:0.03125\" d=\"M372.18 253.34L371.64 252.94L371.18 253.07L370.88 253.74L370.77 254.84L370.88 256.19L371.18 257.6L371.64 258.84L372.18 259.74L372.72 260.15L373.18 260.01L373.49 259.34L373.59 258.25L373.49 256.89L373.18 255.49L372.72 254.24Z\"/><path class=\"iso-tn\" data-r=\"k1\" d=\"\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M372.93 260.16L373.33 259.79L373.56 258.92L373.57 257.7L373.38 256.29L373 254.93L372.5 253.81L371.95 253.11L371.43 252.93\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M371.43 252.93L371.28 252.99L371.15 253.11L371.03 253.3L370.93 253.53L370.86 253.82L370.81 254.16L370.78 254.54L370.77 254.95L370.79 255.39L370.83 255.84L370.9 256.32L370.98 256.79L371.09 257.26L371.22 257.72L371.36 258.15L371.52 258.56L371.69 258.94L371.86 259.27L372.05 259.56L372.23 259.8L372.41 259.98L372.59 260.1L372.77 260.16L372.93 260.16L377.95 259.12L378.1 259.06L378.23 258.93L378.35 258.75L378.45 258.51L378.52 258.22L378.57 257.89L378.6 257.51L378.61 257.1L378.59 256.66L378.55 256.2L378.48 255.73L378.4 255.26L378.29 254.79L378.16 254.33L378.02 253.89L377.86 253.48L377.69 253.11L377.52 252.77L377.33 252.48L377.15 252.25L376.97 252.07L376.79 251.95L376.61 251.89L376.45 251.89Z\"/></g><g class=\"iso-solid\" data-p=\"2\" data-name=\"scroll.ring\" data-mat=\"steel\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M380.8 308.72L380.79 309.46L380.73 310.21L380.64 310.95L380.51 311.7L380.35 312.44L380.15 313.18L379.91 313.91L379.64 314.65L379.33 315.38L378.98 316.1L378.6 316.82L378.19 317.54L377.74 318.25L377.25 318.96L376.73 319.66L376.18 320.35L375.59 321.04L374.97 321.71L374.31 322.39L373.63 323.05L372.91 323.7L372.15 324.35L371.37 324.98L370.56 325.61L369.71 326.22L368.84 326.83L367.94 327.42L367 328L366.04 328.57L365.05 329.13L364.04 329.68L363 330.21L361.93 330.73L360.83 331.24L359.72 331.74L358.57 332.22L357.41 332.68L356.22 333.14L355.01 333.57L353.78 333.99L352.53 334.4L351.26 334.79L349.97 335.17L348.66 335.53L347.34 335.87L346 336.2L344.64 336.51L343.27 336.8L341.88 337.08L340.48 337.34L339.07 337.58L337.65 337.81L336.22 338.02L334.77 338.21L333.32 338.38L331.86 338.53L330.4 338.67L328.92 338.79L327.44 338.89L325.96 338.97L324.47 339.04L322.98 339.08L321.49 339.11L320 339.12L318.51 339.11L317.02 339.08L315.53 339.04L314.04 338.97L312.56 338.89L311.08 338.79L309.6 338.67L308.14 338.53L306.68 338.38L305.23 338.21L303.78 338.02L302.35 337.81L300.93 337.58L299.52 337.34L298.12 337.08L296.73 336.8L295.36 336.51L294 336.2L292.66 335.87L291.34 335.53L290.03 335.17L288.74 334.79L287.47 334.4L286.22 333.99L284.99 333.57L283.78 333.14L282.59 332.68L281.43 332.22L280.28 331.74L279.17 331.24L278.07 330.73L277 330.21L275.96 329.68L274.95 329.13L273.96 328.57L273 328L272.06 327.42L271.16 326.83L270.29 326.22L269.44 325.61L268.63 324.98L267.85 324.35L267.09 323.7L266.37 323.05L265.69 322.39L265.03 321.71L264.41 321.04L263.82 320.35L263.27 319.66L262.75 318.96L262.26 318.25L261.81 317.54L261.4 316.82L261.02 316.1L260.67 315.38L260.36 314.65L260.09 313.91L259.85 313.18L259.65 312.44L259.49 311.7L259.36 310.95L259.27 310.21L259.21 309.46L259.2 308.72L259.2 291.79L259.21 291.04L259.27 290.3L259.36 289.55L259.49 288.81L259.65 288.07L259.85 287.33L260.09 286.59L260.36 285.86L260.67 285.13L261.02 284.4L261.4 283.68L261.81 282.96L262.26 282.25L262.75 281.55L263.27 280.85L263.82 280.16L264.41 279.47L265.03 278.79L265.69 278.12L266.37 277.46L267.09 276.8L267.85 276.16L268.63 275.52L269.44 274.9L270.29 274.28L271.16 273.68L272.06 273.09L273 272.5L273.96 271.93L274.95 271.37L275.96 270.83L277 270.29L278.07 269.77L279.17 269.26L280.28 268.77L281.43 268.29L282.59 267.82L283.78 267.37L284.99 266.93L286.22 266.51L287.47 266.1L288.74 265.71L290.03 265.34L291.34 264.98L292.66 264.63L294 264.31L295.36 264L296.73 263.7L298.12 263.42L299.52 263.16L300.93 262.92L302.35 262.7L303.78 262.49L305.23 262.3L306.68 262.13L308.14 261.97L309.6 261.84L311.08 261.72L312.56 261.62L314.04 261.53L315.53 261.47L317.02 261.42L318.51 261.4L320 261.39L321.49 261.4L322.98 261.42L324.47 261.47L325.96 261.53L327.44 261.62L328.92 261.72L330.4 261.84L331.86 261.97L333.32 262.13L334.77 262.3L336.22 262.49L337.65 262.7L339.07 262.92L340.48 263.16L341.88 263.42L343.27 263.7L344.64 264L346 264.31L347.34 264.63L348.66 264.98L349.97 265.34L351.26 265.71L352.53 266.1L353.78 266.51L355.01 266.93L356.22 267.37L357.41 267.82L358.57 268.29L359.72 268.77L360.83 269.26L361.93 269.77L363 270.29L364.04 270.83L365.05 271.37L366.04 271.93L367 272.5L367.94 273.09L368.84 273.68L369.71 274.28L370.56 274.9L371.37 275.52L372.15 276.16L372.91 276.8L373.63 277.46L374.31 278.12L374.97 278.79L375.59 279.47L376.18 280.16L376.73 280.85L377.25 281.55L377.74 282.25L378.19 282.96L378.6 283.68L378.98 284.4L379.33 285.13L379.64 285.86L379.91 286.59L380.15 287.33L380.35 288.07L380.51 288.81L380.64 289.55L380.73 290.3L380.79 291.04L380.8 291.79Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M380.8 308.72L380.67 310.7L380.28 312.68L379.64 314.65L378.73 316.58L377.58 318.49L376.18 320.35L374.53 322.16L372.66 323.92L370.56 325.61L368.24 327.22L365.72 328.76L363 330.21L360.09 331.57L357.02 332.84L353.78 333.99L350.4 335.05L346.89 335.98L343.27 336.8L339.55 337.5L335.74 338.08L331.86 338.53L327.94 338.86L323.98 339.05L320 339.12L320 322.19L323.98 322.13L327.94 321.93L331.86 321.61L335.74 321.16L339.55 320.58L343.27 319.88L346.89 319.06L350.4 318.12L353.78 317.07L357.02 315.91L360.09 314.65L363 313.29L365.72 311.84L368.24 310.3L370.56 308.68L372.66 306.99L374.53 305.24L376.18 303.42L377.58 301.56L378.73 299.66L379.64 297.72L380.28 295.76L380.67 293.78L380.8 291.79Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M320 339.12L316.14 339.06L312.29 338.87L308.48 338.57L304.71 338.14L301 337.6L301 320.67L304.71 321.22L308.48 321.64L312.29 321.95L316.14 322.13L320 322.19Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M301 337.6L297.75 337.01L294.57 336.33L291.48 335.57L288.47 334.71L285.57 333.78L282.78 332.76L280.11 331.66L280.11 314.74L282.78 315.83L285.57 316.85L288.47 317.79L291.48 318.64L294.57 319.41L297.75 320.08L301 320.67Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M280.11 331.66L277.41 330.42L274.87 329.09L272.5 327.69L270.3 326.23L268.27 324.7L266.44 323.11L264.8 321.47L263.36 319.78L262.13 318.05L261.11 316.29L261.11 299.36L262.13 301.13L263.36 302.85L264.8 304.54L266.44 306.18L268.27 307.77L270.3 309.3L272.5 310.77L274.87 312.17L277.41 313.49L280.11 314.74Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M261.11 316.29L260.28 314.42L259.68 312.53L259.32 310.63L259.2 308.72L259.2 291.79L259.32 293.7L259.68 295.61L260.28 297.5L261.11 299.36Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M363 313.29L361.27 314.12L359.49 314.91L357.64 315.67L355.74 316.39L353.78 317.07L351.77 317.71L349.71 318.32L347.6 318.88L345.46 319.4L343.27 319.88L341.05 320.31L338.79 320.7L336.5 321.05L334.19 321.35L331.86 321.61L329.51 321.82L327.15 321.98L324.77 322.1L322.39 322.17L320 322.19L317.61 322.17L315.23 322.1L312.85 321.98L310.49 321.82L308.14 321.61L305.81 321.35L303.5 321.05L301.21 320.7L298.95 320.31L296.73 319.88L294.54 319.4L292.4 318.88L290.29 318.32L288.23 317.71L286.22 317.07L284.26 316.39L282.36 315.67L280.51 314.91L278.73 314.12L277 313.29L275.35 312.43L273.76 311.53L272.25 310.61L270.81 309.66L269.44 308.68L268.16 307.68L266.95 306.65L265.82 305.59L264.78 304.52L263.82 303.42L262.95 302.31L262.17 301.18L261.48 300.04L260.88 298.89L260.36 297.72L259.94 296.55L259.62 295.36L259.38 294.18L259.24 292.98L259.2 291.79L259.24 290.6L259.38 289.4L259.62 288.22L259.94 287.03L260.36 285.86L260.88 284.69L261.48 283.54L262.17 282.4L262.95 281.27L263.82 280.16L264.78 279.06L265.82 277.99L266.95 276.93L268.16 275.9L269.44 274.9L270.81 273.92L272.25 272.97L273.76 272.05L275.35 271.15L277 270.29L278.73 269.46L280.51 268.67L282.36 267.91L284.26 267.19L286.22 266.51L288.23 265.87L290.29 265.26L292.4 264.7L294.54 264.18L296.73 263.7L298.95 263.27L301.21 262.88L303.5 262.53L305.81 262.23L308.14 261.97L310.49 261.76L312.85 261.6L315.23 261.48L317.61 261.41L320 261.39L322.39 261.41L324.77 261.48L327.15 261.6L329.51 261.76L331.86 261.97L334.19 262.23L336.5 262.53L338.79 262.88L341.05 263.27L343.27 263.7L345.46 264.18L347.6 264.7L349.71 265.26L351.77 265.87L353.78 266.51L355.74 267.19L357.64 267.91L359.49 268.67L361.27 269.46L363 270.29L364.65 271.15L366.24 272.05L367.75 272.97L369.19 273.92L370.56 274.9L371.84 275.9L373.05 276.93L374.18 277.99L375.22 279.06L376.18 280.16L377.05 281.27L377.83 282.4L378.52 283.54L379.12 284.69L379.64 285.86L380.06 287.03L380.38 288.22L380.62 289.4L380.76 290.6L380.8 291.79L380.76 292.98L380.62 294.18L380.38 295.36L380.06 296.55L379.64 297.72L379.12 298.89L378.52 300.04L377.83 301.18L377.05 302.31L376.18 303.42L375.22 304.52L374.18 305.59L373.05 306.65L371.84 307.68L370.56 308.68L369.19 309.66L367.75 310.61L366.24 311.53L364.65 312.43Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M380.8 291.79L380.79 292.54L380.73 293.28L380.64 294.03L380.51 294.77L380.35 295.51L380.15 296.25L379.91 296.99L379.64 297.72L379.33 298.45L378.98 299.18L378.6 299.9L378.19 300.62L377.74 301.33L377.25 302.03L376.73 302.73L376.18 303.42L375.59 304.11L374.97 304.79L374.31 305.46L373.63 306.12L372.91 306.78L372.15 307.42L371.37 308.06L370.56 308.68L369.71 309.3L368.84 309.9L367.94 310.49L367 311.08L366.04 311.65L365.05 312.21L364.04 312.75L363 313.29L361.93 313.81L360.83 314.32L359.72 314.81L358.57 315.29L357.41 315.76L356.22 316.21L355.01 316.65L353.78 317.07L352.53 317.48L351.26 317.87L349.97 318.24L348.66 318.6L347.34 318.95L346 319.27L344.64 319.58L343.27 319.88L341.88 320.16L340.48 320.42L339.07 320.66L337.65 320.88L336.22 321.09L334.77 321.28L333.32 321.45L331.86 321.61L330.4 321.74L328.92 321.86L327.44 321.96L325.96 322.05L324.47 322.11L322.98 322.16L321.49 322.18L320 322.19L318.51 322.18L317.02 322.16L315.53 322.11L314.04 322.05L312.56 321.96L311.08 321.86L309.6 321.74L308.14 321.61L306.68 321.45L305.23 321.28L303.78 321.09L302.35 320.88L300.93 320.66L299.52 320.42L298.12 320.16L296.73 319.88L295.36 319.58L294 319.27L292.66 318.95L291.34 318.6L290.03 318.24L288.74 317.87L287.47 317.48L286.22 317.07L284.99 316.65L283.78 316.21L282.59 315.76L281.43 315.29L280.28 314.81L279.17 314.32L278.07 313.81L277 313.29L275.96 312.75L274.95 312.21L273.96 311.65L273 311.08L272.06 310.49L271.16 309.9L270.29 309.3L269.44 308.68L268.63 308.06L267.85 307.42L267.09 306.78L266.37 306.12L265.69 305.46L265.03 304.79L264.41 304.11L263.82 303.42L263.27 302.73L262.75 302.03L262.26 301.33L261.81 300.62L261.4 299.9L261.02 299.18L260.67 298.45L260.36 297.72L260.09 296.99L259.85 296.25L259.65 295.51L259.49 294.77L259.36 294.03L259.27 293.28L259.21 292.54L259.2 291.79\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"inner\" d=\"M380.8 308.08L380.77 308.82L380.7 309.57L380.59 310.31L380.45 311.06L380.27 311.8L380.05 312.54L379.8 313.28L379.51 314.01L379.19 314.74L378.83 315.46L378.43 316.19L378 316.9L377.54 317.61L377.03 318.32L376.5 319.01L375.93 319.7L375.33 320.39L374.69 321.06L374.02 321.73L373.32 322.39L372.58 323.04L371.82 323.68L371.02 324.32L370.19 324.94L369.33 325.55L368.44 326.15L367.53 326.74L366.58 327.32L365.6 327.88L364.6 328.44L363.57 328.98L362.52 329.51L361.44 330.03L360.33 330.53L359.2 331.02L358.04 331.49L356.87 331.95L355.67 332.4L354.45 332.83L353.2 333.24L351.94 333.65L350.66 334.03L349.36 334.4L348.04 334.75L346.71 335.09L345.36 335.41L343.99 335.71L342.61 336L341.22 336.27L339.81 336.52L338.39 336.75L336.96 336.97L335.52 337.17L334.07 337.35L332.61 337.52L331.15 337.66L329.67 337.79L328.2 337.9L326.71 337.99L325.22 338.07L323.73 338.12L322.24 338.16L320.75 338.18L319.25 338.18L317.76 338.16L316.27 338.12L314.78 338.07L313.29 337.99L311.8 337.9L310.33 337.79L308.85 337.66L307.39 337.52L305.93 337.35L304.48 337.17L303.04 336.97L301.61 336.75L300.19 336.52L298.78 336.27L297.39 336L296.01 335.71L294.64 335.41L293.29 335.09L291.96 334.75L290.64 334.4L289.34 334.03L288.06 333.65L286.8 333.24L285.55 332.83L284.33 332.4L283.13 331.95L281.96 331.49L280.8 331.02L279.67 330.53L278.56 330.03L277.48 329.51L276.43 328.98L275.4 328.44L274.4 327.88L273.42 327.32L272.47 326.74L271.56 326.15L270.67 325.55L269.81 324.94L268.98 324.32L268.18 323.68L267.42 323.04L266.68 322.39L265.98 321.73L265.31 321.06L264.67 320.39L264.07 319.7L263.5 319.01L262.97 318.32L262.46 317.61L262 316.9L261.57 316.19L261.17 315.46L260.81 314.74L260.49 314.01L260.2 313.28L259.95 312.54L259.73 311.8L259.55 311.06L259.41 310.31L259.3 309.57L259.23 308.82L259.2 308.08M380.8 293.03L380.77 293.78L380.7 294.52L380.59 295.27L380.45 296.01L380.27 296.76L380.05 297.49L379.8 298.23L379.51 298.96L379.19 299.69L378.83 300.42L378.43 301.14L378 301.86L377.54 302.57L377.03 303.27L376.5 303.97L375.93 304.66L375.33 305.34L374.69 306.02L374.02 306.69L373.32 307.35L372.58 308L371.82 308.64L371.02 309.27L370.19 309.89L369.33 310.5L368.44 311.11L367.53 311.69L366.58 312.27L365.6 312.84L364.6 313.39L363.57 313.94L362.52 314.47L361.44 314.98L360.33 315.48L359.2 315.97L358.04 316.45L356.87 316.91L355.67 317.35L354.45 317.78L353.2 318.2L351.94 318.6L350.66 318.98L349.36 319.35L348.04 319.71L346.71 320.04L345.36 320.36L343.99 320.67L342.61 320.95L341.22 321.22L339.81 321.47L338.39 321.71L336.96 321.93L335.52 322.13L334.07 322.31L332.61 322.47L331.15 322.62L329.67 322.75L328.2 322.86L326.71 322.95L325.22 323.02L323.73 323.08L322.24 323.11L320.75 323.13L319.25 323.13L317.76 323.11L316.27 323.08L314.78 323.02L313.29 322.95L311.8 322.86L310.33 322.75L308.85 322.62L307.39 322.47L305.93 322.31L304.48 322.13L303.04 321.93L301.61 321.71L300.19 321.47L298.78 321.22L297.39 320.95L296.01 320.67L294.64 320.36L293.29 320.04L291.96 319.71L290.64 319.35L289.34 318.98L288.06 318.6L286.8 318.2L285.55 317.78L284.33 317.35L283.13 316.91L281.96 316.45L280.8 315.97L279.67 315.48L278.56 314.98L277.48 314.47L276.43 313.94L275.4 313.39L274.4 312.84L273.42 312.27L272.47 311.69L271.56 311.11L270.67 310.5L269.81 309.89L268.98 309.27L268.18 308.64L267.42 308L266.68 307.35L265.98 306.69L265.31 306.02L264.67 305.34L264.07 304.66L263.5 303.97L262.97 303.27L262.46 302.57L262 301.86L261.57 301.14L261.17 300.42L260.81 299.69L260.49 298.96L260.2 298.23L259.95 297.49L259.73 296.76L259.55 296.01L259.41 295.27L259.3 294.52L259.23 293.78L259.2 293.03\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r0\" opacity=\"1\" d=\"M363 329.27L363 314.23M360.69 330.37L360.69 315.32M358.27 331.4L358.27 316.36M355.74 332.37L355.74 317.33M353.12 333.27L353.12 318.23M350.4 334.1L350.4 319.06M347.6 334.86L347.6 319.82M344.73 335.55L344.73 320.5M341.79 336.16L341.79 321.11M338.79 336.69L338.79 321.64M335.74 337.14L335.74 322.1M332.64 337.51L332.64 322.47M329.51 337.8L329.51 322.76M326.36 338.01L326.36 322.97M323.18 338.14L323.18 323.09M320 338.18L320 323.13M316.82 338.14L316.82 323.09M313.64 338.01L313.64 322.97M310.49 337.8L310.49 322.76M307.36 337.51L307.36 322.47M304.26 337.14L304.26 322.1M301.21 336.69L301.21 321.64M298.21 336.16L298.21 321.11M295.27 335.55L295.27 320.5M292.4 334.86L292.4 319.82M289.6 334.1L289.6 319.06M286.88 333.27L286.88 318.23M284.26 332.37L284.26 317.33M281.73 331.4L281.73 316.36M279.31 330.37L279.31 315.32M277 329.27L277 314.23M274.81 328.12L274.81 313.07M272.75 326.91L272.75 311.86M367.25 326.91L367.25 311.86M365.19 328.12L365.19 313.07\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r1\" opacity=\"0.969\" d=\"M270.81 325.65L270.81 310.6M369.19 325.65L369.19 310.6\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r2\" opacity=\"0.938\" d=\"M269 324.33L269 309.29M371 324.33L371 309.29\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r3\" opacity=\"0.844\" d=\"M267.34 322.98L267.34 307.93M372.66 322.98L372.66 307.93\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r4\" opacity=\"0.75\" d=\"M265.82 321.58L265.82 306.53M374.18 321.58L374.18 306.53\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r5\" opacity=\"0.625\" d=\"M264.45 320.14L264.45 305.1M375.55 320.14L375.55 305.1\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r6\" opacity=\"0.5\" d=\"M263.23 318.67L263.23 303.63M376.77 318.67L376.77 303.63\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r7\" opacity=\"0.344\" d=\"M262.17 317.17L262.17 302.13M377.83 317.17L377.83 302.13\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r8\" opacity=\"0.219\" d=\"M261.27 315.64L261.27 300.6M378.73 315.64L378.73 300.6\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r9\" opacity=\"0.125\" d=\"M260.52 314.1L260.52 299.05M379.48 314.1L379.48 299.05\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r10\" opacity=\"0.031\" d=\"M259.94 312.53L259.94 297.49M380.06 312.53L380.06 297.49\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r11\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r12\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r13\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r14\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r15\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r16\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r17\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r18\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r19\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r20\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r21\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r22\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r23\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r24\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r25\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r26\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r27\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r28\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M380.8 308.72L380.79 309.46L380.73 310.21L380.64 310.95L380.51 311.7L380.35 312.44L380.15 313.18L379.91 313.91L379.64 314.65L379.33 315.38L378.98 316.1L378.6 316.82L378.19 317.54L377.74 318.25L377.25 318.96L376.73 319.66L376.18 320.35L375.59 321.04L374.97 321.71L374.31 322.39L373.63 323.05L372.91 323.7L372.15 324.35L371.37 324.98L370.56 325.61L369.71 326.22L368.84 326.83L367.94 327.42L367 328L366.04 328.57L365.05 329.13L364.04 329.68L363 330.21L361.93 330.73L360.83 331.24L359.72 331.74L358.57 332.22L357.41 332.68L356.22 333.14L355.01 333.57L353.78 333.99L352.53 334.4L351.26 334.79L349.97 335.17L348.66 335.53L347.34 335.87L346 336.2L344.64 336.51L343.27 336.8L341.88 337.08L340.48 337.34L339.07 337.58L337.65 337.81L336.22 338.02L334.77 338.21L333.32 338.38L331.86 338.53L330.4 338.67L328.92 338.79L327.44 338.89L325.96 338.97L324.47 339.04L322.98 339.08L321.49 339.11L320 339.12L318.51 339.11L317.02 339.08L315.53 339.04L314.04 338.97L312.56 338.89L311.08 338.79L309.6 338.67L308.14 338.53L306.68 338.38L305.23 338.21L303.78 338.02L302.35 337.81L300.93 337.58L299.52 337.34L298.12 337.08L296.73 336.8L295.36 336.51L294 336.2L292.66 335.87L291.34 335.53L290.03 335.17L288.74 334.79L287.47 334.4L286.22 333.99L284.99 333.57L283.78 333.14L282.59 332.68L281.43 332.22L280.28 331.74L279.17 331.24L278.07 330.73L277 330.21L275.96 329.68L274.95 329.13L273.96 328.57L273 328L272.06 327.42L271.16 326.83L270.29 326.22L269.44 325.61L268.63 324.98L267.85 324.35L267.09 323.7L266.37 323.05L265.69 322.39L265.03 321.71L264.41 321.04L263.82 320.35L263.27 319.66L262.75 318.96L262.26 318.25L261.81 317.54L261.4 316.82L261.02 316.1L260.67 315.38L260.36 314.65L260.09 313.91L259.85 313.18L259.65 312.44L259.49 311.7L259.36 310.95L259.27 310.21L259.21 309.46L259.2 308.72L259.2 291.79L259.21 291.04L259.27 290.3L259.36 289.55L259.49 288.81L259.65 288.07L259.85 287.33L260.09 286.59L260.36 285.86L260.67 285.13L261.02 284.4L261.4 283.68L261.81 282.96L262.26 282.25L262.75 281.55L263.27 280.85L263.82 280.16L264.41 279.47L265.03 278.79L265.69 278.12L266.37 277.46L267.09 276.8L267.85 276.16L268.63 275.52L269.44 274.9L270.29 274.28L271.16 273.68L272.06 273.09L273 272.5L273.96 271.93L274.95 271.37L275.96 270.83L277 270.29L278.07 269.77L279.17 269.26L280.28 268.77L281.43 268.29L282.59 267.82L283.78 267.37L284.99 266.93L286.22 266.51L287.47 266.1L288.74 265.71L290.03 265.34L291.34 264.98L292.66 264.63L294 264.31L295.36 264L296.73 263.7L298.12 263.42L299.52 263.16L300.93 262.92L302.35 262.7L303.78 262.49L305.23 262.3L306.68 262.13L308.14 261.97L309.6 261.84L311.08 261.72L312.56 261.62L314.04 261.53L315.53 261.47L317.02 261.42L318.51 261.4L320 261.39L321.49 261.4L322.98 261.42L324.47 261.47L325.96 261.53L327.44 261.62L328.92 261.72L330.4 261.84L331.86 261.97L333.32 262.13L334.77 262.3L336.22 262.49L337.65 262.7L339.07 262.92L340.48 263.16L341.88 263.42L343.27 263.7L344.64 264L346 264.31L347.34 264.63L348.66 264.98L349.97 265.34L351.26 265.71L352.53 266.1L353.78 266.51L355.01 266.93L356.22 267.37L357.41 267.82L358.57 268.29L359.72 268.77L360.83 269.26L361.93 269.77L363 270.29L364.04 270.83L365.05 271.37L366.04 271.93L367 272.5L367.94 273.09L368.84 273.68L369.71 274.28L370.56 274.9L371.37 275.52L372.15 276.16L372.91 276.8L373.63 277.46L374.31 278.12L374.97 278.79L375.59 279.47L376.18 280.16L376.73 280.85L377.25 281.55L377.74 282.25L378.19 282.96L378.6 283.68L378.98 284.4L379.33 285.13L379.64 285.86L379.91 286.59L380.15 287.33L380.35 288.07L380.51 288.81L380.64 289.55L380.73 290.3L380.79 291.04L380.8 291.79Z\"/></g><g class=\"iso-solid\" data-p=\"14\" data-name=\"draggable.pod5\" data-mat=\"steel\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M349.98 264.15L343.33 272.18L323.26 268.02L323.26 230.41L329.91 222.38L335.59 221.21L347.63 223.7L349.98 226.54Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"M349.98 226.54L343.33 234.56L343.33 272.18L349.98 264.15Z\"/><path class=\"iso-tn\" data-r=\"f5\" data-b=\"2\" d=\"M343.33 234.56L323.26 230.41L323.26 268.02L343.33 272.18Z\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M323.26 230.41L329.91 222.38L335.59 221.21L347.63 223.7L349.98 226.54L343.33 234.56Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M343.33 272.18L343.33 234.56M349.98 226.54L343.33 234.56L323.26 230.41\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v0\" opacity=\"1\" d=\"M324.67 230.12L323.26 230.41M348.46 226.54L342.75 233.86M348.46 226.54L349.98 226.54M342.75 233.86L324.67 230.12\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v1\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v2\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v3\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M349.98 264.15L343.33 272.18L323.26 268.02L323.26 230.41L329.91 222.38L335.59 221.21L347.63 223.7L349.98 226.54Z\"/></g><g class=\"iso-solid\" data-p=\"12\" data-name=\"draggable.pod4\" data-mat=\"steel\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M316.74 268.02L296.67 272.18L290.02 264.15L290.02 226.54L292.37 223.7L304.41 221.21L310.09 222.38L316.74 230.41Z\"/><path class=\"iso-tn\" data-r=\"f0\" data-b=\"3\" style=\"--f:0.03125\" d=\"M296.67 234.56L290.02 226.54L290.02 264.15L296.67 272.18Z\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"M316.74 230.41L296.67 234.56L296.67 272.18L316.74 268.02Z\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M296.67 234.56L290.02 226.54L292.37 223.7L304.41 221.21L310.09 222.38L316.74 230.41Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M296.67 272.18L296.67 234.56M316.74 230.41L296.67 234.56L290.02 226.54\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v0\" opacity=\"1\" d=\"M297.25 233.86L291.54 226.54M291.54 226.54L290.02 226.54M315.33 230.12L297.25 233.86M315.33 230.12L316.74 230.41\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v1\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v2\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v3\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v4\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M316.74 268.02L296.67 272.18L290.02 264.15L290.02 226.54L292.37 223.7L304.41 221.21L310.09 222.38L316.74 230.41Z\"/></g><g class=\"iso-solid\" data-p=\"36\" data-name=\"animation.bolt5\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M321.74 166.25L321.72 166.36L321.68 166.47L321.61 166.58L321.5 166.68L321.38 166.78L321.23 166.86L321.06 166.94L320.87 167L320.66 167.05L320.45 167.09L320.23 167.11L320 167.12L319.77 167.11L319.55 167.09L319.34 167.05L319.13 167L318.94 166.94L318.77 166.86L318.62 166.78L318.5 166.68L318.39 166.58L318.32 166.47L318.28 166.36L318.26 166.25L318.26 163.9L318.28 163.79L318.32 163.67L318.39 163.57L318.5 163.46L318.62 163.37L318.77 163.28L318.94 163.21L319.13 163.15L319.34 163.1L319.55 163.06L319.77 163.04L320 163.03L320.23 163.04L320.45 163.06L320.66 163.1L320.87 163.15L321.06 163.21L321.23 163.28L321.38 163.37L321.5 163.46L321.61 163.57L321.68 163.67L321.72 163.79L321.74 163.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M321.74 166.25L321.61 166.58L321.23 166.86L320.66 167.05L320 167.12L320 164.77L320.66 164.7L321.23 164.51L321.61 164.23L321.74 163.9Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M320 167.12L319.46 167.07L319.46 164.72L320 164.77Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M319.46 167.07L319.14 167L318.86 166.91L318.86 164.55L319.14 164.65L319.46 164.72Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M318.86 166.91L318.52 166.71L318.32 166.47L318.32 164.12L318.52 164.36L318.86 164.55Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M318.32 166.47L318.26 166.25L318.26 163.9L318.32 164.12Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M321.23 164.51L320.66 164.7L320 164.77L319.34 164.7L318.77 164.51L318.39 164.23L318.26 163.9L318.39 163.57L318.77 163.28L319.34 163.1L320 163.03L320.66 163.1L321.23 163.28L321.61 163.57L321.74 163.9L321.61 164.23Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M321.74 163.9L321.23 164.51L320 164.77L318.77 164.51L318.26 163.9\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M321.74 166.25L321.72 166.36L321.68 166.47L321.61 166.58L321.5 166.68L321.38 166.78L321.23 166.86L321.06 166.94L320.87 167L320.66 167.05L320.45 167.09L320.23 167.11L320 167.12L319.77 167.11L319.55 167.09L319.34 167.05L319.13 167L318.94 166.94L318.77 166.86L318.62 166.78L318.5 166.68L318.39 166.58L318.32 166.47L318.28 166.36L318.26 166.25L318.26 163.9L318.28 163.79L318.32 163.67L318.39 163.57L318.5 163.46L318.62 163.37L318.77 163.28L318.94 163.21L319.13 163.15L319.34 163.1L319.55 163.06L319.77 163.04L320 163.03L320.23 163.04L320.45 163.06L320.66 163.1L320.87 163.15L321.06 163.21L321.23 163.28L321.38 163.37L321.5 163.46L321.61 163.57L321.68 163.67L321.72 163.79L321.74 163.9Z\"/></g><g class=\"iso-solid\" data-p=\"10\" data-name=\"draggable.pod3\" data-mat=\"steel\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M292.05 274.48L283.74 284.52L267.69 281.19L265.34 278.35L265.34 240.74L270.33 234.72L276 233.55L292.05 236.87Z\"/><path class=\"iso-tn\" data-r=\"f0\" data-b=\"2\" d=\"M283.74 246.9L267.69 243.58L267.69 281.19L283.74 284.52Z\"/><path class=\"iso-tn\" data-r=\"f1\" data-b=\"3\" style=\"--f:0.03125\" d=\"M267.69 243.58L265.34 240.74L265.34 278.35L267.69 281.19Z\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"M292.05 236.87L283.74 246.9L283.74 284.52L292.05 274.48Z\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M283.74 246.9L267.69 243.58L265.34 240.74L270.33 234.72L276 233.55L292.05 236.87Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M283.74 284.52L283.74 246.9M267.69 281.19L267.69 243.58M292.05 236.87L283.74 246.9L267.69 243.58L265.34 240.74\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v0\" opacity=\"1\" d=\"M283.16 246.2L268.77 243.04M268.77 243.04L266.86 240.74M266.86 240.74L265.34 240.74M290.65 237.16L283.16 246.2M290.65 237.16L292.05 236.87\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v1\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v2\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v3\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v4\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M292.05 274.48L283.74 284.52L267.69 281.19L265.34 278.35L265.34 240.74L270.33 234.72L276 233.55L292.05 236.87Z\"/></g><g class=\"iso-solid\" data-p=\"16\" data-name=\"draggable.pod6\" data-mat=\"steel\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M374.66 278.35L372.31 281.19L356.26 284.52L347.95 274.48L347.95 236.87L364 233.55L369.67 234.72L374.66 240.74Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"M374.66 240.74L372.31 243.58L372.31 281.19L374.66 278.35Z\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"M372.31 243.58L356.26 246.9L356.26 284.52L372.31 281.19Z\"/><path class=\"iso-tn\" data-r=\"f5\" data-b=\"3\" style=\"--f:0.03125\" d=\"M356.26 246.9L347.95 236.87L347.95 274.48L356.26 284.52Z\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M347.95 236.87L364 233.55L369.67 234.72L374.66 240.74L372.31 243.58L356.26 246.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M372.31 281.19L372.31 243.58M356.26 284.52L356.26 246.9M374.66 240.74L372.31 243.58L356.26 246.9L347.95 236.87\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v0\" opacity=\"1\" d=\"M349.35 237.16L347.95 236.87M373.14 240.74L371.23 243.04M373.14 240.74L374.66 240.74M371.23 243.04L356.84 246.2M356.84 246.2L349.35 237.16\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v1\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v2\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v3\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M374.66 278.35L372.31 281.19L356.26 284.52L347.95 274.48L347.95 236.87L364 233.55L369.67 234.72L374.66 240.74Z\"/></g><g class=\"iso-solid\" data-p=\"46\" data-name=\"animation.pod2.cap\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M312.4 137.34L312.47 138.2L312.66 139.04L312.98 139.86L313.42 140.63L313.97 141.34L314.63 141.99L315.37 142.56L316.2 143.04L317.09 143.42L318.03 143.7L319.01 143.86L320 143.92L320.99 143.86L321.97 143.7L322.91 143.42L323.8 143.04L324.63 142.56L325.37 141.99L326.03 141.34L326.58 140.63L327.02 139.86L327.34 139.04L327.53 138.2L327.6 137.34L327.6 135.71L327.53 134.85L327.34 134.01L327.02 133.19L326.58 132.42L326.03 131.7L325.37 131.05L324.63 130.49L323.8 130.01L322.91 129.63L321.97 129.35L320.99 129.18L320 129.13L319.01 129.18L318.03 129.35L317.09 129.63L316.2 130.01L315.37 130.49L314.63 131.05L313.97 131.7L313.42 132.42L312.98 133.19L312.66 134.01L312.47 134.85L312.4 135.71Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M327.6 137.34L327.4 135.83L326.8 134.4L325.84 133.12L325.84 131.5L326.8 132.77L327.4 134.2L327.6 135.71Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M325.84 133.12L324.75 132.2L324.75 130.57L325.84 131.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M324.75 132.2L323.26 131.39L323.26 129.76L324.75 130.57Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M323.26 131.39L321.56 130.9L321.56 129.27L323.26 129.76Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M321.56 130.9L319.65 130.76L317.75 131.05L316 131.74L314.5 132.79L313.36 134.14L312.64 135.68L312.4 137.34L312.4 135.71L312.64 134.05L313.36 132.51L314.5 131.16L316 130.11L317.75 129.42L319.65 129.13L321.56 129.27Z\"/><path class=\"iso-tn\" data-r=\"k0\" style=\"--f:0.5\" d=\"M320 130.75L318.52 130.88L317.09 131.26L315.78 131.86L314.63 132.68L313.68 133.68L312.98 134.82L312.55 136.05L312.4 137.34L312.55 138.62L312.98 139.86L313.68 140.99L314.63 141.99L315.78 142.81L317.09 143.42L318.52 143.79L320 143.92L321.48 143.79L322.91 143.42L324.22 142.81L325.37 141.99L326.32 140.99L327.02 139.86L327.45 138.62L327.6 137.34L327.45 136.05L327.02 134.82L326.32 133.68L325.37 132.68L324.22 131.86L322.91 131.26L321.48 130.88Z\"/><path class=\"iso-tn\" data-r=\"k1\" d=\"\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M327.6 137.34L327.45 136.05L327.02 134.82L326.32 133.68L325.37 132.68L324.22 131.86L322.91 131.26L321.48 130.88L320 130.75L318.52 130.88L317.09 131.26L315.78 131.86L314.63 132.68L313.68 133.68L312.98 134.82L312.55 136.05L312.4 137.34\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M312.4 137.34L312.47 138.2L312.66 139.04L312.98 139.86L313.42 140.63L313.97 141.34L314.63 141.99L315.37 142.56L316.2 143.04L317.09 143.42L318.03 143.7L319.01 143.86L320 143.92L320.99 143.86L321.97 143.7L322.91 143.42L323.8 143.04L324.63 142.56L325.37 141.99L326.03 141.34L326.58 140.63L327.02 139.86L327.34 139.04L327.53 138.2L327.6 137.34L327.6 135.71L327.53 134.85L327.34 134.01L327.02 133.19L326.58 132.42L326.03 131.7L325.37 131.05L324.63 130.49L323.8 130.01L322.91 129.63L321.97 129.35L320.99 129.18L320 129.13L319.01 129.18L318.03 129.35L317.09 129.63L316.2 130.01L315.37 130.49L314.63 131.05L313.97 131.7L313.42 132.42L312.98 133.19L312.66 134.01L312.47 134.85L312.4 135.71Z\"/></g><g class=\"iso-solid\" data-p=\"45\" data-name=\"animation.pod2\" data-mat=\"gunmetal\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M308.06 141.95L308.15 143.2L308.41 144.43L308.83 145.62L309.43 146.76L310.17 147.83L311.06 148.81L312.08 149.69L313.22 150.46L314.45 151.11L315.77 151.62L317.14 151.99L318.56 152.22L320 152.29L321.44 152.22L322.86 151.99L324.23 151.62L325.55 151.11L326.78 150.46L327.92 149.69L328.94 148.81L329.83 147.83L330.57 146.76L331.17 145.62L331.59 144.43L331.85 143.2L331.94 141.95L331.94 137.34L331.85 136.09L331.59 134.86L331.17 133.67L330.57 132.53L329.83 131.46L328.94 130.48L327.92 129.59L326.78 128.82L325.55 128.18L324.23 127.67L322.86 127.29L321.44 127.07L320 126.99L318.56 127.07L317.14 127.29L315.77 127.67L314.45 128.18L313.22 128.82L312.08 129.59L311.06 130.48L310.17 131.46L309.43 132.53L308.83 133.67L308.41 134.86L308.15 136.09L308.06 137.34Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M331.94 141.95L331.76 140.16L331.23 138.43L330.36 136.8L329.17 135.33L329.17 130.72L330.36 132.19L331.23 133.82L331.76 135.55L331.94 137.34Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M329.17 135.33L328.36 134.56L327.46 133.87L327.46 129.26L328.36 129.95L329.17 130.72Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M327.46 133.87L326.33 133.18L325.12 132.6L325.12 127.99L326.33 128.57L327.46 129.26Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M325.12 132.6L323.81 132.15L322.46 131.83L322.46 127.22L323.81 127.54L325.12 127.99Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M322.46 131.83L320.35 131.61L318.24 131.72L316.17 132.15L314.23 132.89L312.47 133.92L310.95 135.2L309.72 136.69L308.81 138.35L308.25 140.12L308.06 141.95L308.06 137.34L308.25 135.51L308.81 133.74L309.72 132.08L310.95 130.59L312.47 129.31L314.23 128.28L316.17 127.54L318.24 127.11L320.35 127L322.46 127.22Z\"/><path class=\"iso-tn\" data-r=\"k0\" style=\"--f:0.5\" d=\"M320 131.61L318.53 131.69L317.09 131.92L315.69 132.31L314.35 132.84L313.1 133.51L311.95 134.31L310.93 135.22L310.05 136.24L309.31 137.34L308.74 138.51L308.33 139.74L308.11 141L308.06 142.27L308.2 143.54L308.51 144.78L309 145.98L309.66 147.12L310.47 148.18L311.43 149.15L312.51 150.01L313.71 150.75L315.01 151.35L316.38 151.81L317.81 152.12L319.26 152.28L320.74 152.28L322.19 152.12L323.62 151.81L324.99 151.35L326.29 150.75L327.49 150.01L328.57 149.15L329.53 148.18L330.34 147.12L331 145.98L331.49 144.78L331.8 143.54L331.94 142.27L331.89 141L331.67 139.74L331.26 138.51L330.69 137.34L329.95 136.24L329.07 135.22L328.05 134.31L326.9 133.51L325.65 132.84L324.31 132.31L322.91 131.92L321.47 131.69Z\"/><path class=\"iso-tn\" data-r=\"k1\" d=\"\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M331.94 141.95L331.85 140.7L331.59 139.48L331.17 138.28L330.57 137.14L329.83 136.08L328.94 135.09L327.92 134.21L326.78 133.44L325.55 132.79L324.23 132.28L322.86 131.91L321.44 131.68L320 131.61L318.56 131.68L317.14 131.91L315.77 132.28L314.45 132.79L313.22 133.44L312.08 134.21L311.06 135.09L310.17 136.08L309.43 137.14L308.83 138.28L308.41 139.48L308.15 140.7L308.06 141.95\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"inner\" d=\"M331.94 139.75L331.8 138.48L331.49 137.24L331 136.03L330.35 134.89L329.54 133.83L328.58 132.86L327.49 132L326.29 131.26L325 130.66L323.62 130.2L322.2 129.88L320.74 129.73L319.26 129.73L317.8 129.88L316.38 130.2L315 130.66L313.71 131.26L312.51 132L311.42 132.86L310.46 133.83L309.65 134.89L309 136.03L308.51 137.24L308.2 138.48L308.06 139.75\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M308.06 141.95L308.15 143.2L308.41 144.43L308.83 145.62L309.43 146.76L310.17 147.83L311.06 148.81L312.08 149.69L313.22 150.46L314.45 151.11L315.77 151.62L317.14 151.99L318.56 152.22L320 152.29L321.44 152.22L322.86 151.99L324.23 151.62L325.55 151.11L326.78 150.46L327.92 149.69L328.94 148.81L329.83 147.83L330.57 146.76L331.17 145.62L331.59 144.43L331.85 143.2L331.94 141.95L331.94 137.34L331.85 136.09L331.59 134.86L331.17 133.67L330.57 132.53L329.83 131.46L328.94 130.48L327.92 129.59L326.78 128.82L325.55 128.18L324.23 127.67L322.86 127.29L321.44 127.07L320 126.99L318.56 127.07L317.14 127.29L315.77 127.67L314.45 128.18L313.22 128.82L312.08 129.59L311.06 130.48L310.17 131.46L309.43 132.53L308.83 133.67L308.41 134.86L308.15 136.09L308.06 137.34Z\"/></g><g class=\"iso-solid\" data-p=\"37\" data-name=\"animation.bolt6\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M368.96 176.03L368.94 176.14L368.9 176.25L368.82 176.36L368.72 176.46L368.6 176.56L368.45 176.64L368.28 176.72L368.09 176.78L367.88 176.83L367.67 176.87L367.45 176.89L367.22 176.9L366.99 176.89L366.77 176.87L366.55 176.83L366.35 176.78L366.16 176.72L365.99 176.64L365.84 176.56L365.71 176.46L365.61 176.36L365.54 176.25L365.5 176.14L365.48 176.03L365.48 173.68L365.5 173.56L365.54 173.45L365.61 173.35L365.71 173.24L365.84 173.15L365.99 173.06L366.16 172.99L366.35 172.93L366.55 172.88L366.77 172.84L366.99 172.82L367.22 172.81L367.45 172.82L367.67 172.84L367.88 172.88L368.09 172.93L368.28 172.99L368.45 173.06L368.6 173.15L368.72 173.24L368.82 173.35L368.9 173.45L368.94 173.56L368.96 173.68Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M368.96 176.03L368.82 176.36L368.45 176.64L367.88 176.83L367.22 176.9L367.22 174.55L367.88 174.48L368.45 174.29L368.82 174.01L368.96 173.68Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M367.22 176.9L366.68 176.85L366.68 174.5L367.22 174.55Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M366.68 176.85L366.36 176.78L366.08 176.68L366.08 174.33L366.36 174.43L366.68 174.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M366.08 176.68L365.74 176.49L365.54 176.25L365.54 173.89L365.74 174.13L366.08 174.33Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M365.54 176.25L365.48 176.03L365.48 173.68L365.54 173.89Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M368.45 174.29L367.88 174.48L367.22 174.55L366.55 174.48L365.99 174.29L365.61 174.01L365.48 173.68L365.61 173.35L365.99 173.06L366.55 172.88L367.22 172.81L367.88 172.88L368.45 173.06L368.82 173.35L368.96 173.68L368.82 174.01Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M368.96 173.68L368.45 174.29L367.22 174.55L365.99 174.29L365.48 173.68\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M368.96 176.03L368.94 176.14L368.9 176.25L368.82 176.36L368.72 176.46L368.6 176.56L368.45 176.64L368.28 176.72L368.09 176.78L367.88 176.83L367.67 176.87L367.45 176.89L367.22 176.9L366.99 176.89L366.77 176.87L366.55 176.83L366.35 176.78L366.16 176.72L365.99 176.64L365.84 176.56L365.71 176.46L365.61 176.36L365.54 176.25L365.5 176.14L365.48 176.03L365.48 173.68L365.5 173.56L365.54 173.45L365.61 173.35L365.71 173.24L365.84 173.15L365.99 173.06L366.16 172.99L366.35 172.93L366.55 172.88L366.77 172.84L366.99 172.82L367.22 172.81L367.45 172.82L367.67 172.84L367.88 172.88L368.09 172.93L368.28 172.99L368.45 173.06L368.6 173.15L368.72 173.24L368.82 173.35L368.9 173.45L368.94 173.56L368.96 173.68Z\"/></g><g class=\"iso-solid\" data-p=\"35\" data-name=\"animation.bolt4\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M274.52 176.03L274.5 176.14L274.46 176.25L274.39 176.36L274.29 176.46L274.16 176.56L274.01 176.64L273.84 176.72L273.65 176.78L273.45 176.83L273.23 176.87L273.01 176.89L272.78 176.9L272.55 176.89L272.33 176.87L272.12 176.83L271.91 176.78L271.72 176.72L271.55 176.64L271.4 176.56L271.28 176.46L271.18 176.36L271.1 176.25L271.06 176.14L271.04 176.03L271.04 173.68L271.06 173.56L271.1 173.45L271.18 173.35L271.28 173.24L271.4 173.15L271.55 173.06L271.72 172.99L271.91 172.93L272.12 172.88L272.33 172.84L272.55 172.82L272.78 172.81L273.01 172.82L273.23 172.84L273.45 172.88L273.65 172.93L273.84 172.99L274.01 173.06L274.16 173.15L274.29 173.24L274.39 173.35L274.46 173.45L274.5 173.56L274.52 173.68Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M274.52 176.03L274.39 176.36L274.01 176.64L273.45 176.83L272.78 176.9L272.78 174.55L273.45 174.48L274.01 174.29L274.39 174.01L274.52 173.68Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M272.78 176.9L272.24 176.85L272.24 174.5L272.78 174.55Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M272.24 176.85L271.92 176.78L271.64 176.68L271.64 174.33L271.92 174.43L272.24 174.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M271.64 176.68L271.3 176.49L271.1 176.25L271.1 173.89L271.3 174.13L271.64 174.33Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M271.1 176.25L271.04 176.03L271.04 173.68L271.1 173.89Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M274.01 174.29L273.45 174.48L272.78 174.55L272.12 174.48L271.55 174.29L271.18 174.01L271.04 173.68L271.18 173.35L271.55 173.06L272.12 172.88L272.78 172.81L273.45 172.88L274.01 173.06L274.39 173.35L274.52 173.68L274.39 174.01Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M274.52 173.68L274.01 174.29L272.78 174.55L271.55 174.29L271.04 173.68\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M274.52 176.03L274.5 176.14L274.46 176.25L274.39 176.36L274.29 176.46L274.16 176.56L274.01 176.64L273.84 176.72L273.65 176.78L273.45 176.83L273.23 176.87L273.01 176.89L272.78 176.9L272.55 176.89L272.33 176.87L272.12 176.83L271.91 176.78L271.72 176.72L271.55 176.64L271.4 176.56L271.28 176.46L271.18 176.36L271.1 176.25L271.06 176.14L271.04 176.03L271.04 173.68L271.06 173.56L271.1 173.45L271.18 173.35L271.28 173.24L271.4 173.15L271.55 173.06L271.72 172.99L271.91 172.93L272.12 172.88L272.33 172.84L272.55 172.82L272.78 172.81L273.01 172.82L273.23 172.84L273.45 172.88L273.65 172.93L273.84 172.99L274.01 173.06L274.16 173.15L274.29 173.24L274.39 173.35L274.46 173.45L274.5 173.56L274.52 173.68Z\"/></g><g class=\"iso-solid\" data-p=\"3\" data-name=\"draggable.core\" data-mat=\"gunmetal\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M352.57 289.91L352.54 290.65L352.44 291.39L352.27 292.13L352.04 292.86L351.73 293.59L351.37 294.3L350.93 295.01L350.44 295.71L349.88 296.4L349.26 297.07L348.57 297.73L347.83 298.37L347.03 299L346.18 299.6L345.27 300.19L344.31 300.75L343.29 301.29L342.23 301.81L341.13 302.31L339.98 302.77L338.78 303.22L337.55 303.63L336.29 304.01L334.99 304.37L333.65 304.7L332.29 304.99L330.91 305.26L329.5 305.49L328.07 305.69L326.63 305.86L325.17 305.99L323.7 306.09L322.22 306.16L320.74 306.19L319.26 306.19L317.78 306.16L316.3 306.09L314.83 305.99L313.37 305.86L311.93 305.69L310.5 305.49L309.09 305.26L307.71 304.99L306.35 304.7L305.01 304.37L303.71 304.01L302.45 303.63L301.22 303.22L300.02 302.77L298.87 302.31L297.77 301.81L296.71 301.29L295.69 300.75L294.73 300.19L293.82 299.6L292.97 299L292.17 298.37L291.43 297.73L290.74 297.07L290.12 296.4L289.56 295.71L289.07 295.01L288.63 294.3L288.27 293.59L287.96 292.86L287.73 292.13L287.56 291.39L287.46 290.65L287.43 289.91L287.43 244.77L287.46 244.03L287.56 243.29L287.73 242.56L287.96 241.82L288.27 241.1L288.63 240.38L289.07 239.67L289.56 238.97L290.12 238.28L290.74 237.61L291.43 236.95L292.17 236.31L292.97 235.69L293.82 235.08L294.73 234.5L295.69 233.93L296.71 233.39L297.77 232.87L298.87 232.38L300.02 231.91L301.22 231.47L302.45 231.05L303.71 230.67L305.01 230.31L306.35 229.99L307.71 229.69L309.09 229.43L310.5 229.19L311.93 228.99L313.37 228.83L314.83 228.69L316.3 228.59L317.78 228.52L319.26 228.49L320.74 228.49L322.22 228.52L323.7 228.59L325.17 228.69L326.63 228.83L328.07 228.99L329.5 229.19L330.91 229.43L332.29 229.69L333.65 229.99L334.99 230.31L336.29 230.67L337.55 231.05L338.78 231.47L339.98 231.91L341.13 232.38L342.23 232.87L343.29 233.39L344.31 233.93L345.27 234.5L346.18 235.08L347.03 235.69L347.83 236.31L348.57 236.95L349.26 237.61L349.88 238.28L350.44 238.97L350.93 239.67L351.37 240.38L351.73 241.1L352.04 241.82L352.27 242.56L352.44 243.29L352.54 244.03L352.57 244.77Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M352.57 289.91L352.5 290.97L352.3 292.04L351.95 293.09L351.46 294.12L350.85 295.14L350.09 296.14L349.21 297.11L348.21 298.05L347.08 298.96L345.84 299.82L344.49 300.65L343.03 301.43L341.48 302.15L339.83 302.83L338.1 303.45L336.29 304.01L334.41 304.52L332.47 304.96L330.47 305.33L328.43 305.64L326.35 305.88L324.25 306.06L322.13 306.16L320 306.2L320 261.06L322.13 261.03L324.25 260.92L326.35 260.75L328.43 260.51L330.47 260.2L332.47 259.82L334.41 259.38L336.29 258.88L338.1 258.32L339.83 257.69L341.48 257.02L343.03 256.29L344.49 255.51L345.84 254.69L347.08 253.82L348.21 252.92L349.21 251.98L350.09 251.01L350.85 250.01L351.46 248.99L351.95 247.95L352.3 246.9L352.5 245.84L352.57 244.77Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M320 306.2L317.93 306.16L315.87 306.07L313.83 305.9L311.81 305.67L309.82 305.38L309.82 260.25L311.81 260.54L313.83 260.77L315.87 260.93L317.93 261.03L320 261.06Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M309.82 305.38L307.8 305.01L305.82 304.57L303.91 304.07L302.07 303.51L300.31 302.88L298.63 302.2L298.63 257.07L300.31 257.75L302.07 258.37L303.91 258.93L305.82 259.44L307.8 259.87L309.82 260.25Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M298.63 302.2L297.19 301.53L295.83 300.83L294.55 300.08L293.37 299.29L292.29 298.47L291.31 297.62L290.43 296.74L289.66 295.84L289 294.91L288.45 293.97L288.45 248.83L289 249.77L289.66 250.7L290.43 251.6L291.31 252.48L292.29 253.34L293.37 254.16L294.55 254.94L295.83 255.69L297.19 256.4L298.63 257.07Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M288.45 293.97L288.01 292.97L287.68 291.95L287.49 290.93L287.43 289.91L287.43 244.77L287.49 245.8L287.68 246.82L288.01 247.83L288.45 248.83Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M343.03 256.29L341.95 256.81L340.83 257.3L339.66 257.76L338.44 258.2L337.19 258.61L335.91 258.99L334.59 259.34L333.24 259.66L331.86 259.94L330.46 260.2L329.03 260.42L327.59 260.61L326.13 260.77L324.65 260.89L323.17 260.98L321.68 261.04L320.19 261.06L318.69 261.05L317.2 261L315.72 260.92L314.24 260.8L312.78 260.66L311.33 260.47L309.9 260.26L308.49 260.01L307.1 259.73L305.75 259.42L304.42 259.08L303.12 258.7L301.86 258.3L300.64 257.87L299.46 257.42L298.32 256.93L297.23 256.42L296.19 255.89L295.19 255.33L294.25 254.75L293.36 254.15L292.53 253.53L291.76 252.89L291.04 252.23L290.39 251.56L289.8 250.88L289.27 250.18L288.81 249.47L288.41 248.75L288.08 248.02L287.82 247.28L287.62 246.54L287.49 245.8L287.43 245.05L287.44 244.31L287.52 243.56L287.66 242.82L287.88 242.08L288.16 241.34L288.5 240.62L288.92 239.9L289.4 239.19L289.94 238.5L290.55 237.82L291.22 237.15L291.95 236.5L292.74 235.86L293.58 235.25L294.48 234.65L295.44 234.08L296.44 233.52L297.5 233L298.6 232.49L299.75 232.01L300.94 231.56L302.18 231.14L303.44 230.75L304.75 230.38L306.08 230.05L307.45 229.74L308.84 229.47L310.25 229.23L311.69 229.03L313.14 228.85L314.61 228.71L316.09 228.6L317.57 228.53L319.07 228.49L320.56 228.49L322.05 228.52L323.54 228.58L325.02 228.68L326.49 228.81L327.95 228.98L329.39 229.18L330.81 229.41L332.21 229.67L333.58 229.97L334.92 230.3L336.23 230.65L337.51 231.04L338.75 231.46L339.95 231.9L341.11 232.37L342.23 232.87L343.3 233.39L344.32 233.94L345.28 234.5L346.2 235.09L347.06 235.71L347.86 236.34L348.61 236.98L349.29 237.65L349.91 238.33L350.47 239.02L350.97 239.72L351.4 240.44L351.76 241.16L352.06 241.89L352.29 242.63L352.45 243.37L352.55 244.12L352.57 244.87L352.53 245.61L352.42 246.36L352.24 247.1L351.99 247.84L351.68 248.57L351.3 249.29L350.85 250L350.34 250.7L349.76 251.39L349.12 252.07L348.43 252.73L347.67 253.37L346.85 254L345.97 254.6L345.05 255.19L344.07 255.75Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M352.57 244.77L352.54 245.51L352.44 246.25L352.27 246.99L352.04 247.72L351.73 248.45L351.37 249.17L350.93 249.88L350.44 250.58L349.88 251.26L349.26 251.94L348.57 252.59L347.83 253.24L347.03 253.86L346.18 254.47L345.27 255.05L344.31 255.62L343.29 256.16L342.23 256.68L341.13 257.17L339.98 257.64L338.78 258.08L337.55 258.49L336.29 258.88L334.99 259.23L333.65 259.56L332.29 259.86L330.91 260.12L329.5 260.35L328.07 260.55L326.63 260.72L325.17 260.85L323.7 260.96L322.22 261.02L320.74 261.06L319.26 261.06L317.78 261.02L316.3 260.96L314.83 260.85L313.37 260.72L311.93 260.55L310.5 260.35L309.09 260.12L307.71 259.86L306.35 259.56L305.01 259.23L303.71 258.88L302.45 258.49L301.22 258.08L300.02 257.64L298.87 257.17L297.77 256.68L296.71 256.16L295.69 255.62L294.73 255.05L293.82 254.47L292.97 253.86L292.17 253.24L291.43 252.59L290.74 251.94L290.12 251.26L289.56 250.58L289.07 249.88L288.63 249.17L288.27 248.45L287.96 247.72L287.73 246.99L287.56 246.25L287.46 245.51L287.43 244.77\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"inner\" d=\"M352.57 280.81L352.51 281.55L352.38 282.29L352.18 283.03L351.92 283.76L351.59 284.48L351.19 285.2L350.73 285.91L350.21 286.6L349.62 287.29L348.97 287.95L348.26 288.61L347.49 289.24L346.66 289.86L345.78 290.46L344.84 291.04L343.86 291.6L342.82 292.13L341.74 292.64L340.61 293.12L339.43 293.58L338.22 294.01L336.97 294.41L335.68 294.78L334.36 295.12L333.01 295.44L331.64 295.72L330.23 295.97L328.81 296.19L327.37 296.37L325.92 296.52L324.45 296.64L322.97 296.73L321.49 296.78L320 296.79L318.51 296.78L317.03 296.73L315.55 296.64L314.08 296.52L312.63 296.37L311.19 296.19L309.77 295.97L308.36 295.72L306.99 295.44L305.64 295.12L304.32 294.78L303.03 294.41L301.78 294.01L300.57 293.58L299.39 293.12L298.26 292.64L297.18 292.13L296.14 291.6L295.16 291.04L294.22 290.46L293.34 289.86L292.51 289.24L291.74 288.61L291.03 287.95L290.38 287.29L289.79 286.6L289.27 285.91L288.81 285.2L288.41 284.48L288.08 283.76L287.82 283.03L287.62 282.29L287.49 281.55L287.43 280.81M352.57 254.48L352.51 255.22L352.38 255.96L352.18 256.7L351.92 257.43L351.59 258.15L351.19 258.87L350.73 259.58L350.21 260.27L349.62 260.96L348.97 261.63L348.26 262.28L347.49 262.92L346.66 263.53L345.78 264.13L344.84 264.71L343.86 265.27L342.82 265.8L341.74 266.31L340.61 266.79L339.43 267.25L338.22 267.68L336.97 268.08L335.68 268.45L334.36 268.8L333.01 269.11L331.64 269.39L330.23 269.64L328.81 269.86L327.37 270.04L325.92 270.19L324.45 270.31L322.97 270.4L321.49 270.45L320 270.46L318.51 270.45L317.03 270.4L315.55 270.31L314.08 270.19L312.63 270.04L311.19 269.86L309.77 269.64L308.36 269.39L306.99 269.11L305.64 268.8L304.32 268.45L303.03 268.08L301.78 267.68L300.57 267.25L299.39 266.79L298.26 266.31L297.18 265.8L296.14 265.27L295.16 264.71L294.22 264.13L293.34 263.53L292.51 262.92L291.74 262.28L291.03 261.63L290.38 260.96L289.79 260.27L289.27 259.58L288.81 258.87L288.41 258.15L288.08 257.43L287.82 256.7L287.62 255.96L287.49 255.22L287.43 254.48\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M352.57 289.91L352.54 290.65L352.44 291.39L352.27 292.13L352.04 292.86L351.73 293.59L351.37 294.3L350.93 295.01L350.44 295.71L349.88 296.4L349.26 297.07L348.57 297.73L347.83 298.37L347.03 299L346.18 299.6L345.27 300.19L344.31 300.75L343.29 301.29L342.23 301.81L341.13 302.31L339.98 302.77L338.78 303.22L337.55 303.63L336.29 304.01L334.99 304.37L333.65 304.7L332.29 304.99L330.91 305.26L329.5 305.49L328.07 305.69L326.63 305.86L325.17 305.99L323.7 306.09L322.22 306.16L320.74 306.19L319.26 306.19L317.78 306.16L316.3 306.09L314.83 305.99L313.37 305.86L311.93 305.69L310.5 305.49L309.09 305.26L307.71 304.99L306.35 304.7L305.01 304.37L303.71 304.01L302.45 303.63L301.22 303.22L300.02 302.77L298.87 302.31L297.77 301.81L296.71 301.29L295.69 300.75L294.73 300.19L293.82 299.6L292.97 299L292.17 298.37L291.43 297.73L290.74 297.07L290.12 296.4L289.56 295.71L289.07 295.01L288.63 294.3L288.27 293.59L287.96 292.86L287.73 292.13L287.56 291.39L287.46 290.65L287.43 289.91L287.43 244.77L287.46 244.03L287.56 243.29L287.73 242.56L287.96 241.82L288.27 241.1L288.63 240.38L289.07 239.67L289.56 238.97L290.12 238.28L290.74 237.61L291.43 236.95L292.17 236.31L292.97 235.69L293.82 235.08L294.73 234.5L295.69 233.93L296.71 233.39L297.77 232.87L298.87 232.38L300.02 231.91L301.22 231.47L302.45 231.05L303.71 230.67L305.01 230.31L306.35 229.99L307.71 229.69L309.09 229.43L310.5 229.19L311.93 228.99L313.37 228.83L314.83 228.69L316.3 228.59L317.78 228.52L319.26 228.49L320.74 228.49L322.22 228.52L323.7 228.59L325.17 228.69L326.63 228.83L328.07 228.99L329.5 229.19L330.91 229.43L332.29 229.69L333.65 229.99L334.99 230.31L336.29 230.67L337.55 231.05L338.78 231.47L339.98 231.91L341.13 232.38L342.23 232.87L343.29 233.39L344.31 233.93L345.27 234.5L346.18 235.08L347.03 235.69L347.83 236.31L348.57 236.95L349.26 237.61L349.88 238.28L350.44 238.97L350.93 239.67L351.37 240.38L351.73 241.1L352.04 241.82L352.27 242.56L352.44 243.29L352.54 244.03L352.57 244.77Z\"/></g><g class=\"iso-solid\" data-p=\"18\" data-name=\"draggable.pod7\" data-mat=\"steel\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M374.66 293.94L369.67 299.96L364 301.14L347.95 297.81L347.95 260.2L356.26 250.17L372.31 253.49L374.66 256.33Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"M374.66 256.33L369.67 262.35L369.67 299.96L374.66 293.94Z\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"M369.67 262.35L364 263.52L364 301.14L369.67 299.96Z\"/><path class=\"iso-tn\" data-r=\"f4\" data-b=\"2\" d=\"M364 263.52L347.95 260.2L347.95 297.81L364 301.14Z\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M356.26 250.17L372.31 253.49L374.66 256.33L369.67 262.35L364 263.52L347.95 260.2Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M369.67 299.96L369.67 262.35M364 301.14L364 263.52M374.66 256.33L369.67 262.35L364 263.52L347.95 260.2\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v0\" opacity=\"1\" d=\"M373.14 256.33L368.6 261.81M373.14 256.33L374.66 256.33M368.6 261.81L364 262.76M364 262.76L349.35 259.91M349.35 259.91L347.95 260.2\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v1\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v2\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v3\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v4\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M374.66 293.94L369.67 299.96L364 301.14L347.95 297.81L347.95 260.2L356.26 250.17L372.31 253.49L374.66 256.33Z\"/></g><g class=\"iso-solid\" data-p=\"8\" data-name=\"draggable.pod2\" data-mat=\"steel\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M292.05 297.81L276 301.14L270.33 299.96L265.34 293.94L265.34 256.33L267.69 253.49L283.74 250.17L292.05 260.2Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"M292.05 260.2L276 263.52L276 301.14L292.05 297.81Z\"/><path class=\"iso-tn\" data-r=\"f1\" data-b=\"2\" d=\"M276 263.52L270.33 262.35L270.33 299.96L276 301.14Z\"/><path class=\"iso-tn\" data-r=\"f2\" data-b=\"3\" style=\"--f:0.03125\" d=\"M270.33 262.35L265.34 256.33L265.34 293.94L270.33 299.96Z\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M292.05 260.2L276 263.52L270.33 262.35L265.34 256.33L267.69 253.49L283.74 250.17Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M276 301.14L276 263.52M270.33 299.96L270.33 262.35M292.05 260.2L276 263.52L270.33 262.35L265.34 256.33\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v0\" opacity=\"1\" d=\"M290.65 259.91L276 262.76M290.65 259.91L292.05 260.2M276 262.76L271.4 261.81M271.4 261.81L266.86 256.33M266.86 256.33L265.34 256.33\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v1\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v2\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v3\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v4\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v5\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M292.05 297.81L276 301.14L270.33 299.96L265.34 293.94L265.34 256.33L267.69 253.49L283.74 250.17L292.05 260.2Z\"/></g><g class=\"iso-solid\" data-p=\"19\" data-name=\"draggable.pin7\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M371.43 281.76L371.28 281.69L371.15 281.57L371.03 281.39L370.93 281.15L370.86 280.86L370.81 280.52L370.78 280.15L370.77 279.73L370.79 279.3L370.83 278.84L370.9 278.37L370.98 277.89L371.09 277.42L371.22 276.97L371.36 276.53L371.52 276.12L371.69 275.74L371.86 275.41L372.05 275.12L372.23 274.89L372.41 274.71L372.59 274.58L372.77 274.52L372.93 274.53L377.95 275.56L378.1 275.63L378.23 275.75L378.35 275.93L378.45 276.17L378.52 276.46L378.57 276.8L378.6 277.17L378.61 277.59L378.59 278.02L378.55 278.48L378.48 278.95L378.4 279.43L378.29 279.9L378.16 280.35L378.02 280.79L377.86 281.2L377.69 281.58L377.52 281.91L377.33 282.2L377.15 282.43L376.97 282.61L376.79 282.74L376.61 282.8L376.45 282.79Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M371.43 281.76L371.07 281.45L370.84 280.74L375.85 281.78L376.08 282.49L376.45 282.79Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M370.84 280.74L370.77 280.03L375.79 281.07L375.85 281.78Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M370.77 280.03L370.81 279.04L375.83 280.08L375.79 281.07Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M372.71 274.54L372.93 274.53L377.95 275.56L377.73 275.58ZM370.81 279.04L370.99 277.86L376.01 278.9L375.83 280.08Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M370.99 277.86L371.32 276.65L371.75 275.61L372.24 274.88L372.71 274.54L377.73 275.58L377.25 275.92L376.77 276.65L376.34 277.68L376.01 278.9Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" d=\"M377.2 275.98L377.74 275.57L378.2 275.71L378.5 276.38L378.61 277.47L378.5 278.83L378.2 280.23L377.74 281.48L377.2 282.38L376.66 282.79L376.2 282.65L375.89 281.98L375.79 280.89L375.89 279.53L376.2 278.13L376.66 276.88Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M376.45 282.79L376.05 282.43L375.82 281.56L375.81 280.33L376 278.93L376.38 277.57L376.88 276.45L377.43 275.74L377.95 275.56\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M371.43 281.76L371.28 281.69L371.15 281.57L371.03 281.39L370.93 281.15L370.86 280.86L370.81 280.52L370.78 280.15L370.77 279.73L370.79 279.3L370.83 278.84L370.9 278.37L370.98 277.89L371.09 277.42L371.22 276.97L371.36 276.53L371.52 276.12L371.69 275.74L371.86 275.41L372.05 275.12L372.23 274.89L372.41 274.71L372.59 274.58L372.77 274.52L372.93 274.53L377.95 275.56L378.1 275.63L378.23 275.75L378.35 275.93L378.45 276.17L378.52 276.46L378.57 276.8L378.6 277.17L378.61 277.59L378.59 278.02L378.55 278.48L378.48 278.95L378.4 279.43L378.29 279.9L378.16 280.35L378.02 280.79L377.86 281.2L377.69 281.58L377.52 281.91L377.33 282.2L377.15 282.43L376.97 282.61L376.79 282.74L376.61 282.8L376.45 282.79Z\"/></g><g class=\"iso-solid\" data-p=\"9\" data-name=\"draggable.pin2\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M267.07 274.53L267.23 274.52L267.41 274.58L267.59 274.71L267.77 274.89L267.95 275.12L268.14 275.41L268.31 275.74L268.48 276.12L268.64 276.53L268.78 276.97L268.91 277.42L269.02 277.89L269.1 278.37L269.17 278.84L269.21 279.3L269.23 279.73L269.22 280.15L269.19 280.52L269.14 280.86L269.07 281.15L268.97 281.39L268.85 281.57L268.72 281.69L268.57 281.76L263.55 282.79L263.39 282.8L263.21 282.74L263.03 282.61L262.85 282.43L262.67 282.2L262.48 281.91L262.31 281.58L262.14 281.2L261.98 280.79L261.84 280.35L261.71 279.9L261.6 279.43L261.52 278.95L261.45 278.48L261.41 278.02L261.39 277.59L261.4 277.17L261.43 276.8L261.48 276.46L261.55 276.17L261.65 275.93L261.77 275.75L261.9 275.63L262.05 275.56Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M269.16 278.8L269.23 279.92L269.14 280.84L268.92 281.48L268.57 281.76L263.55 282.79L263.9 282.52L264.13 281.88L264.21 280.95L264.15 279.83Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M269.02 277.89L269.16 278.8L264.15 279.83L264 278.93Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M268.74 276.84L269.02 277.89L264 278.93L263.73 277.88Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M268.35 275.82L268.74 276.84L263.73 277.88L263.33 276.86Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M267.07 274.53L267.48 274.63L267.92 275.07L268.35 275.82L263.33 276.86L262.9 276.11L262.46 275.66L262.05 275.56Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:0.03125\" d=\"M262.8 275.98L263.34 276.88L263.8 278.13L264.11 279.53L264.21 280.89L264.11 281.98L263.8 282.65L263.34 282.79L262.8 282.38L262.26 281.48L261.8 280.23L261.5 278.83L261.39 277.47L261.5 276.38L261.8 275.71L262.26 275.57Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M262.05 275.56L262.57 275.74L263.12 276.45L263.62 277.57L264 278.93L264.19 280.33L264.18 281.56L263.95 282.43L263.55 282.79\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M267.07 274.53L267.23 274.52L267.41 274.58L267.59 274.71L267.77 274.89L267.95 275.12L268.14 275.41L268.31 275.74L268.48 276.12L268.64 276.53L268.78 276.97L268.91 277.42L269.02 277.89L269.1 278.37L269.17 278.84L269.21 279.3L269.23 279.73L269.22 280.15L269.19 280.52L269.14 280.86L269.07 281.15L268.97 281.39L268.85 281.57L268.72 281.69L268.57 281.76L263.55 282.79L263.39 282.8L263.21 282.74L263.03 282.61L262.85 282.43L262.67 282.2L262.48 281.91L262.31 281.58L262.14 281.2L261.98 280.79L261.84 280.35L261.71 279.9L261.6 279.43L261.52 278.95L261.45 278.48L261.41 278.02L261.39 277.59L261.4 277.17L261.43 276.8L261.48 276.46L261.55 276.17L261.65 275.93L261.77 275.75L261.9 275.63L262.05 275.56Z\"/></g><g class=\"iso-solid\" data-p=\"58\" data-name=\"svg.clip3\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M301.8 94.03L302.02 94.37L302.29 94.68L302.61 94.96L302.97 95.19L303.37 95.37L303.79 95.5L304.24 95.58L304.71 95.6L305.18 95.57L305.65 95.49L306.12 95.36L306.57 95.17L307 94.94L307.41 94.66L307.78 94.35L308.11 94L308.4 93.62L308.63 93.22L308.82 92.81L308.94 92.38L309.01 91.95L309.02 91.52L308.97 91.11L308.86 90.71L308.69 90.33L307.15 87.45L306.92 87.09L306.63 86.77L306.29 86.49L305.91 86.26L305.49 86.08L305.05 85.95L304.57 85.88L304.09 85.88L303.59 85.93L303.1 86.03L302.62 86.2L302.16 86.41L301.72 86.68L301.32 86.99L300.96 87.34L300.64 87.72L300.38 88.13L300.17 88.56L300.03 89.01L299.95 89.45L299.93 89.9L299.97 90.33L300.08 90.75L300.26 91.14Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M308.69 90.33L308.19 89.66L306.64 86.78L307.15 87.45Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M308.19 89.66L307.65 89.24L306.1 86.36L306.64 86.78Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M301.58 93.47L301.8 94.03L300.26 91.14L300.03 90.58ZM307.65 89.24L306.9 88.91L305.35 86.03L306.1 86.36Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M301.47 92.68L301.58 93.47L300.03 90.58L299.93 89.79ZM306.9 88.91L306.05 88.76L304.5 85.88L305.35 86.03Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M306.05 88.76L304.71 88.9L303.44 89.45L302.4 90.34L301.71 91.47L301.47 92.68L299.93 89.79L300.17 88.58L300.85 87.46L301.89 86.57L303.16 86.02L304.5 85.88Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"M305.25 88.79L303.88 89.21L302.7 90.02L301.87 91.12L301.49 92.37L301.62 93.59L302.23 94.62L303.26 95.32L304.55 95.6L305.94 95.41L307.23 94.79L308.26 93.82L308.88 92.62L309.01 91.36L308.63 90.22L307.79 89.34L306.61 88.84Z\"/><path class=\"iso-tn\" data-r=\"k1\" d=\"\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M308.69 90.33L307.96 89.46L306.89 88.91L305.63 88.76L304.32 89.02L303.13 89.66L302.19 90.61L301.62 91.74L301.48 92.93L301.8 94.03\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M301.8 94.03L302.02 94.37L302.29 94.68L302.61 94.96L302.97 95.19L303.37 95.37L303.79 95.5L304.24 95.58L304.71 95.6L305.18 95.57L305.65 95.49L306.12 95.36L306.57 95.17L307 94.94L307.41 94.66L307.78 94.35L308.11 94L308.4 93.62L308.63 93.22L308.82 92.81L308.94 92.38L309.01 91.95L309.02 91.52L308.97 91.11L308.86 90.71L308.69 90.33L307.15 87.45L306.92 87.09L306.63 86.77L306.29 86.49L305.91 86.26L305.49 86.08L305.05 85.95L304.57 85.88L304.09 85.88L303.59 85.93L303.1 86.03L302.62 86.2L302.16 86.41L301.72 86.68L301.32 86.99L300.96 87.34L300.64 87.72L300.38 88.13L300.17 88.56L300.03 89.01L299.95 89.45L299.93 89.9L299.97 90.33L300.08 90.75L300.26 91.14Z\"/></g><g class=\"iso-solid\" data-p=\"77\" data-name=\"stagger.tooth15\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M323.47 82.33L316.53 82.33L316.53 71.04L316.53 68.06L318.15 67.24L321.85 67.24L323.47 68.06L323.47 71.04Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"\"/><path class=\"iso-tn\" data-r=\"f5\" style=\"--f:0.5\" d=\"M323.47 71.04L316.53 71.04L316.53 82.33L323.47 82.33Z\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M316.53 71.04L316.53 68.06L318.15 67.24L321.85 67.24L323.47 68.06L323.47 71.04Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M323.47 71.04L316.53 71.04\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M323.47 82.33L316.53 82.33L316.53 71.04L316.53 68.06L318.15 67.24L321.85 67.24L323.47 68.06L323.47 71.04Z\"/></g><g class=\"iso-solid\" data-p=\"4\" data-name=\"draggable.pod0\" data-mat=\"steel\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M349.98 308.15L347.63 310.98L335.59 313.48L329.91 312.3L323.26 304.28L323.26 266.66L343.33 262.51L349.98 270.53Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"M349.98 270.53L347.63 273.37L347.63 310.98L349.98 308.15Z\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"M347.63 273.37L335.59 275.86L335.59 313.48L347.63 310.98Z\"/><path class=\"iso-tn\" data-r=\"f3\" data-b=\"2\" d=\"M335.59 275.86L329.91 274.69L329.91 312.3L335.59 313.48Z\"/><path class=\"iso-tn\" data-r=\"f4\" data-b=\"3\" style=\"--f:0.03125\" d=\"M329.91 274.69L323.26 266.66L323.26 304.28L329.91 312.3Z\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M343.33 262.51L349.98 270.53L347.63 273.37L335.59 275.86L329.91 274.69L323.26 266.66Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M347.63 310.98L347.63 273.37M335.59 313.48L335.59 275.86M329.91 312.3L329.91 274.69M349.98 270.53L347.63 273.37L335.59 275.86L329.91 274.69L323.26 266.66\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v0\" opacity=\"1\" d=\"M348.46 270.53L346.55 272.83M348.46 270.53L349.98 270.53M346.55 272.83L335.59 275.1M335.59 275.1L330.99 274.15M330.99 274.15L324.67 266.95M324.67 266.95L323.26 266.66\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v1\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v2\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v3\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M349.98 308.15L347.63 310.98L335.59 313.48L329.91 312.3L323.26 304.28L323.26 266.66L343.33 262.51L349.98 270.53Z\"/></g><g class=\"iso-solid\" data-p=\"6\" data-name=\"draggable.pod1\" data-mat=\"steel\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M316.74 304.28L310.09 312.3L304.41 313.48L292.37 310.98L290.02 308.15L290.02 270.53L296.67 262.51L316.74 266.66Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"M316.74 266.66L310.09 274.69L310.09 312.3L316.74 304.28Z\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"M310.09 274.69L304.41 275.86L304.41 313.48L310.09 312.3Z\"/><path class=\"iso-tn\" data-r=\"f2\" data-b=\"2\" d=\"M304.41 275.86L292.37 273.37L292.37 310.98L304.41 313.48Z\"/><path class=\"iso-tn\" data-r=\"f3\" data-b=\"3\" style=\"--f:0.03125\" d=\"M292.37 273.37L290.02 270.53L290.02 308.15L292.37 310.98Z\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M316.74 266.66L310.09 274.69L304.41 275.86L292.37 273.37L290.02 270.53L296.67 262.51Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M310.09 312.3L310.09 274.69M304.41 313.48L304.41 275.86M292.37 310.98L292.37 273.37M316.74 266.66L310.09 274.69L304.41 275.86L292.37 273.37L290.02 270.53\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v0\" opacity=\"1\" d=\"M315.33 266.95L309.01 274.15M315.33 266.95L316.74 266.66M309.01 274.15L304.41 275.1M304.41 275.1L293.45 272.83M293.45 272.83L291.54 270.53M291.54 270.53L290.02 270.53\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v1\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v2\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v3\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v4\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v5\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M316.74 304.28L310.09 312.3L304.41 313.48L292.37 310.98L290.02 308.15L290.02 270.53L296.67 262.51L316.74 266.66Z\"/></g><g class=\"iso-solid\" data-p=\"20\" data-name=\"easings.band.a\" data-mat=\"steel\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M374.29 242.89L374.27 243.64L374.21 244.39L374.1 245.13L373.96 245.88L373.78 246.62L373.55 247.36L373.28 248.1L372.98 248.83L372.63 249.56L372.24 250.28L371.81 251L371.35 251.71L370.84 252.41L370.3 253.11L369.72 253.8L369.1 254.48L368.44 255.15L367.75 255.81L367.02 256.47L366.25 257.11L365.45 257.74L364.61 258.36L363.74 258.97L362.84 259.57L361.91 260.15L360.94 260.72L359.94 261.28L358.91 261.82L357.86 262.35L356.77 262.86L355.66 263.36L354.51 263.85L353.35 264.31L352.15 264.77L350.93 265.2L349.69 265.62L348.43 266.02L347.14 266.4L345.84 266.77L344.51 267.11L343.17 267.44L341.81 267.75L340.43 268.04L339.04 268.31L337.63 268.57L336.21 268.8L334.77 269.01L333.33 269.21L331.87 269.38L330.41 269.53L328.94 269.67L327.46 269.78L325.97 269.87L324.48 269.95L322.99 270L321.5 270.03L320 270.04L318.5 270.03L317.01 270L315.52 269.95L314.03 269.87L312.54 269.78L311.06 269.67L309.59 269.53L308.13 269.38L306.67 269.21L305.23 269.01L303.79 268.8L302.37 268.57L300.96 268.31L299.57 268.04L298.19 267.75L296.83 267.44L295.49 267.11L294.16 266.77L292.86 266.4L291.57 266.02L290.31 265.62L289.07 265.2L287.85 264.77L286.65 264.31L285.49 263.85L284.34 263.36L283.23 262.86L282.14 262.35L281.09 261.82L280.06 261.28L279.06 260.72L278.09 260.15L277.16 259.57L276.26 258.97L275.39 258.36L274.55 257.74L273.75 257.11L272.98 256.47L272.25 255.81L271.56 255.15L270.9 254.48L270.28 253.8L269.7 253.11L269.16 252.41L268.65 251.71L268.19 251L267.76 250.28L267.37 249.56L267.02 248.83L266.72 248.1L266.45 247.36L266.22 246.62L266.04 245.88L265.9 245.13L265.79 244.39L265.73 243.64L265.71 242.89L265.71 236.31L265.73 235.56L265.79 234.82L265.9 234.07L266.04 233.32L266.22 232.58L266.45 231.84L266.72 231.11L267.02 230.37L267.37 229.65L267.76 228.92L268.19 228.21L268.65 227.5L269.16 226.79L269.7 226.1L270.28 225.41L270.9 224.73L271.56 224.05L272.25 223.39L272.98 222.74L273.75 222.1L274.55 221.46L275.39 220.84L276.26 220.23L277.16 219.64L278.09 219.05L279.06 218.48L280.06 217.93L281.09 217.38L282.14 216.85L283.23 216.34L284.34 215.84L285.49 215.36L286.65 214.89L287.85 214.44L289.07 214L290.31 213.59L291.57 213.19L292.86 212.8L294.16 212.44L295.49 212.09L296.83 211.76L298.19 211.45L299.57 211.16L300.96 210.89L302.37 210.64L303.79 210.4L305.23 210.19L306.67 210L308.13 209.82L309.59 209.67L311.06 209.54L312.54 209.42L314.03 209.33L315.52 209.26L317.01 209.21L318.5 209.18L320 209.17L321.5 209.18L322.99 209.21L324.48 209.26L325.97 209.33L327.46 209.42L328.94 209.54L330.41 209.67L331.87 209.82L333.33 210L334.77 210.19L336.21 210.4L337.63 210.64L339.04 210.89L340.43 211.16L341.81 211.45L343.17 211.76L344.51 212.09L345.84 212.44L347.14 212.8L348.43 213.19L349.69 213.59L350.93 214L352.15 214.44L353.35 214.89L354.51 215.36L355.66 215.84L356.77 216.34L357.86 216.85L358.91 217.38L359.94 217.93L360.94 218.48L361.91 219.05L362.84 219.64L363.74 220.23L364.61 220.84L365.45 221.46L366.25 222.1L367.02 222.74L367.75 223.39L368.44 224.05L369.1 224.73L369.72 225.41L370.3 226.1L370.84 226.79L371.35 227.5L371.81 228.21L372.24 228.92L372.63 229.65L372.98 230.37L373.28 231.11L373.55 231.84L373.78 232.58L373.96 233.32L374.1 234.07L374.21 234.82L374.27 235.56L374.29 236.31Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M374.29 242.89L374.17 244.67L373.83 246.44L373.25 248.19L372.44 249.92L371.41 251.62L370.16 253.28L368.69 254.9L367.02 256.47L365.14 257.97L363.07 259.42L360.82 260.79L358.39 262.09L355.8 263.3L353.05 264.43L350.16 265.46L347.14 266.4L344.01 267.24L340.78 267.97L337.45 268.6L334.05 269.11L330.59 269.52L327.09 269.81L323.55 269.98L320 270.04L320 263.46L323.55 263.4L327.09 263.22L330.59 262.93L334.05 262.53L337.45 262.02L340.78 261.39L344.01 260.66L347.14 259.82L350.16 258.88L353.05 257.85L355.8 256.72L358.39 255.51L360.82 254.21L363.07 252.84L365.14 251.39L367.02 249.88L368.69 248.32L370.16 246.7L371.41 245.04L372.44 243.34L373.25 241.61L373.83 239.85L374.17 238.09L374.29 236.31Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M320 270.04L316.55 269.98L313.12 269.82L309.71 269.55L306.35 269.17L303.04 268.68L303.04 262.1L306.35 262.58L309.71 262.96L313.12 263.24L316.55 263.4L320 263.46Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M303.04 268.68L300.14 268.16L297.3 267.55L294.53 266.87L291.85 266.1L289.26 265.27L286.77 264.36L284.38 263.38L284.38 256.8L286.77 257.78L289.26 258.68L291.85 259.52L294.53 260.28L297.3 260.97L300.14 261.57L303.04 262.1Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M284.38 263.38L281.98 262.27L279.71 261.09L277.59 259.84L275.62 258.53L273.82 257.16L272.18 255.74L270.72 254.28L269.43 252.77L268.33 251.23L267.42 249.66L267.42 243.07L268.33 244.65L269.43 246.19L270.72 247.7L272.18 249.16L273.82 250.58L275.62 251.95L277.59 253.26L279.71 254.5L281.98 255.69L284.38 256.8Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M267.42 249.66L266.68 247.99L266.14 246.3L265.82 244.6L265.71 242.89L265.71 236.31L265.82 238.02L266.14 239.72L266.68 241.41L267.42 243.07Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M358.39 255.51L356.85 256.24L355.26 256.95L353.61 257.63L351.91 258.27L350.16 258.88L348.37 259.46L346.53 259.99L344.65 260.5L342.73 260.96L340.78 261.39L338.79 261.78L336.78 262.13L334.74 262.44L332.67 262.71L330.59 262.93L328.49 263.12L326.38 263.27L324.26 263.37L322.13 263.43L320 263.46L317.87 263.43L315.74 263.37L313.62 263.27L311.51 263.12L309.41 262.93L307.33 262.71L305.26 262.44L303.22 262.13L301.21 261.78L299.22 261.39L297.27 260.96L295.35 260.5L293.47 259.99L291.63 259.46L289.84 258.88L288.09 258.27L286.39 257.63L284.74 256.95L283.15 256.24L281.61 255.51L280.13 254.74L278.72 253.94L277.37 253.12L276.08 252.27L274.86 251.39L273.71 250.49L272.63 249.57L271.63 248.63L270.7 247.68L269.84 246.7L269.07 245.71L268.37 244.7L267.75 243.68L267.21 242.65L266.75 241.61L266.38 240.56L266.09 239.5L265.88 238.44L265.75 237.38L265.71 236.31L265.75 235.24L265.88 234.18L266.09 233.12L266.38 232.06L266.75 231.01L267.21 229.97L267.75 228.94L268.37 227.92L269.07 226.92L269.84 225.92L270.7 224.95L271.63 223.99L272.63 223.05L273.71 222.13L274.86 221.23L276.08 220.36L277.37 219.51L278.72 218.68L280.13 217.88L281.61 217.12L283.15 216.38L284.74 215.67L286.39 214.99L288.09 214.35L289.84 213.74L291.63 213.17L293.47 212.63L295.35 212.12L297.27 211.66L299.22 211.23L301.21 210.84L303.22 210.49L305.26 210.18L307.33 209.92L309.41 209.69L311.51 209.5L313.62 209.35L315.74 209.25L317.87 209.19L320 209.17L322.13 209.19L324.26 209.25L326.38 209.35L328.49 209.5L330.59 209.69L332.67 209.92L334.74 210.18L336.78 210.49L338.79 210.84L340.78 211.23L342.73 211.66L344.65 212.12L346.53 212.63L348.37 213.17L350.16 213.74L351.91 214.35L353.61 214.99L355.26 215.67L356.85 216.38L358.39 217.12L359.87 217.88L361.28 218.68L362.63 219.51L363.92 220.36L365.14 221.23L366.29 222.13L367.37 223.05L368.37 223.99L369.3 224.95L370.16 225.92L370.93 226.92L371.63 227.92L372.25 228.94L372.79 229.97L373.25 231.01L373.62 232.06L373.91 233.12L374.12 234.18L374.25 235.24L374.29 236.31L374.25 237.38L374.12 238.44L373.91 239.5L373.62 240.56L373.25 241.61L372.79 242.65L372.25 243.68L371.63 244.7L370.93 245.71L370.16 246.7L369.3 247.68L368.37 248.63L367.37 249.57L366.29 250.49L365.14 251.39L363.92 252.27L362.63 253.12L361.28 253.94L359.87 254.74Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M374.29 236.31L374.27 237.06L374.21 237.81L374.1 238.55L373.96 239.3L373.78 240.04L373.55 240.78L373.28 241.51L372.98 242.25L372.63 242.97L372.24 243.7L371.81 244.41L371.35 245.12L370.84 245.83L370.3 246.53L369.72 247.21L369.1 247.9L368.44 248.57L367.75 249.23L367.02 249.88L366.25 250.53L365.45 251.16L364.61 251.78L363.74 252.39L362.84 252.98L361.91 253.57L360.94 254.14L359.94 254.7L358.91 255.24L357.86 255.77L356.77 256.28L355.66 256.78L354.51 257.26L353.35 257.73L352.15 258.18L350.93 258.62L349.69 259.04L348.43 259.44L347.14 259.82L345.84 260.18L344.51 260.53L343.17 260.86L341.81 261.17L340.43 261.46L339.04 261.73L337.63 261.98L336.21 262.22L334.77 262.43L333.33 262.62L331.87 262.8L330.41 262.95L328.94 263.09L327.46 263.2L325.97 263.29L324.48 263.36L322.99 263.41L321.5 263.45L320 263.46L318.5 263.45L317.01 263.41L315.52 263.36L314.03 263.29L312.54 263.2L311.06 263.09L309.59 262.95L308.13 262.8L306.67 262.62L305.23 262.43L303.79 262.22L302.37 261.98L300.96 261.73L299.57 261.46L298.19 261.17L296.83 260.86L295.49 260.53L294.16 260.18L292.86 259.82L291.57 259.44L290.31 259.04L289.07 258.62L287.85 258.18L286.65 257.73L285.49 257.26L284.34 256.78L283.23 256.28L282.14 255.77L281.09 255.24L280.06 254.7L279.06 254.14L278.09 253.57L277.16 252.98L276.26 252.39L275.39 251.78L274.55 251.16L273.75 250.53L272.98 249.88L272.25 249.23L271.56 248.57L270.9 247.9L270.28 247.21L269.7 246.53L269.16 245.83L268.65 245.12L268.19 244.41L267.76 243.7L267.37 242.97L267.02 242.25L266.72 241.51L266.45 240.78L266.22 240.04L266.04 239.3L265.9 238.55L265.79 237.81L265.73 237.06L265.71 236.31\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"inner\" d=\"M374.29 239.9L374.25 240.65L374.17 241.4L374.05 242.15L373.89 242.89L373.69 243.63L373.44 244.37L373.16 245.11L372.84 245.84L372.47 246.57L372.07 247.29L371.62 248L371.14 248.71L370.62 249.42L370.06 250.11L369.46 250.8L368.82 251.48L368.15 252.15L367.44 252.81L366.69 253.45L365.91 254.09L365.09 254.72L364.24 255.34L363.35 255.94L362.43 256.53L361.48 257.11L360.5 257.68L359.49 258.23L358.44 258.77L357.37 259.29L356.27 259.8L355.14 260.29L353.98 260.77L352.8 261.23L351.59 261.68L350.36 262.1L349.11 262.51L347.83 262.91L346.54 263.28L345.22 263.64L343.88 263.98L342.53 264.3L341.16 264.6L339.77 264.88L338.36 265.15L336.95 265.39L335.52 265.61L334.08 265.82L332.62 266L331.16 266.17L329.69 266.31L328.21 266.43L326.73 266.54L325.24 266.62L323.74 266.68L322.25 266.72L320.75 266.74L319.25 266.74L317.75 266.72L316.26 266.68L314.76 266.62L313.27 266.54L311.79 266.43L310.31 266.31L308.84 266.17L307.38 266L305.92 265.82L304.48 265.61L303.05 265.39L301.64 265.15L300.23 264.88L298.84 264.6L297.47 264.3L296.12 263.98L294.78 263.64L293.46 263.28L292.17 262.91L290.89 262.51L289.64 262.1L288.41 261.68L287.2 261.23L286.02 260.77L284.86 260.29L283.73 259.8L282.63 259.29L281.56 258.77L280.51 258.23L279.5 257.68L278.52 257.11L277.57 256.53L276.65 255.94L275.76 255.34L274.91 254.72L274.09 254.09L273.31 253.45L272.56 252.81L271.85 252.15L271.18 251.48L270.54 250.8L269.94 250.11L269.38 249.42L268.86 248.71L268.38 248L267.93 247.29L267.53 246.57L267.16 245.84L266.84 245.11L266.56 244.37L266.31 243.63L266.11 242.89L265.95 242.15L265.83 241.4L265.75 240.65L265.71 239.9\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M374.29 242.89L374.27 243.64L374.21 244.39L374.1 245.13L373.96 245.88L373.78 246.62L373.55 247.36L373.28 248.1L372.98 248.83L372.63 249.56L372.24 250.28L371.81 251L371.35 251.71L370.84 252.41L370.3 253.11L369.72 253.8L369.1 254.48L368.44 255.15L367.75 255.81L367.02 256.47L366.25 257.11L365.45 257.74L364.61 258.36L363.74 258.97L362.84 259.57L361.91 260.15L360.94 260.72L359.94 261.28L358.91 261.82L357.86 262.35L356.77 262.86L355.66 263.36L354.51 263.85L353.35 264.31L352.15 264.77L350.93 265.2L349.69 265.62L348.43 266.02L347.14 266.4L345.84 266.77L344.51 267.11L343.17 267.44L341.81 267.75L340.43 268.04L339.04 268.31L337.63 268.57L336.21 268.8L334.77 269.01L333.33 269.21L331.87 269.38L330.41 269.53L328.94 269.67L327.46 269.78L325.97 269.87L324.48 269.95L322.99 270L321.5 270.03L320 270.04L318.5 270.03L317.01 270L315.52 269.95L314.03 269.87L312.54 269.78L311.06 269.67L309.59 269.53L308.13 269.38L306.67 269.21L305.23 269.01L303.79 268.8L302.37 268.57L300.96 268.31L299.57 268.04L298.19 267.75L296.83 267.44L295.49 267.11L294.16 266.77L292.86 266.4L291.57 266.02L290.31 265.62L289.07 265.2L287.85 264.77L286.65 264.31L285.49 263.85L284.34 263.36L283.23 262.86L282.14 262.35L281.09 261.82L280.06 261.28L279.06 260.72L278.09 260.15L277.16 259.57L276.26 258.97L275.39 258.36L274.55 257.74L273.75 257.11L272.98 256.47L272.25 255.81L271.56 255.15L270.9 254.48L270.28 253.8L269.7 253.11L269.16 252.41L268.65 251.71L268.19 251L267.76 250.28L267.37 249.56L267.02 248.83L266.72 248.1L266.45 247.36L266.22 246.62L266.04 245.88L265.9 245.13L265.79 244.39L265.73 243.64L265.71 242.89L265.71 236.31L265.73 235.56L265.79 234.82L265.9 234.07L266.04 233.32L266.22 232.58L266.45 231.84L266.72 231.11L267.02 230.37L267.37 229.65L267.76 228.92L268.19 228.21L268.65 227.5L269.16 226.79L269.7 226.1L270.28 225.41L270.9 224.73L271.56 224.05L272.25 223.39L272.98 222.74L273.75 222.1L274.55 221.46L275.39 220.84L276.26 220.23L277.16 219.64L278.09 219.05L279.06 218.48L280.06 217.93L281.09 217.38L282.14 216.85L283.23 216.34L284.34 215.84L285.49 215.36L286.65 214.89L287.85 214.44L289.07 214L290.31 213.59L291.57 213.19L292.86 212.8L294.16 212.44L295.49 212.09L296.83 211.76L298.19 211.45L299.57 211.16L300.96 210.89L302.37 210.64L303.79 210.4L305.23 210.19L306.67 210L308.13 209.82L309.59 209.67L311.06 209.54L312.54 209.42L314.03 209.33L315.52 209.26L317.01 209.21L318.5 209.18L320 209.17L321.5 209.18L322.99 209.21L324.48 209.26L325.97 209.33L327.46 209.42L328.94 209.54L330.41 209.67L331.87 209.82L333.33 210L334.77 210.19L336.21 210.4L337.63 210.64L339.04 210.89L340.43 211.16L341.81 211.45L343.17 211.76L344.51 212.09L345.84 212.44L347.14 212.8L348.43 213.19L349.69 213.59L350.93 214L352.15 214.44L353.35 214.89L354.51 215.36L355.66 215.84L356.77 216.34L357.86 216.85L358.91 217.38L359.94 217.93L360.94 218.48L361.91 219.05L362.84 219.64L363.74 220.23L364.61 220.84L365.45 221.46L366.25 222.1L367.02 222.74L367.75 223.39L368.44 224.05L369.1 224.73L369.72 225.41L370.3 226.1L370.84 226.79L371.35 227.5L371.81 228.21L372.24 228.92L372.63 229.65L372.98 230.37L373.28 231.11L373.55 231.84L373.78 232.58L373.96 233.32L374.1 234.07L374.21 234.82L374.27 235.56L374.29 236.31Z\"/></g><g class=\"iso-solid\" data-p=\"26\" data-name=\"easings.cam4\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M340.97 211.86L334.65 223.66L319.97 221.69L319.97 219.81L326.29 208.01L329.61 207.05L339.05 208.32L340.97 209.98Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"M340.97 209.98L334.65 221.78L334.65 223.66L340.97 211.86Z\"/><path class=\"iso-tn\" data-r=\"f5\" data-b=\"1\" d=\"M334.65 221.78L319.97 219.81L319.97 221.69L334.65 223.66Z\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M319.97 219.81L326.29 208.01L329.61 207.05L339.05 208.32L340.97 209.98L334.65 221.78Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M334.65 223.66L334.65 221.78M340.97 209.98L334.65 221.78L319.97 219.81\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M340.97 211.86L334.65 223.66L319.97 221.69L319.97 219.81L326.29 208.01L329.61 207.05L339.05 208.32L340.97 209.98Z\"/></g><g class=\"iso-solid\" data-p=\"25\" data-name=\"easings.cam3\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M305.41 223.64L294.66 229.02L277.39 220.38L277.39 218.5L277.39 216.58L284.3 213.12L288.14 213.12L305.41 221.76Z\"/><path class=\"iso-tn\" data-r=\"f0\" data-b=\"3\" d=\"M294.66 227.14L277.39 218.5L277.39 220.38L294.66 229.02Z\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"M305.41 221.76L294.66 227.14L294.66 229.02L305.41 223.64Z\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M294.66 227.14L277.39 218.5L277.39 216.58L284.3 213.12L288.14 213.12L305.41 221.76Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M294.66 229.02L294.66 227.14M305.41 221.76L294.66 227.14L277.39 218.5\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M305.41 223.64L294.66 229.02L277.39 220.38L277.39 218.5L277.39 216.58L284.3 213.12L288.14 213.12L305.41 221.76Z\"/></g><g class=\"iso-solid\" data-p=\"27\" data-name=\"easings.cam5\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M374.75 231.5L372.83 233.17L349.24 236.33L345.3 228.99L345.3 227.11L368.9 223.94L372.22 224.9L374.75 229.62Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"M374.75 229.62L372.83 231.29L372.83 233.17L374.75 231.5Z\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"M372.83 231.29L349.24 234.45L349.24 236.33L372.83 233.17Z\"/><path class=\"iso-tn\" data-r=\"f5\" data-b=\"3\" style=\"--f:0.46875\" d=\"M349.24 234.45L345.3 227.11L345.3 228.99L349.24 236.33Z\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M345.3 227.11L368.9 223.94L372.22 224.9L374.75 229.62L372.83 231.29L349.24 234.45Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M372.83 233.17L372.83 231.29M349.24 236.33L349.24 234.45M374.75 229.62L372.83 231.29L349.24 234.45L345.3 227.11\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M374.75 231.5L372.83 233.17L349.24 236.33L345.3 228.99L345.3 227.11L368.9 223.94L372.22 224.9L374.75 229.62Z\"/></g><g class=\"iso-solid\" data-p=\"28\" data-name=\"easings.hub\" data-mat=\"gunmetal\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M346.06 236.31L346.02 237.05L345.89 237.8L345.68 238.53L345.38 239.26L345 239.98L344.54 240.69L344 241.38L343.39 242.06L342.69 242.72L341.92 243.35L341.08 243.97L340.17 244.56L339.2 245.12L338.16 245.65L337.07 246.16L335.91 246.63L334.71 247.07L333.46 247.47L332.16 247.83L330.83 248.16L329.45 248.45L328.05 248.7L326.62 248.91L325.18 249.08L323.71 249.21L322.23 249.29L320.74 249.33L319.26 249.33L317.77 249.29L316.29 249.21L314.82 249.08L313.38 248.91L311.95 248.7L310.55 248.45L309.17 248.16L307.84 247.83L306.54 247.47L305.29 247.07L304.09 246.63L302.93 246.16L301.84 245.65L300.8 245.12L299.83 244.56L298.92 243.97L298.08 243.35L297.31 242.72L296.61 242.06L296 241.38L295.46 240.69L295 239.98L294.62 239.26L294.32 238.53L294.11 237.8L293.98 237.05L293.94 236.31L293.94 234.43L293.98 233.69L294.11 232.94L294.32 232.21L294.62 231.48L295 230.76L295.46 230.05L296 229.36L296.61 228.68L297.31 228.02L298.08 227.39L298.92 226.77L299.83 226.18L300.8 225.62L301.84 225.09L302.93 224.58L304.09 224.11L305.29 223.67L306.54 223.27L307.84 222.91L309.17 222.58L310.55 222.29L311.95 222.04L313.38 221.83L314.82 221.66L316.29 221.53L317.77 221.45L319.26 221.41L320.74 221.41L322.23 221.45L323.71 221.53L325.18 221.66L326.62 221.83L328.05 222.04L329.45 222.29L330.83 222.58L332.16 222.91L333.46 223.27L334.71 223.67L335.91 224.11L337.07 224.58L338.16 225.09L339.2 225.62L340.17 226.18L341.08 226.77L341.92 227.39L342.69 228.02L343.39 228.68L344 229.36L344.54 230.05L345 230.76L345.38 231.48L345.68 232.21L345.89 232.94L346.02 233.69L346.06 234.43Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M346.06 236.31L345.97 237.39L345.7 238.46L345.26 239.51L344.65 240.54L343.86 241.54L342.92 242.51L341.82 243.44L340.56 244.31L339.17 245.14L337.65 245.9L336.01 246.59L334.25 247.22L332.4 247.77L330.47 248.24L328.46 248.63L326.4 248.94L324.29 249.16L322.15 249.3L320 249.34L320 247.46L322.15 247.42L324.29 247.28L326.4 247.06L328.46 246.75L330.47 246.36L332.4 245.89L334.25 245.34L336.01 244.71L337.65 244.02L339.17 243.25L340.56 242.43L341.82 241.56L342.92 240.63L343.86 239.66L344.65 238.66L345.26 237.63L345.7 236.57L345.97 235.51L346.06 234.43Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M320 249.34L317.93 249.3L315.88 249.18L313.85 248.97L311.86 248.69L311.86 246.81L313.85 247.09L315.88 247.3L317.93 247.42L320 247.46Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M311.86 248.69L309.92 248.33L308.04 247.89L306.24 247.37L304.52 246.79L302.9 246.14L302.9 244.26L304.52 244.91L306.24 245.49L308.04 246.01L309.92 246.44L311.86 246.81Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M302.9 246.14L301.47 245.47L300.14 244.75L298.93 243.98L297.83 243.16L296.86 242.31L296.02 241.42L295.32 240.5L294.76 239.56L294.76 237.68L295.32 238.62L296.02 239.54L296.86 240.42L297.83 241.28L298.93 242.09L300.14 242.87L301.47 243.59L302.9 244.26Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M294.76 239.56L294.4 238.76L294.15 237.95L293.99 237.13L293.94 236.31L293.94 234.43L293.99 235.25L294.15 236.07L294.4 236.88L294.76 237.68Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M338.43 243.64L337.34 244.15L336.21 244.63L335.01 245.08L333.77 245.49L332.49 245.87L331.16 246.2L329.8 246.5L328.41 246.76L326.98 246.98L325.54 247.16L324.08 247.3L322.6 247.39L321.12 247.45L319.63 247.46L318.14 247.43L316.66 247.35L315.19 247.24L313.74 247.08L312.3 246.88L310.89 246.64L309.51 246.36L308.17 246.04L306.86 245.68L305.6 245.29L304.38 244.86L303.22 244.4L302.11 243.9L301.05 243.38L300.06 242.82L299.14 242.24L298.28 241.63L297.49 241L296.78 240.35L296.14 239.67L295.58 238.98L295.1 238.28L294.7 237.56L294.39 236.83L294.16 236.1L294.01 235.36L293.94 234.62L293.96 233.87L294.07 233.13L294.26 232.39L294.54 231.66L294.89 230.94L295.33 230.23L295.85 229.53L296.45 228.85L297.13 228.19L297.88 227.54L298.7 226.92L299.59 226.33L300.55 225.76L301.57 225.22L302.66 224.71L303.79 224.23L304.99 223.78L306.23 223.37L307.51 222.99L308.84 222.66L310.2 222.36L311.59 222.1L313.02 221.88L314.46 221.7L315.92 221.56L317.4 221.47L318.88 221.41L320.37 221.4L321.86 221.43L323.34 221.51L324.81 221.62L326.26 221.78L327.7 221.98L329.11 222.22L330.49 222.5L331.83 222.82L333.14 223.18L334.4 223.57L335.62 224L336.78 224.46L337.89 224.96L338.95 225.48L339.94 226.04L340.86 226.62L341.72 227.23L342.51 227.86L343.22 228.51L343.86 229.19L344.42 229.88L344.9 230.58L345.3 231.3L345.61 232.03L345.84 232.76L345.99 233.5L346.06 234.24L346.04 234.99L345.93 235.73L345.74 236.47L345.46 237.2L345.11 237.92L344.67 238.63L344.15 239.33L343.55 240.01L342.87 240.67L342.12 241.32L341.3 241.94L340.41 242.53L339.45 243.1Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M346.06 234.43L346.02 235.17L345.89 235.92L345.68 236.65L345.38 237.38L345 238.1L344.54 238.81L344 239.5L343.39 240.18L342.69 240.84L341.92 241.47L341.08 242.09L340.17 242.68L339.2 243.24L338.16 243.77L337.07 244.28L335.91 244.75L334.71 245.19L333.46 245.59L332.16 245.95L330.83 246.28L329.45 246.57L328.05 246.82L326.62 247.03L325.18 247.2L323.71 247.33L322.23 247.41L320.74 247.45L319.26 247.45L317.77 247.41L316.29 247.33L314.82 247.2L313.38 247.03L311.95 246.82L310.55 246.57L309.17 246.28L307.84 245.95L306.54 245.59L305.29 245.19L304.09 244.75L302.93 244.28L301.84 243.77L300.8 243.24L299.83 242.68L298.92 242.09L298.08 241.47L297.31 240.84L296.61 240.18L296 239.5L295.46 238.81L295 238.1L294.62 237.38L294.32 236.65L294.11 235.92L293.98 235.17L293.94 234.43\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M346.06 236.31L346.02 237.05L345.89 237.8L345.68 238.53L345.38 239.26L345 239.98L344.54 240.69L344 241.38L343.39 242.06L342.69 242.72L341.92 243.35L341.08 243.97L340.17 244.56L339.2 245.12L338.16 245.65L337.07 246.16L335.91 246.63L334.71 247.07L333.46 247.47L332.16 247.83L330.83 248.16L329.45 248.45L328.05 248.7L326.62 248.91L325.18 249.08L323.71 249.21L322.23 249.29L320.74 249.33L319.26 249.33L317.77 249.29L316.29 249.21L314.82 249.08L313.38 248.91L311.95 248.7L310.55 248.45L309.17 248.16L307.84 247.83L306.54 247.47L305.29 247.07L304.09 246.63L302.93 246.16L301.84 245.65L300.8 245.12L299.83 244.56L298.92 243.97L298.08 243.35L297.31 242.72L296.61 242.06L296 241.38L295.46 240.69L295 239.98L294.62 239.26L294.32 238.53L294.11 237.8L293.98 237.05L293.94 236.31L293.94 234.43L293.98 233.69L294.11 232.94L294.32 232.21L294.62 231.48L295 230.76L295.46 230.05L296 229.36L296.61 228.68L297.31 228.02L298.08 227.39L298.92 226.77L299.83 226.18L300.8 225.62L301.84 225.09L302.93 224.58L304.09 224.11L305.29 223.67L306.54 223.27L307.84 222.91L309.17 222.58L310.55 222.29L311.95 222.04L313.38 221.83L314.82 221.66L316.29 221.53L317.77 221.45L319.26 221.41L320.74 221.41L322.23 221.45L323.71 221.53L325.18 221.66L326.62 221.83L328.05 222.04L329.45 222.29L330.83 222.58L332.16 222.91L333.46 223.27L334.71 223.67L335.91 224.11L337.07 224.58L338.16 225.09L339.2 225.62L340.17 226.18L341.08 226.77L341.92 227.39L342.69 228.02L343.39 228.68L344 229.36L344.54 230.05L345 230.76L345.38 231.48L345.68 232.21L345.89 232.94L346.02 233.69L346.06 234.43Z\"/></g><g class=\"iso-solid\" data-p=\"24\" data-name=\"easings.cam2\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M294.7 243.63L271.1 246.8L267.78 245.84L265.25 241.12L265.25 239.24L267.17 237.57L290.76 234.41L294.7 241.75Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"M294.7 241.75L271.1 244.92L271.1 246.8L294.7 243.63Z\"/><path class=\"iso-tn\" data-r=\"f1\" data-b=\"2\" d=\"M271.1 244.92L267.78 243.96L267.78 245.84L271.1 246.8Z\"/><path class=\"iso-tn\" data-r=\"f2\" data-b=\"3\" style=\"--f:0.46875\" d=\"M267.78 243.96L265.25 239.24L265.25 241.12L267.78 245.84Z\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M294.7 241.75L271.1 244.92L267.78 243.96L265.25 239.24L267.17 237.57L290.76 234.41Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M271.1 246.8L271.1 244.92M267.78 245.84L267.78 243.96M294.7 241.75L271.1 244.92L267.78 243.96L265.25 239.24\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M294.7 243.63L271.1 246.8L267.78 245.84L265.25 241.12L265.25 239.24L267.17 237.57L290.76 234.41L294.7 241.75Z\"/></g><g class=\"iso-solid\" data-p=\"78\" data-name=\"stagger.tooth16\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M340.36 80.91L338.81 83.79L332.1 82.9L332.1 71.61L333.65 68.73L335.64 68.15L339.21 68.63L340.36 69.63Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"M340.36 69.63L338.81 72.51L338.81 83.79L340.36 80.91Z\"/><path class=\"iso-tn\" data-r=\"f5\" data-b=\"1\" d=\"M338.81 72.51L332.1 71.61L332.1 82.9L338.81 83.79Z\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M332.1 71.61L333.65 68.73L335.64 68.15L339.21 68.63L340.36 69.63L338.81 72.51Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M338.81 83.79L338.81 72.51M340.36 69.63L338.81 72.51L332.1 71.61\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M340.36 80.91L338.81 83.79L332.1 82.9L332.1 71.61L333.65 68.73L335.64 68.15L339.21 68.63L340.36 69.63Z\"/></g><g class=\"iso-solid\" data-p=\"76\" data-name=\"stagger.tooth14\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M307.9 82.9L301.19 83.79L299.64 80.91L299.64 69.63L300.79 68.63L304.36 68.15L306.35 68.73L307.9 71.61Z\"/><path class=\"iso-tn\" data-r=\"f0\" data-b=\"3\" style=\"--f:0.46875\" d=\"M301.19 72.51L299.64 69.63L299.64 80.91L301.19 83.79Z\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"M307.9 71.61L301.19 72.51L301.19 83.79L307.9 82.9Z\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M301.19 72.51L299.64 69.63L300.79 68.63L304.36 68.15L306.35 68.73L307.9 71.61Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M301.19 83.79L301.19 72.51M307.9 71.61L301.19 72.51L299.64 69.63\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M307.9 82.9L301.19 83.79L299.64 80.91L299.64 69.63L300.79 68.63L304.36 68.15L306.35 68.73L307.9 71.61Z\"/></g><g class=\"iso-solid\" data-p=\"38\" data-name=\"animation.bolt7\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M388.51 199.64L388.5 199.75L388.45 199.86L388.38 199.97L388.28 200.07L388.15 200.17L388.01 200.25L387.83 200.33L387.65 200.39L387.44 200.44L387.23 200.48L387 200.5L386.78 200.51L386.55 200.5L386.33 200.48L386.11 200.44L385.91 200.39L385.72 200.33L385.55 200.25L385.4 200.17L385.27 200.07L385.17 199.97L385.1 199.86L385.05 199.75L385.04 199.64L385.04 197.29L385.05 197.17L385.1 197.06L385.17 196.95L385.27 196.85L385.4 196.76L385.55 196.67L385.72 196.6L385.91 196.53L386.11 196.48L386.33 196.45L386.55 196.43L386.78 196.42L387 196.43L387.23 196.45L387.44 196.48L387.65 196.53L387.83 196.6L388.01 196.67L388.15 196.76L388.28 196.85L388.38 196.95L388.45 197.06L388.5 197.17L388.51 197.29Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M388.51 199.64L388.38 199.97L388.01 200.25L387.44 200.44L386.78 200.51L386.78 198.16L387.44 198.09L388.01 197.9L388.38 197.62L388.51 197.29Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M386.78 200.51L386.23 200.46L386.23 198.11L386.78 198.16Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M386.23 200.46L385.92 200.39L385.64 200.29L385.64 197.94L385.92 198.04L386.23 198.11Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M385.64 200.29L385.3 200.09L385.09 199.85L385.09 197.5L385.3 197.74L385.64 197.94Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M385.09 199.85L385.04 199.64L385.04 197.29L385.09 197.5Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M388.01 197.9L387.44 198.09L386.78 198.16L386.11 198.09L385.55 197.9L385.17 197.62L385.04 197.29L385.17 196.95L385.55 196.67L386.11 196.48L386.78 196.42L387.44 196.48L388.01 196.67L388.38 196.95L388.51 197.29L388.38 197.62Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M388.51 197.29L388.01 197.9L386.78 198.16L385.55 197.9L385.04 197.29\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M388.51 199.64L388.5 199.75L388.45 199.86L388.38 199.97L388.28 200.07L388.15 200.17L388.01 200.25L387.83 200.33L387.65 200.39L387.44 200.44L387.23 200.48L387 200.5L386.78 200.51L386.55 200.5L386.33 200.48L386.11 200.44L385.91 200.39L385.72 200.33L385.55 200.25L385.4 200.17L385.27 200.07L385.17 199.97L385.1 199.86L385.05 199.75L385.04 199.64L385.04 197.29L385.05 197.17L385.1 197.06L385.17 196.95L385.27 196.85L385.4 196.76L385.55 196.67L385.72 196.6L385.91 196.53L386.11 196.48L386.33 196.45L386.55 196.43L386.78 196.42L387 196.43L387.23 196.45L387.44 196.48L387.65 196.53L387.83 196.6L388.01 196.67L388.15 196.76L388.28 196.85L388.38 196.95L388.45 197.06L388.5 197.17L388.51 197.29Z\"/></g><g class=\"iso-solid\" data-p=\"34\" data-name=\"animation.bolt3\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M254.96 199.64L254.95 199.75L254.9 199.86L254.83 199.97L254.73 200.07L254.6 200.17L254.45 200.25L254.28 200.33L254.09 200.39L253.89 200.44L253.67 200.48L253.45 200.5L253.22 200.51L253 200.5L252.77 200.48L252.56 200.44L252.35 200.39L252.17 200.33L251.99 200.25L251.85 200.17L251.72 200.07L251.62 199.97L251.55 199.86L251.5 199.75L251.49 199.64L251.49 197.29L251.5 197.17L251.55 197.06L251.62 196.95L251.72 196.85L251.85 196.76L251.99 196.67L252.17 196.6L252.35 196.53L252.56 196.48L252.77 196.45L253 196.43L253.22 196.42L253.45 196.43L253.67 196.45L253.89 196.48L254.09 196.53L254.28 196.6L254.45 196.67L254.6 196.76L254.73 196.85L254.83 196.95L254.9 197.06L254.95 197.17L254.96 197.29Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M254.96 199.64L254.83 199.97L254.45 200.25L253.89 200.44L253.22 200.51L253.22 198.16L253.89 198.09L254.45 197.9L254.83 197.62L254.96 197.29Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M253.22 200.51L252.68 200.46L252.68 198.11L253.22 198.16Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M252.68 200.46L252.37 200.39L252.08 200.29L252.08 197.94L252.37 198.04L252.68 198.11Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M252.08 200.29L251.75 200.09L251.54 199.85L251.54 197.5L251.75 197.74L252.08 197.94Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M251.54 199.85L251.49 199.64L251.49 197.29L251.54 197.5Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M254.45 197.9L253.89 198.09L253.22 198.16L252.56 198.09L251.99 197.9L251.62 197.62L251.49 197.29L251.62 196.95L251.99 196.67L252.56 196.48L253.22 196.42L253.89 196.48L254.45 196.67L254.83 196.95L254.96 197.29L254.83 197.62Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M254.96 197.29L254.45 197.9L253.22 198.16L251.99 197.9L251.49 197.29\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M254.96 199.64L254.95 199.75L254.9 199.86L254.83 199.97L254.73 200.07L254.6 200.17L254.45 200.25L254.28 200.33L254.09 200.39L253.89 200.44L253.67 200.48L253.45 200.5L253.22 200.51L253 200.5L252.77 200.48L252.56 200.44L252.35 200.39L252.17 200.33L251.99 200.25L251.85 200.17L251.72 200.07L251.62 199.97L251.55 199.86L251.5 199.75L251.49 199.64L251.49 197.29L251.5 197.17L251.55 197.06L251.62 196.95L251.72 196.85L251.85 196.76L251.99 196.67L252.17 196.6L252.35 196.53L252.56 196.48L252.77 196.45L253 196.43L253.22 196.42L253.45 196.43L253.67 196.45L253.89 196.48L254.09 196.53L254.28 196.6L254.45 196.67L254.6 196.76L254.73 196.85L254.83 196.95L254.9 197.06L254.95 197.17L254.96 197.29Z\"/></g><g class=\"iso-solid\" data-p=\"75\" data-name=\"stagger.tooth13\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M293.15 85.46L287.13 87.2L284.15 84.61L284.15 73.33L284.74 72.21L287.94 71.29L290.16 71.59L293.15 74.18Z\"/><path class=\"iso-tn\" data-r=\"f0\" data-b=\"3\" d=\"M287.13 75.91L284.15 73.33L284.15 84.61L287.13 87.2Z\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"M293.15 74.18L287.13 75.91L287.13 87.2L293.15 85.46Z\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M287.13 75.91L284.15 73.33L284.74 72.21L287.94 71.29L290.16 71.59L293.15 74.18Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M287.13 87.2L287.13 75.91M293.15 74.18L287.13 75.91L284.15 73.33\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M293.15 85.46L287.13 87.2L284.15 84.61L284.15 73.33L284.74 72.21L287.94 71.29L290.16 71.59L293.15 74.18Z\"/></g><g class=\"iso-solid\" data-p=\"79\" data-name=\"stagger.tooth17\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M355.85 84.61L352.87 87.2L346.85 85.46L346.85 74.18L349.84 71.59L352.06 71.29L355.26 72.21L355.85 73.33Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"M355.85 73.33L352.87 75.91L352.87 87.2L355.85 84.61Z\"/><path class=\"iso-tn\" data-r=\"f5\" data-b=\"2\" d=\"M352.87 75.91L346.85 74.18L346.85 85.46L352.87 87.2Z\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M346.85 74.18L349.84 71.59L352.06 71.29L355.26 72.21L355.85 73.33L352.87 75.91Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M352.87 87.2L352.87 75.91M355.85 73.33L352.87 75.91L346.85 74.18\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M355.85 84.61L352.87 87.2L346.85 85.46L346.85 74.18L349.84 71.59L352.06 71.29L355.26 72.21L355.85 73.33Z\"/></g><g class=\"iso-solid\" data-p=\"22\" data-name=\"easings.cam0\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M362.61 254.16L355.7 257.62L351.86 257.62L334.59 248.98L334.59 247.1L345.34 241.72L362.61 250.36L362.61 252.28Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"M362.61 252.28L355.7 255.74L355.7 257.62L362.61 254.16Z\"/><path class=\"iso-tn\" data-r=\"f3\" style=\"--f:0.5\" d=\"M355.7 255.74L351.86 255.74L351.86 257.62L355.7 257.62Z\"/><path class=\"iso-tn\" data-r=\"f4\" data-b=\"3\" d=\"M351.86 255.74L334.59 247.1L334.59 248.98L351.86 257.62Z\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M345.34 241.72L362.61 250.36L362.61 252.28L355.7 255.74L351.86 255.74L334.59 247.1Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M355.7 257.62L355.7 255.74M351.86 257.62L351.86 255.74M362.61 252.28L355.7 255.74L351.86 255.74L334.59 247.1\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M362.61 254.16L355.7 257.62L351.86 257.62L334.59 248.98L334.59 247.1L345.34 241.72L362.61 250.36L362.61 252.28Z\"/></g><g class=\"iso-solid\" data-p=\"7\" data-name=\"draggable.pin1\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M295.56 291.08L295.83 290.8L296.14 290.57L296.49 290.39L296.88 290.26L297.29 290.18L297.72 290.16L298.16 290.19L298.61 290.28L299.05 290.43L299.49 290.63L299.9 290.87L300.29 291.16L300.64 291.48L300.96 291.84L301.23 292.23L301.46 292.64L301.63 293.06L301.74 293.49L301.8 293.92L301.81 294.33L301.75 294.74L301.64 295.12L301.47 295.47L301.25 295.79L299.17 298.3L298.91 298.56L298.61 298.79L298.27 298.97L297.91 299.1L297.52 299.18L297.11 299.21L296.68 299.19L296.26 299.12L295.83 299L295.41 298.83L295.01 298.62L294.62 298.36L294.26 298.06L293.94 297.73L293.65 297.38L293.41 297L293.21 296.6L293.06 296.19L292.96 295.78L292.92 295.37L292.92 294.97L292.99 294.59L293.1 294.23L293.27 293.89L293.48 293.59Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M301.1 292.04L301.61 293.01L301.81 294.02L301.68 294.98L301.25 295.79L299.17 298.3L299.61 297.49L299.73 296.53L299.53 295.52L299.03 294.55Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M300.62 291.46L301.1 292.04L299.03 294.55L298.54 293.97Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M299.94 290.89L300.62 291.46L298.54 293.97L297.86 293.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M299.15 290.47L299.94 290.89L297.86 293.4L297.07 292.98Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M295.56 291.08L296.24 290.51L297.13 290.2L298.13 290.19L299.15 290.47L297.07 292.98L296.05 292.7L295.05 292.71L294.17 293.02L293.48 293.59Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"2\" d=\"M296.32 292.74L297.63 293.26L298.74 294.18L299.48 295.37L299.74 296.65L299.48 297.82L298.74 298.7L297.63 299.16L296.32 299.14L295.02 298.62L293.91 297.7L293.17 296.51L292.91 295.23L293.17 294.06L293.91 293.18L295.02 292.72Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M293.48 293.59L294.42 292.89L295.65 292.67L296.98 292.94L298.21 293.67L299.15 294.74L299.67 296L299.67 297.25L299.17 298.3\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M295.56 291.08L295.83 290.8L296.14 290.57L296.49 290.39L296.88 290.26L297.29 290.18L297.72 290.16L298.16 290.19L298.61 290.28L299.05 290.43L299.49 290.63L299.9 290.87L300.29 291.16L300.64 291.48L300.96 291.84L301.23 292.23L301.46 292.64L301.63 293.06L301.74 293.49L301.8 293.92L301.81 294.33L301.75 294.74L301.64 295.12L301.47 295.47L301.25 295.79L299.17 298.3L298.91 298.56L298.61 298.79L298.27 298.97L297.91 299.1L297.52 299.18L297.11 299.21L296.68 299.19L296.26 299.12L295.83 299L295.41 298.83L295.01 298.62L294.62 298.36L294.26 298.06L293.94 297.73L293.65 297.38L293.41 297L293.21 296.6L293.06 296.19L292.96 295.78L292.92 295.37L292.92 294.97L292.99 294.59L293.1 294.23L293.27 293.89L293.48 293.59Z\"/></g><g class=\"iso-solid\" data-p=\"5\" data-name=\"draggable.pin0\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M338.75 295.79L338.53 295.47L338.36 295.12L338.25 294.74L338.19 294.33L338.2 293.92L338.26 293.49L338.37 293.06L338.54 292.64L338.77 292.23L339.04 291.84L339.36 291.48L339.71 291.16L340.1 290.87L340.51 290.63L340.95 290.43L341.39 290.28L341.84 290.19L342.28 290.16L342.71 290.18L343.12 290.26L343.51 290.39L343.86 290.57L344.17 290.8L344.44 291.08L346.52 293.59L346.74 293.9L346.91 294.26L347.02 294.64L347.08 295.04L347.08 295.46L347.02 295.88L346.9 296.31L346.73 296.73L346.51 297.14L346.23 297.53L345.92 297.89L345.56 298.22L345.17 298.5L344.76 298.75L344.33 298.94L343.89 299.09L343.44 299.18L343 299.21L342.57 299.19L342.16 299.12L341.77 298.99L341.42 298.8L341.1 298.57L340.83 298.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M344.3 290.92L344.44 291.08L346.52 293.59L346.38 293.43Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M343.81 290.54L344.3 290.92L346.38 293.43L345.89 293.05ZM338.75 295.79L338.52 295.45L340.6 297.96L340.83 298.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M343.13 290.26L343.81 290.54L345.89 293.05L345.21 292.77ZM338.52 295.45L338.26 294.78L340.34 297.29L340.6 297.96Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M342.35 290.16L343.13 290.26L345.21 292.77L344.42 292.67ZM338.26 294.78L338.19 294.02L340.27 296.53L340.34 297.29Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M338.19 294.02L338.44 292.88L339.08 291.8L340.02 290.92L341.16 290.35L342.35 290.16L344.42 292.67L343.23 292.86L342.1 293.43L341.15 294.31L340.52 295.38L340.27 296.53Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" d=\"M343.68 292.74L344.98 292.72L346.09 293.18L346.83 294.06L347.09 295.23L346.83 296.51L346.09 297.7L344.98 298.62L343.68 299.14L342.37 299.16L341.26 298.7L340.52 297.82L340.26 296.65L340.52 295.37L341.26 294.18L342.37 293.26Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M340.83 298.3L340.33 297.25L340.33 296L340.85 294.74L341.79 293.67L343.02 292.94L344.35 292.67L345.58 292.89L346.52 293.59\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M338.75 295.79L338.53 295.47L338.36 295.12L338.25 294.74L338.19 294.33L338.2 293.92L338.26 293.49L338.37 293.06L338.54 292.64L338.77 292.23L339.04 291.84L339.36 291.48L339.71 291.16L340.1 290.87L340.51 290.63L340.95 290.43L341.39 290.28L341.84 290.19L342.28 290.16L342.71 290.18L343.12 290.26L343.51 290.39L343.86 290.57L344.17 290.8L344.44 291.08L346.52 293.59L346.74 293.9L346.91 294.26L347.02 294.64L347.08 295.04L347.08 295.46L347.02 295.88L346.9 296.31L346.73 296.73L346.51 297.14L346.23 297.53L345.92 297.89L345.56 298.22L345.17 298.5L344.76 298.75L344.33 298.94L343.89 299.09L343.44 299.18L343 299.21L342.57 299.19L342.16 299.12L341.77 298.99L341.42 298.8L341.1 298.57L340.83 298.3Z\"/></g><g class=\"iso-solid\" data-p=\"80\" data-name=\"stagger.tooth18\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M368.91 90.19L364.68 92.3L359.77 89.84L359.77 78.56L363.99 76.45L366.3 76.45L368.91 77.75L368.91 78.91Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"M368.91 78.91L364.68 81.02L364.68 92.3L368.91 90.19Z\"/><path class=\"iso-tn\" data-r=\"f5\" data-b=\"3\" d=\"M364.68 81.02L359.77 78.56L359.77 89.84L364.68 92.3Z\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M359.77 78.56L363.99 76.45L366.3 76.45L368.91 77.75L368.91 78.91L364.68 81.02Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M364.68 92.3L364.68 81.02M368.91 78.91L364.68 81.02L359.77 78.56\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M368.91 90.19L364.68 92.3L359.77 89.84L359.77 78.56L363.99 76.45L366.3 76.45L368.91 77.75L368.91 78.91Z\"/></g><g class=\"iso-solid\" data-p=\"74\" data-name=\"stagger.tooth12\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M280.23 89.84L275.32 92.3L271.09 90.19L271.09 78.91L271.09 77.75L273.7 76.45L276.01 76.45L280.23 78.56Z\"/><path class=\"iso-tn\" data-r=\"f0\" data-b=\"3\" d=\"M275.32 81.02L271.09 78.91L271.09 90.19L275.32 92.3Z\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"M280.23 78.56L275.32 81.02L275.32 92.3L280.23 89.84Z\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M275.32 81.02L271.09 78.91L271.09 77.75L273.7 76.45L276.01 76.45L280.23 78.56Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M275.32 92.3L275.32 81.02M280.23 78.56L275.32 81.02L271.09 78.91\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M280.23 89.84L275.32 92.3L271.09 90.19L271.09 78.91L271.09 77.75L273.7 76.45L276.01 76.45L280.23 78.56Z\"/></g><g class=\"iso-solid\" data-p=\"47\" data-name=\"animation.pod3\" data-mat=\"gunmetal\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M384.6 186.19L384.6 186.1L384.6 185.84L384.6 185.42L384.6 184.82L384.6 184.08L384.6 183.19L384.6 182.17L384.6 181.03L384.6 179.8L384.6 178.48L384.6 177.11L384.6 175.69L384.6 174.25L384.6 172.81L384.6 171.39L384.6 170.01L384.6 168.7L384.6 167.46L384.6 166.33L384.6 165.31L384.6 164.42L384.6 163.67L384.6 163.08L384.6 162.65L384.6 162.39L384.6 162.31L393.82 162.31L393.82 162.39L393.82 162.65L393.82 163.08L393.82 163.67L393.82 164.42L393.82 165.31L393.82 166.33L393.82 167.47L393.82 168.7L393.82 170.02L393.82 171.39L393.82 172.81L393.82 174.25L393.82 175.69L393.82 177.11L393.82 178.49L393.82 179.8L393.82 181.03L393.82 182.17L393.82 183.19L393.82 184.08L393.82 184.82L393.82 185.42L393.82 185.85L393.82 186.11L393.82 186.19Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M384.6 186.19L384.6 186.01L384.6 185.47L384.6 184.59L384.6 183.4L384.6 181.93L384.6 180.22L393.82 180.22L393.82 181.93L393.82 183.4L393.82 184.59L393.82 185.47L393.82 186.01L393.82 186.19Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M384.6 180.22L384.6 178.81L384.6 177.32L393.82 177.32L393.82 178.81L393.82 180.22Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M384.6 177.32L384.6 175.47L384.6 173.59L393.82 173.59L393.82 175.47L393.82 177.32Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M384.6 173.59L384.6 172.17L384.6 170.77L384.6 169.43L393.82 169.43L393.82 170.77L393.82 172.17L393.82 173.59Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M384.6 169.43L384.6 167.7L384.6 166.15L384.6 164.81L384.6 163.74L384.6 162.95L384.6 162.47L384.6 162.31L393.82 162.31L393.82 162.47L393.82 162.95L393.82 163.74L393.82 164.81L393.82 166.15L393.82 167.7L393.82 169.43Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" d=\"\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"inner\" d=\"M388.4 185.89L388.4 185.48L388.4 184.9L388.4 184.16L388.4 183.27L388.4 182.25L388.4 181.11L388.4 179.86L388.4 178.54L388.4 177.14L388.4 175.71L388.4 174.25L388.4 172.79L388.4 171.35L388.4 169.96L388.4 168.63L388.4 167.39L388.4 166.25L388.4 165.22L388.4 164.34L388.4 163.6L388.4 163.02L388.4 162.61\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M384.6 186.19L384.6 186.1L384.6 185.84L384.6 185.42L384.6 184.82L384.6 184.08L384.6 183.19L384.6 182.17L384.6 181.03L384.6 179.8L384.6 178.48L384.6 177.11L384.6 175.69L384.6 174.25L384.6 172.81L384.6 171.39L384.6 170.01L384.6 168.7L384.6 167.46L384.6 166.33L384.6 165.31L384.6 164.42L384.6 163.67L384.6 163.08L384.6 162.65L384.6 162.39L384.6 162.31L393.82 162.31L393.82 162.39L393.82 162.65L393.82 163.08L393.82 163.67L393.82 164.42L393.82 165.31L393.82 166.33L393.82 167.47L393.82 168.7L393.82 170.02L393.82 171.39L393.82 172.81L393.82 174.25L393.82 175.69L393.82 177.11L393.82 178.49L393.82 179.8L393.82 181.03L393.82 182.17L393.82 183.19L393.82 184.08L393.82 184.82L393.82 185.42L393.82 185.85L393.82 186.11L393.82 186.19Z\"/></g><g class=\"iso-solid\" data-p=\"48\" data-name=\"animation.pod3.cap\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M393.82 181.85L393.82 181.78L393.82 181.59L393.82 181.27L393.82 180.83L393.82 180.28L393.82 179.62L393.82 178.87L393.82 178.05L393.82 177.16L393.82 176.21L393.82 175.24L393.82 174.25L393.82 173.26L393.82 172.28L393.82 171.34L393.82 170.45L393.82 169.62L393.82 168.87L393.82 168.22L393.82 167.67L393.82 167.23L393.82 166.91L393.82 166.71L393.82 166.65L397.08 166.65L397.08 166.71L397.08 166.91L397.08 167.23L397.08 167.67L397.08 168.22L397.08 168.88L397.08 169.62L397.08 170.45L397.08 171.34L397.08 172.28L397.08 173.26L397.08 174.25L397.08 175.24L397.08 176.22L397.08 177.16L397.08 178.05L397.08 178.88L397.08 179.62L397.08 180.28L397.08 180.83L397.08 181.27L397.08 181.59L397.08 181.78L397.08 181.85Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M393.82 181.85L393.82 181.59L393.82 180.83L393.82 179.62L393.82 178.05L397.08 178.05L397.08 179.62L397.08 180.83L397.08 181.59L397.08 181.85Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M393.82 178.05L393.82 177.15L393.82 176.2L397.08 176.2L397.08 177.15L397.08 178.05Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M393.82 176.2L393.82 175.03L393.82 173.83L397.08 173.83L397.08 175.03L397.08 176.2Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M393.82 173.83L393.82 172.48L393.82 171.18L397.08 171.18L397.08 172.48L397.08 173.83Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M393.82 171.18L393.82 169.67L393.82 168.4L393.82 167.45L393.82 166.85L393.82 166.65L397.08 166.65L397.08 166.85L397.08 167.45L397.08 168.4L397.08 169.67L397.08 171.18Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" d=\"\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M393.82 181.85L393.82 181.78L393.82 181.59L393.82 181.27L393.82 180.83L393.82 180.28L393.82 179.62L393.82 178.87L393.82 178.05L393.82 177.16L393.82 176.21L393.82 175.24L393.82 174.25L393.82 173.26L393.82 172.28L393.82 171.34L393.82 170.45L393.82 169.62L393.82 168.87L393.82 168.22L393.82 167.67L393.82 167.23L393.82 166.91L393.82 166.71L393.82 166.65L397.08 166.65L397.08 166.71L397.08 166.91L397.08 167.23L397.08 167.67L397.08 168.22L397.08 168.88L397.08 169.62L397.08 170.45L397.08 171.34L397.08 172.28L397.08 173.26L397.08 174.25L397.08 175.24L397.08 176.22L397.08 177.16L397.08 178.05L397.08 178.88L397.08 179.62L397.08 180.28L397.08 180.83L397.08 181.27L397.08 181.59L397.08 181.78L397.08 181.85Z\"/></g><g class=\"iso-solid\" data-p=\"43\" data-name=\"animation.pod1\" data-mat=\"gunmetal\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M255.4 186.19L255.4 186.11L255.4 185.85L255.4 185.42L255.4 184.82L255.4 184.08L255.4 183.19L255.4 182.17L255.4 181.03L255.4 179.8L255.4 178.49L255.4 177.11L255.4 175.69L255.4 174.25L255.4 172.81L255.4 171.39L255.4 170.02L255.4 168.7L255.4 167.47L255.4 166.33L255.4 165.31L255.4 164.42L255.4 163.67L255.4 163.08L255.4 162.65L255.4 162.39L255.4 162.31L246.18 162.31L246.18 162.39L246.18 162.65L246.18 163.08L246.18 163.67L246.18 164.42L246.18 165.31L246.18 166.33L246.18 167.46L246.18 168.7L246.18 170.01L246.18 171.39L246.18 172.81L246.18 174.25L246.18 175.69L246.18 177.11L246.18 178.48L246.18 179.8L246.18 181.03L246.18 182.17L246.18 183.19L246.18 184.08L246.18 184.82L246.18 185.42L246.18 185.84L246.18 186.1L246.18 186.19Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M255.4 180.22L255.4 181.93L255.4 183.4L255.4 184.59L255.4 185.47L255.4 186.01L255.4 186.19L246.18 186.19L246.18 186.01L246.18 185.47L246.18 184.59L246.18 183.4L246.18 181.93L246.18 180.22Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M255.4 177.32L255.4 178.81L255.4 180.22L246.18 180.22L246.18 178.81L246.18 177.32Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M255.4 173.59L255.4 175.47L255.4 177.32L246.18 177.32L246.18 175.47L246.18 173.59Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M255.4 169.43L255.4 170.77L255.4 172.17L255.4 173.59L246.18 173.59L246.18 172.17L246.18 170.77L246.18 169.43Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M255.4 162.31L255.4 162.47L255.4 162.95L255.4 163.74L255.4 164.81L255.4 166.15L255.4 167.7L255.4 169.43L246.18 169.43L246.18 167.7L246.18 166.15L246.18 164.81L246.18 163.74L246.18 162.95L246.18 162.47L246.18 162.31Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" d=\"\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"inner\" d=\"M251.6 162.61L251.6 163.02L251.6 163.6L251.6 164.34L251.6 165.22L251.6 166.25L251.6 167.39L251.6 168.63L251.6 169.96L251.6 171.35L251.6 172.79L251.6 174.25L251.6 175.71L251.6 177.14L251.6 178.54L251.6 179.86L251.6 181.11L251.6 182.25L251.6 183.27L251.6 184.16L251.6 184.9L251.6 185.48L251.6 185.89\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M255.4 186.19L255.4 186.11L255.4 185.85L255.4 185.42L255.4 184.82L255.4 184.08L255.4 183.19L255.4 182.17L255.4 181.03L255.4 179.8L255.4 178.49L255.4 177.11L255.4 175.69L255.4 174.25L255.4 172.81L255.4 171.39L255.4 170.02L255.4 168.7L255.4 167.47L255.4 166.33L255.4 165.31L255.4 164.42L255.4 163.67L255.4 163.08L255.4 162.65L255.4 162.39L255.4 162.31L246.18 162.31L246.18 162.39L246.18 162.65L246.18 163.08L246.18 163.67L246.18 164.42L246.18 165.31L246.18 166.33L246.18 167.46L246.18 168.7L246.18 170.01L246.18 171.39L246.18 172.81L246.18 174.25L246.18 175.69L246.18 177.11L246.18 178.48L246.18 179.8L246.18 181.03L246.18 182.17L246.18 183.19L246.18 184.08L246.18 184.82L246.18 185.42L246.18 185.84L246.18 186.1L246.18 186.19Z\"/></g><g class=\"iso-solid\" data-p=\"44\" data-name=\"animation.pod1.cap\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M246.18 181.85L246.18 181.79L246.18 181.61L246.18 181.32L246.18 180.91L246.18 180.4L246.18 179.79L246.18 179.09L246.18 178.32L246.18 177.49L246.18 176.6L246.18 175.67L246.18 174.73L246.18 173.77L246.18 172.83L246.18 171.9L246.18 171.01L246.18 170.18L246.18 169.4L246.18 168.71L246.18 168.1L246.18 167.59L246.18 167.18L246.18 166.89L246.18 166.71L246.18 166.65L242.92 166.65L242.92 166.71L242.92 166.91L242.92 167.23L242.92 167.67L242.92 168.22L242.92 168.87L242.92 169.62L242.92 170.45L242.92 171.34L242.92 172.28L242.92 173.26L242.92 174.25L242.92 175.24L242.92 176.21L242.92 177.16L242.92 178.05L242.92 178.87L242.92 179.62L242.92 180.28L242.92 180.83L242.92 181.27L242.92 181.59L242.92 181.78L242.92 181.85Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M246.18 178.05L246.18 179.62L246.18 180.83L246.18 181.59L246.18 181.85L242.92 181.85L242.92 181.59L242.92 180.83L242.92 179.62L242.92 178.05Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M246.18 176.2L246.18 177.15L246.18 178.05L242.92 178.05L242.92 177.15L242.92 176.2Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M246.18 173.83L246.18 175.03L246.18 176.2L242.92 176.2L242.92 175.03L242.92 173.83Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M246.18 171.18L246.18 172.48L246.18 173.83L242.92 173.83L242.92 172.48L242.92 171.18Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M246.18 166.65L246.18 166.85L246.18 167.45L246.18 168.4L246.18 169.67L246.18 171.18L242.92 171.18L242.92 169.67L242.92 168.4L242.92 167.45L242.92 166.85L242.92 166.65Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" d=\"\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M246.18 181.85L246.18 181.79L246.18 181.61L246.18 181.32L246.18 180.91L246.18 180.4L246.18 179.79L246.18 179.09L246.18 178.32L246.18 177.49L246.18 176.6L246.18 175.67L246.18 174.73L246.18 173.77L246.18 172.83L246.18 171.9L246.18 171.01L246.18 170.18L246.18 169.4L246.18 168.71L246.18 168.1L246.18 167.59L246.18 167.18L246.18 166.89L246.18 166.71L246.18 166.65L242.92 166.65L242.92 166.71L242.92 166.91L242.92 167.23L242.92 167.67L242.92 168.22L242.92 168.87L242.92 169.62L242.92 170.45L242.92 171.34L242.92 172.28L242.92 173.26L242.92 174.25L242.92 175.24L242.92 176.21L242.92 177.16L242.92 178.05L242.92 178.87L242.92 179.62L242.92 180.28L242.92 180.83L242.92 181.27L242.92 181.59L242.92 181.78L242.92 181.85Z\"/></g><g class=\"iso-solid\" data-p=\"23\" data-name=\"easings.cam1\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M320.03 250.93L313.71 262.73L310.39 263.69L300.95 262.42L299.03 260.76L299.03 258.88L305.35 247.08L320.03 249.05Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"M320.03 249.05L313.71 260.85L313.71 262.73L320.03 250.93Z\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"M313.71 260.85L310.39 261.81L310.39 263.69L313.71 262.73Z\"/><path class=\"iso-tn\" data-r=\"f2\" data-b=\"1\" d=\"M310.39 261.81L300.95 260.54L300.95 262.42L310.39 263.69Z\"/><path class=\"iso-tn\" data-r=\"f3\" data-b=\"3\" d=\"M300.95 260.54L299.03 258.88L299.03 260.76L300.95 262.42Z\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M320.03 249.05L313.71 260.85L310.39 261.81L300.95 260.54L299.03 258.88L305.35 247.08Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M313.71 262.73L313.71 260.85M310.39 263.69L310.39 261.81M300.95 262.42L300.95 260.54M320.03 249.05L313.71 260.85L310.39 261.81L300.95 260.54L299.03 258.88\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M320.03 250.93L313.71 262.73L310.39 263.69L300.95 262.42L299.03 260.76L299.03 258.88L305.35 247.08L320.03 249.05Z\"/></g><g class=\"iso-solid\" data-p=\"21\" data-name=\"easings.band.b\" data-mat=\"steel\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M372.12 234.43L372.1 235.17L372.03 235.92L371.93 236.66L371.78 237.4L371.59 238.14L371.36 238.87L371.08 239.61L370.76 240.33L370.41 241.05L370.01 241.77L369.57 242.48L369.09 243.19L368.57 243.88L368.01 244.57L367.41 245.26L366.77 245.93L366.1 246.59L365.38 247.24L364.63 247.89L363.84 248.52L363.02 249.14L362.16 249.75L361.27 250.34L360.35 250.93L359.39 251.5L358.4 252.05L357.38 252.59L356.32 253.12L355.24 253.63L354.13 254.12L352.99 254.6L351.83 255.07L350.63 255.51L349.42 255.94L348.18 256.35L346.91 256.75L345.63 257.12L344.32 257.48L343 257.82L341.65 258.13L340.29 258.43L338.91 258.71L337.51 258.97L336.11 259.21L334.68 259.43L333.25 259.63L331.8 259.81L330.35 259.97L328.89 260.11L327.42 260.22L325.94 260.32L324.46 260.39L322.98 260.45L321.49 260.48L320 260.49L318.51 260.48L317.02 260.45L315.54 260.39L314.06 260.32L312.58 260.22L311.11 260.11L309.65 259.97L308.2 259.81L306.75 259.63L305.32 259.43L303.89 259.21L302.49 258.97L301.09 258.71L299.71 258.43L298.35 258.13L297 257.82L295.68 257.48L294.37 257.12L293.09 256.75L291.82 256.35L290.58 255.94L289.37 255.51L288.17 255.07L287.01 254.6L285.87 254.12L284.76 253.63L283.68 253.12L282.62 252.59L281.6 252.05L280.61 251.5L279.65 250.93L278.73 250.34L277.84 249.75L276.98 249.14L276.16 248.52L275.37 247.89L274.62 247.24L273.9 246.59L273.23 245.93L272.59 245.26L271.99 244.57L271.43 243.88L270.91 243.19L270.43 242.48L269.99 241.77L269.59 241.05L269.24 240.33L268.92 239.61L268.64 238.87L268.41 238.14L268.22 237.4L268.07 236.66L267.97 235.92L267.9 235.17L267.88 234.43L267.88 225.97L267.9 225.22L267.97 224.48L268.07 223.74L268.22 223L268.41 222.26L268.64 221.52L268.92 220.79L269.24 220.06L269.59 219.34L269.99 218.63L270.43 217.91L270.91 217.21L271.43 216.51L271.99 215.82L272.59 215.14L273.23 214.47L273.9 213.81L274.62 213.15L275.37 212.51L276.16 211.88L276.98 211.26L277.84 210.65L278.73 210.05L279.65 209.47L280.61 208.9L281.6 208.35L282.62 207.81L283.68 207.28L284.76 206.77L285.87 206.27L287.01 205.79L288.17 205.33L289.37 204.88L290.58 204.46L291.82 204.04L293.09 203.65L294.37 203.28L295.68 202.92L297 202.58L298.35 202.26L299.71 201.96L301.09 201.68L302.49 201.42L303.89 201.18L305.32 200.96L306.75 200.76L308.2 200.59L309.65 200.43L311.11 200.29L312.58 200.17L314.06 200.08L315.54 200L317.02 199.95L318.51 199.92L320 199.91L321.49 199.92L322.98 199.95L324.46 200L325.94 200.08L327.42 200.17L328.89 200.29L330.35 200.43L331.8 200.59L333.25 200.76L334.68 200.96L336.11 201.18L337.51 201.42L338.91 201.68L340.29 201.96L341.65 202.26L343 202.58L344.32 202.92L345.63 203.28L346.91 203.65L348.18 204.04L349.42 204.46L350.63 204.88L351.83 205.33L352.99 205.79L354.13 206.27L355.24 206.77L356.32 207.28L357.38 207.81L358.4 208.35L359.39 208.9L360.35 209.47L361.27 210.05L362.16 210.65L363.02 211.26L363.84 211.88L364.63 212.51L365.38 213.15L366.1 213.81L366.77 214.47L367.41 215.14L368.01 215.82L368.57 216.51L369.09 217.21L369.57 217.91L370.01 218.63L370.41 219.34L370.76 220.06L371.08 220.79L371.36 221.52L371.59 222.26L371.78 223L371.93 223.74L372.03 224.48L372.1 225.22L372.12 225.97Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M372.12 234.43L372.01 236.13L371.67 237.83L371.12 239.51L370.34 241.17L369.35 242.81L368.15 244.4L366.74 245.96L365.14 247.46L363.33 248.91L361.35 250.29L359.18 251.61L356.85 252.86L354.36 254.02L351.73 255.1L348.96 256.1L346.06 257L343.05 257.8L339.94 258.51L336.75 259.11L333.49 259.6L330.17 259.99L326.8 260.27L323.41 260.43L320 260.49L320 252.03L323.41 251.97L326.8 251.8L330.17 251.53L333.49 251.14L336.75 250.64L339.94 250.04L343.05 249.34L346.06 248.53L348.96 247.63L351.73 246.64L354.36 245.56L356.85 244.39L359.18 243.15L361.35 241.83L363.33 240.44L365.14 239L366.74 237.49L368.15 235.94L369.35 234.34L370.34 232.71L371.12 231.05L371.67 229.37L372.01 227.67L372.12 225.97Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M320 260.49L316.69 260.44L313.39 260.28L310.12 260.02L306.89 259.65L303.72 259.18L303.72 250.72L306.89 251.19L310.12 251.55L313.39 251.82L316.69 251.97L320 252.03Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M303.72 259.18L300.93 258.68L298.21 258.1L295.55 257.44L292.98 256.71L290.49 255.91L288.1 255.04L285.81 254.1L285.81 245.63L288.1 246.57L290.49 247.45L292.98 248.25L295.55 248.98L298.21 249.64L300.93 250.22L303.72 250.72Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M285.81 254.1L283.5 253.03L281.32 251.9L279.28 250.7L277.4 249.44L275.66 248.13L274.09 246.77L272.69 245.36L271.46 243.91L270.4 242.43L269.52 240.92L269.52 232.46L270.4 233.97L271.46 235.45L272.69 236.9L274.09 238.3L275.66 239.67L277.4 240.98L279.28 242.23L281.32 243.43L283.5 244.57L285.81 245.63Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M269.52 240.92L268.81 239.32L268.29 237.7L267.98 236.07L267.88 234.43L267.88 225.97L267.98 227.61L268.29 229.24L268.81 230.86L269.52 232.46Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M356.85 244.39L355.38 245.1L353.85 245.78L352.27 246.43L350.63 247.05L348.96 247.63L347.23 248.19L345.47 248.7L343.66 249.19L341.82 249.63L339.94 250.04L338.04 250.42L336.11 250.75L334.15 251.05L332.17 251.31L330.17 251.53L328.15 251.71L326.13 251.85L324.09 251.95L322.05 252.01L320 252.03L317.95 252.01L315.91 251.95L313.87 251.85L311.85 251.71L309.83 251.53L307.83 251.31L305.85 251.05L303.89 250.75L301.96 250.42L300.06 250.04L298.18 249.63L296.34 249.19L294.53 248.7L292.77 248.19L291.04 247.63L289.37 247.05L287.73 246.43L286.15 245.78L284.62 245.1L283.15 244.39L281.73 243.66L280.37 242.89L279.07 242.1L277.84 241.28L276.67 240.44L275.56 239.58L274.53 238.7L273.56 237.8L272.67 236.88L271.85 235.94L271.1 234.99L270.43 234.02L269.84 233.04L269.32 232.05L268.88 231.05L268.52 230.04L268.24 229.03L268.04 228.01L267.92 226.99L267.88 225.97L267.92 224.94L268.04 223.92L268.24 222.9L268.52 221.89L268.88 220.88L269.32 219.88L269.84 218.89L270.43 217.91L271.1 216.95L271.85 215.99L272.67 215.06L273.56 214.14L274.53 213.23L275.56 212.35L276.67 211.49L277.84 210.65L279.07 209.83L280.37 209.04L281.73 208.28L283.15 207.54L284.62 206.83L286.15 206.15L287.73 205.5L289.37 204.88L291.04 204.3L292.77 203.75L294.53 203.23L296.34 202.75L298.18 202.3L300.06 201.89L301.96 201.52L303.89 201.18L305.85 200.89L307.83 200.63L309.83 200.41L311.85 200.23L313.87 200.09L315.91 199.99L317.95 199.93L320 199.91L322.05 199.93L324.09 199.99L326.13 200.09L328.15 200.23L330.17 200.41L332.17 200.63L334.15 200.89L336.11 201.18L338.04 201.52L339.94 201.89L341.82 202.3L343.66 202.75L345.47 203.23L347.23 203.75L348.96 204.3L350.63 204.88L352.27 205.5L353.85 206.15L355.38 206.83L356.85 207.54L358.27 208.28L359.63 209.04L360.93 209.83L362.16 210.65L363.33 211.49L364.44 212.35L365.47 213.23L366.44 214.14L367.33 215.06L368.15 215.99L368.9 216.95L369.57 217.91L370.16 218.89L370.68 219.88L371.12 220.88L371.48 221.89L371.76 222.9L371.96 223.92L372.08 224.94L372.12 225.97L372.08 226.99L371.96 228.01L371.76 229.03L371.48 230.04L371.12 231.05L370.68 232.05L370.16 233.04L369.57 234.02L368.9 234.99L368.15 235.94L367.33 236.88L366.44 237.8L365.47 238.7L364.44 239.58L363.33 240.44L362.16 241.28L360.93 242.1L359.63 242.89L358.27 243.66Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M372.12 225.97L372.1 226.71L372.03 227.45L371.93 228.2L371.78 228.94L371.59 229.68L371.36 230.41L371.08 231.14L370.76 231.87L370.41 232.59L370.01 233.31L369.57 234.02L369.09 234.72L368.57 235.42L368.01 236.11L367.41 236.79L366.77 237.46L366.1 238.13L365.38 238.78L364.63 239.42L363.84 240.06L363.02 240.68L362.16 241.28L361.27 241.88L360.35 242.46L359.39 243.03L358.4 243.59L357.38 244.13L356.32 244.65L355.24 245.17L354.13 245.66L352.99 246.14L351.83 246.6L350.63 247.05L349.42 247.48L348.18 247.89L346.91 248.28L345.63 248.66L344.32 249.01L343 249.35L341.65 249.67L340.29 249.97L338.91 250.25L337.51 250.51L336.11 250.75L334.68 250.97L333.25 251.17L331.8 251.35L330.35 251.51L328.89 251.64L327.42 251.76L325.94 251.86L324.46 251.93L322.98 251.98L321.49 252.02L320 252.03L318.51 252.02L317.02 251.98L315.54 251.93L314.06 251.86L312.58 251.76L311.11 251.64L309.65 251.51L308.2 251.35L306.75 251.17L305.32 250.97L303.89 250.75L302.49 250.51L301.09 250.25L299.71 249.97L298.35 249.67L297 249.35L295.68 249.01L294.37 248.66L293.09 248.28L291.82 247.89L290.58 247.48L289.37 247.05L288.17 246.6L287.01 246.14L285.87 245.66L284.76 245.17L283.68 244.65L282.62 244.13L281.6 243.59L280.61 243.03L279.65 242.46L278.73 241.88L277.84 241.28L276.98 240.68L276.16 240.06L275.37 239.42L274.62 238.78L273.9 238.13L273.23 237.46L272.59 236.79L271.99 236.11L271.43 235.42L270.91 234.72L270.43 234.02L269.99 233.31L269.59 232.59L269.24 231.87L268.92 231.14L268.64 230.41L268.41 229.68L268.22 228.94L268.07 228.2L267.97 227.45L267.9 226.71L267.88 225.97\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"inner\" d=\"M372.11 233.79L372.08 234.53L372 235.28L371.87 236.02L371.71 236.76L371.5 237.5L371.25 238.24L370.95 238.97L370.62 239.69L370.24 240.42L369.83 241.13L369.37 241.84L368.87 242.54L368.33 243.24L367.76 243.93L367.14 244.61L366.48 245.27L365.79 245.93L365.06 246.58L364.29 247.22L363.49 247.85L362.65 248.47L361.77 249.07L360.87 249.66L359.92 250.24L358.95 250.81L357.94 251.36L356.9 251.89L355.84 252.41L354.74 252.92L353.61 253.4L352.46 253.88L351.28 254.33L350.08 254.77L348.85 255.19L347.59 255.6L346.32 255.98L345.02 256.35L343.7 256.7L342.36 257.03L341.01 257.34L339.63 257.63L338.24 257.9L336.84 258.15L335.42 258.38L333.99 258.59L332.55 258.78L331.1 258.95L329.64 259.1L328.17 259.23L326.69 259.33L325.21 259.42L323.72 259.48L322.24 259.52L320.75 259.55L319.25 259.55L317.76 259.52L316.28 259.48L314.79 259.42L313.31 259.33L311.83 259.23L310.36 259.1L308.9 258.95L307.45 258.78L306.01 258.59L304.58 258.38L303.16 258.15L301.76 257.9L300.37 257.63L298.99 257.34L297.64 257.03L296.3 256.7L294.98 256.35L293.68 255.98L292.41 255.6L291.15 255.19L289.92 254.77L288.72 254.33L287.54 253.88L286.39 253.4L285.26 252.92L284.16 252.41L283.1 251.89L282.06 251.36L281.05 250.81L280.08 250.24L279.13 249.66L278.23 249.07L277.35 248.47L276.51 247.85L275.71 247.22L274.94 246.58L274.21 245.93L273.52 245.27L272.86 244.61L272.24 243.93L271.67 243.24L271.13 242.54L270.63 241.84L270.17 241.13L269.76 240.42L269.38 239.69L269.05 238.97L268.75 238.24L268.5 237.5L268.29 236.76L268.13 236.02L268 235.28L267.92 234.53L267.89 233.79M372.11 227.21L372.08 227.95L372 228.7L371.87 229.44L371.71 230.18L371.5 230.92L371.25 231.65L370.95 232.39L370.62 233.11L370.24 233.83L369.83 234.55L369.37 235.26L368.87 235.96L368.33 236.66L367.76 237.34L367.14 238.02L366.48 238.69L365.79 239.35L365.06 240L364.29 240.64L363.49 241.27L362.65 241.89L361.77 242.49L360.87 243.08L359.92 243.66L358.95 244.22L357.94 244.77L356.9 245.31L355.84 245.83L354.74 246.33L353.61 246.82L352.46 247.29L351.28 247.75L350.08 248.19L348.85 248.61L347.59 249.02L346.32 249.4L345.02 249.77L343.7 250.12L342.36 250.45L341.01 250.76L339.63 251.05L338.24 251.32L336.84 251.57L335.42 251.8L333.99 252.01L332.55 252.2L331.1 252.37L329.64 252.52L328.17 252.64L326.69 252.75L325.21 252.84L323.72 252.9L322.24 252.94L320.75 252.96L319.25 252.96L317.76 252.94L316.28 252.9L314.79 252.84L313.31 252.75L311.83 252.64L310.36 252.52L308.9 252.37L307.45 252.2L306.01 252.01L304.58 251.8L303.16 251.57L301.76 251.32L300.37 251.05L298.99 250.76L297.64 250.45L296.3 250.12L294.98 249.77L293.68 249.4L292.41 249.02L291.15 248.61L289.92 248.19L288.72 247.75L287.54 247.29L286.39 246.82L285.26 246.33L284.16 245.83L283.1 245.31L282.06 244.77L281.05 244.22L280.08 243.66L279.13 243.08L278.23 242.49L277.35 241.89L276.51 241.27L275.71 240.64L274.94 240L274.21 239.35L273.52 238.69L272.86 238.02L272.24 237.34L271.67 236.66L271.13 235.96L270.63 235.26L270.17 234.55L269.76 233.83L269.38 233.11L269.05 232.39L268.75 231.65L268.5 230.92L268.29 230.18L268.13 229.44L268 228.7L267.92 227.95L267.89 227.21\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r0\" opacity=\"1\" d=\"M356.85 251.92L356.85 245.33M354.19 253.16L354.19 246.57M351.37 254.3L351.37 247.72M348.39 255.34L348.39 248.76M345.27 256.28L345.27 249.7M342.03 257.11L342.03 250.52M338.68 257.82L338.68 251.24M335.24 258.41L335.24 251.83M331.72 258.88L331.72 252.3M328.15 259.23L328.15 252.65M324.54 259.45L324.54 252.87M320.91 259.54L320.91 252.96M317.27 259.51L317.27 252.93M313.65 259.35L313.65 252.77M310.06 259.07L310.06 252.49M306.51 258.66L306.51 252.08M303.03 258.13L303.03 251.55M299.64 257.48L299.64 250.89M296.34 256.71L296.34 250.13M293.16 255.83L293.16 249.24M290.11 254.84L290.11 248.25M287.2 253.74L287.2 247.16M284.46 252.55L284.46 245.97M281.88 251.26L281.88 244.68M279.5 249.89L279.5 243.31M361.62 249.17L361.62 242.59M359.33 250.59L359.33 244\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r1\" opacity=\"0.969\" d=\"M277.31 248.44L277.31 241.85\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r2\" opacity=\"0.938\" d=\"M363.71 247.68L363.71 241.1\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r3\" opacity=\"0.875\" d=\"M275.33 246.91L275.33 240.33\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r4\" opacity=\"0.813\" d=\"M365.58 246.12L365.58 239.54\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r5\" opacity=\"0.75\" d=\"M273.56 245.32L273.56 238.74\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r6\" opacity=\"0.656\" d=\"M367.24 244.5L367.24 237.92\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r7\" opacity=\"0.563\" d=\"M272.02 243.67L272.02 237.09\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r8\" opacity=\"0.5\" d=\"M368.66 242.83L368.66 236.25\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r9\" opacity=\"0.406\" d=\"M270.72 241.97L270.72 235.39\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r10\" opacity=\"0.313\" d=\"M369.84 241.11L369.84 234.53\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r11\" opacity=\"0.219\" d=\"M269.66 240.23L269.66 233.65\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r12\" opacity=\"0.156\" d=\"M370.78 239.35L370.78 232.77\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r13\" opacity=\"0.094\" d=\"M268.84 238.46L268.84 231.88\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r14\" opacity=\"0.031\" d=\"M371.48 237.57L371.48 230.98\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r15\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r16\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r17\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r18\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r19\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r20\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r21\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r22\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r23\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r24\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"r25\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M372.12 234.43L372.1 235.17L372.03 235.92L371.93 236.66L371.78 237.4L371.59 238.14L371.36 238.87L371.08 239.61L370.76 240.33L370.41 241.05L370.01 241.77L369.57 242.48L369.09 243.19L368.57 243.88L368.01 244.57L367.41 245.26L366.77 245.93L366.1 246.59L365.38 247.24L364.63 247.89L363.84 248.52L363.02 249.14L362.16 249.75L361.27 250.34L360.35 250.93L359.39 251.5L358.4 252.05L357.38 252.59L356.32 253.12L355.24 253.63L354.13 254.12L352.99 254.6L351.83 255.07L350.63 255.51L349.42 255.94L348.18 256.35L346.91 256.75L345.63 257.12L344.32 257.48L343 257.82L341.65 258.13L340.29 258.43L338.91 258.71L337.51 258.97L336.11 259.21L334.68 259.43L333.25 259.63L331.8 259.81L330.35 259.97L328.89 260.11L327.42 260.22L325.94 260.32L324.46 260.39L322.98 260.45L321.49 260.48L320 260.49L318.51 260.48L317.02 260.45L315.54 260.39L314.06 260.32L312.58 260.22L311.11 260.11L309.65 259.97L308.2 259.81L306.75 259.63L305.32 259.43L303.89 259.21L302.49 258.97L301.09 258.71L299.71 258.43L298.35 258.13L297 257.82L295.68 257.48L294.37 257.12L293.09 256.75L291.82 256.35L290.58 255.94L289.37 255.51L288.17 255.07L287.01 254.6L285.87 254.12L284.76 253.63L283.68 253.12L282.62 252.59L281.6 252.05L280.61 251.5L279.65 250.93L278.73 250.34L277.84 249.75L276.98 249.14L276.16 248.52L275.37 247.89L274.62 247.24L273.9 246.59L273.23 245.93L272.59 245.26L271.99 244.57L271.43 243.88L270.91 243.19L270.43 242.48L269.99 241.77L269.59 241.05L269.24 240.33L268.92 239.61L268.64 238.87L268.41 238.14L268.22 237.4L268.07 236.66L267.97 235.92L267.9 235.17L267.88 234.43L267.88 225.97L267.9 225.22L267.97 224.48L268.07 223.74L268.22 223L268.41 222.26L268.64 221.52L268.92 220.79L269.24 220.06L269.59 219.34L269.99 218.63L270.43 217.91L270.91 217.21L271.43 216.51L271.99 215.82L272.59 215.14L273.23 214.47L273.9 213.81L274.62 213.15L275.37 212.51L276.16 211.88L276.98 211.26L277.84 210.65L278.73 210.05L279.65 209.47L280.61 208.9L281.6 208.35L282.62 207.81L283.68 207.28L284.76 206.77L285.87 206.27L287.01 205.79L288.17 205.33L289.37 204.88L290.58 204.46L291.82 204.04L293.09 203.65L294.37 203.28L295.68 202.92L297 202.58L298.35 202.26L299.71 201.96L301.09 201.68L302.49 201.42L303.89 201.18L305.32 200.96L306.75 200.76L308.2 200.59L309.65 200.43L311.11 200.29L312.58 200.17L314.06 200.08L315.54 200L317.02 199.95L318.51 199.92L320 199.91L321.49 199.92L322.98 199.95L324.46 200L325.94 200.08L327.42 200.17L328.89 200.29L330.35 200.43L331.8 200.59L333.25 200.76L334.68 200.96L336.11 201.18L337.51 201.42L338.91 201.68L340.29 201.96L341.65 202.26L343 202.58L344.32 202.92L345.63 203.28L346.91 203.65L348.18 204.04L349.42 204.46L350.63 204.88L351.83 205.33L352.99 205.79L354.13 206.27L355.24 206.77L356.32 207.28L357.38 207.81L358.4 208.35L359.39 208.9L360.35 209.47L361.27 210.05L362.16 210.65L363.02 211.26L363.84 211.88L364.63 212.51L365.38 213.15L366.1 213.81L366.77 214.47L367.41 215.14L368.01 215.82L368.57 216.51L369.09 217.21L369.57 217.91L370.01 218.63L370.41 219.34L370.76 220.06L371.08 220.79L371.36 221.52L371.59 222.26L371.78 223L371.93 223.74L372.03 224.48L372.1 225.22L372.12 225.97Z\"/></g><g class=\"iso-solid\" data-p=\"29\" data-name=\"timer.ring\" data-mat=\"steel\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M378.63 224.09L378.61 224.84L378.56 225.58L378.46 226.33L378.33 227.08L378.16 227.82L377.95 228.56L377.7 229.3L377.41 230.04L377.09 230.77L376.73 231.49L376.33 232.22L375.9 232.93L375.43 233.64L374.92 234.35L374.38 235.05L373.8 235.74L373.19 236.42L372.55 237.09L371.86 237.76L371.15 238.42L370.4 239.07L369.62 239.71L368.8 240.33L367.96 240.95L367.08 241.56L366.17 242.16L365.23 242.74L364.27 243.31L363.27 243.87L362.25 244.42L361.19 244.95L360.12 245.47L359.01 245.97L357.88 246.46L356.72 246.94L355.54 247.4L354.34 247.85L353.12 248.28L351.87 248.69L350.6 249.09L349.32 249.48L348.01 249.84L346.69 250.19L345.34 250.52L343.98 250.84L342.61 251.14L341.22 251.42L339.82 251.68L338.4 251.92L336.98 252.15L335.54 252.35L334.09 252.54L332.63 252.71L331.16 252.87L329.69 253L328.21 253.11L326.72 253.21L325.23 253.29L323.74 253.34L322.25 253.38L320.75 253.4L319.25 253.4L317.75 253.38L316.26 253.34L314.77 253.29L313.28 253.21L311.79 253.11L310.31 253L308.84 252.87L307.37 252.71L305.91 252.54L304.46 252.35L303.02 252.15L301.6 251.92L300.18 251.68L298.78 251.42L297.39 251.14L296.02 250.84L294.66 250.52L293.31 250.19L291.99 249.84L290.68 249.48L289.4 249.09L288.13 248.69L286.88 248.28L285.66 247.85L284.46 247.4L283.28 246.94L282.12 246.46L280.99 245.97L279.88 245.47L278.81 244.95L277.75 244.42L276.73 243.87L275.73 243.31L274.77 242.74L273.83 242.16L272.92 241.56L272.04 240.95L271.2 240.33L270.38 239.71L269.6 239.07L268.85 238.42L268.14 237.76L267.45 237.09L266.81 236.42L266.2 235.74L265.62 235.05L265.08 234.35L264.57 233.64L264.1 232.93L263.67 232.22L263.27 231.49L262.91 230.77L262.59 230.04L262.3 229.3L262.05 228.56L261.84 227.82L261.67 227.08L261.54 226.33L261.44 225.58L261.39 224.84L261.37 224.09L261.37 212.8L261.39 212.05L261.44 211.31L261.54 210.56L261.67 209.81L261.84 209.07L262.05 208.33L262.3 207.59L262.59 206.85L262.91 206.12L263.27 205.4L263.67 204.67L264.1 203.96L264.57 203.25L265.08 202.54L265.62 201.84L266.2 201.15L266.81 200.47L267.45 199.79L268.14 199.13L268.85 198.47L269.6 197.82L270.38 197.18L271.2 196.55L272.04 195.94L272.92 195.33L273.83 194.73L274.77 194.15L275.73 193.58L276.73 193.02L277.75 192.47L278.81 191.94L279.88 191.42L280.99 190.92L282.12 190.42L283.28 189.95L284.46 189.49L285.66 189.04L286.88 188.61L288.13 188.2L289.4 187.8L290.68 187.41L291.99 187.05L293.31 186.7L294.66 186.37L296.02 186.05L297.39 185.75L298.78 185.47L300.18 185.21L301.6 184.97L303.02 184.74L304.46 184.53L305.91 184.34L307.37 184.17L308.84 184.02L310.31 183.89L311.79 183.77L313.28 183.68L314.77 183.6L316.26 183.55L317.75 183.51L319.25 183.49L320.75 183.49L322.25 183.51L323.74 183.55L325.23 183.6L326.72 183.68L328.21 183.77L329.69 183.89L331.16 184.02L332.63 184.17L334.09 184.34L335.54 184.53L336.98 184.74L338.4 184.97L339.82 185.21L341.22 185.47L342.61 185.75L343.98 186.05L345.34 186.37L346.69 186.7L348.01 187.05L349.32 187.41L350.6 187.8L351.87 188.2L353.12 188.61L354.34 189.04L355.54 189.49L356.72 189.95L357.88 190.42L359.01 190.92L360.12 191.42L361.19 191.94L362.25 192.47L363.27 193.02L364.27 193.58L365.23 194.15L366.17 194.73L367.08 195.33L367.96 195.94L368.8 196.55L369.62 197.18L370.4 197.82L371.15 198.47L371.86 199.13L372.55 199.79L373.19 200.47L373.8 201.15L374.38 201.84L374.92 202.54L375.43 203.25L375.9 203.96L376.33 204.67L376.73 205.4L377.09 206.12L377.41 206.85L377.7 207.59L377.95 208.33L378.16 209.07L378.33 209.81L378.46 210.56L378.56 211.31L378.61 212.05L378.63 212.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M378.63 224.09L378.51 226L378.13 227.91L377.51 229.81L376.64 231.67L375.52 233.51L374.17 235.31L372.59 237.05L370.78 238.74L368.75 240.37L366.52 241.93L364.08 243.42L361.46 244.82L358.66 246.13L355.69 247.34L352.57 248.46L349.32 249.48L345.93 250.38L342.44 251.17L338.85 251.85L335.18 252.4L331.44 252.84L327.65 253.15L323.83 253.34L320 253.4L320 242.12L323.83 242.06L327.65 241.87L331.44 241.56L335.18 241.12L338.85 240.56L342.44 239.89L345.93 239.1L349.32 238.19L352.57 237.18L355.69 236.06L358.66 234.84L361.46 233.53L364.08 232.13L366.52 230.65L368.75 229.09L370.78 227.46L372.59 225.77L374.17 224.02L375.52 222.23L376.64 220.39L377.51 218.52L378.13 216.63L378.51 214.72L378.63 212.8Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M320 253.4L316.28 253.34L312.57 253.17L308.89 252.87L305.26 252.46L301.68 251.94L301.68 240.65L305.26 241.18L308.89 241.59L312.57 241.88L316.28 242.06L320 242.12Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M301.68 251.94L298.55 251.37L295.48 250.72L292.5 249.98L289.6 249.15L286.8 248.25L284.11 247.27L281.53 246.21L281.53 234.93L284.11 235.98L286.8 236.97L289.6 237.87L292.5 238.69L295.48 239.43L298.55 240.09L301.68 240.65Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M281.53 246.21L278.93 245.01L276.49 243.74L274.19 242.39L272.07 240.97L270.12 239.5L268.35 237.96L266.77 236.38L265.39 234.75L264.2 233.09L263.22 231.39L263.22 220.11L264.2 221.8L265.39 223.47L266.77 225.1L268.35 226.68L270.12 228.21L272.07 229.69L274.19 231.1L276.49 232.45L278.93 233.73L281.53 234.93Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M263.22 231.39L262.41 229.59L261.83 227.77L261.48 225.93L261.37 224.09L261.37 212.8L261.48 214.65L261.83 216.48L262.41 218.31L263.22 220.11Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M361.46 233.53L359.8 234.33L358.08 235.09L356.3 235.83L354.46 236.52L352.57 237.18L350.64 237.8L348.65 238.38L346.62 238.92L344.55 239.43L342.44 239.89L340.29 240.31L338.12 240.68L335.92 241.02L333.69 241.31L331.44 241.56L329.17 241.76L326.89 241.92L324.6 242.03L322.3 242.1L320 242.12L317.7 242.1L315.4 242.03L313.11 241.92L310.83 241.76L308.56 241.56L306.31 241.31L304.08 241.02L301.88 240.68L299.71 240.31L297.56 239.89L295.45 239.43L293.38 238.92L291.35 238.38L289.36 237.8L287.43 237.18L285.54 236.52L283.7 235.83L281.92 235.09L280.2 234.33L278.54 233.53L276.94 232.7L275.41 231.84L273.95 230.95L272.56 230.03L271.25 229.09L270.01 228.12L268.84 227.13L267.76 226.11L266.75 225.08L265.83 224.02L264.99 222.95L264.24 221.86L263.57 220.76L262.99 219.65L262.49 218.52L262.09 217.39L261.77 216.25L261.55 215.1L261.41 213.95L261.37 212.8L261.41 211.65L261.55 210.5L261.77 209.36L262.09 208.22L262.49 207.08L262.99 205.96L263.57 204.84L264.24 203.74L264.99 202.66L265.83 201.58L266.75 200.53L267.76 199.49L268.84 198.48L270.01 197.48L271.25 196.51L272.56 195.57L273.95 194.65L275.41 193.76L276.94 192.9L278.54 192.07L280.2 191.27L281.92 190.51L283.7 189.78L285.54 189.08L287.43 188.43L289.36 187.81L291.35 187.22L293.38 186.68L295.45 186.18L297.56 185.72L299.71 185.3L301.88 184.92L304.08 184.59L306.31 184.3L308.56 184.05L310.83 183.85L313.11 183.69L315.4 183.58L317.7 183.51L320 183.49L322.3 183.51L324.6 183.58L326.89 183.69L329.17 183.85L331.44 184.05L333.69 184.3L335.92 184.59L338.12 184.92L340.29 185.3L342.44 185.72L344.55 186.18L346.62 186.68L348.65 187.22L350.64 187.81L352.57 188.43L354.46 189.08L356.3 189.78L358.08 190.51L359.8 191.27L361.46 192.07L363.06 192.9L364.59 193.76L366.05 194.65L367.44 195.57L368.75 196.51L369.99 197.48L371.16 198.48L372.24 199.49L373.25 200.53L374.17 201.58L375.01 202.66L375.76 203.74L376.43 204.84L377.01 205.96L377.51 207.08L377.91 208.22L378.23 209.36L378.45 210.5L378.59 211.65L378.63 212.8L378.59 213.95L378.45 215.1L378.23 216.25L377.91 217.39L377.51 218.52L377.01 219.65L376.43 220.76L375.76 221.86L375.01 222.95L374.17 224.02L373.25 225.08L372.24 226.11L371.16 227.13L369.99 228.12L368.75 229.09L367.44 230.03L366.05 230.95L364.59 231.84L363.06 232.7Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M378.63 212.8L378.61 213.55L378.56 214.3L378.46 215.05L378.33 215.79L378.16 216.54L377.95 217.28L377.7 218.02L377.41 218.75L377.09 219.48L376.73 220.21L376.33 220.93L375.9 221.65L375.43 222.36L374.92 223.06L374.38 223.76L373.8 224.45L373.19 225.14L372.55 225.81L371.86 226.48L371.15 227.14L370.4 227.78L369.62 228.42L368.8 229.05L367.96 229.67L367.08 230.28L366.17 230.87L365.23 231.45L364.27 232.03L363.27 232.59L362.25 233.13L361.19 233.66L360.12 234.18L359.01 234.69L357.88 235.18L356.72 235.66L355.54 236.12L354.34 236.56L353.12 236.99L351.87 237.41L350.6 237.81L349.32 238.19L348.01 238.56L346.69 238.91L345.34 239.24L343.98 239.55L342.61 239.85L341.22 240.13L339.82 240.39L338.4 240.64L336.98 240.86L335.54 241.07L334.09 241.26L332.63 241.43L331.16 241.58L329.69 241.72L328.21 241.83L326.72 241.93L325.23 242L323.74 242.06L322.25 242.1L320.75 242.12L319.25 242.12L317.75 242.1L316.26 242.06L314.77 242L313.28 241.93L311.79 241.83L310.31 241.72L308.84 241.58L307.37 241.43L305.91 241.26L304.46 241.07L303.02 240.86L301.6 240.64L300.18 240.39L298.78 240.13L297.39 239.85L296.02 239.55L294.66 239.24L293.31 238.91L291.99 238.56L290.68 238.19L289.4 237.81L288.13 237.41L286.88 236.99L285.66 236.56L284.46 236.12L283.28 235.66L282.12 235.18L280.99 234.69L279.88 234.18L278.81 233.66L277.75 233.13L276.73 232.59L275.73 232.03L274.77 231.45L273.83 230.87L272.92 230.28L272.04 229.67L271.2 229.05L270.38 228.42L269.6 227.78L268.85 227.14L268.14 226.48L267.45 225.81L266.81 225.14L266.2 224.45L265.62 223.76L265.08 223.06L264.57 222.36L264.1 221.65L263.67 220.93L263.27 220.21L262.91 219.48L262.59 218.75L262.3 218.02L262.05 217.28L261.84 216.54L261.67 215.79L261.54 215.05L261.44 214.3L261.39 213.55L261.37 212.8\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"inner\" d=\"M378.63 218.74L378.6 219.49L378.52 220.23L378.41 220.97L378.27 221.71L378.08 222.45L377.86 223.19L377.6 223.92L377.31 224.65L376.97 225.37L376.6 226.09L376.2 226.81L375.75 227.52L375.27 228.22L374.76 228.92L374.21 229.61L373.63 230.3L373.01 230.97L372.36 231.64L371.67 232.3L370.95 232.95L370.2 233.6L369.41 234.23L368.59 234.85L367.75 235.46L366.87 236.06L365.96 236.65L365.02 237.23L364.05 237.79L363.06 238.34L362.03 238.88L360.98 239.41L359.9 239.92L358.8 240.42L357.67 240.91L356.52 241.38L355.35 241.83L354.15 242.28L352.93 242.7L351.69 243.11L350.42 243.51L349.14 243.88L347.84 244.24L346.52 244.59L345.19 244.92L343.84 245.23L342.47 245.52L341.09 245.8L339.7 246.06L338.29 246.3L336.87 246.52L335.44 246.73L334 246.91L332.55 247.08L331.09 247.23L329.63 247.36L328.16 247.48L326.68 247.57L325.2 247.65L323.72 247.7L322.23 247.74L320.74 247.76L319.26 247.76L317.77 247.74L316.28 247.7L314.8 247.65L313.32 247.57L311.84 247.48L310.37 247.36L308.91 247.23L307.45 247.08L306 246.91L304.56 246.73L303.13 246.52L301.71 246.3L300.3 246.06L298.91 245.8L297.53 245.52L296.16 245.23L294.81 244.92L293.48 244.59L292.16 244.24L290.86 243.88L289.58 243.51L288.31 243.11L287.07 242.7L285.85 242.28L284.65 241.83L283.48 241.38L282.33 240.91L281.2 240.42L280.1 239.92L279.02 239.41L277.97 238.88L276.94 238.34L275.95 237.79L274.98 237.23L274.04 236.65L273.13 236.06L272.25 235.46L271.41 234.85L270.59 234.23L269.8 233.6L269.05 232.95L268.33 232.3L267.64 231.64L266.99 230.97L266.37 230.3L265.79 229.61L265.24 228.92L264.73 228.22L264.25 227.52L263.8 226.81L263.4 226.09L263.03 225.37L262.69 224.65L262.4 223.92L262.14 223.19L261.92 222.45L261.73 221.71L261.59 220.97L261.48 220.23L261.4 219.49L261.37 218.74\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M378.63 224.09L378.61 224.84L378.56 225.58L378.46 226.33L378.33 227.08L378.16 227.82L377.95 228.56L377.7 229.3L377.41 230.04L377.09 230.77L376.73 231.49L376.33 232.22L375.9 232.93L375.43 233.64L374.92 234.35L374.38 235.05L373.8 235.74L373.19 236.42L372.55 237.09L371.86 237.76L371.15 238.42L370.4 239.07L369.62 239.71L368.8 240.33L367.96 240.95L367.08 241.56L366.17 242.16L365.23 242.74L364.27 243.31L363.27 243.87L362.25 244.42L361.19 244.95L360.12 245.47L359.01 245.97L357.88 246.46L356.72 246.94L355.54 247.4L354.34 247.85L353.12 248.28L351.87 248.69L350.6 249.09L349.32 249.48L348.01 249.84L346.69 250.19L345.34 250.52L343.98 250.84L342.61 251.14L341.22 251.42L339.82 251.68L338.4 251.92L336.98 252.15L335.54 252.35L334.09 252.54L332.63 252.71L331.16 252.87L329.69 253L328.21 253.11L326.72 253.21L325.23 253.29L323.74 253.34L322.25 253.38L320.75 253.4L319.25 253.4L317.75 253.38L316.26 253.34L314.77 253.29L313.28 253.21L311.79 253.11L310.31 253L308.84 252.87L307.37 252.71L305.91 252.54L304.46 252.35L303.02 252.15L301.6 251.92L300.18 251.68L298.78 251.42L297.39 251.14L296.02 250.84L294.66 250.52L293.31 250.19L291.99 249.84L290.68 249.48L289.4 249.09L288.13 248.69L286.88 248.28L285.66 247.85L284.46 247.4L283.28 246.94L282.12 246.46L280.99 245.97L279.88 245.47L278.81 244.95L277.75 244.42L276.73 243.87L275.73 243.31L274.77 242.74L273.83 242.16L272.92 241.56L272.04 240.95L271.2 240.33L270.38 239.71L269.6 239.07L268.85 238.42L268.14 237.76L267.45 237.09L266.81 236.42L266.2 235.74L265.62 235.05L265.08 234.35L264.57 233.64L264.1 232.93L263.67 232.22L263.27 231.49L262.91 230.77L262.59 230.04L262.3 229.3L262.05 228.56L261.84 227.82L261.67 227.08L261.54 226.33L261.44 225.58L261.39 224.84L261.37 224.09L261.37 212.8L261.39 212.05L261.44 211.31L261.54 210.56L261.67 209.81L261.84 209.07L262.05 208.33L262.3 207.59L262.59 206.85L262.91 206.12L263.27 205.4L263.67 204.67L264.1 203.96L264.57 203.25L265.08 202.54L265.62 201.84L266.2 201.15L266.81 200.47L267.45 199.79L268.14 199.13L268.85 198.47L269.6 197.82L270.38 197.18L271.2 196.55L272.04 195.94L272.92 195.33L273.83 194.73L274.77 194.15L275.73 193.58L276.73 193.02L277.75 192.47L278.81 191.94L279.88 191.42L280.99 190.92L282.12 190.42L283.28 189.95L284.46 189.49L285.66 189.04L286.88 188.61L288.13 188.2L289.4 187.8L290.68 187.41L291.99 187.05L293.31 186.7L294.66 186.37L296.02 186.05L297.39 185.75L298.78 185.47L300.18 185.21L301.6 184.97L303.02 184.74L304.46 184.53L305.91 184.34L307.37 184.17L308.84 184.02L310.31 183.89L311.79 183.77L313.28 183.68L314.77 183.6L316.26 183.55L317.75 183.51L319.25 183.49L320.75 183.49L322.25 183.51L323.74 183.55L325.23 183.6L326.72 183.68L328.21 183.77L329.69 183.89L331.16 184.02L332.63 184.17L334.09 184.34L335.54 184.53L336.98 184.74L338.4 184.97L339.82 185.21L341.22 185.47L342.61 185.75L343.98 186.05L345.34 186.37L346.69 186.7L348.01 187.05L349.32 187.41L350.6 187.8L351.87 188.2L353.12 188.61L354.34 189.04L355.54 189.49L356.72 189.95L357.88 190.42L359.01 190.92L360.12 191.42L361.19 191.94L362.25 192.47L363.27 193.02L364.27 193.58L365.23 194.15L366.17 194.73L367.08 195.33L367.96 195.94L368.8 196.55L369.62 197.18L370.4 197.82L371.15 198.47L371.86 199.13L372.55 199.79L373.19 200.47L373.8 201.15L374.38 201.84L374.92 202.54L375.43 203.25L375.9 203.96L376.33 204.67L376.73 205.4L377.09 206.12L377.41 206.85L377.7 207.59L377.95 208.33L378.16 209.07L378.33 209.81L378.46 210.56L378.56 211.31L378.61 212.05L378.63 212.8Z\"/><g class=\"iso-dots\" data-tone=\"lo\"><circle data-r=\"c0\" cx=\"356.85\" cy=\"231.23\" r=\"1.2\" fill-opacity=\"1\"/><circle data-r=\"c1\" cx=\"346.06\" cy=\"235.37\" r=\"1.2\" fill-opacity=\"1\"/><circle data-r=\"c2\" cx=\"333.49\" cy=\"237.97\" r=\"1.2\" fill-opacity=\"1\"/><circle data-r=\"c3\" cx=\"320\" cy=\"238.86\" r=\"1.2\" fill-opacity=\"1\"/><circle data-r=\"c4\" cx=\"306.51\" cy=\"237.97\" r=\"1.2\" fill-opacity=\"1\"/><circle data-r=\"c5\" cx=\"293.94\" cy=\"235.37\" r=\"1.2\" fill-opacity=\"1\"/><circle data-r=\"c6\" cx=\"283.15\" cy=\"231.23\" r=\"1.2\" fill-opacity=\"1\"/><circle data-r=\"c7\" cx=\"274.86\" cy=\"225.83\" r=\"1.2\" fill-opacity=\"1\"/><circle data-r=\"c8\" cx=\"269.66\" cy=\"219.55\" r=\"1.2\" fill-opacity=\"1\"/><circle data-r=\"c9\" cx=\"267.88\" cy=\"212.8\" r=\"1.2\" fill-opacity=\"1\"/><circle data-r=\"c10\" cx=\"269.66\" cy=\"206.06\" r=\"1.2\" fill-opacity=\"1\"/><circle data-r=\"c11\" cx=\"274.86\" cy=\"199.77\" r=\"1.2\" fill-opacity=\"1\"/><circle data-r=\"c12\" cx=\"283.15\" cy=\"194.38\" r=\"1.2\" fill-opacity=\"1\"/><circle data-r=\"c13\" cx=\"293.94\" cy=\"190.23\" r=\"1.2\" fill-opacity=\"1\"/><circle data-r=\"c14\" cx=\"306.51\" cy=\"187.63\" r=\"1.2\" fill-opacity=\"1\"/><circle data-r=\"c15\" cx=\"320\" cy=\"186.74\" r=\"1.2\" fill-opacity=\"1\"/><circle data-r=\"c16\" cx=\"333.49\" cy=\"187.63\" r=\"1.2\" fill-opacity=\"1\"/><circle data-r=\"c17\" cx=\"346.06\" cy=\"190.23\" r=\"1.2\" fill-opacity=\"1\"/><circle data-r=\"c18\" cx=\"356.85\" cy=\"194.38\" r=\"1.2\" fill-opacity=\"1\"/><circle data-r=\"c19\" cx=\"365.14\" cy=\"199.77\" r=\"1.2\" fill-opacity=\"1\"/><circle data-r=\"c20\" cx=\"370.34\" cy=\"206.06\" r=\"1.2\" fill-opacity=\"1\"/><circle data-r=\"c21\" cx=\"372.12\" cy=\"212.8\" r=\"1.2\" fill-opacity=\"1\"/><circle data-r=\"c22\" cx=\"370.34\" cy=\"219.55\" r=\"1.2\" fill-opacity=\"1\"/><circle data-r=\"c23\" cx=\"365.14\" cy=\"225.83\" r=\"1.2\" fill-opacity=\"1\"/></g></g><g class=\"iso-solid\" data-p=\"30\" data-name=\"animation.collar\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M384.2 224.22L346.59 243.02L293.41 243.02L255.8 224.22L255.8 212.93L255.8 186.34L293.41 167.54L346.59 167.54L384.2 186.34L384.2 212.93Z\"/><path class=\"iso-tn\" data-r=\"f0\" style=\"--f:0.5\" d=\"M346.59 231.74L293.41 231.74L293.41 243.02L346.59 243.02Z\"/><path class=\"iso-tn\" data-r=\"f1\" data-b=\"3\" d=\"M293.41 231.74L255.8 212.93L255.8 224.22L293.41 243.02Z\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" d=\"M384.2 212.93L346.59 231.74L346.59 243.02L384.2 224.22Z\"/><path class=\"iso-tn\" data-r=\"f8\" d=\"\"/><path class=\"iso-tn\" data-r=\"f9\" data-b=\"3\" style=\"--f:1\" d=\"M346.59 231.74L293.41 231.74L255.8 212.93L255.8 186.34L293.41 167.54L346.59 167.54L384.2 186.34L384.2 212.93Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M346.59 243.02L346.59 231.74M293.41 243.02L293.41 231.74M384.2 212.93L346.59 231.74L293.41 231.74L255.8 212.93\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v0\" opacity=\"1\" d=\"M345.93 230.94L294.07 230.94M294.07 230.94L257.4 212.6M257.4 212.6L255.8 212.93M382.6 212.6L345.93 230.94M382.6 212.6L384.2 212.93\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v1\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v2\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v3\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v4\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" data-r=\"v5\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M384.2 224.22L346.59 243.02L293.41 243.02L255.8 224.22L255.8 212.93L255.8 186.34L293.41 167.54L346.59 167.54L384.2 186.34L384.2 212.93Z\"/></g><g class=\"iso-solid\" data-p=\"39\" data-name=\"animation.drum\" data-mat=\"steel\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M382.98 199.64L382.96 200.39L382.91 201.14L382.82 201.88L382.69 202.63L382.53 203.38L382.34 204.12L382.1 204.86L381.84 205.6L381.54 206.33L381.2 207.06L380.83 207.79L380.43 208.51L379.99 209.23L379.51 209.94L379.01 210.64L378.47 211.34L377.89 212.03L377.29 212.72L376.65 213.4L375.98 214.07L375.27 214.73L374.54 215.38L373.77 216.03L372.98 216.66L372.15 217.29L371.3 217.9L370.42 218.51L369.5 219.1L368.56 219.69L367.59 220.26L366.6 220.82L365.58 221.37L364.53 221.9L363.46 222.43L362.36 222.94L361.24 223.43L360.1 223.92L358.93 224.39L357.74 224.85L356.53 225.29L355.3 225.71L354.05 226.13L352.78 226.52L351.49 226.91L350.18 227.27L348.86 227.63L347.52 227.96L346.16 228.28L344.79 228.58L343.41 228.87L342.01 229.14L340.6 229.39L339.18 229.63L337.74 229.85L336.3 230.05L334.85 230.24L333.39 230.41L331.92 230.56L330.44 230.69L328.96 230.81L327.48 230.9L325.99 230.98L324.49 231.05L323 231.09L321.5 231.12L320 231.13L318.5 231.12L317 231.09L315.51 231.05L314.01 230.98L312.52 230.9L311.04 230.81L309.56 230.69L308.08 230.56L306.61 230.41L305.15 230.24L303.7 230.05L302.26 229.85L300.82 229.63L299.4 229.39L297.99 229.14L296.59 228.87L295.21 228.58L293.84 228.28L292.48 227.96L291.14 227.63L289.82 227.27L288.51 226.91L287.22 226.52L285.95 226.13L284.7 225.71L283.47 225.29L282.26 224.85L281.07 224.39L279.9 223.92L278.76 223.43L277.64 222.94L276.54 222.43L275.47 221.9L274.42 221.37L273.4 220.82L272.41 220.26L271.44 219.69L270.5 219.1L269.58 218.51L268.7 217.9L267.85 217.29L267.02 216.66L266.23 216.03L265.46 215.38L264.73 214.73L264.02 214.07L263.35 213.4L262.71 212.72L262.11 212.03L261.53 211.34L260.99 210.64L260.49 209.94L260.01 209.23L259.57 208.51L259.17 207.79L258.8 207.06L258.46 206.33L258.16 205.6L257.9 204.86L257.66 204.12L257.47 203.38L257.31 202.63L257.18 201.88L257.09 201.14L257.04 200.39L257.02 199.64L257.02 152.62L257.04 151.87L257.09 151.12L257.18 150.37L257.31 149.63L257.47 148.88L257.66 148.14L257.9 147.4L258.16 146.66L258.46 145.93L258.8 145.2L259.17 144.47L259.57 143.75L260.01 143.03L260.49 142.32L260.99 141.62L261.53 140.92L262.11 140.23L262.71 139.54L263.35 138.86L264.02 138.19L264.73 137.53L265.46 136.88L266.23 136.23L267.02 135.6L267.85 134.97L268.7 134.36L269.58 133.75L270.5 133.16L271.44 132.57L272.41 132L273.4 131.44L274.42 130.89L275.47 130.36L276.54 129.83L277.64 129.32L278.76 128.82L279.9 128.34L281.07 127.87L282.26 127.41L283.47 126.97L284.7 126.54L285.95 126.13L287.22 125.73L288.51 125.35L289.82 124.98L291.14 124.63L292.48 124.3L293.84 123.98L295.21 123.68L296.59 123.39L297.99 123.12L299.4 122.86L300.82 122.63L302.26 122.41L303.7 122.21L305.15 122.02L306.61 121.85L308.08 121.7L309.56 121.57L311.04 121.45L312.52 121.36L314.01 121.28L315.51 121.21L317 121.17L318.5 121.14L320 121.13L321.5 121.14L323 121.17L324.49 121.21L325.99 121.28L327.48 121.36L328.96 121.45L330.44 121.57L331.92 121.7L333.39 121.85L334.85 122.02L336.3 122.21L337.74 122.41L339.18 122.63L340.6 122.86L342.01 123.12L343.41 123.39L344.79 123.68L346.16 123.98L347.52 124.3L348.86 124.63L350.18 124.98L351.49 125.35L352.78 125.73L354.05 126.13L355.3 126.54L356.53 126.97L357.74 127.41L358.93 127.87L360.1 128.34L361.24 128.82L362.36 129.32L363.46 129.83L364.53 130.36L365.58 130.89L366.6 131.44L367.59 132L368.56 132.57L369.5 133.16L370.42 133.75L371.3 134.36L372.15 134.97L372.98 135.6L373.77 136.23L374.54 136.88L375.27 137.53L375.98 138.19L376.65 138.86L377.29 139.54L377.89 140.23L378.47 140.92L379.01 141.62L379.51 142.32L379.99 143.03L380.43 143.75L380.83 144.47L381.2 145.2L381.54 145.93L381.84 146.66L382.1 147.4L382.34 148.14L382.53 148.88L382.69 149.63L382.82 150.37L382.91 151.12L382.96 151.87L382.98 152.62Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M382.98 199.64L382.84 201.7L382.44 203.75L381.77 205.78L380.83 207.79L379.63 209.76L378.18 211.69L376.48 213.56L374.54 215.38L372.36 217.13L369.96 218.81L367.35 220.4L364.53 221.9L361.52 223.31L358.34 224.62L354.99 225.82L351.49 226.91L347.85 227.88L344.1 228.73L340.24 229.45L336.3 230.05L332.29 230.52L328.22 230.86L324.12 231.06L320 231.13L320 184.11L324.12 184.04L328.22 183.84L332.29 183.5L336.3 183.04L340.24 182.44L344.1 181.71L347.85 180.86L351.49 179.89L354.99 178.8L358.34 177.6L361.52 176.3L364.53 174.89L367.35 173.38L369.96 171.79L372.36 170.12L374.54 168.37L376.48 166.55L378.18 164.67L379.63 162.74L380.83 160.77L381.77 158.76L382.44 156.73L382.84 154.68L382.98 152.62Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M320 231.13L316 231.06L312.02 230.87L308.07 230.56L304.16 230.11L300.33 229.55L300.33 182.53L304.16 183.1L308.07 183.54L312.02 183.86L316 184.05L320 184.11Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M300.33 229.55L296.96 228.94L293.67 228.24L290.46 227.45L287.35 226.56L284.34 225.59L281.45 224.54L278.68 223.4L278.68 176.39L281.45 177.52L284.34 178.58L287.35 179.55L290.46 180.43L293.67 181.22L296.96 181.93L300.33 182.53Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M278.68 223.4L275.89 222.11L273.26 220.74L270.8 219.29L268.52 217.78L266.43 216.19L264.53 214.54L262.83 212.84L261.34 211.1L260.07 209.31L259.01 207.48L259.01 160.47L260.07 162.29L261.34 164.08L262.83 165.83L264.53 167.53L266.43 169.17L268.52 170.76L270.8 172.28L273.26 173.73L275.89 175.1L278.68 176.39Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M259.01 207.48L258.14 205.55L257.52 203.59L257.15 201.62L257.02 199.64L257.02 152.62L257.15 154.6L257.52 156.57L258.14 158.53L259.01 160.47Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M364.53 174.89L362.75 175.74L360.9 176.57L358.99 177.35L357.02 178.1L354.99 178.8L352.91 179.47L350.77 180.09L348.59 180.68L346.37 181.22L344.1 181.71L341.8 182.16L339.46 182.57L337.09 182.93L334.7 183.24L332.29 183.5L329.85 183.72L327.4 183.89L324.94 184.01L322.47 184.09L320 184.11L317.53 184.09L315.06 184.01L312.6 183.89L310.15 183.72L307.71 183.5L305.3 183.24L302.91 182.93L300.54 182.57L298.2 182.16L295.9 181.71L293.63 181.22L291.41 180.68L289.23 180.09L287.09 179.47L285.01 178.8L282.98 178.1L281.01 177.35L279.1 176.57L277.25 175.74L275.47 174.89L273.76 174L272.11 173.07L270.54 172.12L269.05 171.13L267.64 170.12L266.3 169.07L265.05 168.01L263.89 166.92L262.81 165.8L261.82 164.67L260.92 163.52L260.11 162.35L259.39 161.17L258.76 159.97L258.23 158.76L257.8 157.55L257.46 156.32L257.22 155.09L257.07 153.86L257.02 152.62L257.07 151.39L257.22 150.15L257.46 148.92L257.8 147.7L258.23 146.48L258.76 145.27L259.39 144.07L260.11 142.89L260.92 141.72L261.82 140.57L262.81 139.44L263.89 138.33L265.05 137.24L266.3 136.17L267.64 135.13L269.05 134.11L270.54 133.13L272.11 132.17L273.76 131.25L275.47 130.36L277.25 129.5L279.1 128.68L281.01 127.89L282.98 127.15L285.01 126.44L287.09 125.77L289.23 125.15L291.41 124.57L293.63 124.03L295.9 123.53L298.2 123.08L300.54 122.67L302.91 122.32L305.3 122L307.71 121.74L310.15 121.52L312.6 121.35L315.06 121.23L317.53 121.16L320 121.13L322.47 121.16L324.94 121.23L327.4 121.35L329.85 121.52L332.29 121.74L334.7 122L337.09 122.32L339.46 122.67L341.8 123.08L344.1 123.53L346.37 124.03L348.59 124.57L350.77 125.15L352.91 125.77L354.99 126.44L357.02 127.15L358.99 127.89L360.9 128.68L362.75 129.5L364.53 130.36L366.24 131.25L367.89 132.17L369.46 133.13L370.95 134.11L372.36 135.13L373.7 136.17L374.95 137.24L376.11 138.33L377.19 139.44L378.18 140.57L379.08 141.72L379.89 142.89L380.61 144.07L381.24 145.27L381.77 146.48L382.2 147.7L382.54 148.92L382.78 150.15L382.93 151.39L382.98 152.62L382.93 153.86L382.78 155.09L382.54 156.32L382.2 157.55L381.77 158.76L381.24 159.97L380.61 161.17L379.89 162.35L379.08 163.52L378.18 164.67L377.19 165.8L376.11 166.92L374.95 168.01L373.7 169.07L372.36 170.12L370.95 171.13L369.46 172.12L367.89 173.07L366.24 174Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M382.98 152.62L382.96 153.37L382.91 154.12L382.82 154.87L382.69 155.61L382.53 156.36L382.34 157.1L382.1 157.84L381.84 158.58L381.54 159.31L381.2 160.04L380.83 160.77L380.43 161.49L379.99 162.21L379.51 162.92L379.01 163.63L378.47 164.32L377.89 165.02L377.29 165.7L376.65 166.38L375.98 167.05L375.27 167.71L374.54 168.37L373.77 169.01L372.98 169.65L372.15 170.27L371.3 170.89L370.42 171.49L369.5 172.09L368.56 172.67L367.59 173.24L366.6 173.8L365.58 174.35L364.53 174.89L363.46 175.41L362.36 175.92L361.24 176.42L360.1 176.9L358.93 177.37L357.74 177.83L356.53 178.27L355.3 178.7L354.05 179.11L352.78 179.51L351.49 179.89L350.18 180.26L348.86 180.61L347.52 180.94L346.16 181.26L344.79 181.57L343.41 181.85L342.01 182.12L340.6 182.38L339.18 182.61L337.74 182.83L336.3 183.04L334.85 183.22L333.39 183.39L331.92 183.54L330.44 183.67L328.96 183.79L327.48 183.89L325.99 183.97L324.49 184.03L323 184.07L321.5 184.1L320 184.11L318.5 184.1L317 184.07L315.51 184.03L314.01 183.97L312.52 183.89L311.04 183.79L309.56 183.67L308.08 183.54L306.61 183.39L305.15 183.22L303.7 183.04L302.26 182.83L300.82 182.61L299.4 182.38L297.99 182.12L296.59 181.85L295.21 181.57L293.84 181.26L292.48 180.94L291.14 180.61L289.82 180.26L288.51 179.89L287.22 179.51L285.95 179.11L284.7 178.7L283.47 178.27L282.26 177.83L281.07 177.37L279.9 176.9L278.76 176.42L277.64 175.92L276.54 175.41L275.47 174.89L274.42 174.35L273.4 173.8L272.41 173.24L271.44 172.67L270.5 172.09L269.58 171.49L268.7 170.89L267.85 170.27L267.02 169.65L266.23 169.01L265.46 168.37L264.73 167.71L264.02 167.05L263.35 166.38L262.71 165.7L262.11 165.02L261.53 164.32L260.99 163.63L260.49 162.92L260.01 162.21L259.57 161.49L259.17 160.77L258.8 160.04L258.46 159.31L258.16 158.58L257.9 157.84L257.66 157.1L257.47 156.36L257.31 155.61L257.18 154.87L257.09 154.12L257.04 153.37L257.02 152.62\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"inner\" d=\"M382.97 190.53L382.94 191.28L382.87 192.02L382.77 192.77L382.64 193.51L382.46 194.25L382.26 194.99L382.01 195.72L381.74 196.45L381.42 197.18L381.08 197.91L380.7 198.63L380.29 199.34L379.84 200.05L379.36 200.76L378.84 201.46L378.29 202.15L377.71 202.83L377.1 203.51L376.46 204.18L375.78 204.85L375.08 205.5L374.34 206.15L373.57 206.79L372.77 207.42L371.94 208.04L371.09 208.65L370.2 209.25L369.29 209.83L368.35 210.41L367.38 210.98L366.38 211.53L365.36 212.08L364.32 212.61L363.25 213.12L362.15 213.63L361.03 214.12L359.89 214.6L358.73 215.06L357.54 215.52L356.34 215.95L355.11 216.37L353.86 216.78L352.6 217.18L351.31 217.55L350.01 217.92L348.7 218.26L347.36 218.6L346.01 218.91L344.65 219.21L343.27 219.49L341.88 219.76L340.48 220.01L339.06 220.25L337.64 220.46L336.2 220.66L334.76 220.85L333.31 221.01L331.85 221.16L330.38 221.29L328.91 221.41L327.43 221.5L325.95 221.58L324.47 221.64L322.98 221.69L321.49 221.71L320 221.72L318.51 221.71L317.02 221.69L315.53 221.64L314.05 221.58L312.57 221.5L311.09 221.41L309.62 221.29L308.15 221.16L306.69 221.01L305.24 220.85L303.8 220.66L302.36 220.46L300.94 220.25L299.52 220.01L298.12 219.76L296.73 219.49L295.35 219.21L293.99 218.91L292.64 218.6L291.3 218.26L289.99 217.92L288.69 217.55L287.4 217.18L286.14 216.78L284.89 216.37L283.66 215.95L282.46 215.52L281.27 215.06L280.11 214.6L278.97 214.12L277.85 213.63L276.75 213.12L275.68 212.61L274.64 212.08L273.62 211.53L272.62 210.98L271.65 210.41L270.71 209.83L269.8 209.25L268.91 208.65L268.06 208.04L267.23 207.42L266.43 206.79L265.66 206.15L264.92 205.5L264.22 204.85L263.54 204.18L262.9 203.51L262.29 202.83L261.71 202.15L261.16 201.46L260.64 200.76L260.16 200.05L259.71 199.34L259.3 198.63L258.92 197.91L258.58 197.18L258.26 196.45L257.99 195.72L257.74 194.99L257.54 194.25L257.36 193.51L257.23 192.77L257.13 192.02L257.06 191.28L257.03 190.53M382.97 162.32L382.94 163.07L382.87 163.81L382.77 164.56L382.64 165.3L382.46 166.04L382.26 166.78L382.01 167.51L381.74 168.24L381.42 168.97L381.08 169.7L380.7 170.42L380.29 171.13L379.84 171.84L379.36 172.55L378.84 173.25L378.29 173.94L377.71 174.62L377.1 175.3L376.46 175.97L375.78 176.64L375.08 177.29L374.34 177.94L373.57 178.58L372.77 179.21L371.94 179.83L371.09 180.44L370.2 181.04L369.29 181.62L368.35 182.2L367.38 182.77L366.38 183.32L365.36 183.87L364.32 184.4L363.25 184.91L362.15 185.42L361.03 185.91L359.89 186.39L358.73 186.85L357.54 187.31L356.34 187.74L355.11 188.16L353.86 188.57L352.6 188.97L351.31 189.34L350.01 189.71L348.7 190.05L347.36 190.39L346.01 190.7L344.65 191L343.27 191.28L341.88 191.55L340.48 191.8L339.06 192.04L337.64 192.25L336.2 192.45L334.76 192.64L333.31 192.8L331.85 192.95L330.38 193.08L328.91 193.2L327.43 193.29L325.95 193.37L324.47 193.43L322.98 193.48L321.49 193.5L320 193.51L318.51 193.5L317.02 193.48L315.53 193.43L314.05 193.37L312.57 193.29L311.09 193.2L309.62 193.08L308.15 192.95L306.69 192.8L305.24 192.64L303.8 192.45L302.36 192.25L300.94 192.04L299.52 191.8L298.12 191.55L296.73 191.28L295.35 191L293.99 190.7L292.64 190.39L291.3 190.05L289.99 189.71L288.69 189.34L287.4 188.97L286.14 188.57L284.89 188.16L283.66 187.74L282.46 187.31L281.27 186.85L280.11 186.39L278.97 185.91L277.85 185.42L276.75 184.91L275.68 184.4L274.64 183.87L273.62 183.32L272.62 182.77L271.65 182.2L270.71 181.62L269.8 181.04L268.91 180.44L268.06 179.83L267.23 179.21L266.43 178.58L265.66 177.94L264.92 177.29L264.22 176.64L263.54 175.97L262.9 175.3L262.29 174.62L261.71 173.94L261.16 173.25L260.64 172.55L260.16 171.84L259.71 171.13L259.3 170.42L258.92 169.7L258.58 168.97L258.26 168.24L257.99 167.51L257.74 166.78L257.54 166.04L257.36 165.3L257.23 164.56L257.13 163.81L257.06 163.07L257.03 162.32\"/><g data-r=\"plane0\" transform=\"matrix(0.76778 0.38389 0 0.94033 275.32 213.52)\" opacity=\"1\"><path class=\"iso-line\" data-tone=\"mid\" d=\"M-32 -8V0M-28 -8V-4M-24 -8V-4M-20 -8V-4M-16 -8V0M-12 -8V-4M-8 -8V-4M-4 -8V-4M0 -8V0M4 -8V-4M8 -8V-4M12 -8V-4M16 -8V0M20 -8V-4M24 -8V-4M28 -8V-4M32 -8V0\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M-36 4H36\"/></g><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M382.98 199.64L382.96 200.39L382.91 201.14L382.82 201.88L382.69 202.63L382.53 203.38L382.34 204.12L382.1 204.86L381.84 205.6L381.54 206.33L381.2 207.06L380.83 207.79L380.43 208.51L379.99 209.23L379.51 209.94L379.01 210.64L378.47 211.34L377.89 212.03L377.29 212.72L376.65 213.4L375.98 214.07L375.27 214.73L374.54 215.38L373.77 216.03L372.98 216.66L372.15 217.29L371.3 217.9L370.42 218.51L369.5 219.1L368.56 219.69L367.59 220.26L366.6 220.82L365.58 221.37L364.53 221.9L363.46 222.43L362.36 222.94L361.24 223.43L360.1 223.92L358.93 224.39L357.74 224.85L356.53 225.29L355.3 225.71L354.05 226.13L352.78 226.52L351.49 226.91L350.18 227.27L348.86 227.63L347.52 227.96L346.16 228.28L344.79 228.58L343.41 228.87L342.01 229.14L340.6 229.39L339.18 229.63L337.74 229.85L336.3 230.05L334.85 230.24L333.39 230.41L331.92 230.56L330.44 230.69L328.96 230.81L327.48 230.9L325.99 230.98L324.49 231.05L323 231.09L321.5 231.12L320 231.13L318.5 231.12L317 231.09L315.51 231.05L314.01 230.98L312.52 230.9L311.04 230.81L309.56 230.69L308.08 230.56L306.61 230.41L305.15 230.24L303.7 230.05L302.26 229.85L300.82 229.63L299.4 229.39L297.99 229.14L296.59 228.87L295.21 228.58L293.84 228.28L292.48 227.96L291.14 227.63L289.82 227.27L288.51 226.91L287.22 226.52L285.95 226.13L284.7 225.71L283.47 225.29L282.26 224.85L281.07 224.39L279.9 223.92L278.76 223.43L277.64 222.94L276.54 222.43L275.47 221.9L274.42 221.37L273.4 220.82L272.41 220.26L271.44 219.69L270.5 219.1L269.58 218.51L268.7 217.9L267.85 217.29L267.02 216.66L266.23 216.03L265.46 215.38L264.73 214.73L264.02 214.07L263.35 213.4L262.71 212.72L262.11 212.03L261.53 211.34L260.99 210.64L260.49 209.94L260.01 209.23L259.57 208.51L259.17 207.79L258.8 207.06L258.46 206.33L258.16 205.6L257.9 204.86L257.66 204.12L257.47 203.38L257.31 202.63L257.18 201.88L257.09 201.14L257.04 200.39L257.02 199.64L257.02 152.62L257.04 151.87L257.09 151.12L257.18 150.37L257.31 149.63L257.47 148.88L257.66 148.14L257.9 147.4L258.16 146.66L258.46 145.93L258.8 145.2L259.17 144.47L259.57 143.75L260.01 143.03L260.49 142.32L260.99 141.62L261.53 140.92L262.11 140.23L262.71 139.54L263.35 138.86L264.02 138.19L264.73 137.53L265.46 136.88L266.23 136.23L267.02 135.6L267.85 134.97L268.7 134.36L269.58 133.75L270.5 133.16L271.44 132.57L272.41 132L273.4 131.44L274.42 130.89L275.47 130.36L276.54 129.83L277.64 129.32L278.76 128.82L279.9 128.34L281.07 127.87L282.26 127.41L283.47 126.97L284.7 126.54L285.95 126.13L287.22 125.73L288.51 125.35L289.82 124.98L291.14 124.63L292.48 124.3L293.84 123.98L295.21 123.68L296.59 123.39L297.99 123.12L299.4 122.86L300.82 122.63L302.26 122.41L303.7 122.21L305.15 122.02L306.61 121.85L308.08 121.7L309.56 121.57L311.04 121.45L312.52 121.36L314.01 121.28L315.51 121.21L317 121.17L318.5 121.14L320 121.13L321.5 121.14L323 121.17L324.49 121.21L325.99 121.28L327.48 121.36L328.96 121.45L330.44 121.57L331.92 121.7L333.39 121.85L334.85 122.02L336.3 122.21L337.74 122.41L339.18 122.63L340.6 122.86L342.01 123.12L343.41 123.39L344.79 123.68L346.16 123.98L347.52 124.3L348.86 124.63L350.18 124.98L351.49 125.35L352.78 125.73L354.05 126.13L355.3 126.54L356.53 126.97L357.74 127.41L358.93 127.87L360.1 128.34L361.24 128.82L362.36 129.32L363.46 129.83L364.53 130.36L365.58 130.89L366.6 131.44L367.59 132L368.56 132.57L369.5 133.16L370.42 133.75L371.3 134.36L372.15 134.97L372.98 135.6L373.77 136.23L374.54 136.88L375.27 137.53L375.98 138.19L376.65 138.86L377.29 139.54L377.89 140.23L378.47 140.92L379.01 141.62L379.51 142.32L379.99 143.03L380.43 143.75L380.83 144.47L381.2 145.2L381.54 145.93L381.84 146.66L382.1 147.4L382.34 148.14L382.53 148.88L382.69 149.63L382.82 150.37L382.91 151.12L382.96 151.87L382.98 152.62Z\"/></g><g class=\"iso-solid\" data-p=\"81\" data-name=\"stagger.tooth19\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M379.22 96.16L378.63 97.27L373.46 98.76L369.98 95.75L369.98 84.47L375.15 82.98L377.38 83.27L379.22 84.87Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"M379.22 84.87L378.63 85.99L378.63 97.27L379.22 96.16Z\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"M378.63 85.99L373.46 87.48L373.46 98.76L378.63 97.27Z\"/><path class=\"iso-tn\" data-r=\"f5\" data-b=\"3\" d=\"M373.46 87.48L369.98 84.47L369.98 95.75L373.46 98.76Z\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M369.98 84.47L375.15 82.98L377.38 83.27L379.22 84.87L378.63 85.99L373.46 87.48Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M378.63 97.27L378.63 85.99M373.46 98.76L373.46 87.48M379.22 84.87L378.63 85.99L373.46 87.48L369.98 84.47\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M379.22 96.16L378.63 97.27L373.46 98.76L369.98 95.75L369.98 84.47L375.15 82.98L377.38 83.27L379.22 84.87Z\"/></g><g class=\"iso-solid\" data-p=\"40\" data-name=\"animation.cap\" data-mat=\"gunmetal\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M380.3 143.53L380.71 144.25L381.09 144.97L381.44 145.7L381.75 146.43L382.02 147.17L382.27 147.9L382.47 148.64L382.64 149.39L382.78 150.13L382.88 150.88L382.94 151.62L382.97 152.37L382.97 153.12L382.93 153.87L382.85 154.61L382.74 155.36L382.59 156.1L382.41 156.84L382.19 157.58L381.94 158.32L381.65 159.05L381.33 159.78L380.97 160.51L380.58 161.23L380.15 161.95L379.69 162.66L379.2 163.36L378.67 164.06L378.11 164.76L377.52 165.44L376.89 166.12L376.24 166.79L375.55 167.46L374.83 168.11L374.08 168.76L373.3 169.4L372.48 170.02L371.64 170.64L370.77 171.25L369.87 171.85L368.95 172.43L367.99 173.01L367.01 173.57L366 174.12L364.97 174.66L363.91 175.19L362.83 175.71L361.72 176.21L360.59 176.7L359.43 177.17L358.26 177.63L357.06 178.08L355.84 178.51L354.6 178.93L353.34 179.33L352.06 179.72L350.77 180.1L349.45 180.45L348.12 180.8L346.78 181.12L345.42 181.43L344.04 181.72L342.65 182L341.25 182.26L339.84 182.51L338.42 182.73L336.98 182.94L335.54 183.14L334.08 183.31L332.62 183.47L331.15 183.61L329.68 183.74L328.2 183.84L326.72 183.93L325.23 184L323.74 184.05L322.24 184.09L320.75 184.11L319.25 184.11L317.76 184.09L316.26 184.05L314.77 184L313.28 183.93L311.8 183.84L310.32 183.74L308.85 183.61L307.38 183.47L305.92 183.31L304.46 183.14L303.02 182.94L301.58 182.73L300.16 182.51L298.75 182.26L297.35 182L295.96 181.72L294.58 181.43L293.22 181.12L291.88 180.8L290.55 180.45L289.23 180.1L287.94 179.72L286.66 179.33L285.4 178.93L284.16 178.51L282.94 178.08L281.74 177.63L280.57 177.17L279.41 176.7L278.28 176.21L277.17 175.71L276.09 175.19L275.03 174.66L274 174.12L272.99 173.57L272.01 173.01L271.05 172.43L270.13 171.85L269.23 171.25L268.36 170.64L267.52 170.02L266.7 169.4L265.92 168.76L265.17 168.11L264.45 167.46L263.76 166.79L263.11 166.12L262.48 165.44L261.89 164.76L261.33 164.06L260.8 163.36L260.31 162.66L259.85 161.95L259.42 161.23L259.03 160.51L258.67 159.78L258.35 159.05L258.06 158.32L257.81 157.58L257.59 156.84L257.41 156.1L257.26 155.36L257.15 154.61L257.07 153.87L257.03 153.12L257.03 152.37L257.06 151.62L257.12 150.88L257.22 150.13L257.36 149.39L257.53 148.64L257.73 147.9L257.98 147.17L258.25 146.43L258.56 145.7L258.91 144.97L259.29 144.25L259.7 143.53L263.86 136.64L264.31 135.92L264.8 135.21L265.32 134.51L265.88 133.82L266.48 133.13L267.11 132.45L267.77 131.78L268.47 131.11L269.2 130.46L269.97 129.81L270.76 129.18L271.59 128.56L272.45 127.94L273.35 127.34L274.27 126.75L275.22 126.17L276.2 125.61L277.22 125.05L278.25 124.51L279.32 123.99L280.41 123.47L281.53 122.97L282.67 122.49L283.84 122.02L285.03 121.57L286.25 121.13L287.48 120.7L288.74 120.3L290.02 119.9L291.32 119.53L292.63 119.17L293.97 118.83L295.32 118.51L296.69 118.2L298.07 117.91L299.46 117.64L300.87 117.39L302.3 117.15L303.73 116.93L305.18 116.73L306.63 116.55L308.09 116.39L309.57 116.25L311.04 116.13L312.53 116.02L314.02 115.94L315.51 115.87L317 115.82L318.5 115.79L320 115.78L321.5 115.79L323 115.82L324.49 115.87L325.98 115.94L327.47 116.02L328.96 116.13L330.43 116.25L331.91 116.39L333.37 116.55L334.82 116.73L336.27 116.93L337.7 117.15L339.13 117.39L340.54 117.64L341.93 117.91L343.31 118.2L344.68 118.51L346.03 118.83L347.37 119.17L348.68 119.53L349.98 119.9L351.26 120.3L352.52 120.7L353.75 121.13L354.97 121.57L356.16 122.02L357.33 122.49L358.47 122.97L359.59 123.47L360.68 123.99L361.75 124.51L362.78 125.05L363.8 125.61L364.78 126.17L365.73 126.75L366.65 127.34L367.55 127.94L368.41 128.56L369.24 129.18L370.03 129.81L370.8 130.46L371.53 131.11L372.23 131.78L372.89 132.45L373.52 133.13L374.12 133.82L374.68 134.51L375.2 135.21L375.69 135.92L376.14 136.64Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M380.3 143.53L381.34 145.48L382.13 147.47L382.66 149.47L382.94 151.49L382.95 153.51L382.71 155.53L382.2 157.53L381.45 159.52L380.43 161.48L379.17 163.4L377.67 165.28L375.92 167.1L373.95 168.86L371.75 170.56L369.35 172.19L366.73 173.73L363.93 175.18L360.94 176.55L357.79 177.81L355.18 168.55L358.12 167.37L360.9 166.11L363.51 164.75L365.94 163.31L368.19 161.8L370.23 160.22L372.07 158.58L373.69 156.88L375.09 155.13L376.27 153.34L377.21 151.52L377.91 149.67L378.38 147.81L378.61 145.93L378.6 144.04L378.34 142.17L377.84 140.3L377.11 138.45L376.14 136.64Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M357.79 177.81L354.43 178.99L350.93 180.05L347.31 181L343.56 181.82L339.72 182.53L335.79 183.1L334.7 173.48L338.36 172.94L341.94 172.29L345.42 171.52L348.8 170.63L352.06 169.65L355.18 168.55Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M335.79 183.1L331.82 183.55L327.81 183.87L323.76 184.05L319.7 184.11L315.64 184.03L311.59 183.83L312.17 174.15L315.94 174.34L319.72 174.41L323.5 174.36L327.27 174.19L331.01 173.89L334.7 173.48Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M311.59 183.83L307.76 183.51L303.98 183.07L300.26 182.52L296.61 181.86L293.05 181.08L289.6 180.2L291.69 170.77L294.91 171.6L298.22 172.32L301.62 172.94L305.08 173.45L308.61 173.86L312.17 174.15Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M289.6 180.2L286.09 179.16L282.73 178L279.52 176.74L276.48 175.38L273.63 173.93L270.97 172.38L268.52 170.76L266.28 169.05L264.26 167.28L262.48 165.44L260.94 163.56L259.65 161.62L258.61 159.65L257.83 157.65L257.31 155.63L257.05 153.59L257.06 151.56L257.33 149.52L257.86 147.5L258.65 145.5L259.7 143.53L263.86 136.64L262.89 138.47L262.15 140.33L261.65 142.21L261.4 144.11L261.39 146L261.63 147.9L262.12 149.78L262.85 151.64L263.81 153.48L265.02 155.28L266.45 157.04L268.11 158.75L269.98 160.4L272.07 161.98L274.35 163.5L276.83 164.94L279.49 166.29L282.31 167.56L285.3 168.73L288.43 169.8L291.69 170.77Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M361.46 165.83L359.8 166.63L358.08 167.39L356.3 168.12L354.46 168.82L352.57 169.47L350.64 170.1L348.65 170.68L346.62 171.22L344.55 171.72L342.44 172.18L340.29 172.6L338.12 172.98L335.92 173.31L333.69 173.61L331.44 173.85L329.17 174.05L326.89 174.21L324.6 174.32L322.3 174.39L320 174.42L317.7 174.39L315.4 174.32L313.11 174.21L310.83 174.05L308.56 173.85L306.31 173.61L304.08 173.31L301.88 172.98L299.71 172.6L297.56 172.18L295.45 171.72L293.38 171.22L291.35 170.68L289.36 170.1L287.43 169.47L285.54 168.82L283.7 168.12L281.92 167.39L280.2 166.63L278.54 165.83L276.94 165L275.41 164.14L273.95 163.25L272.56 162.33L271.25 161.39L270.01 160.42L268.84 159.42L267.76 158.41L266.75 157.37L265.83 156.32L264.99 155.25L264.24 154.16L263.57 153.06L262.99 151.94L262.49 150.82L262.09 149.68L261.77 148.54L261.55 147.4L261.41 146.25L261.37 145.1L261.41 143.95L261.55 142.8L261.77 141.65L262.09 140.51L262.49 139.38L262.99 138.25L263.57 137.14L264.24 136.04L264.99 134.95L265.83 133.88L266.75 132.82L267.76 131.79L268.84 130.77L270.01 129.78L271.25 128.81L272.56 127.87L273.95 126.95L275.41 126.06L276.94 125.2L278.54 124.37L280.2 123.57L281.92 122.81L283.7 122.08L285.54 121.38L287.43 120.72L289.36 120.1L291.35 119.52L293.38 118.98L295.45 118.47L297.56 118.01L299.71 117.59L301.88 117.22L304.08 116.88L306.31 116.59L308.56 116.35L310.83 116.14L313.11 115.99L315.4 115.87L317.7 115.8L320 115.78L322.3 115.8L324.6 115.87L326.89 115.99L329.17 116.14L331.44 116.35L333.69 116.59L335.92 116.88L338.12 117.22L340.29 117.59L342.44 118.01L344.55 118.47L346.62 118.98L348.65 119.52L350.64 120.1L352.57 120.72L354.46 121.38L356.3 122.08L358.08 122.81L359.8 123.57L361.46 124.37L363.06 125.2L364.59 126.06L366.05 126.95L367.44 127.87L368.75 128.81L369.99 129.78L371.16 130.77L372.24 131.79L373.25 132.82L374.17 133.88L375.01 134.95L375.76 136.04L376.43 137.14L377.01 138.25L377.51 139.38L377.91 140.51L378.23 141.65L378.45 142.8L378.59 143.95L378.63 145.1L378.59 146.25L378.45 147.4L378.23 148.54L377.91 149.68L377.51 150.82L377.01 151.94L376.43 153.06L375.76 154.16L375.01 155.25L374.17 156.32L373.25 157.37L372.24 158.41L371.16 159.42L369.99 160.42L368.75 161.39L367.44 162.33L366.05 163.25L364.59 164.14L363.06 165Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M376.14 136.64L376.55 137.35L376.93 138.08L377.27 138.81L377.57 139.54L377.83 140.28L378.06 141.02L378.25 141.76L378.4 142.5L378.52 143.25L378.59 144L378.63 144.75L378.63 145.49L378.59 146.24L378.51 146.99L378.4 147.74L378.24 148.48L378.05 149.22L377.82 149.96L377.55 150.7L377.25 151.43L376.91 152.16L376.53 152.88L376.11 153.6L375.66 154.32L375.17 155.02L374.65 155.73L374.09 156.42L373.49 157.11L372.86 157.78L372.19 158.45L371.5 159.12L370.76 159.77L370 160.41L369.2 161.05L368.37 161.67L367.51 162.28L366.62 162.88L365.69 163.47L364.74 164.05L363.76 164.61L362.75 165.16L361.71 165.7L360.64 166.23L359.55 166.74L358.43 167.24L357.29 167.72L356.12 168.19L354.93 168.64L353.72 169.08L352.48 169.5L351.23 169.91L349.95 170.3L348.65 170.68L347.34 171.03L346.01 171.37L344.66 171.7L343.29 172L341.91 172.29L340.51 172.56L339.1 172.82L337.68 173.05L336.25 173.27L334.81 173.47L333.35 173.64L331.89 173.81L330.42 173.95L328.95 174.07L327.46 174.18L325.98 174.26L324.49 174.33L322.99 174.38L321.5 174.41L320 174.42L318.5 174.41L317.01 174.38L315.51 174.33L314.02 174.26L312.54 174.18L311.05 174.07L309.58 173.95L308.11 173.81L306.65 173.64L305.19 173.47L303.75 173.27L302.32 173.05L300.9 172.82L299.49 172.56L298.09 172.29L296.71 172L295.34 171.7L293.99 171.37L292.66 171.03L291.35 170.68L290.05 170.3L288.77 169.91L287.52 169.5L286.28 169.08L285.07 168.64L283.88 168.19L282.71 167.72L281.57 167.24L280.45 166.74L279.36 166.23L278.29 165.7L277.25 165.16L276.24 164.61L275.26 164.05L274.31 163.47L273.38 162.88L272.49 162.28L271.63 161.67L270.8 161.05L270 160.41L269.24 159.77L268.5 159.12L267.81 158.45L267.14 157.78L266.51 157.11L265.91 156.42L265.35 155.73L264.83 155.02L264.34 154.32L263.89 153.6L263.47 152.88L263.09 152.16L262.75 151.43L262.45 150.7L262.18 149.96L261.95 149.22L261.76 148.48L261.6 147.74L261.49 146.99L261.41 146.24L261.37 145.49L261.37 144.75L261.41 144L261.48 143.25L261.6 142.5L261.75 141.76L261.94 141.02L262.17 140.28L262.43 139.54L262.73 138.81L263.07 138.08L263.45 137.35L263.86 136.64\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M380.3 143.53L380.71 144.25L381.09 144.97L381.44 145.7L381.75 146.43L382.02 147.17L382.27 147.9L382.47 148.64L382.64 149.39L382.78 150.13L382.88 150.88L382.94 151.62L382.97 152.37L382.97 153.12L382.93 153.87L382.85 154.61L382.74 155.36L382.59 156.1L382.41 156.84L382.19 157.58L381.94 158.32L381.65 159.05L381.33 159.78L380.97 160.51L380.58 161.23L380.15 161.95L379.69 162.66L379.2 163.36L378.67 164.06L378.11 164.76L377.52 165.44L376.89 166.12L376.24 166.79L375.55 167.46L374.83 168.11L374.08 168.76L373.3 169.4L372.48 170.02L371.64 170.64L370.77 171.25L369.87 171.85L368.95 172.43L367.99 173.01L367.01 173.57L366 174.12L364.97 174.66L363.91 175.19L362.83 175.71L361.72 176.21L360.59 176.7L359.43 177.17L358.26 177.63L357.06 178.08L355.84 178.51L354.6 178.93L353.34 179.33L352.06 179.72L350.77 180.1L349.45 180.45L348.12 180.8L346.78 181.12L345.42 181.43L344.04 181.72L342.65 182L341.25 182.26L339.84 182.51L338.42 182.73L336.98 182.94L335.54 183.14L334.08 183.31L332.62 183.47L331.15 183.61L329.68 183.74L328.2 183.84L326.72 183.93L325.23 184L323.74 184.05L322.24 184.09L320.75 184.11L319.25 184.11L317.76 184.09L316.26 184.05L314.77 184L313.28 183.93L311.8 183.84L310.32 183.74L308.85 183.61L307.38 183.47L305.92 183.31L304.46 183.14L303.02 182.94L301.58 182.73L300.16 182.51L298.75 182.26L297.35 182L295.96 181.72L294.58 181.43L293.22 181.12L291.88 180.8L290.55 180.45L289.23 180.1L287.94 179.72L286.66 179.33L285.4 178.93L284.16 178.51L282.94 178.08L281.74 177.63L280.57 177.17L279.41 176.7L278.28 176.21L277.17 175.71L276.09 175.19L275.03 174.66L274 174.12L272.99 173.57L272.01 173.01L271.05 172.43L270.13 171.85L269.23 171.25L268.36 170.64L267.52 170.02L266.7 169.4L265.92 168.76L265.17 168.11L264.45 167.46L263.76 166.79L263.11 166.12L262.48 165.44L261.89 164.76L261.33 164.06L260.8 163.36L260.31 162.66L259.85 161.95L259.42 161.23L259.03 160.51L258.67 159.78L258.35 159.05L258.06 158.32L257.81 157.58L257.59 156.84L257.41 156.1L257.26 155.36L257.15 154.61L257.07 153.87L257.03 153.12L257.03 152.37L257.06 151.62L257.12 150.88L257.22 150.13L257.36 149.39L257.53 148.64L257.73 147.9L257.98 147.17L258.25 146.43L258.56 145.7L258.91 144.97L259.29 144.25L259.7 143.53L263.86 136.64L264.31 135.92L264.8 135.21L265.32 134.51L265.88 133.82L266.48 133.13L267.11 132.45L267.77 131.78L268.47 131.11L269.2 130.46L269.97 129.81L270.76 129.18L271.59 128.56L272.45 127.94L273.35 127.34L274.27 126.75L275.22 126.17L276.2 125.61L277.22 125.05L278.25 124.51L279.32 123.99L280.41 123.47L281.53 122.97L282.67 122.49L283.84 122.02L285.03 121.57L286.25 121.13L287.48 120.7L288.74 120.3L290.02 119.9L291.32 119.53L292.63 119.17L293.97 118.83L295.32 118.51L296.69 118.2L298.07 117.91L299.46 117.64L300.87 117.39L302.3 117.15L303.73 116.93L305.18 116.73L306.63 116.55L308.09 116.39L309.57 116.25L311.04 116.13L312.53 116.02L314.02 115.94L315.51 115.87L317 115.82L318.5 115.79L320 115.78L321.5 115.79L323 115.82L324.49 115.87L325.98 115.94L327.47 116.02L328.96 116.13L330.43 116.25L331.91 116.39L333.37 116.55L334.82 116.73L336.27 116.93L337.7 117.15L339.13 117.39L340.54 117.64L341.93 117.91L343.31 118.2L344.68 118.51L346.03 118.83L347.37 119.17L348.68 119.53L349.98 119.9L351.26 120.3L352.52 120.7L353.75 121.13L354.97 121.57L356.16 122.02L357.33 122.49L358.47 122.97L359.59 123.47L360.68 123.99L361.75 124.51L362.78 125.05L363.8 125.61L364.78 126.17L365.73 126.75L366.65 127.34L367.55 127.94L368.41 128.56L369.24 129.18L370.03 129.81L370.8 130.46L371.53 131.11L372.23 131.78L372.89 132.45L373.52 133.13L374.12 133.82L374.68 134.51L375.2 135.21L375.69 135.92L376.14 136.64Z\"/></g><g class=\"iso-solid\" data-p=\"49\" data-name=\"spring.coil0\" data-mat=\"copper\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M374.29 143.22L374.27 143.97L374.21 144.71L374.1 145.46L373.96 146.2L373.78 146.95L373.55 147.69L373.28 148.42L372.98 149.15L372.63 149.88L372.24 150.6L371.81 151.32L371.35 152.03L370.84 152.74L370.3 153.43L369.72 154.12L369.1 154.8L368.44 155.47L367.75 156.14L367.02 156.79L366.25 157.43L365.45 158.06L364.61 158.69L363.74 159.29L362.84 159.89L361.91 160.47L360.94 161.05L359.94 161.6L358.91 162.15L357.86 162.67L356.77 163.19L355.66 163.69L354.51 164.17L353.35 164.64L352.15 165.09L350.93 165.53L349.69 165.94L348.43 166.34L347.14 166.73L345.84 167.09L344.51 167.44L343.17 167.77L341.81 168.08L340.43 168.37L339.04 168.64L337.63 168.89L336.21 169.13L334.77 169.34L333.33 169.53L331.87 169.71L330.41 169.86L328.94 169.99L327.46 170.11L325.97 170.2L324.48 170.27L322.99 170.32L321.5 170.35L320 170.36L318.5 170.35L317.01 170.32L315.52 170.27L314.03 170.2L312.54 170.11L311.06 169.99L309.59 169.86L308.13 169.71L306.67 169.53L305.23 169.34L303.79 169.13L302.37 168.89L300.96 168.64L299.57 168.37L298.19 168.08L296.83 167.77L295.49 167.44L294.16 167.09L292.86 166.73L291.57 166.34L290.31 165.94L289.07 165.53L287.85 165.09L286.65 164.64L285.49 164.17L284.34 163.69L283.23 163.19L282.14 162.67L281.09 162.15L280.06 161.6L279.06 161.05L278.09 160.47L277.16 159.89L276.26 159.29L275.39 158.69L274.55 158.06L273.75 157.43L272.98 156.79L272.25 156.14L271.56 155.47L270.9 154.8L270.28 154.12L269.7 153.43L269.16 152.74L268.65 152.03L268.19 151.32L267.76 150.6L267.37 149.88L267.02 149.15L266.72 148.42L266.45 147.69L266.22 146.95L266.04 146.2L265.9 145.46L265.79 144.71L265.73 143.97L265.71 143.22L265.71 140.4L265.73 139.65L265.79 138.9L265.9 138.16L266.04 137.41L266.22 136.67L266.45 135.93L266.72 135.19L267.02 134.46L267.37 133.73L267.76 133.01L268.19 132.29L268.65 131.58L269.16 130.88L269.7 130.18L270.28 129.49L270.9 128.81L271.56 128.14L272.25 127.48L272.98 126.82L273.75 126.18L274.55 125.55L275.39 124.93L276.26 124.32L277.16 123.72L278.09 123.14L279.06 122.57L280.06 122.01L281.09 121.47L282.14 120.94L283.23 120.43L284.34 119.93L285.49 119.44L286.65 118.98L287.85 118.52L289.07 118.09L290.31 117.67L291.57 117.27L292.86 116.89L294.16 116.52L295.49 116.18L296.83 115.85L298.19 115.54L299.57 115.25L300.96 114.98L302.37 114.72L303.79 114.49L305.23 114.28L306.67 114.08L308.13 113.91L309.59 113.76L311.06 113.62L312.54 113.51L314.03 113.42L315.52 113.34L317.01 113.29L318.5 113.26L320 113.25L321.5 113.26L322.99 113.29L324.48 113.34L325.97 113.42L327.46 113.51L328.94 113.62L330.41 113.76L331.87 113.91L333.33 114.08L334.77 114.28L336.21 114.49L337.63 114.72L339.04 114.98L340.43 115.25L341.81 115.54L343.17 115.85L344.51 116.18L345.84 116.52L347.14 116.89L348.43 117.27L349.69 117.67L350.93 118.09L352.15 118.52L353.35 118.98L354.51 119.44L355.66 119.93L356.77 120.43L357.86 120.94L358.91 121.47L359.94 122.01L360.94 122.57L361.91 123.14L362.84 123.72L363.74 124.32L364.61 124.93L365.45 125.55L366.25 126.18L367.02 126.82L367.75 127.48L368.44 128.14L369.1 128.81L369.72 129.49L370.3 130.18L370.84 130.88L371.35 131.58L371.81 132.29L372.24 133.01L372.63 133.73L372.98 134.46L373.28 135.19L373.55 135.93L373.78 136.67L373.96 137.41L374.1 138.16L374.21 138.9L374.27 139.65L374.29 140.4Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M374.29 143.22L374.17 144.99L373.83 146.76L373.25 148.51L372.44 150.24L371.41 151.94L370.16 153.61L368.69 155.22L367.02 156.79L365.14 158.3L363.07 159.74L360.82 161.12L358.39 162.41L355.8 163.63L353.05 164.75L350.16 165.79L347.14 166.73L344.01 167.56L340.78 168.3L337.45 168.92L334.05 169.44L330.59 169.84L327.09 170.13L323.55 170.3L320 170.36L320 167.54L323.55 167.48L327.09 167.31L330.59 167.02L334.05 166.62L337.45 166.1L340.78 165.48L344.01 164.74L347.14 163.91L350.16 162.97L353.05 161.93L355.8 160.81L358.39 159.59L360.82 158.29L363.07 156.92L365.14 155.48L367.02 153.97L368.69 152.4L370.16 150.78L371.41 149.12L372.44 147.42L373.25 145.69L373.83 143.94L374.17 142.17L374.29 140.4Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M320 170.36L316.55 170.31L313.12 170.14L309.71 169.87L306.35 169.49L303.04 169L303.04 166.18L306.35 166.67L309.71 167.05L313.12 167.32L316.55 167.49L320 167.54Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M303.04 169L300.14 168.48L297.3 167.88L294.53 167.19L291.85 166.43L289.26 165.59L286.77 164.68L284.38 163.7L284.38 160.88L286.77 161.86L289.26 162.77L291.85 163.61L294.53 164.37L297.3 165.05L300.14 165.66L303.04 166.18Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M284.38 163.7L281.98 162.59L279.71 161.41L277.59 160.16L275.62 158.85L273.82 157.49L272.18 156.07L270.72 154.6L269.43 153.1L268.33 151.55L267.42 149.98L267.42 147.16L268.33 148.73L269.43 150.28L270.72 151.78L272.18 153.25L273.82 154.67L275.62 156.03L277.59 157.34L279.71 158.59L281.98 159.77L284.38 160.88Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M267.42 149.98L266.68 148.31L266.14 146.63L265.82 144.93L265.71 143.22L265.71 140.4L265.82 142.1L266.14 143.81L266.68 145.49L267.42 147.16Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M358.39 159.59L356.85 160.33L355.26 161.04L353.61 161.71L351.91 162.36L350.16 162.97L348.37 163.54L346.53 164.08L344.65 164.58L342.73 165.05L340.78 165.48L338.79 165.86L336.78 166.21L334.74 166.52L332.67 166.79L330.59 167.02L328.49 167.21L326.38 167.35L324.26 167.46L322.13 167.52L320 167.54L317.87 167.52L315.74 167.46L313.62 167.35L311.51 167.21L309.41 167.02L307.33 166.79L305.26 166.52L303.22 166.21L301.21 165.86L299.22 165.48L297.27 165.05L295.35 164.58L293.47 164.08L291.63 163.54L289.84 162.97L288.09 162.36L286.39 161.71L284.74 161.04L283.15 160.33L281.61 159.59L280.13 158.82L278.72 158.03L277.37 157.2L276.08 156.35L274.86 155.48L273.71 154.58L272.63 153.66L271.63 152.72L270.7 151.76L269.84 150.78L269.07 149.79L268.37 148.79L267.75 147.77L267.21 146.73L266.75 145.69L266.38 144.64L266.09 143.59L265.88 142.53L265.75 141.46L265.71 140.4L265.75 139.33L265.88 138.27L266.09 137.21L266.38 136.15L266.75 135.1L267.21 134.06L267.75 133.03L268.37 132.01L269.07 131L269.84 130.01L270.7 129.03L271.63 128.07L272.63 127.13L273.71 126.21L274.86 125.32L276.08 124.44L277.37 123.59L278.72 122.77L280.13 121.97L281.61 121.2L283.15 120.46L284.74 119.76L286.39 119.08L288.09 118.44L289.84 117.83L291.63 117.25L293.47 116.71L295.35 116.21L297.27 115.75L299.22 115.32L301.21 114.93L303.22 114.58L305.26 114.27L307.33 114L309.41 113.77L311.51 113.59L313.62 113.44L315.74 113.34L317.87 113.27L320 113.25L322.13 113.27L324.26 113.34L326.38 113.44L328.49 113.59L330.59 113.77L332.67 114L334.74 114.27L336.78 114.58L338.79 114.93L340.78 115.32L342.73 115.75L344.65 116.21L346.53 116.71L348.37 117.25L350.16 117.83L351.91 118.44L353.61 119.08L355.26 119.76L356.85 120.46L358.39 121.2L359.87 121.97L361.28 122.77L362.63 123.59L363.92 124.44L365.14 125.32L366.29 126.21L367.37 127.13L368.37 128.07L369.3 129.03L370.16 130.01L370.93 131L371.63 132.01L372.25 133.03L372.79 134.06L373.25 135.1L373.62 136.15L373.91 137.21L374.12 138.27L374.25 139.33L374.29 140.4L374.25 141.46L374.12 142.53L373.91 143.59L373.62 144.64L373.25 145.69L372.79 146.73L372.25 147.77L371.63 148.79L370.93 149.79L370.16 150.78L369.3 151.76L368.37 152.72L367.37 153.66L366.29 154.58L365.14 155.48L363.92 156.35L362.63 157.2L361.28 158.03L359.87 158.82Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M374.29 140.4L374.27 141.14L374.21 141.89L374.1 142.64L373.96 143.38L373.78 144.13L373.55 144.86L373.28 145.6L372.98 146.33L372.63 147.06L372.24 147.78L371.81 148.5L371.35 149.21L370.84 149.92L370.3 150.61L369.72 151.3L369.1 151.98L368.44 152.65L367.75 153.32L367.02 153.97L366.25 154.61L365.45 155.24L364.61 155.86L363.74 156.47L362.84 157.07L361.91 157.65L360.94 158.22L359.94 158.78L358.91 159.33L357.86 159.85L356.77 160.37L355.66 160.87L354.51 161.35L353.35 161.82L352.15 162.27L350.93 162.7L349.69 163.12L348.43 163.52L347.14 163.91L345.84 164.27L344.51 164.62L343.17 164.95L341.81 165.26L340.43 165.55L339.04 165.82L337.63 166.07L336.21 166.3L334.77 166.52L333.33 166.71L331.87 166.88L330.41 167.04L328.94 167.17L327.46 167.28L325.97 167.38L324.48 167.45L322.99 167.5L321.5 167.53L320 167.54L318.5 167.53L317.01 167.5L315.52 167.45L314.03 167.38L312.54 167.28L311.06 167.17L309.59 167.04L308.13 166.88L306.67 166.71L305.23 166.52L303.79 166.3L302.37 166.07L300.96 165.82L299.57 165.55L298.19 165.26L296.83 164.95L295.49 164.62L294.16 164.27L292.86 163.91L291.57 163.52L290.31 163.12L289.07 162.7L287.85 162.27L286.65 161.82L285.49 161.35L284.34 160.87L283.23 160.37L282.14 159.85L281.09 159.33L280.06 158.78L279.06 158.22L278.09 157.65L277.16 157.07L276.26 156.47L275.39 155.86L274.55 155.24L273.75 154.61L272.98 153.97L272.25 153.32L271.56 152.65L270.9 151.98L270.28 151.3L269.7 150.61L269.16 149.92L268.65 149.21L268.19 148.5L267.76 147.78L267.37 147.06L267.02 146.33L266.72 145.6L266.45 144.86L266.22 144.13L266.04 143.38L265.9 142.64L265.79 141.89L265.73 141.14L265.71 140.4\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r0\" opacity=\"1\" d=\"M358.39 162.04L358.39 159.97M351.91 164.8L351.91 162.73M344.65 167.03L344.65 164.96M336.78 168.66L336.78 166.59M328.49 169.65L328.49 167.58M320 169.99L320 167.92M311.51 169.65L311.51 167.58M303.22 168.66L303.22 166.59M295.35 167.03L295.35 164.96M288.09 164.8L288.09 162.73M281.61 162.04L281.61 159.97\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r1\" opacity=\"0.969\" d=\"M276.08 158.8L276.08 156.73M363.92 158.8L363.92 156.73\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r2\" opacity=\"0.75\" d=\"M271.63 155.17L271.63 153.1M368.37 155.17L368.37 153.1\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r3\" opacity=\"0.344\" d=\"M268.37 151.23L268.37 149.16M371.63 151.23L371.63 149.16\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r4\" opacity=\"0.031\" d=\"M266.38 147.09L266.38 145.02M373.62 147.09L373.62 145.02\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r5\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r6\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r7\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r8\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r9\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r10\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r11\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r12\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r13\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r14\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M374.29 143.22L374.27 143.97L374.21 144.71L374.1 145.46L373.96 146.2L373.78 146.95L373.55 147.69L373.28 148.42L372.98 149.15L372.63 149.88L372.24 150.6L371.81 151.32L371.35 152.03L370.84 152.74L370.3 153.43L369.72 154.12L369.1 154.8L368.44 155.47L367.75 156.14L367.02 156.79L366.25 157.43L365.45 158.06L364.61 158.69L363.74 159.29L362.84 159.89L361.91 160.47L360.94 161.05L359.94 161.6L358.91 162.15L357.86 162.67L356.77 163.19L355.66 163.69L354.51 164.17L353.35 164.64L352.15 165.09L350.93 165.53L349.69 165.94L348.43 166.34L347.14 166.73L345.84 167.09L344.51 167.44L343.17 167.77L341.81 168.08L340.43 168.37L339.04 168.64L337.63 168.89L336.21 169.13L334.77 169.34L333.33 169.53L331.87 169.71L330.41 169.86L328.94 169.99L327.46 170.11L325.97 170.2L324.48 170.27L322.99 170.32L321.5 170.35L320 170.36L318.5 170.35L317.01 170.32L315.52 170.27L314.03 170.2L312.54 170.11L311.06 169.99L309.59 169.86L308.13 169.71L306.67 169.53L305.23 169.34L303.79 169.13L302.37 168.89L300.96 168.64L299.57 168.37L298.19 168.08L296.83 167.77L295.49 167.44L294.16 167.09L292.86 166.73L291.57 166.34L290.31 165.94L289.07 165.53L287.85 165.09L286.65 164.64L285.49 164.17L284.34 163.69L283.23 163.19L282.14 162.67L281.09 162.15L280.06 161.6L279.06 161.05L278.09 160.47L277.16 159.89L276.26 159.29L275.39 158.69L274.55 158.06L273.75 157.43L272.98 156.79L272.25 156.14L271.56 155.47L270.9 154.8L270.28 154.12L269.7 153.43L269.16 152.74L268.65 152.03L268.19 151.32L267.76 150.6L267.37 149.88L267.02 149.15L266.72 148.42L266.45 147.69L266.22 146.95L266.04 146.2L265.9 145.46L265.79 144.71L265.73 143.97L265.71 143.22L265.71 140.4L265.73 139.65L265.79 138.9L265.9 138.16L266.04 137.41L266.22 136.67L266.45 135.93L266.72 135.19L267.02 134.46L267.37 133.73L267.76 133.01L268.19 132.29L268.65 131.58L269.16 130.88L269.7 130.18L270.28 129.49L270.9 128.81L271.56 128.14L272.25 127.48L272.98 126.82L273.75 126.18L274.55 125.55L275.39 124.93L276.26 124.32L277.16 123.72L278.09 123.14L279.06 122.57L280.06 122.01L281.09 121.47L282.14 120.94L283.23 120.43L284.34 119.93L285.49 119.44L286.65 118.98L287.85 118.52L289.07 118.09L290.31 117.67L291.57 117.27L292.86 116.89L294.16 116.52L295.49 116.18L296.83 115.85L298.19 115.54L299.57 115.25L300.96 114.98L302.37 114.72L303.79 114.49L305.23 114.28L306.67 114.08L308.13 113.91L309.59 113.76L311.06 113.62L312.54 113.51L314.03 113.42L315.52 113.34L317.01 113.29L318.5 113.26L320 113.25L321.5 113.26L322.99 113.29L324.48 113.34L325.97 113.42L327.46 113.51L328.94 113.62L330.41 113.76L331.87 113.91L333.33 114.08L334.77 114.28L336.21 114.49L337.63 114.72L339.04 114.98L340.43 115.25L341.81 115.54L343.17 115.85L344.51 116.18L345.84 116.52L347.14 116.89L348.43 117.27L349.69 117.67L350.93 118.09L352.15 118.52L353.35 118.98L354.51 119.44L355.66 119.93L356.77 120.43L357.86 120.94L358.91 121.47L359.94 122.01L360.94 122.57L361.91 123.14L362.84 123.72L363.74 124.32L364.61 124.93L365.45 125.55L366.25 126.18L367.02 126.82L367.75 127.48L368.44 128.14L369.1 128.81L369.72 129.49L370.3 130.18L370.84 130.88L371.35 131.58L371.81 132.29L372.24 133.01L372.63 133.73L372.98 134.46L373.28 135.19L373.55 135.93L373.78 136.67L373.96 137.41L374.1 138.16L374.21 138.9L374.27 139.65L374.29 140.4Z\"/></g><g class=\"iso-solid\" data-p=\"50\" data-name=\"spring.coil1\" data-mat=\"copper\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M372.12 139.83L372.1 140.58L372.03 141.32L371.93 142.06L371.78 142.8L371.59 143.54L371.36 144.28L371.08 145.01L370.76 145.74L370.41 146.46L370.01 147.17L369.57 147.89L369.09 148.59L368.57 149.29L368.01 149.98L367.41 150.66L366.77 151.33L366.1 151.99L365.38 152.65L364.63 153.29L363.84 153.92L363.02 154.54L362.16 155.15L361.27 155.75L360.35 156.33L359.39 156.9L358.4 157.45L357.38 157.99L356.32 158.52L355.24 159.03L354.13 159.53L352.99 160.01L351.83 160.47L350.63 160.92L349.42 161.34L348.18 161.76L346.91 162.15L345.63 162.52L344.32 162.88L343 163.22L341.65 163.54L340.29 163.84L338.91 164.12L337.51 164.38L336.11 164.62L334.68 164.84L333.25 165.04L331.8 165.21L330.35 165.37L328.89 165.51L327.42 165.63L325.94 165.72L324.46 165.8L322.98 165.85L321.49 165.88L320 165.89L318.51 165.88L317.02 165.85L315.54 165.8L314.06 165.72L312.58 165.63L311.11 165.51L309.65 165.37L308.2 165.21L306.75 165.04L305.32 164.84L303.89 164.62L302.49 164.38L301.09 164.12L299.71 163.84L298.35 163.54L297 163.22L295.68 162.88L294.37 162.52L293.09 162.15L291.82 161.76L290.58 161.34L289.37 160.92L288.17 160.47L287.01 160.01L285.87 159.53L284.76 159.03L283.68 158.52L282.62 157.99L281.6 157.45L280.61 156.9L279.65 156.33L278.73 155.75L277.84 155.15L276.98 154.54L276.16 153.92L275.37 153.29L274.62 152.65L273.9 151.99L273.23 151.33L272.59 150.66L271.99 149.98L271.43 149.29L270.91 148.59L270.43 147.89L269.99 147.17L269.59 146.46L269.24 145.74L268.92 145.01L268.64 144.28L268.41 143.54L268.22 142.8L268.07 142.06L267.97 141.32L267.9 140.58L267.88 139.83L267.88 137.01L267.9 136.27L267.97 135.52L268.07 134.78L268.22 134.04L268.41 133.3L268.64 132.57L268.92 131.84L269.24 131.11L269.59 130.39L269.99 129.67L270.43 128.96L270.91 128.25L271.43 127.56L271.99 126.87L272.59 126.19L273.23 125.51L273.9 124.85L274.62 124.2L275.37 123.55L276.16 122.92L276.98 122.3L277.84 121.69L278.73 121.1L279.65 120.52L280.61 119.95L281.6 119.39L282.62 118.85L283.68 118.32L284.76 117.81L285.87 117.32L287.01 116.84L288.17 116.38L289.37 115.93L290.58 115.5L291.82 115.09L293.09 114.7L294.37 114.32L295.68 113.96L297 113.63L298.35 113.31L299.71 113.01L301.09 112.73L302.49 112.47L303.89 112.23L305.32 112.01L306.75 111.81L308.2 111.63L309.65 111.47L311.11 111.33L312.58 111.22L314.06 111.12L315.54 111.05L317.02 111L318.51 110.96L320 110.95L321.49 110.96L322.98 111L324.46 111.05L325.94 111.12L327.42 111.22L328.89 111.33L330.35 111.47L331.8 111.63L333.25 111.81L334.68 112.01L336.11 112.23L337.51 112.47L338.91 112.73L340.29 113.01L341.65 113.31L343 113.63L344.32 113.96L345.63 114.32L346.91 114.7L348.18 115.09L349.42 115.5L350.63 115.93L351.83 116.38L352.99 116.84L354.13 117.32L355.24 117.81L356.32 118.32L357.38 118.85L358.4 119.39L359.39 119.95L360.35 120.52L361.27 121.1L362.16 121.69L363.02 122.3L363.84 122.92L364.63 123.55L365.38 124.2L366.1 124.85L366.77 125.51L367.41 126.19L368.01 126.87L368.57 127.56L369.09 128.25L369.57 128.96L370.01 129.67L370.41 130.39L370.76 131.11L371.08 131.84L371.36 132.57L371.59 133.3L371.78 134.04L371.93 134.78L372.03 135.52L372.1 136.27L372.12 137.01Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M372.12 139.83L372.01 141.54L371.67 143.23L371.12 144.92L370.34 146.58L369.35 148.21L368.15 149.81L366.74 151.36L365.14 152.86L363.33 154.31L361.35 155.7L359.18 157.01L356.85 158.26L354.36 159.43L351.73 160.51L348.96 161.5L346.06 162.4L343.05 163.2L339.94 163.91L336.75 164.51L333.49 165L330.17 165.39L326.8 165.67L323.41 165.84L320 165.89L320 163.07L323.41 163.02L326.8 162.85L330.17 162.57L333.49 162.18L336.75 161.69L339.94 161.09L343.05 160.38L346.06 159.58L348.96 158.68L351.73 157.69L354.36 156.6L356.85 155.44L359.18 154.19L361.35 152.88L363.33 151.49L365.14 150.04L366.74 148.54L368.15 146.98L369.35 145.39L370.34 143.76L371.12 142.1L371.67 140.41L372.01 138.72L372.12 137.01Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M320 165.89L316.69 165.84L313.39 165.68L310.12 165.42L306.89 165.05L303.72 164.59L303.72 161.77L306.89 162.23L310.12 162.6L313.39 162.86L316.69 163.02L320 163.07Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M303.72 164.59L300.93 164.09L298.21 163.5L295.55 162.85L292.98 162.12L290.49 161.31L288.1 160.44L285.81 159.5L285.81 156.68L288.1 157.62L290.49 158.49L292.98 159.29L295.55 160.03L298.21 160.68L300.93 161.26L303.72 161.77Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M285.81 159.5L283.5 158.43L281.32 157.3L279.28 156.1L277.4 154.84L275.66 153.53L274.09 152.17L272.69 150.76L271.46 149.32L270.4 147.83L269.52 146.32L269.52 143.5L270.4 145.01L271.46 146.5L272.69 147.94L274.09 149.35L275.66 150.71L277.4 152.02L279.28 153.28L281.32 154.48L283.5 155.61L285.81 156.68Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M269.52 146.32L268.81 144.72L268.29 143.1L267.98 141.47L267.88 139.83L267.88 137.01L267.98 138.65L268.29 140.28L268.81 141.9L269.52 143.5Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M356.85 155.44L355.38 156.15L353.85 156.83L352.27 157.48L350.63 158.09L348.96 158.68L347.23 159.23L345.47 159.75L343.66 160.23L341.82 160.68L339.94 161.09L338.04 161.46L336.11 161.8L334.15 162.09L332.17 162.35L330.17 162.57L328.15 162.75L326.13 162.89L324.09 162.99L322.05 163.05L320 163.07L317.95 163.05L315.91 162.99L313.87 162.89L311.85 162.75L309.83 162.57L307.83 162.35L305.85 162.09L303.89 161.8L301.96 161.46L300.06 161.09L298.18 160.68L296.34 160.23L294.53 159.75L292.77 159.23L291.04 158.68L289.37 158.09L287.73 157.48L286.15 156.83L284.62 156.15L283.15 155.44L281.73 154.7L280.37 153.94L279.07 153.14L277.84 152.33L276.67 151.49L275.56 150.63L274.53 149.74L273.56 148.84L272.67 147.92L271.85 146.98L271.1 146.03L270.43 145.06L269.84 144.09L269.32 143.1L268.88 142.1L268.52 141.09L268.24 140.07L268.04 139.06L267.92 138.03L267.88 137.01L267.92 135.99L268.04 134.97L268.24 133.95L268.52 132.94L268.88 131.93L269.32 130.93L269.84 129.94L270.43 128.96L271.1 127.99L271.85 127.04L272.67 126.1L273.56 125.18L274.53 124.28L275.56 123.4L276.67 122.53L277.84 121.69L279.07 120.88L280.37 120.09L281.73 119.32L283.15 118.59L284.62 117.88L286.15 117.2L287.73 116.55L289.37 115.93L291.04 115.34L292.77 114.79L294.53 114.28L296.34 113.79L298.18 113.35L300.06 112.94L301.96 112.56L303.89 112.23L305.85 111.93L307.83 111.67L309.83 111.45L311.85 111.27L313.87 111.13L315.91 111.03L317.95 110.97L320 110.95L322.05 110.97L324.09 111.03L326.13 111.13L328.15 111.27L330.17 111.45L332.17 111.67L334.15 111.93L336.11 112.23L338.04 112.56L339.94 112.94L341.82 113.35L343.66 113.79L345.47 114.28L347.23 114.79L348.96 115.34L350.63 115.93L352.27 116.55L353.85 117.2L355.38 117.88L356.85 118.59L358.27 119.32L359.63 120.09L360.93 120.88L362.16 121.69L363.33 122.53L364.44 123.4L365.47 124.28L366.44 125.18L367.33 126.1L368.15 127.04L368.9 127.99L369.57 128.96L370.16 129.94L370.68 130.93L371.12 131.93L371.48 132.94L371.76 133.95L371.96 134.97L372.08 135.99L372.12 137.01L372.08 138.03L371.96 139.06L371.76 140.07L371.48 141.09L371.12 142.1L370.68 143.1L370.16 144.09L369.57 145.06L368.9 146.03L368.15 146.98L367.33 147.92L366.44 148.84L365.47 149.74L364.44 150.63L363.33 151.49L362.16 152.33L360.93 153.14L359.63 153.94L358.27 154.7Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M372.12 137.01L372.1 137.76L372.03 138.5L371.93 139.24L371.78 139.98L371.59 140.72L371.36 141.46L371.08 142.19L370.76 142.91L370.41 143.64L370.01 144.35L369.57 145.06L369.09 145.77L368.57 146.47L368.01 147.16L367.41 147.84L366.77 148.51L366.1 149.17L365.38 149.83L364.63 150.47L363.84 151.1L363.02 151.72L362.16 152.33L361.27 152.92L360.35 153.51L359.39 154.08L358.4 154.63L357.38 155.17L356.32 155.7L355.24 156.21L354.13 156.71L352.99 157.19L351.83 157.65L350.63 158.09L349.42 158.52L348.18 158.93L346.91 159.33L345.63 159.7L344.32 160.06L343 160.4L341.65 160.72L340.29 161.02L338.91 161.3L337.51 161.56L336.11 161.8L334.68 162.02L333.25 162.21L331.8 162.39L330.35 162.55L328.89 162.69L327.42 162.81L325.94 162.9L324.46 162.98L322.98 163.03L321.49 163.06L320 163.07L318.51 163.06L317.02 163.03L315.54 162.98L314.06 162.9L312.58 162.81L311.11 162.69L309.65 162.55L308.2 162.39L306.75 162.21L305.32 162.02L303.89 161.8L302.49 161.56L301.09 161.3L299.71 161.02L298.35 160.72L297 160.4L295.68 160.06L294.37 159.7L293.09 159.33L291.82 158.93L290.58 158.52L289.37 158.09L288.17 157.65L287.01 157.19L285.87 156.71L284.76 156.21L283.68 155.7L282.62 155.17L281.6 154.63L280.61 154.08L279.65 153.51L278.73 152.92L277.84 152.33L276.98 151.72L276.16 151.1L275.37 150.47L274.62 149.83L273.9 149.17L273.23 148.51L272.59 147.84L271.99 147.16L271.43 146.47L270.91 145.77L270.43 145.06L269.99 144.35L269.59 143.64L269.24 142.91L268.92 142.19L268.64 141.46L268.41 140.72L268.22 139.98L268.07 139.24L267.97 138.5L267.9 137.76L267.88 137.01\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r0\" opacity=\"1\" d=\"M356.85 157.88L356.85 155.81M350.63 160.54L350.63 158.47M343.66 162.68L343.66 160.61M336.11 164.24L336.11 162.17M328.15 165.19L328.15 163.13M320 165.52L320 163.45M311.85 165.19L311.85 163.13M303.89 164.24L303.89 162.17M296.34 162.68L296.34 160.61M289.37 160.54L289.37 158.47M283.15 157.88L283.15 155.81\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r1\" opacity=\"0.969\" d=\"M277.84 154.77L277.84 152.71M362.16 154.77L362.16 152.71\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r2\" opacity=\"0.75\" d=\"M273.56 151.29L273.56 149.22M366.44 151.29L366.44 149.22\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r3\" opacity=\"0.344\" d=\"M270.43 147.51L270.43 145.44M369.57 147.51L369.57 145.44\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r4\" opacity=\"0.031\" d=\"M268.52 143.53L268.52 141.46M371.48 143.53L371.48 141.46\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r5\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r6\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r7\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r8\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r9\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r10\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r11\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r12\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r13\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r14\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M372.12 139.83L372.1 140.58L372.03 141.32L371.93 142.06L371.78 142.8L371.59 143.54L371.36 144.28L371.08 145.01L370.76 145.74L370.41 146.46L370.01 147.17L369.57 147.89L369.09 148.59L368.57 149.29L368.01 149.98L367.41 150.66L366.77 151.33L366.1 151.99L365.38 152.65L364.63 153.29L363.84 153.92L363.02 154.54L362.16 155.15L361.27 155.75L360.35 156.33L359.39 156.9L358.4 157.45L357.38 157.99L356.32 158.52L355.24 159.03L354.13 159.53L352.99 160.01L351.83 160.47L350.63 160.92L349.42 161.34L348.18 161.76L346.91 162.15L345.63 162.52L344.32 162.88L343 163.22L341.65 163.54L340.29 163.84L338.91 164.12L337.51 164.38L336.11 164.62L334.68 164.84L333.25 165.04L331.8 165.21L330.35 165.37L328.89 165.51L327.42 165.63L325.94 165.72L324.46 165.8L322.98 165.85L321.49 165.88L320 165.89L318.51 165.88L317.02 165.85L315.54 165.8L314.06 165.72L312.58 165.63L311.11 165.51L309.65 165.37L308.2 165.21L306.75 165.04L305.32 164.84L303.89 164.62L302.49 164.38L301.09 164.12L299.71 163.84L298.35 163.54L297 163.22L295.68 162.88L294.37 162.52L293.09 162.15L291.82 161.76L290.58 161.34L289.37 160.92L288.17 160.47L287.01 160.01L285.87 159.53L284.76 159.03L283.68 158.52L282.62 157.99L281.6 157.45L280.61 156.9L279.65 156.33L278.73 155.75L277.84 155.15L276.98 154.54L276.16 153.92L275.37 153.29L274.62 152.65L273.9 151.99L273.23 151.33L272.59 150.66L271.99 149.98L271.43 149.29L270.91 148.59L270.43 147.89L269.99 147.17L269.59 146.46L269.24 145.74L268.92 145.01L268.64 144.28L268.41 143.54L268.22 142.8L268.07 142.06L267.97 141.32L267.9 140.58L267.88 139.83L267.88 137.01L267.9 136.27L267.97 135.52L268.07 134.78L268.22 134.04L268.41 133.3L268.64 132.57L268.92 131.84L269.24 131.11L269.59 130.39L269.99 129.67L270.43 128.96L270.91 128.25L271.43 127.56L271.99 126.87L272.59 126.19L273.23 125.51L273.9 124.85L274.62 124.2L275.37 123.55L276.16 122.92L276.98 122.3L277.84 121.69L278.73 121.1L279.65 120.52L280.61 119.95L281.6 119.39L282.62 118.85L283.68 118.32L284.76 117.81L285.87 117.32L287.01 116.84L288.17 116.38L289.37 115.93L290.58 115.5L291.82 115.09L293.09 114.7L294.37 114.32L295.68 113.96L297 113.63L298.35 113.31L299.71 113.01L301.09 112.73L302.49 112.47L303.89 112.23L305.32 112.01L306.75 111.81L308.2 111.63L309.65 111.47L311.11 111.33L312.58 111.22L314.06 111.12L315.54 111.05L317.02 111L318.51 110.96L320 110.95L321.49 110.96L322.98 111L324.46 111.05L325.94 111.12L327.42 111.22L328.89 111.33L330.35 111.47L331.8 111.63L333.25 111.81L334.68 112.01L336.11 112.23L337.51 112.47L338.91 112.73L340.29 113.01L341.65 113.31L343 113.63L344.32 113.96L345.63 114.32L346.91 114.7L348.18 115.09L349.42 115.5L350.63 115.93L351.83 116.38L352.99 116.84L354.13 117.32L355.24 117.81L356.32 118.32L357.38 118.85L358.4 119.39L359.39 119.95L360.35 120.52L361.27 121.1L362.16 121.69L363.02 122.3L363.84 122.92L364.63 123.55L365.38 124.2L366.1 124.85L366.77 125.51L367.41 126.19L368.01 126.87L368.57 127.56L369.09 128.25L369.57 128.96L370.01 129.67L370.41 130.39L370.76 131.11L371.08 131.84L371.36 132.57L371.59 133.3L371.78 134.04L371.93 134.78L372.03 135.52L372.1 136.27L372.12 137.01Z\"/></g><g class=\"iso-solid\" data-p=\"51\" data-name=\"spring.coil2\" data-mat=\"copper\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M374.29 136.45L374.27 137.2L374.21 137.94L374.1 138.69L373.96 139.43L373.78 140.18L373.55 140.92L373.28 141.65L372.98 142.38L372.63 143.11L372.24 143.83L371.81 144.55L371.35 145.26L370.84 145.97L370.3 146.66L369.72 147.35L369.1 148.03L368.44 148.7L367.75 149.37L367.02 150.02L366.25 150.66L365.45 151.29L364.61 151.92L363.74 152.52L362.84 153.12L361.91 153.7L360.94 154.28L359.94 154.83L358.91 155.38L357.86 155.9L356.77 156.42L355.66 156.92L354.51 157.4L353.35 157.87L352.15 158.32L350.93 158.75L349.69 159.17L348.43 159.57L347.14 159.96L345.84 160.32L344.51 160.67L343.17 161L341.81 161.31L340.43 161.6L339.04 161.87L337.63 162.12L336.21 162.35L334.77 162.57L333.33 162.76L331.87 162.94L330.41 163.09L328.94 163.22L327.46 163.34L325.97 163.43L324.48 163.5L322.99 163.55L321.5 163.58L320 163.59L318.5 163.58L317.01 163.55L315.52 163.5L314.03 163.43L312.54 163.34L311.06 163.22L309.59 163.09L308.13 162.94L306.67 162.76L305.23 162.57L303.79 162.35L302.37 162.12L300.96 161.87L299.57 161.6L298.19 161.31L296.83 161L295.49 160.67L294.16 160.32L292.86 159.96L291.57 159.57L290.31 159.17L289.07 158.75L287.85 158.32L286.65 157.87L285.49 157.4L284.34 156.92L283.23 156.42L282.14 155.9L281.09 155.38L280.06 154.83L279.06 154.28L278.09 153.7L277.16 153.12L276.26 152.52L275.39 151.92L274.55 151.29L273.75 150.66L272.98 150.02L272.25 149.37L271.56 148.7L270.9 148.03L270.28 147.35L269.7 146.66L269.16 145.97L268.65 145.26L268.19 144.55L267.76 143.83L267.37 143.11L267.02 142.38L266.72 141.65L266.45 140.92L266.22 140.18L266.04 139.43L265.9 138.69L265.79 137.94L265.73 137.2L265.71 136.45L265.71 133.63L265.73 132.88L265.79 132.13L265.9 131.38L266.04 130.64L266.22 129.9L266.45 129.16L266.72 128.42L267.02 127.69L267.37 126.96L267.76 126.24L268.19 125.52L268.65 124.81L269.16 124.11L269.7 123.41L270.28 122.72L270.9 122.04L271.56 121.37L272.25 120.71L272.98 120.05L273.75 119.41L274.55 118.78L275.39 118.16L276.26 117.55L277.16 116.95L278.09 116.37L279.06 115.8L280.06 115.24L281.09 114.7L282.14 114.17L283.23 113.66L284.34 113.16L285.49 112.67L286.65 112.21L287.85 111.75L289.07 111.32L290.31 110.9L291.57 110.5L292.86 110.12L294.16 109.75L295.49 109.41L296.83 109.08L298.19 108.77L299.57 108.48L300.96 108.2L302.37 107.95L303.79 107.72L305.23 107.51L306.67 107.31L308.13 107.14L309.59 106.99L311.06 106.85L312.54 106.74L314.03 106.65L315.52 106.57L317.01 106.52L318.5 106.49L320 106.48L321.5 106.49L322.99 106.52L324.48 106.57L325.97 106.65L327.46 106.74L328.94 106.85L330.41 106.99L331.87 107.14L333.33 107.31L334.77 107.51L336.21 107.72L337.63 107.95L339.04 108.2L340.43 108.48L341.81 108.77L343.17 109.08L344.51 109.41L345.84 109.75L347.14 110.12L348.43 110.5L349.69 110.9L350.93 111.32L352.15 111.75L353.35 112.21L354.51 112.67L355.66 113.16L356.77 113.66L357.86 114.17L358.91 114.7L359.94 115.24L360.94 115.8L361.91 116.37L362.84 116.95L363.74 117.55L364.61 118.16L365.45 118.78L366.25 119.41L367.02 120.05L367.75 120.71L368.44 121.37L369.1 122.04L369.72 122.72L370.3 123.41L370.84 124.11L371.35 124.81L371.81 125.52L372.24 126.24L372.63 126.96L372.98 127.69L373.28 128.42L373.55 129.16L373.78 129.9L373.96 130.64L374.1 131.38L374.21 132.13L374.27 132.88L374.29 133.63Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M374.29 136.45L374.17 138.22L373.83 139.99L373.25 141.74L372.44 143.47L371.41 145.17L370.16 146.84L368.69 148.45L367.02 150.02L365.14 151.53L363.07 152.97L360.82 154.35L358.39 155.64L355.8 156.86L353.05 157.98L350.16 159.02L347.14 159.96L344.01 160.79L340.78 161.53L337.45 162.15L334.05 162.67L330.59 163.07L327.09 163.36L323.55 163.53L320 163.59L320 160.77L323.55 160.71L327.09 160.54L330.59 160.25L334.05 159.85L337.45 159.33L340.78 158.71L344.01 157.97L347.14 157.13L350.16 156.2L353.05 155.16L355.8 154.04L358.39 152.82L360.82 151.52L363.07 150.15L365.14 148.71L367.02 147.2L368.69 145.63L370.16 144.01L371.41 142.35L372.44 140.65L373.25 138.92L373.83 137.17L374.17 135.4L374.29 133.63Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M320 163.59L316.55 163.54L313.12 163.37L309.71 163.1L306.35 162.72L303.04 162.23L303.04 159.41L306.35 159.9L309.71 160.28L313.12 160.55L316.55 160.72L320 160.77Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M303.04 162.23L300.14 161.71L297.3 161.11L294.53 160.42L291.85 159.66L289.26 158.82L286.77 157.91L284.38 156.93L284.38 154.11L286.77 155.09L289.26 156L291.85 156.84L294.53 157.6L297.3 158.28L300.14 158.89L303.04 159.41Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M284.38 156.93L281.98 155.82L279.71 154.64L277.59 153.39L275.62 152.08L273.82 150.72L272.18 149.3L270.72 147.83L269.43 146.33L268.33 144.78L267.42 143.21L267.42 140.39L268.33 141.96L269.43 143.5L270.72 145.01L272.18 146.48L273.82 147.9L275.62 149.26L277.59 150.57L279.71 151.82L281.98 153L284.38 154.11Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M267.42 143.21L266.68 141.54L266.14 139.86L265.82 138.16L265.71 136.45L265.71 133.63L265.82 135.33L266.14 137.03L266.68 138.72L267.42 140.39Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M358.39 152.82L356.85 153.56L355.26 154.27L353.61 154.94L351.91 155.59L350.16 156.2L348.37 156.77L346.53 157.31L344.65 157.81L342.73 158.28L340.78 158.71L338.79 159.09L336.78 159.44L334.74 159.75L332.67 160.02L330.59 160.25L328.49 160.44L326.38 160.58L324.26 160.69L322.13 160.75L320 160.77L317.87 160.75L315.74 160.69L313.62 160.58L311.51 160.44L309.41 160.25L307.33 160.02L305.26 159.75L303.22 159.44L301.21 159.09L299.22 158.71L297.27 158.28L295.35 157.81L293.47 157.31L291.63 156.77L289.84 156.2L288.09 155.59L286.39 154.94L284.74 154.27L283.15 153.56L281.61 152.82L280.13 152.05L278.72 151.26L277.37 150.43L276.08 149.58L274.86 148.71L273.71 147.81L272.63 146.89L271.63 145.95L270.7 144.99L269.84 144.01L269.07 143.02L268.37 142.01L267.75 140.99L267.21 139.96L266.75 138.92L266.38 137.87L266.09 136.82L265.88 135.76L265.75 134.69L265.71 133.63L265.75 132.56L265.88 131.5L266.09 130.44L266.38 129.38L266.75 128.33L267.21 127.29L267.75 126.26L268.37 125.24L269.07 124.23L269.84 123.24L270.7 122.26L271.63 121.3L272.63 120.36L273.71 119.44L274.86 118.55L276.08 117.67L277.37 116.82L278.72 116L280.13 115.2L281.61 114.43L283.15 113.69L284.74 112.99L286.39 112.31L288.09 111.67L289.84 111.06L291.63 110.48L293.47 109.94L295.35 109.44L297.27 108.98L299.22 108.55L301.21 108.16L303.22 107.81L305.26 107.5L307.33 107.23L309.41 107L311.51 106.82L313.62 106.67L315.74 106.57L317.87 106.5L320 106.48L322.13 106.5L324.26 106.57L326.38 106.67L328.49 106.82L330.59 107L332.67 107.23L334.74 107.5L336.78 107.81L338.79 108.16L340.78 108.55L342.73 108.98L344.65 109.44L346.53 109.94L348.37 110.48L350.16 111.06L351.91 111.67L353.61 112.31L355.26 112.99L356.85 113.69L358.39 114.43L359.87 115.2L361.28 116L362.63 116.82L363.92 117.67L365.14 118.55L366.29 119.44L367.37 120.36L368.37 121.3L369.3 122.26L370.16 123.24L370.93 124.23L371.63 125.24L372.25 126.26L372.79 127.29L373.25 128.33L373.62 129.38L373.91 130.44L374.12 131.5L374.25 132.56L374.29 133.63L374.25 134.69L374.12 135.76L373.91 136.82L373.62 137.87L373.25 138.92L372.79 139.96L372.25 140.99L371.63 142.01L370.93 143.02L370.16 144.01L369.3 144.99L368.37 145.95L367.37 146.89L366.29 147.81L365.14 148.71L363.92 149.58L362.63 150.43L361.28 151.26L359.87 152.05Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M374.29 133.63L374.27 134.37L374.21 135.12L374.1 135.87L373.96 136.61L373.78 137.36L373.55 138.09L373.28 138.83L372.98 139.56L372.63 140.29L372.24 141.01L371.81 141.73L371.35 142.44L370.84 143.14L370.3 143.84L369.72 144.53L369.1 145.21L368.44 145.88L367.75 146.55L367.02 147.2L366.25 147.84L365.45 148.47L364.61 149.09L363.74 149.7L362.84 150.3L361.91 150.88L360.94 151.45L359.94 152.01L358.91 152.55L357.86 153.08L356.77 153.6L355.66 154.1L354.51 154.58L353.35 155.05L352.15 155.5L350.93 155.93L349.69 156.35L348.43 156.75L347.14 157.13L345.84 157.5L344.51 157.85L343.17 158.18L341.81 158.49L340.43 158.78L339.04 159.05L337.63 159.3L336.21 159.53L334.77 159.75L333.33 159.94L331.87 160.11L330.41 160.27L328.94 160.4L327.46 160.51L325.97 160.61L324.48 160.68L322.99 160.73L321.5 160.76L320 160.77L318.5 160.76L317.01 160.73L315.52 160.68L314.03 160.61L312.54 160.51L311.06 160.4L309.59 160.27L308.13 160.11L306.67 159.94L305.23 159.75L303.79 159.53L302.37 159.3L300.96 159.05L299.57 158.78L298.19 158.49L296.83 158.18L295.49 157.85L294.16 157.5L292.86 157.13L291.57 156.75L290.31 156.35L289.07 155.93L287.85 155.5L286.65 155.05L285.49 154.58L284.34 154.1L283.23 153.6L282.14 153.08L281.09 152.55L280.06 152.01L279.06 151.45L278.09 150.88L277.16 150.3L276.26 149.7L275.39 149.09L274.55 148.47L273.75 147.84L272.98 147.2L272.25 146.55L271.56 145.88L270.9 145.21L270.28 144.53L269.7 143.84L269.16 143.14L268.65 142.44L268.19 141.73L267.76 141.01L267.37 140.29L267.02 139.56L266.72 138.83L266.45 138.09L266.22 137.36L266.04 136.61L265.9 135.87L265.79 135.12L265.73 134.37L265.71 133.63\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r0\" opacity=\"1\" d=\"M358.39 155.27L358.39 153.2M351.91 158.03L351.91 155.96M344.65 160.26L344.65 158.19M336.78 161.89L336.78 159.82M328.49 162.88L328.49 160.81M320 163.22L320 161.15M311.51 162.88L311.51 160.81M303.22 161.89L303.22 159.82M295.35 160.26L295.35 158.19M288.09 158.03L288.09 155.96M281.61 155.27L281.61 153.2\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r1\" opacity=\"0.969\" d=\"M276.08 152.03L276.08 149.96M363.92 152.03L363.92 149.96\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r2\" opacity=\"0.75\" d=\"M271.63 148.4L271.63 146.33M368.37 148.4L368.37 146.33\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r3\" opacity=\"0.344\" d=\"M268.37 144.46L268.37 142.39M371.63 144.46L371.63 142.39\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r4\" opacity=\"0.031\" d=\"M266.38 140.32L266.38 138.25M373.62 140.32L373.62 138.25\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r5\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r6\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r7\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r8\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r9\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r10\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r11\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r12\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r13\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r14\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M374.29 136.45L374.27 137.2L374.21 137.94L374.1 138.69L373.96 139.43L373.78 140.18L373.55 140.92L373.28 141.65L372.98 142.38L372.63 143.11L372.24 143.83L371.81 144.55L371.35 145.26L370.84 145.97L370.3 146.66L369.72 147.35L369.1 148.03L368.44 148.7L367.75 149.37L367.02 150.02L366.25 150.66L365.45 151.29L364.61 151.92L363.74 152.52L362.84 153.12L361.91 153.7L360.94 154.28L359.94 154.83L358.91 155.38L357.86 155.9L356.77 156.42L355.66 156.92L354.51 157.4L353.35 157.87L352.15 158.32L350.93 158.75L349.69 159.17L348.43 159.57L347.14 159.96L345.84 160.32L344.51 160.67L343.17 161L341.81 161.31L340.43 161.6L339.04 161.87L337.63 162.12L336.21 162.35L334.77 162.57L333.33 162.76L331.87 162.94L330.41 163.09L328.94 163.22L327.46 163.34L325.97 163.43L324.48 163.5L322.99 163.55L321.5 163.58L320 163.59L318.5 163.58L317.01 163.55L315.52 163.5L314.03 163.43L312.54 163.34L311.06 163.22L309.59 163.09L308.13 162.94L306.67 162.76L305.23 162.57L303.79 162.35L302.37 162.12L300.96 161.87L299.57 161.6L298.19 161.31L296.83 161L295.49 160.67L294.16 160.32L292.86 159.96L291.57 159.57L290.31 159.17L289.07 158.75L287.85 158.32L286.65 157.87L285.49 157.4L284.34 156.92L283.23 156.42L282.14 155.9L281.09 155.38L280.06 154.83L279.06 154.28L278.09 153.7L277.16 153.12L276.26 152.52L275.39 151.92L274.55 151.29L273.75 150.66L272.98 150.02L272.25 149.37L271.56 148.7L270.9 148.03L270.28 147.35L269.7 146.66L269.16 145.97L268.65 145.26L268.19 144.55L267.76 143.83L267.37 143.11L267.02 142.38L266.72 141.65L266.45 140.92L266.22 140.18L266.04 139.43L265.9 138.69L265.79 137.94L265.73 137.2L265.71 136.45L265.71 133.63L265.73 132.88L265.79 132.13L265.9 131.38L266.04 130.64L266.22 129.9L266.45 129.16L266.72 128.42L267.02 127.69L267.37 126.96L267.76 126.24L268.19 125.52L268.65 124.81L269.16 124.11L269.7 123.41L270.28 122.72L270.9 122.04L271.56 121.37L272.25 120.71L272.98 120.05L273.75 119.41L274.55 118.78L275.39 118.16L276.26 117.55L277.16 116.95L278.09 116.37L279.06 115.8L280.06 115.24L281.09 114.7L282.14 114.17L283.23 113.66L284.34 113.16L285.49 112.67L286.65 112.21L287.85 111.75L289.07 111.32L290.31 110.9L291.57 110.5L292.86 110.12L294.16 109.75L295.49 109.41L296.83 109.08L298.19 108.77L299.57 108.48L300.96 108.2L302.37 107.95L303.79 107.72L305.23 107.51L306.67 107.31L308.13 107.14L309.59 106.99L311.06 106.85L312.54 106.74L314.03 106.65L315.52 106.57L317.01 106.52L318.5 106.49L320 106.48L321.5 106.49L322.99 106.52L324.48 106.57L325.97 106.65L327.46 106.74L328.94 106.85L330.41 106.99L331.87 107.14L333.33 107.31L334.77 107.51L336.21 107.72L337.63 107.95L339.04 108.2L340.43 108.48L341.81 108.77L343.17 109.08L344.51 109.41L345.84 109.75L347.14 110.12L348.43 110.5L349.69 110.9L350.93 111.32L352.15 111.75L353.35 112.21L354.51 112.67L355.66 113.16L356.77 113.66L357.86 114.17L358.91 114.7L359.94 115.24L360.94 115.8L361.91 116.37L362.84 116.95L363.74 117.55L364.61 118.16L365.45 118.78L366.25 119.41L367.02 120.05L367.75 120.71L368.44 121.37L369.1 122.04L369.72 122.72L370.3 123.41L370.84 124.11L371.35 124.81L371.81 125.52L372.24 126.24L372.63 126.96L372.98 127.69L373.28 128.42L373.55 129.16L373.78 129.9L373.96 130.64L374.1 131.38L374.21 132.13L374.27 132.88L374.29 133.63Z\"/></g><g class=\"iso-solid\" data-p=\"52\" data-name=\"spring.coil3\" data-mat=\"copper\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M372.12 133.06L372.1 133.81L372.03 134.55L371.93 135.29L371.78 136.03L371.59 136.77L371.36 137.51L371.08 138.24L370.76 138.96L370.41 139.69L370.01 140.4L369.57 141.12L369.09 141.82L368.57 142.52L368.01 143.21L367.41 143.89L366.77 144.56L366.1 145.22L365.38 145.88L364.63 146.52L363.84 147.15L363.02 147.77L362.16 148.38L361.27 148.98L360.35 149.56L359.39 150.13L358.4 150.68L357.38 151.22L356.32 151.75L355.24 152.26L354.13 152.76L352.99 153.24L351.83 153.7L350.63 154.14L349.42 154.57L348.18 154.98L346.91 155.38L345.63 155.75L344.32 156.11L343 156.45L341.65 156.77L340.29 157.07L338.91 157.35L337.51 157.61L336.11 157.85L334.68 158.07L333.25 158.27L331.8 158.44L330.35 158.6L328.89 158.74L327.42 158.86L325.94 158.95L324.46 159.03L322.98 159.08L321.49 159.11L320 159.12L318.51 159.11L317.02 159.08L315.54 159.03L314.06 158.95L312.58 158.86L311.11 158.74L309.65 158.6L308.2 158.44L306.75 158.27L305.32 158.07L303.89 157.85L302.49 157.61L301.09 157.35L299.71 157.07L298.35 156.77L297 156.45L295.68 156.11L294.37 155.75L293.09 155.38L291.82 154.98L290.58 154.57L289.37 154.14L288.17 153.7L287.01 153.24L285.87 152.76L284.76 152.26L283.68 151.75L282.62 151.22L281.6 150.68L280.61 150.13L279.65 149.56L278.73 148.98L277.84 148.38L276.98 147.77L276.16 147.15L275.37 146.52L274.62 145.88L273.9 145.22L273.23 144.56L272.59 143.89L271.99 143.21L271.43 142.52L270.91 141.82L270.43 141.12L269.99 140.4L269.59 139.69L269.24 138.96L268.92 138.24L268.64 137.51L268.41 136.77L268.22 136.03L268.07 135.29L267.97 134.55L267.9 133.81L267.88 133.06L267.88 130.24L267.9 129.5L267.97 128.75L268.07 128.01L268.22 127.27L268.41 126.53L268.64 125.8L268.92 125.07L269.24 124.34L269.59 123.62L269.99 122.9L270.43 122.19L270.91 121.48L271.43 120.79L271.99 120.1L272.59 119.42L273.23 118.74L273.9 118.08L274.62 117.43L275.37 116.78L276.16 116.15L276.98 115.53L277.84 114.92L278.73 114.33L279.65 113.75L280.61 113.18L281.6 112.62L282.62 112.08L283.68 111.55L284.76 111.04L285.87 110.55L287.01 110.07L288.17 109.61L289.37 109.16L290.58 108.73L291.82 108.32L293.09 107.93L294.37 107.55L295.68 107.19L297 106.86L298.35 106.54L299.71 106.24L301.09 105.96L302.49 105.7L303.89 105.46L305.32 105.24L306.75 105.04L308.2 104.86L309.65 104.7L311.11 104.56L312.58 104.45L314.06 104.35L315.54 104.28L317.02 104.22L318.51 104.19L320 104.18L321.49 104.19L322.98 104.22L324.46 104.28L325.94 104.35L327.42 104.45L328.89 104.56L330.35 104.7L331.8 104.86L333.25 105.04L334.68 105.24L336.11 105.46L337.51 105.7L338.91 105.96L340.29 106.24L341.65 106.54L343 106.86L344.32 107.19L345.63 107.55L346.91 107.93L348.18 108.32L349.42 108.73L350.63 109.16L351.83 109.61L352.99 110.07L354.13 110.55L355.24 111.04L356.32 111.55L357.38 112.08L358.4 112.62L359.39 113.18L360.35 113.75L361.27 114.33L362.16 114.92L363.02 115.53L363.84 116.15L364.63 116.78L365.38 117.43L366.1 118.08L366.77 118.74L367.41 119.42L368.01 120.1L368.57 120.79L369.09 121.48L369.57 122.19L370.01 122.9L370.41 123.62L370.76 124.34L371.08 125.07L371.36 125.8L371.59 126.53L371.78 127.27L371.93 128.01L372.03 128.75L372.1 129.5L372.12 130.24Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M372.12 133.06L372.01 134.77L371.67 136.46L371.12 138.15L370.34 139.81L369.35 141.44L368.15 143.03L366.74 144.59L365.14 146.09L363.33 147.54L361.35 148.93L359.18 150.24L356.85 151.49L354.36 152.65L351.73 153.74L348.96 154.73L346.06 155.63L343.05 156.43L339.94 157.14L336.75 157.74L333.49 158.23L330.17 158.62L326.8 158.9L323.41 159.07L320 159.12L320 156.3L323.41 156.24L326.8 156.08L330.17 155.8L333.49 155.41L336.75 154.92L339.94 154.32L343.05 153.61L346.06 152.81L348.96 151.91L351.73 150.92L354.36 149.83L356.85 148.67L359.18 147.42L361.35 146.11L363.33 144.72L365.14 143.27L366.74 141.77L368.15 140.21L369.35 138.62L370.34 136.99L371.12 135.33L371.67 133.64L372.01 131.95L372.12 130.24Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M320 159.12L316.69 159.07L313.39 158.91L310.12 158.65L306.89 158.28L303.72 157.82L303.72 155L306.89 155.46L310.12 155.83L313.39 156.09L316.69 156.25L320 156.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M303.72 157.82L300.93 157.31L298.21 156.73L295.55 156.08L292.98 155.35L290.49 154.54L288.1 153.67L285.81 152.73L285.81 149.91L288.1 150.85L290.49 151.72L292.98 152.52L295.55 153.26L298.21 153.91L300.93 154.49L303.72 155Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M285.81 152.73L283.5 151.66L281.32 150.53L279.28 149.33L277.4 148.07L275.66 146.76L274.09 145.4L272.69 143.99L271.46 142.55L270.4 141.06L269.52 139.55L269.52 136.73L270.4 138.24L271.46 139.72L272.69 141.17L274.09 142.58L275.66 143.94L277.4 145.25L279.28 146.51L281.32 147.71L283.5 148.84L285.81 149.91Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M269.52 139.55L268.81 137.95L268.29 136.33L267.98 134.7L267.88 133.06L267.88 130.24L267.98 131.88L268.29 133.51L268.81 135.13L269.52 136.73Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M356.85 148.67L355.38 149.38L353.85 150.06L352.27 150.71L350.63 151.32L348.96 151.91L347.23 152.46L345.47 152.98L343.66 153.46L341.82 153.91L339.94 154.32L338.04 154.69L336.11 155.03L334.15 155.32L332.17 155.58L330.17 155.8L328.15 155.98L326.13 156.12L324.09 156.22L322.05 156.28L320 156.3L317.95 156.28L315.91 156.22L313.87 156.12L311.85 155.98L309.83 155.8L307.83 155.58L305.85 155.32L303.89 155.03L301.96 154.69L300.06 154.32L298.18 153.91L296.34 153.46L294.53 152.98L292.77 152.46L291.04 151.91L289.37 151.32L287.73 150.71L286.15 150.06L284.62 149.38L283.15 148.67L281.73 147.93L280.37 147.17L279.07 146.37L277.84 145.56L276.67 144.72L275.56 143.86L274.53 142.97L273.56 142.07L272.67 141.15L271.85 140.21L271.1 139.26L270.43 138.29L269.84 137.31L269.32 136.32L268.88 135.33L268.52 134.32L268.24 133.3L268.04 132.29L267.92 131.26L267.88 130.24L267.92 129.22L268.04 128.2L268.24 127.18L268.52 126.16L268.88 125.16L269.32 124.16L269.84 123.17L270.43 122.19L271.1 121.22L271.85 120.27L272.67 119.33L273.56 118.41L274.53 117.51L275.56 116.63L276.67 115.76L277.84 114.92L279.07 114.11L280.37 113.32L281.73 112.55L283.15 111.81L284.62 111.11L286.15 110.43L287.73 109.78L289.37 109.16L291.04 108.57L292.77 108.02L294.53 107.5L296.34 107.02L298.18 106.58L300.06 106.17L301.96 105.79L303.89 105.46L305.85 105.16L307.83 104.9L309.83 104.68L311.85 104.5L313.87 104.36L315.91 104.26L317.95 104.2L320 104.18L322.05 104.2L324.09 104.26L326.13 104.36L328.15 104.5L330.17 104.68L332.17 104.9L334.15 105.16L336.11 105.46L338.04 105.79L339.94 106.17L341.82 106.58L343.66 107.02L345.47 107.5L347.23 108.02L348.96 108.57L350.63 109.16L352.27 109.78L353.85 110.43L355.38 111.11L356.85 111.81L358.27 112.55L359.63 113.32L360.93 114.11L362.16 114.92L363.33 115.76L364.44 116.63L365.47 117.51L366.44 118.41L367.33 119.33L368.15 120.27L368.9 121.22L369.57 122.19L370.16 123.17L370.68 124.16L371.12 125.16L371.48 126.16L371.76 127.18L371.96 128.2L372.08 129.22L372.12 130.24L372.08 131.26L371.96 132.29L371.76 133.3L371.48 134.32L371.12 135.33L370.68 136.32L370.16 137.31L369.57 138.29L368.9 139.26L368.15 140.21L367.33 141.15L366.44 142.07L365.47 142.97L364.44 143.86L363.33 144.72L362.16 145.56L360.93 146.37L359.63 147.17L358.27 147.93Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M372.12 130.24L372.1 130.99L372.03 131.73L371.93 132.47L371.78 133.21L371.59 133.95L371.36 134.69L371.08 135.42L370.76 136.14L370.41 136.87L370.01 137.58L369.57 138.29L369.09 139L368.57 139.7L368.01 140.39L367.41 141.07L366.77 141.74L366.1 142.4L365.38 143.06L364.63 143.7L363.84 144.33L363.02 144.95L362.16 145.56L361.27 146.15L360.35 146.74L359.39 147.31L358.4 147.86L357.38 148.4L356.32 148.93L355.24 149.44L354.13 149.94L352.99 150.41L351.83 150.88L350.63 151.32L349.42 151.75L348.18 152.16L346.91 152.56L345.63 152.93L344.32 153.29L343 153.63L341.65 153.95L340.29 154.25L338.91 154.53L337.51 154.79L336.11 155.03L334.68 155.24L333.25 155.44L331.8 155.62L330.35 155.78L328.89 155.92L327.42 156.04L325.94 156.13L324.46 156.2L322.98 156.26L321.49 156.29L320 156.3L318.51 156.29L317.02 156.26L315.54 156.2L314.06 156.13L312.58 156.04L311.11 155.92L309.65 155.78L308.2 155.62L306.75 155.44L305.32 155.24L303.89 155.03L302.49 154.79L301.09 154.53L299.71 154.25L298.35 153.95L297 153.63L295.68 153.29L294.37 152.93L293.09 152.56L291.82 152.16L290.58 151.75L289.37 151.32L288.17 150.88L287.01 150.41L285.87 149.94L284.76 149.44L283.68 148.93L282.62 148.4L281.6 147.86L280.61 147.31L279.65 146.74L278.73 146.15L277.84 145.56L276.98 144.95L276.16 144.33L275.37 143.7L274.62 143.06L273.9 142.4L273.23 141.74L272.59 141.07L271.99 140.39L271.43 139.7L270.91 139L270.43 138.29L269.99 137.58L269.59 136.87L269.24 136.14L268.92 135.42L268.64 134.69L268.41 133.95L268.22 133.21L268.07 132.47L267.97 131.73L267.9 130.99L267.88 130.24\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r0\" opacity=\"1\" d=\"M356.85 151.11L356.85 149.04M350.63 153.77L350.63 151.7M343.66 155.91L343.66 153.84M336.11 157.47L336.11 155.4M328.15 158.42L328.15 156.36M320 158.75L320 156.68M311.85 158.42L311.85 156.36M303.89 157.47L303.89 155.4M296.34 155.91L296.34 153.84M289.37 153.77L289.37 151.7M283.15 151.11L283.15 149.04\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r1\" opacity=\"0.969\" d=\"M277.84 148L277.84 145.93M362.16 148L362.16 145.93\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r2\" opacity=\"0.75\" d=\"M273.56 144.52L273.56 142.45M366.44 144.52L366.44 142.45\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r3\" opacity=\"0.344\" d=\"M270.43 140.74L270.43 138.67M369.57 140.74L369.57 138.67\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r4\" opacity=\"0.031\" d=\"M268.52 136.76L268.52 134.69M371.48 136.76L371.48 134.69\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r5\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r6\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r7\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r8\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r9\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r10\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r11\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r12\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r13\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r14\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M372.12 133.06L372.1 133.81L372.03 134.55L371.93 135.29L371.78 136.03L371.59 136.77L371.36 137.51L371.08 138.24L370.76 138.96L370.41 139.69L370.01 140.4L369.57 141.12L369.09 141.82L368.57 142.52L368.01 143.21L367.41 143.89L366.77 144.56L366.1 145.22L365.38 145.88L364.63 146.52L363.84 147.15L363.02 147.77L362.16 148.38L361.27 148.98L360.35 149.56L359.39 150.13L358.4 150.68L357.38 151.22L356.32 151.75L355.24 152.26L354.13 152.76L352.99 153.24L351.83 153.7L350.63 154.14L349.42 154.57L348.18 154.98L346.91 155.38L345.63 155.75L344.32 156.11L343 156.45L341.65 156.77L340.29 157.07L338.91 157.35L337.51 157.61L336.11 157.85L334.68 158.07L333.25 158.27L331.8 158.44L330.35 158.6L328.89 158.74L327.42 158.86L325.94 158.95L324.46 159.03L322.98 159.08L321.49 159.11L320 159.12L318.51 159.11L317.02 159.08L315.54 159.03L314.06 158.95L312.58 158.86L311.11 158.74L309.65 158.6L308.2 158.44L306.75 158.27L305.32 158.07L303.89 157.85L302.49 157.61L301.09 157.35L299.71 157.07L298.35 156.77L297 156.45L295.68 156.11L294.37 155.75L293.09 155.38L291.82 154.98L290.58 154.57L289.37 154.14L288.17 153.7L287.01 153.24L285.87 152.76L284.76 152.26L283.68 151.75L282.62 151.22L281.6 150.68L280.61 150.13L279.65 149.56L278.73 148.98L277.84 148.38L276.98 147.77L276.16 147.15L275.37 146.52L274.62 145.88L273.9 145.22L273.23 144.56L272.59 143.89L271.99 143.21L271.43 142.52L270.91 141.82L270.43 141.12L269.99 140.4L269.59 139.69L269.24 138.96L268.92 138.24L268.64 137.51L268.41 136.77L268.22 136.03L268.07 135.29L267.97 134.55L267.9 133.81L267.88 133.06L267.88 130.24L267.9 129.5L267.97 128.75L268.07 128.01L268.22 127.27L268.41 126.53L268.64 125.8L268.92 125.07L269.24 124.34L269.59 123.62L269.99 122.9L270.43 122.19L270.91 121.48L271.43 120.79L271.99 120.1L272.59 119.42L273.23 118.74L273.9 118.08L274.62 117.43L275.37 116.78L276.16 116.15L276.98 115.53L277.84 114.92L278.73 114.33L279.65 113.75L280.61 113.18L281.6 112.62L282.62 112.08L283.68 111.55L284.76 111.04L285.87 110.55L287.01 110.07L288.17 109.61L289.37 109.16L290.58 108.73L291.82 108.32L293.09 107.93L294.37 107.55L295.68 107.19L297 106.86L298.35 106.54L299.71 106.24L301.09 105.96L302.49 105.7L303.89 105.46L305.32 105.24L306.75 105.04L308.2 104.86L309.65 104.7L311.11 104.56L312.58 104.45L314.06 104.35L315.54 104.28L317.02 104.22L318.51 104.19L320 104.18L321.49 104.19L322.98 104.22L324.46 104.28L325.94 104.35L327.42 104.45L328.89 104.56L330.35 104.7L331.8 104.86L333.25 105.04L334.68 105.24L336.11 105.46L337.51 105.7L338.91 105.96L340.29 106.24L341.65 106.54L343 106.86L344.32 107.19L345.63 107.55L346.91 107.93L348.18 108.32L349.42 108.73L350.63 109.16L351.83 109.61L352.99 110.07L354.13 110.55L355.24 111.04L356.32 111.55L357.38 112.08L358.4 112.62L359.39 113.18L360.35 113.75L361.27 114.33L362.16 114.92L363.02 115.53L363.84 116.15L364.63 116.78L365.38 117.43L366.1 118.08L366.77 118.74L367.41 119.42L368.01 120.1L368.57 120.79L369.09 121.48L369.57 122.19L370.01 122.9L370.41 123.62L370.76 124.34L371.08 125.07L371.36 125.8L371.59 126.53L371.78 127.27L371.93 128.01L372.03 128.75L372.1 129.5L372.12 130.24Z\"/></g><g class=\"iso-solid\" data-p=\"82\" data-name=\"stagger.tooth20\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M385.5 104.37L384.35 105.36L378.58 106.14L376.78 102.78L376.78 91.5L382.55 90.72L384.55 91.3L385.5 93.08Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"M385.5 93.08L384.35 94.08L384.35 105.36L385.5 104.37Z\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"M384.35 94.08L378.58 94.85L378.58 106.14L384.35 105.36Z\"/><path class=\"iso-tn\" data-r=\"f5\" data-b=\"3\" style=\"--f:0.46875\" d=\"M378.58 94.85L376.78 91.5L376.78 102.78L378.58 106.14Z\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M376.78 91.5L382.55 90.72L384.55 91.3L385.5 93.08L384.35 94.08L378.58 94.85Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M384.35 105.36L384.35 94.08M378.58 106.14L378.58 94.85M385.5 93.08L384.35 94.08L378.58 94.85L376.78 91.5\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M385.5 104.37L384.35 105.36L378.58 106.14L376.78 102.78L376.78 91.5L382.55 90.72L384.55 91.3L385.5 93.08Z\"/></g><g class=\"iso-solid\" data-p=\"53\" data-name=\"spring.coil4\" data-mat=\"copper\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M374.29 129.68L374.27 130.43L374.21 131.17L374.1 131.92L373.96 132.66L373.78 133.41L373.55 134.15L373.28 134.88L372.98 135.61L372.63 136.34L372.24 137.06L371.81 137.78L371.35 138.49L370.84 139.2L370.3 139.89L369.72 140.58L369.1 141.26L368.44 141.93L367.75 142.6L367.02 143.25L366.25 143.89L365.45 144.52L364.61 145.14L363.74 145.75L362.84 146.35L361.91 146.93L360.94 147.5L359.94 148.06L358.91 148.61L357.86 149.13L356.77 149.65L355.66 150.15L354.51 150.63L353.35 151.1L352.15 151.55L350.93 151.98L349.69 152.4L348.43 152.8L347.14 153.19L345.84 153.55L344.51 153.9L343.17 154.23L341.81 154.54L340.43 154.83L339.04 155.1L337.63 155.35L336.21 155.58L334.77 155.8L333.33 155.99L331.87 156.17L330.41 156.32L328.94 156.45L327.46 156.56L325.97 156.66L324.48 156.73L322.99 156.78L321.5 156.81L320 156.82L318.5 156.81L317.01 156.78L315.52 156.73L314.03 156.66L312.54 156.56L311.06 156.45L309.59 156.32L308.13 156.17L306.67 155.99L305.23 155.8L303.79 155.58L302.37 155.35L300.96 155.1L299.57 154.83L298.19 154.54L296.83 154.23L295.49 153.9L294.16 153.55L292.86 153.19L291.57 152.8L290.31 152.4L289.07 151.98L287.85 151.55L286.65 151.1L285.49 150.63L284.34 150.15L283.23 149.65L282.14 149.13L281.09 148.61L280.06 148.06L279.06 147.5L278.09 146.93L277.16 146.35L276.26 145.75L275.39 145.14L274.55 144.52L273.75 143.89L272.98 143.25L272.25 142.6L271.56 141.93L270.9 141.26L270.28 140.58L269.7 139.89L269.16 139.2L268.65 138.49L268.19 137.78L267.76 137.06L267.37 136.34L267.02 135.61L266.72 134.88L266.45 134.15L266.22 133.41L266.04 132.66L265.9 131.92L265.79 131.17L265.73 130.43L265.71 129.68L265.71 126.86L265.73 126.11L265.79 125.36L265.9 124.61L266.04 123.87L266.22 123.13L266.45 122.39L266.72 121.65L267.02 120.92L267.37 120.19L267.76 119.47L268.19 118.75L268.65 118.04L269.16 117.34L269.7 116.64L270.28 115.95L270.9 115.27L271.56 114.6L272.25 113.94L272.98 113.28L273.75 112.64L274.55 112.01L275.39 111.39L276.26 110.78L277.16 110.18L278.09 109.6L279.06 109.03L280.06 108.47L281.09 107.93L282.14 107.4L283.23 106.88L284.34 106.39L285.49 105.9L286.65 105.43L287.85 104.98L289.07 104.55L290.31 104.13L291.57 103.73L292.86 103.35L294.16 102.98L295.49 102.64L296.83 102.31L298.19 102L299.57 101.71L300.96 101.43L302.37 101.18L303.79 100.95L305.23 100.74L306.67 100.54L308.13 100.37L309.59 100.21L311.06 100.08L312.54 99.97L314.03 99.88L315.52 99.8L317.01 99.75L318.5 99.72L320 99.71L321.5 99.72L322.99 99.75L324.48 99.8L325.97 99.88L327.46 99.97L328.94 100.08L330.41 100.21L331.87 100.37L333.33 100.54L334.77 100.74L336.21 100.95L337.63 101.18L339.04 101.43L340.43 101.71L341.81 102L343.17 102.31L344.51 102.64L345.84 102.98L347.14 103.35L348.43 103.73L349.69 104.13L350.93 104.55L352.15 104.98L353.35 105.43L354.51 105.9L355.66 106.39L356.77 106.88L357.86 107.4L358.91 107.93L359.94 108.47L360.94 109.03L361.91 109.6L362.84 110.18L363.74 110.78L364.61 111.39L365.45 112.01L366.25 112.64L367.02 113.28L367.75 113.94L368.44 114.6L369.1 115.27L369.72 115.95L370.3 116.64L370.84 117.34L371.35 118.04L371.81 118.75L372.24 119.47L372.63 120.19L372.98 120.92L373.28 121.65L373.55 122.39L373.78 123.13L373.96 123.87L374.1 124.61L374.21 125.36L374.27 126.11L374.29 126.86Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M374.29 129.68L374.17 131.45L373.83 133.22L373.25 134.97L372.44 136.7L371.41 138.4L370.16 140.07L368.69 141.68L367.02 143.25L365.14 144.76L363.07 146.2L360.82 147.58L358.39 148.87L355.8 150.09L353.05 151.21L350.16 152.25L347.14 153.19L344.01 154.02L340.78 154.76L337.45 155.38L334.05 155.9L330.59 156.3L327.09 156.59L323.55 156.76L320 156.82L320 154L323.55 153.94L327.09 153.77L330.59 153.48L334.05 153.08L337.45 152.56L340.78 151.93L344.01 151.2L347.14 150.36L350.16 149.43L353.05 148.39L355.8 147.26L358.39 146.05L360.82 144.75L363.07 143.38L365.14 141.94L367.02 140.43L368.69 138.86L370.16 137.24L371.41 135.58L372.44 133.88L373.25 132.15L373.83 130.4L374.17 128.63L374.29 126.86Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M320 156.82L316.55 156.77L313.12 156.6L309.71 156.33L306.35 155.95L303.04 155.46L303.04 152.64L306.35 153.13L309.71 153.51L313.12 153.78L316.55 153.95L320 154Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M303.04 155.46L300.14 154.94L297.3 154.34L294.53 153.65L291.85 152.89L289.26 152.05L286.77 151.14L284.38 150.16L284.38 147.34L286.77 148.32L289.26 149.23L291.85 150.07L294.53 150.83L297.3 151.51L300.14 152.12L303.04 152.64Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M284.38 150.16L281.98 149.05L279.71 147.87L277.59 146.62L275.62 145.31L273.82 143.95L272.18 142.53L270.72 141.06L269.43 139.56L268.33 138.01L267.42 136.44L267.42 133.62L268.33 135.19L269.43 136.73L270.72 138.24L272.18 139.71L273.82 141.13L275.62 142.49L277.59 143.8L279.71 145.05L281.98 146.23L284.38 147.34Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M267.42 136.44L266.68 134.77L266.14 133.09L265.82 131.38L265.71 129.68L265.71 126.86L265.82 128.56L266.14 130.26L266.68 131.95L267.42 133.62Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M358.39 146.05L356.85 146.79L355.26 147.5L353.61 148.17L351.91 148.82L350.16 149.43L348.37 150L346.53 150.54L344.65 151.04L342.73 151.51L340.78 151.93L338.79 152.32L336.78 152.67L334.74 152.98L332.67 153.25L330.59 153.48L328.49 153.67L326.38 153.81L324.26 153.92L322.13 153.98L320 154L317.87 153.98L315.74 153.92L313.62 153.81L311.51 153.67L309.41 153.48L307.33 153.25L305.26 152.98L303.22 152.67L301.21 152.32L299.22 151.93L297.27 151.51L295.35 151.04L293.47 150.54L291.63 150L289.84 149.43L288.09 148.82L286.39 148.17L284.74 147.5L283.15 146.79L281.61 146.05L280.13 145.28L278.72 144.49L277.37 143.66L276.08 142.81L274.86 141.94L273.71 141.04L272.63 140.12L271.63 139.18L270.7 138.22L269.84 137.24L269.07 136.25L268.37 135.24L267.75 134.22L267.21 133.19L266.75 132.15L266.38 131.1L266.09 130.05L265.88 128.99L265.75 127.92L265.71 126.86L265.75 125.79L265.88 124.73L266.09 123.67L266.38 122.61L266.75 121.56L267.21 120.52L267.75 119.49L268.37 118.47L269.07 117.46L269.84 116.47L270.7 115.49L271.63 114.53L272.63 113.59L273.71 112.67L274.86 111.78L276.08 110.9L277.37 110.05L278.72 109.23L280.13 108.43L281.61 107.66L283.15 106.92L284.74 106.21L286.39 105.54L288.09 104.9L289.84 104.29L291.63 103.71L293.47 103.17L295.35 102.67L297.27 102.2L299.22 101.78L301.21 101.39L303.22 101.04L305.26 100.73L307.33 100.46L309.41 100.23L311.51 100.05L313.62 99.9L315.74 99.79L317.87 99.73L320 99.71L322.13 99.73L324.26 99.79L326.38 99.9L328.49 100.05L330.59 100.23L332.67 100.46L334.74 100.73L336.78 101.04L338.79 101.39L340.78 101.78L342.73 102.2L344.65 102.67L346.53 103.17L348.37 103.71L350.16 104.29L351.91 104.9L353.61 105.54L355.26 106.21L356.85 106.92L358.39 107.66L359.87 108.43L361.28 109.23L362.63 110.05L363.92 110.9L365.14 111.78L366.29 112.67L367.37 113.59L368.37 114.53L369.3 115.49L370.16 116.47L370.93 117.46L371.63 118.47L372.25 119.49L372.79 120.52L373.25 121.56L373.62 122.61L373.91 123.67L374.12 124.73L374.25 125.79L374.29 126.86L374.25 127.92L374.12 128.99L373.91 130.05L373.62 131.1L373.25 132.15L372.79 133.19L372.25 134.22L371.63 135.24L370.93 136.25L370.16 137.24L369.3 138.22L368.37 139.18L367.37 140.12L366.29 141.04L365.14 141.94L363.92 142.81L362.63 143.66L361.28 144.49L359.87 145.28Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M374.29 126.86L374.27 127.6L374.21 128.35L374.1 129.1L373.96 129.84L373.78 130.58L373.55 131.32L373.28 132.06L372.98 132.79L372.63 133.52L372.24 134.24L371.81 134.96L371.35 135.67L370.84 136.37L370.3 137.07L369.72 137.76L369.1 138.44L368.44 139.11L367.75 139.78L367.02 140.43L366.25 141.07L365.45 141.7L364.61 142.32L363.74 142.93L362.84 143.53L361.91 144.11L360.94 144.68L359.94 145.24L358.91 145.78L357.86 146.31L356.77 146.83L355.66 147.33L354.51 147.81L353.35 148.28L352.15 148.73L350.93 149.16L349.69 149.58L348.43 149.98L347.14 150.36L345.84 150.73L344.51 151.08L343.17 151.4L341.81 151.71L340.43 152.01L339.04 152.28L337.63 152.53L336.21 152.76L334.77 152.98L333.33 153.17L331.87 153.34L330.41 153.5L328.94 153.63L327.46 153.74L325.97 153.84L324.48 153.91L322.99 153.96L321.5 153.99L320 154L318.5 153.99L317.01 153.96L315.52 153.91L314.03 153.84L312.54 153.74L311.06 153.63L309.59 153.5L308.13 153.34L306.67 153.17L305.23 152.98L303.79 152.76L302.37 152.53L300.96 152.28L299.57 152.01L298.19 151.71L296.83 151.4L295.49 151.08L294.16 150.73L292.86 150.36L291.57 149.98L290.31 149.58L289.07 149.16L287.85 148.73L286.65 148.28L285.49 147.81L284.34 147.33L283.23 146.83L282.14 146.31L281.09 145.78L280.06 145.24L279.06 144.68L278.09 144.11L277.16 143.53L276.26 142.93L275.39 142.32L274.55 141.7L273.75 141.07L272.98 140.43L272.25 139.78L271.56 139.11L270.9 138.44L270.28 137.76L269.7 137.07L269.16 136.37L268.65 135.67L268.19 134.96L267.76 134.24L267.37 133.52L267.02 132.79L266.72 132.06L266.45 131.32L266.22 130.58L266.04 129.84L265.9 129.1L265.79 128.35L265.73 127.6L265.71 126.86\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r0\" opacity=\"1\" d=\"M358.39 148.5L358.39 146.43M351.91 151.26L351.91 149.19M344.65 153.49L344.65 151.42M336.78 155.12L336.78 153.05M328.49 156.11L328.49 154.04M320 156.45L320 154.38M311.51 156.11L311.51 154.04M303.22 155.12L303.22 153.05M295.35 153.49L295.35 151.42M288.09 151.26L288.09 149.19M281.61 148.5L281.61 146.43\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r1\" opacity=\"0.969\" d=\"M276.08 145.26L276.08 143.19M363.92 145.26L363.92 143.19\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r2\" opacity=\"0.75\" d=\"M271.63 141.62L271.63 139.56M368.37 141.62L368.37 139.56\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r3\" opacity=\"0.344\" d=\"M268.37 137.69L268.37 135.62M371.63 137.69L371.63 135.62\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r4\" opacity=\"0.031\" d=\"M266.38 133.55L266.38 131.48M373.62 133.55L373.62 131.48\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r5\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r6\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r7\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r8\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r9\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r10\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r11\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r12\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r13\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r14\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M374.29 129.68L374.27 130.43L374.21 131.17L374.1 131.92L373.96 132.66L373.78 133.41L373.55 134.15L373.28 134.88L372.98 135.61L372.63 136.34L372.24 137.06L371.81 137.78L371.35 138.49L370.84 139.2L370.3 139.89L369.72 140.58L369.1 141.26L368.44 141.93L367.75 142.6L367.02 143.25L366.25 143.89L365.45 144.52L364.61 145.14L363.74 145.75L362.84 146.35L361.91 146.93L360.94 147.5L359.94 148.06L358.91 148.61L357.86 149.13L356.77 149.65L355.66 150.15L354.51 150.63L353.35 151.1L352.15 151.55L350.93 151.98L349.69 152.4L348.43 152.8L347.14 153.19L345.84 153.55L344.51 153.9L343.17 154.23L341.81 154.54L340.43 154.83L339.04 155.1L337.63 155.35L336.21 155.58L334.77 155.8L333.33 155.99L331.87 156.17L330.41 156.32L328.94 156.45L327.46 156.56L325.97 156.66L324.48 156.73L322.99 156.78L321.5 156.81L320 156.82L318.5 156.81L317.01 156.78L315.52 156.73L314.03 156.66L312.54 156.56L311.06 156.45L309.59 156.32L308.13 156.17L306.67 155.99L305.23 155.8L303.79 155.58L302.37 155.35L300.96 155.1L299.57 154.83L298.19 154.54L296.83 154.23L295.49 153.9L294.16 153.55L292.86 153.19L291.57 152.8L290.31 152.4L289.07 151.98L287.85 151.55L286.65 151.1L285.49 150.63L284.34 150.15L283.23 149.65L282.14 149.13L281.09 148.61L280.06 148.06L279.06 147.5L278.09 146.93L277.16 146.35L276.26 145.75L275.39 145.14L274.55 144.52L273.75 143.89L272.98 143.25L272.25 142.6L271.56 141.93L270.9 141.26L270.28 140.58L269.7 139.89L269.16 139.2L268.65 138.49L268.19 137.78L267.76 137.06L267.37 136.34L267.02 135.61L266.72 134.88L266.45 134.15L266.22 133.41L266.04 132.66L265.9 131.92L265.79 131.17L265.73 130.43L265.71 129.68L265.71 126.86L265.73 126.11L265.79 125.36L265.9 124.61L266.04 123.87L266.22 123.13L266.45 122.39L266.72 121.65L267.02 120.92L267.37 120.19L267.76 119.47L268.19 118.75L268.65 118.04L269.16 117.34L269.7 116.64L270.28 115.95L270.9 115.27L271.56 114.6L272.25 113.94L272.98 113.28L273.75 112.64L274.55 112.01L275.39 111.39L276.26 110.78L277.16 110.18L278.09 109.6L279.06 109.03L280.06 108.47L281.09 107.93L282.14 107.4L283.23 106.88L284.34 106.39L285.49 105.9L286.65 105.43L287.85 104.98L289.07 104.55L290.31 104.13L291.57 103.73L292.86 103.35L294.16 102.98L295.49 102.64L296.83 102.31L298.19 102L299.57 101.71L300.96 101.43L302.37 101.18L303.79 100.95L305.23 100.74L306.67 100.54L308.13 100.37L309.59 100.21L311.06 100.08L312.54 99.97L314.03 99.88L315.52 99.8L317.01 99.75L318.5 99.72L320 99.71L321.5 99.72L322.99 99.75L324.48 99.8L325.97 99.88L327.46 99.97L328.94 100.08L330.41 100.21L331.87 100.37L333.33 100.54L334.77 100.74L336.21 100.95L337.63 101.18L339.04 101.43L340.43 101.71L341.81 102L343.17 102.31L344.51 102.64L345.84 102.98L347.14 103.35L348.43 103.73L349.69 104.13L350.93 104.55L352.15 104.98L353.35 105.43L354.51 105.9L355.66 106.39L356.77 106.88L357.86 107.4L358.91 107.93L359.94 108.47L360.94 109.03L361.91 109.6L362.84 110.18L363.74 110.78L364.61 111.39L365.45 112.01L366.25 112.64L367.02 113.28L367.75 113.94L368.44 114.6L369.1 115.27L369.72 115.95L370.3 116.64L370.84 117.34L371.35 118.04L371.81 118.75L372.24 119.47L372.63 120.19L372.98 120.92L373.28 121.65L373.55 122.39L373.78 123.13L373.96 123.87L374.1 124.61L374.21 125.36L374.27 126.11L374.29 126.86Z\"/></g><g class=\"iso-solid\" data-p=\"59\" data-name=\"svg.clip4\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M358.56 96.06L358.3 96.23L358.07 96.46L357.87 96.74L357.72 97.06L357.62 97.43L357.56 97.84L357.55 98.28L357.58 98.73L357.66 99.21L357.79 99.68L357.96 100.16L358.17 100.63L358.41 101.07L358.69 101.49L359 101.88L359.33 102.23L359.67 102.53L360.03 102.78L360.39 102.98L360.75 103.12L361.1 103.2L361.44 103.21L361.76 103.16L362.06 103.05L366.28 100.94L366.54 100.77L366.77 100.54L366.97 100.26L367.12 99.94L367.22 99.57L367.28 99.16L367.29 98.72L367.26 98.27L367.18 97.79L367.05 97.32L366.88 96.84L366.67 96.37L366.43 95.93L366.15 95.51L365.84 95.12L365.51 94.77L365.17 94.47L364.81 94.22L364.45 94.02L364.09 93.88L363.74 93.8L363.4 93.79L363.08 93.84L362.78 93.95Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M362.06 103.05L362.69 102.46L363.03 101.51L363.03 100.32L362.69 99.03L366.91 96.92L367.25 98.21L367.25 99.4L366.91 100.35L366.28 100.94Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M362.69 99.03L362.31 98.23L366.54 96.12L366.91 96.92Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M362.31 98.23L361.75 97.39L365.97 95.27L366.54 96.12Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M361.75 97.39L361.04 96.66L365.27 94.55L365.97 95.27Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M361.04 96.66L360.17 96.11L359.32 95.9L358.56 96.06L362.78 93.95L363.54 93.79L364.4 94L365.27 94.55Z\"/><path class=\"iso-tn\" data-r=\"k0\" data-b=\"3\" d=\"M360.31 96.17L359.31 95.9L358.45 96.12L357.83 96.81L357.56 97.87L357.65 99.15L358.1 100.49L358.85 101.71L359.8 102.63L360.82 103.14L361.76 103.16L362.51 102.7L362.97 101.81L363.06 100.62L362.78 99.28L362.17 97.98L361.31 96.9Z\"/><path class=\"iso-tn\" data-r=\"k1\" d=\"\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M362.06 103.05L362.68 102.47L363.02 101.55L363.04 100.38L362.72 99.11L362.11 97.89L361.29 96.88L360.35 96.19L359.4 95.9L358.56 96.06\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M358.56 96.06L358.3 96.23L358.07 96.46L357.87 96.74L357.72 97.06L357.62 97.43L357.56 97.84L357.55 98.28L357.58 98.73L357.66 99.21L357.79 99.68L357.96 100.16L358.17 100.63L358.41 101.07L358.69 101.49L359 101.88L359.33 102.23L359.67 102.53L360.03 102.78L360.39 102.98L360.75 103.12L361.1 103.2L361.44 103.21L361.76 103.16L362.06 103.05L366.28 100.94L366.54 100.77L366.77 100.54L366.97 100.26L367.12 99.94L367.22 99.57L367.28 99.16L367.29 98.72L367.26 98.27L367.18 97.79L367.05 97.32L366.88 96.84L366.67 96.37L366.43 95.93L366.15 95.51L365.84 95.12L365.51 94.77L365.17 94.47L364.81 94.22L364.45 94.02L364.09 93.88L363.74 93.8L363.4 93.79L363.08 93.84L362.78 93.95Z\"/></g><g class=\"iso-solid\" data-p=\"57\" data-name=\"svg.clip2\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M264.42 116.21L264.54 116.19L264.66 116.11L264.79 115.96L264.92 115.75L265.06 115.48L265.19 115.16L265.31 114.78L265.43 114.37L265.54 113.92L265.64 113.45L265.73 112.95L265.81 112.45L265.87 111.94L265.91 111.44L265.94 110.96L265.95 110.5L265.94 110.07L265.92 109.68L265.88 109.33L265.82 109.04L265.75 108.8L265.67 108.62L265.57 108.51L265.46 108.46L259.69 107.69L259.57 107.7L259.45 107.79L259.32 107.94L259.19 108.15L259.05 108.42L258.92 108.74L258.8 109.11L258.68 109.52L258.57 109.97L258.47 110.45L258.38 110.94L258.3 111.44L258.24 111.95L258.2 112.45L258.17 112.94L258.16 113.4L258.17 113.83L258.19 114.22L258.23 114.56L258.29 114.86L258.36 115.1L258.44 115.27L258.54 115.39L258.65 115.43Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M263.95 114.89L264.04 115.58L264.2 116.03L264.42 116.21L258.65 115.43L258.44 115.26L258.28 114.81L258.18 114.12Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M263.93 114.07L263.95 114.89L258.18 114.12L258.16 113.29Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M263.99 112.94L263.93 114.07L258.16 113.29L258.22 112.17Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M264.16 111.61L263.99 112.94L258.22 112.17L258.39 110.84ZM265.46 108.46L265.38 108.46L259.61 107.69L259.69 107.69Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M265.38 108.46L265.06 108.75L264.73 109.42L264.42 110.41L264.16 111.61L258.39 110.84L258.65 109.64L258.96 108.65L259.29 107.98L259.61 107.69Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"M264.94 108.95L264.57 109.86L264.26 111.1L264.03 112.51L263.93 113.9L263.97 115.08L264.13 115.88L264.41 116.21L264.75 116.01L265.12 115.31L265.47 114.22L265.75 112.87L265.91 111.44L265.95 110.14L265.84 109.13L265.62 108.56L265.3 108.49Z\"/><path class=\"iso-tn\" data-r=\"k1\" d=\"\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M265.46 108.46L265.13 108.65L264.78 109.29L264.45 110.3L264.17 111.55L263.99 112.89L263.93 114.17L263.98 115.23L264.15 115.93L264.42 116.21\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M264.42 116.21L264.54 116.19L264.66 116.11L264.79 115.96L264.92 115.75L265.06 115.48L265.19 115.16L265.31 114.78L265.43 114.37L265.54 113.92L265.64 113.45L265.73 112.95L265.81 112.45L265.87 111.94L265.91 111.44L265.94 110.96L265.95 110.5L265.94 110.07L265.92 109.68L265.88 109.33L265.82 109.04L265.75 108.8L265.67 108.62L265.57 108.51L265.46 108.46L259.69 107.69L259.57 107.7L259.45 107.79L259.32 107.94L259.19 108.15L259.05 108.42L258.92 108.74L258.8 109.11L258.68 109.52L258.57 109.97L258.47 110.45L258.38 110.94L258.3 111.44L258.24 111.95L258.2 112.45L258.17 112.94L258.16 113.4L258.17 113.83L258.19 114.22L258.23 114.56L258.29 114.86L258.36 115.1L258.44 115.27L258.54 115.39L258.65 115.43Z\"/></g><g class=\"iso-solid\" data-p=\"31\" data-name=\"animation.bolt0\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M368.96 223.25L368.94 223.36L368.9 223.47L368.82 223.58L368.72 223.68L368.6 223.78L368.45 223.86L368.28 223.94L368.09 224L367.88 224.05L367.67 224.09L367.45 224.11L367.22 224.12L366.99 224.11L366.77 224.09L366.55 224.05L366.35 224L366.16 223.94L365.99 223.86L365.84 223.78L365.71 223.68L365.61 223.58L365.54 223.47L365.5 223.36L365.48 223.25L365.48 220.9L365.5 220.78L365.54 220.67L365.61 220.56L365.71 220.46L365.84 220.37L365.99 220.28L366.16 220.21L366.35 220.14L366.55 220.09L366.77 220.06L366.99 220.03L367.22 220.03L367.45 220.03L367.67 220.06L367.88 220.09L368.09 220.14L368.28 220.21L368.45 220.28L368.6 220.37L368.72 220.46L368.82 220.56L368.9 220.67L368.94 220.78L368.96 220.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M368.96 223.25L368.82 223.58L368.45 223.86L367.88 224.05L367.22 224.12L367.22 221.76L367.88 221.7L368.45 221.51L368.82 221.23L368.96 220.9Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M367.22 224.12L366.68 224.07L366.68 221.72L367.22 221.76Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M366.68 224.07L366.36 224L366.08 223.9L366.08 221.55L366.36 221.65L366.68 221.72Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M366.08 223.9L365.74 223.7L365.54 223.46L365.54 221.11L365.74 221.35L366.08 221.55Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M365.54 223.46L365.48 223.25L365.48 220.9L365.54 221.11Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M368.45 221.51L367.88 221.7L367.22 221.76L366.55 221.7L365.99 221.51L365.61 221.23L365.48 220.9L365.61 220.56L365.99 220.28L366.55 220.09L367.22 220.03L367.88 220.09L368.45 220.28L368.82 220.56L368.96 220.9L368.82 221.23Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M368.96 220.9L368.45 221.51L367.22 221.76L365.99 221.51L365.48 220.9\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M368.96 223.25L368.94 223.36L368.9 223.47L368.82 223.58L368.72 223.68L368.6 223.78L368.45 223.86L368.28 223.94L368.09 224L367.88 224.05L367.67 224.09L367.45 224.11L367.22 224.12L366.99 224.11L366.77 224.09L366.55 224.05L366.35 224L366.16 223.94L365.99 223.86L365.84 223.78L365.71 223.68L365.61 223.58L365.54 223.47L365.5 223.36L365.48 223.25L365.48 220.9L365.5 220.78L365.54 220.67L365.61 220.56L365.71 220.46L365.84 220.37L365.99 220.28L366.16 220.21L366.35 220.14L366.55 220.09L366.77 220.06L366.99 220.03L367.22 220.03L367.45 220.03L367.67 220.06L367.88 220.09L368.09 220.14L368.28 220.21L368.45 220.28L368.6 220.37L368.72 220.46L368.82 220.56L368.9 220.67L368.94 220.78L368.96 220.9Z\"/></g><g class=\"iso-solid\" data-p=\"33\" data-name=\"animation.bolt2\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M274.52 223.25L274.5 223.36L274.46 223.47L274.39 223.58L274.29 223.68L274.16 223.78L274.01 223.86L273.84 223.94L273.65 224L273.45 224.05L273.23 224.09L273.01 224.11L272.78 224.12L272.55 224.11L272.33 224.09L272.12 224.05L271.91 224L271.72 223.94L271.55 223.86L271.4 223.78L271.28 223.68L271.18 223.58L271.1 223.47L271.06 223.36L271.04 223.25L271.04 220.9L271.06 220.78L271.1 220.67L271.18 220.56L271.28 220.46L271.4 220.37L271.55 220.28L271.72 220.21L271.91 220.14L272.12 220.09L272.33 220.06L272.55 220.03L272.78 220.03L273.01 220.03L273.23 220.06L273.45 220.09L273.65 220.14L273.84 220.21L274.01 220.28L274.16 220.37L274.29 220.46L274.39 220.56L274.46 220.67L274.5 220.78L274.52 220.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M274.52 223.25L274.39 223.58L274.01 223.86L273.45 224.05L272.78 224.12L272.78 221.76L273.45 221.7L274.01 221.51L274.39 221.23L274.52 220.9Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M272.78 224.12L272.24 224.07L272.24 221.72L272.78 221.76Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M272.24 224.07L271.92 224L271.64 223.9L271.64 221.55L271.92 221.65L272.24 221.72Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M271.64 223.9L271.3 223.7L271.1 223.46L271.1 221.11L271.3 221.35L271.64 221.55Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M271.1 223.46L271.04 223.25L271.04 220.9L271.1 221.11Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M274.01 221.51L273.45 221.7L272.78 221.76L272.12 221.7L271.55 221.51L271.18 221.23L271.04 220.9L271.18 220.56L271.55 220.28L272.12 220.09L272.78 220.03L273.45 220.09L274.01 220.28L274.39 220.56L274.52 220.9L274.39 221.23Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M274.52 220.9L274.01 221.51L272.78 221.76L271.55 221.51L271.04 220.9\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M274.52 223.25L274.5 223.36L274.46 223.47L274.39 223.58L274.29 223.68L274.16 223.78L274.01 223.86L273.84 223.94L273.65 224L273.45 224.05L273.23 224.09L273.01 224.11L272.78 224.12L272.55 224.11L272.33 224.09L272.12 224.05L271.91 224L271.72 223.94L271.55 223.86L271.4 223.78L271.28 223.68L271.18 223.58L271.1 223.47L271.06 223.36L271.04 223.25L271.04 220.9L271.06 220.78L271.1 220.67L271.18 220.56L271.28 220.46L271.4 220.37L271.55 220.28L271.72 220.21L271.91 220.14L272.12 220.09L272.33 220.06L272.55 220.03L272.78 220.03L273.01 220.03L273.23 220.06L273.45 220.09L273.65 220.14L273.84 220.21L274.01 220.28L274.16 220.37L274.29 220.46L274.39 220.56L274.46 220.67L274.5 220.78L274.52 220.9Z\"/></g><g class=\"iso-solid\" data-p=\"54\" data-name=\"svg.band\" data-mat=\"steel\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M376.46 124.41L376.44 125.16L376.38 125.9L376.28 126.64L376.15 127.39L375.97 128.13L375.75 128.86L375.5 129.6L375.21 130.33L374.88 131.06L374.51 131.78L374.1 132.49L373.65 133.21L373.17 133.91L372.65 134.61L372.09 135.3L371.5 135.98L370.87 136.66L370.21 137.33L369.51 137.99L368.77 138.63L368 139.27L367.2 139.9L366.37 140.52L365.5 141.13L364.6 141.72L363.67 142.3L362.72 142.87L361.73 143.43L360.71 143.97L359.66 144.5L358.59 145.02L357.48 145.52L356.36 146.01L355.2 146.48L354.03 146.94L352.82 147.38L351.6 147.81L350.35 148.22L349.09 148.61L347.8 148.98L346.49 149.34L345.17 149.68L343.82 150.01L342.46 150.31L341.09 150.6L339.7 150.87L338.3 151.12L336.88 151.35L335.45 151.56L334.01 151.76L332.56 151.93L331.11 152.09L329.64 152.23L328.17 152.35L326.69 152.44L325.21 152.52L323.72 152.58L322.24 152.62L320.75 152.64L319.25 152.64L317.76 152.62L316.28 152.58L314.79 152.52L313.31 152.44L311.83 152.35L310.36 152.23L308.89 152.09L307.44 151.93L305.99 151.76L304.55 151.56L303.12 151.35L301.7 151.12L300.3 150.87L298.91 150.6L297.54 150.31L296.18 150.01L294.83 149.68L293.51 149.34L292.2 148.98L290.91 148.61L289.65 148.22L288.4 147.81L287.18 147.38L285.97 146.94L284.8 146.48L283.64 146.01L282.52 145.52L281.41 145.02L280.34 144.5L279.29 143.97L278.27 143.43L277.28 142.87L276.33 142.3L275.4 141.72L274.5 141.13L273.63 140.52L272.8 139.9L272 139.27L271.23 138.63L270.49 137.99L269.79 137.33L269.13 136.66L268.5 135.98L267.91 135.3L267.35 134.61L266.83 133.91L266.35 133.21L265.9 132.49L265.49 131.78L265.12 131.06L264.79 130.33L264.5 129.6L264.25 128.86L264.03 128.13L263.85 127.39L263.72 126.64L263.62 125.9L263.56 125.16L263.54 124.41L263.54 115.01L263.56 114.26L263.62 113.52L263.72 112.77L263.85 112.03L264.03 111.29L264.25 110.55L264.5 109.82L264.79 109.09L265.12 108.36L265.49 107.64L265.9 106.92L266.35 106.21L266.83 105.51L267.35 104.81L267.91 104.12L268.5 103.43L269.13 102.76L269.79 102.09L270.49 101.43L271.23 100.79L272 100.15L272.8 99.52L273.63 98.9L274.5 98.29L275.4 97.7L276.33 97.12L277.28 96.55L278.27 95.99L279.29 95.44L280.34 94.91L281.41 94.4L282.52 93.9L283.64 93.41L284.8 92.94L285.97 92.48L287.18 92.04L288.4 91.61L289.65 91.2L290.91 90.81L292.2 90.44L293.51 90.08L294.83 89.74L296.18 89.41L297.54 89.11L298.91 88.82L300.3 88.55L301.7 88.3L303.12 88.07L304.55 87.85L305.99 87.66L307.44 87.49L308.89 87.33L310.36 87.19L311.83 87.07L313.31 86.98L314.79 86.9L316.28 86.84L317.76 86.8L319.25 86.78L320.75 86.78L322.24 86.8L323.72 86.84L325.21 86.9L326.69 86.98L328.17 87.07L329.64 87.19L331.11 87.33L332.56 87.49L334.01 87.66L335.45 87.85L336.88 88.07L338.3 88.3L339.7 88.55L341.09 88.82L342.46 89.11L343.82 89.41L345.17 89.74L346.49 90.08L347.8 90.44L349.09 90.81L350.35 91.2L351.6 91.61L352.82 92.04L354.03 92.48L355.2 92.94L356.36 93.41L357.48 93.9L358.59 94.4L359.66 94.91L360.71 95.44L361.73 95.99L362.72 96.55L363.67 97.12L364.6 97.7L365.5 98.29L366.37 98.9L367.2 99.52L368 100.15L368.77 100.79L369.51 101.43L370.21 102.09L370.87 102.76L371.5 103.43L372.09 104.12L372.65 104.81L373.17 105.51L373.65 106.21L374.1 106.92L374.51 107.64L374.88 108.36L375.21 109.09L375.5 109.82L375.75 110.55L375.97 111.29L376.15 112.03L376.28 112.77L376.38 113.52L376.44 114.26L376.46 115.01Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M376.46 124.41L376.34 126.26L375.98 128.1L375.38 129.92L374.54 131.72L373.47 133.49L372.16 135.21L370.64 136.9L368.9 138.53L366.95 140.1L364.79 141.6L362.45 143.03L359.92 144.37L357.23 145.64L354.37 146.81L351.37 147.88L348.23 148.86L344.97 149.73L341.61 150.49L338.15 151.14L334.61 151.68L331.02 152.1L327.37 152.4L323.69 152.58L320 152.64L320 143.24L323.69 143.18L327.37 143L331.02 142.7L334.61 142.28L338.15 141.74L341.61 141.09L344.97 140.33L348.23 139.46L351.37 138.48L354.37 137.41L357.23 136.23L359.92 134.97L362.45 133.62L364.79 132.19L366.95 130.69L368.9 129.12L370.64 127.49L372.16 125.81L373.47 124.08L374.54 122.31L375.38 120.52L375.98 118.69L376.34 116.85L376.46 115.01Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M320 152.64L316.41 152.59L312.84 152.41L309.3 152.13L305.8 151.74L302.36 151.23L302.36 141.83L305.8 142.33L309.3 142.73L312.84 143.01L316.41 143.18L320 143.24Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M302.36 151.23L299.34 150.68L296.39 150.06L293.52 149.34L290.73 148.55L288.03 147.68L285.44 146.74L282.96 145.72L282.96 136.31L285.44 137.33L288.03 138.28L290.73 139.15L293.52 139.94L296.39 140.65L299.34 141.28L302.36 141.83Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M282.96 145.72L280.46 144.56L278.1 143.33L275.89 142.03L273.85 140.67L271.97 139.25L270.27 137.78L268.74 136.25L267.41 134.68L266.27 133.08L265.32 131.44L265.32 122.04L266.27 123.68L267.41 125.28L268.74 126.85L270.27 128.37L271.97 129.85L273.85 131.27L275.89 132.63L278.1 133.93L280.46 135.16L282.96 136.31Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M265.32 131.44L264.54 129.71L263.99 127.96L263.65 126.19L263.54 124.41L263.54 115.01L263.65 116.78L263.99 118.55L264.54 120.31L265.32 122.04Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M359.92 134.97L358.33 135.74L356.67 136.47L354.96 137.18L353.19 137.85L351.37 138.48L349.5 139.08L347.59 139.64L345.63 140.16L343.64 140.65L341.61 141.09L339.54 141.49L337.45 141.86L335.33 142.18L333.18 142.46L331.02 142.7L328.83 142.89L326.64 143.04L324.43 143.15L322.22 143.22L320 143.24L317.78 143.22L315.57 143.15L313.36 143.04L311.17 142.89L308.98 142.7L306.82 142.46L304.67 142.18L302.55 141.86L300.46 141.49L298.39 141.09L296.36 140.65L294.37 140.16L292.41 139.64L290.5 139.08L288.63 138.48L286.81 137.85L285.04 137.18L283.33 136.47L281.67 135.74L280.08 134.97L278.54 134.17L277.07 133.34L275.66 132.49L274.32 131.6L273.05 130.69L271.86 129.76L270.74 128.8L269.69 127.82L268.72 126.83L267.84 125.81L267.03 124.78L266.3 123.73L265.66 122.67L265.1 121.6L264.62 120.52L264.23 119.42L263.93 118.33L263.71 117.22L263.58 116.12L263.54 115.01L263.58 113.9L263.71 112.79L263.93 111.69L264.23 110.59L264.62 109.5L265.1 108.42L265.66 107.35L266.3 106.28L267.03 105.24L267.84 104.2L268.72 103.19L269.69 102.19L270.74 101.21L271.86 100.26L273.05 99.32L274.32 98.41L275.66 97.53L277.07 96.67L278.54 95.84L280.08 95.05L281.67 94.28L283.33 93.54L285.04 92.84L286.81 92.17L288.63 91.53L290.5 90.94L292.41 90.38L294.37 89.85L296.36 89.37L298.39 88.93L300.46 88.52L302.55 88.16L304.67 87.84L306.82 87.56L308.98 87.32L311.17 87.12L313.36 86.97L315.57 86.86L317.78 86.8L320 86.78L322.22 86.8L324.43 86.86L326.64 86.97L328.83 87.12L331.02 87.32L333.18 87.56L335.33 87.84L337.45 88.16L339.54 88.52L341.61 88.93L343.64 89.37L345.63 89.85L347.59 90.38L349.5 90.94L351.37 91.53L353.19 92.17L354.96 92.84L356.67 93.54L358.33 94.28L359.92 95.05L361.46 95.84L362.93 96.67L364.34 97.53L365.68 98.41L366.95 99.32L368.14 100.26L369.26 101.21L370.31 102.19L371.28 103.19L372.16 104.2L372.97 105.24L373.7 106.28L374.34 107.35L374.9 108.42L375.38 109.5L375.77 110.59L376.07 111.69L376.29 112.79L376.42 113.9L376.46 115.01L376.42 116.12L376.29 117.22L376.07 118.33L375.77 119.42L375.38 120.52L374.9 121.6L374.34 122.67L373.7 123.73L372.97 124.78L372.16 125.81L371.28 126.83L370.31 127.82L369.26 128.8L368.14 129.76L366.95 130.69L365.68 131.6L364.34 132.49L362.93 133.34L361.46 134.17Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M376.46 115.01L376.44 115.75L376.38 116.5L376.28 117.24L376.15 117.98L375.97 118.72L375.75 119.46L375.5 120.2L375.21 120.93L374.88 121.65L374.51 122.37L374.1 123.09L373.65 123.8L373.17 124.51L372.65 125.21L372.09 125.9L371.5 126.58L370.87 127.26L370.21 127.92L369.51 128.58L368.77 129.23L368 129.87L367.2 130.5L366.37 131.12L365.5 131.72L364.6 132.32L363.67 132.9L362.72 133.47L361.73 134.03L360.71 134.57L359.66 135.1L358.59 135.62L357.48 136.12L356.36 136.61L355.2 137.08L354.03 137.54L352.82 137.98L351.6 138.4L350.35 138.81L349.09 139.2L347.8 139.58L346.49 139.94L345.17 140.28L343.82 140.6L342.46 140.91L341.09 141.2L339.7 141.46L338.3 141.72L336.88 141.95L335.45 142.16L334.01 142.36L332.56 142.53L331.11 142.69L329.64 142.82L328.17 142.94L326.69 143.04L325.21 143.12L323.72 143.18L322.24 143.22L320.75 143.24L319.25 143.24L317.76 143.22L316.28 143.18L314.79 143.12L313.31 143.04L311.83 142.94L310.36 142.82L308.89 142.69L307.44 142.53L305.99 142.36L304.55 142.16L303.12 141.95L301.7 141.72L300.3 141.46L298.91 141.2L297.54 140.91L296.18 140.6L294.83 140.28L293.51 139.94L292.2 139.58L290.91 139.2L289.65 138.81L288.4 138.4L287.18 137.98L285.97 137.54L284.8 137.08L283.64 136.61L282.52 136.12L281.41 135.62L280.34 135.1L279.29 134.57L278.27 134.03L277.28 133.47L276.33 132.9L275.4 132.32L274.5 131.72L273.63 131.12L272.8 130.5L272 129.87L271.23 129.23L270.49 128.58L269.79 127.92L269.13 127.26L268.5 126.58L267.91 125.9L267.35 125.21L266.83 124.51L266.35 123.8L265.9 123.09L265.49 122.37L265.12 121.65L264.79 120.93L264.5 120.2L264.25 119.46L264.03 118.72L263.85 117.98L263.72 117.24L263.62 116.5L263.56 115.75L263.54 115.01\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M376.46 124.41L376.44 125.16L376.38 125.9L376.28 126.64L376.15 127.39L375.97 128.13L375.75 128.86L375.5 129.6L375.21 130.33L374.88 131.06L374.51 131.78L374.1 132.49L373.65 133.21L373.17 133.91L372.65 134.61L372.09 135.3L371.5 135.98L370.87 136.66L370.21 137.33L369.51 137.99L368.77 138.63L368 139.27L367.2 139.9L366.37 140.52L365.5 141.13L364.6 141.72L363.67 142.3L362.72 142.87L361.73 143.43L360.71 143.97L359.66 144.5L358.59 145.02L357.48 145.52L356.36 146.01L355.2 146.48L354.03 146.94L352.82 147.38L351.6 147.81L350.35 148.22L349.09 148.61L347.8 148.98L346.49 149.34L345.17 149.68L343.82 150.01L342.46 150.31L341.09 150.6L339.7 150.87L338.3 151.12L336.88 151.35L335.45 151.56L334.01 151.76L332.56 151.93L331.11 152.09L329.64 152.23L328.17 152.35L326.69 152.44L325.21 152.52L323.72 152.58L322.24 152.62L320.75 152.64L319.25 152.64L317.76 152.62L316.28 152.58L314.79 152.52L313.31 152.44L311.83 152.35L310.36 152.23L308.89 152.09L307.44 151.93L305.99 151.76L304.55 151.56L303.12 151.35L301.7 151.12L300.3 150.87L298.91 150.6L297.54 150.31L296.18 150.01L294.83 149.68L293.51 149.34L292.2 148.98L290.91 148.61L289.65 148.22L288.4 147.81L287.18 147.38L285.97 146.94L284.8 146.48L283.64 146.01L282.52 145.52L281.41 145.02L280.34 144.5L279.29 143.97L278.27 143.43L277.28 142.87L276.33 142.3L275.4 141.72L274.5 141.13L273.63 140.52L272.8 139.9L272 139.27L271.23 138.63L270.49 137.99L269.79 137.33L269.13 136.66L268.5 135.98L267.91 135.3L267.35 134.61L266.83 133.91L266.35 133.21L265.9 132.49L265.49 131.78L265.12 131.06L264.79 130.33L264.5 129.6L264.25 128.86L264.03 128.13L263.85 127.39L263.72 126.64L263.62 125.9L263.56 125.16L263.54 124.41L263.54 115.01L263.56 114.26L263.62 113.52L263.72 112.77L263.85 112.03L264.03 111.29L264.25 110.55L264.5 109.82L264.79 109.09L265.12 108.36L265.49 107.64L265.9 106.92L266.35 106.21L266.83 105.51L267.35 104.81L267.91 104.12L268.5 103.43L269.13 102.76L269.79 102.09L270.49 101.43L271.23 100.79L272 100.15L272.8 99.52L273.63 98.9L274.5 98.29L275.4 97.7L276.33 97.12L277.28 96.55L278.27 95.99L279.29 95.44L280.34 94.91L281.41 94.4L282.52 93.9L283.64 93.41L284.8 92.94L285.97 92.48L287.18 92.04L288.4 91.61L289.65 91.2L290.91 90.81L292.2 90.44L293.51 90.08L294.83 89.74L296.18 89.41L297.54 89.11L298.91 88.82L300.3 88.55L301.7 88.3L303.12 88.07L304.55 87.85L305.99 87.66L307.44 87.49L308.89 87.33L310.36 87.19L311.83 87.07L313.31 86.98L314.79 86.9L316.28 86.84L317.76 86.8L319.25 86.78L320.75 86.78L322.24 86.8L323.72 86.84L325.21 86.9L326.69 86.98L328.17 87.07L329.64 87.19L331.11 87.33L332.56 87.49L334.01 87.66L335.45 87.85L336.88 88.07L338.3 88.3L339.7 88.55L341.09 88.82L342.46 89.11L343.82 89.41L345.17 89.74L346.49 90.08L347.8 90.44L349.09 90.81L350.35 91.2L351.6 91.61L352.82 92.04L354.03 92.48L355.2 92.94L356.36 93.41L357.48 93.9L358.59 94.4L359.66 94.91L360.71 95.44L361.73 95.99L362.72 96.55L363.67 97.12L364.6 97.7L365.5 98.29L366.37 98.9L367.2 99.52L368 100.15L368.77 100.79L369.51 101.43L370.21 102.09L370.87 102.76L371.5 103.43L372.09 104.12L372.65 104.81L373.17 105.51L373.65 106.21L374.1 106.92L374.51 107.64L374.88 108.36L375.21 109.09L375.5 109.82L375.75 110.55L375.97 111.29L376.15 112.03L376.28 112.77L376.38 113.52L376.44 114.26L376.46 115.01Z\"/><g class=\"iso-dots\" data-tone=\"lo\"><circle data-r=\"c0\" cx=\"355.32\" cy=\"132.67\" r=\"1.4\" fill-opacity=\"1\"/><circle data-r=\"c1\" cx=\"307.07\" cy=\"139.13\" r=\"1.4\" fill-opacity=\"1\"/><circle data-r=\"c2\" cx=\"271.76\" cy=\"121.47\" r=\"1.4\" fill-opacity=\"1\"/><circle data-r=\"c3\" cx=\"284.68\" cy=\"97.35\" r=\"1.4\" fill-opacity=\"1\"/><circle data-r=\"c4\" cx=\"332.93\" cy=\"90.89\" r=\"1.4\" fill-opacity=\"1\"/><circle data-r=\"c5\" cx=\"368.24\" cy=\"108.54\" r=\"1.4\" fill-opacity=\"1\"/></g></g><g class=\"iso-solid\" data-p=\"73\" data-name=\"stagger.tooth11\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M270.02 95.75L266.54 98.76L261.37 97.27L260.78 96.16L260.78 84.87L262.62 83.27L264.85 82.98L270.02 84.47Z\"/><path class=\"iso-tn\" data-r=\"f0\" data-b=\"2\" d=\"M266.54 87.48L261.37 85.99L261.37 97.27L266.54 98.76Z\"/><path class=\"iso-tn\" data-r=\"f1\" data-b=\"3\" style=\"--f:0.46875\" d=\"M261.37 85.99L260.78 84.87L260.78 96.16L261.37 97.27Z\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"M270.02 84.47L266.54 87.48L266.54 98.76L270.02 95.75Z\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M266.54 87.48L261.37 85.99L260.78 84.87L262.62 83.27L264.85 82.98L270.02 84.47Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M266.54 98.76L266.54 87.48M261.37 97.27L261.37 85.99M270.02 84.47L266.54 87.48L261.37 85.99L260.78 84.87\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M270.02 95.75L266.54 98.76L261.37 97.27L260.78 96.16L260.78 84.87L262.62 83.27L264.85 82.98L270.02 84.47Z\"/></g><g class=\"iso-solid\" data-p=\"72\" data-name=\"stagger.tooth10\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M263.22 102.78L261.42 106.14L255.65 105.36L254.5 104.37L254.5 93.08L255.45 91.3L257.45 90.72L263.22 91.5Z\"/><path class=\"iso-tn\" data-r=\"f0\" data-b=\"1\" d=\"M261.42 94.85L255.65 94.08L255.65 105.36L261.42 106.14Z\"/><path class=\"iso-tn\" data-r=\"f1\" data-b=\"3\" d=\"M255.65 94.08L254.5 93.08L254.5 104.37L255.65 105.36Z\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"M263.22 91.5L261.42 94.85L261.42 106.14L263.22 102.78Z\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M261.42 94.85L255.65 94.08L254.5 93.08L255.45 91.3L257.45 90.72L263.22 91.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M261.42 106.14L261.42 94.85M255.65 105.36L255.65 94.08M263.22 91.5L261.42 94.85L255.65 94.08L254.5 93.08\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M263.22 102.78L261.42 106.14L255.65 105.36L254.5 104.37L254.5 93.08L255.45 91.3L257.45 90.72L263.22 91.5Z\"/></g><g class=\"iso-solid\" data-p=\"83\" data-name=\"stagger.tooth21\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M387.32 113.11L385.69 113.92L379.72 113.92L379.72 102.64L379.72 99.17L385.69 99.17L387.32 99.98L387.32 101.83Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"M387.32 101.83L385.69 102.64L385.69 113.92L387.32 113.11Z\"/><path class=\"iso-tn\" data-r=\"f4\" style=\"--f:0.5\" d=\"M385.69 102.64L379.72 102.64L379.72 113.92L385.69 113.92Z\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M379.72 99.17L385.69 99.17L387.32 99.98L387.32 101.83L385.69 102.64L379.72 102.64Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M385.69 113.92L385.69 102.64M387.32 101.83L385.69 102.64L379.72 102.64\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M387.32 113.11L385.69 113.92L379.72 113.92L379.72 102.64L379.72 99.17L385.69 99.17L387.32 99.98L387.32 101.83Z\"/></g><g class=\"iso-solid\" data-p=\"71\" data-name=\"stagger.tooth9\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M260.28 113.92L254.31 113.92L252.68 113.11L252.68 101.83L252.68 99.98L254.31 99.17L260.28 99.17L260.28 102.64Z\"/><path class=\"iso-tn\" data-r=\"f0\" style=\"--f:0.5\" d=\"M260.28 102.64L254.31 102.64L254.31 113.92L260.28 113.92Z\"/><path class=\"iso-tn\" data-r=\"f1\" data-b=\"3\" d=\"M254.31 102.64L252.68 101.83L252.68 113.11L254.31 113.92Z\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M260.28 102.64L254.31 102.64L252.68 101.83L252.68 99.98L254.31 99.17L260.28 99.17Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M254.31 113.92L254.31 102.64M260.28 102.64L254.31 102.64L252.68 101.83\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M260.28 113.92L254.31 113.92L252.68 113.11L252.68 101.83L252.68 99.98L254.31 99.17L260.28 99.17L260.28 102.64Z\"/></g><g class=\"iso-solid\" data-p=\"32\" data-name=\"animation.bolt1\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M321.74 233.03L321.72 233.14L321.68 233.25L321.61 233.36L321.5 233.46L321.38 233.55L321.23 233.64L321.06 233.72L320.87 233.78L320.66 233.83L320.45 233.87L320.23 233.89L320 233.89L319.77 233.89L319.55 233.87L319.34 233.83L319.13 233.78L318.94 233.72L318.77 233.64L318.62 233.55L318.5 233.46L318.39 233.36L318.32 233.25L318.28 233.14L318.26 233.03L318.26 230.68L318.28 230.56L318.32 230.45L318.39 230.34L318.5 230.24L318.62 230.15L318.77 230.06L318.94 229.99L319.13 229.92L319.34 229.87L319.55 229.84L319.77 229.81L320 229.81L320.23 229.81L320.45 229.84L320.66 229.87L320.87 229.92L321.06 229.99L321.23 230.06L321.38 230.15L321.5 230.24L321.61 230.34L321.68 230.45L321.72 230.56L321.74 230.68Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M321.74 233.03L321.61 233.36L321.23 233.64L320.66 233.83L320 233.89L320 231.54L320.66 231.48L321.23 231.29L321.61 231.01L321.74 230.68Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M320 233.89L319.46 233.85L319.46 231.5L320 231.54Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M319.46 233.85L319.14 233.78L318.86 233.68L318.86 231.33L319.14 231.43L319.46 231.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M318.86 233.68L318.52 233.48L318.32 233.24L318.32 230.89L318.52 231.13L318.86 231.33Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M318.32 233.24L318.26 233.03L318.26 230.68L318.32 230.89Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M321.23 231.29L320.66 231.48L320 231.54L319.34 231.48L318.77 231.29L318.39 231.01L318.26 230.68L318.39 230.34L318.77 230.06L319.34 229.87L320 229.81L320.66 229.87L321.23 230.06L321.61 230.34L321.74 230.68L321.61 231.01Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M321.74 230.68L321.23 231.29L320 231.54L318.77 231.29L318.26 230.68\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M321.74 233.03L321.72 233.14L321.68 233.25L321.61 233.36L321.5 233.46L321.38 233.55L321.23 233.64L321.06 233.72L320.87 233.78L320.66 233.83L320.45 233.87L320.23 233.89L320 233.89L319.77 233.89L319.55 233.87L319.34 233.83L319.13 233.78L318.94 233.72L318.77 233.64L318.62 233.55L318.5 233.46L318.39 233.36L318.32 233.25L318.28 233.14L318.26 233.03L318.26 230.68L318.28 230.56L318.32 230.45L318.39 230.34L318.5 230.24L318.62 230.15L318.77 230.06L318.94 229.99L319.13 229.92L319.34 229.87L319.55 229.84L319.77 229.81L320 229.81L320.23 229.81L320.45 229.84L320.66 229.87L320.87 229.92L321.06 229.99L321.23 230.06L321.38 230.15L321.5 230.24L321.61 230.34L321.68 230.45L321.72 230.56L321.74 230.68Z\"/></g><g class=\"iso-solid\" data-p=\"60\" data-name=\"svg.clip5\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M374.54 130.96L374.43 130.91L374.33 130.8L374.25 130.62L374.18 130.38L374.12 130.09L374.08 129.74L374.06 129.35L374.05 128.92L374.06 128.46L374.09 127.98L374.13 127.48L374.19 126.97L374.27 126.47L374.36 125.97L374.46 125.5L374.57 125.05L374.69 124.64L374.81 124.26L374.94 123.94L375.08 123.67L375.21 123.46L375.34 123.31L375.46 123.23L375.58 123.21L381.35 123.98L381.46 124.03L381.56 124.15L381.64 124.32L381.71 124.56L381.77 124.86L381.81 125.2L381.83 125.59L381.84 126.02L381.83 126.48L381.8 126.97L381.76 127.47L381.7 127.98L381.62 128.48L381.53 128.97L381.43 129.45L381.32 129.9L381.2 130.31L381.08 130.68L380.95 131L380.81 131.27L380.68 131.48L380.55 131.63L380.43 131.72L380.31 131.73Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M374.54 130.96L374.33 130.79L374.17 130.34L374.07 129.65L379.84 130.42L379.93 131.11L380.1 131.56L380.31 131.73Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M374.07 129.65L374.05 128.82L379.82 129.59L379.84 130.42Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M374.05 128.82L374.11 127.69L379.88 128.47L379.82 129.59Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M375.5 123.22L375.58 123.21L381.35 123.98L381.27 123.99ZM374.11 127.69L374.29 126.36L380.05 127.13L379.88 128.47Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M374.29 126.36L374.54 125.16L374.85 124.17L375.18 123.5L375.5 123.22L381.27 123.99L380.95 124.27L380.62 124.95L380.31 125.94L380.05 127.13Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" d=\"M380.83 124.47L381.19 124.02L381.51 124.09L381.73 124.66L381.84 125.67L381.8 126.97L381.64 128.39L381.36 129.74L381.02 130.84L380.64 131.53L380.3 131.73L380.02 131.41L379.86 130.6L379.82 129.43L379.92 128.04L380.15 126.63L380.46 125.38Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M380.31 131.73L380.04 131.46L379.87 130.75L379.82 129.7L379.88 128.42L380.06 127.07L380.34 125.82L380.67 124.82L381.02 124.18L381.35 123.98\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M374.54 130.96L374.43 130.91L374.33 130.8L374.25 130.62L374.18 130.38L374.12 130.09L374.08 129.74L374.06 129.35L374.05 128.92L374.06 128.46L374.09 127.98L374.13 127.48L374.19 126.97L374.27 126.47L374.36 125.97L374.46 125.5L374.57 125.05L374.69 124.64L374.81 124.26L374.94 123.94L375.08 123.67L375.21 123.46L375.34 123.31L375.46 123.23L375.58 123.21L381.35 123.98L381.46 124.03L381.56 124.15L381.64 124.32L381.71 124.56L381.77 124.86L381.81 125.2L381.83 125.59L381.84 126.02L381.83 126.48L381.8 126.97L381.76 127.47L381.7 127.98L381.62 128.48L381.53 128.97L381.43 129.45L381.32 129.9L381.2 130.31L381.08 130.68L380.95 131L380.81 131.27L380.68 131.48L380.55 131.63L380.43 131.72L380.31 131.73Z\"/></g><g class=\"iso-solid\" data-p=\"41\" data-name=\"animation.pod0\" data-mat=\"gunmetal\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M308.06 206.55L308.15 205.3L308.41 204.07L308.83 202.88L309.43 201.74L310.17 200.67L311.06 199.69L312.08 198.8L313.22 198.03L314.45 197.39L315.77 196.88L317.14 196.5L318.56 196.28L320 196.2L321.44 196.28L322.86 196.5L324.23 196.88L325.55 197.39L326.78 198.03L327.92 198.8L328.94 199.69L329.83 200.67L330.57 201.74L331.17 202.88L331.59 204.07L331.85 205.3L331.94 206.55L331.94 211.16L331.85 212.41L331.59 213.64L331.17 214.83L330.57 215.97L329.83 217.04L328.94 218.02L327.92 218.9L326.78 219.67L325.55 220.32L324.23 220.83L322.86 221.2L321.44 221.43L320 221.5L318.56 221.43L317.14 221.2L315.77 220.83L314.45 220.32L313.22 219.67L312.08 218.9L311.06 218.02L310.17 217.04L309.43 215.97L308.83 214.83L308.41 213.64L308.15 212.41L308.06 211.16Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M329.17 199.93L330.36 201.4L331.23 203.03L331.76 204.76L331.94 206.55L331.94 211.16L331.76 209.37L331.23 207.64L330.36 206.01L329.17 204.54Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M327.46 198.47L328.36 199.16L329.17 199.93L329.17 204.54L328.36 203.77L327.46 203.08Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M325.12 197.2L326.33 197.78L327.46 198.47L327.46 203.08L326.33 202.39L325.12 201.81Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M322.46 196.42L323.81 196.74L325.12 197.2L325.12 201.81L323.81 201.36L322.46 201.04Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M308.06 206.55L308.25 204.72L308.81 202.95L309.72 201.29L310.95 199.79L312.47 198.51L314.23 197.49L316.17 196.75L318.24 196.32L320.35 196.21L322.46 196.42L322.46 201.04L320.35 200.82L318.24 200.93L316.17 201.36L314.23 202.1L312.47 203.13L310.95 204.41L309.72 205.9L308.81 207.56L308.25 209.33L308.06 211.16Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" style=\"--f:0.5\" d=\"M320 200.82L321.47 200.9L322.91 201.13L324.31 201.52L325.65 202.05L326.9 202.72L328.05 203.52L329.07 204.43L329.95 205.45L330.69 206.55L331.26 207.72L331.67 208.95L331.89 210.21L331.94 211.48L331.8 212.75L331.49 213.99L331 215.19L330.34 216.33L329.53 217.39L328.57 218.36L327.49 219.22L326.29 219.95L324.99 220.56L323.62 221.02L322.19 221.33L320.74 221.48L319.26 221.48L317.81 221.33L316.38 221.02L315.01 220.56L313.71 219.95L312.51 219.22L311.43 218.36L310.47 217.39L309.66 216.33L309 215.19L308.51 213.99L308.2 212.75L308.06 211.48L308.11 210.21L308.33 208.95L308.74 207.72L309.31 206.55L310.05 205.45L310.93 204.43L311.95 203.52L313.1 202.72L314.35 202.05L315.69 201.52L317.09 201.13L318.53 200.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M308.06 211.16L308.15 209.91L308.41 208.69L308.83 207.49L309.43 206.35L310.17 205.28L311.06 204.3L312.08 203.42L313.22 202.65L314.45 202L315.77 201.49L317.14 201.12L318.56 200.89L320 200.82L321.44 200.89L322.86 201.12L324.23 201.49L325.55 202L326.78 202.65L327.92 203.42L328.94 204.3L329.83 205.28L330.57 206.35L331.17 207.49L331.59 208.69L331.85 209.91L331.94 211.16\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"inner\" d=\"M308.06 208.15L308.2 206.88L308.51 205.63L309 204.43L309.65 203.29L310.46 202.22L311.42 201.25L312.51 200.39L313.71 199.66L315 199.05L316.38 198.59L317.8 198.28L319.26 198.12L320.74 198.12L322.2 198.28L323.62 198.59L325 199.05L326.29 199.66L327.49 200.39L328.58 201.25L329.54 202.22L330.35 203.29L331 204.43L331.49 205.63L331.8 206.88L331.94 208.15\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M308.06 206.55L308.15 205.3L308.41 204.07L308.83 202.88L309.43 201.74L310.17 200.67L311.06 199.69L312.08 198.8L313.22 198.03L314.45 197.39L315.77 196.88L317.14 196.5L318.56 196.28L320 196.2L321.44 196.28L322.86 196.5L324.23 196.88L325.55 197.39L326.78 198.03L327.92 198.8L328.94 199.69L329.83 200.67L330.57 201.74L331.17 202.88L331.59 204.07L331.85 205.3L331.94 206.55L331.94 211.16L331.85 212.41L331.59 213.64L331.17 214.83L330.57 215.97L329.83 217.04L328.94 218.02L327.92 218.9L326.78 219.67L325.55 220.32L324.23 220.83L322.86 221.2L321.44 221.43L320 221.5L318.56 221.43L317.14 221.2L315.77 220.83L314.45 220.32L313.22 219.67L312.08 218.9L311.06 218.02L310.17 217.04L309.43 215.97L308.83 214.83L308.41 213.64L308.15 212.41L308.06 211.16Z\"/></g><g class=\"iso-solid\" data-p=\"42\" data-name=\"animation.pod0.cap\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M312.4 211.16L312.47 210.3L312.66 209.46L312.98 208.64L313.42 207.87L313.97 207.15L314.63 206.51L315.37 205.94L316.2 205.46L317.09 205.08L318.03 204.8L319.01 204.63L320 204.58L320.99 204.63L321.97 204.8L322.91 205.08L323.8 205.46L324.63 205.94L325.37 206.51L326.03 207.15L326.58 207.87L327.02 208.64L327.34 209.46L327.53 210.3L327.6 211.16L327.6 212.79L327.53 213.65L327.34 214.49L327.02 215.31L326.58 216.08L326.03 216.8L325.37 217.44L324.63 218.01L323.8 218.49L322.91 218.87L321.97 219.15L320.99 219.31L320 219.37L319.01 219.31L318.03 219.15L317.09 218.87L316.2 218.49L315.37 218.01L314.63 217.44L313.97 216.8L313.42 216.08L312.98 215.31L312.66 214.49L312.47 213.65L312.4 212.79Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M325.84 206.95L326.8 208.22L327.4 209.65L327.6 211.16L327.6 212.79L327.4 211.28L326.8 209.85L325.84 208.58Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M324.75 206.02L325.84 206.95L325.84 208.58L324.75 207.65Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M323.26 205.21L324.75 206.02L324.75 207.65L323.26 206.84Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M321.56 204.72L323.26 205.21L323.26 206.84L321.56 206.35Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M312.4 211.16L312.64 209.51L313.36 207.96L314.5 206.62L316 205.57L317.75 204.87L319.65 204.59L321.56 204.72L321.56 206.35L319.65 206.21L317.75 206.5L316 207.19L314.5 208.24L313.36 209.59L312.64 211.13L312.4 212.79Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" style=\"--f:0.5\" d=\"M320 206.21L321.48 206.33L322.91 206.71L324.22 207.32L325.37 208.13L326.32 209.13L327.02 210.27L327.45 211.5L327.6 212.79L327.45 214.07L327.02 215.31L326.32 216.45L325.37 217.44L324.22 218.26L322.91 218.87L321.48 219.24L320 219.37L318.52 219.24L317.09 218.87L315.78 218.26L314.63 217.44L313.68 216.45L312.98 215.31L312.55 214.07L312.4 212.79L312.55 211.5L312.98 210.27L313.68 209.13L314.63 208.13L315.78 207.32L317.09 206.71L318.52 206.33Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M312.4 212.79L312.55 211.5L312.98 210.27L313.68 209.13L314.63 208.13L315.78 207.32L317.09 206.71L318.52 206.33L320 206.21L321.48 206.33L322.91 206.71L324.22 207.32L325.37 208.13L326.32 209.13L327.02 210.27L327.45 211.5L327.6 212.79\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M312.4 211.16L312.47 210.3L312.66 209.46L312.98 208.64L313.42 207.87L313.97 207.15L314.63 206.51L315.37 205.94L316.2 205.46L317.09 205.08L318.03 204.8L319.01 204.63L320 204.58L320.99 204.63L321.97 204.8L322.91 205.08L323.8 205.46L324.63 205.94L325.37 206.51L326.03 207.15L326.58 207.87L327.02 208.64L327.34 209.46L327.53 210.3L327.6 211.16L327.6 212.79L327.53 213.65L327.34 214.49L327.02 215.31L326.58 216.08L326.03 216.8L325.37 217.44L324.63 218.01L323.8 218.49L322.91 218.87L321.97 219.15L320.99 219.31L320 219.37L319.01 219.31L318.03 219.15L317.09 218.87L316.2 218.49L315.37 218.01L314.63 217.44L313.97 216.8L313.42 216.08L312.98 215.31L312.66 214.49L312.47 213.65L312.4 212.79Z\"/></g><g class=\"iso-solid\" data-p=\"56\" data-name=\"svg.clip1\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M277.94 136.37L278.24 136.26L278.56 136.21L278.9 136.22L279.25 136.3L279.61 136.44L279.97 136.63L280.33 136.89L280.67 137.19L281 137.54L281.31 137.92L281.59 138.35L281.83 138.79L282.04 139.26L282.21 139.73L282.34 140.21L282.42 140.68L282.45 141.14L282.44 141.58L282.38 141.99L282.28 142.36L282.13 142.68L281.93 142.96L281.7 143.19L281.44 143.36L277.22 145.47L276.92 145.58L276.6 145.63L276.26 145.61L275.91 145.54L275.55 145.4L275.19 145.2L274.83 144.95L274.49 144.65L274.16 144.3L273.85 143.91L273.57 143.49L273.33 143.05L273.12 142.58L272.95 142.1L272.82 141.63L272.74 141.15L272.71 140.7L272.72 140.26L272.78 139.85L272.88 139.48L273.03 139.15L273.23 138.88L273.46 138.65L273.72 138.48Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M282.07 139.34L282.41 140.63L282.41 141.82L282.07 142.77L281.44 143.36L277.22 145.47L277.85 144.88L278.19 143.93L278.19 142.74L277.85 141.45Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M281.7 138.54L282.07 139.34L277.85 141.45L277.47 140.65Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M281.13 137.69L281.7 138.54L277.47 140.65L276.91 139.81Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M280.43 136.97L281.13 137.69L276.91 139.81L276.2 139.08Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M277.94 136.37L278.7 136.21L279.56 136.42L280.43 136.97L276.2 139.08L275.33 138.53L274.48 138.32L273.72 138.48Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" d=\"M275.47 138.59L276.47 139.32L277.33 140.4L277.94 141.7L278.22 143.04L278.13 144.23L277.67 145.12L276.92 145.58L275.98 145.56L274.96 145.05L274.01 144.13L273.26 142.91L272.81 141.57L272.72 140.29L272.99 139.23L273.61 138.54L274.47 138.32Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M273.72 138.48L274.56 138.32L275.51 138.61L276.45 139.3L277.27 140.31L277.88 141.53L278.2 142.8L278.18 143.97L277.84 144.89L277.22 145.47\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M277.94 136.37L278.24 136.26L278.56 136.21L278.9 136.22L279.25 136.3L279.61 136.44L279.97 136.63L280.33 136.89L280.67 137.19L281 137.54L281.31 137.92L281.59 138.35L281.83 138.79L282.04 139.26L282.21 139.73L282.34 140.21L282.42 140.68L282.45 141.14L282.44 141.58L282.38 141.99L282.28 142.36L282.13 142.68L281.93 142.96L281.7 143.19L281.44 143.36L277.22 145.47L276.92 145.58L276.6 145.63L276.26 145.61L275.91 145.54L275.55 145.4L275.19 145.2L274.83 144.95L274.49 144.65L274.16 144.3L273.85 143.91L273.57 143.49L273.33 143.05L273.12 142.58L272.95 142.1L272.82 141.63L272.74 141.15L272.71 140.7L272.72 140.26L272.78 139.85L272.88 139.48L273.03 139.15L273.23 138.88L273.46 138.65L273.72 138.48Z\"/></g><g class=\"iso-solid\" data-p=\"61\" data-name=\"stagger.gear\" data-mat=\"gunmetal\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M378.63 113.13L378.61 113.88L378.56 114.62L378.46 115.37L378.33 116.12L378.16 116.86L377.95 117.6L377.7 118.34L377.41 119.08L377.09 119.81L376.73 120.53L376.33 121.26L375.9 121.97L375.43 122.68L374.92 123.39L374.38 124.09L373.8 124.78L373.19 125.46L372.55 126.14L371.86 126.8L371.15 127.46L370.4 128.11L369.62 128.75L368.8 129.38L367.96 129.99L367.08 130.6L366.17 131.2L365.23 131.78L364.27 132.35L363.27 132.91L362.25 133.46L361.19 133.99L360.12 134.51L359.01 135.01L357.88 135.5L356.72 135.98L355.54 136.44L354.34 136.89L353.12 137.32L351.87 137.73L350.6 138.13L349.32 138.52L348.01 138.88L346.69 139.23L345.34 139.56L343.98 139.88L342.61 140.18L341.22 140.46L339.82 140.72L338.4 140.96L336.98 141.19L335.54 141.4L334.09 141.59L332.63 141.76L331.16 141.91L329.69 142.04L328.21 142.16L326.72 142.25L325.23 142.33L323.74 142.38L322.25 142.42L320.75 142.44L319.25 142.44L317.75 142.42L316.26 142.38L314.77 142.33L313.28 142.25L311.79 142.16L310.31 142.04L308.84 141.91L307.37 141.76L305.91 141.59L304.46 141.4L303.02 141.19L301.6 140.96L300.18 140.72L298.78 140.46L297.39 140.18L296.02 139.88L294.66 139.56L293.31 139.23L291.99 138.88L290.68 138.52L289.4 138.13L288.13 137.73L286.88 137.32L285.66 136.89L284.46 136.44L283.28 135.98L282.12 135.5L280.99 135.01L279.88 134.51L278.81 133.99L277.75 133.46L276.73 132.91L275.73 132.35L274.77 131.78L273.83 131.2L272.92 130.6L272.04 129.99L271.2 129.38L270.38 128.75L269.6 128.11L268.85 127.46L268.14 126.8L267.45 126.14L266.81 125.46L266.2 124.78L265.62 124.09L265.08 123.39L264.57 122.68L264.1 121.97L263.67 121.26L263.27 120.53L262.91 119.81L262.59 119.08L262.3 118.34L262.05 117.6L261.84 116.86L261.67 116.12L261.54 115.37L261.44 114.62L261.39 113.88L261.37 113.13L261.37 99.96L261.39 99.21L261.44 98.47L261.54 97.72L261.67 96.97L261.84 96.23L262.05 95.49L262.3 94.75L262.59 94.01L262.91 93.28L263.27 92.56L263.67 91.83L264.1 91.12L264.57 90.41L265.08 89.7L265.62 89L266.2 88.31L266.81 87.63L267.45 86.95L268.14 86.29L268.85 85.63L269.6 84.98L270.38 84.34L271.2 83.71L272.04 83.1L272.92 82.49L273.83 81.89L274.77 81.31L275.73 80.74L276.73 80.18L277.75 79.63L278.81 79.1L279.88 78.58L280.99 78.08L282.12 77.59L283.28 77.11L284.46 76.65L285.66 76.2L286.88 75.77L288.13 75.36L289.4 74.96L290.68 74.57L291.99 74.21L293.31 73.86L294.66 73.53L296.02 73.21L297.39 72.91L298.78 72.63L300.18 72.37L301.6 72.13L303.02 71.9L304.46 71.69L305.91 71.5L307.37 71.33L308.84 71.18L310.31 71.05L311.79 70.93L313.28 70.84L314.77 70.76L316.26 70.71L317.75 70.67L319.25 70.65L320.75 70.65L322.25 70.67L323.74 70.71L325.23 70.76L326.72 70.84L328.21 70.93L329.69 71.05L331.16 71.18L332.63 71.33L334.09 71.5L335.54 71.69L336.98 71.9L338.4 72.13L339.82 72.37L341.22 72.63L342.61 72.91L343.98 73.21L345.34 73.53L346.69 73.86L348.01 74.21L349.32 74.57L350.6 74.96L351.87 75.36L353.12 75.77L354.34 76.2L355.54 76.65L356.72 77.11L357.88 77.59L359.01 78.08L360.12 78.58L361.19 79.1L362.25 79.63L363.27 80.18L364.27 80.74L365.23 81.31L366.17 81.89L367.08 82.49L367.96 83.1L368.8 83.71L369.62 84.34L370.4 84.98L371.15 85.63L371.86 86.29L372.55 86.95L373.19 87.63L373.8 88.31L374.38 89L374.92 89.7L375.43 90.41L375.9 91.12L376.33 91.83L376.73 92.56L377.09 93.28L377.41 94.01L377.7 94.75L377.95 95.49L378.16 96.23L378.33 96.97L378.46 97.72L378.56 98.47L378.61 99.21L378.63 99.96Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M378.63 113.13L378.51 115.04L378.13 116.95L377.51 118.85L376.64 120.72L375.52 122.55L374.17 124.35L372.59 126.09L370.78 127.79L368.75 129.41L366.52 130.97L364.08 132.46L361.46 133.86L358.66 135.17L355.69 136.39L352.57 137.5L349.32 138.52L345.93 139.42L342.44 140.21L338.85 140.89L335.18 141.45L331.44 141.88L327.65 142.19L323.83 142.38L320 142.44L320 129.28L323.83 129.22L327.65 129.03L331.44 128.72L335.18 128.28L338.85 127.72L342.44 127.05L345.93 126.26L349.32 125.35L352.57 124.34L355.69 123.22L358.66 122L361.46 120.69L364.08 119.29L366.52 117.81L368.75 116.25L370.78 114.62L372.59 112.93L374.17 111.18L375.52 109.39L376.64 107.55L377.51 105.68L378.13 103.79L378.51 101.88L378.63 99.96Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M320 142.44L316.28 142.38L312.57 142.21L308.89 141.91L305.26 141.5L301.68 140.98L301.68 127.81L305.26 128.34L308.89 128.75L312.57 129.04L316.28 129.22L320 129.28Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M301.68 140.98L298.55 140.41L295.48 139.76L292.5 139.02L289.6 138.2L286.8 137.29L284.11 136.31L281.53 135.25L281.53 122.09L284.11 123.15L286.8 124.13L289.6 125.03L292.5 125.85L295.48 126.59L298.55 127.25L301.68 127.81Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M281.53 135.25L278.93 134.05L276.49 132.78L274.19 131.43L272.07 130.01L270.12 128.54L268.35 127.01L266.77 125.42L265.39 123.8L264.2 122.13L263.22 120.43L263.22 107.27L264.2 108.97L265.39 110.63L266.77 112.26L268.35 113.84L270.12 115.37L272.07 116.85L274.19 118.26L276.49 119.61L278.93 120.89L281.53 122.09Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M263.22 120.43L262.41 118.63L261.83 116.81L261.48 114.97L261.37 113.13L261.37 99.96L261.48 101.81L261.83 103.64L262.41 105.47L263.22 107.27Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M361.46 120.69L359.8 121.49L358.08 122.26L356.3 122.99L354.46 123.68L352.57 124.34L350.64 124.96L348.65 125.54L346.62 126.08L344.55 126.59L342.44 127.05L340.29 127.47L338.12 127.84L335.92 128.18L333.69 128.47L331.44 128.72L329.17 128.92L326.89 129.08L324.6 129.19L322.3 129.26L320 129.28L317.7 129.26L315.4 129.19L313.11 129.08L310.83 128.92L308.56 128.72L306.31 128.47L304.08 128.18L301.88 127.84L299.71 127.47L297.56 127.05L295.45 126.59L293.38 126.08L291.35 125.54L289.36 124.96L287.43 124.34L285.54 123.68L283.7 122.99L281.92 122.26L280.2 121.49L278.54 120.69L276.94 119.86L275.41 119L273.95 118.11L272.56 117.19L271.25 116.25L270.01 115.28L268.84 114.29L267.76 113.27L266.75 112.24L265.83 111.18L264.99 110.11L264.24 109.02L263.57 107.92L262.99 106.81L262.49 105.68L262.09 104.55L261.77 103.41L261.55 102.26L261.41 101.11L261.37 99.96L261.41 98.81L261.55 97.66L261.77 96.52L262.09 95.38L262.49 94.24L262.99 93.12L263.57 92.01L264.24 90.9L264.99 89.82L265.83 88.74L266.75 87.69L267.76 86.65L268.84 85.64L270.01 84.64L271.25 83.68L272.56 82.73L273.95 81.81L275.41 80.92L276.94 80.06L278.54 79.23L280.2 78.43L281.92 77.67L283.7 76.94L285.54 76.25L287.43 75.59L289.36 74.97L291.35 74.38L293.38 73.84L295.45 73.34L297.56 72.88L299.71 72.46L301.88 72.08L304.08 71.75L306.31 71.46L308.56 71.21L310.83 71.01L313.11 70.85L315.4 70.74L317.7 70.67L320 70.65L322.3 70.67L324.6 70.74L326.89 70.85L329.17 71.01L331.44 71.21L333.69 71.46L335.92 71.75L338.12 72.08L340.29 72.46L342.44 72.88L344.55 73.34L346.62 73.84L348.65 74.38L350.64 74.97L352.57 75.59L354.46 76.25L356.3 76.94L358.08 77.67L359.8 78.43L361.46 79.23L363.06 80.06L364.59 80.92L366.05 81.81L367.44 82.73L368.75 83.68L369.99 84.64L371.16 85.64L372.24 86.65L373.25 87.69L374.17 88.74L375.01 89.82L375.76 90.9L376.43 92.01L377.01 93.12L377.51 94.24L377.91 95.38L378.23 96.52L378.45 97.66L378.59 98.81L378.63 99.96L378.59 101.11L378.45 102.26L378.23 103.41L377.91 104.55L377.51 105.68L377.01 106.81L376.43 107.92L375.76 109.02L375.01 110.11L374.17 111.18L373.25 112.24L372.24 113.27L371.16 114.29L369.99 115.28L368.75 116.25L367.44 117.19L366.05 118.11L364.59 119L363.06 119.86Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M378.63 99.96L378.61 100.71L378.56 101.46L378.46 102.21L378.33 102.95L378.16 103.7L377.95 104.44L377.7 105.18L377.41 105.91L377.09 106.64L376.73 107.37L376.33 108.09L375.9 108.81L375.43 109.52L374.92 110.22L374.38 110.92L373.8 111.61L373.19 112.3L372.55 112.97L371.86 113.64L371.15 114.3L370.4 114.94L369.62 115.58L368.8 116.21L367.96 116.83L367.08 117.44L366.17 118.03L365.23 118.62L364.27 119.19L363.27 119.75L362.25 120.29L361.19 120.82L360.12 121.34L359.01 121.85L357.88 122.34L356.72 122.82L355.54 123.28L354.34 123.72L353.12 124.16L351.87 124.57L350.6 124.97L349.32 125.35L348.01 125.72L346.69 126.07L345.34 126.4L343.98 126.71L342.61 127.01L341.22 127.29L339.82 127.55L338.4 127.8L336.98 128.02L335.54 128.23L334.09 128.42L332.63 128.59L331.16 128.74L329.69 128.88L328.21 128.99L326.72 129.09L325.23 129.16L323.74 129.22L322.25 129.26L320.75 129.28L319.25 129.28L317.75 129.26L316.26 129.22L314.77 129.16L313.28 129.09L311.79 128.99L310.31 128.88L308.84 128.74L307.37 128.59L305.91 128.42L304.46 128.23L303.02 128.02L301.6 127.8L300.18 127.55L298.78 127.29L297.39 127.01L296.02 126.71L294.66 126.4L293.31 126.07L291.99 125.72L290.68 125.35L289.4 124.97L288.13 124.57L286.88 124.16L285.66 123.72L284.46 123.28L283.28 122.82L282.12 122.34L280.99 121.85L279.88 121.34L278.81 120.82L277.75 120.29L276.73 119.75L275.73 119.19L274.77 118.62L273.83 118.03L272.92 117.44L272.04 116.83L271.2 116.21L270.38 115.58L269.6 114.94L268.85 114.3L268.14 113.64L267.45 112.97L266.81 112.3L266.2 111.61L265.62 110.92L265.08 110.22L264.57 109.52L264.1 108.81L263.67 108.09L263.27 107.37L262.91 106.64L262.59 105.91L262.3 105.18L262.05 104.44L261.84 103.7L261.67 102.95L261.54 102.21L261.44 101.46L261.39 100.71L261.37 99.96\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"inner\" d=\"M378.63 106.85L378.6 107.59L378.52 108.33L378.41 109.07L378.27 109.81L378.08 110.55L377.86 111.29L377.6 112.02L377.31 112.75L376.97 113.47L376.6 114.19L376.2 114.91L375.75 115.62L375.27 116.32L374.76 117.02L374.21 117.71L373.63 118.4L373.01 119.07L372.36 119.74L371.67 120.4L370.95 121.05L370.2 121.7L369.41 122.33L368.59 122.95L367.75 123.56L366.87 124.16L365.96 124.75L365.02 125.33L364.05 125.89L363.06 126.44L362.03 126.98L360.98 127.51L359.9 128.02L358.8 128.52L357.67 129.01L356.52 129.48L355.35 129.94L354.15 130.38L352.93 130.8L351.69 131.21L350.42 131.61L349.14 131.98L347.84 132.35L346.52 132.69L345.19 133.02L343.84 133.33L342.47 133.62L341.09 133.9L339.7 134.16L338.29 134.4L336.87 134.62L335.44 134.83L334 135.01L332.55 135.18L331.09 135.33L329.63 135.46L328.16 135.58L326.68 135.67L325.2 135.75L323.72 135.8L322.23 135.84L320.74 135.86L319.26 135.86L317.77 135.84L316.28 135.8L314.8 135.75L313.32 135.67L311.84 135.58L310.37 135.46L308.91 135.33L307.45 135.18L306 135.01L304.56 134.83L303.13 134.62L301.71 134.4L300.3 134.16L298.91 133.9L297.53 133.62L296.16 133.33L294.81 133.02L293.48 132.69L292.16 132.35L290.86 131.98L289.58 131.61L288.31 131.21L287.07 130.8L285.85 130.38L284.65 129.94L283.48 129.48L282.33 129.01L281.2 128.52L280.1 128.02L279.02 127.51L277.97 126.98L276.94 126.44L275.95 125.89L274.98 125.33L274.04 124.75L273.13 124.16L272.25 123.56L271.41 122.95L270.59 122.33L269.8 121.7L269.05 121.05L268.33 120.4L267.64 119.74L266.99 119.07L266.37 118.4L265.79 117.71L265.24 117.02L264.73 116.32L264.25 115.62L263.8 114.91L263.4 114.19L263.03 113.47L262.69 112.75L262.4 112.02L262.14 111.29L261.92 110.55L261.73 109.81L261.59 109.07L261.48 108.33L261.4 107.59L261.37 106.85\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M378.63 113.13L378.61 113.88L378.56 114.62L378.46 115.37L378.33 116.12L378.16 116.86L377.95 117.6L377.7 118.34L377.41 119.08L377.09 119.81L376.73 120.53L376.33 121.26L375.9 121.97L375.43 122.68L374.92 123.39L374.38 124.09L373.8 124.78L373.19 125.46L372.55 126.14L371.86 126.8L371.15 127.46L370.4 128.11L369.62 128.75L368.8 129.38L367.96 129.99L367.08 130.6L366.17 131.2L365.23 131.78L364.27 132.35L363.27 132.91L362.25 133.46L361.19 133.99L360.12 134.51L359.01 135.01L357.88 135.5L356.72 135.98L355.54 136.44L354.34 136.89L353.12 137.32L351.87 137.73L350.6 138.13L349.32 138.52L348.01 138.88L346.69 139.23L345.34 139.56L343.98 139.88L342.61 140.18L341.22 140.46L339.82 140.72L338.4 140.96L336.98 141.19L335.54 141.4L334.09 141.59L332.63 141.76L331.16 141.91L329.69 142.04L328.21 142.16L326.72 142.25L325.23 142.33L323.74 142.38L322.25 142.42L320.75 142.44L319.25 142.44L317.75 142.42L316.26 142.38L314.77 142.33L313.28 142.25L311.79 142.16L310.31 142.04L308.84 141.91L307.37 141.76L305.91 141.59L304.46 141.4L303.02 141.19L301.6 140.96L300.18 140.72L298.78 140.46L297.39 140.18L296.02 139.88L294.66 139.56L293.31 139.23L291.99 138.88L290.68 138.52L289.4 138.13L288.13 137.73L286.88 137.32L285.66 136.89L284.46 136.44L283.28 135.98L282.12 135.5L280.99 135.01L279.88 134.51L278.81 133.99L277.75 133.46L276.73 132.91L275.73 132.35L274.77 131.78L273.83 131.2L272.92 130.6L272.04 129.99L271.2 129.38L270.38 128.75L269.6 128.11L268.85 127.46L268.14 126.8L267.45 126.14L266.81 125.46L266.2 124.78L265.62 124.09L265.08 123.39L264.57 122.68L264.1 121.97L263.67 121.26L263.27 120.53L262.91 119.81L262.59 119.08L262.3 118.34L262.05 117.6L261.84 116.86L261.67 116.12L261.54 115.37L261.44 114.62L261.39 113.88L261.37 113.13L261.37 99.96L261.39 99.21L261.44 98.47L261.54 97.72L261.67 96.97L261.84 96.23L262.05 95.49L262.3 94.75L262.59 94.01L262.91 93.28L263.27 92.56L263.67 91.83L264.1 91.12L264.57 90.41L265.08 89.7L265.62 89L266.2 88.31L266.81 87.63L267.45 86.95L268.14 86.29L268.85 85.63L269.6 84.98L270.38 84.34L271.2 83.71L272.04 83.1L272.92 82.49L273.83 81.89L274.77 81.31L275.73 80.74L276.73 80.18L277.75 79.63L278.81 79.1L279.88 78.58L280.99 78.08L282.12 77.59L283.28 77.11L284.46 76.65L285.66 76.2L286.88 75.77L288.13 75.36L289.4 74.96L290.68 74.57L291.99 74.21L293.31 73.86L294.66 73.53L296.02 73.21L297.39 72.91L298.78 72.63L300.18 72.37L301.6 72.13L303.02 71.9L304.46 71.69L305.91 71.5L307.37 71.33L308.84 71.18L310.31 71.05L311.79 70.93L313.28 70.84L314.77 70.76L316.26 70.71L317.75 70.67L319.25 70.65L320.75 70.65L322.25 70.67L323.74 70.71L325.23 70.76L326.72 70.84L328.21 70.93L329.69 71.05L331.16 71.18L332.63 71.33L334.09 71.5L335.54 71.69L336.98 71.9L338.4 72.13L339.82 72.37L341.22 72.63L342.61 72.91L343.98 73.21L345.34 73.53L346.69 73.86L348.01 74.21L349.32 74.57L350.6 74.96L351.87 75.36L353.12 75.77L354.34 76.2L355.54 76.65L356.72 77.11L357.88 77.59L359.01 78.08L360.12 78.58L361.19 79.1L362.25 79.63L363.27 80.18L364.27 80.74L365.23 81.31L366.17 81.89L367.08 82.49L367.96 83.1L368.8 83.71L369.62 84.34L370.4 84.98L371.15 85.63L371.86 86.29L372.55 86.95L373.19 87.63L373.8 88.31L374.38 89L374.92 89.7L375.43 90.41L375.9 91.12L376.33 91.83L376.73 92.56L377.09 93.28L377.41 94.01L377.7 94.75L377.95 95.49L378.16 96.23L378.33 96.97L378.46 97.72L378.56 98.47L378.61 99.21L378.63 99.96Z\"/></g><g class=\"iso-solid\" data-p=\"86\" data-name=\"timeline.step0\" data-mat=\"steel\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M374.29 98.08L374.27 98.83L374.21 99.58L374.1 100.32L373.96 101.07L373.78 101.81L373.55 102.55L373.28 103.29L372.98 104.02L372.63 104.75L372.24 105.47L371.81 106.19L371.35 106.9L370.84 107.6L370.3 108.3L369.72 108.99L369.1 109.67L368.44 110.34L367.75 111L367.02 111.65L366.25 112.3L365.45 112.93L364.61 113.55L363.74 114.16L362.84 114.75L361.91 115.34L360.94 115.91L359.94 116.47L358.91 117.01L357.86 117.54L356.77 118.05L355.66 118.55L354.51 119.04L353.35 119.5L352.15 119.95L350.93 120.39L349.69 120.81L348.43 121.21L347.14 121.59L345.84 121.96L344.51 122.3L343.17 122.63L341.81 122.94L340.43 123.23L339.04 123.5L337.63 123.76L336.21 123.99L334.77 124.2L333.33 124.4L331.87 124.57L330.41 124.72L328.94 124.86L327.46 124.97L325.97 125.06L324.48 125.13L322.99 125.19L321.5 125.22L320 125.23L318.5 125.22L317.01 125.19L315.52 125.13L314.03 125.06L312.54 124.97L311.06 124.86L309.59 124.72L308.13 124.57L306.67 124.4L305.23 124.2L303.79 123.99L302.37 123.76L300.96 123.5L299.57 123.23L298.19 122.94L296.83 122.63L295.49 122.3L294.16 121.96L292.86 121.59L291.57 121.21L290.31 120.81L289.07 120.39L287.85 119.95L286.65 119.5L285.49 119.04L284.34 118.55L283.23 118.05L282.14 117.54L281.09 117.01L280.06 116.47L279.06 115.91L278.09 115.34L277.16 114.75L276.26 114.16L275.39 113.55L274.55 112.93L273.75 112.3L272.98 111.65L272.25 111L271.56 110.34L270.9 109.67L270.28 108.99L269.7 108.3L269.16 107.6L268.65 106.9L268.19 106.19L267.76 105.47L267.37 104.75L267.02 104.02L266.72 103.29L266.45 102.55L266.22 101.81L266.04 101.07L265.9 100.32L265.79 99.58L265.73 98.83L265.71 98.08L265.71 91.97L265.73 91.22L265.79 90.47L265.9 89.73L266.04 88.98L266.22 88.24L266.45 87.5L266.72 86.77L267.02 86.03L267.37 85.31L267.76 84.58L268.19 83.87L268.65 83.16L269.16 82.45L269.7 81.76L270.28 81.07L270.9 80.39L271.56 79.71L272.25 79.05L272.98 78.4L273.75 77.75L274.55 77.12L275.39 76.5L276.26 75.89L277.16 75.3L278.09 74.71L279.06 74.14L280.06 73.59L281.09 73.04L282.14 72.51L283.23 72L284.34 71.5L285.49 71.02L286.65 70.55L287.85 70.1L289.07 69.66L290.31 69.25L291.57 68.84L292.86 68.46L294.16 68.1L295.49 67.75L296.83 67.42L298.19 67.11L299.57 66.82L300.96 66.55L302.37 66.3L303.79 66.06L305.23 65.85L306.67 65.66L308.13 65.48L309.59 65.33L311.06 65.2L312.54 65.08L314.03 64.99L315.52 64.92L317.01 64.87L318.5 64.84L320 64.82L321.5 64.84L322.99 64.87L324.48 64.92L325.97 64.99L327.46 65.08L328.94 65.2L330.41 65.33L331.87 65.48L333.33 65.66L334.77 65.85L336.21 66.06L337.63 66.3L339.04 66.55L340.43 66.82L341.81 67.11L343.17 67.42L344.51 67.75L345.84 68.1L347.14 68.46L348.43 68.84L349.69 69.25L350.93 69.66L352.15 70.1L353.35 70.55L354.51 71.02L355.66 71.5L356.77 72L357.86 72.51L358.91 73.04L359.94 73.59L360.94 74.14L361.91 74.71L362.84 75.3L363.74 75.89L364.61 76.5L365.45 77.12L366.25 77.75L367.02 78.4L367.75 79.05L368.44 79.71L369.1 80.39L369.72 81.07L370.3 81.76L370.84 82.45L371.35 83.16L371.81 83.87L372.24 84.58L372.63 85.31L372.98 86.03L373.28 86.77L373.55 87.5L373.78 88.24L373.96 88.98L374.1 89.73L374.21 90.47L374.27 91.22L374.29 91.97Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M374.29 98.08L374.17 99.86L373.83 101.63L373.25 103.38L372.44 105.11L371.41 106.81L370.16 108.47L368.69 110.09L367.02 111.65L365.14 113.16L363.07 114.61L360.82 115.98L358.39 117.28L355.8 118.49L353.05 119.62L350.16 120.65L347.14 121.59L344.01 122.43L340.78 123.16L337.45 123.79L334.05 124.3L330.59 124.71L327.09 124.99L323.55 125.17L320 125.23L320 119.11L323.55 119.06L327.09 118.88L330.59 118.59L334.05 118.19L337.45 117.67L340.78 117.05L344.01 116.32L347.14 115.48L350.16 114.54L353.05 113.51L355.8 112.38L358.39 111.16L360.82 109.87L363.07 108.49L365.14 107.05L367.02 105.54L368.69 103.98L370.16 102.36L371.41 100.7L372.44 99L373.25 97.27L373.83 95.51L374.17 93.75L374.29 91.97Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M320 125.23L316.55 125.17L313.12 125.01L309.71 124.74L306.35 124.35L303.04 123.87L303.04 117.76L306.35 118.24L309.71 118.62L313.12 118.9L316.55 119.06L320 119.11Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M303.04 123.87L300.14 123.35L297.3 122.74L294.53 122.06L291.85 121.29L289.26 120.46L286.77 119.55L284.38 118.57L284.38 112.46L286.77 113.44L289.26 114.34L291.85 115.18L294.53 115.94L297.3 116.63L300.14 117.23L303.04 117.76Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M284.38 118.57L281.98 117.46L279.71 116.28L277.59 115.03L275.62 113.72L273.82 112.35L272.18 110.93L270.72 109.47L269.43 107.96L268.33 106.42L267.42 104.84L267.42 98.73L268.33 100.31L269.43 101.85L270.72 103.36L272.18 104.82L273.82 106.24L275.62 107.61L277.59 108.92L279.71 110.16L281.98 111.35L284.38 112.46Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M267.42 104.84L266.68 103.18L266.14 101.49L265.82 99.79L265.71 98.08L265.71 91.97L265.82 93.68L266.14 95.38L266.68 97.07L267.42 98.73Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M358.39 111.16L356.85 111.9L355.26 112.61L353.61 113.29L351.91 113.93L350.16 114.54L348.37 115.11L346.53 115.65L344.65 116.16L342.73 116.62L340.78 117.05L338.79 117.44L336.78 117.79L334.74 118.1L332.67 118.36L330.59 118.59L328.49 118.78L326.38 118.93L324.26 119.03L322.13 119.09L320 119.11L317.87 119.09L315.74 119.03L313.62 118.93L311.51 118.78L309.41 118.59L307.33 118.36L305.26 118.1L303.22 117.79L301.21 117.44L299.22 117.05L297.27 116.62L295.35 116.16L293.47 115.65L291.63 115.11L289.84 114.54L288.09 113.93L286.39 113.29L284.74 112.61L283.15 111.9L281.61 111.16L280.13 110.4L278.72 109.6L277.37 108.78L276.08 107.93L274.86 107.05L273.71 106.15L272.63 105.23L271.63 104.29L270.7 103.33L269.84 102.36L269.07 101.37L268.37 100.36L267.75 99.34L267.21 98.31L266.75 97.27L266.38 96.22L266.09 95.16L265.88 94.1L265.75 93.04L265.71 91.97L265.75 90.9L265.88 89.84L266.09 88.78L266.38 87.72L266.75 86.67L267.21 85.63L267.75 84.6L268.37 83.58L269.07 82.57L269.84 81.58L270.7 80.61L271.63 79.65L272.63 78.71L273.71 77.79L274.86 76.89L276.08 76.01L277.37 75.16L278.72 74.34L280.13 73.54L281.61 72.78L283.15 72.04L284.74 71.33L286.39 70.65L288.09 70.01L289.84 69.4L291.63 68.83L293.47 68.29L295.35 67.78L297.27 67.32L299.22 66.89L301.21 66.5L303.22 66.15L305.26 65.84L307.33 65.57L309.41 65.35L311.51 65.16L313.62 65.01L315.74 64.91L317.87 64.85L320 64.82L322.13 64.85L324.26 64.91L326.38 65.01L328.49 65.16L330.59 65.35L332.67 65.57L334.74 65.84L336.78 66.15L338.79 66.5L340.78 66.89L342.73 67.32L344.65 67.78L346.53 68.29L348.37 68.83L350.16 69.4L351.91 70.01L353.61 70.65L355.26 71.33L356.85 72.04L358.39 72.78L359.87 73.54L361.28 74.34L362.63 75.16L363.92 76.01L365.14 76.89L366.29 77.79L367.37 78.71L368.37 79.65L369.3 80.61L370.16 81.58L370.93 82.57L371.63 83.58L372.25 84.6L372.79 85.63L373.25 86.67L373.62 87.72L373.91 88.78L374.12 89.84L374.25 90.9L374.29 91.97L374.25 93.04L374.12 94.1L373.91 95.16L373.62 96.22L373.25 97.27L372.79 98.31L372.25 99.34L371.63 100.36L370.93 101.37L370.16 102.36L369.3 103.33L368.37 104.29L367.37 105.23L366.29 106.15L365.14 107.05L363.92 107.93L362.63 108.78L361.28 109.6L359.87 110.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M374.29 91.97L374.27 92.72L374.21 93.47L374.1 94.21L373.96 94.96L373.78 95.7L373.55 96.44L373.28 97.17L372.98 97.91L372.63 98.63L372.24 99.36L371.81 100.07L371.35 100.78L370.84 101.49L370.3 102.18L369.72 102.87L369.1 103.55L368.44 104.23L367.75 104.89L367.02 105.54L366.25 106.19L365.45 106.82L364.61 107.44L363.74 108.05L362.84 108.64L361.91 109.23L360.94 109.8L359.94 110.35L358.91 110.9L357.86 111.43L356.77 111.94L355.66 112.44L354.51 112.92L353.35 113.39L352.15 113.84L350.93 114.28L349.69 114.69L348.43 115.1L347.14 115.48L345.84 115.84L344.51 116.19L343.17 116.52L341.81 116.83L340.43 117.12L339.04 117.39L337.63 117.64L336.21 117.88L334.77 118.09L333.33 118.28L331.87 118.46L330.41 118.61L328.94 118.74L327.46 118.86L325.97 118.95L324.48 119.02L322.99 119.07L321.5 119.1L320 119.11L318.5 119.1L317.01 119.07L315.52 119.02L314.03 118.95L312.54 118.86L311.06 118.74L309.59 118.61L308.13 118.46L306.67 118.28L305.23 118.09L303.79 117.88L302.37 117.64L300.96 117.39L299.57 117.12L298.19 116.83L296.83 116.52L295.49 116.19L294.16 115.84L292.86 115.48L291.57 115.1L290.31 114.69L289.07 114.28L287.85 113.84L286.65 113.39L285.49 112.92L284.34 112.44L283.23 111.94L282.14 111.43L281.09 110.9L280.06 110.35L279.06 109.8L278.09 109.23L277.16 108.64L276.26 108.05L275.39 107.44L274.55 106.82L273.75 106.19L272.98 105.54L272.25 104.89L271.56 104.23L270.9 103.55L270.28 102.87L269.7 102.18L269.16 101.49L268.65 100.78L268.19 100.07L267.76 99.36L267.37 98.63L267.02 97.91L266.72 97.17L266.45 96.44L266.22 95.7L266.04 94.96L265.9 94.21L265.79 93.47L265.73 92.72L265.71 91.97\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"inner\" d=\"M374.29 95.37L374.25 96.12L374.17 96.87L374.05 97.62L373.89 98.36L373.69 99.1L373.44 99.84L373.16 100.58L372.84 101.31L372.47 102.04L372.07 102.76L371.62 103.48L371.14 104.19L370.62 104.89L370.06 105.58L369.46 106.27L368.82 106.95L368.15 107.62L367.44 108.28L366.69 108.93L365.91 109.56L365.09 110.19L364.24 110.81L363.35 111.41L362.43 112.01L361.48 112.59L360.5 113.15L359.49 113.7L358.44 114.24L357.37 114.76L356.27 115.27L355.14 115.77L353.98 116.24L352.8 116.7L351.59 117.15L350.36 117.58L349.11 117.99L347.83 118.38L346.54 118.75L345.22 119.11L343.88 119.45L342.53 119.77L341.16 120.07L339.77 120.35L338.36 120.62L336.95 120.86L335.52 121.09L334.08 121.29L332.62 121.47L331.16 121.64L329.69 121.78L328.21 121.91L326.73 122.01L325.24 122.09L323.74 122.15L322.25 122.19L320.75 122.22L319.25 122.22L317.75 122.19L316.26 122.15L314.76 122.09L313.27 122.01L311.79 121.91L310.31 121.78L308.84 121.64L307.38 121.47L305.92 121.29L304.48 121.09L303.05 120.86L301.64 120.62L300.23 120.35L298.84 120.07L297.47 119.77L296.12 119.45L294.78 119.11L293.46 118.75L292.17 118.38L290.89 117.99L289.64 117.58L288.41 117.15L287.2 116.7L286.02 116.24L284.86 115.77L283.73 115.27L282.63 114.76L281.56 114.24L280.51 113.7L279.5 113.15L278.52 112.59L277.57 112.01L276.65 111.41L275.76 110.81L274.91 110.19L274.09 109.56L273.31 108.93L272.56 108.28L271.85 107.62L271.18 106.95L270.54 106.27L269.94 105.58L269.38 104.89L268.86 104.19L268.38 103.48L267.93 102.76L267.53 102.04L267.16 101.31L266.84 100.58L266.56 99.84L266.31 99.1L266.11 98.36L265.95 97.62L265.83 96.87L265.75 96.12L265.71 95.37\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M374.29 98.08L374.27 98.83L374.21 99.58L374.1 100.32L373.96 101.07L373.78 101.81L373.55 102.55L373.28 103.29L372.98 104.02L372.63 104.75L372.24 105.47L371.81 106.19L371.35 106.9L370.84 107.6L370.3 108.3L369.72 108.99L369.1 109.67L368.44 110.34L367.75 111L367.02 111.65L366.25 112.3L365.45 112.93L364.61 113.55L363.74 114.16L362.84 114.75L361.91 115.34L360.94 115.91L359.94 116.47L358.91 117.01L357.86 117.54L356.77 118.05L355.66 118.55L354.51 119.04L353.35 119.5L352.15 119.95L350.93 120.39L349.69 120.81L348.43 121.21L347.14 121.59L345.84 121.96L344.51 122.3L343.17 122.63L341.81 122.94L340.43 123.23L339.04 123.5L337.63 123.76L336.21 123.99L334.77 124.2L333.33 124.4L331.87 124.57L330.41 124.72L328.94 124.86L327.46 124.97L325.97 125.06L324.48 125.13L322.99 125.19L321.5 125.22L320 125.23L318.5 125.22L317.01 125.19L315.52 125.13L314.03 125.06L312.54 124.97L311.06 124.86L309.59 124.72L308.13 124.57L306.67 124.4L305.23 124.2L303.79 123.99L302.37 123.76L300.96 123.5L299.57 123.23L298.19 122.94L296.83 122.63L295.49 122.3L294.16 121.96L292.86 121.59L291.57 121.21L290.31 120.81L289.07 120.39L287.85 119.95L286.65 119.5L285.49 119.04L284.34 118.55L283.23 118.05L282.14 117.54L281.09 117.01L280.06 116.47L279.06 115.91L278.09 115.34L277.16 114.75L276.26 114.16L275.39 113.55L274.55 112.93L273.75 112.3L272.98 111.65L272.25 111L271.56 110.34L270.9 109.67L270.28 108.99L269.7 108.3L269.16 107.6L268.65 106.9L268.19 106.19L267.76 105.47L267.37 104.75L267.02 104.02L266.72 103.29L266.45 102.55L266.22 101.81L266.04 101.07L265.9 100.32L265.79 99.58L265.73 98.83L265.71 98.08L265.71 91.97L265.73 91.22L265.79 90.47L265.9 89.73L266.04 88.98L266.22 88.24L266.45 87.5L266.72 86.77L267.02 86.03L267.37 85.31L267.76 84.58L268.19 83.87L268.65 83.16L269.16 82.45L269.7 81.76L270.28 81.07L270.9 80.39L271.56 79.71L272.25 79.05L272.98 78.4L273.75 77.75L274.55 77.12L275.39 76.5L276.26 75.89L277.16 75.3L278.09 74.71L279.06 74.14L280.06 73.59L281.09 73.04L282.14 72.51L283.23 72L284.34 71.5L285.49 71.02L286.65 70.55L287.85 70.1L289.07 69.66L290.31 69.25L291.57 68.84L292.86 68.46L294.16 68.1L295.49 67.75L296.83 67.42L298.19 67.11L299.57 66.82L300.96 66.55L302.37 66.3L303.79 66.06L305.23 65.85L306.67 65.66L308.13 65.48L309.59 65.33L311.06 65.2L312.54 65.08L314.03 64.99L315.52 64.92L317.01 64.87L318.5 64.84L320 64.82L321.5 64.84L322.99 64.87L324.48 64.92L325.97 64.99L327.46 65.08L328.94 65.2L330.41 65.33L331.87 65.48L333.33 65.66L334.77 65.85L336.21 66.06L337.63 66.3L339.04 66.55L340.43 66.82L341.81 67.11L343.17 67.42L344.51 67.75L345.84 68.1L347.14 68.46L348.43 68.84L349.69 69.25L350.93 69.66L352.15 70.1L353.35 70.55L354.51 71.02L355.66 71.5L356.77 72L357.86 72.51L358.91 73.04L359.94 73.59L360.94 74.14L361.91 74.71L362.84 75.3L363.74 75.89L364.61 76.5L365.45 77.12L366.25 77.75L367.02 78.4L367.75 79.05L368.44 79.71L369.1 80.39L369.72 81.07L370.3 81.76L370.84 82.45L371.35 83.16L371.81 83.87L372.24 84.58L372.63 85.31L372.98 86.03L373.28 86.77L373.55 87.5L373.78 88.24L373.96 88.98L374.1 89.73L374.21 90.47L374.27 91.22L374.29 91.97Z\"/></g><g class=\"iso-solid\" data-p=\"84\" data-name=\"stagger.tooth22\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M385.5 120.01L384.55 121.79L382.55 122.37L376.78 121.59L376.78 110.31L378.58 106.95L384.35 107.73L385.5 108.72Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"M385.5 108.72L384.55 110.51L384.55 121.79L385.5 120.01Z\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"M384.55 110.51L382.55 111.08L382.55 122.37L384.55 121.79Z\"/><path class=\"iso-tn\" data-r=\"f4\" data-b=\"1\" d=\"M382.55 111.08L376.78 110.31L376.78 121.59L382.55 122.37Z\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M378.58 106.95L384.35 107.73L385.5 108.72L384.55 110.51L382.55 111.08L376.78 110.31Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M384.55 121.79L384.55 110.51M382.55 122.37L382.55 111.08M385.5 108.72L384.55 110.51L382.55 111.08L376.78 110.31\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M385.5 120.01L384.55 121.79L382.55 122.37L376.78 121.59L376.78 110.31L378.58 106.95L384.35 107.73L385.5 108.72Z\"/></g><g class=\"iso-solid\" data-p=\"70\" data-name=\"stagger.tooth8\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M263.22 121.59L257.45 122.37L255.45 121.79L254.5 120.01L254.5 108.72L255.65 107.73L261.42 106.95L263.22 110.31Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"M263.22 110.31L257.45 111.08L257.45 122.37L263.22 121.59Z\"/><path class=\"iso-tn\" data-r=\"f1\" data-b=\"2\" d=\"M257.45 111.08L255.45 110.51L255.45 121.79L257.45 122.37Z\"/><path class=\"iso-tn\" data-r=\"f2\" data-b=\"3\" style=\"--f:0.46875\" d=\"M255.45 110.51L254.5 108.72L254.5 120.01L255.45 121.79Z\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M263.22 110.31L257.45 111.08L255.45 110.51L254.5 108.72L255.65 107.73L261.42 106.95Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M257.45 122.37L257.45 111.08M255.45 121.79L255.45 110.51M263.22 110.31L257.45 111.08L255.45 110.51L254.5 108.72\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M263.22 121.59L257.45 122.37L255.45 121.79L254.5 120.01L254.5 108.72L255.65 107.73L261.42 106.95L263.22 110.31Z\"/></g><g class=\"iso-solid\" data-p=\"85\" data-name=\"stagger.tooth23\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M379.22 128.22L377.38 129.82L375.15 130.11L369.98 128.62L369.98 117.34L373.46 114.33L378.63 115.82L379.22 116.93Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"M379.22 116.93L377.38 118.53L377.38 129.82L379.22 128.22Z\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"M377.38 118.53L375.15 118.83L375.15 130.11L377.38 129.82Z\"/><path class=\"iso-tn\" data-r=\"f4\" data-b=\"2\" d=\"M375.15 118.83L369.98 117.34L369.98 128.62L375.15 130.11Z\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M373.46 114.33L378.63 115.82L379.22 116.93L377.38 118.53L375.15 118.83L369.98 117.34Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M377.38 129.82L377.38 118.53M375.15 130.11L375.15 118.83M379.22 116.93L377.38 118.53L375.15 118.83L369.98 117.34\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M379.22 128.22L377.38 129.82L375.15 130.11L369.98 128.62L369.98 117.34L373.46 114.33L378.63 115.82L379.22 116.93Z\"/></g><g class=\"iso-solid\" data-p=\"87\" data-name=\"timeline.step1\" data-mat=\"steel\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M372.12 91.97L372.1 92.71L372.03 93.46L371.93 94.2L371.78 94.94L371.59 95.68L371.36 96.41L371.08 97.15L370.76 97.87L370.41 98.59L370.01 99.31L369.57 100.02L369.09 100.73L368.57 101.42L368.01 102.11L367.41 102.8L366.77 103.47L366.1 104.13L365.38 104.78L364.63 105.43L363.84 106.06L363.02 106.68L362.16 107.29L361.27 107.88L360.35 108.47L359.39 109.04L358.4 109.59L357.38 110.13L356.32 110.66L355.24 111.17L354.13 111.66L352.99 112.14L351.83 112.61L350.63 113.05L349.42 113.48L348.18 113.89L346.91 114.29L345.63 114.66L344.32 115.02L343 115.36L341.65 115.67L340.29 115.97L338.91 116.25L337.51 116.51L336.11 116.75L334.68 116.97L333.25 117.17L331.8 117.35L330.35 117.51L328.89 117.65L327.42 117.76L325.94 117.86L324.46 117.93L322.98 117.99L321.49 118.02L320 118.03L318.51 118.02L317.02 117.99L315.54 117.93L314.06 117.86L312.58 117.76L311.11 117.65L309.65 117.51L308.2 117.35L306.75 117.17L305.32 116.97L303.89 116.75L302.49 116.51L301.09 116.25L299.71 115.97L298.35 115.67L297 115.36L295.68 115.02L294.37 114.66L293.09 114.29L291.82 113.89L290.58 113.48L289.37 113.05L288.17 112.61L287.01 112.14L285.87 111.66L284.76 111.17L283.68 110.66L282.62 110.13L281.6 109.59L280.61 109.04L279.65 108.47L278.73 107.88L277.84 107.29L276.98 106.68L276.16 106.06L275.37 105.43L274.62 104.78L273.9 104.13L273.23 103.47L272.59 102.8L271.99 102.11L271.43 101.42L270.91 100.73L270.43 100.02L269.99 99.31L269.59 98.59L269.24 97.87L268.92 97.15L268.64 96.41L268.41 95.68L268.22 94.94L268.07 94.2L267.97 93.46L267.9 92.71L267.88 91.97L267.88 85.86L267.9 85.11L267.97 84.37L268.07 83.63L268.22 82.89L268.41 82.15L268.64 81.41L268.92 80.68L269.24 79.96L269.59 79.23L269.99 78.52L270.43 77.81L270.91 77.1L271.43 76.4L271.99 75.71L272.59 75.03L273.23 74.36L273.9 73.7L274.62 73.04L275.37 72.4L276.16 71.77L276.98 71.15L277.84 70.54L278.73 69.94L279.65 69.36L280.61 68.79L281.6 68.24L282.62 67.7L283.68 67.17L284.76 66.66L285.87 66.16L287.01 65.68L288.17 65.22L289.37 64.78L290.58 64.35L291.82 63.94L293.09 63.54L294.37 63.17L295.68 62.81L297 62.47L298.35 62.15L299.71 61.85L301.09 61.57L302.49 61.31L303.89 61.07L305.32 60.85L306.75 60.65L308.2 60.48L309.65 60.32L311.11 60.18L312.58 60.06L314.06 59.97L315.54 59.89L317.02 59.84L318.51 59.81L320 59.8L321.49 59.81L322.98 59.84L324.46 59.89L325.94 59.97L327.42 60.06L328.89 60.18L330.35 60.32L331.8 60.48L333.25 60.65L334.68 60.85L336.11 61.07L337.51 61.31L338.91 61.57L340.29 61.85L341.65 62.15L343 62.47L344.32 62.81L345.63 63.17L346.91 63.54L348.18 63.94L349.42 64.35L350.63 64.78L351.83 65.22L352.99 65.68L354.13 66.16L355.24 66.66L356.32 67.17L357.38 67.7L358.4 68.24L359.39 68.79L360.35 69.36L361.27 69.94L362.16 70.54L363.02 71.15L363.84 71.77L364.63 72.4L365.38 73.04L366.1 73.7L366.77 74.36L367.41 75.03L368.01 75.71L368.57 76.4L369.09 77.1L369.57 77.81L370.01 78.52L370.41 79.23L370.76 79.96L371.08 80.68L371.36 81.41L371.59 82.15L371.78 82.89L371.93 83.63L372.03 84.37L372.1 85.11L372.12 85.86Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M372.12 91.97L372.01 93.67L371.67 95.37L371.12 97.05L370.34 98.71L369.35 100.35L368.15 101.94L366.74 103.5L365.14 105L363.33 106.45L361.35 107.83L359.18 109.15L356.85 110.4L354.36 111.56L351.73 112.64L348.96 113.64L346.06 114.54L343.05 115.34L339.94 116.05L336.75 116.65L333.49 117.14L330.17 117.53L326.8 117.81L323.41 117.97L320 118.03L320 111.92L323.41 111.86L326.8 111.69L330.17 111.42L333.49 111.03L336.75 110.53L339.94 109.93L343.05 109.23L346.06 108.43L348.96 107.53L351.73 106.53L354.36 105.45L356.85 104.28L359.18 103.04L361.35 101.72L363.33 100.34L365.14 98.89L366.74 97.38L368.15 95.83L369.35 94.23L370.34 92.6L371.12 90.94L371.67 89.26L372.01 87.56L372.12 85.86Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M320 118.03L316.69 117.98L313.39 117.82L310.12 117.56L306.89 117.19L303.72 116.72L303.72 110.61L306.89 111.08L310.12 111.44L313.39 111.71L316.69 111.86L320 111.92Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M303.72 116.72L300.93 116.22L298.21 115.64L295.55 114.98L292.98 114.25L290.49 113.45L288.1 112.58L285.81 111.64L285.81 105.52L288.1 106.46L290.49 107.34L292.98 108.14L295.55 108.87L298.21 109.53L300.93 110.11L303.72 110.61Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M285.81 111.64L283.5 110.57L281.32 109.44L279.28 108.24L277.4 106.98L275.66 105.67L274.09 104.31L272.69 102.9L271.46 101.45L270.4 99.97L269.52 98.46L269.52 92.35L270.4 93.86L271.46 95.34L272.69 96.79L274.09 98.19L275.66 99.56L277.4 100.87L279.28 102.13L281.32 103.32L283.5 104.46L285.81 105.52Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M269.52 98.46L268.81 96.86L268.29 95.24L267.98 93.61L267.88 91.97L267.88 85.86L267.98 87.5L268.29 89.13L268.81 90.75L269.52 92.35Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M356.85 104.28L355.38 104.99L353.85 105.67L352.27 106.32L350.63 106.94L348.96 107.53L347.23 108.08L345.47 108.59L343.66 109.08L341.82 109.52L339.94 109.93L338.04 110.31L336.11 110.64L334.15 110.94L332.17 111.2L330.17 111.42L328.15 111.6L326.13 111.74L324.09 111.84L322.05 111.9L320 111.92L317.95 111.9L315.91 111.84L313.87 111.74L311.85 111.6L309.83 111.42L307.83 111.2L305.85 110.94L303.89 110.64L301.96 110.31L300.06 109.93L298.18 109.52L296.34 109.08L294.53 108.59L292.77 108.08L291.04 107.53L289.37 106.94L287.73 106.32L286.15 105.67L284.62 104.99L283.15 104.28L281.73 103.55L280.37 102.78L279.07 101.99L277.84 101.18L276.67 100.34L275.56 99.47L274.53 98.59L273.56 97.69L272.67 96.77L271.85 95.83L271.1 94.88L270.43 93.91L269.84 92.93L269.32 91.94L268.88 90.94L268.52 89.93L268.24 88.92L268.04 87.9L267.92 86.88L267.88 85.86L267.92 84.83L268.04 83.81L268.24 82.79L268.52 81.78L268.88 80.77L269.32 79.77L269.84 78.78L270.43 77.81L271.1 76.84L271.85 75.89L272.67 74.95L273.56 74.03L274.53 73.12L275.56 72.24L276.67 71.38L277.84 70.54L279.07 69.72L280.37 68.93L281.73 68.17L283.15 67.43L284.62 66.72L286.15 66.04L287.73 65.39L289.37 64.78L291.04 64.19L292.77 63.64L294.53 63.12L296.34 62.64L298.18 62.19L300.06 61.78L301.96 61.41L303.89 61.07L305.85 60.78L307.83 60.52L309.83 60.3L311.85 60.12L313.87 59.98L315.91 59.88L317.95 59.82L320 59.8L322.05 59.82L324.09 59.88L326.13 59.98L328.15 60.12L330.17 60.3L332.17 60.52L334.15 60.78L336.11 61.07L338.04 61.41L339.94 61.78L341.82 62.19L343.66 62.64L345.47 63.12L347.23 63.64L348.96 64.19L350.63 64.78L352.27 65.39L353.85 66.04L355.38 66.72L356.85 67.43L358.27 68.17L359.63 68.93L360.93 69.72L362.16 70.54L363.33 71.38L364.44 72.24L365.47 73.12L366.44 74.03L367.33 74.95L368.15 75.89L368.9 76.84L369.57 77.81L370.16 78.78L370.68 79.77L371.12 80.77L371.48 81.78L371.76 82.79L371.96 83.81L372.08 84.83L372.12 85.86L372.08 86.88L371.96 87.9L371.76 88.92L371.48 89.93L371.12 90.94L370.68 91.94L370.16 92.93L369.57 93.91L368.9 94.88L368.15 95.83L367.33 96.77L366.44 97.69L365.47 98.59L364.44 99.47L363.33 100.34L362.16 101.18L360.93 101.99L359.63 102.78L358.27 103.55Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M372.12 85.86L372.1 86.6L372.03 87.35L371.93 88.09L371.78 88.83L371.59 89.57L371.36 90.3L371.08 91.03L370.76 91.76L370.41 92.48L370.01 93.2L369.57 93.91L369.09 94.61L368.57 95.31L368.01 96L367.41 96.68L366.77 97.36L366.1 98.02L365.38 98.67L364.63 99.31L363.84 99.95L363.02 100.57L362.16 101.18L361.27 101.77L360.35 102.35L359.39 102.92L358.4 103.48L357.38 104.02L356.32 104.55L355.24 105.06L354.13 105.55L352.99 106.03L351.83 106.49L350.63 106.94L349.42 107.37L348.18 107.78L346.91 108.17L345.63 108.55L344.32 108.91L343 109.24L341.65 109.56L340.29 109.86L338.91 110.14L337.51 110.4L336.11 110.64L334.68 110.86L333.25 111.06L331.8 111.24L330.35 111.4L328.89 111.54L327.42 111.65L325.94 111.75L324.46 111.82L322.98 111.87L321.49 111.91L320 111.92L318.51 111.91L317.02 111.87L315.54 111.82L314.06 111.75L312.58 111.65L311.11 111.54L309.65 111.4L308.2 111.24L306.75 111.06L305.32 110.86L303.89 110.64L302.49 110.4L301.09 110.14L299.71 109.86L298.35 109.56L297 109.24L295.68 108.91L294.37 108.55L293.09 108.17L291.82 107.78L290.58 107.37L289.37 106.94L288.17 106.49L287.01 106.03L285.87 105.55L284.76 105.06L283.68 104.55L282.62 104.02L281.6 103.48L280.61 102.92L279.65 102.35L278.73 101.77L277.84 101.18L276.98 100.57L276.16 99.95L275.37 99.31L274.62 98.67L273.9 98.02L273.23 97.36L272.59 96.68L271.99 96L271.43 95.31L270.91 94.61L270.43 93.91L269.99 93.2L269.59 92.48L269.24 91.76L268.92 91.03L268.64 90.3L268.41 89.57L268.22 88.83L268.07 88.09L267.97 87.35L267.9 86.6L267.88 85.86\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"inner\" d=\"M372.11 89.26L372.08 90.01L372 90.75L371.87 91.49L371.71 92.23L371.5 92.97L371.25 93.71L370.95 94.44L370.62 95.17L370.24 95.89L369.83 96.6L369.37 97.31L368.87 98.01L368.33 98.71L367.76 99.4L367.14 100.08L366.48 100.75L365.79 101.41L365.06 102.06L364.29 102.7L363.49 103.32L362.65 103.94L361.77 104.54L360.87 105.13L359.92 105.71L358.95 106.28L357.94 106.83L356.9 107.36L355.84 107.88L354.74 108.39L353.61 108.88L352.46 109.35L351.28 109.8L350.08 110.24L348.85 110.66L347.59 111.07L346.32 111.45L345.02 111.82L343.7 112.17L342.36 112.5L341.01 112.81L339.63 113.1L338.24 113.37L336.84 113.62L335.42 113.85L333.99 114.06L332.55 114.25L331.1 114.42L329.64 114.57L328.17 114.7L326.69 114.8L325.21 114.89L323.72 114.95L322.24 115L320.75 115.02L319.25 115.02L317.76 115L316.28 114.95L314.79 114.89L313.31 114.8L311.83 114.7L310.36 114.57L308.9 114.42L307.45 114.25L306.01 114.06L304.58 113.85L303.16 113.62L301.76 113.37L300.37 113.1L298.99 112.81L297.64 112.5L296.3 112.17L294.98 111.82L293.68 111.45L292.41 111.07L291.15 110.66L289.92 110.24L288.72 109.8L287.54 109.35L286.39 108.88L285.26 108.39L284.16 107.88L283.1 107.36L282.06 106.83L281.05 106.28L280.08 105.71L279.13 105.13L278.23 104.54L277.35 103.94L276.51 103.32L275.71 102.7L274.94 102.06L274.21 101.41L273.52 100.75L272.86 100.08L272.24 99.4L271.67 98.71L271.13 98.01L270.63 97.31L270.17 96.6L269.76 95.89L269.38 95.17L269.05 94.44L268.75 93.71L268.5 92.97L268.29 92.23L268.13 91.49L268 90.75L267.92 90.01L267.89 89.26\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M372.12 91.97L372.1 92.71L372.03 93.46L371.93 94.2L371.78 94.94L371.59 95.68L371.36 96.41L371.08 97.15L370.76 97.87L370.41 98.59L370.01 99.31L369.57 100.02L369.09 100.73L368.57 101.42L368.01 102.11L367.41 102.8L366.77 103.47L366.1 104.13L365.38 104.78L364.63 105.43L363.84 106.06L363.02 106.68L362.16 107.29L361.27 107.88L360.35 108.47L359.39 109.04L358.4 109.59L357.38 110.13L356.32 110.66L355.24 111.17L354.13 111.66L352.99 112.14L351.83 112.61L350.63 113.05L349.42 113.48L348.18 113.89L346.91 114.29L345.63 114.66L344.32 115.02L343 115.36L341.65 115.67L340.29 115.97L338.91 116.25L337.51 116.51L336.11 116.75L334.68 116.97L333.25 117.17L331.8 117.35L330.35 117.51L328.89 117.65L327.42 117.76L325.94 117.86L324.46 117.93L322.98 117.99L321.49 118.02L320 118.03L318.51 118.02L317.02 117.99L315.54 117.93L314.06 117.86L312.58 117.76L311.11 117.65L309.65 117.51L308.2 117.35L306.75 117.17L305.32 116.97L303.89 116.75L302.49 116.51L301.09 116.25L299.71 115.97L298.35 115.67L297 115.36L295.68 115.02L294.37 114.66L293.09 114.29L291.82 113.89L290.58 113.48L289.37 113.05L288.17 112.61L287.01 112.14L285.87 111.66L284.76 111.17L283.68 110.66L282.62 110.13L281.6 109.59L280.61 109.04L279.65 108.47L278.73 107.88L277.84 107.29L276.98 106.68L276.16 106.06L275.37 105.43L274.62 104.78L273.9 104.13L273.23 103.47L272.59 102.8L271.99 102.11L271.43 101.42L270.91 100.73L270.43 100.02L269.99 99.31L269.59 98.59L269.24 97.87L268.92 97.15L268.64 96.41L268.41 95.68L268.22 94.94L268.07 94.2L267.97 93.46L267.9 92.71L267.88 91.97L267.88 85.86L267.9 85.11L267.97 84.37L268.07 83.63L268.22 82.89L268.41 82.15L268.64 81.41L268.92 80.68L269.24 79.96L269.59 79.23L269.99 78.52L270.43 77.81L270.91 77.1L271.43 76.4L271.99 75.71L272.59 75.03L273.23 74.36L273.9 73.7L274.62 73.04L275.37 72.4L276.16 71.77L276.98 71.15L277.84 70.54L278.73 69.94L279.65 69.36L280.61 68.79L281.6 68.24L282.62 67.7L283.68 67.17L284.76 66.66L285.87 66.16L287.01 65.68L288.17 65.22L289.37 64.78L290.58 64.35L291.82 63.94L293.09 63.54L294.37 63.17L295.68 62.81L297 62.47L298.35 62.15L299.71 61.85L301.09 61.57L302.49 61.31L303.89 61.07L305.32 60.85L306.75 60.65L308.2 60.48L309.65 60.32L311.11 60.18L312.58 60.06L314.06 59.97L315.54 59.89L317.02 59.84L318.51 59.81L320 59.8L321.49 59.81L322.98 59.84L324.46 59.89L325.94 59.97L327.42 60.06L328.89 60.18L330.35 60.32L331.8 60.48L333.25 60.65L334.68 60.85L336.11 61.07L337.51 61.31L338.91 61.57L340.29 61.85L341.65 62.15L343 62.47L344.32 62.81L345.63 63.17L346.91 63.54L348.18 63.94L349.42 64.35L350.63 64.78L351.83 65.22L352.99 65.68L354.13 66.16L355.24 66.66L356.32 67.17L357.38 67.7L358.4 68.24L359.39 68.79L360.35 69.36L361.27 69.94L362.16 70.54L363.02 71.15L363.84 71.77L364.63 72.4L365.38 73.04L366.1 73.7L366.77 74.36L367.41 75.03L368.01 75.71L368.57 76.4L369.09 77.1L369.57 77.81L370.01 78.52L370.41 79.23L370.76 79.96L371.08 80.68L371.36 81.41L371.59 82.15L371.78 82.89L371.93 83.63L372.03 84.37L372.1 85.11L372.12 85.86Z\"/></g><g class=\"iso-solid\" data-p=\"88\" data-name=\"timeline.step2\" data-mat=\"steel\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M369.95 85.86L369.92 86.6L369.86 87.35L369.75 88.1L369.59 88.84L369.39 89.58L369.14 90.32L368.86 91.05L368.52 91.78L368.15 92.5L367.73 93.22L367.27 93.93L366.76 94.63L366.22 95.33L365.63 96.02L365 96.69L364.33 97.36L363.62 98.02L362.88 98.67L362.09 99.3L361.27 99.93L360.41 100.54L359.51 101.13L358.58 101.72L357.61 102.29L356.61 102.84L355.58 103.38L354.52 103.91L353.42 104.42L352.3 104.91L351.14 105.38L349.96 105.84L348.75 106.28L347.52 106.7L346.26 107.1L344.97 107.49L343.67 107.85L342.34 108.19L341 108.52L339.63 108.82L338.25 109.1L336.85 109.37L335.43 109.61L334.01 109.83L332.57 110.03L331.11 110.21L329.65 110.36L328.18 110.49L326.7 110.61L325.22 110.69L323.73 110.76L322.24 110.81L320.75 110.83L319.25 110.83L317.76 110.81L316.27 110.76L314.78 110.69L313.3 110.61L311.82 110.49L310.35 110.36L308.89 110.21L307.43 110.03L305.99 109.83L304.57 109.61L303.15 109.37L301.75 109.1L300.37 108.82L299 108.52L297.66 108.19L296.33 107.85L295.03 107.49L293.74 107.1L292.48 106.7L291.25 106.28L290.04 105.84L288.86 105.38L287.7 104.91L286.58 104.42L285.48 103.91L284.42 103.38L283.39 102.84L282.39 102.29L281.42 101.72L280.49 101.13L279.59 100.54L278.73 99.93L277.91 99.3L277.12 98.67L276.38 98.02L275.67 97.36L275 96.69L274.37 96.02L273.78 95.33L273.24 94.63L272.73 93.93L272.27 93.22L271.85 92.5L271.48 91.78L271.14 91.05L270.86 90.32L270.61 89.58L270.41 88.84L270.25 88.1L270.14 87.35L270.08 86.6L270.05 85.86L270.05 79.75L270.08 79L270.14 78.25L270.25 77.51L270.41 76.76L270.61 76.02L270.86 75.29L271.14 74.55L271.48 73.82L271.85 73.1L272.27 72.38L272.73 71.67L273.24 70.97L273.78 70.28L274.37 69.59L275 68.91L275.67 68.24L276.38 67.58L277.12 66.94L277.91 66.3L278.73 65.68L279.59 65.07L280.49 64.47L281.42 63.88L282.39 63.31L283.39 62.76L284.42 62.22L285.48 61.7L286.58 61.19L287.7 60.7L288.86 60.22L290.04 59.76L291.25 59.32L292.48 58.9L293.74 58.5L295.03 58.12L296.33 57.75L297.66 57.41L299 57.09L300.37 56.78L301.75 56.5L303.15 56.24L304.57 55.99L305.99 55.77L307.43 55.58L308.89 55.4L310.35 55.24L311.82 55.11L313.3 55L314.78 54.91L316.27 54.84L317.76 54.8L319.25 54.78L320.75 54.78L322.24 54.8L323.73 54.84L325.22 54.91L326.7 55L328.18 55.11L329.65 55.24L331.11 55.4L332.57 55.58L334.01 55.77L335.43 55.99L336.85 56.24L338.25 56.5L339.63 56.78L341 57.09L342.34 57.41L343.67 57.75L344.97 58.12L346.26 58.5L347.52 58.9L348.75 59.32L349.96 59.76L351.14 60.22L352.3 60.7L353.42 61.19L354.52 61.7L355.58 62.22L356.61 62.76L357.61 63.31L358.58 63.88L359.51 64.47L360.41 65.07L361.27 65.68L362.09 66.3L362.88 66.94L363.62 67.58L364.33 68.24L365 68.91L365.63 69.59L366.22 70.28L366.76 70.97L367.27 71.67L367.73 72.38L368.15 73.1L368.52 73.82L368.86 74.55L369.14 75.29L369.39 76.02L369.59 76.76L369.75 77.51L369.86 78.25L369.92 79L369.95 79.75Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M369.95 85.86L369.84 87.49L369.52 89.12L368.99 90.73L368.24 92.32L367.3 93.89L366.14 95.41L364.8 96.9L363.26 98.34L361.53 99.73L359.63 101.06L357.55 102.32L355.32 103.52L352.93 104.63L350.41 105.67L347.75 106.62L344.97 107.49L342.09 108.26L339.11 108.93L336.05 109.51L332.93 109.98L329.74 110.35L326.52 110.62L323.27 110.78L320 110.83L320 104.72L323.27 104.67L326.52 104.51L329.74 104.24L332.93 103.87L336.05 103.39L339.11 102.82L342.09 102.14L344.97 101.37L347.75 100.51L350.41 99.56L352.93 98.52L355.32 97.4L357.55 96.21L359.63 94.95L361.53 93.62L363.26 92.23L364.8 90.79L366.14 89.3L367.3 87.77L368.24 86.21L368.99 84.62L369.52 83.01L369.84 81.38L369.95 79.75Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M320 110.83L316.83 110.78L313.67 110.63L310.54 110.38L307.44 110.03L304.4 109.58L304.4 103.47L307.44 103.92L310.54 104.27L313.67 104.52L316.83 104.67L320 104.72Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M304.4 109.58L301.73 109.1L299.11 108.54L296.57 107.91L294.1 107.21L291.72 106.44L289.43 105.61L287.23 104.71L287.23 98.59L289.43 99.49L291.72 100.33L294.1 101.1L296.57 101.8L299.11 102.43L301.73 102.99L304.4 103.47Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M287.23 104.71L285.02 103.68L282.93 102.6L280.98 101.45L279.17 100.24L277.51 98.99L276 97.68L274.66 96.33L273.48 94.95L272.47 93.53L271.63 92.08L271.63 85.97L272.47 87.41L273.48 88.83L274.66 90.22L276 91.57L277.51 92.87L279.17 94.13L280.98 95.34L282.93 96.48L285.02 97.57L287.23 98.59Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M271.63 92.08L270.94 90.55L270.45 88.99L270.15 87.43L270.05 85.86L270.05 79.75L270.15 81.32L270.45 82.88L270.94 84.43L271.63 85.97Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M355.32 97.4L353.9 98.08L352.44 98.74L350.92 99.36L349.36 99.95L347.75 100.51L346.1 101.04L344.41 101.53L342.68 102L340.91 102.43L339.11 102.82L337.29 103.18L335.43 103.5L333.56 103.78L331.66 104.03L329.74 104.24L327.81 104.41L325.87 104.55L323.92 104.64L321.96 104.7L320 104.72L318.04 104.7L316.08 104.64L314.13 104.55L312.19 104.41L310.26 104.24L308.34 104.03L306.44 103.78L304.57 103.5L302.71 103.18L300.89 102.82L299.09 102.43L297.32 102L295.59 101.53L293.9 101.04L292.25 100.51L290.64 99.95L289.08 99.36L287.56 98.74L286.1 98.08L284.68 97.4L283.32 96.7L282.02 95.96L280.78 95.21L279.59 94.42L278.47 93.62L277.41 92.79L276.42 91.95L275.5 91.08L274.64 90.2L273.86 89.3L273.14 88.39L272.5 87.46L271.93 86.52L271.43 85.58L271.01 84.62L270.67 83.65L270.4 82.68L270.21 81.71L270.09 80.73L270.05 79.75L270.09 78.77L270.21 77.79L270.4 76.81L270.67 75.84L271.01 74.87L271.43 73.92L271.93 72.97L272.5 72.03L273.14 71.1L273.86 70.19L274.64 69.29L275.5 68.41L276.42 67.54L277.41 66.7L278.47 65.87L279.59 65.07L280.78 64.28L282.02 63.53L283.32 62.79L284.68 62.09L286.1 61.41L287.56 60.76L289.08 60.13L290.64 59.54L292.25 58.98L293.9 58.45L295.59 57.96L297.32 57.49L299.09 57.07L300.89 56.67L302.71 56.32L304.57 55.99L306.44 55.71L308.34 55.46L310.26 55.25L312.19 55.08L314.13 54.95L316.08 54.85L318.04 54.79L320 54.77L321.96 54.79L323.92 54.85L325.87 54.95L327.81 55.08L329.74 55.25L331.66 55.46L333.56 55.71L335.43 55.99L337.29 56.32L339.11 56.67L340.91 57.07L342.68 57.49L344.41 57.96L346.1 58.45L347.75 58.98L349.36 59.54L350.92 60.13L352.44 60.76L353.9 61.41L355.32 62.09L356.68 62.79L357.98 63.53L359.22 64.28L360.41 65.07L361.53 65.87L362.59 66.7L363.58 67.54L364.5 68.41L365.36 69.29L366.14 70.19L366.86 71.1L367.5 72.03L368.07 72.97L368.57 73.92L368.99 74.87L369.33 75.84L369.6 76.81L369.79 77.79L369.91 78.77L369.95 79.75L369.91 80.73L369.79 81.71L369.6 82.68L369.33 83.65L368.99 84.62L368.57 85.58L368.07 86.52L367.5 87.46L366.86 88.39L366.14 89.3L365.36 90.2L364.5 91.08L363.58 91.95L362.59 92.79L361.53 93.62L360.41 94.42L359.22 95.21L357.98 95.96L356.68 96.7Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M369.95 79.75L369.92 80.49L369.86 81.24L369.75 81.98L369.59 82.73L369.39 83.47L369.14 84.2L368.86 84.94L368.52 85.67L368.15 86.39L367.73 87.11L367.27 87.82L366.76 88.52L366.22 89.22L365.63 89.9L365 90.58L364.33 91.25L363.62 91.91L362.88 92.55L362.09 93.19L361.27 93.81L360.41 94.42L359.51 95.02L358.58 95.61L357.61 96.18L356.61 96.73L355.58 97.27L354.52 97.8L353.42 98.3L352.3 98.8L351.14 99.27L349.96 99.73L348.75 100.17L347.52 100.59L346.26 100.99L344.97 101.37L343.67 101.74L342.34 102.08L341 102.41L339.63 102.71L338.25 102.99L336.85 103.26L335.43 103.5L334.01 103.72L332.57 103.92L331.11 104.09L329.65 104.25L328.18 104.38L326.7 104.49L325.22 104.58L323.73 104.65L322.24 104.69L320.75 104.72L319.25 104.72L317.76 104.69L316.27 104.65L314.78 104.58L313.3 104.49L311.82 104.38L310.35 104.25L308.89 104.09L307.43 103.92L305.99 103.72L304.57 103.5L303.15 103.26L301.75 102.99L300.37 102.71L299 102.41L297.66 102.08L296.33 101.74L295.03 101.37L293.74 100.99L292.48 100.59L291.25 100.17L290.04 99.73L288.86 99.27L287.7 98.8L286.58 98.3L285.48 97.8L284.42 97.27L283.39 96.73L282.39 96.18L281.42 95.61L280.49 95.02L279.59 94.42L278.73 93.81L277.91 93.19L277.12 92.55L276.38 91.91L275.67 91.25L275 90.58L274.37 89.9L273.78 89.22L273.24 88.52L272.73 87.82L272.27 87.11L271.85 86.39L271.48 85.67L271.14 84.94L270.86 84.2L270.61 83.47L270.41 82.73L270.25 81.98L270.14 81.24L270.08 80.49L270.05 79.75\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"inner\" d=\"M369.94 83.15L369.9 83.9L369.82 84.64L369.69 85.39L369.51 86.13L369.29 86.87L369.03 87.61L368.72 88.34L368.37 89.07L367.98 89.79L367.54 90.51L367.06 91.22L366.54 91.92L365.97 92.61L365.36 93.3L364.72 93.97L364.03 94.64L363.3 95.29L362.54 95.94L361.74 96.57L360.89 97.19L360.02 97.79L359.1 98.39L358.15 98.97L357.17 99.53L356.15 100.08L355.1 100.61L354.02 101.13L352.91 101.63L351.77 102.12L350.6 102.59L349.41 103.04L348.18 103.47L346.93 103.88L345.66 104.27L344.37 104.65L343.05 105L341.71 105.34L340.35 105.66L338.98 105.95L337.58 106.22L336.17 106.48L334.75 106.71L333.31 106.92L331.86 107.11L330.4 107.27L328.94 107.42L327.46 107.54L325.97 107.64L324.49 107.72L322.99 107.78L321.5 107.81L320 107.82L318.5 107.81L317.01 107.78L315.51 107.72L314.03 107.64L312.54 107.54L311.06 107.42L309.6 107.27L308.14 107.11L306.69 106.92L305.25 106.71L303.83 106.48L302.42 106.22L301.02 105.95L299.65 105.66L298.29 105.34L296.95 105L295.63 104.65L294.34 104.27L293.07 103.88L291.82 103.47L290.59 103.04L289.4 102.59L288.23 102.12L287.09 101.63L285.98 101.13L284.9 100.61L283.85 100.08L282.83 99.53L281.85 98.97L280.9 98.39L279.98 97.79L279.11 97.19L278.26 96.57L277.46 95.94L276.7 95.29L275.97 94.64L275.28 93.97L274.64 93.3L274.03 92.61L273.46 91.92L272.94 91.22L272.46 90.51L272.02 89.79L271.63 89.07L271.28 88.34L270.97 87.61L270.71 86.87L270.49 86.13L270.31 85.39L270.18 84.64L270.1 83.9L270.06 83.15\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M369.95 85.86L369.92 86.6L369.86 87.35L369.75 88.1L369.59 88.84L369.39 89.58L369.14 90.32L368.86 91.05L368.52 91.78L368.15 92.5L367.73 93.22L367.27 93.93L366.76 94.63L366.22 95.33L365.63 96.02L365 96.69L364.33 97.36L363.62 98.02L362.88 98.67L362.09 99.3L361.27 99.93L360.41 100.54L359.51 101.13L358.58 101.72L357.61 102.29L356.61 102.84L355.58 103.38L354.52 103.91L353.42 104.42L352.3 104.91L351.14 105.38L349.96 105.84L348.75 106.28L347.52 106.7L346.26 107.1L344.97 107.49L343.67 107.85L342.34 108.19L341 108.52L339.63 108.82L338.25 109.1L336.85 109.37L335.43 109.61L334.01 109.83L332.57 110.03L331.11 110.21L329.65 110.36L328.18 110.49L326.7 110.61L325.22 110.69L323.73 110.76L322.24 110.81L320.75 110.83L319.25 110.83L317.76 110.81L316.27 110.76L314.78 110.69L313.3 110.61L311.82 110.49L310.35 110.36L308.89 110.21L307.43 110.03L305.99 109.83L304.57 109.61L303.15 109.37L301.75 109.1L300.37 108.82L299 108.52L297.66 108.19L296.33 107.85L295.03 107.49L293.74 107.1L292.48 106.7L291.25 106.28L290.04 105.84L288.86 105.38L287.7 104.91L286.58 104.42L285.48 103.91L284.42 103.38L283.39 102.84L282.39 102.29L281.42 101.72L280.49 101.13L279.59 100.54L278.73 99.93L277.91 99.3L277.12 98.67L276.38 98.02L275.67 97.36L275 96.69L274.37 96.02L273.78 95.33L273.24 94.63L272.73 93.93L272.27 93.22L271.85 92.5L271.48 91.78L271.14 91.05L270.86 90.32L270.61 89.58L270.41 88.84L270.25 88.1L270.14 87.35L270.08 86.6L270.05 85.86L270.05 79.75L270.08 79L270.14 78.25L270.25 77.51L270.41 76.76L270.61 76.02L270.86 75.29L271.14 74.55L271.48 73.82L271.85 73.1L272.27 72.38L272.73 71.67L273.24 70.97L273.78 70.28L274.37 69.59L275 68.91L275.67 68.24L276.38 67.58L277.12 66.94L277.91 66.3L278.73 65.68L279.59 65.07L280.49 64.47L281.42 63.88L282.39 63.31L283.39 62.76L284.42 62.22L285.48 61.7L286.58 61.19L287.7 60.7L288.86 60.22L290.04 59.76L291.25 59.32L292.48 58.9L293.74 58.5L295.03 58.12L296.33 57.75L297.66 57.41L299 57.09L300.37 56.78L301.75 56.5L303.15 56.24L304.57 55.99L305.99 55.77L307.43 55.58L308.89 55.4L310.35 55.24L311.82 55.11L313.3 55L314.78 54.91L316.27 54.84L317.76 54.8L319.25 54.78L320.75 54.78L322.24 54.8L323.73 54.84L325.22 54.91L326.7 55L328.18 55.11L329.65 55.24L331.11 55.4L332.57 55.58L334.01 55.77L335.43 55.99L336.85 56.24L338.25 56.5L339.63 56.78L341 57.09L342.34 57.41L343.67 57.75L344.97 58.12L346.26 58.5L347.52 58.9L348.75 59.32L349.96 59.76L351.14 60.22L352.3 60.7L353.42 61.19L354.52 61.7L355.58 62.22L356.61 62.76L357.61 63.31L358.58 63.88L359.51 64.47L360.41 65.07L361.27 65.68L362.09 66.3L362.88 66.94L363.62 67.58L364.33 68.24L365 68.91L365.63 69.59L366.22 70.28L366.76 70.97L367.27 71.67L367.73 72.38L368.15 73.1L368.52 73.82L368.86 74.55L369.14 75.29L369.39 76.02L369.59 76.76L369.75 77.51L369.86 78.25L369.92 79L369.95 79.75Z\"/></g><g class=\"iso-solid\" data-p=\"89\" data-name=\"timeline.step3\" data-mat=\"steel\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M367.78 79.75L367.75 80.49L367.68 81.23L367.57 81.97L367.41 82.71L367.2 83.45L366.95 84.18L366.65 84.91L366.3 85.63L365.92 86.35L365.48 87.06L365.01 87.76L364.49 88.46L363.92 89.14L363.32 89.82L362.67 90.49L361.98 91.15L361.25 91.8L360.48 92.43L359.67 93.06L358.82 93.67L357.94 94.26L357.02 94.85L356.06 95.41L355.07 95.97L354.04 96.5L352.98 97.03L351.89 97.53L350.77 98.02L349.62 98.49L348.44 98.94L347.23 99.37L346 99.79L344.74 100.18L343.46 100.56L342.15 100.91L340.82 101.24L339.48 101.56L338.11 101.85L336.73 102.12L335.33 102.37L333.91 102.6L332.48 102.8L331.04 102.99L329.59 103.15L328.13 103.28L326.67 103.4L325.19 103.49L323.71 103.56L322.23 103.61L320.74 103.63L319.26 103.63L317.77 103.61L316.29 103.56L314.81 103.49L313.33 103.4L311.87 103.28L310.41 103.15L308.96 102.99L307.52 102.8L306.09 102.6L304.67 102.37L303.27 102.12L301.89 101.85L300.52 101.56L299.18 101.24L297.85 100.91L296.54 100.56L295.26 100.18L294 99.79L292.77 99.37L291.56 98.94L290.38 98.49L289.23 98.02L288.11 97.53L287.02 97.03L285.96 96.5L284.93 95.97L283.94 95.41L282.98 94.85L282.06 94.26L281.18 93.67L280.33 93.06L279.52 92.43L278.75 91.8L278.02 91.15L277.33 90.49L276.68 89.82L276.08 89.14L275.51 88.46L274.99 87.76L274.52 87.06L274.08 86.35L273.7 85.63L273.35 84.91L273.05 84.18L272.8 83.45L272.59 82.71L272.43 81.97L272.32 81.23L272.25 80.49L272.22 79.75L272.22 73.63L272.25 72.89L272.32 72.15L272.43 71.41L272.59 70.67L272.8 69.93L273.05 69.2L273.35 68.47L273.7 67.75L274.08 67.03L274.52 66.32L274.99 65.62L275.51 64.92L276.08 64.24L276.68 63.56L277.33 62.89L278.02 62.23L278.75 61.58L279.52 60.95L280.33 60.32L281.18 59.71L282.06 59.12L282.98 58.53L283.94 57.96L284.93 57.41L285.96 56.87L287.02 56.35L288.11 55.85L289.23 55.36L290.38 54.89L291.56 54.44L292.77 54.01L294 53.59L295.26 53.2L296.54 52.82L297.85 52.47L299.18 52.13L300.52 51.82L301.89 51.53L303.27 51.26L304.67 51.01L306.09 50.78L307.52 50.58L308.96 50.39L310.41 50.23L311.87 50.09L313.33 49.98L314.81 49.89L316.29 49.82L317.77 49.77L319.26 49.75L320.74 49.75L322.23 49.77L323.71 49.82L325.19 49.89L326.67 49.98L328.13 50.09L329.59 50.23L331.04 50.39L332.48 50.58L333.91 50.78L335.33 51.01L336.73 51.26L338.11 51.53L339.48 51.82L340.82 52.13L342.15 52.47L343.46 52.82L344.74 53.2L346 53.59L347.23 54.01L348.44 54.44L349.62 54.89L350.77 55.36L351.89 55.85L352.98 56.35L354.04 56.87L355.07 57.41L356.06 57.96L357.02 58.53L357.94 59.12L358.82 59.71L359.67 60.32L360.48 60.95L361.25 61.58L361.98 62.23L362.67 62.89L363.32 63.56L363.92 64.24L364.49 64.92L365.01 65.62L365.48 66.32L365.92 67.03L366.3 67.75L366.65 68.47L366.95 69.2L367.2 69.93L367.41 70.67L367.57 71.41L367.68 72.15L367.75 72.89L367.78 73.63Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M367.78 79.75L367.67 81.31L367.37 82.86L366.86 84.41L366.15 85.93L365.24 87.42L364.14 88.89L362.85 90.31L361.37 91.69L359.72 93.02L357.9 94.29L355.92 95.5L353.78 96.64L351.5 97.71L349.08 98.7L346.54 99.61L343.89 100.43L341.13 101.17L338.28 101.81L335.36 102.37L332.37 102.82L329.32 103.17L326.24 103.43L323.12 103.58L320 103.63L320 97.52L323.12 97.47L326.24 97.32L329.32 97.06L332.37 96.71L335.36 96.25L338.28 95.7L341.13 95.06L343.89 94.32L346.54 93.5L349.08 92.58L351.5 91.59L353.78 90.52L355.92 89.38L357.9 88.18L359.72 86.9L361.37 85.58L362.85 84.2L364.14 82.77L365.24 81.31L366.15 79.82L366.86 78.29L367.37 76.75L367.67 75.2L367.78 73.63Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M320 103.63L316.97 103.59L313.94 103.44L310.95 103.2L307.99 102.87L305.07 102.44L305.07 96.33L307.99 96.75L310.95 97.09L313.94 97.33L316.97 97.47L320 97.52Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M305.07 102.44L302.52 101.98L300.02 101.44L297.59 100.84L295.23 100.17L292.95 99.44L290.76 98.63L288.66 97.77L288.66 91.66L290.76 92.52L292.95 93.32L295.23 94.06L297.59 94.73L300.02 95.33L302.52 95.86L305.07 96.33Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M288.66 97.77L286.54 96.8L284.54 95.76L282.68 94.66L280.95 93.51L279.36 92.3L277.92 91.05L276.63 89.76L275.5 88.44L274.53 87.08L273.73 85.7L273.73 79.58L274.53 80.97L275.5 82.33L276.63 83.65L277.92 84.94L279.36 86.19L280.95 87.39L282.68 88.55L284.54 89.64L286.54 90.68L288.66 91.66Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M273.73 85.7L273.07 84.23L272.6 82.74L272.32 81.25L272.22 79.75L272.22 73.63L272.32 75.14L272.6 76.63L273.07 78.12L273.73 79.58Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M353.78 90.52L352.43 91.17L351.03 91.8L349.58 92.39L348.08 92.96L346.54 93.5L344.96 94L343.34 94.48L341.69 94.92L340 95.33L338.28 95.7L336.54 96.04L334.76 96.35L332.97 96.62L331.15 96.86L329.32 97.06L327.47 97.23L325.62 97.36L323.75 97.45L321.88 97.5L320 97.52L318.12 97.5L316.25 97.45L314.38 97.36L312.53 97.23L310.68 97.06L308.85 96.86L307.03 96.62L305.24 96.35L303.46 96.04L301.72 95.7L300 95.33L298.31 94.92L296.66 94.48L295.04 94L293.46 93.5L291.92 92.96L290.42 92.39L288.97 91.8L287.57 91.17L286.22 90.52L284.92 89.85L283.67 89.15L282.48 88.42L281.35 87.67L280.28 86.9L279.26 86.11L278.32 85.31L277.43 84.48L276.61 83.63L275.86 82.77L275.18 81.9L274.56 81.02L274.02 80.12L273.54 79.21L273.14 78.29L272.81 77.37L272.56 76.44L272.37 75.51L272.26 74.57L272.22 73.63L272.26 72.7L272.37 71.76L272.56 70.83L272.81 69.9L273.14 68.97L273.54 68.06L274.02 67.15L274.56 66.25L275.18 65.37L275.86 64.49L276.61 63.63L277.43 62.79L278.32 61.96L279.26 61.15L280.28 60.36L281.35 59.59L282.48 58.84L283.67 58.12L284.92 57.42L286.22 56.74L287.57 56.09L288.97 55.47L290.42 54.87L291.92 54.31L293.46 53.77L295.04 53.27L296.66 52.79L298.31 52.35L300 51.94L301.72 51.56L303.46 51.22L305.24 50.92L307.03 50.64L308.85 50.41L310.68 50.2L312.53 50.04L314.38 49.91L316.25 49.82L318.12 49.76L320 49.75L321.88 49.76L323.75 49.82L325.62 49.91L327.47 50.04L329.32 50.2L331.15 50.41L332.97 50.64L334.76 50.92L336.54 51.22L338.28 51.56L340 51.94L341.69 52.35L343.34 52.79L344.96 53.27L346.54 53.77L348.08 54.31L349.58 54.87L351.03 55.47L352.43 56.09L353.78 56.74L355.08 57.42L356.33 58.12L357.52 58.84L358.65 59.59L359.72 60.36L360.74 61.15L361.68 61.96L362.57 62.79L363.39 63.63L364.14 64.49L364.82 65.37L365.44 66.25L365.98 67.15L366.46 68.06L366.86 68.97L367.19 69.9L367.44 70.83L367.63 71.76L367.74 72.7L367.78 73.63L367.74 74.57L367.63 75.51L367.44 76.44L367.19 77.37L366.86 78.29L366.46 79.21L365.98 80.12L365.44 81.02L364.82 81.9L364.14 82.77L363.39 83.63L362.57 84.48L361.68 85.31L360.74 86.11L359.72 86.9L358.65 87.67L357.52 88.42L356.33 89.15L355.08 89.85Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M367.78 73.63L367.75 74.38L367.68 75.12L367.57 75.86L367.41 76.6L367.2 77.33L366.95 78.07L366.65 78.79L366.3 79.52L365.92 80.23L365.48 80.94L365.01 81.65L364.49 82.34L363.92 83.03L363.32 83.71L362.67 84.38L361.98 85.04L361.25 85.68L360.48 86.32L359.67 86.94L358.82 87.55L357.94 88.15L357.02 88.73L356.06 89.3L355.07 89.86L354.04 90.39L352.98 90.91L351.89 91.42L350.77 91.91L349.62 92.38L348.44 92.83L347.23 93.26L346 93.67L344.74 94.07L343.46 94.44L342.15 94.8L340.82 95.13L339.48 95.45L338.11 95.74L336.73 96.01L335.33 96.26L333.91 96.49L332.48 96.69L331.04 96.87L329.59 97.03L328.13 97.17L326.67 97.29L325.19 97.38L323.71 97.45L322.23 97.5L320.74 97.52L319.26 97.52L317.77 97.5L316.29 97.45L314.81 97.38L313.33 97.29L311.87 97.17L310.41 97.03L308.96 96.87L307.52 96.69L306.09 96.49L304.67 96.26L303.27 96.01L301.89 95.74L300.52 95.45L299.18 95.13L297.85 94.8L296.54 94.44L295.26 94.07L294 93.67L292.77 93.26L291.56 92.83L290.38 92.38L289.23 91.91L288.11 91.42L287.02 90.91L285.96 90.39L284.93 89.86L283.94 89.3L282.98 88.73L282.06 88.15L281.18 87.55L280.33 86.94L279.52 86.32L278.75 85.68L278.02 85.04L277.33 84.38L276.68 83.71L276.08 83.03L275.51 82.34L274.99 81.65L274.52 80.94L274.08 80.23L273.7 79.52L273.35 78.79L273.05 78.07L272.8 77.33L272.59 76.6L272.43 75.86L272.32 75.12L272.25 74.38L272.22 73.63\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"inner\" d=\"M367.77 77.04L367.73 77.78L367.64 78.52L367.51 79.27L367.33 80L367.1 80.74L366.83 81.47L366.51 82.2L366.15 82.92L365.74 83.64L365.29 84.35L364.79 85.05L364.25 85.74L363.67 86.43L363.04 87.1L362.38 87.77L361.67 88.42L360.92 89.07L360.13 89.7L359.3 90.32L358.44 90.92L357.54 91.51L356.6 92.09L355.62 92.65L354.61 93.2L353.57 93.73L352.49 94.25L351.39 94.75L350.25 95.23L349.08 95.69L347.89 96.13L346.66 96.56L345.42 96.96L344.14 97.35L342.85 97.72L341.53 98.06L340.19 98.39L338.83 98.69L337.45 98.97L336.06 99.23L334.65 99.47L333.23 99.69L331.79 99.89L330.34 100.06L328.88 100.21L327.41 100.33L325.94 100.44L324.46 100.52L322.98 100.58L321.49 100.61L320 100.62L318.51 100.61L317.02 100.58L315.54 100.52L314.06 100.44L312.59 100.33L311.12 100.21L309.66 100.06L308.21 99.89L306.77 99.69L305.35 99.47L303.94 99.23L302.55 98.97L301.17 98.69L299.81 98.39L298.47 98.06L297.15 97.72L295.86 97.35L294.58 96.96L293.34 96.56L292.11 96.13L290.92 95.69L289.75 95.23L288.61 94.75L287.51 94.25L286.43 93.73L285.39 93.2L284.38 92.65L283.4 92.09L282.46 91.51L281.56 90.92L280.7 90.32L279.87 89.7L279.08 89.07L278.33 88.42L277.62 87.77L276.96 87.1L276.33 86.43L275.75 85.74L275.21 85.05L274.71 84.35L274.26 83.64L273.85 82.92L273.49 82.2L273.17 81.47L272.9 80.74L272.67 80L272.49 79.27L272.36 78.52L272.27 77.78L272.23 77.04\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M367.78 79.75L367.75 80.49L367.68 81.23L367.57 81.97L367.41 82.71L367.2 83.45L366.95 84.18L366.65 84.91L366.3 85.63L365.92 86.35L365.48 87.06L365.01 87.76L364.49 88.46L363.92 89.14L363.32 89.82L362.67 90.49L361.98 91.15L361.25 91.8L360.48 92.43L359.67 93.06L358.82 93.67L357.94 94.26L357.02 94.85L356.06 95.41L355.07 95.97L354.04 96.5L352.98 97.03L351.89 97.53L350.77 98.02L349.62 98.49L348.44 98.94L347.23 99.37L346 99.79L344.74 100.18L343.46 100.56L342.15 100.91L340.82 101.24L339.48 101.56L338.11 101.85L336.73 102.12L335.33 102.37L333.91 102.6L332.48 102.8L331.04 102.99L329.59 103.15L328.13 103.28L326.67 103.4L325.19 103.49L323.71 103.56L322.23 103.61L320.74 103.63L319.26 103.63L317.77 103.61L316.29 103.56L314.81 103.49L313.33 103.4L311.87 103.28L310.41 103.15L308.96 102.99L307.52 102.8L306.09 102.6L304.67 102.37L303.27 102.12L301.89 101.85L300.52 101.56L299.18 101.24L297.85 100.91L296.54 100.56L295.26 100.18L294 99.79L292.77 99.37L291.56 98.94L290.38 98.49L289.23 98.02L288.11 97.53L287.02 97.03L285.96 96.5L284.93 95.97L283.94 95.41L282.98 94.85L282.06 94.26L281.18 93.67L280.33 93.06L279.52 92.43L278.75 91.8L278.02 91.15L277.33 90.49L276.68 89.82L276.08 89.14L275.51 88.46L274.99 87.76L274.52 87.06L274.08 86.35L273.7 85.63L273.35 84.91L273.05 84.18L272.8 83.45L272.59 82.71L272.43 81.97L272.32 81.23L272.25 80.49L272.22 79.75L272.22 73.63L272.25 72.89L272.32 72.15L272.43 71.41L272.59 70.67L272.8 69.93L273.05 69.2L273.35 68.47L273.7 67.75L274.08 67.03L274.52 66.32L274.99 65.62L275.51 64.92L276.08 64.24L276.68 63.56L277.33 62.89L278.02 62.23L278.75 61.58L279.52 60.95L280.33 60.32L281.18 59.71L282.06 59.12L282.98 58.53L283.94 57.96L284.93 57.41L285.96 56.87L287.02 56.35L288.11 55.85L289.23 55.36L290.38 54.89L291.56 54.44L292.77 54.01L294 53.59L295.26 53.2L296.54 52.82L297.85 52.47L299.18 52.13L300.52 51.82L301.89 51.53L303.27 51.26L304.67 51.01L306.09 50.78L307.52 50.58L308.96 50.39L310.41 50.23L311.87 50.09L313.33 49.98L314.81 49.89L316.29 49.82L317.77 49.77L319.26 49.75L320.74 49.75L322.23 49.77L323.71 49.82L325.19 49.89L326.67 49.98L328.13 50.09L329.59 50.23L331.04 50.39L332.48 50.58L333.91 50.78L335.33 51.01L336.73 51.26L338.11 51.53L339.48 51.82L340.82 52.13L342.15 52.47L343.46 52.82L344.74 53.2L346 53.59L347.23 54.01L348.44 54.44L349.62 54.89L350.77 55.36L351.89 55.85L352.98 56.35L354.04 56.87L355.07 57.41L356.06 57.96L357.02 58.53L357.94 59.12L358.82 59.71L359.67 60.32L360.48 60.95L361.25 61.58L361.98 62.23L362.67 62.89L363.32 63.56L363.92 64.24L364.49 64.92L365.01 65.62L365.48 66.32L365.92 67.03L366.3 67.75L366.65 68.47L366.95 69.2L367.2 69.93L367.41 70.67L367.57 71.41L367.68 72.15L367.75 72.89L367.78 73.63Z\"/></g><g class=\"iso-solid\" data-p=\"90\" data-name=\"waapi.ring\" data-mat=\"steel\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M387.32 71.75L387.3 72.5L387.25 73.25L387.17 74L387.05 74.75L386.9 75.49L386.72 76.24L386.5 76.98L386.25 77.72L385.97 78.46L385.66 79.19L385.31 79.92L384.93 80.65L384.52 81.37L384.07 82.08L383.59 82.79L383.09 83.5L382.55 84.2L381.98 84.89L381.38 85.58L380.75 86.26L380.08 86.93L379.39 87.6L378.67 88.26L377.92 88.91L377.14 89.55L376.34 90.18L375.5 90.8L374.64 91.42L373.75 92.02L372.83 92.61L371.89 93.2L370.92 93.77L369.93 94.33L368.91 94.88L367.87 95.42L366.8 95.95L365.71 96.46L364.6 96.97L363.46 97.46L362.31 97.94L361.13 98.4L359.93 98.85L358.72 99.29L357.48 99.71L356.22 100.12L354.95 100.52L353.66 100.9L352.35 101.27L351.03 101.62L349.69 101.96L348.34 102.29L346.97 102.59L345.59 102.89L344.2 103.16L342.79 103.43L341.37 103.67L339.95 103.9L338.51 104.12L337.06 104.31L335.61 104.5L334.14 104.66L332.67 104.81L331.2 104.94L329.72 105.06L328.23 105.16L326.74 105.24L325.24 105.31L323.75 105.36L322.25 105.39L320.75 105.41L319.25 105.41L317.75 105.39L316.25 105.36L314.76 105.31L313.26 105.24L311.77 105.16L310.28 105.06L308.8 104.94L307.33 104.81L305.86 104.66L304.39 104.5L302.94 104.31L301.49 104.12L300.05 103.9L298.63 103.67L297.21 103.43L295.8 103.16L294.41 102.89L293.03 102.59L291.66 102.29L290.31 101.96L288.97 101.62L287.65 101.27L286.34 100.9L285.05 100.52L283.78 100.12L282.52 99.71L281.28 99.29L280.07 98.85L278.87 98.4L277.69 97.94L276.54 97.46L275.4 96.97L274.29 96.46L273.2 95.95L272.13 95.42L271.09 94.88L270.07 94.33L269.08 93.77L268.11 93.2L267.17 92.61L266.25 92.02L265.36 91.42L264.5 90.8L263.66 90.18L262.86 89.55L262.08 88.91L261.33 88.26L260.61 87.6L259.92 86.93L259.25 86.26L258.62 85.58L258.02 84.89L257.45 84.2L256.91 83.5L256.41 82.79L255.93 82.08L255.48 81.37L255.07 80.65L254.69 79.92L254.34 79.19L254.03 78.46L253.75 77.72L253.5 76.98L253.28 76.24L253.1 75.49L252.95 74.75L252.83 74L252.75 73.25L252.7 72.5L252.68 71.75L252.68 45.42L252.7 44.67L252.75 43.92L252.83 43.18L252.95 42.43L253.1 41.68L253.28 40.94L253.5 40.2L253.75 39.46L254.03 38.72L254.34 37.99L254.69 37.26L255.07 36.53L255.48 35.81L255.93 35.09L256.41 34.38L256.91 33.68L257.45 32.98L258.02 32.28L258.62 31.6L259.25 30.92L259.92 30.24L260.61 29.58L261.33 28.92L262.08 28.27L262.86 27.63L263.66 27L264.5 26.37L265.36 25.76L266.25 25.16L267.17 24.56L268.11 23.98L269.08 23.41L270.07 22.85L271.09 22.29L272.13 21.76L273.2 21.23L274.29 20.71L275.4 20.21L276.54 19.72L277.69 19.24L278.87 18.78L280.07 18.33L281.28 17.89L282.52 17.46L283.78 17.05L285.05 16.66L286.34 16.27L287.65 15.91L288.97 15.55L290.31 15.21L291.66 14.89L293.03 14.58L294.41 14.29L295.8 14.01L297.21 13.75L298.63 13.51L300.05 13.28L301.49 13.06L302.94 12.86L304.39 12.68L305.86 12.52L307.33 12.37L308.8 12.23L310.28 12.12L311.77 12.02L313.26 11.93L314.76 11.87L316.25 11.82L317.75 11.78L319.25 11.77L320.75 11.77L322.25 11.78L323.75 11.82L325.24 11.87L326.74 11.93L328.23 12.02L329.72 12.12L331.2 12.23L332.67 12.37L334.14 12.52L335.61 12.68L337.06 12.86L338.51 13.06L339.95 13.28L341.37 13.51L342.79 13.75L344.2 14.01L345.59 14.29L346.97 14.58L348.34 14.89L349.69 15.21L351.03 15.55L352.35 15.91L353.66 16.27L354.95 16.66L356.22 17.05L357.48 17.46L358.72 17.89L359.93 18.33L361.13 18.78L362.31 19.24L363.46 19.72L364.6 20.21L365.71 20.71L366.8 21.23L367.87 21.76L368.91 22.29L369.93 22.85L370.92 23.41L371.89 23.98L372.83 24.56L373.75 25.16L374.64 25.76L375.5 26.37L376.34 27L377.14 27.63L377.92 28.27L378.67 28.92L379.39 29.58L380.08 30.24L380.75 30.92L381.38 31.6L381.98 32.28L382.55 32.98L383.09 33.68L383.59 34.38L384.07 35.09L384.52 35.81L384.93 36.53L385.31 37.26L385.66 37.99L385.97 38.72L386.25 39.46L386.5 40.2L386.72 40.94L386.9 41.68L387.05 42.43L387.17 43.18L387.25 43.92L387.3 44.67L387.32 45.42Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M387.32 71.75L387.18 73.95L386.74 76.15L386.03 78.32L385.03 80.46L383.75 82.57L382.2 84.63L380.38 86.64L378.3 88.58L375.97 90.45L373.41 92.24L370.61 93.95L367.6 95.55L364.39 97.06L360.98 98.46L357.4 99.74L353.66 100.9L349.77 101.94L345.76 102.85L341.64 103.63L337.42 104.27L333.13 104.77L328.79 105.12L324.4 105.34L320 105.41L320 79.08L324.4 79.01L328.79 78.8L333.13 78.44L337.42 77.94L341.64 77.3L345.76 76.52L349.77 75.61L353.66 74.57L357.4 73.41L360.98 72.13L364.39 70.73L367.6 69.22L370.61 67.62L373.41 65.91L375.97 64.12L378.3 62.25L380.38 60.31L382.2 58.3L383.75 56.24L385.03 54.14L386.03 51.99L386.74 49.82L387.18 47.63L387.32 45.42Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M320 105.41L315.73 105.34L311.47 105.14L307.24 104.8L303.07 104.33L298.97 103.73L298.97 77.4L303.07 78L307.24 78.47L311.47 78.81L315.73 79.02L320 79.08Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M298.97 103.73L295.37 103.08L291.85 102.33L288.42 101.48L285.1 100.53L281.88 99.5L278.79 98.37L275.83 97.16L275.83 70.83L278.79 72.04L281.88 73.17L285.1 74.21L288.42 75.15L291.85 76L295.37 76.75L298.97 77.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M275.83 97.16L272.85 95.78L270.04 94.31L267.41 92.77L264.97 91.14L262.73 89.45L260.7 87.69L258.89 85.87L257.3 84L255.93 82.09L254.8 80.14L254.8 53.81L255.93 55.76L257.3 57.67L258.89 59.54L260.7 61.36L262.73 63.12L264.97 64.81L267.41 66.44L270.04 67.98L272.85 69.45L275.83 70.83Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M254.8 80.14L253.88 78.07L253.21 75.98L252.81 73.87L252.68 71.75L252.68 45.42L252.81 47.54L253.21 49.65L253.88 51.74L254.8 53.81Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M367.6 69.22L365.7 70.14L363.72 71.02L361.68 71.86L359.57 72.65L357.4 73.41L355.17 74.12L352.89 74.79L350.56 75.41L348.18 75.99L345.76 76.52L343.3 77L340.8 77.44L338.27 77.82L335.72 78.15L333.13 78.44L330.53 78.67L327.91 78.85L325.28 78.98L322.64 79.06L320 79.08L317.36 79.06L314.72 78.98L312.09 78.85L309.47 78.67L306.87 78.44L304.28 78.15L301.73 77.82L299.2 77.44L296.7 77L294.24 76.52L291.82 75.99L289.44 75.41L287.11 74.79L284.83 74.12L282.6 73.41L280.43 72.65L278.32 71.86L276.28 71.02L274.3 70.14L272.4 69.22L270.57 68.27L268.81 67.28L267.13 66.26L265.54 65.21L264.03 64.12L262.6 63.01L261.26 61.87L260.02 60.7L258.86 59.52L257.8 58.3L256.84 57.07L255.98 55.83L255.21 54.56L254.54 53.28L253.97 51.99L253.51 50.69L253.15 49.38L252.89 48.06L252.73 46.75L252.68 45.42L252.73 44.1L252.89 42.78L253.15 41.47L253.51 40.16L253.97 38.86L254.54 37.57L255.21 36.29L255.98 35.02L256.84 33.77L257.8 32.54L258.86 31.33L260.02 30.14L261.26 28.98L262.6 27.84L264.03 26.72L265.54 25.64L267.13 24.59L268.81 23.56L270.57 22.58L272.4 21.62L274.3 20.71L276.28 19.83L278.32 18.99L280.43 18.19L282.6 17.44L284.83 16.72L287.11 16.06L289.44 15.43L291.82 14.86L294.24 14.33L296.7 13.84L299.2 13.41L301.73 13.03L304.28 12.69L306.87 12.41L309.47 12.18L312.09 12L314.72 11.87L317.36 11.79L320 11.76L322.64 11.79L325.28 11.87L327.91 12L330.53 12.18L333.13 12.41L335.72 12.69L338.27 13.03L340.8 13.41L343.3 13.84L345.76 14.33L348.18 14.86L350.56 15.43L352.89 16.06L355.17 16.72L357.4 17.44L359.57 18.19L361.68 18.99L363.72 19.83L365.7 20.71L367.6 21.62L369.43 22.58L371.19 23.56L372.87 24.59L374.46 25.64L375.97 26.72L377.4 27.84L378.74 28.98L379.98 30.14L381.14 31.33L382.2 32.54L383.16 33.77L384.02 35.02L384.79 36.29L385.46 37.57L386.03 38.86L386.49 40.16L386.85 41.47L387.11 42.78L387.27 44.1L387.32 45.42L387.27 46.75L387.11 48.06L386.85 49.38L386.49 50.69L386.03 51.99L385.46 53.28L384.79 54.56L384.02 55.83L383.16 57.07L382.2 58.3L381.14 59.52L379.98 60.7L378.74 61.87L377.4 63.01L375.97 64.12L374.46 65.21L372.87 66.26L371.19 67.28L369.43 68.27Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M387.32 45.42L387.3 46.17L387.25 46.92L387.17 47.67L387.05 48.42L386.9 49.17L386.72 49.91L386.5 50.65L386.25 51.39L385.97 52.13L385.66 52.86L385.31 53.59L384.93 54.32L384.52 55.04L384.07 55.75L383.59 56.46L383.09 57.17L382.55 57.87L381.98 58.56L381.38 59.25L380.75 59.93L380.08 60.6L379.39 61.27L378.67 61.93L377.92 62.58L377.14 63.22L376.34 63.85L375.5 64.47L374.64 65.09L373.75 65.69L372.83 66.28L371.89 66.87L370.92 67.44L369.93 68L368.91 68.55L367.87 69.09L366.8 69.62L365.71 70.13L364.6 70.64L363.46 71.13L362.31 71.61L361.13 72.07L359.93 72.52L358.72 72.96L357.48 73.38L356.22 73.8L354.95 74.19L353.66 74.57L352.35 74.94L351.03 75.29L349.69 75.63L348.34 75.96L346.97 76.26L345.59 76.56L344.2 76.83L342.79 77.1L341.37 77.34L339.95 77.57L338.51 77.79L337.06 77.98L335.61 78.17L334.14 78.33L332.67 78.48L331.2 78.61L329.72 78.73L328.23 78.83L326.74 78.91L325.24 78.98L323.75 79.03L322.25 79.06L320.75 79.08L319.25 79.08L317.75 79.06L316.25 79.03L314.76 78.98L313.26 78.91L311.77 78.83L310.28 78.73L308.8 78.61L307.33 78.48L305.86 78.33L304.39 78.17L302.94 77.98L301.49 77.79L300.05 77.57L298.63 77.34L297.21 77.1L295.8 76.83L294.41 76.56L293.03 76.26L291.66 75.96L290.31 75.63L288.97 75.29L287.65 74.94L286.34 74.57L285.05 74.19L283.78 73.8L282.52 73.38L281.28 72.96L280.07 72.52L278.87 72.07L277.69 71.61L276.54 71.13L275.4 70.64L274.29 70.13L273.2 69.62L272.13 69.09L271.09 68.55L270.07 68L269.08 67.44L268.11 66.87L267.17 66.28L266.25 65.69L265.36 65.09L264.5 64.47L263.66 63.85L262.86 63.22L262.08 62.58L261.33 61.93L260.61 61.27L259.92 60.6L259.25 59.93L258.62 59.25L258.02 58.56L257.45 57.87L256.91 57.17L256.41 56.46L255.93 55.75L255.48 55.04L255.07 54.32L254.69 53.59L254.34 52.86L254.03 52.13L253.75 51.39L253.5 50.65L253.28 49.91L253.1 49.17L252.95 48.42L252.83 47.67L252.75 46.92L252.7 46.17L252.68 45.42\"/><path class=\"iso-line\" data-tone=\"faint\" data-r=\"inner\" d=\"M387.32 71.11L387.29 71.86L387.22 72.6L387.13 73.35L387 74.09L386.84 74.83L386.64 75.57L386.42 76.31L386.16 77.04L385.86 77.77L385.54 78.5L385.18 79.23L384.79 79.95L384.37 80.66L383.92 81.37L383.44 82.08L382.92 82.78L382.38 83.47L381.8 84.16L381.2 84.84L380.56 85.51L379.89 86.18L379.2 86.84L378.47 87.49L377.72 88.14L376.94 88.77L376.13 89.4L375.29 90.01L374.43 90.62L373.54 91.22L372.62 91.81L371.67 92.39L370.71 92.95L369.71 93.51L368.7 94.05L367.65 94.59L366.59 95.11L365.5 95.62L364.39 96.12L363.26 96.6L362.11 97.08L360.93 97.54L359.74 97.98L358.52 98.42L357.29 98.84L356.04 99.24L354.77 99.63L353.49 100.01L352.18 100.38L350.87 100.73L349.53 101.06L348.19 101.38L346.83 101.68L345.45 101.97L344.06 102.25L342.67 102.51L341.26 102.75L339.84 102.98L338.41 103.19L336.97 103.39L335.52 103.57L334.06 103.73L332.6 103.88L331.13 104.01L329.66 104.12L328.18 104.22L326.7 104.31L325.21 104.37L323.73 104.42L322.24 104.45L320.75 104.47L319.25 104.47L317.76 104.45L316.27 104.42L314.79 104.37L313.3 104.31L311.82 104.22L310.34 104.12L308.87 104.01L307.4 103.88L305.94 103.73L304.48 103.57L303.03 103.39L301.59 103.19L300.16 102.98L298.74 102.75L297.33 102.51L295.94 102.25L294.55 101.97L293.17 101.68L291.81 101.38L290.47 101.06L289.13 100.73L287.82 100.38L286.51 100.01L285.23 99.63L283.96 99.24L282.71 98.84L281.48 98.42L280.26 97.98L279.07 97.54L277.89 97.08L276.74 96.6L275.61 96.12L274.5 95.62L273.41 95.11L272.35 94.59L271.3 94.05L270.29 93.51L269.29 92.95L268.33 92.39L267.38 91.81L266.46 91.22L265.57 90.62L264.71 90.01L263.87 89.4L263.06 88.77L262.28 88.14L261.53 87.49L260.8 86.84L260.11 86.18L259.44 85.51L258.8 84.84L258.2 84.16L257.62 83.47L257.08 82.78L256.56 82.08L256.08 81.37L255.63 80.66L255.21 79.95L254.82 79.23L254.46 78.5L254.14 77.77L253.84 77.04L253.58 76.31L253.36 75.57L253.16 74.83L253 74.09L252.87 73.35L252.78 72.6L252.71 71.86L252.68 71.11M387.32 46.66L387.29 47.41L387.22 48.15L387.13 48.9L387 49.64L386.84 50.38L386.64 51.12L386.42 51.86L386.16 52.59L385.86 53.32L385.54 54.05L385.18 54.78L384.79 55.5L384.37 56.21L383.92 56.92L383.44 57.63L382.92 58.33L382.38 59.02L381.8 59.71L381.2 60.39L380.56 61.07L379.89 61.73L379.2 62.39L378.47 63.04L377.72 63.69L376.94 64.32L376.13 64.95L375.29 65.57L374.43 66.17L373.54 66.77L372.62 67.36L371.67 67.94L370.71 68.5L369.71 69.06L368.7 69.61L367.65 70.14L366.59 70.66L365.5 71.17L364.39 71.67L363.26 72.15L362.11 72.63L360.93 73.09L359.74 73.53L358.52 73.97L357.29 74.39L356.04 74.79L354.77 75.19L353.49 75.56L352.18 75.93L350.87 76.28L349.53 76.61L348.19 76.93L346.83 77.24L345.45 77.53L344.06 77.8L342.67 78.06L341.26 78.3L339.84 78.53L338.41 78.74L336.97 78.94L335.52 79.12L334.06 79.28L332.6 79.43L331.13 79.56L329.66 79.68L328.18 79.77L326.7 79.86L325.21 79.92L323.73 79.97L322.24 80.01L320.75 80.02L319.25 80.02L317.76 80.01L316.27 79.97L314.79 79.92L313.3 79.86L311.82 79.77L310.34 79.68L308.87 79.56L307.4 79.43L305.94 79.28L304.48 79.12L303.03 78.94L301.59 78.74L300.16 78.53L298.74 78.3L297.33 78.06L295.94 77.8L294.55 77.53L293.17 77.24L291.81 76.93L290.47 76.61L289.13 76.28L287.82 75.93L286.51 75.56L285.23 75.19L283.96 74.79L282.71 74.39L281.48 73.97L280.26 73.53L279.07 73.09L277.89 72.63L276.74 72.15L275.61 71.67L274.5 71.17L273.41 70.66L272.35 70.14L271.3 69.61L270.29 69.06L269.29 68.5L268.33 67.94L267.38 67.36L266.46 66.77L265.57 66.17L264.71 65.57L263.87 64.95L263.06 64.32L262.28 63.69L261.53 63.04L260.8 62.39L260.11 61.73L259.44 61.07L258.8 60.39L258.2 59.71L257.62 59.02L257.08 58.33L256.56 57.63L256.08 56.92L255.63 56.21L255.21 55.5L254.82 54.78L254.46 54.05L254.14 53.32L253.84 52.59L253.58 51.86L253.36 51.12L253.16 50.38L253 49.64L252.87 48.9L252.78 48.15L252.71 47.41L252.68 46.66\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r0\" opacity=\"1\" d=\"M367.6 94.61L367.6 70.17M365.42 95.66L365.42 71.21M363.14 96.65L363.14 72.2M360.78 97.59L360.78 73.14M358.34 98.48L358.34 74.03M355.82 99.31L355.82 74.86M353.22 100.09L353.22 75.64M350.56 100.8L350.56 76.36M347.84 101.46L347.84 77.01M345.06 102.05L345.06 77.6M342.23 102.58L342.23 78.13M339.36 103.05L339.36 78.6M336.45 103.45L336.45 79M333.5 103.79L333.5 79.34M330.53 104.06L330.53 79.61M327.54 104.26L327.54 79.81M324.53 104.4L324.53 79.95M321.51 104.46L321.51 80.02M318.49 104.46L318.49 80.02M315.47 104.4L315.47 79.95M312.46 104.26L312.46 79.81M309.47 104.06L309.47 79.61M306.5 103.79L306.5 79.34M303.55 103.45L303.55 79M300.64 103.05L300.64 78.6M297.77 102.58L297.77 78.13M294.94 102.05L294.94 77.6M292.16 101.46L292.16 77.01M289.44 100.8L289.44 76.36M286.78 100.09L286.78 75.64M284.18 99.31L284.18 74.86M281.66 98.48L281.66 74.03M279.22 97.59L279.22 73.14M276.86 96.65L276.86 72.2M274.58 95.66L274.58 71.21M272.4 94.61L272.4 70.17M270.31 93.52L270.31 69.07M268.32 92.38L268.32 67.94M266.44 91.2L266.44 66.75M373.56 91.2L373.56 66.75M371.68 92.38L371.68 67.94M369.69 93.52L369.69 69.07\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r1\" opacity=\"0.969\" d=\"M264.66 89.98L264.66 65.53M375.34 89.98L375.34 65.53\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r2\" opacity=\"0.906\" d=\"M263 88.72L263 64.27M377 88.72L377 64.27\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r3\" opacity=\"0.844\" d=\"M261.45 87.42L261.45 62.98M378.55 87.42L378.55 62.98\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r4\" opacity=\"0.75\" d=\"M260.02 86.09L260.02 61.65M379.98 86.09L379.98 61.65\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r5\" opacity=\"0.625\" d=\"M258.71 84.73L258.71 60.28M381.29 84.73L381.29 60.28\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r6\" opacity=\"0.531\" d=\"M257.52 83.34L257.52 58.9M382.48 83.34L382.48 58.9\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r7\" opacity=\"0.406\" d=\"M256.46 81.93L256.46 57.48M383.54 81.93L383.54 57.48\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r8\" opacity=\"0.281\" d=\"M255.52 80.49L255.52 56.04M384.48 80.49L384.48 56.04\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r9\" opacity=\"0.188\" d=\"M254.72 79.04L254.72 54.59M385.28 79.04L385.28 54.59\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r10\" opacity=\"0.094\" d=\"M254.05 77.56L254.05 53.12M385.95 77.56L385.95 53.12\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r11\" opacity=\"0.031\" d=\"M253.51 76.08L253.51 51.63M386.49 76.08L386.49 51.63\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r12\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r13\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r14\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r15\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r16\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r17\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r18\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r19\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r20\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r21\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r22\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r23\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r24\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r25\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r26\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r27\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r28\" opacity=\"0\" d=\"\"/><path class=\"iso-line\" data-tone=\"lo\" data-r=\"r29\" opacity=\"0\" d=\"\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M387.32 71.75L387.3 72.5L387.25 73.25L387.17 74L387.05 74.75L386.9 75.49L386.72 76.24L386.5 76.98L386.25 77.72L385.97 78.46L385.66 79.19L385.31 79.92L384.93 80.65L384.52 81.37L384.07 82.08L383.59 82.79L383.09 83.5L382.55 84.2L381.98 84.89L381.38 85.58L380.75 86.26L380.08 86.93L379.39 87.6L378.67 88.26L377.92 88.91L377.14 89.55L376.34 90.18L375.5 90.8L374.64 91.42L373.75 92.02L372.83 92.61L371.89 93.2L370.92 93.77L369.93 94.33L368.91 94.88L367.87 95.42L366.8 95.95L365.71 96.46L364.6 96.97L363.46 97.46L362.31 97.94L361.13 98.4L359.93 98.85L358.72 99.29L357.48 99.71L356.22 100.12L354.95 100.52L353.66 100.9L352.35 101.27L351.03 101.62L349.69 101.96L348.34 102.29L346.97 102.59L345.59 102.89L344.2 103.16L342.79 103.43L341.37 103.67L339.95 103.9L338.51 104.12L337.06 104.31L335.61 104.5L334.14 104.66L332.67 104.81L331.2 104.94L329.72 105.06L328.23 105.16L326.74 105.24L325.24 105.31L323.75 105.36L322.25 105.39L320.75 105.41L319.25 105.41L317.75 105.39L316.25 105.36L314.76 105.31L313.26 105.24L311.77 105.16L310.28 105.06L308.8 104.94L307.33 104.81L305.86 104.66L304.39 104.5L302.94 104.31L301.49 104.12L300.05 103.9L298.63 103.67L297.21 103.43L295.8 103.16L294.41 102.89L293.03 102.59L291.66 102.29L290.31 101.96L288.97 101.62L287.65 101.27L286.34 100.9L285.05 100.52L283.78 100.12L282.52 99.71L281.28 99.29L280.07 98.85L278.87 98.4L277.69 97.94L276.54 97.46L275.4 96.97L274.29 96.46L273.2 95.95L272.13 95.42L271.09 94.88L270.07 94.33L269.08 93.77L268.11 93.2L267.17 92.61L266.25 92.02L265.36 91.42L264.5 90.8L263.66 90.18L262.86 89.55L262.08 88.91L261.33 88.26L260.61 87.6L259.92 86.93L259.25 86.26L258.62 85.58L258.02 84.89L257.45 84.2L256.91 83.5L256.41 82.79L255.93 82.08L255.48 81.37L255.07 80.65L254.69 79.92L254.34 79.19L254.03 78.46L253.75 77.72L253.5 76.98L253.28 76.24L253.1 75.49L252.95 74.75L252.83 74L252.75 73.25L252.7 72.5L252.68 71.75L252.68 45.42L252.7 44.67L252.75 43.92L252.83 43.18L252.95 42.43L253.1 41.68L253.28 40.94L253.5 40.2L253.75 39.46L254.03 38.72L254.34 37.99L254.69 37.26L255.07 36.53L255.48 35.81L255.93 35.09L256.41 34.38L256.91 33.68L257.45 32.98L258.02 32.28L258.62 31.6L259.25 30.92L259.92 30.24L260.61 29.58L261.33 28.92L262.08 28.27L262.86 27.63L263.66 27L264.5 26.37L265.36 25.76L266.25 25.16L267.17 24.56L268.11 23.98L269.08 23.41L270.07 22.85L271.09 22.29L272.13 21.76L273.2 21.23L274.29 20.71L275.4 20.21L276.54 19.72L277.69 19.24L278.87 18.78L280.07 18.33L281.28 17.89L282.52 17.46L283.78 17.05L285.05 16.66L286.34 16.27L287.65 15.91L288.97 15.55L290.31 15.21L291.66 14.89L293.03 14.58L294.41 14.29L295.8 14.01L297.21 13.75L298.63 13.51L300.05 13.28L301.49 13.06L302.94 12.86L304.39 12.68L305.86 12.52L307.33 12.37L308.8 12.23L310.28 12.12L311.77 12.02L313.26 11.93L314.76 11.87L316.25 11.82L317.75 11.78L319.25 11.77L320.75 11.77L322.25 11.78L323.75 11.82L325.24 11.87L326.74 11.93L328.23 12.02L329.72 12.12L331.2 12.23L332.67 12.37L334.14 12.52L335.61 12.68L337.06 12.86L338.51 13.06L339.95 13.28L341.37 13.51L342.79 13.75L344.2 14.01L345.59 14.29L346.97 14.58L348.34 14.89L349.69 15.21L351.03 15.55L352.35 15.91L353.66 16.27L354.95 16.66L356.22 17.05L357.48 17.46L358.72 17.89L359.93 18.33L361.13 18.78L362.31 19.24L363.46 19.72L364.6 20.21L365.71 20.71L366.8 21.23L367.87 21.76L368.91 22.29L369.93 22.85L370.92 23.41L371.89 23.98L372.83 24.56L373.75 25.16L374.64 25.76L375.5 26.37L376.34 27L377.14 27.63L377.92 28.27L378.67 28.92L379.39 29.58L380.08 30.24L380.75 30.92L381.38 31.6L381.98 32.28L382.55 32.98L383.09 33.68L383.59 34.38L384.07 35.09L384.52 35.81L384.93 36.53L385.31 37.26L385.66 37.99L385.97 38.72L386.25 39.46L386.5 40.2L386.72 40.94L386.9 41.68L387.05 42.43L387.17 43.18L387.25 43.92L387.3 44.67L387.32 45.42Z\"/></g><g class=\"iso-solid\" data-p=\"69\" data-name=\"stagger.tooth7\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M270.02 128.62L264.85 130.11L262.62 129.82L260.78 128.22L260.78 116.93L261.37 115.82L266.54 114.33L270.02 117.34Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"M270.02 117.34L264.85 118.83L264.85 130.11L270.02 128.62Z\"/><path class=\"iso-tn\" data-r=\"f1\" data-b=\"1\" d=\"M264.85 118.83L262.62 118.53L262.62 129.82L264.85 130.11Z\"/><path class=\"iso-tn\" data-r=\"f2\" data-b=\"3\" d=\"M262.62 118.53L260.78 116.93L260.78 128.22L262.62 129.82Z\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M270.02 117.34L264.85 118.83L262.62 118.53L260.78 116.93L261.37 115.82L266.54 114.33Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M264.85 130.11L264.85 118.83M262.62 129.82L262.62 118.53M270.02 117.34L264.85 118.83L262.62 118.53L260.78 116.93\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M270.02 128.62L264.85 130.11L262.62 129.82L260.78 128.22L260.78 116.93L261.37 115.82L266.54 114.33L270.02 117.34Z\"/></g><g class=\"iso-solid\" data-p=\"91\" data-name=\"waapi.glass\" data-mat=\"glass\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M378.22 36.65L378.63 37.36L379.01 38.08L379.35 38.81L379.66 39.54L379.93 40.27L380.16 41.01L380.36 41.75L380.52 42.49L380.65 43.23L380.74 43.98L380.79 44.72L380.8 45.47L380.78 46.21L380.73 46.96L380.63 47.7L380.5 48.44L380.34 49.18L380.14 49.92L379.9 50.66L379.62 51.39L379.31 52.12L378.96 52.85L378.58 53.57L378.17 54.28L377.71 54.99L377.23 55.7L376.71 56.4L376.15 57.09L375.56 57.77L374.94 58.45L374.29 59.12L373.6 59.78L372.88 60.43L372.12 61.08L371.34 61.71L370.53 62.34L369.68 62.95L368.81 63.55L367.9 64.15L366.97 64.73L366.01 65.3L365.02 65.86L364.01 66.4L362.97 66.94L361.9 67.46L360.8 67.96L359.69 68.46L358.55 68.94L357.38 69.4L356.19 69.85L354.98 70.29L353.75 70.71L352.5 71.12L351.23 71.51L349.95 71.88L348.64 72.24L347.32 72.59L345.98 72.91L344.62 73.22L343.25 73.52L341.86 73.79L340.47 74.05L339.06 74.29L337.64 74.52L336.2 74.73L334.76 74.92L333.31 75.09L331.85 75.24L330.39 75.38L328.91 75.5L327.44 75.6L325.95 75.68L324.47 75.74L322.98 75.79L321.49 75.82L320 75.83L318.51 75.82L317.02 75.79L315.53 75.74L314.05 75.68L312.56 75.6L311.09 75.5L309.61 75.38L308.15 75.24L306.69 75.09L305.24 74.92L303.8 74.73L302.36 74.52L300.94 74.29L299.53 74.05L298.14 73.79L296.75 73.52L295.38 73.22L294.02 72.91L292.68 72.59L291.36 72.24L290.05 71.88L288.77 71.51L287.5 71.12L286.25 70.71L285.02 70.29L283.81 69.85L282.62 69.4L281.45 68.94L280.31 68.46L279.2 67.96L278.1 67.46L277.03 66.94L275.99 66.4L274.98 65.86L273.99 65.3L273.03 64.73L272.1 64.15L271.19 63.55L270.32 62.95L269.47 62.34L268.66 61.71L267.88 61.08L267.12 60.43L266.4 59.78L265.71 59.12L265.06 58.45L264.44 57.77L263.85 57.09L263.29 56.4L262.77 55.7L262.29 54.99L261.83 54.28L261.42 53.57L261.04 52.85L260.69 52.12L260.38 51.39L260.1 50.66L259.86 49.92L259.66 49.18L259.5 48.44L259.37 47.7L259.27 46.96L259.22 46.21L259.2 45.47L259.21 44.72L259.26 43.98L259.35 43.23L259.48 42.49L259.64 41.75L259.84 41.01L260.07 40.27L260.34 39.54L260.65 38.81L260.99 38.08L261.37 37.36L261.78 36.65L265.94 29.75L266.39 29.04L266.88 28.34L267.4 27.64L267.96 26.95L268.55 26.27L269.18 25.6L269.85 24.93L270.55 24.28L271.28 23.63L272.05 22.99L272.86 22.37L273.69 21.75L274.56 21.15L275.46 20.55L276.39 19.97L277.35 19.4L278.33 18.85L279.35 18.31L280.4 17.78L281.47 17.26L282.57 16.76L283.7 16.28L284.85 15.81L286.03 15.35L287.23 14.91L288.45 14.49L289.7 14.08L290.96 13.69L292.25 13.32L293.55 12.96L294.88 12.62L296.22 12.3L297.58 11.99L298.95 11.71L300.34 11.44L301.74 11.19L303.15 10.96L304.58 10.74L306.01 10.55L307.46 10.38L308.91 10.22L310.38 10.08L311.85 9.97L313.32 9.87L314.8 9.79L316.28 9.73L317.77 9.69L319.26 9.67L320.74 9.67L322.23 9.69L323.72 9.73L325.2 9.79L326.68 9.87L328.15 9.97L329.62 10.08L331.09 10.22L332.54 10.38L333.99 10.55L335.42 10.74L336.85 10.96L338.26 11.19L339.66 11.44L341.05 11.71L342.42 11.99L343.78 12.3L345.12 12.62L346.45 12.96L347.75 13.32L349.04 13.69L350.3 14.08L351.55 14.49L352.77 14.91L353.97 15.35L355.15 15.81L356.3 16.28L357.43 16.76L358.53 17.26L359.6 17.78L360.65 18.31L361.67 18.85L362.65 19.4L363.61 19.97L364.54 20.55L365.44 21.15L366.31 21.75L367.14 22.37L367.95 22.99L368.72 23.63L369.45 24.28L370.15 24.93L370.82 25.6L371.45 26.27L372.04 26.95L372.6 27.64L373.12 28.34L373.61 29.04L374.06 29.75Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M378.22 36.65L379.22 38.53L379.98 40.45L380.5 42.38L380.77 44.33L380.78 46.28L380.55 48.23L380.06 50.17L379.33 52.09L378.35 53.97L377.13 55.83L375.68 57.64L374 59.4L372.09 61.11L369.97 62.75L367.64 64.31L365.12 65.8L362.41 67.21L359.53 68.52L356.48 69.75L353.88 60.49L356.71 59.35L359.38 58.13L361.9 56.82L364.24 55.44L366.4 53.99L368.37 52.46L370.14 50.88L371.7 49.25L373.05 47.56L374.18 45.84L375.09 44.09L375.77 42.31L376.22 40.51L376.44 38.7L376.43 36.89L376.18 35.08L375.7 33.28L374.99 31.5L374.06 29.75Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M356.48 69.75L353.25 70.88L349.87 71.91L346.36 72.82L342.75 73.62L339.04 74.3L335.24 74.85L334.16 65.23L337.68 64.71L341.12 64.08L344.48 63.34L347.73 62.49L350.87 61.54L353.88 60.49Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M335.24 74.85L331.42 75.29L327.54 75.59L323.63 75.77L319.71 75.83L315.79 75.75L311.88 75.55L312.46 65.88L316.09 66.06L319.73 66.13L323.37 66.08L327 65.91L330.6 65.63L334.16 65.23Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M311.88 75.55L308.19 75.25L304.53 74.83L300.94 74.29L297.42 73.65L293.98 72.9L290.64 72.05L292.74 62.62L295.84 63.42L299.03 64.11L302.3 64.71L305.64 65.2L309.03 65.59L312.46 65.88Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M290.64 72.05L287.26 71.04L284.01 69.93L280.92 68.71L277.99 67.4L275.23 66L272.66 64.5L270.29 62.93L268.13 61.29L266.18 59.58L264.47 57.8L262.98 55.98L261.73 54.12L260.73 52.21L259.98 50.28L259.47 48.33L259.22 46.36L259.23 44.4L259.49 42.43L260 40.48L260.77 38.55L261.78 36.65L265.94 29.75L265 31.52L264.29 33.31L263.81 35.12L263.57 36.95L263.57 38.77L263.8 40.6L264.26 42.41L264.96 44.2L265.89 45.97L267.05 47.71L268.43 49.4L270.03 51.04L271.83 52.63L273.84 54.16L276.04 55.62L278.43 57L280.99 58.31L283.71 59.53L286.58 60.66L289.6 61.69L292.74 62.62Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" data-b=\"3\" style=\"--f:1\" d=\"M359.92 57.86L358.33 58.63L356.67 59.37L354.96 60.07L353.19 60.74L351.37 61.37L349.5 61.97L347.59 62.53L345.63 63.05L343.64 63.54L341.61 63.98L339.54 64.39L337.45 64.75L335.33 65.07L333.18 65.35L331.02 65.59L328.83 65.78L326.64 65.94L324.43 66.04L322.22 66.11L320 66.13L317.78 66.11L315.57 66.04L313.36 65.94L311.17 65.78L308.98 65.59L306.82 65.35L304.67 65.07L302.55 64.75L300.46 64.39L298.39 63.98L296.36 63.54L294.37 63.05L292.41 62.53L290.5 61.97L288.63 61.37L286.81 60.74L285.04 60.07L283.33 59.37L281.67 58.63L280.08 57.86L278.54 57.06L277.07 56.24L275.66 55.38L274.32 54.49L273.05 53.59L271.86 52.65L270.74 51.7L269.69 50.72L268.72 49.72L267.84 48.7L267.03 47.67L266.3 46.62L265.66 45.56L265.1 44.49L264.62 43.41L264.23 42.32L263.93 41.22L263.71 40.12L263.58 39.01L263.54 37.9L263.58 36.79L263.71 35.69L263.93 34.58L264.23 33.48L264.62 32.39L265.1 31.31L265.66 30.24L266.3 29.18L267.03 28.13L267.84 27.1L268.72 26.08L269.69 25.08L270.74 24.11L271.86 23.15L273.05 22.22L274.32 21.31L275.66 20.42L277.07 19.57L278.54 18.74L280.08 17.94L281.67 17.17L283.33 16.43L285.04 15.73L286.81 15.06L288.63 14.43L290.5 13.83L292.41 13.27L294.37 12.75L296.36 12.26L298.39 11.82L300.46 11.42L302.55 11.05L304.67 10.73L306.82 10.45L308.98 10.21L311.17 10.02L313.36 9.87L315.57 9.76L317.78 9.69L320 9.67L322.22 9.69L324.43 9.76L326.64 9.87L328.83 10.02L331.02 10.21L333.18 10.45L335.33 10.73L337.45 11.05L339.54 11.42L341.61 11.82L343.64 12.26L345.63 12.75L347.59 13.27L349.5 13.83L351.37 14.43L353.19 15.06L354.96 15.73L356.67 16.43L358.33 17.17L359.92 17.94L361.46 18.74L362.93 19.57L364.34 20.42L365.68 21.31L366.95 22.22L368.14 23.15L369.26 24.11L370.31 25.08L371.28 26.08L372.16 27.1L372.97 28.13L373.7 29.18L374.34 30.24L374.9 31.31L375.38 32.39L375.77 33.48L376.07 34.58L376.29 35.69L376.42 36.79L376.46 37.9L376.42 39.01L376.29 40.12L376.07 41.22L375.77 42.32L375.38 43.41L374.9 44.49L374.34 45.56L373.7 46.62L372.97 47.67L372.16 48.7L371.28 49.72L370.31 50.72L369.26 51.7L368.14 52.65L366.95 53.59L365.68 54.49L364.34 55.38L362.93 56.24L361.46 57.06Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M374.06 29.75L374.47 30.47L374.84 31.19L375.18 31.92L375.48 32.65L375.73 33.38L375.95 34.12L376.13 34.86L376.27 35.61L376.38 36.35L376.44 37.1L376.46 37.84L376.44 38.59L376.39 39.33L376.29 40.08L376.16 40.82L375.98 41.56L375.77 42.3L375.52 43.04L375.23 43.77L374.9 44.5L374.53 45.22L374.12 45.94L373.68 46.65L373.2 47.36L372.68 48.06L372.13 48.75L371.53 49.44L370.91 50.11L370.24 50.78L369.54 51.44L368.81 52.09L368.04 52.73L367.24 53.36L366.41 53.98L365.54 54.59L364.65 55.18L363.72 55.77L362.76 56.34L361.77 56.9L360.75 57.44L359.7 57.97L358.63 58.49L357.52 59L356.4 59.48L355.24 59.96L354.06 60.42L352.86 60.86L351.64 61.28L350.39 61.69L349.12 62.09L347.83 62.46L346.52 62.82L345.2 63.16L343.85 63.49L342.49 63.79L341.12 64.08L339.72 64.35L338.32 64.6L336.9 64.84L335.47 65.05L334.03 65.25L332.58 65.42L331.12 65.58L329.65 65.72L328.18 65.83L326.7 65.93L325.22 66.01L323.73 66.07L322.24 66.11L320.75 66.13L319.25 66.13L317.76 66.11L316.27 66.07L314.78 66.01L313.3 65.93L311.82 65.83L310.35 65.72L308.88 65.58L307.42 65.42L305.97 65.25L304.53 65.05L303.1 64.84L301.68 64.6L300.28 64.35L298.88 64.08L297.51 63.79L296.15 63.49L294.8 63.16L293.48 62.82L292.17 62.46L290.88 62.09L289.61 61.69L288.36 61.28L287.14 60.86L285.94 60.42L284.76 59.96L283.6 59.48L282.48 59L281.37 58.49L280.3 57.97L279.25 57.44L278.23 56.9L277.24 56.34L276.28 55.77L275.35 55.18L274.46 54.59L273.59 53.98L272.76 53.36L271.96 52.73L271.19 52.09L270.46 51.44L269.76 50.78L269.09 50.11L268.47 49.44L267.87 48.75L267.32 48.06L266.8 47.36L266.32 46.65L265.88 45.94L265.47 45.22L265.1 44.5L264.77 43.77L264.48 43.04L264.23 42.3L264.02 41.56L263.84 40.82L263.71 40.08L263.61 39.33L263.56 38.59L263.54 37.84L263.56 37.1L263.62 36.35L263.73 35.61L263.87 34.86L264.05 34.12L264.27 33.38L264.52 32.65L264.82 31.92L265.16 31.19L265.53 30.47L265.94 29.75\"/><g data-r=\"plane0\" transform=\"matrix(0.76778 0.38389 0.76778 -0.38389 320 37.88)\" opacity=\"1\"><path class=\"iso-line\" data-tone=\"mid\" d=\"M44.000 0.000L43.833 3.835L43.332 7.641L42.501 11.388L41.346 15.049L39.878 18.595L38.105 22.000L36.043 25.237L33.706 28.283L31.113 31.113L28.283 33.706L25.237 36.043L22.000 38.105L18.595 39.878L15.049 41.346L11.388 42.501L7.641 43.332L3.835 43.833L0.000 44.000L-3.835 43.833L-7.641 43.332L-11.388 42.501L-15.049 41.346L-18.595 39.878L-22.000 38.105L-25.237 36.043L-28.283 33.706L-31.113 31.113L-33.706 28.283L-36.043 25.237L-38.105 22.000L-39.878 18.595L-41.346 15.049L-42.501 11.388L-43.332 7.641L-43.833 3.835L-44.000 0.000L-43.833 -3.835L-43.332 -7.641L-42.501 -11.388L-41.346 -15.049L-39.878 -18.595L-38.105 -22.000L-36.043 -25.237L-33.706 -28.283L-31.113 -31.113L-28.283 -33.706L-25.237 -36.043L-22.000 -38.105L-18.595 -39.878L-15.049 -41.346L-11.388 -42.501L-7.641 -43.332L-3.835 -43.833L-0.000 -44.000L3.835 -43.833L7.641 -43.332L11.388 -42.501L15.049 -41.346L18.595 -39.878L22.000 -38.105L25.237 -36.043L28.283 -33.706L31.113 -31.113L33.706 -28.283L36.043 -25.237L38.105 -22.000L39.878 -18.595L41.346 -15.049L42.501 -11.388L43.332 -7.641L43.833 -3.835ZM30.000 0.000L29.836 3.136L29.344 6.237L28.532 9.271L27.406 12.202L25.981 15.000L24.271 17.634L22.294 20.074L20.074 22.294L17.634 24.271L15.000 25.981L12.202 27.406L9.271 28.532L6.237 29.344L3.136 29.836L0.000 30.000L-3.136 29.836L-6.237 29.344L-9.271 28.532L-12.202 27.406L-15.000 25.981L-17.634 24.271L-20.074 22.294L-22.294 20.074L-24.271 17.634L-25.981 15.000L-27.406 12.202L-28.532 9.271L-29.344 6.237L-29.836 3.136L-30.000 0.000L-29.836 -3.136L-29.344 -6.237L-28.532 -9.271L-27.406 -12.202L-25.981 -15.000L-24.271 -17.634L-22.294 -20.074L-20.074 -22.294L-17.634 -24.271L-15.000 -25.981L-12.202 -27.406L-9.271 -28.532L-6.237 -29.344L-3.136 -29.836L-0.000 -30.000L3.136 -29.836L6.237 -29.344L9.271 -28.532L12.202 -27.406L15.000 -25.981L17.634 -24.271L20.074 -22.294L22.294 -20.074L24.271 -17.634L25.981 -15.000L27.406 -12.202L28.532 -9.271L29.344 -6.237L29.836 -3.136Z\"/><path class=\"iso-line\" data-tone=\"lo\" d=\"M14.000 0.000L13.828 2.190L13.315 4.326L12.474 6.356L11.326 8.229L9.899 9.899L8.229 11.326L6.356 12.474L4.326 13.315L2.190 13.828L0.000 14.000L-2.190 13.828L-4.326 13.315L-6.356 12.474L-8.229 11.326L-9.899 9.899L-11.326 8.229L-12.474 6.356L-13.315 4.326L-13.828 2.190L-14.000 0.000L-13.828 -2.190L-13.315 -4.326L-12.474 -6.356L-11.326 -8.229L-9.899 -9.899L-8.229 -11.326L-6.356 -12.474L-4.326 -13.315L-2.190 -13.828L-0.000 -14.000L2.190 -13.828L4.326 -13.315L6.356 -12.474L8.229 -11.326L9.899 -9.899L11.326 -8.229L12.474 -6.356L13.315 -4.326L13.828 -2.190Z\"/></g><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M378.22 36.65L378.63 37.36L379.01 38.08L379.35 38.81L379.66 39.54L379.93 40.27L380.16 41.01L380.36 41.75L380.52 42.49L380.65 43.23L380.74 43.98L380.79 44.72L380.8 45.47L380.78 46.21L380.73 46.96L380.63 47.7L380.5 48.44L380.34 49.18L380.14 49.92L379.9 50.66L379.62 51.39L379.31 52.12L378.96 52.85L378.58 53.57L378.17 54.28L377.71 54.99L377.23 55.7L376.71 56.4L376.15 57.09L375.56 57.77L374.94 58.45L374.29 59.12L373.6 59.78L372.88 60.43L372.12 61.08L371.34 61.71L370.53 62.34L369.68 62.95L368.81 63.55L367.9 64.15L366.97 64.73L366.01 65.3L365.02 65.86L364.01 66.4L362.97 66.94L361.9 67.46L360.8 67.96L359.69 68.46L358.55 68.94L357.38 69.4L356.19 69.85L354.98 70.29L353.75 70.71L352.5 71.12L351.23 71.51L349.95 71.88L348.64 72.24L347.32 72.59L345.98 72.91L344.62 73.22L343.25 73.52L341.86 73.79L340.47 74.05L339.06 74.29L337.64 74.52L336.2 74.73L334.76 74.92L333.31 75.09L331.85 75.24L330.39 75.38L328.91 75.5L327.44 75.6L325.95 75.68L324.47 75.74L322.98 75.79L321.49 75.82L320 75.83L318.51 75.82L317.02 75.79L315.53 75.74L314.05 75.68L312.56 75.6L311.09 75.5L309.61 75.38L308.15 75.24L306.69 75.09L305.24 74.92L303.8 74.73L302.36 74.52L300.94 74.29L299.53 74.05L298.14 73.79L296.75 73.52L295.38 73.22L294.02 72.91L292.68 72.59L291.36 72.24L290.05 71.88L288.77 71.51L287.5 71.12L286.25 70.71L285.02 70.29L283.81 69.85L282.62 69.4L281.45 68.94L280.31 68.46L279.2 67.96L278.1 67.46L277.03 66.94L275.99 66.4L274.98 65.86L273.99 65.3L273.03 64.73L272.1 64.15L271.19 63.55L270.32 62.95L269.47 62.34L268.66 61.71L267.88 61.08L267.12 60.43L266.4 59.78L265.71 59.12L265.06 58.45L264.44 57.77L263.85 57.09L263.29 56.4L262.77 55.7L262.29 54.99L261.83 54.28L261.42 53.57L261.04 52.85L260.69 52.12L260.38 51.39L260.1 50.66L259.86 49.92L259.66 49.18L259.5 48.44L259.37 47.7L259.27 46.96L259.22 46.21L259.2 45.47L259.21 44.72L259.26 43.98L259.35 43.23L259.48 42.49L259.64 41.75L259.84 41.01L260.07 40.27L260.34 39.54L260.65 38.81L260.99 38.08L261.37 37.36L261.78 36.65L265.94 29.75L266.39 29.04L266.88 28.34L267.4 27.64L267.96 26.95L268.55 26.27L269.18 25.6L269.85 24.93L270.55 24.28L271.28 23.63L272.05 22.99L272.86 22.37L273.69 21.75L274.56 21.15L275.46 20.55L276.39 19.97L277.35 19.4L278.33 18.85L279.35 18.31L280.4 17.78L281.47 17.26L282.57 16.76L283.7 16.28L284.85 15.81L286.03 15.35L287.23 14.91L288.45 14.49L289.7 14.08L290.96 13.69L292.25 13.32L293.55 12.96L294.88 12.62L296.22 12.3L297.58 11.99L298.95 11.71L300.34 11.44L301.74 11.19L303.15 10.96L304.58 10.74L306.01 10.55L307.46 10.38L308.91 10.22L310.38 10.08L311.85 9.97L313.32 9.87L314.8 9.79L316.28 9.73L317.77 9.69L319.26 9.67L320.74 9.67L322.23 9.69L323.72 9.73L325.2 9.79L326.68 9.87L328.15 9.97L329.62 10.08L331.09 10.22L332.54 10.38L333.99 10.55L335.42 10.74L336.85 10.96L338.26 11.19L339.66 11.44L341.05 11.71L342.42 11.99L343.78 12.3L345.12 12.62L346.45 12.96L347.75 13.32L349.04 13.69L350.3 14.08L351.55 14.49L352.77 14.91L353.97 15.35L355.15 15.81L356.3 16.28L357.43 16.76L358.53 17.26L359.6 17.78L360.65 18.31L361.67 18.85L362.65 19.4L363.61 19.97L364.54 20.55L365.44 21.15L366.31 21.75L367.14 22.37L367.95 22.99L368.72 23.63L369.45 24.28L370.15 24.93L370.82 25.6L371.45 26.27L372.04 26.95L372.6 27.64L373.12 28.34L373.61 29.04L374.06 29.75Z\"/></g><g class=\"iso-solid\" data-p=\"62\" data-name=\"stagger.tooth0\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M368.91 135.34L366.3 136.64L363.99 136.64L359.77 134.53L359.77 123.25L364.68 120.79L368.91 122.9L368.91 124.05Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"M368.91 124.05L366.3 125.36L366.3 136.64L368.91 135.34Z\"/><path class=\"iso-tn\" data-r=\"f3\" style=\"--f:0.5\" d=\"M366.3 125.36L363.99 125.36L363.99 136.64L366.3 136.64Z\"/><path class=\"iso-tn\" data-r=\"f4\" data-b=\"3\" d=\"M363.99 125.36L359.77 123.25L359.77 134.53L363.99 136.64Z\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M364.68 120.79L368.91 122.9L368.91 124.05L366.3 125.36L363.99 125.36L359.77 123.25Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M366.3 136.64L366.3 125.36M363.99 136.64L363.99 125.36M368.91 124.05L366.3 125.36L363.99 125.36L359.77 123.25\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M368.91 135.34L366.3 136.64L363.99 136.64L359.77 134.53L359.77 123.25L364.68 120.79L368.91 122.9L368.91 124.05Z\"/></g><g class=\"iso-solid\" data-p=\"68\" data-name=\"stagger.tooth6\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M280.23 134.53L276.01 136.64L273.7 136.64L271.09 135.34L271.09 124.05L271.09 122.9L275.32 120.79L280.23 123.25Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"M280.23 123.25L276.01 125.36L276.01 136.64L280.23 134.53Z\"/><path class=\"iso-tn\" data-r=\"f1\" style=\"--f:0.5\" d=\"M276.01 125.36L273.7 125.36L273.7 136.64L276.01 136.64Z\"/><path class=\"iso-tn\" data-r=\"f2\" data-b=\"3\" d=\"M273.7 125.36L271.09 124.05L271.09 135.34L273.7 136.64Z\"/><path class=\"iso-tn\" data-r=\"f3\" d=\"\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M280.23 123.25L276.01 125.36L273.7 125.36L271.09 124.05L271.09 122.9L275.32 120.79Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M276.01 136.64L276.01 125.36M273.7 136.64L273.7 125.36M280.23 123.25L276.01 125.36L273.7 125.36L271.09 124.05\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M280.23 134.53L276.01 136.64L273.7 136.64L271.09 135.34L271.09 124.05L271.09 122.9L275.32 120.79L280.23 123.25Z\"/></g><g class=\"iso-solid\" data-p=\"55\" data-name=\"svg.clip0\" data-mat=\"chrome\" data-seamless=\"\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M331.31 149.09L331.14 148.69L331.03 148.28L330.98 147.84L331 147.4L331.08 146.95L331.22 146.51L331.43 146.08L331.69 145.67L332.01 145.28L332.37 144.93L332.77 144.62L333.21 144.36L333.67 144.14L334.15 143.98L334.64 143.87L335.14 143.82L335.62 143.83L336.1 143.9L336.55 144.02L336.96 144.2L337.34 144.43L337.68 144.71L337.97 145.03L338.2 145.39L339.74 148.28L339.92 148.67L340.03 149.09L340.07 149.52L340.05 149.97L339.97 150.41L339.83 150.86L339.62 151.29L339.36 151.7L339.04 152.08L338.68 152.43L338.28 152.74L337.84 153.01L337.38 153.22L336.9 153.39L336.41 153.49L335.91 153.54L335.43 153.53L334.95 153.47L334.51 153.34L334.09 153.16L333.71 152.93L333.37 152.65L333.08 152.33L332.85 151.97Z\"/><path class=\"iso-shade\" data-shade=\"0\" data-r=\"s0\" d=\"M337.69 144.72L338.2 145.39L339.74 148.28L339.24 147.61Z\"/><path class=\"iso-shade\" data-shade=\"1\" data-r=\"s1\" d=\"M337.15 144.31L337.69 144.72L339.24 147.61L338.7 147.19Z\"/><path class=\"iso-shade\" data-shade=\"2\" data-r=\"s2\" d=\"M336.41 143.98L337.15 144.31L338.7 147.19L337.95 146.86ZM331.31 149.09L331.08 148.53L332.63 151.41L332.85 151.97Z\"/><path class=\"iso-shade\" data-shade=\"3\" data-r=\"s3\" d=\"M335.55 143.82L336.41 143.98L337.95 146.86L337.1 146.71ZM331.08 148.53L330.98 147.74L332.52 150.62L332.63 151.41Z\"/><path class=\"iso-top\" data-r=\"s4\" d=\"M330.98 147.74L331.22 146.53L331.9 145.4L332.94 144.51L334.21 143.96L335.55 143.82L337.1 146.71L335.76 146.85L334.49 147.4L333.45 148.29L332.76 149.41L332.52 150.62Z\"/><path class=\"iso-tn\" data-r=\"k0\" d=\"\"/><path class=\"iso-tn\" data-r=\"k1\" d=\"M336.3 146.74L337.66 146.79L338.84 147.28L339.68 148.16L340.06 149.31L339.93 150.56L339.31 151.76L338.29 152.74L336.99 153.36L335.6 153.54L334.31 153.27L333.29 152.57L332.67 151.54L332.54 150.32L332.92 149.07L333.75 147.96L334.93 147.15Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M332.85 151.97L332.53 150.87L332.67 149.69L333.24 148.55L334.18 147.61L335.38 146.97L336.68 146.71L337.94 146.86L339.01 147.4L339.74 148.28\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" data-r=\"edge\" d=\"M331.31 149.09L331.14 148.69L331.03 148.28L330.98 147.84L331 147.4L331.08 146.95L331.22 146.51L331.43 146.08L331.69 145.67L332.01 145.28L332.37 144.93L332.77 144.62L333.21 144.36L333.67 144.14L334.15 143.98L334.64 143.87L335.14 143.82L335.62 143.83L336.1 143.9L336.55 144.02L336.96 144.2L337.34 144.43L337.68 144.71L337.97 145.03L338.2 145.39L339.74 148.28L339.92 148.67L340.03 149.09L340.07 149.52L340.05 149.97L339.97 150.41L339.83 150.86L339.62 151.29L339.36 151.7L339.04 152.08L338.68 152.43L338.28 152.74L337.84 153.01L337.38 153.22L336.9 153.39L336.41 153.49L335.91 153.54L335.43 153.53L334.95 153.47L334.51 153.34L334.09 153.16L333.71 152.93L333.37 152.65L333.08 152.33L332.85 151.97Z\"/></g><g class=\"iso-solid\" data-p=\"63\" data-name=\"stagger.tooth1\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M355.85 139.76L355.26 140.88L352.06 141.8L349.84 141.5L346.85 138.91L346.85 127.63L352.87 125.89L355.85 128.48Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"M355.85 128.48L355.26 129.59L355.26 140.88L355.85 139.76Z\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"M355.26 129.59L352.06 130.51L352.06 141.8L355.26 140.88Z\"/><path class=\"iso-tn\" data-r=\"f3\" data-b=\"1\" d=\"M352.06 130.51L349.84 130.22L349.84 141.5L352.06 141.8Z\"/><path class=\"iso-tn\" data-r=\"f4\" data-b=\"3\" d=\"M349.84 130.22L346.85 127.63L346.85 138.91L349.84 141.5Z\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M352.87 125.89L355.85 128.48L355.26 129.59L352.06 130.51L349.84 130.22L346.85 127.63Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M355.26 140.88L355.26 129.59M352.06 141.8L352.06 130.51M349.84 141.5L349.84 130.22M355.85 128.48L355.26 129.59L352.06 130.51L349.84 130.22L346.85 127.63\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M355.85 139.76L355.26 140.88L352.06 141.8L349.84 141.5L346.85 138.91L346.85 127.63L352.87 125.89L355.85 128.48Z\"/></g><g class=\"iso-solid\" data-p=\"67\" data-name=\"stagger.tooth5\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M293.15 138.91L290.16 141.5L287.94 141.8L284.74 140.88L284.15 139.76L284.15 128.48L287.13 125.89L293.15 127.63Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"M293.15 127.63L290.16 130.22L290.16 141.5L293.15 138.91Z\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"M290.16 130.22L287.94 130.51L287.94 141.8L290.16 141.5Z\"/><path class=\"iso-tn\" data-r=\"f2\" data-b=\"2\" d=\"M287.94 130.51L284.74 129.59L284.74 140.88L287.94 141.8Z\"/><path class=\"iso-tn\" data-r=\"f3\" data-b=\"3\" style=\"--f:0.46875\" d=\"M284.74 129.59L284.15 128.48L284.15 139.76L284.74 140.88Z\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M293.15 127.63L290.16 130.22L287.94 130.51L284.74 129.59L284.15 128.48L287.13 125.89Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M290.16 141.5L290.16 130.22M287.94 141.8L287.94 130.51M284.74 140.88L284.74 129.59M293.15 127.63L290.16 130.22L287.94 130.51L284.74 129.59L284.15 128.48\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M293.15 138.91L290.16 141.5L287.94 141.8L284.74 140.88L284.15 139.76L284.15 128.48L287.13 125.89L293.15 127.63Z\"/></g><g class=\"iso-solid\" data-p=\"64\" data-name=\"stagger.tooth2\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M340.36 143.46L339.21 144.46L335.64 144.94L333.65 144.36L332.1 141.48L332.1 130.19L338.81 129.3L340.36 132.18Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"M340.36 132.18L339.21 133.18L339.21 144.46L340.36 143.46Z\"/><path class=\"iso-tn\" data-r=\"f2\" d=\"M339.21 133.18L335.64 133.65L335.64 144.94L339.21 144.46Z\"/><path class=\"iso-tn\" data-r=\"f3\" data-b=\"2\" d=\"M335.64 133.65L333.65 133.08L333.65 144.36L335.64 144.94Z\"/><path class=\"iso-tn\" data-r=\"f4\" data-b=\"3\" style=\"--f:0.46875\" d=\"M333.65 133.08L332.1 130.19L332.1 141.48L333.65 144.36Z\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M338.81 129.3L340.36 132.18L339.21 133.18L335.64 133.65L333.65 133.08L332.1 130.19Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M339.21 144.46L339.21 133.18M335.64 144.94L335.64 133.65M333.65 144.36L333.65 133.08M340.36 132.18L339.21 133.18L335.64 133.65L333.65 133.08L332.1 130.19\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M340.36 143.46L339.21 144.46L335.64 144.94L333.65 144.36L332.1 141.48L332.1 130.19L338.81 129.3L340.36 132.18Z\"/></g><g class=\"iso-solid\" data-p=\"66\" data-name=\"stagger.tooth4\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M307.9 141.48L306.35 144.36L304.36 144.94L300.79 144.46L299.64 143.46L299.64 132.18L301.19 129.3L307.9 130.19Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"M307.9 130.19L306.35 133.08L306.35 144.36L307.9 141.48Z\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"M306.35 133.08L304.36 133.65L304.36 144.94L306.35 144.36Z\"/><path class=\"iso-tn\" data-r=\"f2\" data-b=\"1\" d=\"M304.36 133.65L300.79 133.18L300.79 144.46L304.36 144.94Z\"/><path class=\"iso-tn\" data-r=\"f3\" data-b=\"3\" d=\"M300.79 133.18L299.64 132.18L299.64 143.46L300.79 144.46Z\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M307.9 130.19L306.35 133.08L304.36 133.65L300.79 133.18L299.64 132.18L301.19 129.3Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M306.35 144.36L306.35 133.08M304.36 144.94L304.36 133.65M300.79 144.46L300.79 133.18M307.9 130.19L306.35 133.08L304.36 133.65L300.79 133.18L299.64 132.18\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M307.9 141.48L306.35 144.36L304.36 144.94L300.79 144.46L299.64 143.46L299.64 132.18L301.19 129.3L307.9 130.19Z\"/></g><g class=\"iso-solid\" data-p=\"65\" data-name=\"stagger.tooth3\" data-mat=\"gunmetal\"><path class=\"iso-fill\" data-r=\"fill\" d=\"M323.47 145.03L321.85 145.85L318.15 145.85L316.53 145.03L316.53 133.75L316.53 130.76L323.47 130.76L323.47 133.75Z\"/><path class=\"iso-tn\" data-r=\"f0\" d=\"\"/><path class=\"iso-tn\" data-r=\"f1\" d=\"M323.47 133.75L321.85 134.56L321.85 145.85L323.47 145.03Z\"/><path class=\"iso-tn\" data-r=\"f2\" style=\"--f:0.5\" d=\"M321.85 134.56L318.15 134.56L318.15 145.85L321.85 145.85Z\"/><path class=\"iso-tn\" data-r=\"f3\" data-b=\"3\" d=\"M318.15 134.56L316.53 133.75L316.53 145.03L318.15 145.85Z\"/><path class=\"iso-tn\" data-r=\"f4\" d=\"\"/><path class=\"iso-tn\" data-r=\"f5\" d=\"\"/><path class=\"iso-tn\" data-r=\"f6\" d=\"\"/><path class=\"iso-tn\" data-r=\"f7\" data-b=\"3\" style=\"--f:1\" d=\"M323.47 130.76L323.47 133.75L321.85 134.56L318.15 134.56L316.53 133.75L316.53 130.76Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" data-r=\"crease\" d=\"M321.85 145.85L321.85 134.56M318.15 145.85L318.15 134.56M323.47 133.75L321.85 134.56L318.15 134.56L316.53 133.75\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" data-r=\"edge\" d=\"M323.47 145.03L321.85 145.85L318.15 145.85L316.53 145.03L316.53 133.75L316.53 130.76L323.47 130.76L323.47 133.75Z\"/></g></g></svg>" + "</div>";
const stage = host.firstChild;
const ctl = TURN.mount(stage, DATA.turn, {});
const svgs = [...stage.querySelectorAll("svg")];
const live = svgs[svgs.length - 1];
const state = { yaw: -30, pitch: 18, roll: 0, apart: 0, zoom: 1, fit: true, ...FEATURE_DEFAULTS };
// Frame the whole mechanism by its drawn box so the explode never leaves the stage.
function frameView() {
  const b = live.getBBox();
  if (!b.width) return;
  const z = Math.min((640 * 0.92) / b.width, (640 * 0.92) / b.height) * state.zoom;
  const w = 640 / z;
  const h = 640 / z;
  const vb = (b.x + b.width / 2 - w / 2).toFixed(2) + " " + (b.y + b.height / 2 - h / 2).toFixed(2) + " " + w.toFixed(2) + " " + h.toFixed(2);
  for (const s of svgs) s.setAttribute("viewBox", vb);
}
const nodesOf = (prefix) => NAMES.flatMap((n, i) => (n === prefix || n.startsWith(prefix + ".") ? [...live.querySelectorAll('[data-p="' + i + '"]')] : []));
window.mech = {
  state,
  set(v) {
    Object.assign(state, v);
    ctl.set({ root: { R: orient(state.yaw, state.pitch, state.roll) }, ...featureValues(state, explodeValues(state.apart)) });
    if (state.fit !== false) frameView();
  },
  rect(module) {
    let r = null;
    for (const el of nodesOf(module)) {
      const b = el.getBoundingClientRect();
      if (!b.width) continue;
      r = r ? { left: Math.min(r.left, b.left), top: Math.min(r.top, b.top), right: Math.max(r.right, b.right), bottom: Math.max(r.bottom, b.bottom) } : { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    }
    return r;
  },
};
window.mech.set({});
window.dispatchEvent(new Event("mech:ready"));
