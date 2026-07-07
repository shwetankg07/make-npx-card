import * as p from "@clack/prompts";
import { checkNpmAvailability } from "./registry.mjs";
import { THEMES, lighten } from "./themes.mjs";

export function bail() {
  p.cancel("maybe later 👋");
  process.exit(0);
}

/** Unwrap a clack prompt result, exiting gracefully on Ctrl+C. */
export function must(value) {
  if (p.isCancel(value)) bail();
  return value;
}

const HANDLE_RE = /^[a-z0-9][a-z0-9-._]{0,49}$/;

function validateHandle(v) {
  // Uppercase input is fine — we lowercase it on submit, so validate lowered.
  const name = (v || "").trim().toLowerCase();
  if (!name) return "Required — this becomes your npm package name";
  if (!HANDLE_RE.test(name)) {
    return "Letters, digits, - . _ only; must start with a letter or digit";
  }
  return undefined;
}

function validateOptionalEmail(v) {
  if (!v.trim()) return undefined;
  if (!/^\S+@\S+\.\S+$/.test(v.trim())) return "That doesn't look like an email";
  return undefined;
}

function validateOptionalUrl(v) {
  if (!v.trim()) return undefined;
  if (!/\S+\.\S+/.test(v.trim())) return "That doesn't look like a URL";
  return undefined;
}

function stripAt(v) {
  return v.trim().replace(/^@/, "");
}

async function askHandle(prev) {
  let initial = prev.handle ?? "";
  while (true) {
    const handle = must(
      await p.text({
        message: "npm package name for your card (people will run `npx <name>`)",
        placeholder: "your-npm-username",
        initialValue: initial,
        validate: validateHandle,
      })
    ).trim().toLowerCase();

    const s = p.spinner();
    s.start("Checking availability on the npm registry");
    const status = await checkNpmAvailability(handle);

    if (status === "available") {
      s.stop(`"${handle}" is available on npm ✔`);
      return handle;
    }
    if (status === "unknown") {
      s.stop("Couldn't reach the npm registry — skipping the availability check");
      return handle;
    }

    s.stop(`"${handle}" is already taken on npm`);
    const verdict = must(
      await p.select({
        message: "What do you want to do?",
        options: [
          { value: "retry", label: "Pick a different name" },
          { value: "mine", label: "That's my package — I'm rebuilding/updating it" },
        ],
      })
    );
    if (verdict === "mine") return handle;
    initial = handle;
  }
}

export async function runWizard(prev = {}) {
  const fullName = must(
    await p.text({
      message: "Your full name",
      placeholder: "Ada Lovelace",
      initialValue: prev.fullName ?? "",
      validate: (v) => (v.trim() ? undefined : "Required"),
    })
  ).trim();

  const tagline = must(
    await p.text({
      message: "Job title / tagline (optional)",
      placeholder: "breaks things, then fixes them",
      initialValue: prev.tagline ?? "",
    })
  ).trim();

  const handle = await askHandle(prev);

  const github = stripAt(
    must(
      await p.text({
        message: "GitHub username (optional)",
        initialValue: prev.github ?? "",
      })
    )
  );

  const twitter = stripAt(
    must(
      await p.text({
        message: "Twitter/X handle (optional)",
        initialValue: prev.twitter ?? "",
      })
    )
  );

  const linkedin = stripAt(
    must(
      await p.text({
        message: "LinkedIn handle — the bit after linkedin.com/in/ (optional)",
        initialValue: prev.linkedin ?? "",
      })
    )
  );

  const website = must(
    await p.text({
      message: "Website / portfolio URL (optional)",
      placeholder: "https://you.dev",
      initialValue: prev.website ?? "",
      validate: validateOptionalUrl,
    })
  ).trim();

  const email = must(
    await p.text({
      message: "Email (optional)",
      initialValue: prev.email ?? "",
      validate: validateOptionalEmail,
    })
  ).trim();

  const theme = must(
    await p.select({
      message: "Theme",
      initialValue: prev.theme,
      options: [
        ...Object.entries(THEMES).map(([value, t]) => ({
          value,
          label: t.label,
          hint: `${t.accent} → ${t.accent2}`,
        })),
        { value: "custom", label: "Custom hex…" },
      ],
    })
  );

  let accentHex;
  let accent2Hex;
  if (theme === "custom") {
    accentHex = must(
      await p.text({
        message: "Accent hex color",
        placeholder: "#ff6b35",
        initialValue: prev.theme === "custom" ? prev.accentHex : "",
        validate: (v) =>
          /^#?[0-9a-fA-F]{6}$/.test(v.trim()) ? undefined : "Six hex digits, e.g. #ff6b35",
      })
    ).trim();
    if (!accentHex.startsWith("#")) accentHex = "#" + accentHex;
    accent2Hex = lighten(accentHex);
  } else {
    accentHex = THEMES[theme].accent;
    accent2Hex = THEMES[theme].accent2;
  }

  const style = must(
    await p.select({
      message: "Card style",
      initialValue: prev.style ?? (theme !== "custom" ? THEMES[theme].style : undefined),
      options: [
        { value: "classic", label: "Classic box", hint: "rounded corners" },
        { value: "minimal", label: "Minimal", hint: "thin dim border" },
        { value: "double", label: "Double border", hint: "old-school BBS energy" },
      ],
    })
  );

  const bigName = must(
    await p.confirm({
      message: "Render your name as big gradient ASCII art on the card?",
      initialValue: prev.bigName ?? true,
    })
  );

  const menuOptions = [];
  if (email) menuOptions.push({ value: "email", label: "📧 Send me an email" });
  if (website) menuOptions.push({ value: "portfolio", label: "🌐 Open my portfolio" });
  menuOptions.push({ value: "resume", label: "📄 Grab my resume", hint: "asks for a URL" });

  const menu = must(
    await p.multiselect({
      message: "Interactive actions on your card (space to toggle, enter to confirm)",
      options: menuOptions,
      initialValues: prev.menu ?? [],
      required: false,
    })
  );

  let resumeUrl = prev.resumeUrl ?? "";
  if (menu.includes("resume")) {
    resumeUrl = must(
      await p.text({
        message: "Resume URL",
        placeholder: "https://you.dev/resume.pdf",
        initialValue: resumeUrl,
        validate: (v) => (/\S+\.\S+/.test(v.trim()) ? undefined : "Required for the resume action"),
      })
    ).trim();
  }

  const extras = must(
    await p.multiselect({
      message: "Extras to scaffold alongside the card",
      options: [
        { value: "workflow", label: "⚙️  GitHub Actions auto-publish", hint: "npm provenance, tag-triggered" },
        { value: "vhs", label: "🎬 VHS demo tape", hint: "record your README gif with one command" },
        { value: "svg", label: "🖼️  SVG social card", hint: "terminal-style card for your GitHub profile" },
        { value: "profile", label: "🪪  Profile README snippet", hint: "paste-ready embed for github.com/you/you" },
      ],
      initialValues: prev.extras ?? ["workflow", "vhs", "svg", "profile"],
      required: false,
    })
  );

  return {
    fullName,
    tagline,
    handle,
    github,
    twitter,
    linkedin,
    website,
    email,
    theme,
    accentHex,
    accent2Hex,
    style,
    bigName,
    menu,
    resumeUrl,
    extras,
  };
}
