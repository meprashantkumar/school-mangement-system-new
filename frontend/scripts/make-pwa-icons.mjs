/**
 * Generates the PWA / home-screen icons from the school's monogram, so the
 * installed app icon matches the crest shown inside the app.
 *
 * Run it once per school (whenever VITE_SCHOOL_MONOGRAM changes):
 *
 *   node scripts/make-pwa-icons.mjs                  # reads frontend/.env
 *   node scripts/make-pwa-icons.mjs --monogram SA    # or pass it explicitly
 *
 * Writes into frontend/public/, which Vite copies into dist/ as-is.
 * Uses headless Chrome (already on the machine) so there's no image dependency.
 */
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, "..");
const OUT = path.join(FRONTEND, "public");

// Brand gradient + splash colour, matching the Crest component and index.css.
const FROM = "#5794FF"; // --brand-blue  hsl(218 100% 67%)
const TO = "#286BE6"; // --primary     hsl(219 79% 53%)

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

// Monogram: CLI flag > frontend/.env > the app's own default.
const fromEnv = () => {
  try {
    const env = fs.readFileSync(path.join(FRONTEND, ".env"), "utf8");
    const m = env.match(/^VITE_SCHOOL_MONOGRAM=(.*)$/m);
    return m ? m[1].trim() : "";
  } catch {
    return "";
  }
};
const MONOGRAM = (arg("monogram", "") || fromEnv() || "RK").slice(0, 3).toUpperCase();

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const chrome = CHROME_CANDIDATES.find((p) => {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
});
if (!chrome) {
  console.error("No Chrome/Edge found. Set CHROME_PATH to the browser executable.");
  process.exit(1);
}

/**
 * `inset` is the share of the canvas left as breathing room around the letters.
 * Android masks "maskable" icons to a circle/squircle and crops roughly 20% off
 * each edge, so those need the monogram well inside the safe zone.
 */
const page = (size, inset) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body { margin:0; padding:0; width:${size}px; height:${size}px; overflow:hidden; }
  .bg {
    width:${size}px; height:${size}px;
    background: linear-gradient(135deg, ${FROM} 0%, ${TO} 100%);
    display:flex; align-items:center; justify-content:center;
  }
  .m {
    color:#fff; font-weight:800; letter-spacing:-0.02em;
    font-family:"Segoe UI Semibold","Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    font-size:${Math.round(size * (1 - inset * 2) * (MONOGRAM.length > 2 ? 0.42 : 0.58))}px;
    line-height:1;
  }
</style></head><body><div class="bg"><span class="m">${MONOGRAM}</span></div></body></html>`;

const shot = (file, size, inset) => {
  const tmp = path.join(os.tmpdir(), `icon-${size}-${inset}.html`);
  fs.writeFileSync(tmp, page(size, inset));
  const profile = path.join(os.tmpdir(), "sfms-icon-profile");
  execFileSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--user-data-dir=${profile}`,
      `--window-size=${size},${size}`,
      `--screenshot=${path.join(OUT, file)}`,
      "file:///" + tmp.replace(/\\/g, "/"),
    ],
    { stdio: "pipe" }
  );
  fs.rmSync(tmp, { force: true });
  const bytes = fs.statSync(path.join(OUT, file)).size;
  console.log(`  ${file.padEnd(26)} ${size}x${size}  ${bytes.toLocaleString()} bytes`);
};

fs.mkdirSync(OUT, { recursive: true });
console.log(`Generating icons for monogram "${MONOGRAM}" into public/`);
shot("icon-192.png", 192, 0.14);
shot("icon-512.png", 512, 0.14);
shot("icon-maskable-512.png", 512, 0.22); // extra room for Android's mask
shot("apple-touch-icon.png", 180, 0.14); // iOS adds its own rounding
console.log("Done. Re-run this whenever VITE_SCHOOL_MONOGRAM changes.");
