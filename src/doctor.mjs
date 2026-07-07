import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { CARD_TEMPLATE_VERSION } from "./templates/card-cli.mjs";
import { CARD_DEPS } from "./scaffold.mjs";
import { checkNpmAvailability, publishedVersion } from "./registry.mjs";

/** Compare dotted versions numerically (prerelease tags ignored). */
export function compareVersions(a, b) {
  const pa = String(a).split("-")[0].split(".").map(Number);
  const pb = String(b).split("-")[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function templateVersionOf(cliSource) {
  const m = cliSource.match(/CARD_TEMPLATE_VERSION\s*=\s*"(\d+)"/);
  return m ? m[1] : null;
}

/**
 * Health-check a card directory. Returns a list of
 * { ok, label, detail?, level: "fail" | "warn" | "info" } — exit code is the
 * caller's job.
 */
export async function runDoctor(dir) {
  const results = [];
  const check = (ok, label, detail = "", level = "fail") => results.push({ ok, label, detail, level });

  let config = null;
  try {
    config = (await import(pathToFileURL(path.resolve(dir, "card.config.mjs")).href)).default;
    check(true, "card.config.mjs loads");
  } catch (e) {
    check(false, "card.config.mjs loads", e.message);
  }
  if (config) {
    check(Boolean(config.name), "config has a name");
    check(Boolean(config.npmHandle), "config has an npmHandle");
  }

  let pkg = null;
  try {
    pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
    check(true, "package.json parses");
  } catch (e) {
    check(false, "package.json parses", e.message);
  }
  if (pkg) {
    if (config?.npmHandle) {
      check(
        pkg.name === config.npmHandle,
        "package name matches the card handle",
        pkg.name !== config.npmHandle ? `"${pkg.name}" vs "${config.npmHandle}" — npx runs the package name` : ""
      );
    }
    check(pkg.type === "module", 'package.json has "type": "module"');
    // npm allows bin as a plain string too — treat both forms as valid.
    const bins = typeof pkg.bin === "string" ? [pkg.bin] : Object.values(pkg.bin || {});
    check(bins.includes("./cli.mjs"), "bin entry points at ./cli.mjs");
    const missing = Object.keys(CARD_DEPS).filter((d) => !pkg.dependencies?.[d]);
    check(
      missing.length === 0,
      "all card runtime deps present",
      missing.length ? "missing: " + missing.join(", ") + " — run `npx make-npx-card update`" : "",
      "warn"
    );
  }

  let cli = null;
  try {
    cli = await readFile(path.join(dir, "cli.mjs"), "utf8");
    check(cli.startsWith("#!/usr/bin/env node"), "cli.mjs has a shebang");
  } catch (e) {
    check(false, "cli.mjs exists", e.message);
  }
  if (cli) {
    const v = templateVersionOf(cli);
    check(
      v === CARD_TEMPLATE_VERSION,
      `card template is current (v${CARD_TEMPLATE_VERSION})`,
      v === CARD_TEMPLATE_VERSION ? "" : `found ${v ? "v" + v : "pre-v2"} — run \`npx make-npx-card update\``,
      "warn"
    );
  }

  const major = Number(process.versions.node.split(".")[0]);
  check(major >= 18, `node >= 18 (running ${process.version})`);

  if (pkg?.name) {
    const status = await checkNpmAvailability(pkg.name);
    if (status === "taken") {
      check(true, `"${pkg.name}" is published on npm`, "", "info");
      const pub = await publishedVersion(pkg.name);
      if (pub && pkg.version) {
        const cmp = compareVersions(pkg.version, pub);
        if (cmp < 0) {
          check(false, `local version ${pkg.version} is behind npm (${pub})`, "pull your latest source or bump past it", "warn");
        } else if (cmp === 0) {
          check(true, `version in sync with npm (${pub})`, "npm version patch before your next publish", "info");
        } else {
          check(true, `local ${pkg.version} ahead of npm ${pub}`, "npm publish when ready", "info");
        }
      }
    } else if (status === "available") {
      check(true, `"${pkg.name}" not on npm yet`, "npm publish when ready", "info");
    } else {
      check(true, "npm registry unreachable", "skipped publish check", "info");
    }
  }

  return results;
}
