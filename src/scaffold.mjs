import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { lighten } from "./themes.mjs";
import { publishWorkflow, vhsTape, svgCard, profileSnippet } from "./extras.mjs";

const TEMPLATE_CLI = fileURLToPath(new URL("./templates/card-cli.mjs", import.meta.url));

/** Runtime deps every generated card needs. `update` merges missing ones in. */
export const CARD_DEPS = {
  "@clack/prompts": "^0.11.0",
  boxen: "^8.0.1",
  chalk: "^5.4.1",
  figlet: "^1.8.0",
  open: "^10.1.0",
  "qrcode-terminal": "^0.12.0",
};

function normalizeUrl(v) {
  if (!v) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : "https://" + v;
}

/** Wizard answers → the config object baked into card.config.mjs */
export function toConfig(a) {
  const links = {};
  if (a.github) links.github = a.github;
  if (a.twitter) links.twitter = a.twitter;
  if (a.linkedin) links.linkedin = a.linkedin;
  if (a.website) links.website = normalizeUrl(a.website);
  if (a.email) links.email = a.email;

  const accent = a.accentHex || "#00e5ff";
  return {
    name: a.fullName,
    tagline: a.tagline || "",
    npmHandle: a.handle,
    theme: a.theme || "custom",
    accent,
    accent2: a.accent2Hex || lighten(accent),
    style: a.style || "classic",
    bigName: a.bigName !== false,
    animate: true,
    guestbook: a.github ? a.github + "/" + a.handle : "",
    links,
    menu: a.menu || [],
    resumeUrl: a.resumeUrl ? normalizeUrl(a.resumeUrl) : "",
  };
}

function configFile(config) {
  return (
    "// Your card data — edit freely, then republish with `npm run pub`.\n" +
    "export default " +
    JSON.stringify(config, null, 2) +
    ";\n"
  );
}

function packageJson(a) {
  // npm provenance (used by the publish workflow) refuses to publish without
  // repository metadata that matches the repo — so wire it up when we can.
  const repo = a.github ? `https://github.com/${a.github}/${a.handle}` : null;
  return JSON.stringify(
    {
      name: a.handle,
      version: "1.0.0",
      description: `${a.fullName}'s npx business card`,
      type: "module",
      bin: { [a.handle]: "./cli.mjs" },
      files: ["cli.mjs", "card.config.mjs"],
      scripts: {
        start: "node cli.mjs",
        pub: "npm version patch && npm publish",
      },
      keywords: ["npx-card", "business-card", "cli", "card", a.handle],
      author: a.fullName,
      license: "MIT",
      ...(repo && {
        repository: { type: "git", url: "git+" + repo + ".git" },
        homepage: repo + "#readme",
        bugs: repo + "/issues",
      }),
      engines: { node: ">=18" },
      dependencies: { ...CARD_DEPS },
    },
    null,
    2
  ) + "\n";
}

function readme(a) {
  const extras = a.extras || [];
  const svgBlock = extras.includes("svg")
    ? `\n<p align="center"><img src="./card.svg" alt="${a.fullName}'s npx card" width="640"></p>\n`
    : "";
  const vhsBlock = extras.includes("vhs")
    ? `\n## Demo GIF\n\nInstall [VHS](https://github.com/charmbracelet/vhs), then \`vhs demo.tape\` — drop the resulting \`demo.gif\` in here.\n`
    : "";
  const workflowBlock = extras.includes("workflow")
    ? `\nAuto-publish is wired up: add an \`NPM_TOKEN\` secret to the GitHub repo, then release with \`npm version patch && git push --follow-tags\`.\n`
    : "";

  return `# ${a.handle}

> ${a.fullName}'s terminal business card

[![npm](https://img.shields.io/npm/v/${a.handle})](https://www.npmjs.com/package/${a.handle})
[![downloads](https://img.shields.io/npm/dt/${a.handle})](https://www.npmjs.com/package/${a.handle})

\`\`\`bash
npx ${a.handle}
\`\`\`
${svgBlock}
## Tricks it knows

| flag | what it does |
| --- | --- |
| \`npx ${a.handle} --fetch\` | neofetch-style profile view |
| \`npx ${a.handle} --qr\` | scannable QR code, straight in the terminal |
| \`npx ${a.handle} --qr contact\` | QR that adds me to your phone contacts |
| \`npx ${a.handle} --serve\` | the whole card as a local website (+ /json /vcard /card.svg /qr) |
| \`npx ${a.handle} --stats\` | live GitHub stats: stars, language bar, npx-runs, activity |
| \`npx ${a.handle} --plain\` | no color, no box — script & screen-reader friendly |
| \`npx ${a.handle} --open github\` | jump straight to a link (github/web/resume/…) |
| \`npx ${a.handle} --theme gruvbox\` | re-skin the card in *your* favorite theme |
| \`npx ${a.handle} --vcard > me.vcf\` | downloadable contact card |
| \`npx ${a.handle} --json\` | machine-readable, pipe it wherever |
| \`npx ${a.handle} --party\` | 🎉 |
| \`npx ${a.handle} --matrix\` | 🐇 |
| \`npx ${a.handle} --moo\` | 🐮 |

## Customize

All your data lives in [\`card.config.mjs\`](./card.config.mjs) — name, links,
theme colors, card style, menu actions, \`bigName\`/\`animate\` toggles. Edit it,
run \`npm start\` to preview, done. You never need to touch \`cli.mjs\`.

## Publish / update

\`\`\`bash
npm login          # once
npm publish        # first release
npm run pub        # every update after (bumps the patch version + publishes)
\`\`\`
${workflowBlock}${vhsBlock}
---

⚡ minted with [make-npx-card](https://www.npmjs.com/package/make-npx-card) — run \`npx make-npx-card\` to make yours
`;
}

function license(a) {
  const year = new Date().getFullYear();
  return `MIT License

Copyright (c) ${year} ${a.fullName}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
}

const GITIGNORE = "node_modules/\n*.tgz\n";

/**
 * Compute every file a card scaffold would write, without touching disk.
 * Returns { config, files: Map<relativePath, content> }.
 */
export async function planCard(answers) {
  const config = toConfig(answers);
  const files = new Map();
  files.set("cli.mjs", await readFile(TEMPLATE_CLI, "utf8"));
  files.set("card.config.mjs", configFile(config));
  files.set("package.json", packageJson(answers));
  files.set("README.md", readme(answers));
  files.set("LICENSE", license(answers));
  files.set(".gitignore", GITIGNORE);

  const extras = answers.extras || [];
  if (extras.includes("workflow")) files.set(".github/workflows/publish.yml", publishWorkflow());
  if (extras.includes("vhs")) files.set("demo.tape", vhsTape(answers.handle));
  if (extras.includes("svg")) files.set("card.svg", svgCard(config));
  if (extras.includes("profile")) files.set("profile-snippet.md", profileSnippet(answers));

  return { config, files };
}

/** Write a complete, publishable card package into targetDir. */
export async function scaffoldCard(answers, targetDir) {
  const { config, files } = await planCard(answers);
  for (const [rel, content] of files) {
    const dest = path.join(targetDir, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, content);
  }
  await chmod(path.join(targetDir, "cli.mjs"), 0o755);
  return config;
}
