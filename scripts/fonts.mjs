// Renders a comparison of candidate display fonts for the wordmark.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CANDIDATES = [
  ["bricolage-grotesque", "Bricolage Grotesque", "current · quirky grotesque"],
  ["fredoka", "Fredoka", "soft, rounded, friendly"],
  ["baloo-2", "Baloo 2", "chunky, bubbly, warm"],
  ["lilita-one", "Lilita One", "bold, punchy, game-y"],
  ["titan-one", "Titan One", "fat, toy-like"],
  ["dynapuff", "DynaPuff", "puffy, cartoon"],
  ["grandstander", "Grandstander", "hand-made, bouncy"],
  ["sniglet", "Sniglet", "rounded, playful"],
  ["rubik", "Rubik", "slightly rounded, clean"],
  ["nunito", "Nunito", "rounded, gentle"],
  ["outfit", "Outfit", "geometric, modern"],
  ["sora", "Sora", "geometric, techy"],
  ["space-grotesk", "Space Grotesk", "techy, quirky"],
  ["unbounded", "Unbounded", "wide, bold, futuristic"],
  ["righteous", "Righteous", "retro arcade"],
  ["bungee", "Bungee", "signage, arcade caps"],
  ["dela-gothic-one", "Dela Gothic One", "heavy, poster"],
];

/** Heaviest latin-normal woff2 a family ships, as a data URL. */
function heaviest(id) {
  const dir = join(root, `node_modules/@fontsource/${id}/files`);
  if (!existsSync(dir)) return undefined;
  const weights = readdirSync(dir)
    .map((f) => f.match(new RegExp(`^${id}-latin-(\\d+)-normal\\.woff2$`)))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => b - a);
  const w = weights.find((x) => x <= 800) ?? weights[0];
  if (!w) return undefined;
  const data = readFileSync(join(dir, `${id}-latin-${w}-normal.woff2`)).toString("base64");
  return { weight: w, url: `data:font/woff2;base64,${data}` };
}

const faces = [];
const tiles = [];
CANDIDATES.forEach(([id, family, vibe], i) => {
  const f = heaviest(id);
  if (!f) return;
  faces.push(`@font-face{font-family:"c${i}";font-weight:${f.weight};src:url(${f.url}) format("woff2")}`);
  tiles.push(`<div class="tile${i === 0 ? " current" : ""}">
    <div class="mark"><div class="deeb"><i></i><i></i></div><span style="font-family:c${i};font-weight:${f.weight}">debuff</span></div>
    <div class="tag" style="font-family:c${i};font-weight:${f.weight}">more room for play.</div>
    <div class="meta"><b>${i + 1}. ${family}</b> ${f.weight} · ${vibe}</div></div>`);
});

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
await page.setContent(`<!doctype html><html><head><style>${faces.join("")}
body{margin:0;background:#11140d;color:#f7fee7;font-family:system-ui;padding:40px}
h1{font:600 22px system-ui;margin:0 0 24px;color:#8a9479}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.tile{background:#161b10;border:1px solid #ffffff14;border-radius:16px;padding:26px 26px 18px}
.tile.current{border-color:#cffb2d66}
.mark{display:flex;align-items:center;gap:14px}
.mark span{font-size:72px;line-height:1;color:#cffb2d;letter-spacing:-.01em}
.deeb{width:52px;height:52px;border-radius:10px;background:linear-gradient(#e7fd96 0 18%,#cffb2d 18%);position:relative;flex:none}
.deeb i{position:absolute;top:18px;width:7px;height:11px;border-radius:2px;background:#11140d}.deeb i:first-child{left:13px}.deeb i+i{right:13px}
.tag{font-size:26px;margin-top:12px;color:#f7fee7}
.meta{font:13px ui-monospace,monospace;color:#8a9479;margin-top:14px}.meta b{color:#e7fd96}
</style></head><body><h1>wordmark & display font candidates (all free, open licence)</h1><div class="grid">${tiles.join("")}</div></body></html>`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(root, "assets", "font-options.png"), fullPage: true });
await browser.close();
console.log(`rendered ${tiles.length} candidates`);
