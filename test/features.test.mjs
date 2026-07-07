import test from "node:test";
import assert from "node:assert/strict";
import { rm, readFile, writeFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scaffoldCard, planCard, CARD_DEPS } from "../src/scaffold.mjs";
import { CARD_THEMES, CARD_TEMPLATE_VERSION, applyTheme } from "../src/templates/card-cli.mjs";
import { runDoctor, templateVersionOf } from "../src/doctor.mjs";
import { runUpdate } from "../src/update.mjs";
import { profileSnippet } from "../src/extras.mjs";
import { THEMES } from "../src/themes.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, "..");
const tmp = (suffix) => path.join(HERE, `.tmp-r2-${process.pid}-${suffix}`);

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
  extras: ["workflow", "vhs", "svg", "profile"],
};

function runCard(dir, cardArgs = [], env = {}) {
  return spawnSync(process.execPath, ["cli.mjs", ...cardArgs], {
    cwd: dir,
    encoding: "utf8",
    timeout: 20000,
    env: { ...process.env, ...env },
  });
}

function runGenerator(genArgs, cwd = REPO) {
  return spawnSync(process.execPath, [path.join(REPO, "cli.mjs"), ...genArgs], {
    cwd,
    encoding: "utf8",
    timeout: 20000,
  });
}

test("card --fetch renders the neofetch view in non-TTY", async (t) => {
  const dir = tmp("fetch");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await scaffoldCard(answers, dir);
  const res = runCard(dir, ["--fetch"]);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /testuser@npx-card/);
  assert.match(res.stdout, /Name\s*: Test User/);
  assert.match(res.stdout, /Node\s*: v/);
  assert.match(res.stdout, /Theme\s*: cyberpunk/);
});

test("card --theme override re-skins the card for the viewer", async (t) => {
  const dir = tmp("theme");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await scaffoldCard(answers, dir);

  // gruvbox accent #fabd2f → truecolor sequence 250;189;47
  const res = runCard(dir, ["--theme", "gruvbox"], { FORCE_COLOR: "3" });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /250;189;47/);

  const unknown = runCard(dir, ["--theme", "nope"]);
  assert.equal(unknown.status, 0, "unknown theme still renders the card");
  assert.match(unknown.stdout, /Test User/);
  assert.match(unknown.stderr, /unknown theme/);
});

test("card --qr contact encodes a scannable vCard", async (t) => {
  const dir = tmp("qrc");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await scaffoldCard(answers, dir);
  const res = runCard(dir, ["--qr", "contact"]);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /[█▀▄]/);
  assert.match(res.stdout, /scan to add Test User/);
});

test("card --open fails helpfully for missing targets", async (t) => {
  const dir = tmp("open");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await scaffoldCard(answers, dir);
  const res = runCard(dir, ["--open", "resume"]); // no resume configured
  assert.equal(res.status, 1);
  assert.match(res.stderr, /nothing to open/);
  assert.match(res.stderr, /github/, "should list what IS available");
});

test("card --moo and --party behave in non-TTY", async (t) => {
  const dir = tmp("fun");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await scaffoldCard(answers, dir);

  const moo = runCard(dir, ["--moo"]);
  assert.equal(moo.status, 0, moo.stderr);
  assert.match(moo.stdout, /\(oo\)/);
  assert.match(moo.stdout, /npx test-user-card/);

  const party = runCard(dir, ["--party"]);
  assert.equal(party.status, 0, party.stderr);
  assert.match(party.stdout, /Test User/, "party in non-TTY should fall back to a plain card");
});

test("applyTheme maps names onto config and every card theme mirrors THEMES", () => {
  const cfg = applyTheme({ name: "x", npmHandle: "x", accent: "#000000" }, "nord");
  assert.equal(cfg.accent, THEMES.nord.accent);
  assert.equal(cfg.style, THEMES.nord.style);
  assert.deepEqual(Object.keys(CARD_THEMES).sort(), Object.keys(THEMES).sort());
  for (const [name, [a, a2, style]] of Object.entries(CARD_THEMES)) {
    assert.equal(a, THEMES[name].accent, name);
    assert.equal(a2, THEMES[name].accent2, name);
    assert.equal(style, THEMES[name].style, name);
  }
});

test("generator `themes` gallery lists every theme", () => {
  const res = runGenerator(["themes"]);
  assert.equal(res.status, 0, res.stderr);
  for (const t of Object.values(THEMES)) assert.ok(res.stdout.includes(t.label), t.label);
});

test("doctor passes on a fresh scaffold", async (t) => {
  const dir = tmp("doctor");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await scaffoldCard(answers, dir);
  const results = await runDoctor(dir);
  const fails = results.filter((r) => !r.ok && r.level === "fail");
  assert.deepEqual(fails, []);
  const versionCheck = results.find((r) => r.label.includes("template is current"));
  assert.ok(versionCheck?.ok, "fresh scaffold should have the current template");
});

test("doctor flags a broken card", async (t) => {
  const dir = tmp("doctor-bad");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await scaffoldCard(answers, dir);
  const pkgPath = path.join(dir, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  pkg.name = "totally-different-name";
  await writeFile(pkgPath, JSON.stringify(pkg));
  const results = await runDoctor(dir);
  const nameCheck = results.find((r) => r.label.includes("matches the card handle"));
  assert.equal(nameCheck.ok, false);
});

test("update refreshes an outdated template and merges missing deps", async (t) => {
  const dir = tmp("update");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await scaffoldCard(answers, dir);

  // Simulate a round-1 card: old version stamp + missing deps.
  const cliPath = path.join(dir, "cli.mjs");
  const old = (await readFile(cliPath, "utf8")).replace(
    /CARD_TEMPLATE_VERSION = "\d+"/,
    'CARD_TEMPLATE_VERSION = "1"'
  );
  await writeFile(cliPath, old);
  const pkgPath = path.join(dir, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  delete pkg.dependencies.figlet;
  delete pkg.dependencies["qrcode-terminal"];
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2));

  const { from, to, addedDeps } = await runUpdate(dir);
  assert.equal(from, "1");
  assert.equal(to, CARD_TEMPLATE_VERSION);
  assert.deepEqual(addedDeps.sort(), ["figlet", "qrcode-terminal"]);

  assert.equal(templateVersionOf(await readFile(cliPath, "utf8")), CARD_TEMPLATE_VERSION);
  const merged = JSON.parse(await readFile(pkgPath, "utf8"));
  for (const dep of Object.keys(CARD_DEPS)) assert.ok(merged.dependencies[dep], dep);
});

test("update refuses a non-card directory", async () => {
  await assert.rejects(runUpdate(HERE));
});

test("planCard returns the full file map without writing anything", async () => {
  const { files } = await planCard(answers);
  const names = [...files.keys()];
  assert.ok(names.includes("cli.mjs"));
  assert.ok(names.includes("profile-snippet.md"));
  assert.ok(names.includes(".github/workflows/publish.yml"));
  await assert.rejects(access(path.resolve(answers.handle)), "planCard must not write");
});

test("generator --dry-run prints the plan and writes nothing", async (t) => {
  const dir = tmp("dry");
  t.after(() => rm(dir, { recursive: true, force: true }));
  // quick mode hits the real GitHub API; skip cleanly when offline
  const res = runGenerator(["--from-github", "octocat", "--yes", "--dry-run"], HERE);
  if (res.status !== 0 && /Couldn't fetch/.test(res.stderr)) {
    t.skip("GitHub unreachable");
    return;
  }
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /dry run/);
  assert.match(res.stdout, /card\.config\.mjs/);
  await assert.rejects(access(path.join(HERE, "octocat")), "dry run must not scaffold");
});

test("profile snippet points at raw.githubusercontent with the user's handle", () => {
  const snippet = profileSnippet(answers);
  assert.match(snippet, /raw\.githubusercontent\.com\/testuser\/test-user-card\/main\/card\.svg/);
  assert.match(snippet, /npmjs\.com\/package\/test-user-card/);
});
