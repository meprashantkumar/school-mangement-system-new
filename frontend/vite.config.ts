import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * The few branding values needed outside React — in the manifest and in the raw
 * index.html. Defaults mirror src/lib/school.ts so both agree.
 */
const schoolBrand = (env: Record<string, string>) => {
  const pick = (v: string | undefined, fallback: string) => (v && v.trim()) || fallback;
  const name = pick(env.VITE_SCHOOL_NAME, "R K Public School");
  const place = pick(env.VITE_SCHOOL_PLACE, "Garhwa");
  return {
    name,
    place,
    shortName: pick(env.VITE_SCHOOL_SHORT_NAME, "RKPS"),
    fullName: pick(env.VITE_SCHOOL_FULL_NAME, place ? `${name}, ${place}` : name),
  };
};

/**
 * Rewrites the branding baked into index.html itself: the <title>, the meta
 * description, and the iOS home-screen label.
 *
 * main.tsx already sets these from the same env values, but only once React has
 * booted. The raw HTML is what a WhatsApp link preview and a search engine read,
 * and it is what shows in the tab for the first moment of every page load — so
 * without this every school on a box served the first school's name.
 */
const schoolHtml = (env: Record<string, string>): Plugin => {
  const brand = schoolBrand(env);
  // These end up inside a double-quoted attribute and an element's text.
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const description =
    `${brand.fullName} — parent & staff portal for fees, receipts and school updates.`;

  return {
    name: "sfms-school-html",
    // "pre" so the values are in place before Vite's own HTML handling runs.
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return html
          .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(brand.fullName)}</title>`)
          .replace(
            /<meta\s+name="description"\s+content="[\s\S]*?"\s*\/?>/,
            `<meta name="description" content="${esc(description)}" />`
          )
          .replace(
            /<meta\s+name="apple-mobile-web-app-title"\s+content="[\s\S]*?"\s*\/?>/,
            `<meta name="apple-mobile-web-app-title" content="${esc(brand.shortName)}" />`
          );
      },
    },
  };
};

/**
 * Emits the PWA manifest so staff can install the site as an app: one icon on the
 * home screen, opening with no browser address bar (display: "standalone").
 *
 * It's generated rather than a static file in public/ because the name and colours
 * follow each school's VITE_SCHOOL_* values — the same reason the branding is baked
 * in at build time. Defaults mirror the fallbacks in src/lib/school.ts, so an unset
 * env still produces a valid manifest.
 *
 * The icons themselves live in public/ — regenerate them per school with
 * `node scripts/make-pwa-icons.mjs`.
 */
const pwaManifest = (env: Record<string, string>): Plugin => {
  const pick = (v: string | undefined, fallback: string) => (v && v.trim()) || fallback;
  const brand = schoolBrand(env);
  const manifest = {
    id: "/",
    name: brand.name,
    short_name: brand.shortName,
    description: pick(env.VITE_SCHOOL_TAGLINE, "Nurturing knowledge, character & confidence."),
    // Land on /login: when already signed in it redirects straight to the dashboard
    // for that role, so a teacher goes icon -> attendance with nothing to type.
    start_url: "/login",
    scope: "/",
    display: "standalone",
    theme_color: "#286BE6", // --primary, tints the Android status bar
    background_color: "#FCFAF8", // --background, so the splash doesn't flash white
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  const json = JSON.stringify(manifest, null, 2);

  return {
    name: "sfms-pwa-manifest",
    // Dev server: serve it from memory so installing works on localhost too.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] === "/manifest.webmanifest") {
          res.setHeader("Content-Type", "application/manifest+json");
          res.end(json);
          return;
        }
        next();
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "manifest.webmanifest", source: json });
    },
  };
};

export default defineConfig(({ mode }) => {
  // "" prefix = load every var, not just VITE_*; only VITE_SCHOOL_* is read here.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), schoolHtml(env), pwaManifest(env)],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5173,
      proxy: {
        // Proxy API calls to the Express server in dev (one origin, no CORS hassle).
        "/api": {
          target: "http://localhost:5000",
          changeOrigin: true,
        },
      },
    },
  };
});
