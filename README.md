# make-npx-card

> Mint your own `npx <you>` terminal business card in under a minute.

```bash
npx make-npx-card
```

In a hurry? Zero prompts, straight from your GitHub profile:

```bash
npx make-npx-card --from-github <you> --yes
```

<!-- demo.gif goes here — record with `vhs demo.tape` -->
![demo](./demo.gif)

## The pitch

Paper business cards end up in pockets, and pockets end up in washing
machines. Terminal commands end up in muscle memory. This tool scaffolds a
complete, immediately publishable npm package that prints your name, links,
and an interactive menu whenever anyone, anywhere, runs `npx your-name`.

You answer a few questions. It handles the rendering, the package.json
ceremony, the publish pipeline, and an amount of terminal eye candy that is
difficult to justify but easy to enjoy.

## The wizard

- **GitHub import** — type your username and it prefills your name, bio,
  blog, twitter, and email from your public profile. Respects your time,
  not your air of mystery.
- **Ten themes** — Cyberpunk, Synthwave '84, Matrix, Dracula, Catppuccin
  Mocha, Gruvbox, Tokyo Night, Nord, Rosé Pine, Hacker Green, plus custom
  hex for the uncompromising. Browse with `npx make-npx-card themes`, or
  cycle them live on the preview before shipping.
- **Live npm registry check** — so you don't fall in love with a package
  name someone claimed in 2016 and abandoned the same afternoon.
- **A real preview** — the actual card, rendered by the actual renderer,
  with an edit loop. Nothing touches disk until you approve.
- **Quick mode** — `--yes` scaffolds instantly with sane defaults;
  `--from-github alice,bob,carol --yes` mints one card per teammate.
- **`--dry-run`** — prints exactly what would be written, writes nothing.
- **`doctor [dir]`** — health-checks any card: config, bin wiring, deps,
  template version, and whether your local copy drifted from npm.
- **`update [dir]`** — upgrades an existing card to the latest template
  without touching your config, then tells you what your card just learned.
- **git init** with a first commit, offered politely; automatic in quick mode.

## The cards

Every generated card is a real npm package: one config file
(`card.config.mjs`) holds your data, one runtime (`cli.mjs`) you never edit.
The runtime knows the following tricks:

| flag | behavior |
| --- | --- |
| *(none)* | gradient ASCII name, boot animation, themed box with clickable links (OSC 8), interactive menu |
| `--serve [port]` | your card is now also a website: an HTTP server with a styled HTML page plus `/json`, `/vcard`, `/card.svg`, `/qr` |
| `--stats` | live GitHub stats — stars, a language bar in GitHub's own colors, npx-runs last week, a 14-day activity sparkline |
| `--qr` | scannable QR code to your site, rendered in the terminal |
| `--qr contact` | a QR encoding your entire vCard; one scan and you're in their phone contacts |
| `--vcard` | `npx you --vcard > you.vcf` — an importable contact file |
| `--json` | machine-readable output for the pipe-and-jq demographic |
| `--plain` | no color, no box, no drama; screen-reader and pipeline friendly |
| `--open <link>` | jump straight to github, web, resume, email, or the guestbook |
| `--theme <name>` | viewers can re-skin your card in their favorite theme; you may question their taste but not their rights |
| `--fetch` | a neofetch-style profile view, since you were going to screenshot it anyway |
| `--party` | the card hue-rotates through the full color wheel, then composes itself |
| `--matrix` | follow the white rabbit |
| `--moo` | there is a cow |

Also on the menu: copy-my-email via OSC 52 (works over SSH, where clipboards
fear to tread), a guestbook that opens a prefilled GitHub issue, and live
stats. Cards greet visitors by time of day and pass no judgment on the
3 a.m. crowd. In a non-TTY they print the card and exit instead of hanging
on an invisible prompt — an act of basic decency more CLIs should attempt.

## The extras (opt-in per scaffold)

- **GitHub Actions publish workflow** — tag-triggered, with npm provenance
- **VHS demo tape** — `vhs demo.tape` records your README gif
- **Animated SVG social card** — a terminal window that types `$ npx you`
  with a blinking cursor, live inside GitHub READMEs
- **Profile README snippet** — paste-ready embed for `github.com/you/you`

## What you get

```
your-name/
├── cli.mjs                        # the card runtime — you never touch this
├── card.config.mjs                # ALL your data — edit anytime
├── package.json                   # bin + shebang + files: publish-ready
├── card.svg                       # animated README/profile embed
├── demo.tape                      # vhs demo.tape → demo.gif
├── profile-snippet.md             # paste into your GitHub profile README
├── .github/workflows/publish.yml  # npm version patch && git push --follow-tags
├── README.md · LICENSE · .gitignore
```

Then:

```bash
cd your-name
npm install
node cli.mjs     # preview
npm login        # once
npm publish      # congratulations, you are now infrastructure
```

From that point on, anyone with Node and a pulse can run `npx your-name`.

## Updating your card later

Edit `card.config.mjs` (colors, links, `bigName`, `animate`, menu), then
`npm run pub`. Card published from an older template? `npx make-npx-card
update` inside its folder pulls in every new flag while leaving your config
alone. When in doubt, `npx make-npx-card doctor`.

## Requirements

Node 18 or newer. A terminal. Mild vanity.

## Cards made with this

Open a PR and add yours.

- `npx shwetank`

## License

MIT. The cards it generates are also MIT, in your name — we're not monsters.
