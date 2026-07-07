import chalk from "chalk";

const ART = [
  "███╗   ██╗██████╗ ██╗  ██╗     ██████╗ █████╗ ██████╗ ██████╗ ",
  "████╗  ██║██╔══██╗╚██╗██╔╝    ██╔════╝██╔══██╗██╔══██╗██╔══██╗",
  "██╔██╗ ██║██████╔╝ ╚███╔╝     ██║     ███████║██████╔╝██║  ██║",
  "██║╚██╗██║██╔═══╝  ██╔██╗     ██║     ██╔══██║██╔══██╗██║  ██║",
  "██║ ╚████║██║     ██╔╝ ██╗    ╚██████╗██║  ██║██║  ██║██████╔╝",
  "╚═╝  ╚═══╝╚═╝     ╚═╝  ╚═╝     ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ",
];

const SHADES = ["#00e5ff", "#2ed3f7", "#5cc1ee", "#8aafe6", "#b89ddd", "#e68bd5"];

export function banner() {
  console.log("");
  ART.forEach((line, i) => console.log(chalk.hex(SHADES[i % SHADES.length])(line)));
  console.log(chalk.dim("  mint your own `npx <you>` business card\n"));
}
