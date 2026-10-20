// Writes ../site/mechanism.js: the mechanism as a drop-in for any page with a #mechanism element.
// API: window.mech.set({ yaw, pitch, roll, apart, bundle, zoom }) and window.mech.rect(module) → DOMRect of that module's parts.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import { turnScript } from "../scripts/inline-kit.mjs";
import { scene, PAGE_HELPERS } from "./scene.mjs";
import { FILM } from "./film.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "site");
const W = 640;
const H = 640;
const S = scene({ W, H, radius: FILM.radius, pad: 4 });
const svg = k.figureSvg({ width: W, height: H, label: FILM.label, body: "" }) + S.out.layerSvg("live", { width: W, height: H });
const css = `${k.ISO_CSS}${S.out.css}
.iso-face-text[data-tone="lit"]{fill:var(--anatomy-lit)}
.iso-face-text[data-tone="mid"]{fill:var(--anatomy-mid)}`;
const film = readFileSync(join(HERE, "film.mjs"), "utf8").replace(/^export /gm, "");
const DATA = { turn: S.out.data, explode: S.obj.explode, basis: S.basis };
const names = S.out.data.parts.map((p) => p.name);

const script = `${turnScript()}
const DATA = ${JSON.stringify(DATA)};
${PAGE_HELPERS}
${film}
const NAMES = ${JSON.stringify(names)};
const host = document.getElementById("mechanism");
host.classList.add("iso");
document.head.insertAdjacentHTML("beforeend", ${JSON.stringify(`<style>${css}</style>`)});
host.innerHTML = '<div class="iso-stage iso-turn">' + ${JSON.stringify(svg)} + "</div>";
const stage = host.firstChild;
const ctl = TURN.mount(stage, DATA.turn, {});
const svgs = [...stage.querySelectorAll("svg")];
const live = svgs[svgs.length - 1];
const state = { yaw: -30, pitch: 18, roll: 0, apart: 0, zoom: 1, fit: true, ...FEATURE_DEFAULTS };
// Frame the whole mechanism by its drawn box so the explode never leaves the stage.
function frameView() {
  const b = live.getBBox();
  if (!b.width) return;
  const z = Math.min((${W} * 0.92) / b.width, (${H} * 0.92) / b.height) * state.zoom;
  const w = ${W} / z;
  const h = ${H} / z;
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
`;
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "mechanism.js"), script);
console.log(`wrote site/mechanism.js · ${(script.length / 1024).toFixed(0)} KB · ${S.out.report.parts} parts · ${S.obj.explode.length} assemblies`);
