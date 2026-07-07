#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import * as p from "@clack/prompts";
import chalk from "chalk";
import { banner } from "./src/banner.mjs";
import { runWizard, must, bail } from "./src/wizard.mjs";
import { scaffoldCard, planCard, toConfig } from "./src/scaffold.mjs";
import { renderCard } from "./src/templates/card-cli.mjs";
import { fetchGithubUser, mapGithubUser } from "./src/github.mjs";
import { THEMES } from "./src/themes.mjs";
import { runDoctor } from "./src/doctor.mjs";
import { runUpdate, TEMPLATE_CHANGES } from "./src/update.mjs";
import { hasGit, gitInit } from "./src/git.mjs";

const HELP = `make-npx-card — mint your own \`npx <you>\` business card

Usage:
  npx make-npx-card                          interactive wizard
  npx make-npx-card --from-github <user>     prefill the wizard from a GitHub profile
  npx make-npx-card --from-github <user> --yes
                                             zero prompts: scaffold instantly with smart defaults
  npx make-npx-card --from-github a,b,c --yes
                                             mint a card for the whole team in one go
Commands:
  themes           preview all built-in themes
  doctor [dir]     health-check a card directory (config, bin, deps, template version)
  update [dir]     refresh a card's cli.mjs to the latest template (config untouched)

Flags:
  --theme <name>   theme for --yes mode (${Object.keys(THEMES).join(", ")})
  --dry-run        show what would be scaffolded, write nothing
  -h, --help       this
  -v, --version    version
`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from-github") args.fromGithub = argv[++i];
    else if (a === "--theme") args.theme = argv[++i];
    else if (a === "--yes" || a === "-y") args.yes = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--version" || a === "-v") args.version = true;
    else args._.push(a);
  }
  return args;
}

function showThemes() {
  console.log("\n" + chalk.bold("  make-npx-card themes") + "\n");
  for (const [name, t] of Object.entries(THEMES)) {
    console.log(
      "  " +
        chalk.hex(t.accent)("████") +
        chalk.hex(t.accent2)("████") +
        "  " +
        t.label.padEnd(18) +
        chalk.dim(name.padEnd(14) + t.style.padEnd(9) + t.accent + " → " + t.accent2)
    );
  }
  console.log(chalk.dim("\n  try one:  npx make-npx-card --from-github <you> --yes --theme dracula"));
  console.log(chalk.dim("  viewers can re-skin any card too:  npx <card> --theme nord\n"));
}

async function doctorCommand(dir) {
  console.log(chalk.bold(`\n  doctor: ${path.resolve(dir)}\n`));
  let results;
  try {
    results = await runDoctor(dir);
  } catch (e) {
    console.error("  couldn't examine that directory: " + e.message);
    process.exit(1);
  }
  let failed = false;
  for (const r of results) {
    const icon = r.ok ? chalk.green("✔") : r.level === "warn" ? chalk.yellow("⚠") : chalk.red("✖");
    if (!r.ok && r.level === "fail") failed = true;
    console.log(`  ${icon} ${r.label}` + (r.detail ? chalk.dim("  — " + r.detail) : ""));
  }
  console.log(failed ? chalk.red("\n  card needs attention\n") : chalk.green("\n  card looks healthy 🎉\n"));
  if (failed) process.exit(1);
}

async function updateCommand(dir) {
  try {
    const { from, to, addedDeps } = await runUpdate(dir);
    console.log(`\n  template ${from === to ? "already at" : from + " → "}v${to} ✔`);
    const fromN = from === "pre-2" ? 1 : Number(from);
    for (let v = fromN + 1; v <= Number(to); v++) {
      if (TEMPLATE_CHANGES[v]) console.log(chalk.dim(`    v${v}: ${TEMPLATE_CHANGES[v]}`));
    }
    if (addedDeps.length) {
      console.log(`  added deps: ${addedDeps.join(", ")} — run npm install`);
    }
    console.log("  your card.config.mjs was not touched\n");
  } catch (e) {
    if (e?.code === "ENOENT") {
      console.error("  that doesn't look like a card directory (no card.config.mjs / cli.mjs)");
    } else {
      console.error("  update failed: " + (e?.message || e));
    }
    process.exit(1);
  }
}

function printPlan(files, dir) {
  console.log(chalk.bold(`\n  dry run — would write to ./${dir}:\n`));
  for (const [rel, content] of files) {
    console.log("  " + rel.padEnd(32) + chalk.dim(`${Buffer.byteLength(content)} bytes`));
  }
  console.log(chalk.dim("\n  nothing written. drop --dry-run to scaffold for real.\n"));
}

async function localVersion() {
  const pkg = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));
  return pkg.version;
}

/** Resolves to the newer published version string, or null. Never throws. */
async function checkForUpdate() {
  try {
    const res = await fetch("https://registry.npmjs.org/make-npx-card/latest", {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const latest = (await res.json()).version;
    return latest && latest !== (await localVersion()) ? latest : null;
  } catch {
    return null;
  }
}

function npmInstall(cwd) {
  return new Promise((resolve) => {
    const child = spawn("npm", ["install"], {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function pickTargetDir(handle) {
  let dir = path.resolve(process.cwd(), handle);
  while (existsSync(dir)) {
    const verdict = must(
      await p.select({
        message: `./${path.basename(dir)} already exists — what now?`,
        options: [
          { value: "rename", label: "Scaffold into a different folder" },
          { value: "overwrite", label: "Overwrite its files", hint: "existing files with the same names get replaced" },
          { value: "cancel", label: "Cancel" },
        ],
      })
    );
    if (verdict === "cancel") bail();
    if (verdict === "overwrite") return dir;
    const name = must(
      await p.text({
        message: "Folder name",
        initialValue: path.basename(dir) + "-card",
        validate: (v) => (v.trim() ? undefined : "Required"),
      })
    ).trim();
    dir = path.resolve(process.cwd(), name);
  }
  return dir;
}

function nextStepsNote(rel, handle, { installed = false, extras = [], gitInited = false } = {}) {
  return [
    `cd ${rel}`,
    installed ? null : "npm install",
    "node cli.mjs        # preview your card",
    "npm login           # once",
    "npm publish         # 🎉",
    extras.includes("vhs") ? "vhs demo.tape       # record your README gif" : null,
    gitInited ? "git remote add origin <repo-url> && git push -u origin main" : null,
    "",
    `then anyone can run:  ${chalk.bold("npx " + handle)}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/** First free directory: handle, handle-card, handle-card-2, … */
function uniqueDir(handle) {
  let dir = path.resolve(process.cwd(), handle);
  for (let n = 0; existsSync(dir); n++) {
    dir = path.resolve(process.cwd(), handle + "-card" + (n ? "-" + (n + 1) : ""));
  }
  return dir;
}

/** One --yes scaffold: GitHub profile in, publishable card out, zero questions. */
async function quickOne(username, args) {
  const user = await fetchGithubUser(username);
  if (!user) {
    console.error(`Couldn't fetch GitHub user "${username}".`);
    return false;
  }
  const themeName = args.theme && THEMES[args.theme] ? args.theme : "cyberpunk";
  const theme = THEMES[themeName];
  const gh = mapGithubUser(user);
  const menu = [];
  if (gh.email) menu.push("email");
  if (gh.website) menu.push("portfolio");
  const answers = {
    tagline: "",
    twitter: "",
    linkedin: "",
    website: "",
    email: "",
    ...gh,
    theme: themeName,
    accentHex: theme.accent,
    accent2Hex: theme.accent2,
    style: theme.style,
    bigName: true,
    menu,
    resumeUrl: "",
    extras: ["workflow", "vhs", "svg", "profile"],
  };

  const dir = uniqueDir(answers.handle);
  const rel = path.relative(process.cwd(), dir) || ".";

  if (args.dryRun) {
    const { files } = await planCard(answers);
    printPlan(files, rel);
    return true;
  }

  const config = await scaffoldCard(answers, dir);
  console.log(renderCard(config));
  console.log(`Scaffolded ./${rel} (theme: ${themeName})`);
  let gitDone = false;
  if (hasGit()) {
    const g = gitInit(dir);
    gitDone = g.init;
    if (g.commit) console.log("git repo initialized with a first commit ✔");
    else if (g.init) console.log("git repo initialized (commit skipped — set git user.name/email)");
  }
  console.log("\n" + nextStepsNote(rel, answers.handle, { extras: answers.extras, gitInited: gitDone }) + "\n");
  return true;
}

/** --yes mode; --from-github takes one user or a comma-separated crew. */
async function quickMode(args) {
  if (!args.fromGithub) {
    console.error("--yes needs --from-github <user> to know who you are.");
    process.exit(1);
  }
  const users = args.fromGithub.split(",").map((s) => s.trim()).filter(Boolean);
  let failures = 0;
  for (const [i, user] of users.entries()) {
    if (users.length > 1) console.log(chalk.bold(`\n── ${user} (${i + 1}/${users.length}) ──`));
    if (!(await quickOne(user, args))) failures++;
  }
  if (failures === users.length) process.exit(1);
  if (failures) process.exitCode = 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return void console.log(HELP);
  if (args.version) return void console.log(await localVersion());

  const command = args._[0];
  if (command === "themes") return void showThemes();
  if (command === "doctor") return doctorCommand(args._[1] || ".");
  if (command === "update") return updateCommand(args._[1] || ".");
  if (command) {
    console.error(`unknown command "${command}" — try --help`);
    process.exitCode = 1;
    return;
  }

  if (args.yes) return quickMode(args);

  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    console.error("make-npx-card is an interactive wizard — run it in a terminal.");
    console.error("Non-interactive usage: npx make-npx-card --from-github <user> --yes");
    process.exitCode = 1;
    return;
  }

  // Skip the update ping on dry runs — its pending fetch would hold the
  // process open for up to 3s after the early "nothing written" exit.
  const updatePromise = args.dryRun ? Promise.resolve(null) : checkForUpdate();

  banner();
  p.intro("let's mint your card");

  let answers = {};

  // Prefill from GitHub: via flag, or offered interactively.
  let ghUser = args.fromGithub;
  if (!ghUser) {
    const v = must(
      await p.text({
        message: "GitHub username to import your profile from (enter to skip)",
        placeholder: "your-github-username",
      })
    ).trim();
    ghUser = v || null;
  }
  if (ghUser) {
    const s = p.spinner();
    s.start(`Importing ${ghUser} from GitHub`);
    const user = await fetchGithubUser(ghUser);
    if (user) {
      answers = mapGithubUser(user);
      s.stop(`Imported ${user.name || user.login} from GitHub ✔`);
    } else {
      s.stop(`Couldn't fetch "${ghUser}" — starting blank`);
    }
  }

  // A --theme flag preselects the wizard's theme prompt too, not just --yes mode.
  if (args.theme && THEMES[args.theme]) answers = { ...answers, theme: args.theme };

  outer: while (true) {
    answers = await runWizard(answers);
    while (true) {
      console.log("\n" + renderCard(toConfig(answers)));
      const verdict = must(
        await p.select({
          message: "That's your card. Ship it?",
          options: [
            { value: "ship", label: "🚀 Ship it" },
            { value: "theme", label: "🎨 Try another theme", hint: "re-renders instantly" },
            { value: "edit", label: "✏️  Edit my answers" },
            { value: "cancel", label: "Cancel" },
          ],
        })
      );
      if (verdict === "cancel") bail();
      if (verdict === "ship") break outer;
      if (verdict === "edit") continue outer;
      const pick = must(
        await p.select({
          message: "Theme",
          initialValue: answers.theme,
          options: Object.entries(THEMES).map(([value, t]) => ({
            value,
            label: t.label,
            hint: `${t.accent} → ${t.accent2}`,
          })),
        })
      );
      const t = THEMES[pick];
      answers = { ...answers, theme: pick, accentHex: t.accent, accent2Hex: t.accent2, style: t.style };
    }
  }

  const dir = await pickTargetDir(answers.handle);
  const rel = path.relative(process.cwd(), dir) || ".";

  if (args.dryRun) {
    const { files } = await planCard(answers);
    printPlan(files, rel);
    p.outro("dry run complete — nothing written");
    return;
  }

  const s = p.spinner();
  s.start(`Scaffolding ./${rel}`);
  await scaffoldCard(answers, dir);
  s.stop(`Scaffolded ./${rel} ✔`);

  const install = must(
    await p.confirm({ message: "Run npm install in there now?", initialValue: true })
  );
  let installed = false;
  if (install) {
    installed = await npmInstall(dir);
    if (!installed) p.log.warn("npm install failed — run it manually before testing.");
  }

  let gitDone = false;
  if (hasGit()) {
    const wantGit = must(
      await p.confirm({ message: "Initialize a git repo with a first commit?", initialValue: true })
    );
    if (wantGit) {
      const g = gitInit(dir);
      gitDone = g.init;
      if (g.commit) p.log.success("git repo ready — first commit made");
      else if (g.init) p.log.warn("repo initialized, commit skipped (set git user.name/email)");
      else p.log.warn("git init failed — you can do it manually");
    }
  }

  p.note(nextStepsNote(rel, answers.handle, { installed, extras: answers.extras, gitInited: gitDone }), "next steps");

  const latest = await updatePromise;
  if (latest) {
    p.log.info(`make-npx-card ${latest} is out — npx make-npx-card@latest next time`);
  }

  p.outro("go ship it 🚀");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
