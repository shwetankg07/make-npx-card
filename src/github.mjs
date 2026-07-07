/** Fetch a GitHub user's public profile, or null if unreachable/not found. */
export async function fetchGithubUser(username) {
  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
      signal: AbortSignal.timeout(6000),
      headers: { accept: "application/vnd.github+json", "user-agent": "make-npx-card" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Map a GitHub API user object onto wizard answers. Pure — easy to test. */
export function mapGithubUser(u) {
  if (!u || !u.login) return {};
  const answers = {
    fullName: u.name || u.login,
    handle: u.login.toLowerCase().replace(/[^a-z0-9-._]/g, "-"),
    github: u.login,
  };
  if (u.bio) answers.tagline = u.bio.replace(/\s+/g, " ").trim();
  if (u.twitter_username) answers.twitter = u.twitter_username;
  // GitHub's blog field is free text — only take it when it looks like a URL.
  if (u.blog && /^\S+\.\S+$/.test(u.blog.trim())) answers.website = u.blog.trim();
  if (u.email) answers.email = u.email;
  return answers;
}
