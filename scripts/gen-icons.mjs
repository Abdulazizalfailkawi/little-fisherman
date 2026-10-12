// Renders the PWA / iOS home-screen icons from public/icons/icon.svg.
// Run: node scripts/gen-icons.mjs   (uses sharp, installed with Next.js)
import sharp from "sharp";
import { readFile } from "node:fs/promises";

const svg = await readFile(new URL("../public/icons/icon.svg", import.meta.url));
const out = (n) => new URL(`../public/icons/${n}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  await sharp(svg, { density: 300 }).resize(size, size).png().toFile(decodeURIComponent(out(name)));
}
// Maskable: add safe-zone padding
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#081426" } })
  .composite([{ input: await sharp(svg, { density: 300 }).resize(410, 410).png().toBuffer(), gravity: "center" }])
  .png()
  .toFile(decodeURIComponent(out("icon-maskable-512.png")));
console.log("icons written");
