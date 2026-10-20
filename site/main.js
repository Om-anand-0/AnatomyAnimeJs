import { animate, stagger, createTimeline, createDraggable, createSpring, createScope, onScroll, svg, utils } from "https://cdn.jsdelivr.net/npm/animejs@4.0.2/lib/anime.esm.min.js";

const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const clamp = (x) => Math.max(0, Math.min(1, x));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const smooth = (t) => t * t * (3 - 2 * t);
const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.append(e);
  return e;
};
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const loop = (fn) => !still && fn();

// ── The ring dial shared by hero, features and footer.
const SEGS = [[-90, -32, "--red"], [-30, 18, "--orange"], [20, 58, "--green"], [60, 108, "--teal"], [110, 148, "--blue"], [150, 198, "--lime"], [200, 228, "--yellow"], [230, 268, "--green"]];
const arc = (r, a0, a1) => {
  const p = (a) => [r * Math.cos((a * Math.PI) / 180), r * Math.sin((a * Math.PI) / 180)].map((v) => v.toFixed(2)).join(" ");
  return `M${p(a0)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p(a1)}`;
};
function dial(svgEl) {
  el("circle", { r: 184, class: "disc" }, svgEl);
  const segs = SEGS.map(([a0, a1, c]) => el("path", { d: arc(190, a0, a1), class: "seg", stroke: cssVar(c), style: `color:${cssVar(c)}` }, svgEl));
  let d = "";
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    const r0 = i % 5 ? 172 : 166;
    d += `M${(r0 * Math.cos(a)).toFixed(2)} ${(r0 * Math.sin(a)).toFixed(2)}L${(178 * Math.cos(a)).toFixed(2)} ${(178 * Math.sin(a)).toFixed(2)}`;
  }
  el("path", { d, class: "ticks" }, svgEl);
  el("circle", { r: 158, class: "faint" }, svgEl);
  el("circle", { r: 150, class: "faint" }, svgEl);
  el("path", { d: arc(140, 195, 250), class: "arc" }, svgEl);
  return { g: el("g", {}, svgEl), segs };
}
// SVG shapes animated with CSS transforms need their own box as origin.
const box = (e) => ((e.style.transformBox = "fill-box"), (e.style.transformOrigin = "center"), e);

// ── Hero: red scan lines whose outline morphs star → lens → blob, and a dotted curve that morphs with it.
{
  const { g } = dial($("#hero-dial"));
  const red = cssVar("--red");
  const ROWS = [];
  for (let y = -104; y <= 104; y += 3.2) ROWS.push(y);
  const lines = ROWS.map((y) => el("line", { y1: y, y2: y, stroke: red, "stroke-width": 1.5 }, g));
  const DOTS = 30;
  const dots = Array.from({ length: DOTS }, () => el("circle", { r: 3.2, fill: red }, g));
  // Three outlines, each the half-width at height u ∈ [-1, 1].
  const SHAPES = [
    (u, x) => 130 * Math.pow(1 - Math.abs(u), 2.2) + 4, // four-point star
    (u, x) => 128 * Math.sqrt(Math.max(0, 1 - u * u)) * (0.85 + 0.15 * Math.cos(u * 3)), // lens
    (u, x) => 120 * Math.sqrt(Math.max(0, 1 - u * u)) * (0.8 + 0.25 * Math.sin(u * 5 + x)), // blob
  ];
  const CURVES = [(s) => 70 * s * s * s - 30 * s, (s) => -60 * Math.sin(s * 3), (s) => -90 * s];
  const t = { m: 0, x: 0 };
  const lerp = (a, b, k) => a + (b - a) * k;
  const draw = () => {
    const i = Math.floor(t.m) % 3;
    const j = (i + 1) % 3;
    const k = smooth(t.m - Math.floor(t.m));
    ROWS.forEach((y, n) => {
      const u = y / 104;
      const w = lerp(SHAPES[i](u, t.x), SHAPES[j](u, t.x), k);
      const e = lines[n];
      e.setAttribute("x1", (-w).toFixed(1));
      e.setAttribute("x2", w.toFixed(1));
      e.setAttribute("opacity", (0.35 + 0.5 * (1 - Math.abs(u))).toFixed(2));
    });
    dots.forEach((e, n) => {
      const s = (n / (DOTS - 1)) * 2 - 1;
      e.setAttribute("cx", (s * 135).toFixed(1));
      e.setAttribute("cy", lerp(CURVES[i](s), CURVES[j](s), k).toFixed(1));
    });
  };
  draw();
  loop(() => {
    animate(t, { m: 3, duration: 9000, ease: "linear", loop: true, onUpdate: draw });
    animate(t, { x: Math.PI * 2, duration: 4000, ease: "linear", loop: true });
  });
  $("#copy").addEventListener("click", (e) => {
    navigator.clipboard?.writeText("npm i animejs");
    e.currentTarget.firstChild.textContent = "copied ✓ ";
  });
}

// ── Feature demos: one group each inside the shared, pinned dial.
const DEMOS = {
  api(g, c) {
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) el("circle", { cx: x * 22, cy: y * 22, r: 1.6, fill: "#3a3836" }, g);
    const dot = box(el("circle", { r: 24, fill: c }, g));
    loop(() => animate(dot, { x: [-88, 88], scale: [1, 0.5, 1], ease: "inOutExpo", duration: 1800, loop: true, alternate: true }));
  },
  transforms(g, c) {
    const big = box(el("rect", { x: -34, y: -34, width: 68, height: 68, fill: cssVar("--red") }, g));
    const shapes = Array.from({ length: 9 }, (_, i) => box(el("rect", { x: -9, y: -9, width: 18, height: 18, fill: i % 3 ? c : "none", stroke: c, "stroke-width": 2, opacity: 0 }, g)));
    const scatter = () => animate(shapes, { opacity: 1, x: () => utils.random(-90, 90), y: () => utils.random(-90, 90), rotate: () => utils.random(-180, 180), duration: () => utils.random(500, 1000), composition: "blend", ease: "outQuad", onComplete: scatter });
    loop(() =>
      createTimeline()
        .add(big, { rotate: 90, duration: 900, ease: "inOutExpo" })
        .add(big, { scale: 0, duration: 400, ease: "inBack" })
        .call(scatter),
    );
  },
  scroll(g, c) {
    // A wire spiral: tilted ellipses whose rotation is staggered.
    const rings = Array.from({ length: 16 }, (_, i) => box(el("ellipse", { rx: 92, ry: 34, fill: "none", stroke: c, "stroke-width": 1.4, opacity: 0.25 + (i / 16) * 0.75, transform: `translate(${-30 + i * 4} ${-30 + i * 4})` }, el("g", { transform: `rotate(${-40 + i * 3})` }, g))));
    loop(() => animate(rings, { rotate: 360, duration: 6000, delay: stagger(90), ease: "linear", loop: true }));
  },
  stagger(g, c) {
    const dots = [];
    for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) if (x * x + y * y <= 40) dots.push(box(el("circle", { cx: x * 16, cy: y * 16, r: 3.4, fill: c }, g)));
    loop(() => animate(dots, { scale: [0.4, 1.9, 0.4], opacity: [0.25, 1, 0.25], delay: stagger(70, { grid: [13, 13], from: "center" }), duration: 1600, loop: true }));
  },
  svg(g, c) {
    const path = el("path", { d: "M-130 30H-70L-40 0H20L50 -40H110V10H60L30 50H-40L-70 80", fill: "none", stroke: c, "stroke-width": 3, "stroke-linecap": "round" }, g);
    const runner = el("circle", { r: 6, fill: c }, g);
    loop(() => {
      animate(svg.createDrawable(path), { draw: ["0 0", "0 1", "1 1"], ease: "inOutQuad", duration: 3000, loop: true });
      animate(runner, { ...svg.createMotionPath(path), ease: "inOutQuad", duration: 3000, loop: true });
    });
  },
  drag(g, c, svgEl) {
    // A big disc over the dial, thrown back to the centre by a spring.
    const wrap = svgEl.parentElement;
    const knob = document.createElement("div");
    knob.className = "demo";
    knob.dataset.for = "drag";
    knob.style.cssText = `position:absolute;left:50%;top:50%;width:34%;aspect-ratio:1;translate:-50% -50%;border-radius:50%;background:${c} radial-gradient(#0003 1.5px,transparent 2px) center/9px 9px;background-blend-mode:normal;box-shadow:0 0 40px ${c}55;cursor:grab;touch-action:none`;
    knob.title = "Drag me";
    wrap.append(knob);
    const spring = createSpring({ stiffness: 120, damping: 6 });
    createDraggable(knob, {
      container: wrap,
      onRelease(self) {
        self.stop();
        const p = { x: self.x, y: self.y };
        animate(p, { x: 0, y: 0, ease: spring, onUpdate: () => (self.setX(p.x), self.setY(p.y)) });
      },
    });
  },
  clock(g, c) {
    const ticks = [];
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2 - Math.PI / 2;
      ticks.push(el("line", { x1: 118 * Math.cos(a), y1: 118 * Math.sin(a), x2: 134 * Math.cos(a), y2: 134 * Math.sin(a), stroke: c, "stroke-width": 2, opacity: 0.12 }, g));
    }
    const hand = el("line", { x1: 0, y1: 0, x2: 0, y2: -132, stroke: c, "stroke-width": 2.2 }, g);
    el("circle", { r: 4, fill: c }, g);
    const t = { a: 0 };
    loop(() =>
      createTimeline({ loop: true })
        .add(t, { a: 360, duration: 6000, ease: "linear", onUpdate: () => hand.setAttribute("transform", `rotate(${t.a})`) }, 0)
        .add(ticks, { opacity: [1, 0.12], duration: 700, ease: "outQuad" }, stagger(6000 / 90)),
    );
  },
  scope(g, c) {
    el("rect", { x: -90, y: -90, width: 180, height: 180, fill: "none", stroke: c, "stroke-dasharray": "2 4", opacity: 0.5 }, g);
    const pill = el("g", {}, g);
    for (let i = -2; i <= 2; i++) el("circle", { cx: i * 14, cy: i * 14, r: 15 - Math.abs(i) * 1.5, fill: c }, pill);
    const t = { r: 0 };
    createScope({ mediaQueries: { portrait: "(orientation: portrait)" } }).add((self) => {
      animate(t, { r: self.matches.portrait ? 90 : 0, duration: still ? 0 : 900, ease: "outBack", onUpdate: () => pill.setAttribute("transform", `rotate(${t.r})`) });
    });
  },
};

// The pinned feature dial: every demo lives in it, only the active one shows, and only its ring segment glows.
const fDial = $("#f-dial");

const F = dial(fDial);
const ARTICLES = $$(".f-copy article");
const groups = ARTICLES.map((a) => {
  const c = cssVar(SEGS[+a.dataset.seg][2]);
  a.style.setProperty("--c", c);
  const g = el("g", { class: "demo" }, F.g);
  DEMOS[a.dataset.demo](g, c, fDial);
  return g;
});
$$(".f-code .code").forEach((code, i) => code.style.setProperty("--c", cssVar(SEGS[+ARTICLES[i].dataset.seg][2])));
const dragKnob = $('.f-stage [data-for="drag"]');
let activeFeature = -1;
function setFeature(i) {
  if (i === activeFeature) return;
  activeFeature = i;
  groups.forEach((g, n) => (g.style.opacity = n === i ? 1 : 0));
  dragKnob.style.opacity = ARTICLES[i].dataset.demo === "drag" ? 1 : 0;
  dragKnob.style.pointerEvents = ARTICLES[i].dataset.demo === "drag" ? "auto" : "none";
  F.segs.forEach((s, n) => s.classList.toggle("dim", n !== +ARTICLES[i].dataset.seg));
}
setFeature(0);

// Footer dial: a dot field.
{
  const { g } = dial($('footer svg[data-demo="dots"]'));
  const dots = [];
  const red = cssVar("--red");
  for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) if (x * x + y * y <= 81) dots.push(el("circle", { cx: x * 14, cy: y * 14, r: 3, fill: red, opacity: 0.2 }, g));
  loop(() => animate(dots, { opacity: [0.15, 0.9, 0.15], delay: stagger(40, { grid: [19, 19], from: "center" }), duration: 2000, loop: true }));
}

// Copy blocks rise in as they scroll into view.
for (const copy of $$(".f-copy article > *, .f-code .code, footer .grid")) {
  animate(copy, { opacity: [0, 1], y: [30, 0], duration: still ? 0 : 900, ease: "outExpo", autoplay: onScroll({ target: copy, enter: "bottom top" }) });
}

// ── Scrubber: page progress.
const scrub = $("#scrub");
for (let i = 0; i < 40; i++) scrub.append(document.createElement("i"));

// ── The mechanism: hero tumble, toolbox explode with leader lines, bundle pops.
const host = $("#mechanism");
const mech = window.mech;
const toolbox = $("#toolbox");
const bundle = $("#bundle");
const leaders = $("#toolbox svg.leaders");
const LABELS = $$("#toolbox .labels span").map((span) => ({ span, module: span.textContent, side: span.parentElement.classList.contains("tr") ? 1 : -1, path: el("path", { pathLength: 1, "stroke-dasharray": 1 }, leaders) }));
const KB = { scope: 0.18, scroll: 0.12, draggable: 3.89, easings: 2.25, timer: 0.44, animation: 5.64, spring: 1.06, svg: 2.73, stagger: 1.84, timeline: 2.58, waapi: 0.29, core: 6.11 };
const COLORS = { timer: "--orange", animatable: "--yellow", scope: "--teal", spring: "--blue", animation: "--yellow", draggable: "--lime", svg: "--teal", waapi: "--violet", timeline: "--yellow", scroll: "--teal", stagger: "--blue", easings: "--red", draggable2: "--green", core: "--ink-3" };
const POP_ORDER = ["timeline", "stagger", "svg", "spring", "timer", "easings"];
const TOTAL = Object.values(KB).reduce((a, b) => a + b, 0);
const bar = $("#kb-bar");
const barSegs = Object.keys(KB).map((m) => {
  const i = document.createElement("i");
  i.style.background = cssVar(COLORS[m] ?? "--ink-3");
  bar.append(i);
  return [m, i];
});
$("#kb-legend").innerHTML = ["Timer", "Animatable", "Scope", "Spring", "Animation", "Draggable", "SVG", "WAAPI", "Timeline", "Scroll", "Stagger", "Easings"].map((n) => `<span style="--c:var(${COLORS[n.toLowerCase()] ?? "--ink-3"})">${n}</span>`).join("");
const tags = POP_ORDER.map((m) => {
  const t = document.createElement("div");
  t.className = "kb";
  t.style.setProperty("--c", cssVar(COLORS[m]));
  t.innerHTML = `<i></i>${KB[m].toFixed(2)} KB`;
  $("#kbs").append(t);
  return { m, t };
});

const progress = (sec) => {
  const r = sec.getBoundingClientRect();
  return { p: clamp(-r.top / (r.height - innerHeight)), on: r.top < innerHeight * 0.6 && r.bottom > innerHeight * 0.4 };
};
const place = (slot, theme) => {
  if (host.parentElement !== slot) slot.append(host);
  host.dataset.theme = theme;
};
let bundleFramed = false;

function frame(now) {
  const docP = scrollY / (document.documentElement.scrollHeight - innerHeight);
  $("b", scrub).style.left = `${8 + docP * 192}px`;
  const under = (sec) => ((r) => r.top <= 30 && r.bottom > 30)(sec.getBoundingClientRect());
  $("nav").dataset.on = under(bundle) || (under(toolbox) && +$("#toolbox .bg").style.opacity > 0.5) ? "light" : "dark";

  let best = 0;
  ARTICLES.forEach((a, i) => {
    const r = a.getBoundingClientRect();
    if (Math.abs(r.top + r.height / 2 - innerHeight / 2) < Math.abs(ARTICLES[best].getBoundingClientRect().top + r.height / 2 - innerHeight / 2)) best = i;
  });
  setFeature(best);
  const T = progress(toolbox);
  const B = progress(bundle);
  if (B.on) {
    const p = B.p;
    place($("#slot-bundle"), "light");
    const b = seg(p, 0.08, 0.75);
    if (!bundleFramed) {
      // Frame once with every module out, then hold that frame so the body doesn't shrink as modules leave.
      mech.set({ fit: true, bundle: 1, apart: 0, roll: 0, pitch: 16, yaw: -30 });
      bundleFramed = true;
    }
    mech.set({ fit: false, yaw: -30 + 80 * p, pitch: 16, roll: 0, apart: 0, bundle: b });
    let total = TOTAL;
    const stage = $("#bundle .sticky").getBoundingClientRect();
    POP_ORDER.forEach((m, i) => {
      const k = smooth(clamp(b * 2.2 - i * 0.24));
      total -= KB[m] * k;
      const r = mech.rect(m);
      const tag = tags[i].t;
      tag.style.opacity = r ? seg(k, 0.6, 1) : 0;
      if (r) tag.style.transform = `translate(${((r.left + r.right) / 2 - stage.left).toFixed(1)}px,${(r.top - stage.top - 22).toFixed(1)}px) translateX(-50%)`;
      barSegs.find(([n]) => n === m)[1].dataset.k = k;
    });
    for (const [m, i] of barSegs) i.style.width = `${((KB[m] * (1 - (+i.dataset.k || 0))) / TOTAL) * 100}%`;
    $("#kb-total").textContent = `${total.toFixed(2)} KB`;
  } else {
    bundleFramed = false;
    if (T.on || T.p > 0) {
      const p = T.p;
      const light = seg(p, 0, 0.08);
      $("#toolbox .bg").style.opacity = light;
      for (const n of $$("#toolbox .sec-copy, #toolbox .labels")) n.style.opacity = seg(p, 0.04, 0.12) * (1 - seg(p, 0.92, 1));
      place($("#slot-toolbox"), light > 0.5 ? "light" : "dark");
      const apart = smooth(seg(p, 0.16, 0.5)) * (1 - smooth(seg(p, 0.72, 0.9)));
      const roll = p < 0.7 ? 75 - 45 * smooth(seg(p, 0, 0.16)) : 30 + 60 * smooth(seg(p, 0.7, 0.9));
      mech.set({ fit: true, zoom: 1, yaw: -30 + 220 * p, pitch: 14, roll, apart, bundle: 0 });
      const stage = $("#toolbox .sticky").getBoundingClientRect();
      for (const L of LABELS) {
        const r = mech.rect(L.module);
        const s = L.span.getBoundingClientRect();
        if (!r) continue;
        const sx = (L.side > 0 ? s.left - 8 : s.right + 8) - stage.left;
        const sy = s.top + s.height / 2 - stage.top;
        const tx = (L.side > 0 ? r.right + 4 : r.left - 4) - stage.left;
        const ty = (r.top + r.bottom) / 2 - stage.top;
        const ex = L.side > 0 ? Math.min(sx, tx + Math.abs(ty - sy)) : Math.max(sx, tx - Math.abs(ty - sy));
        L.path.setAttribute("d", `M${sx.toFixed(1)} ${sy.toFixed(1)}H${ex.toFixed(1)}L${tx.toFixed(1)} ${ty.toFixed(1)}`);
        L.path.style.strokeDashoffset = 1 - apart;
      }
    } else {
      place($("#slot-hero"), "dark");
      if (scrollY < innerHeight) mech.set({ fit: true, zoom: 1, yaw: still ? -30 : -30 + now * 0.012, pitch: 12, roll: 75, apart: 0, bundle: 0 });
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
