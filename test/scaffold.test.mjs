import test from "node:test";
import assert from "node:assert/strict";
import { rm, readFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scaffoldCard, toConfig } from "../src/scaffold.mjs";
import { renderCard, toJson, toVcard } from "../src/templates/card-cli.mjs";
import { mapGithubUser } from "../src/github.mjs";
import { svgCard, escapeXml } from "../src/extras.mjs";
import { THEMES, lighten } from "../src/themes.mjs";

// Scaffold inside the repo so the generated card's imports (chalk, boxen, …)
// resolve against this package's node_modules without an install step.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = (suffix) => path.join(HERE, `.tmp-${process.pid}-${suffix}`);

const answers = {
  fullName: "Test User",
  tagline: "does things",
  handle: "test-user-card",
  github: "testuser",
  twitter: "",
  linkedin: "",
  website: "https://example.com",
  email: "t@example.com",
  theme: "cyberpunk",
  accentHex: THEMES.cyberpunk.accent,
  accent2Hex: THEMES.cyberpunk.accent2,
  style: "classic",
  bigName: true,
  menu: ["email", "portfolio"],
  resumeUrl: "",
  extras: ["workflow", "vhs", "svg"],
};

function runCard(dir, cardArgs = []) {
  // spawnSync pipes stdio, so the child sees a non-TTY — must not hang on a prompt.
  return spawnSync(process.execPath, ["cli.mjs", ...cardArgs], {
    cwd: dir,
    encoding: "utf8",
    timeout: 15000,
  });
}

test("scaffoldCard writes a complete publishable package + extras", async (t) => {
  const dir = tmp("full");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await scaffoldCard(answers, dir);

  for (const f of [
    "cli.mjs",
    "card.config.mjs",
    "package.json",
    "README.md",
    "LICENSE",
    ".gitignore",
    ".github/workflows/publish.yml",
    "demo.tape",
    "card.svg",
  ]) {
    await access(path.join(dir, f));
  }

  const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
  assert.equal(pkg.name, "test-user-card");
  assert.deepEqual(pkg.bin, { "test-user-card": "./cli.mjs" });
  assert.equal(pkg.type, "module");
  for (const dep of ["chalk", "boxen", "figlet", "qrcode-terminal", "open", "@clack/prompts"]) {
    assert.ok(pkg.dependencies[dep], `missing dep ${dep}`);
  }

  const cli = await readFile(path.join(dir, "cli.mjs"), "utf8");
  assert.ok(cli.startsWith("#!/usr/bin/env node"), "bin entry needs a shebang");

  const readme = await readFile(path.join(dir, "README.md"), "utf8");
  assert.match(readme, /--vcard/);
  assert.match(readme, /card\.svg/);
  assert.match(readme, /shields\.io/);

  const workflow = await readFile(path.join(dir, ".github/workflows/publish.yml"), "utf8");
  assert.match(workflow, /--provenance/);
  assert.match(workflow, /NPM_TOKEN/);
});

test("extras are skipped when not selected", async (t) => {
  const dir = tmp("noextras");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await scaffoldCard({ ...answers, extras: [] }, dir);
  await assert.rejects(access(path.join(dir, "card.svg")));
  await assert.rejects(access(path.join(dir, "demo.tape")));
  await assert.rejects(access(path.join(dir, ".github")));
});

test("generated card prints and exits 0 in non-TTY mode", async (t) => {
  const dir = tmp("run");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await scaffoldCard(answers, dir);

  const res = runCard(dir);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Test User/);
  assert.match(res.stdout, /npx test-user-card/);
});

test("card flags: --json is parseable, --vcard is valid, --matrix doesn't hang non-TTY", async (t) => {
  const dir = tmp("flags");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await scaffoldCard(answers, dir);

  const json = runCard(dir, ["--json"]);
  assert.equal(json.status, 0, json.stderr);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.name, "Test User");
  assert.equal(parsed.card, "npx test-user-card");
  assert.equal(parsed.links.github, "https://github.com/testuser");

  const vcf = runCard(dir, ["--vcard"]);
  assert.equal(vcf.status, 0, vcf.stderr);
  assert.match(vcf.stdout, /^BEGIN:VCARD/);
  assert.match(vcf.stdout, /EMAIL;TYPE=INTERNET:t@example\.com/);
  assert.match(vcf.stdout, /END:VCARD/);

  const matrix = runCard(dir, ["--matrix"]);
  assert.equal(matrix.status, 0, matrix.stderr);
  assert.match(matrix.stdout, /Test User/, "matrix in non-TTY should fall through to the card");

  const help = runCard(dir, ["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--vcard/);
});

test("card --qr prints a scannable block", async (t) => {
  const dir = tmp("qr");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await scaffoldCard(answers, dir);
  const qr = runCard(dir, ["--qr"]);
  assert.equal(qr.status, 0, qr.stderr);
  assert.match(qr.stdout, /[█▀▄]/, "expected QR block characters");
  assert.match(qr.stdout, /example\.com/);
});

test("toConfig applies theme colors and normalizes URLs", () => {
  const cfg = toConfig({ ...answers, website: "example.org" });
  assert.equal(cfg.accent, THEMES.cyberpunk.accent);
  assert.equal(cfg.accent2, THEMES.cyberpunk.accent2);
  assert.equal(cfg.links.website, "https://example.org");
  assert.ok(!("twitter" in cfg.links));
  // accent2 falls back to a lightened accent
  const noTheme = toConfig({ ...answers, accent2Hex: "" });
  assert.equal(noTheme.accent2, lighten(THEMES.cyberpunk.accent));
});

test("renderCard includes name, tagline and links", () => {
  const out = renderCard(toConfig(answers));
  assert.match(out, /Test User/);
  assert.match(out, /does things/);
  assert.match(out, /github\.com\/testuser/);
  assert.match(out, /npx test-user-card/);
});

test("toJson / toVcard direct output", () => {
  const cfg = toConfig(answers);
  const j = JSON.parse(toJson(cfg));
  assert.equal(j.tagline, "does things");
  assert.match(toVcard(cfg), /FN:Test User/);
});

test("mapGithubUser maps profile fields and sanitizes the handle", () => {
  const gh = mapGithubUser({
    login: "Some_User",
    name: "Some User",
    bio: "  builds\nthings  ",
    blog: "someuser.dev",
    twitter_username: "someuser",
    email: null,
  });
  assert.equal(gh.fullName, "Some User");
  assert.equal(gh.handle, "some_user");
  assert.equal(gh.github, "Some_User");
  assert.equal(gh.tagline, "builds things");
  assert.equal(gh.website, "someuser.dev");
  assert.ok(!("email" in gh));
  assert.deepEqual(mapGithubUser(null), {});
});

test("svgCard escapes XML and includes card content", () => {
  const cfg = toConfig({ ...answers, tagline: 'breaks <things> & "stuff"' });
  const svg = svgCard(cfg);
  assert.match(svg, /^<svg /);
  assert.match(svg, /npx test-user-card/);
  assert.ok(svg.includes("breaks &lt;things&gt; &amp; &quot;stuff&quot;"));
  assert.ok(!svg.includes("<things>"));
  assert.equal(escapeXml("a<b>&'\""), "a&lt;b&gt;&amp;&apos;&quot;");
});

test("every theme has valid hex colors and a known style", () => {
  for (const [name, t] of Object.entries(THEMES)) {
    assert.match(t.accent, /^#[0-9a-f]{6}$/i, name);
    assert.match(t.accent2, /^#[0-9a-f]{6}$/i, name);
    assert.ok(["classic", "minimal", "double"].includes(t.style), name);
    assert.ok(t.label, name);
  }
});
