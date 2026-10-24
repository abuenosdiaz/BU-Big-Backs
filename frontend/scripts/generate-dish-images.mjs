// Generates an AI photo for every dish on the menu API that doesn't have one yet.
//
//   npm run images                 every dish in the API's data
//   npm run images -- --limit 20   only the first 20 missing dishes
//
// Needs POLLINATIONS_KEY (an sk_ key from https://enter.pollinations.ai) in frontend/.env
// and the backend running (backend/server.py). Photos go to public/dishes/ai/<slug>.jpg and
// the generated slugs to src/lib/dish-images.json, which dishImage() reads.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "dishes", "ai");
const MANIFEST = join(ROOT, "src", "lib", "dish-images.json");
const MODEL = "tongyi-mai/z-image-turbo";

function readEnv(name) {
  if (process.env[name]) return process.env[name];
  const file = join(ROOT, ".env");
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith(`${name}=`) || l.trim().startsWith(`${name} =`));
  return line?.slice(line.indexOf("=") + 1).trim().replace(/^"|"$/g, "") || undefined;
}

/** Same slug rule as dishSlug() in src/lib/dishes.ts. */
const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const key = readEnv("POLLINATIONS_KEY");
if (!key) {
  console.error("Missing POLLINATIONS_KEY. Add it to frontend/.env (get one at https://enter.pollinations.ai).");
  process.exit(1);
}
const api = (readEnv("API_URL") ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

const res = await fetch(`${api}/api/menu`).catch(() => null);
if (!res?.ok) {
  console.error(`Couldn't reach the menu API at ${api}. Start backend/server.py first.`);
  process.exit(1);
}
const { rows } = await res.json();

const dishes = new Map();
for (const r of rows) {
  const s = slug(r.item_name);
  if (s && !dishes.has(s)) dishes.set(s, r);
}

mkdirSync(OUT_DIR, { recursive: true });
const done = new Set(existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : []);
const todo = [...dishes.entries()].filter(([s]) => !done.has(s)).slice(0, limit);
console.log(`${dishes.size} dishes, ${done.size} already have photos, generating ${todo.length}.`);

const saveManifest = () => writeFileSync(MANIFEST, `${JSON.stringify([...done].sort(), null, 2)}\n`);
let failed = 0;

for (const [i, [s, r]] of todo.entries()) {
  const desc = r.description && r.description !== "null" ? `, ${r.description}` : "";
  const prompt = `${r.item_name}${desc}. Served on a plate in a college dining hall. Appetizing realistic food photography, natural light, no text.`;
  const url = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?model=${MODEL}&width=800&height=600&seed=1`;
  const img = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  if (!img.ok) {
    failed++;
    console.warn(`[${i + 1}/${todo.length}] ${r.item_name}: failed (${img.status}) ${(await img.text()).slice(0, 200)}`);
    if (img.status === 401 || img.status === 402 || img.status === 403) break;
    continue;
  }
  writeFileSync(join(OUT_DIR, `${s}.jpg`), Buffer.from(await img.arrayBuffer()));
  done.add(s);
  saveManifest();
  console.log(`[${i + 1}/${todo.length}] ${r.item_name}`);
}

saveManifest();
console.log(`Done. ${done.size} dishes have photos${failed ? `, ${failed} failed` : ""}.`);
