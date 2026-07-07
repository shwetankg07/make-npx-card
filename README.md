# make-npx-card

> Mint your own `npx <you>` terminal business card in under a minute.

```bash
npx make-npx-card
```

Impatient? Zero prompts, straight from your GitHub profile:

```bash
npx make-npx-card --from-github <you> --yes
```

<!-- demo.gif goes here — record with `vhs` or asciinema -->
![demo](./demo.gif)

## What it does

An interactive wizard that scaffolds a complete, **immediately publishable**
npx business card — the kind where someone types `npx your-npm-name` and gets
a slick card in their terminal with your name in big gradient ASCII, your
links, live GitHub stats, and a QR code they can scan off the screen.

### The wizard & CLI

- 🐙 **GitHub import** — type your username, it prefills name, bio, blog, twitter, email from your profile
- 🎨 **10 themes** — Cyberpunk, Synthwave '84, Matrix, Dracula, Catppuccin Mocha, Gruvbox, Tokyo Night, Nord, Rosé Pine, Hacker Green (+ custom hex) — browse them with `npx make-npx-card themes`, and **cycle themes live on the preview** before shipping
- 🔎 **Live npm registry check** so you don't pick a taken package name
- 👀 **Real preview** of your actual card with an edit loop before anything is written
- ⚡ **`--yes` quick mode** — CI-safe, zero prompts, GitHub profile in → publishable card out
- 👥 **Team mode** — `--from-github alice,bob,carol --yes` mints a card per person in one command
- 🌱 **git init + first commit** — offered in the wizard, automatic in quick mode
- 🧾 **`--dry-run`** — see exactly what would be written, write nothing
- 🩺 **`doctor`** — health-checks any card dir: config, bin wiring, deps, template version, publish status, and whether your local version drifted from npm
- ♻️ **`update`** — refreshes an existing card to the latest template (your config is never touched), auto-merges newly required deps, and prints a per-version changelog of what your card just learned

### The cards it mints

- 🌐 `--serve` — **your card is also a website**: a zero-dependency HTTP server with a terminal-styled HTML page, plus `/json`, `/vcard` (downloads straight into contacts apps), `/card.svg`, and `/qr` routes
- 🔤 Your name in big **gradient ASCII art** (auto-shrinks or disappears on narrow terminals)
- 🚀 Typewriter **boot animation** (`--no-anim` or `CI=1` to skip)
- 🔗 **Clickable hyperlinks** via OSC 8, graceful fallback everywhere else
- 🖥️ `--fetch` — **neofetch-style view**: gradient logo, `you@npx-card`, key/value info, palette row
- 🎨 `--theme <name>` — **viewers can re-skin your card** in their favorite theme (composes with every other flag, `--serve` included)
- 📊 `--stats` — **live GitHub stats**: ⭐ stars, a **language bar in real GitHub language colors**, 🚀 how many times your card got npx'd last week (npm downloads API), and a 14-day activity sparkline `▁▂▃▅▇` — cached for 10 min to respect rate limits
- 📱 `--qr` — **scannable QR code** to your site, rendered in the terminal
- 📇 `--qr contact` — QR encoding your whole vCard: **scan → you're in their phone contacts**
- 🧭 `--open github|web|resume|guestbook|…` — jump straight to any of your links
- ✍️ **Guestbook** — menu action that opens a prefilled GitHub issue on your card repo so visitors can say hi
- 🗂️ `--vcard` — `npx you --vcard > you.vcf` gives people an importable contact
- 🤖 `--json` — machine-readable for the pipe-and-jq crowd
- ♿ `--plain` — no color, no box, no emoji: screen-reader and shell-pipeline friendly
- 📋 **Copy my email** menu action via OSC 52 — works even over SSH
- 🎉 `--party` — the whole card hue-rotates live in your terminal
- 🐇 `--matrix` — follow the white rabbit
- 🐮 `--moo` — you know exactly what this does
- 👋 Greets visitors by time of day; ☕ mornings, 🦉 3am
- 🧯 CI-safe: non-TTY runs print the card and exit instead of hanging on a prompt

### The extras (opt-in per scaffold)

- ⚙️ **GitHub Actions publish workflow** — tag-triggered, with npm provenance
- 🎬 **VHS demo tape** — `vhs demo.tape` records your README gif
- 🖼️ **Animated SVG social card** — a terminal window that *types* `$ npx you` with a blinking cursor, then fades your info in, live inside GitHub READMEs (same renderer powers `--serve`'s `/card.svg`)
- 🪪 **Profile README snippet** — paste-ready embed for your `github.com/you/you` README

## What you get

```
your-name/
├── cli.mjs                        # the card runtime — you never touch this
├── card.config.mjs                # ALL your data — edit anytime
├── package.json                   # bin + shebang + files: publish-ready
├── card.svg                       # README/profile embed
├── demo.tape                      # vhs demo.tape → demo.gif
├── profile-snippet.md             # paste into your GitHub profile README
├── .github/workflows/publish.yml  # npm version patch && git push --follow-tags
├── README.md · LICENSE · .gitignore
```

Card already published from an earlier version? `npx make-npx-card update`
inside its folder pulls in every new flag while keeping your config, then
`npm run pub`. Check anything with `npx make-npx-card doctor`.

Then:

```bash
cd your-name
npm install
node cli.mjs     # preview
npm login        # once
npm publish      # 🎉
```

And forever after, anyone anywhere can run `npx your-name`.

## Updating your card later

Edit `card.config.mjs` (colors, links, `bigName`, `animate`, menu), then
`npm run pub` — or push a version tag if you scaffolded the workflow.

## Requirements

Node 18+.

## Cards made with this

Open a PR and add yours!

- `npx shwetank`

## License

MIT
