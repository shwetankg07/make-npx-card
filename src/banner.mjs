import chalk from "chalk";

const ART = [
  "███╗   ██╗██████╗ ██╗  ██╗     ██████╗ █████╗ ██████╗ ██████╗ ",
  "████╗  ██║██╔══██╗╚██╗██╔╝    ██╔════╝██╔══██╗██╔══██╗██╔══██╗",
  "██╔██╗ ██║██████╔╝ ╚███╔╝     ██║     ███████║██████╔╝██║  ██║",
  "██║╚██╗██║██╔═══╝  ██╔██╗     ██║     ██╔══██║██╔══██╗██║  ██║",
  "██║ ╚████║██║     ██╔╝ ██╗    ╚██████╗██║  ██║██║  ██║██████╔╝",
  "╚═╝  ╚═══╝╚═╝     ╚═╝  ╚═╝     ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ",
];

const SHADES = ["#64748b", "#79879c", "#8d9bad", "#a2aebf", "#b6c2d0", "#cbd5e1"];

export function banner() {
  console.log("");
  ART.forEach((line, i) => console.log(chalk.hex(SHADES[i % SHADES.length])(line)));
  console.log(chalk.dim("  mint your own `npx <you>` business card\n"));
}
