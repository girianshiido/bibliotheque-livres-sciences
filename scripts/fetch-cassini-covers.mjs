import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { withManifestLock } from './manifest-lock.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const MANIFEST_FILE = path.join(ROOT, 'covers', 'manifest.json');
const WEB_DIR = path.join(ROOT, 'covers', 'web');
const USER_AGENT = 'BibliothequeScientifique/1.0 (https://github.com/girianshiido/bibliotheque-livres-sciences; cover catalogue)';
const MAX_PAGES = 20;
const PAGE_DELAY_MS = 450;

function decode(value = '') {
  return value.replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è').replace(/&ecirc;/g, 'ê').replace(/&agrave;/g, 'à').replace(/&ccedil;/g, 'ç');
}

function normalize(value = '') {
  return decode(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function titleScore(left, right) {
  const ignored = new Set(['de', 'des', 'du', 'et', 'en', 'la', 'le', 'les', 'un', 'une', 'pour', 'sur', 'aux', 'vol', 'volume', 'serie', 'nouvelle']);
  const a = new Set(normalize(left).split(' ').filter(word => word.length > 1 && !ignored.has(word)));
  const b = new Set(normalize(right).split(' ').filter(word => word.length > 1 && !ignored.has(word)));
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return a.size && b.size ? (2 * shared) / (a.size + b.size) : 0;
}

function volume(value = '') {
  return normalize(value).match(/(?:vol|volume|tome)\s*(\d+)/)?.[1] || null;
}

function jpegDimensions(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  for (let offset = 2; offset + 9 < bytes.length;) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { width: (bytes[offset + 5] << 8) | bytes[offset + 6], height: (bytes[offset + 3] << 8) | bytes[offset + 4] };
    }
    offset += length;
  }
  return null;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Cassini HTTP ${response.status}`);
  return response.text();
}

async function catalogueProducts() {
  const products = new Map();
  let emptyPages = 0;
  for (let page = 1; page <= MAX_PAGES && emptyPages < 2; page += 1) {
    const html = await fetchText(`https://store.cassini.fr/fr/21-tous-les-titres?p=${page}`);
    const matches = [...html.matchAll(/<a class="product-name" href="([^"]+)" title="([^"]+)"/g)];
    if (!matches.length) {
      emptyPages += 1;
      continue;
    }
    emptyPages = 0;
    for (const [, url, title] of matches) products.set(url, { url, title: decode(title) });
    await new Promise(resolve => setTimeout(resolve, PAGE_DELAY_MS));
  }
  if (!products.size) throw new Error('Le catalogue Cassini n’a renvoyé aucune fiche produit exploitable.');
  return [...products.values()];
}

function matchBook(book, products) {
  const expectedVolume = volume(book.details);
  return products
    .map(product => ({ product, score: titleScore(book.title, product.title), productVolume: volume(product.title) }))
    .filter(candidate => candidate.score >= .80)
    .filter(candidate => !expectedVolume || candidate.productVolume === expectedVolume)
    .sort((a, b) => b.score - a.score)[0];
}

async function save(manifest) {
  const temporary = `${MANIFEST_FILE}.tmp`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await rename(temporary, MANIFEST_FILE);
}

async function main() {
  await withManifestLock(async () => {
    const manifest = JSON.parse(await readFile(MANIFEST_FILE, 'utf8'));
    const products = await catalogueProducts();
    const books = Object.values(manifest.books).filter(book => book.publisher === 'Cassini' && !book.cover?.webPath);
    await mkdir(WEB_DIR, { recursive: true });
    let downloaded = 0;
    const unmatched = [];
    for (const book of books) {
      const candidate = matchBook(book, products);
      if (!candidate) {
        unmatched.push(book.id);
        continue;
      }
      const page = await fetchText(candidate.product.url);
      const sourceUrl = page.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
      if (!sourceUrl) {
        process.stderr.write(`${book.id} : image absente de la page produit.\n`);
        unmatched.push(book.id);
        continue;
      }
      const response = await fetch(sourceUrl, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) });
      const bytes = new Uint8Array(await response.arrayBuffer());
      const dimensions = response.ok && response.headers.get('content-type')?.startsWith('image/jpeg') ? jpegDimensions(bytes) : null;
      if (!dimensions?.width || !dimensions.height) {
        process.stderr.write(`${book.id} : image Cassini invalide (${response.status}, ${response.headers.get('content-type') || 'sans type'}).\n`);
        unmatched.push(book.id);
        continue;
      }
      const webPath = `covers/web/${book.id}.jpg`;
      await writeFile(path.join(ROOT, webPath), bytes);
      book.cover = { webPath, provider: 'Éditions Cassini', sourcePage: candidate.product.url, sourceUrl, width: dimensions.width, height: dimensions.height, aspectRatio: Number((dimensions.width / dimensions.height).toFixed(5)), format: 'image/jpeg' };
      book.review = ['cover-downloaded', 'publisher-title-matched'];
      downloaded += 1;
      await new Promise(resolve => setTimeout(resolve, PAGE_DELAY_MS));
    }
    await save(manifest);
    process.stdout.write(`${downloaded} couvertures Cassini téléchargées ; ${unmatched.length} notices sans correspondance automatique : ${unmatched.join(', ') || 'aucune'}.\n`);
  });
}

main().catch(error => { console.error(`Échec : ${error.message}`); process.exitCode = 1; });
