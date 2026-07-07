import test from "node:test";
import assert from "node:assert/strict";
import { rm, access } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scaffoldCard, toConfig } from "../src/scaffold.mjs";
import {
  CARD_TEMPLATE_VERSION,
  languageStats,
  svgCard,
  toVcard,
} from "../src/templates/card-cli.mjs";
import { mapGithubUser } from "../src/github.mjs";
import { runDoctor } from "../src/doctor.mjs";
import { TEMPLATE_CHANGES } from "../src/update.mjs";
import { compareVersions } from "../src/doctor.mjs";
import { publishedVersion } from "../src/registry.mjs";
import { hasGit, gitInit } from "../src/git.mjs";
import { THEMES } from "../src/themes.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, "..");
const tmp = (suffix) => path.join(HERE, `.tmp-r3-${process.pid}-${suffix}`);

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

test("--serve: the card serves all five routes over real HTTP", async (t) => {
  const dir = tmp("serve");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await scaffoldCard(answers, dir);

  const child = spawn(process.execPath, ["cli.mjs", "--serve", "0"], {
    cwd: dir,
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGKILL"));

  const base = await new Promise((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error("server never printed its URL:\n" + out)), 10000);
    child.stdout.on("data", (chunk) => {
      out += chunk;
      const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve("http://127.0.0.1:" + m[1]);
      }
    });
    child.on("exit", (code) => reject(new Error("server exited early with " + code)));
  });

  const home = await fetch(base + "/");
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type"), /text\/html/);
  const html = await home.text();
  assert.match(html, /Test User/);
  assert.match(html, /npx test-user-card/);
  assert.match(html, /github\.com\/testuser/);

  const json = await fetch(base + "/json");
  assert.equal((await json.json()).name, "Test User");

  const vcf = await fetch(base + "/vcard");
  assert.match(vcf.headers.get("content-type"), /text\/vcard/);
  assert.match(vcf.headers.get("content-disposition"), /test-user-card\.vcf/);
  assert.match(await vcf.text(), /BEGIN:VCARD/);

  const svg = await fetch(base + "/card.svg");
  assert.match(svg.headers.get("content-type"), /image\/svg\+xml/);
  assert.match(await svg.text(), /^<svg /);

  const qr = await fetch(base + "/qr");
  assert.match(await qr.text(), /[█▀▄]/);

  const missing = await fetch(base + "/nope");
  assert.equal(missing.status, 404);
});

test("--plain output has zero ANSI and all the facts", async (t) => {
  const dir = tmp("plain");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await scaffoldCard(answers, dir);
  const res = runCard(dir, ["--plain"], { FORCE_COLOR: "3" });
  assert.equal(res.status, 0, res.stderr);
  assert.ok(!/\[/.test(res.stdout), "plain mode must not emit ANSI even when colors are forced");
  assert.match(res.stdout, /^Test User/);
  assert.match(res.stdout, /github: https:\/\/github\.com\/testuser/);
  assert.match(res.stdout, /card: npx test-user-card/);
});

test("languageStats aggregates, sorts, and skips null languages", () => {
  const repos = [
    { language: "JavaScript" },
    { language: "JavaScript" },
    { language: "Rust" },
    { language: null },
    {},
  ];
  const stats = languageStats(repos);
  assert.equal(stats.length, 2);
  assert.equal(stats[0].lang, "JavaScript");
  assert.ok(Math.abs(stats[0].share - 2 / 3) < 1e-9);
  assert.equal(stats[1].lang, "Rust");
  assert.deepEqual(languageStats([]), []);
  assert.deepEqual(languageStats(null), []);
});

test("svgCard is animated: typing, cursor, staggered rows, still escaped", () => {
  const cfg = toConfig({ ...answers, tagline: 'breaks <things> & "stuff"' });
  const svg = svgCard(cfg);
  assert.match(svg, /^<svg /);
  assert.match(svg, /@keyframes appear/);
  assert.match(svg, /@keyframes fadeUp/);
  assert.match(svg, /@keyframes blink/);
  assert.match(svg, /class="cursor">▌<\/tspan>/);
  const typedChars = (svg.match(/animation-delay:\d+ms"/g) || []).length;
  assert.ok(typedChars >= "npx test-user-card".length, "one delayed tspan per typed character + rows");
  assert.ok(svg.includes("breaks &lt;things&gt; &amp; &quot;stuff&quot;"));
  assert.ok(!svg.includes("<things>"));
  assert.match(svg, /npx test-user-card<\/tspan><tspan class="dim"> anywhere/);
});

test("guestbook is derived from github + handle and is removable", () => {
  assert.equal(toConfig(answers).guestbook, "testuser/test-user-card");
  assert.equal(toConfig({ ...answers, github: "" }).guestbook, "");
});

test("--open with no target lists what's available instead of rendering", async (t) => {
  const dir = tmp("open-bare");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await scaffoldCard(answers, dir);
  const res = runCard(dir, ["--open"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /nothing to open/);
  assert.match(res.stderr, /github/);
  assert.ok(!/Test User/.test(res.stdout), "must not fall through to the card");
});

test("generated package.json carries repository metadata for provenance", async (t) => {
  const dir = tmp("repo-meta");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await scaffoldCard(answers, dir);
  const pkg = JSON.parse(await (await import("node:fs/promises")).readFile(path.join(dir, "package.json"), "utf8"));
  assert.equal(pkg.repository.url, "git+https://github.com/testuser/test-user-card.git");
  assert.equal(pkg.homepage, "https://github.com/testuser/test-user-card#readme");
  assert.equal(pkg.bugs, "https://github.com/testuser/test-user-card/issues");

  const noGh = tmp("repo-meta-none");
  t.after(() => rm(noGh, { recursive: true, force: true }));
  await scaffoldCard({ ...answers, github: "" }, noGh);
  const pkg2 = JSON.parse(await (await import("node:fs/promises")).readFile(path.join(noGh, "package.json"), "utf8"));
  assert.ok(!("repository" in pkg2), "no fabricated repository when github is unknown");
});

test("--open guestbook is wired into the card", async (t) => {
  const dir = tmp("guest");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await scaffoldCard({ ...answers, github: "" }, dir);
  // no github → no guestbook → --open guestbook must fail and not list it
  const res = runCard(dir, ["--open", "guestbook"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /nothing to open/);
});

test("toVcard escapes commas, semicolons, and newlines per RFC 2426", () => {
  const cfg = toConfig({ ...answers, tagline: "dev; breaks things, then\nfixes them" });
  const vcf = toVcard(cfg);
  assert.match(vcf, /TITLE:dev\\; breaks things\\, then\\nfixes them/);
  assert.ok(!/TITLE:[^\r\n]*[^\\][,;]/.test(vcf), "no unescaped separators in TITLE");
});

test("svgCard clips marathon taglines instead of overflowing the frame", () => {
  const long = "x".repeat(160);
  const svg = svgCard(toConfig({ ...answers, tagline: long }));
  assert.ok(!svg.includes(long), "full 160-char tagline must not appear");
  assert.match(svg, /x{71}…/);
});

test("mapGithubUser ignores blog values that aren't URL-shaped", () => {
  const junk = mapGithubUser({ login: "a", blog: "my cool site" });
  assert.ok(!("website" in junk));
  const ok = mapGithubUser({ login: "a", blog: "  foo.dev " });
  assert.equal(ok.website, "foo.dev");
});

test("doctor accepts npm's string-form bin", async (t) => {
  const dir = tmp("bin-string");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await scaffoldCard(answers, dir);
  const { readFile, writeFile } = await import("node:fs/promises");
  const pkgPath = path.join(dir, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  pkg.bin = "./cli.mjs";
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2));
  const results = await runDoctor(dir);
  const binCheck = results.find((r) => r.label.includes("bin entry"));
  assert.ok(binCheck.ok, "string-form bin should pass");
});

test("TEMPLATE_CHANGES documents every version after v1", () => {
  for (let v = 2; v <= Number(CARD_TEMPLATE_VERSION); v++) {
    assert.ok(TEMPLATE_CHANGES[v], `missing changelog for template v${v}`);
  }
});

test("compareVersions orders dotted versions correctly", () => {
  assert.equal(compareVersions("1.0.0", "1.0.1"), -1);
  assert.equal(compareVersions("2.0.0", "1.9.9"), 1);
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
  assert.equal(compareVersions("1.2.3-beta.1", "1.2.3"), 0);
  assert.equal(compareVersions("10.0.0", "9.0.0"), 1);
});

test("publishedVersion returns null for a name that cannot exist", async () => {
  assert.equal(await publishedVersion("this-name-definitely-not-real-xyzzy-99999"), null);
});

test("gitInit creates a repo with a first commit", async (t) => {
  if (!hasGit()) {
    t.skip("git not installed");
    return;
  }
  const dir = tmp("git");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await scaffoldCard(answers, dir);
  const g = gitInit(dir);
  assert.ok(g.init, "repo should initialize");
  await access(path.join(dir, ".git"));
  if (g.commit) {
    const log = spawnSync("git", ["-C", dir, "log", "--oneline"], { encoding: "utf8" });
    assert.match(log.stdout, /mint card/);
  }
});

test("multi-user --yes --dry-run plans one card per person", async (t) => {
  const res = spawnSync(
    process.execPath,
    [path.join(REPO, "cli.mjs"), "--from-github", "octocat,defunkt", "--yes", "--dry-run"],
    { cwd: HERE, encoding: "utf8", timeout: 30000 }
  );
  if (/Couldn't fetch/.test(res.stderr) && !/dry run/.test(res.stdout)) {
    t.skip("GitHub unreachable");
    return;
  }
  assert.match(res.stdout, /── octocat \(1\/2\) ──/);
  assert.match(res.stdout, /── defunkt \(2\/2\) ──/);
  const plans = (res.stdout.match(/dry run — would write to/g) || []).length;
  assert.ok(plans >= 1, "expected at least one plan printed");
  await assert.rejects(access(path.join(HERE, "octocat")), "dry run must not scaffold");
});
