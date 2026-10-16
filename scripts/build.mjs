// Generates debuff's brand assets into ./assets. Everything is derived from the palette,
// the buff definition and Outfit, so the assets stay consistent with each other.
//   npm run build
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as fontkit from "fontkit";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "assets");
mkdirSync(out, { recursive: true });

export const PALETTE = {
  lime: "#a3e635",
  limeSoft: "#d9f99d",
  lime700: "#4d7c0f",
  ink: "#11140d",
  sky: "#38bdf8",
  pink: "#f472b6",
  amber: "#fbbf24",
  violet: "#a78bfa",
  red: "#f87171",
  white: "#f7fee7",
};

// ---- wordmark: "debuff" in Outfit ExtraBold, outlined -----------------------------

const fontFile = (weight) => join(root, `node_modules/@fontsource/outfit/files/outfit-latin-${weight}-normal.woff`);
const font = fontkit.create(readFileSync(fontFile(800)));

/** Outline text with kerning and tracking (em units, negative = tighter), y-down like SVG. Returns { d, box }. */
function outline(text, size, tracking = -0.02) {
  const run = font.layout(text);
  const scale = size / font.unitsPerEm;
  let x = 0;
  const parts = [];
  const box = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
  run.glyphs.forEach((glyph, i) => {
    const pos = run.positions[i];
    const gx = x + pos.xOffset * scale;
    // Font units are y-up; flip to SVG y-down and place at the pen position.
    const path = glyph.path.scale(scale, -scale).translate(gx, 0);
    parts.push(path.toSVG());
    const bb = path.bbox;
    box.x1 = Math.min(box.x1, bb.minX);
    box.y1 = Math.min(box.y1, bb.minY);
    box.x2 = Math.max(box.x2, bb.maxX);
    box.y2 = Math.max(box.y2, bb.maxY);
    x += pos.xAdvance * scale + tracking * size;
  });
  return { d: parts.join(" "), box };
}

const word = outline("debuff", 200, -0.01);
const pad = 4;
const wb = { x: word.box.x1 - pad, y: word.box.y1 - pad, w: word.box.x2 - word.box.x1 + pad * 2, h: word.box.y2 - word.box.y1 + pad * 2 };
const wordSvg = (fill) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${wb.x.toFixed(1)} ${wb.y.toFixed(1)} ${wb.w.toFixed(1)} ${wb.h.toFixed(1)}" role="img" aria-label="debuff"><path fill="${fill}" d="${word.d}"/></svg>\n`;

writeFileSync(join(out, "wordmark-lime.svg"), wordSvg(PALETTE.lime));
writeFileSync(join(out, "wordmark-ink.svg"), wordSvg(PALETTE.ink));
writeFileSync(join(out, "wordmark-white.svg"), wordSvg(PALETTE.white));

// ---- buff (vector) ------------------------------------------------------------------------------

/** buff's body in a 64×64 box, origin top-left. Proportions from the brand guide. */
function buffBody({ eyes = "open", ink = PALETTE.ink } = {}) {
  const eyeShapes = {
    open: `<rect x="16" y="22" width="9" height="13" rx="3" fill="${ink}"/><rect x="39" y="22" width="9" height="13" rx="3" fill="${ink}"/>
      <rect x="19" y="24" width="3" height="3" rx="1" fill="${PALETTE.white}"/><rect x="42" y="24" width="3" height="3" rx="1" fill="${PALETTE.white}"/>`,
    happy: `<path d="M15 31 q5.5 -8 11 0" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M38 31 q5.5 -8 11 0" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M24 42 q8 7 16 0" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    confused: `<rect x="16" y="22" width="9" height="13" rx="3" fill="${ink}"/><rect x="39" y="26" width="9" height="6" rx="3" fill="${ink}"/>
      <path d="M26 46 q6 -4 12 0" stroke="${ink}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
  };
  // The highlight band is clipped to the body so it follows the rounded corners.
  const clip = `buff-body-${eyes}`;
  return `<defs><clipPath id="${clip}"><rect width="64" height="64" rx="12"/></clipPath></defs><g clip-path="url(#${clip})"><rect width="64" height="64" fill="${PALETTE.lime}"/><rect width="64" height="11" fill="${PALETTE.limeSoft}" opacity=".7"/></g>${eyeShapes[eyes]}`;
}

const buffSvg = (eyes) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="buff">${buffBody({ eyes })}</svg>\n`;
writeFileSync(join(out, "buff.svg"), buffSvg("open"));
writeFileSync(join(out, "buff-happy.svg"), buffSvg("happy"));
writeFileSync(join(out, "buff-confused.svg"), buffSvg("confused"));

// Lockup: buff at cap height, then the wordmark.
const capH = wb.h * 0.78;
const scaleBuff = capH / 64;
const gap = capH * 0.28;
const lockupW = capH + gap + wb.w;
const lockupSvg = (wordFill) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lockupW.toFixed(1)} ${wb.h.toFixed(1)}" role="img" aria-label="debuff">
  <g transform="translate(0 ${(wb.h - capH).toFixed(1)}) scale(${scaleBuff.toFixed(4)})">${buffBody()}</g>
  <path transform="translate(${(capH + gap - wb.x).toFixed(1)} ${(-wb.y).toFixed(1)})" fill="${wordFill}" d="${word.d}"/>
</svg>\n`;
writeFileSync(join(out, "lockup-lime.svg"), lockupSvg(PALETTE.lime));
writeFileSync(join(out, "lockup-ink.svg"), lockupSvg(PALETTE.ink));

// ---- buff pixel sprite sheet ----------------------------------------------------------------------

/**
 * Frames on a 24×24 grid, buff standing on the bottom edge. Each frame: body width/height,
 * vertical lift, horizontal nudge, eyes. Rows are animations; 6 columns per row.
 */
const FRAME = 24;
const COLS = 6;
const ANIMS = {
  idle: { fps: 4, loop: true, frames: [["16x14", 0, 0, "open"], ["16x14", 0, 0, "open"], ["16x14", 0, 0, "open"], ["16x14", 0, 0, "closed"]] },
  hop: {
    fps: 12,
    loop: true,
    frames: [["18x12", 0, 0, "open"], ["14x17", 2, 0, "open"], ["15x15", 6, 0, "open"], ["16x14", 8, 0, "open"], ["15x15", 4, 0, "open"], ["18x12", 0, 0, "open"]],
  },
  happy: { fps: 6, loop: true, frames: [["16x14", 0, 0, "happy"], ["17x13", 1, 0, "happy"]] },
  oops: { fps: 2, loop: true, frames: [["16x14", 0, 0, "x"], ["16x14", 0, 0, "x2"]] },
  worried: { fps: 16, loop: true, frames: [["16x14", 0, -1, "red"], ["16x14", 0, 1, "red"]] },
  sleepy: { fps: 1.5, loop: true, frames: [["16x14", 0, 0, "sleepy"], ["17x13", 0, 0, "sleepy"]] },
};
const animNames = Object.keys(ANIMS);
const sheet = { frameWidth: FRAME, frameHeight: FRAME, columns: COLS, animations: {} };
for (const [row, name] of animNames.entries()) {
  const a = ANIMS[name];
  sheet.animations[name] = { frames: a.frames.map((_, i) => row * COLS + i), fps: a.fps, loop: a.loop };
}

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? "chrome" });
const page = await browser.newPage({ deviceScaleFactor: 1 });

const sheetDataUrl = await page.evaluate(
  ({ ANIMS, FRAME, COLS, P }) => {
    const names = Object.keys(ANIMS);
    const c = document.createElement("canvas");
    c.width = FRAME * COLS;
    c.height = FRAME * names.length;
    const g = c.getContext("2d");
    const px = (x, y, w, h, color) => {
      g.fillStyle = color;
      g.fillRect(x, y, w, h);
    };
    names.forEach((name, row) => {
      ANIMS[name].frames.forEach(([size, lift, nudge, eyes], col) => {
        const [w, h] = size.split("x").map(Number);
        const x0 = col * FRAME + Math.floor((FRAME - w) / 2) + nudge;
        const y0 = row * FRAME + FRAME - h - lift;
        px(x0, y0, w, h, P.lime);
        px(x0, y0, w, 2, P.limeSoft);
        // Rounded corners: knock out the four corner pixels.
        for (const [cx, cy] of [[x0, y0], [x0 + w - 1, y0], [x0, y0 + h - 1], [x0 + w - 1, y0 + h - 1]]) g.clearRect(cx, cy, 1, 1);
        const ex1 = x0 + Math.round(w * 0.25);
        const ex2 = x0 + w - Math.round(w * 0.25) - 2;
        const ey = y0 + Math.round(h * 0.35);
        if (eyes === "open" || eyes === "red") {
          const color = eyes === "red" ? P.red : P.ink;
          px(ex1, ey, 2, 3, color);
          px(ex2, ey, 2, 3, color);
        } else if (eyes === "closed" || eyes === "sleepy") {
          px(ex1, ey + 2, 2, 1, P.ink);
          px(ex2, ey + 2, 2, 1, P.ink);
          if (eyes === "sleepy") px(x0 + w + 1, y0 - 3, 2, 2, P.sky);
        } else if (eyes === "happy") {
          px(ex1 - 1, ey + 1, 1, 1, P.ink);
          px(ex1, ey, 2, 1, P.ink);
          px(ex1 + 2, ey + 1, 1, 1, P.ink);
          px(ex2 - 1, ey + 1, 1, 1, P.ink);
          px(ex2, ey, 2, 1, P.ink);
          px(ex2 + 2, ey + 1, 1, 1, P.ink);
          px(x0 + Math.floor(w / 2) - 2, ey + 4, 4, 1, P.ink);
        } else if (eyes === "x" || eyes === "x2") {
          const shift = eyes === "x2" ? 1 : 0;
          for (const ex of [ex1, ex2]) {
            px(ex, ey + shift, 1, 1, P.red);
            px(ex + 1, ey + 1 + shift, 1, 1, P.red);
            px(ex + 2, ey + 2 + shift, 1, 1, P.red);
            px(ex + 2, ey + shift, 1, 1, P.red);
            px(ex, ey + 2 + shift, 1, 1, P.red);
          }
        }
      });
    });
    return c.toDataURL("image/png");
  },
  { ANIMS, FRAME, COLS, P: PALETTE },
);
const sheetName = `buff@${FRAME}x${FRAME}`;
writeFileSync(join(out, `${sheetName}.png`), Buffer.from(sheetDataUrl.split(",")[1], "base64"));
writeFileSync(join(out, `${sheetName}.json`), `${JSON.stringify(sheet, null, 2)}\n`);

// ---- raster renders: social card, PNG lockups, sheet preview -------------------------------------

// Fonts are inlined as data URLs: pages created with setContent cannot load file:// resources.
const fontUrl = (family, weight) =>
  `data:font/woff2;base64,${readFileSync(join(root, `node_modules/@fontsource/${family}/files/${family}-latin-${weight}-normal.woff2`)).toString("base64")}`;
const fontFace = `
@font-face { font-family: "Outfit"; font-weight: 800; src: url(${fontUrl("outfit", 800)}) format("woff2"); }
@font-face { font-family: "Outfit"; font-weight: 600; src: url(${fontUrl("outfit", 600)}) format("woff2"); }
@font-face { font-family: "Outfit"; font-weight: 500; src: url(${fontUrl("outfit", 500)}) format("woff2"); }
@font-face { font-family: "Pixelify Sans"; font-weight: 500; src: url(${fontUrl("pixelify-sans", 500)}) format("woff2"); }`;

async function render(name, width, height, html, transparent = false) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><html><head><style>${fontFace} html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;${transparent ? "" : `background:${PALETTE.ink};`}}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(out, name), omitBackground: transparent });
}

const inline = (svg) => svg.replace("<svg ", '<svg style="display:block;width:100%;height:100%" ');

await render(
  "social-card.png",
  1200,
  630,
  `<div style="position:absolute;inset:0;background:radial-gradient(800px 500px at 78% 40%, #a3e63522, transparent 70%)"></div>
  <div style="position:absolute;left:96px;top:120px;width:700px">
    <div style="height:150px">${inline(wordSvg(PALETTE.lime))}</div>
    <div style="font:500 52px/1.15 Outfit;color:${PALETTE.white};margin-top:28px;letter-spacing:-.01em">more room for play.</div>
    <div style="font:500 24px/1.4 'Pixelify Sans';color:${PALETTE.sky};margin-top:36px;white-space:nowrap">2D web game toolkit · built for jams · ready for agents</div>
  </div>
  <div style="position:absolute;right:120px;top:150px;width:300px;height:300px;transform:rotate(-6deg)">${inline(buffSvg("happy"))}</div>
  <div style="position:absolute;right:150px;top:470px;width:240px;height:22px;border-radius:50%;background:#000;opacity:.35"></div>
  <div style="position:absolute;left:96px;bottom:64px;font:500 22px 'Pixelify Sans';color:${PALETTE.lime}">github.com/debuffjp</div>`,
);
await render("lockup-lime.png", 1200, Math.round((1200 / lockupW) * wb.h), inline(lockupSvg(PALETTE.lime)), true);
await render("buff-512.png", 512, 512, inline(buffSvg("open")), true);
await render(
  "buff-sheet-preview.png",
  FRAME * COLS * 6,
  FRAME * animNames.length * 6,
  `<img src="${sheetDataUrl}" style="width:100%;height:100%;image-rendering:pixelated">`,
);

// ---- overview sheet: every asset and font on one page --------------------------------------------

const extraFonts = `
@font-face { font-family: "Geist"; font-weight: 400; src: url(${fontUrl("geist-sans", 400)}) format("woff2"); }
@font-face { font-family: "Geist Mono"; font-weight: 400; src: url(${fontUrl("geist-mono", 400)}) format("woff2"); }`;
const label = (t) => `<div style="font:400 13px 'Geist Mono';color:#8a9479;letter-spacing:.12em;text-transform:uppercase;margin:56px 0 18px">${t}</div>`;
const tile = (bg, inner, caption, w = 360, h = 150) =>
  `<div><div style="width:${w}px;height:${h}px;background:${bg};border-radius:16px;display:grid;place-items:center;padding:24px;box-sizing:border-box;border:1px solid #ffffff14">${inner}</div><div style="font:400 13px 'Geist Mono';color:#8a9479;margin-top:8px">${caption}</div></div>`;
const swatch = (name, hex, dark) =>
  `<div style="width:170px;height:110px;border-radius:14px;background:${hex};color:${dark ? PALETTE.ink : PALETTE.white};padding:14px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-end;font:400 13px 'Geist Mono';border:1px solid #ffffff14"><b style="font:600 16px Geist">${name}</b>${hex}</div>`;
const row = (items, gap = 20) => `<div style="display:flex;flex-wrap:wrap;gap:${gap}px;align-items:flex-start">${items.join("")}</div>`;
const specimen = (meta, css, text) =>
  `<div style="display:grid;grid-template-columns:240px 1fr;gap:24px;align-items:baseline;padding:18px 0;border-bottom:1px solid #ffffff12"><div style="font:400 13px 'Geist Mono';color:#8a9479">${meta}</div><div style="${css}">${text}</div></div>`;

await page.setViewportSize({ width: 1600, height: 1000 });
await page.setContent(`<!doctype html><html><head><style>${fontFace}${extraFonts} body{margin:0;background:${PALETTE.ink};color:${PALETTE.white};font-family:Geist}</style></head><body>
<div style="padding:64px 80px 80px;width:1440px">
  <div style="display:flex;align-items:center;gap:28px"><div style="width:110px;height:110px">${inline(buffSvg("open"))}</div><div style="width:420px">${inline(wordSvg(PALETTE.lime))}</div></div>
  <div style="font:500 30px Outfit;margin-top:14px">brand assets · more room for play.</div>
  ${label("wordmark")}
  ${row([tile(PALETTE.ink, inline(wordSvg(PALETTE.lime)), "wordmark-lime.svg"), tile("#f7fee7", inline(wordSvg(PALETTE.ink)), "wordmark-ink.svg"), tile("#4d7c0f", inline(wordSvg(PALETTE.white)), "wordmark-white.svg")])}
  ${label("lockup")}
  ${row([tile(PALETTE.ink, inline(lockupSvg(PALETTE.lime)), "lockup-lime.svg", 560), tile("#f7fee7", inline(lockupSvg(PALETTE.ink)), "lockup-ink.svg", 560)])}
  ${label("buff · vector")}
  ${row([tile(PALETTE.ink, `<div style="width:110px;height:110px">${inline(buffSvg("open"))}</div>`, "buff.svg", 220, 180), tile(PALETTE.ink, `<div style="width:110px;height:110px">${inline(buffSvg("happy"))}</div>`, "buff-happy.svg", 220, 180), tile(PALETTE.ink, `<div style="width:110px;height:110px">${inline(buffSvg("confused"))}</div>`, "buff-confused.svg", 220, 180)])}
  ${label(`buff · pixel sprite sheet (${sheetName}.png, rows: ${animNames.join(", ")})`)}
  <div style="display:flex;gap:40px;align-items:flex-start"><img src="${sheetDataUrl}" style="width:${FRAME * COLS * 4}px;image-rendering:pixelated;background:#0a0c08;border-radius:12px;padding:12px">
  <div style="font:400 15px/1.9 'Geist Mono';color:#cfd6c4">${animNames.map((n) => `<div><span style="color:${PALETTE.lime}">${n}</span> · ${ANIMS[n].frames.length} frames @ ${ANIMS[n].fps} fps</div>`).join("")}<div style="margin-top:14px;color:#8a9479">drop into assets/ → id "buff", 24×24 grid</div></div></div>
  ${label("palette")}
  ${row([swatch("lime", PALETTE.lime, true), swatch("limeSoft", PALETTE.limeSoft, true), swatch("ink", PALETTE.ink, false), swatch("sky", PALETTE.sky, true), swatch("pink", PALETTE.pink, true), swatch("amber", PALETTE.amber, true), swatch("violet", PALETTE.violet, true), swatch("red", PALETTE.red, true)], 14)}
  ${label("type")}
  ${specimen("Outfit 800<br>display · wordmark", `font:800 64px/1.05 Outfit;letter-spacing:-.02em;color:${PALETTE.lime}`, "make the game you'd play")}
  ${specimen("Outfit 600<br>headings", "font:600 36px Outfit", "built for jams, ready for agents")}
  ${specimen("Geist 400<br>body", "font:400 20px/1.6 Geist;color:#cfd6c4;max-width:900px", "debuff is an open-source toolkit for small, polished 2D web games: typed params, deterministic scenarios and a WebGL2 renderer that holds ~200k sprites at 60 fps.")}
  ${specimen("Geist Mono 400<br>code · numbers", `font:400 20px 'Geist Mono';color:${PALETTE.sky}`, "draw.sprite(hero, x, y, { flash: 0.5 })")}
  ${specimen("Pixelify Sans 500<br>accent · sparingly", `font:500 30px 'Pixelify Sans';color:${PALETTE.lime}`, `buff says hi · <span style="background:${PALETTE.lime};color:${PALETTE.ink};padding:0 10px;border-radius:6px">jam #1</span>`)}
  ${label("social card")}
  <img src="data:image/png;base64,${readFileSync(join(out, "social-card.png")).toString("base64")}" style="width:900px;border-radius:14px;border:1px solid #ffffff14">
</div></body></html>`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(out, "overview.png"), fullPage: true });

await browser.close();
console.log(`Wrote brand assets to ${out}`);
