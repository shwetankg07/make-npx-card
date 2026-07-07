// Interactive-path regression tests. Clack's prompts only run on a real TTY,
// so these drive the wizard and card through util-linux `script` with actual
// keystrokes — the class of bug (p.text → undefined on empty submit) that
// non-TTY tests can never catch. Skipped where `script` isn't available.
import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scaffoldCard } from "../src/scaffold.mjs";
import { THEMES } from "../src/themes.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, "..");

const hasScript = (() => {
  try {
    return spawnSync("script", ["--version"], { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
})();

/**
 * Run `cmd` on a PTY, send keystrokes at scheduled times, then report
 * whether the process was still alive (i.e. waiting on a prompt, not
 * crashed) at settle time.
 */
function drivePty(cmd, cwd, keys, settleMs) {
  return new Promise((resolve) => {
    const child = spawn("script", ["-qec", cmd, "/dev/null"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (out += c));
    for (const k of keys) {
      setTimeout(() => {
        if (child.exitCode === null) child.stdin.write(k.data);
      }, k.at);
    }
    setTimeout(() => {
      const alive = child.exitCode === null;
      child.kill("SIGKILL");
      resolve({ alive, out });
    }, settleMs);
  });
}

test("wizard survives Enter-to-skip on the GitHub prompt (the shwetank crash)", { skip: !hasScript && "util-linux script not available" }, async () => {
  const { alive, out } = await drivePty(
    `node ${path.join(REPO, "cli.mjs")}`,
    HERE,
    [{ at: 1800, data: "\r" }],
    5500
  );
  assert.ok(!/TypeError/.test(out), "no TypeError after empty submit:\n" + out.slice(-500));
  assert.ok(alive, "wizard should still be waiting at the next prompt, not dead");
});

test("wizard survives an empty tagline submit", { skip: !hasScript && "util-linux script not available" }, async () => {
  const { alive, out } = await drivePty(
    `node ${path.join(REPO, "cli.mjs")}`,
    HERE,
    [
      { at: 1800, data: "\r" },            // skip GitHub import
      { at: 2600, data: "Pty Tester\r" },  // name
      { at: 3400, data: "\r" },            // tagline: empty (was crash-prone)
    ],
    6500
  );
  assert.ok(!/TypeError/.test(out), "no TypeError:\n" + out.slice(-500));
  assert.ok(alive, "wizard should be alive at the handle prompt");
});

test("card menu survives Enter on its first action", { skip: !hasScript && "util-linux script not available" }, async (t) => {
  const dir = path.join(HERE, `.tmp-pty-${process.pid}`);
  t.after(() => rm(dir, { recursive: true, force: true }));
  await scaffoldCard(
    {
      fullName: "Pty Tester",
      tagline: "",
      handle: "pty-menu-card",
      github: "",
      twitter: "",
      linkedin: "",
      website: "https://example.com",
      email: "t@example.com",
      theme: "nord",
      accentHex: THEMES.nord.accent,
      accent2Hex: THEMES.nord.accent2,
      style: "minimal",
      bigName: false,
      menu: ["email"],
      resumeUrl: "",
      extras: [],
    },
    dir
  );
  const { out } = await drivePty(
    "node cli.mjs --no-anim",
    dir,
    [
      { at: 2000, data: "\r" },     // first action: email → launch() fallback (no browser)
      { at: 4000, data: "\u001B" }, // Escape → clean cancel exit
    ],
    6500
  );
  assert.ok(!/TypeError/.test(out), "no TypeError:\n" + out.slice(-500));
  assert.match(out, /See you around/, "cancel should exit the menu politely");
});
