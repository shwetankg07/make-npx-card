import { access, readFile, writeFile, chmod } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { CARD_TEMPLATE_VERSION } from "./templates/card-cli.mjs";
import { CARD_DEPS } from "./scaffold.mjs";
import { templateVersionOf } from "./doctor.mjs";

const TEMPLATE_CLI = fileURLToPath(new URL("./templates/card-cli.mjs", import.meta.url));

/** What each template version brought — printed by `update` for every version crossed. */
export const TEMPLATE_CHANGES = {
  2: "viewer --theme, --fetch, --party, contact QR, --open, --moo, time-of-day greeting",
  3: "--serve (your card as a website), --plain, language bar + npx-run counter in --stats, animated SVG, guestbook",
};

/**
 * Refresh an existing card's cli.mjs to the current template (config is never
 * touched) and merge newly required runtime deps into its package.json.
 * Returns { from, to, addedDeps }.
 */
export async function runUpdate(dir) {
  const cliPath = path.join(dir, "cli.mjs");
  await access(path.join(dir, "card.config.mjs")); // not a card dir → throws
  await access(cliPath);

  const from = templateVersionOf(await readFile(cliPath, "utf8")) || "pre-2";
  await writeFile(cliPath, await readFile(TEMPLATE_CLI, "utf8"));
  await chmod(cliPath, 0o755);

  const addedDeps = [];
  const pkgPath = path.join(dir, "package.json");
  try {
    const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
    pkg.dependencies ??= {};
    for (const [dep, range] of Object.entries(CARD_DEPS)) {
      if (!pkg.dependencies[dep]) {
        pkg.dependencies[dep] = range;
        addedDeps.push(dep);
      }
    }
    if (addedDeps.length) await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  } catch {
    // no package.json — cli refresh alone is still useful
  }

  return { from, to: CARD_TEMPLATE_VERSION, addedDeps };
}
