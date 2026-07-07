# Publishing make-npx-card (notes to self)

## First release

```bash
npm install
npm test                      # all green?
node cli.mjs                  # run the wizard end-to-end once, publish nothing
node cli.mjs --from-github <you> --yes   # quick-mode smoke test
node cli.mjs themes                      # gallery renders?
(cd <scaffolded-card> && node cli.mjs --serve)   # hit / /json /vcard /card.svg /qr
npm pack --dry-run            # inspect exactly what ships (cli.mjs + src/ only)
npm login
npm publish
```

If the name `make-npx-card` gets taken before you publish, either pick an
alternative (`mint-npx-card`, `npx-card-maker`, `create-npx-card` — the
`create-*` prefix also unlocks `npm create npx-card`) or publish scoped:
change `name` to `@<your-npm-user>/make-npx-card` and run
`npm publish --access public`.

## Every update after

```bash
npm test
npm run pub        # = npm version patch && npm publish
```

Use `npm version minor` instead when you add a feature, `major` for breaking
changes to the generated output.

## Before v1 goes out — the checklist that actually matters

- [ ] Record a demo GIF (`vhs` makes this painless) and replace the
      placeholder in README.md — this is the #1 driver of installs
- [ ] Create the GitHub repo and add `"repository"` + `"bugs"` + `"homepage"`
      to package.json (npm shows these on the package page)
- [ ] Run the wizard once for real and publish your own regenerated card —
      it's the first entry in the "Cards made with this" section
- [ ] Tweet/post it with the GIF

## Smoke test after publishing

```bash
cd $(mktemp -d)
npx make-npx-card@latest
```
