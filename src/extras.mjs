/** Optional extra files scaffolded alongside a card. */

// The SVG card lives in the template (cards serve it via --serve); the
// generator reuses the exact same builder so the two can never drift.
export { svgCard, escapeXml } from "./templates/card-cli.mjs";

export function publishWorkflow() {
  return `name: publish

on:
  push:
    tags: ["v*"]

permissions:
  contents: read
  id-token: write # npm provenance

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}

# Setup (once):
#   1. npm token create --read-only=false   (or npmjs.com → Access Tokens)
#   2. Add it as the NPM_TOKEN secret in this repo's Settings → Secrets
# Release flow:
#   npm version patch && git push --follow-tags
`;
}

export function vhsTape(handle) {
  return `# Record the demo GIF for your README with VHS: https://github.com/charmbracelet/vhs
#   vhs demo.tape
Output demo.gif

Set FontSize 18
Set Width 1000
Set Height 650
Set Theme "Catppuccin Mocha"
Set Padding 20

Type "npx ${handle}"
Sleep 500ms
Enter
Sleep 4s
Down@400ms 2
Sleep 1.5s
Escape
Sleep 1s
`;
}

export function profileSnippet(answers) {
  const gh = answers.github || "<your-github-username>";
  const raw = `https://raw.githubusercontent.com/${gh}/${answers.handle}/main/card.svg`;
  return `# GitHub profile README snippet

Paste this into your profile README (the repo named \`${gh}\`):

\`\`\`markdown
<p align="center">
  <a href="https://www.npmjs.com/package/${answers.handle}">
    <img src="${raw}" alt="${answers.fullName}'s npx card" width="640">
  </a>
</p>
<p align="center">
  <a href="https://www.npmjs.com/package/${answers.handle}">
    <img src="https://img.shields.io/badge/run-npx_${answers.handle.replace(/[-_]/g, (m) => (m === "-" ? "--" : "__"))}-blue" alt="npx ${answers.handle}">
  </a>
</p>
\`\`\`

The image URL assumes this card lives at github.com/${gh}/${answers.handle}
on branch \`main\` — adjust if you push it elsewhere. The SVG is animated —
it types \`$ npx ${answers.handle}\` with a blinking cursor, live on your profile.
`;
}
