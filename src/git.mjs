import { spawnSync } from "node:child_process";

const sh = process.platform === "win32";

function git(args, cwd) {
  try {
    return spawnSync("git", args, { cwd, stdio: "ignore", shell: sh }).status === 0;
  } catch {
    return false;
  }
}

export function hasGit() {
  return git(["--version"]);
}

/**
 * Init a repo on `main` and make the first commit.
 * Returns { init, commit } — commit can fail independently (e.g. no
 * user.name configured) and that's fine, the repo is still useful.
 */
export function gitInit(dir) {
  const init = git(["init", "-b", "main"], dir) || git(["init"], dir);
  if (!init) return { init: false, commit: false };
  if (!git(["add", "-A"], dir)) return { init: true, commit: false };
  const commit = git(["commit", "-m", "🎴 mint card with make-npx-card"], dir);
  return { init: true, commit };
}
