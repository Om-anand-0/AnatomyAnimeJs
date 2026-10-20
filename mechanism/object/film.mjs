export const FILM = {
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

export const FIGURE = {
  title: "Animation engine · anatomy",
  start: { yaw: -30, pitch: 18 },
  label: "A turned mechanism built from {parts} solid parts in {modules} modules: flange, knurled rings, a lobed cage, cam bands, a dot ring, the main drum, a coil, a clip band, a gear, a collar and a glass element.",
  keys: [
    { mark: "raised", label: "Core: animation drum" },
    { mark: "lit", label: "Modules: timer, easings, draggable, scroll, scope, spring, svg, stagger, timeline, waapi" },
  ],
  caption: "{parts} convex parts in {assemblies} assemblies. B pops six modules out sideways.",
};

export const FEATURE_DEFAULTS = { bundle: 0 };

export const FEATURE_KEYS = [{ key: "b", channel: "bundle", name: "bundle", unit: "", values: [0, 1], ease: 0.3, verb: "pops modules out", tour: [0.75, 0.9] }];

const POP_ORDER = ["timeline", "stagger", "svg", "spring", "timer", "easings"];
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (t) => t * t * (3 - 2 * t);

// bundle 0…1 pops the six modules one after another, overlapping.
export function featureValues(s, values) {
  const out = { ...values };
  POP_ORDER.forEach((n, i) => (out[`pop.${n}`] = 150 * smooth(clamp01(s.bundle * 2.2 - i * 0.24))));
  return out;
}

export function featureTravel(a, b) {
  return Math.abs(b.bundle - a.bundle) * 150;
}
