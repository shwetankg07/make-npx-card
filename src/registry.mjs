/**
 * Check whether a package name is free on the npm registry.
 * @returns {"available" | "taken" | "unknown"} "unknown" on network trouble —
 * never block the wizard on connectivity.
 */
export async function checkNpmAvailability(name) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(5000),
      headers: { accept: "application/vnd.npm.install-v1+json" },
    });
    if (res.status === 404) return "available";
    if (res.ok) return "taken";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/** Latest published version of a package, or null (unpublished/offline). */
export async function publishedVersion(name) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()).version || null;
  } catch {
    return null;
  }
}
