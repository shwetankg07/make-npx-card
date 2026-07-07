/**
 * Named themes. `accent` is the primary color, `accent2` the far end of the
 * big-name gradient, `style` the default border (classic|minimal|double).
 */
export const THEMES = {
  cyberpunk: { label: "Cyberpunk", accent: "#00f0ff", accent2: "#ff2ea6", style: "classic" },
  synthwave: { label: "Synthwave '84", accent: "#ff2ea6", accent2: "#f9c80e", style: "double" },
  matrix: { label: "Matrix", accent: "#00ff5f", accent2: "#0aff9d", style: "classic" },
  dracula: { label: "Dracula", accent: "#bd93f9", accent2: "#ff79c6", style: "classic" },
  catppuccin: { label: "Catppuccin Mocha", accent: "#cba6f7", accent2: "#f5c2e7", style: "classic" },
  gruvbox: { label: "Gruvbox", accent: "#fabd2f", accent2: "#fe8019", style: "classic" },
  "tokyo-night": { label: "Tokyo Night", accent: "#7aa2f7", accent2: "#bb9af7", style: "classic" },
  nord: { label: "Nord", accent: "#88c0d0", accent2: "#81a1c1", style: "minimal" },
  "rose-pine": { label: "Rosé Pine", accent: "#ebbcba", accent2: "#c4a7e7", style: "minimal" },
  "hacker-green": { label: "Hacker Green", accent: "#39ff14", accent2: "#ccff00", style: "double" },
};

export function lighten(hex, amount = 0.5) {
  const n = hex.replace("#", "");
  const mix = (i) =>
    Math.round(parseInt(n.slice(i, i + 2), 16) * (1 - amount) + 255 * amount)
      .toString(16)
      .padStart(2, "0");
  return "#" + mix(0) + mix(2) + mix(4);
}
