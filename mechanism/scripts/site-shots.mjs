// Serves ../site, scrolls through it in headless Chrome and screenshots each stop.
// usage: node scripts/site-shots.mjs out/site [width] [height]
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./browser.mjs";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "site");
const out = process.argv[2] ?? "out/site";
const [W, H] = [+(process.argv[3] ?? 1440), +(process.argv[4] ?? 810)];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer(async (req, res) => {
  try {
    const path = join(SITE, decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/index.html"));
    const body = await readFile(path);
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const url = `http://localhost:${server.address().port}/`;
await mkdir(out, { recursive: true });
const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(url, { waitUntil: "load" });
await new Promise((r) => setTimeout(r, 800));
const sel = (s) => page.$eval(s, (e) => e.getBoundingClientRect().top + scrollY);
const tb = await sel("#toolbox");
const tbH = (await page.$eval("#toolbox", (e) => e.offsetHeight)) - H;
const bu = await sel("#bundle");
const buH = (await page.$eval("#bundle", (e) => e.offsetHeight)) - H;
const feats = await page.$$eval(".f-copy article", (els) => els.map((e) => e.getBoundingClientRect().top + scrollY));
const stops = [
  ["hero", 0],
  ...[0.02, 0.1, 0.3, 0.5, 0.8, 0.95].map((p) => [`toolbox-${p}`, tb + tbH * p]),
  ...feats.map((y, i) => [`feature-${i}`, y]),
  ...[0, 0.3, 0.6, 1].map((p) => [`bundle-${p}`, bu + buH * p]),
  ["footer", 1e6],
];
const times = [];
for (const [name, y] of stops) {
  await page.evaluate((y) => window.scrollTo(0, y), y);
  await new Promise((r) => setTimeout(r, 1300));
  const t = await page.evaluate(() => {
    const t0 = performance.now();
    window.mech.set({});
    return performance.now() - t0;
  });
  times.push(t);
  await page.screenshot({ path: `${out}/${name}.png` });
}
console.log(`set() ms: max ${Math.max(...times).toFixed(1)} · mean ${(times.reduce((a, b) => a + b) / times.length).toFixed(1)}`);
console.log(errors.length ? `errors:\n${[...new Set(errors)].join("\n")}` : "no console errors");
await browser.close();
server.close();
