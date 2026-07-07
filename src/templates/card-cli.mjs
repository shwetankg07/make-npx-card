#!/usr/bin/env node
// Your npx card. All personal data lives in card.config.mjs — edit that,
// this file only knows how to render it.
//
// Flags: --serve [port] | --fetch | --qr [contact] | --stats | --json | --vcard
//        --open <link> | --theme <name> | --plain | --party | --matrix | --moo
//        --no-anim | --help
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import chalk from "chalk";
import boxen from "boxen";

export const CARD_TEMPLATE_VERSION = "3";

const FALLBACK_ACCENT = "#00e5ff";
const ESC = "\u001B";
const BEL = "\u0007";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Themes baked into every card so viewers can re-skin it: `--theme gruvbox` */
export const CARD_THEMES = {
  cyberpunk: ["#00f0ff", "#ff2ea6", "classic"],
  synthwave: ["#ff2ea6", "#f9c80e", "double"],
  matrix: ["#00ff5f", "#0aff9d", "classic"],
  dracula: ["#bd93f9", "#ff79c6", "classic"],
  catppuccin: ["#cba6f7", "#f5c2e7", "classic"],
  gruvbox: ["#fabd2f", "#fe8019", "classic"],
  "tokyo-night": ["#7aa2f7", "#bb9af7", "classic"],
  nord: ["#88c0d0", "#81a1c1", "minimal"],
  "rose-pine": ["#ebbcba", "#c4a7e7", "minimal"],
  "hacker-green": ["#39ff14", "#ccff00", "double"],
};

export function applyTheme(config, name) {
  const t = CARD_THEMES[name];
  if (!t) return config;
  return { ...config, theme: name, accent: t[0], accent2: t[1], style: t[2] };
}

/* ---------------------------------- color ---------------------------------- */

function lerpHex(a, b, t) {
  const pa = a.replace("#", ""), pb = b.replace("#", "");
  const ch = (i) =>
    Math.round(
      parseInt(pa.slice(i, i + 2), 16) * (1 - t) + parseInt(pb.slice(i, i + 2), 16) * t
    )
      .toString(16)
      .padStart(2, "0");
  return "#" + ch(0) + ch(2) + ch(4);
}

const lighten = (hex, amount = 0.5) => lerpHex(hex, "#ffffff", amount);

function hexToHsl(hex) {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const to = (v) => Math.round(v * 255).toString(16).padStart(2, "0");
  return "#" + to(f(h + 1 / 3)) + to(f(h)) + to(f(h - 1 / 3));
}

function hueShift(hex, deg) {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h + deg, Math.max(s, 0.4), l);
}

/* ------------------------------- terminal bits ------------------------------ */

export function supportsHyperlinks(stream = process.stdout) {
  if (!stream.isTTY) return false;
  if (process.env.FORCE_HYPERLINK === "1") return true;
  const { TERM_PROGRAM, VTE_VERSION, KONSOLE_VERSION, WT_SESSION, TERM } = process.env;
  if (WT_SESSION) return true;
  if (["iTerm.app", "WezTerm", "vscode", "ghostty", "Hyper", "Tabby"].includes(TERM_PROGRAM)) return true;
  if (KONSOLE_VERSION) return true;
  if (VTE_VERSION && Number(VTE_VERSION) >= 5000) return true;
  if (TERM === "xterm-kitty" || TERM === "xterm-ghostty") return true;
  return false;
}

function hyperlink(url, text) {
  if (!supportsHyperlinks()) return text;
  return ESC + "]8;;" + url + BEL + text + ESC + "]8;;" + BEL;
}

/** Copy text to the viewer's clipboard via OSC 52 — works even over SSH. */
function osc52Copy(text) {
  const b64 = Buffer.from(text, "utf8").toString("base64");
  process.stdout.write(ESC + "]52;c;" + b64 + BEL);
}

/* ---------------------------------- render ---------------------------------- */

function boxOptions(style, accentHex) {
  const base = {
    padding: { top: 1, bottom: 1, left: 3, right: 3 },
    margin: 1,
    borderColor: accentHex,
  };
  if (style === "double") return { ...base, borderStyle: "double" };
  if (style === "minimal") return { ...base, borderStyle: "single", dimBorder: true };
  return { ...base, borderStyle: "round" };
}

function linkRows(config) {
  const links = config.links || {};
  const rows = [];
  if (links.github) rows.push(["GitHub", "https://github.com/" + links.github]);
  if (links.twitter) rows.push(["Twitter", "https://x.com/" + links.twitter]);
  if (links.linkedin) rows.push(["LinkedIn", "https://linkedin.com/in/" + links.linkedin]);
  if (links.website) rows.push(["Web", links.website]);
  if (links.email) rows.push(["Email", "mailto:" + links.email, links.email]);
  return rows;
}

export function renderCard(config, { omitName = false } = {}) {
  const accentHex = config.accent || FALLBACK_ACCENT;
  const accent = chalk.hex(accentHex);
  const rows = linkRows(config);
  const labelWidth = Math.max(4, ...rows.map(([label]) => label.length));

  const lines = [];
  if (!omitName) lines.push(accent.bold(config.name));
  if (config.tagline) lines.push(chalk.dim(config.tagline));
  if (lines.length) lines.push("");
  for (const [label, url, display] of rows) {
    lines.push(chalk.dim(label.padEnd(labelWidth + 2)) + hyperlink(url, accent(display || url)));
  }
  if (rows.length) lines.push("");
  lines.push(chalk.dim("Card".padEnd(labelWidth + 2)) + chalk.bold("npx " + config.npmHandle));

  return boxen(lines.join("\n"), boxOptions(config.style, accentHex));
}

function gradientLines(lines, from, to) {
  const last = Math.max(1, lines.length - 1);
  return lines.map((l, i) => chalk.hex(lerpHex(from, to, i / last))(l));
}

/** Big gradient ASCII name via figlet. Returns null when it wouldn't fit. */
async function renderBigName(config) {
  try {
    const { default: figlet } = await import("figlet");
    const cols = process.stdout.columns || 80;
    for (const candidate of [config.name, config.name.split(/\s+/)[0]]) {
      // Figlet fonts are ASCII-only; non-ASCII names would render mangled AND
      // suppress the box's name line — skip the banner so the real name shows.
      if (!/^[\x20-\x7E]+$/.test(candidate)) continue;
      const attempt = figlet.textSync(candidate, { font: "ANSI Shadow" });
      const lines = attempt.split("\n").filter((l) => l.trim().length);
      if (lines.length && Math.max(...lines.map((l) => l.length)) <= cols) {
        return gradientLines(
          lines,
          config.accent || FALLBACK_ACCENT,
          config.accent2 || lighten(config.accent || FALLBACK_ACCENT)
        ).join("\n");
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function bootAnim(config) {
  const accent = chalk.hex(config.accent || FALLBACK_ACCENT);
  const line = "> initializing " + config.npmHandle + ".card ";
  process.stdout.write("  ");
  for (const ch of line) {
    process.stdout.write(chalk.dim(ch));
    await sleep(9);
  }
  await sleep(120);
  process.stdout.write(accent("✔") + "\n");
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "🦉  up late, I see";
  if (h < 12) return "☕  good morning";
  if (h < 18) return "🌤️  good afternoon";
  return "🌙  good evening";
}

/* --------------------------------- exports ---------------------------------- */

export function toJson(config) {
  const links = config.links || {};
  const out = { name: config.name, card: "npx " + config.npmHandle };
  if (config.tagline) out.tagline = config.tagline;
  out.links = {};
  if (links.github) out.links.github = "https://github.com/" + links.github;
  if (links.twitter) out.links.twitter = "https://x.com/" + links.twitter;
  if (links.linkedin) out.links.linkedin = "https://linkedin.com/in/" + links.linkedin;
  if (links.website) out.links.website = links.website;
  if (links.email) out.links.email = links.email;
  if (config.resumeUrl) out.resume = config.resumeUrl;
  return JSON.stringify(out, null, 2);
}

/** RFC 2426: text values must \-escape backslash, comma, semicolon, newline. */
function vEscape(s) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/[,;]/g, (m) => "\\" + m);
}

export function toVcard(config) {
  const l = config.links || {};
  const lines = ["BEGIN:VCARD", "VERSION:3.0", "FN:" + vEscape(config.name)];
  if (config.tagline) lines.push("TITLE:" + vEscape(config.tagline));
  if (l.email) lines.push("EMAIL;TYPE=INTERNET:" + l.email);
  if (l.website) lines.push("URL:" + l.website);
  if (l.github) lines.push("X-SOCIALPROFILE;TYPE=github:https://github.com/" + l.github);
  if (l.twitter) lines.push("X-SOCIALPROFILE;TYPE=twitter:https://x.com/" + l.twitter);
  if (l.linkedin) lines.push("X-SOCIALPROFILE;TYPE=linkedin:https://linkedin.com/in/" + l.linkedin);
  lines.push("NOTE:" + vEscape("Generated by npx " + config.npmHandle), "END:VCARD");
  return lines.join("\r\n") + "\r\n";
}

/* --------------------------------- web faces -------------------------------- */

const XML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
export function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

function webRows(config) {
  const l = config.links || {};
  const rows = [];
  if (l.github) rows.push(["github", "https://github.com/" + l.github, "github.com/" + l.github]);
  if (l.twitter) rows.push(["twitter", "https://x.com/" + l.twitter, "x.com/" + l.twitter]);
  if (l.linkedin) rows.push(["linkedin", "https://linkedin.com/in/" + l.linkedin, "linkedin.com/in/" + l.linkedin]);
  if (l.website) rows.push(["web", l.website, l.website.replace(/^https?:\/\//, "")]);
  if (l.email) rows.push(["email", "mailto:" + l.email, l.email]);
  return rows;
}

/**
 * Animated terminal-window SVG of the card: `$ npx you` types itself out,
 * a block cursor blinks, rows fade up in sequence. GitHub READMEs render
 * SVG CSS animations, so this moves right on your profile.
 */
export function svgCard(config) {
  const accent = config.accent || FALLBACK_ACCENT;
  const rows = webRows(config);
  // ~72 monospace chars fit the 760px frame; GitHub bios can be 160.
  const clip = (s, n = 72) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

  const width = 760;
  const lineH = 30;
  const bodyTop = 118;
  const height = bodyTop + (rows.length + (config.tagline ? 1 : 0)) * lineH + 96;

  const cmd = "npx " + config.npmHandle;
  const typeDelay = (i) => 300 + i * 70;
  const typed = cmd
    .split("")
    .map((c, i) => `<tspan style="animation-delay:${typeDelay(i)}ms">${escapeXml(c)}</tspan>`)
    .join("");
  const typeEnd = typeDelay(cmd.length) + 250;
  const rowDelay = (i) => typeEnd + i * 110;

  let r = 0;
  const rowText = (y, cls, body) =>
    `  <text x="56" y="${y}" class="${cls} row" style="animation-delay:${rowDelay(r++)}ms">${body}</text>`;

  const parts = [];
  parts.push(rowText(bodyTop, "name", escapeXml(config.name)));
  if (config.tagline) parts.push(rowText(bodyTop + lineH, "mono dim", escapeXml(clip(config.tagline))));
  rows.forEach(([label, , display], i) => {
    const y = bodyTop + (config.tagline ? 1 : 0) * lineH + 14 + i * lineH;
    parts.push(
      rowText(
        y,
        "mono",
        `<tspan class="dim">${escapeXml(label.padEnd(10))}</tspan><tspan class="accent" x="196">${escapeXml(display)}</tspan>`
      )
    );
  });
  parts.push(
    rowText(
      height - 40,
      "mono",
      `<tspan class="dim">run </tspan><tspan class="accent">npx ${escapeXml(config.npmHandle)}</tspan><tspan class="dim"> anywhere</tspan>`
    )
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(config.name)}'s npx card">
  <style>
    .mono { font: 16px "JetBrains Mono", "Fira Code", ui-monospace, monospace; fill: #c9d1d9; }
    .dim { fill: #8b949e; }
    .accent { fill: ${escapeXml(accent)}; }
    .name { font: 700 26px "JetBrains Mono", ui-monospace, monospace; fill: ${escapeXml(accent)}; }
    .cmd { fill: #7ee787; }
    .cmd tspan { opacity: 0; animation: appear .01s steps(1) forwards; }
    @keyframes appear { to { opacity: 1; } }
    .row { opacity: 0; animation: fadeUp .5s cubic-bezier(.2,.7,.3,1) forwards; }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }
    .cursor { fill: ${escapeXml(accent)}; animation: blink 1.1s steps(1) infinite; }
    @keyframes blink { 50% { opacity: 0; } }
  </style>
  <rect width="${width}" height="${height}" rx="14" fill="#0d1117" stroke="#30363d"/>
  <circle cx="30" cy="28" r="7" fill="#ff5f56"/>
  <circle cx="54" cy="28" r="7" fill="#ffbd2e"/>
  <circle cx="78" cy="28" r="7" fill="#27c93f"/>
  <text x="56" y="74" class="mono" xml:space="preserve"><tspan class="dim">$ </tspan><tspan class="cmd">${typed}</tspan><tspan class="cursor">▌</tspan></text>
${parts.join("\n")}
</svg>
`;
}

/** The card as a webpage — served by --serve. */
function htmlPage(config) {
  const accent = config.accent || FALLBACK_ACCENT;
  const accent2 = config.accent2 || lighten(accent);
  const e = escapeXml;
  const rows = webRows(config)
    .map(([label, href, display]) => `        <li><span>${e(label)}</span><a href="${e(href)}">${e(display)}</a></li>`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(config.name)} · npx ${e(config.npmHandle)}</title>
<meta property="og:title" content="${e(config.name)}">
<meta property="og:description" content="${e(config.tagline || "npx " + config.npmHandle)}">
<meta property="og:image" content="/card.svg">
<style>
:root{--bg:#0d1117;--panel:#161b22;--fg:#c9d1d9;--dim:#8b949e;--accent:${e(accent)};--accent2:${e(accent2)}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:16px/1.7 "JetBrains Mono",ui-monospace,monospace}
.win{width:min(720px,92vw);background:var(--panel);border:1px solid #30363d;border-radius:14px;overflow:hidden;box-shadow:0 24px 80px #000a;margin:48px 0}
.bar{display:flex;gap:8px;padding:14px 18px;border-bottom:1px solid #30363d}
.dot{width:13px;height:13px;border-radius:50%}
.body{padding:28px 34px}
.cmd{color:#7ee787}
.dim{color:var(--dim)}
h1{margin:18px 0 4px;font-size:28px;background:linear-gradient(90deg,var(--accent),var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent}
.tag{margin:0 0 22px;color:var(--dim)}
ul{list-style:none;margin:0;padding:0}
li{margin:6px 0}
li span{display:inline-block;width:6.5em;color:var(--dim)}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.btns{margin-top:26px;display:flex;gap:10px;flex-wrap:wrap}
.btns a{border:1px solid #30363d;border-radius:8px;padding:7px 14px;font-size:13px;color:var(--fg)}
.btns a:hover{border-color:var(--accent);text-decoration:none}
footer{margin-top:26px;font-size:12px;color:var(--dim)}
.cursor{animation:b 1.1s steps(1) infinite}
@keyframes b{50%{opacity:0}}
</style>
</head>
<body>
  <main class="win">
    <div class="bar"><div class="dot" style="background:#ff5f56"></div><div class="dot" style="background:#ffbd2e"></div><div class="dot" style="background:#27c93f"></div></div>
    <div class="body">
      <div><span class="dim">$ </span><span class="cmd">npx ${e(config.npmHandle)}</span><span class="cursor">▌</span></div>
      <h1>${e(config.name)}</h1>
${config.tagline ? `      <p class="tag">${e(config.tagline)}</p>\n` : ""}      <ul>
${rows}
      </ul>
      <div class="btns"><a href="/vcard">📇 vCard</a><a href="/card.svg">🖼 SVG</a><a href="/json">🤖 JSON</a><a href="/qr">📱 QR</a></div>
      <footer>run <span class="cmd">npx ${e(config.npmHandle)}</span> in a terminal for the full experience · minted with make-npx-card</footer>
    </div>
  </main>
</body>
</html>
`;
}

async function serve(config, portArg) {
  const { createServer } = await import("node:http");
  const accent = chalk.hex(config.accent || FALLBACK_ACCENT);
  const html = htmlPage(config);
  const svg = svgCard(config);
  const vcf = toVcard(config);
  const json = toJson(config);
  const qr = await qrString(qrTarget(config));

  const server = createServer((req, res) => {
    const url = (req.url || "/").split("?")[0];
    const send = (code, type, body, extra = {}) => {
      res.writeHead(code, { "content-type": type, "cache-control": "no-store", ...extra });
      res.end(body);
    };
    if (url === "/") send(200, "text/html; charset=utf-8", html);
    else if (url === "/json") send(200, "application/json; charset=utf-8", json);
    else if (url === "/vcard")
      send(200, "text/vcard; charset=utf-8", vcf, {
        "content-disposition": `attachment; filename="${config.npmHandle}.vcf"`,
      });
    else if (url === "/card.svg") send(200, "image/svg+xml; charset=utf-8", svg);
    else if (url === "/qr") send(200, "text/plain; charset=utf-8", qr + "\n" + qrTarget(config) + "\n");
    else send(404, "text/plain; charset=utf-8", "404 — try /, /json, /vcard, /card.svg, /qr\n");
  });

  const listen = (port) =>
    new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => {
        server.removeListener("error", reject);
        resolve();
      });
    });

  try {
    await listen(portArg);
  } catch (e) {
    if (e.code !== "EADDRINUSE") throw e;
    console.error(chalk.dim("  port " + portArg + " is busy — grabbing a random one"));
    await listen(0);
  }

  const url = "http://127.0.0.1:" + server.address().port;
  console.log("\n  " + accent.bold(config.name) + chalk.dim(" is live:") + "\n");
  console.log("  ▸ " + accent(url) + chalk.dim("             the card, as a webpage"));
  console.log(chalk.dim("  ▸ " + url + "/json         machine-readable"));
  console.log(chalk.dim("  ▸ " + url + "/vcard        downloadable contact"));
  console.log(chalk.dim("  ▸ " + url + "/card.svg     animated social card"));
  console.log(chalk.dim("  ▸ " + url + "/qr           ascii qr code"));
  console.log(chalk.dim("\n  localhost only · ctrl+c to stop\n"));
}

/** No colors, no box, no emoji — screen readers and shell pipelines. */
function plainCard(config) {
  const lines = [config.name];
  if (config.tagline) lines.push(config.tagline);
  lines.push("");
  for (const [label, url, display] of linkRows(config)) {
    lines.push(label.toLowerCase() + ": " + (display || url));
  }
  lines.push("card: npx " + config.npmHandle);
  return lines.join("\n");
}

function guestbookUrl(config) {
  const title = encodeURIComponent("👋 hey " + config.name.split(/\s+/)[0] + "!");
  const body = encodeURIComponent("_signed via `npx " + config.npmHandle + "`_\n\n");
  return "https://github.com/" + config.guestbook + "/issues/new?title=" + title + "&body=" + body;
}

function qrTarget(config) {
  const l = config.links || {};
  return l.website || (l.github ? "https://github.com/" + l.github : "https://www.npmjs.com/package/" + config.npmHandle);
}

async function qrString(payload) {
  const { default: qrcode } = await import("qrcode-terminal");
  return new Promise((resolve) => qrcode.generate(payload, { small: true }, resolve));
}

async function printQr(config, mode) {
  const contact = mode === "contact";
  const payload = contact ? toVcard(config) : qrTarget(config);
  console.log("\n" + (await qrString(payload)));
  console.log(
    contact
      ? chalk.dim("  scan to add ") + config.name + chalk.dim(" to your contacts\n")
      : chalk.dim("  scan me → ") + payload + "\n"
  );
}

/** Open a URL in the browser; on headless/SSH boxes print it instead of crashing. */
async function launch(url) {
  try {
    await (await import("open")).default(url);
    console.log(chalk.dim("  opened " + url));
  } catch {
    console.log(chalk.dim("  couldn't open a browser here — ") + url);
  }
}

async function doOpen(config, target) {
  const l = config.links || {};
  const map = {
    github: l.github && "https://github.com/" + l.github,
    twitter: l.twitter && "https://x.com/" + l.twitter,
    linkedin: l.linkedin && "https://linkedin.com/in/" + l.linkedin,
    web: l.website,
    resume: config.resumeUrl,
    email: l.email && "mailto:" + l.email,
    guestbook: config.guestbook && guestbookUrl(config),
  };
  const url = map[target];
  if (!url) {
    const available = Object.keys(map).filter((k) => map[k]);
    console.error(`nothing to open for "${target || ""}" — try: ` + available.join(", "));
    process.exit(1);
  }
  await launch(url);
}

function cowsay(config) {
  const msg = `${config.name} · npx ${config.npmHandle} · moo.`;
  return [
    " " + "_".repeat(msg.length + 2),
    `< ${msg} >`,
    " " + "-".repeat(msg.length + 2),
    "        \\   ^__^",
    "         \\  (oo)\\_______",
    "            (__)\\       )\\/\\",
    "                ||----w |",
    "                ||     ||",
  ].join("\n");
}

/* -------------------------------- fetch view -------------------------------- */

async function fetchView(config) {
  const accentHex = config.accent || FALLBACK_ACCENT;
  const accent2Hex = config.accent2 || lighten(accentHex);
  const accent = chalk.hex(accentHex);

  let rawLogo = ["  _ __  _ ____  __", " | '_ \\| '_ \\ \\/ /", " | | | | |_) >  < ", " |_| |_| .__/_/\\_\\", "       |_|        "];
  try {
    const { default: figlet } = await import("figlet");
    const art = figlet.textSync("npx", { font: "ANSI Shadow" }).split("\n");
    while (art.length && !art[art.length - 1].trim()) art.pop();
    if (art.length) rawLogo = art;
  } catch { /* keep fallback logo */ }
  const logoWidth = Math.max(...rawLogo.map((l) => l.length));

  const l = config.links || {};
  const host = l.github || config.npmHandle;
  const kv = (k, v) => accent.bold(k.padEnd(8)) + chalk.dim(": ") + v;
  const info = [];
  info.push(accent.bold(host) + chalk.dim("@") + accent.bold("npx-card"));
  info.push(chalk.dim("─".repeat((host + "@npx-card").length)));
  info.push(kv("Name", config.name));
  if (config.tagline) info.push(kv("Bio", config.tagline));
  if (l.github) info.push(kv("GitHub", "github.com/" + l.github));
  if (l.twitter) info.push(kv("Twitter", "x.com/" + l.twitter));
  if (l.linkedin) info.push(kv("LinkedIn", "linkedin.com/in/" + l.linkedin));
  if (l.website) info.push(kv("Web", l.website));
  if (l.email) info.push(kv("Email", l.email));
  info.push(kv("Card", "npx " + config.npmHandle));
  info.push(kv("Theme", config.theme || "custom"));
  info.push(kv("Node", process.version));
  info.push("");
  info.push(
    ["red", "yellow", "green", "cyan", "blue", "magenta", "white"]
      .map((c) => chalk["bg" + c[0].toUpperCase() + c.slice(1)]("   "))
      .join("") +
      chalk.bgHex(accentHex)("   ") +
      chalk.bgHex(accent2Hex)("   ")
  );

  const height = Math.max(rawLogo.length, info.length);
  const pad = Math.max(0, Math.floor((height - rawLogo.length) / 2));
  const out = [];
  const last = Math.max(1, rawLogo.length - 1);
  for (let i = 0; i < height; i++) {
    const li = i - pad;
    const raw = li >= 0 && li < rawLogo.length ? rawLogo[li] : "";
    const colored = chalk.hex(lerpHex(accentHex, accent2Hex, Math.min(1, Math.max(0, li / last))))(
      raw.padEnd(logoWidth + 4)
    );
    out.push("  " + colored + (info[i] || ""));
  }
  return "\n" + out.join("\n") + "\n";
}

/* -------------------------------- party mode -------------------------------- */

async function partyMode(config) {
  const out = process.stdout;
  const height = renderCard(config).split("\n").length;
  // The in-place repaint needs the whole card on screen at once.
  if (!out.isTTY || (out.rows && height + 2 > out.rows)) {
    console.log(renderCard(config));
    return;
  }
  const restore = () => out.write(ESC + "[0m" + ESC + "[?25h");
  const onSigint = () => {
    restore();
    process.exit(0);
  };
  process.once("SIGINT", onSigint);
  out.write(ESC + "[?25l");

  const FRAMES = 36;
  for (let f = 0; f <= FRAMES; f++) {
    const deg = f === FRAMES ? 0 : f * 20;
    const frame = renderCard({
      ...config,
      accent: hueShift(config.accent || FALLBACK_ACCENT, deg),
      accent2: hueShift(config.accent2 || FALLBACK_ACCENT, deg),
    });
    out.write(frame + "\n");
    if (f < FRAMES) {
      await sleep(55);
      out.write(ESC + "[" + (height + 1) + "A");
    }
  }
  process.removeListener("SIGINT", onSigint);
  restore();
}

/* ------------------------------- github stats ------------------------------- */

const LANG_COLORS = {
  JavaScript: "#f1e05a", TypeScript: "#3178c6", Python: "#3572A5", Rust: "#dea584",
  Go: "#00ADD8", Java: "#b07219", "C++": "#f34b7d", C: "#555555", "C#": "#178600",
  Shell: "#89e051", Ruby: "#701516", PHP: "#4F5D95", Swift: "#F05138", Kotlin: "#A97BFF",
  HTML: "#e34c26", CSS: "#663399", Lua: "#000080", Zig: "#ec915c", Haskell: "#5e5086",
  Elixir: "#6e4a7e", Dart: "#00B4AB", Vue: "#41b883",
};

/** Aggregate repo languages → [{ lang, share }] sorted, top N. Pure. */
export function languageStats(repos, top = 5) {
  const counts = new Map();
  for (const r of repos || []) {
    if (r && r.language) counts.set(r.language, (counts.get(r.language) || 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (!total) return [];
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([lang, n]) => ({ lang, share: n / total }));
}

function languageBar(stats, width = 24) {
  const topSum = stats.reduce((a, s) => a + s.share, 0) || 1;
  let used = 0;
  const bar = stats
    .map((s, i) => {
      let w = i === stats.length - 1
        ? Math.max(1, width - used)
        : Math.max(1, Math.round((s.share / topSum) * width));
      if (used + w > width) w = Math.max(1, width - used);
      used += w;
      return chalk.hex(LANG_COLORS[s.lang] || "#8b949e")("█".repeat(w));
    })
    .join("");
  const legend = stats
    .map((s) => {
      const pct = Math.round(s.share * 100);
      return chalk.hex(LANG_COLORS[s.lang] || "#8b949e")(s.lang) + chalk.dim(" " + (pct || "<1") + "%");
    })
    .join(chalk.dim(" · "));
  return { bar, legend };
}

const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n));

async function fetchGithubStats(user) {
  const opts = {
    headers: { accept: "application/vnd.github+json", "user-agent": "npx-card" },
    signal: AbortSignal.timeout(6000),
  };
  const grab = (url, fallback) => fetch(url, opts).then((r) => (r.ok ? r.json() : fallback)).catch(() => fallback);
  const base = "https://api.github.com/users/" + encodeURIComponent(user);
  const [profile, repos, events] = await Promise.all([
    grab(base, null),
    grab(base + "/repos?per_page=100&sort=pushed", []),
    grab(base + "/events/public?per_page=100", []),
  ]);
  if (!profile) return null;
  const stars = repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
  const days = Array(14).fill(0);
  const now = Date.now();
  for (const e of events) {
    const age = Math.floor((now - Date.parse(e.created_at)) / 86400000);
    if (age >= 0 && age < 14) days[13 - age]++;
  }
  return {
    followers: profile.followers,
    repos: profile.public_repos,
    stars,
    days,
    langs: languageStats(repos),
  };
}

/** How many times this card got npx'd last week, per the npm downloads API. */
async function fetchNpmDownloads(pkg) {
  try {
    const res = await fetch("https://api.npmjs.org/downloads/point/last-week/" + encodeURIComponent(pkg), {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return typeof j.downloads === "number" ? j.downloads : null;
  } catch {
    return null;
  }
}

/** 10-minute tmpdir cache so repeat viewers don't burn GitHub rate limits. */
async function withStatsCache(user, handle, loader) {
  const [{ tmpdir }, { readFile, writeFile }, { join }] = await Promise.all([
    import("node:os"),
    import("node:fs/promises"),
    import("node:path"),
  ]);
  const file = join(tmpdir(), `npx-card-stats-${user}-${handle}.json`);
  try {
    const cached = JSON.parse(await readFile(file, "utf8"));
    if (Date.now() - cached.t < 600000) return { ...cached.data, cached: true };
  } catch { /* cold cache */ }
  const data = await loader();
  if (data) {
    try {
      await writeFile(file, JSON.stringify({ t: Date.now(), data }));
    } catch { /* tmp not writable — fine */ }
  }
  return data;
}

function sparkline(values, accent) {
  const ticks = "▁▂▃▄▅▆▇█";
  const max = Math.max(...values, 1);
  return values
    .map((v) => (v === 0 ? chalk.dim("▁") : accent(ticks[Math.min(7, Math.round((v / max) * 7))])))
    .join("");
}

async function showStats(config) {
  const user = (config.links || {}).github;
  if (!user) {
    console.log(chalk.dim("  no GitHub username on this card\n"));
    return;
  }
  const accent = chalk.hex(config.accent || FALLBACK_ACCENT);
  const data = await withStatsCache(user, config.npmHandle, async () => {
    const [gh, npm] = await Promise.all([fetchGithubStats(user), fetchNpmDownloads(config.npmHandle)]);
    // Only cache success — a null gh would pin "couldn't reach GitHub" for 10 min.
    return gh ? { gh, npm } : null;
  });
  if (!data || !data.gh) {
    console.log(chalk.dim("  couldn't reach GitHub right now — try again later\n"));
    return;
  }
  const { gh, npm } = data;
  let head =
    "\n  " +
    accent("⭐ " + fmt(gh.stars)) + chalk.dim(" stars   ") +
    accent("📦 " + fmt(gh.repos)) + chalk.dim(" repos   ") +
    accent("👥 " + fmt(gh.followers)) + chalk.dim(" followers");
  if (typeof npm === "number") head += "   " + accent("🚀 " + fmt(npm)) + chalk.dim(" npx-runs last week");
  console.log(head);
  if (gh.langs && gh.langs.length) {
    const { bar, legend } = languageBar(gh.langs);
    console.log("  " + chalk.dim("langs".padEnd(9)) + bar + "  " + legend);
  }
  console.log(
    "  " + chalk.dim("activity ") + sparkline(gh.days, accent) +
    chalk.dim("  last 14 days" + (data.cached ? " · cached" : "")) + "\n"
  );
}

/* -------------------------------- matrix rain ------------------------------- */

async function matrixRain(ms = 3800) {
  const out = process.stdout;
  if (!out.isTTY) return;
  const cols = out.columns || 80;
  const rows = out.rows || 24;
  const glyphs = "ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ0123456789Z:・.=*+-<>¦｜";
  const g = () => glyphs[(Math.random() * glyphs.length) | 0];
  const drops = Array.from({ length: cols }, () => -((Math.random() * rows) | 0));
  const TRAIL = 9;

  const restore = () => out.write(ESC + "[0m" + ESC + "[2J" + ESC + "[?25h" + ESC + "[?1049l");
  const onSigint = () => {
    restore();
    process.exit(0);
  };
  process.once("SIGINT", onSigint);
  out.write(ESC + "[?1049h" + ESC + "[?25l" + ESC + "[2J");

  const timer = setInterval(() => {
    let buf = "";
    const at = (y, x) => ESC + "[" + y + ";" + (x + 1) + "H";
    for (let x = 0; x < cols; x++) {
      const y = drops[x];
      if (y >= 1 && y <= rows) buf += at(y, x) + ESC + "[1;97m" + g();
      if (y - 1 >= 1 && y - 1 <= rows) buf += at(y - 1, x) + ESC + "[0;38;5;46m" + g();
      if (y - 4 >= 1 && y - 4 <= rows) buf += at(y - 4, x) + ESC + "[38;5;28m" + g();
      if (y - TRAIL >= 1 && y - TRAIL <= rows) buf += at(y - TRAIL, x) + " ";
      drops[x] = y > rows + TRAIL ? -((Math.random() * 20) | 0) : y + 1;
    }
    out.write(buf);
  }, 55);

  await sleep(ms);
  clearInterval(timer);
  process.removeListener("SIGINT", onSigint);
  restore();
}

/* ----------------------------------- menu ----------------------------------- */

async function menu(config) {
  const p = await import("@clack/prompts");
  const links = config.links || {};
  const wants = config.menu || [];

  const options = [];
  if (wants.includes("email") && links.email) options.push({ value: "email", label: "📧  Send me an email" });
  if (links.email) options.push({ value: "copy", label: "📋  Copy my email", hint: "OSC 52 — works over SSH" });
  if (wants.includes("portfolio") && links.website) options.push({ value: "portfolio", label: "🌐  Open my portfolio" });
  if (wants.includes("resume") && config.resumeUrl) options.push({ value: "resume", label: "📄  Grab my resume" });
  if (links.github) options.push({ value: "stats", label: "📊  Live GitHub stats" });
  options.push({ value: "qr", label: "📱  QR code", hint: "scan from this terminal" });
  options.push({ value: "contact", label: "📇  Contact QR", hint: "scan to add me to your phone" });
  if (config.guestbook) options.push({ value: "guestbook", label: "✍️  Sign my guestbook", hint: "opens a GitHub issue" });
  options.push({ value: "party", label: "🎉  Party mode" });
  options.push({ value: "rabbit", label: "🐇  Follow the white rabbit" });
  options.push({ value: "quit", label: "👀  Just looking, thanks" });

  while (true) {
    const choice = await p.select({ message: "What next?", options });
    if (p.isCancel(choice) || choice === "quit") {
      console.log(chalk.dim("\n  See you around 👋\n"));
      return;
    }
    if (choice === "email") await launch("mailto:" + links.email);
    if (choice === "copy") {
      osc52Copy(links.email);
      console.log(chalk.dim("\n  " + links.email + " copied (if your terminal allows OSC 52)\n"));
    }
    if (choice === "portfolio") await launch(links.website);
    if (choice === "resume") await launch(config.resumeUrl);
    if (choice === "stats") await showStats(config);
    if (choice === "qr") await printQr(config);
    if (choice === "contact") await printQr(config, "contact");
    if (choice === "guestbook") await launch(guestbookUrl(config));
    if (choice === "party") await partyMode(config);
    if (choice === "rabbit") await matrixRain();
  }
}

/* ----------------------------------- main ----------------------------------- */

const HELP = (handle) => `npx ${handle} — a business card in your terminal

Flags:
  --serve [port]   serve this card as a tiny website (/, /json, /vcard, /card.svg, /qr)
  --fetch          neofetch-style profile view
  --qr             scannable QR code to my site
  --qr contact     QR that adds me straight to your phone contacts
  --stats          live GitHub stats: stars, languages, npx-runs, activity
  --open <link>    jump straight to: github, twitter, linkedin, web, resume, email, guestbook
  --theme <name>   re-skin the card: ${Object.keys(CARD_THEMES).join(", ")}
  --json           machine-readable card data
  --vcard          vCard contact file  (npx ${handle} --vcard > ${handle}.vcf)
  --plain          no colors, no box — plain text
  --party          🎉
  --matrix         🐇
  --moo            🐮
  --no-anim        skip the boot animation
`;

function parseFlags(argv) {
  const f = { switches: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--theme") f.theme = argv[++i];
    else if (a === "--open") f.open = argv[++i] ?? "";
    else if (a === "--serve") {
      f.serve = true;
      if (argv[i + 1] && /^\d+$/.test(argv[i + 1])) f.port = Number(argv[++i]);
    } else if (a === "--qr") {
      f.qr = true;
      if (argv[i + 1] && !argv[i + 1].startsWith("-")) f.qrMode = argv[++i];
    } else f.switches.add(a);
  }
  return f;
}

async function main() {
  let { default: config } = await import("./card.config.mjs");
  const flags = parseFlags(process.argv.slice(2));
  const has = (x) => flags.switches.has(x);

  if (has("--help") || has("-h")) return void console.log(HELP(config.npmHandle));

  if (flags.theme) {
    if (CARD_THEMES[flags.theme]) config = applyTheme(config, flags.theme);
    else console.error(chalk.dim(`unknown theme "${flags.theme}" — try: ` + Object.keys(CARD_THEMES).join(", ")));
  }

  if (has("--json")) return void console.log(toJson(config));
  if (has("--vcard")) return void process.stdout.write(toVcard(config));
  if (has("--plain")) return void console.log(plainCard(config));
  if (flags.serve) return serve(config, flags.port ?? 4321);
  if (flags.open !== undefined) return doOpen(config, flags.open);
  if (flags.qr) return printQr(config, flags.qrMode);
  if (has("--moo")) return void console.log(cowsay(config));
  if (has("--fetch")) return void console.log(await fetchView(config));

  const interactive = Boolean(process.stdout.isTTY && process.stdin.isTTY);

  if (has("--matrix") && interactive) await matrixRain();

  if (has("--party")) {
    await partyMode(config);
    if (has("--stats")) await showStats(config);
    if (!interactive) return;
    await menu(config);
    return;
  }

  let banner = null;
  if (interactive && config.bigName !== false) banner = await renderBigName(config);
  if (interactive && config.animate !== false && !has("--no-anim") && !process.env.CI) {
    await bootAnim(config);
  }
  if (banner) console.log("\n" + banner);
  console.log(renderCard(config, { omitName: Boolean(banner) }));

  if (has("--stats")) return showStats(config);
  if (!interactive) return;

  console.log(chalk.dim("  " + greeting()) + "\n");
  await menu(config);
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;

if (isMain) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
