// Copy the self-hosted Geist fonts from node_modules into public/fonts.
// The app has no bundler, so the static files are served straight from public/.
// Run after bumping @fontsource-variable/geist{,-mono}: `npm run fonts`.
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const pkg of ["geist", "geist-mono"]) {
  const src = join(root, "node_modules/@fontsource-variable", pkg);
  const dest = join(root, "public/fonts", pkg);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(join(dest, "files"), { recursive: true });
  cpSync(join(src, "index.css"), join(dest, "index.css"));
  cpSync(join(src, "LICENSE"), join(dest, "LICENSE"));
  for (const f of readdirSync(join(src, "files"))) {
    if (f.endsWith("-wght-normal.woff2")) cpSync(join(src, "files", f), join(dest, "files", f));
  }
}
console.log("Fonts copied to public/fonts");
