import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { withManifestLock } from './manifest-lock.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const MANIFEST_FILE = path.join(ROOT, 'covers', 'manifest.json');
const WEB_DIR = path.join(ROOT, 'covers', 'web');
const CATALOGUE_URL = 'https://www.eyrolles.com/Accueil/Editeur/3918/calvage-et-mounet/';
const USER_AGENT = 'BibliothequeScientifique/1.0 (https://github.com/girianshiido/bibliotheque-livres-sciences; cover catalogue)';
const PAGE_COUNT = 7;
const PAGE_DELAY_MS = 450;
// Certaines anciennes notices restent disponibles à l’ISBN, sans apparaître dans
// les pages actuelles du catalogue éditeur. Ces liens ont été vérifiés à la main.
const PRODUCT_OVERRIDES = {
  B0077: {
    title: 'Calculabilité',
    url: 'https://www.eyrolles.com/Sciences/Livre/calculabilite-9782916352961/',
    imageUrl: 'https://servimg.eyrolles.com/static/media/2961/9782916352961_internet_h1400.jpg',
    authors: ['Benoît Monin', 'Ludovic Patey']
  }
};

function decode(value = '') {
  return value.replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è').replace(/&ecirc;/g, 'ê').replace(/&agrave;/g, 'à').replace(/&ccedil;/g, 'ç');
}

function normalize(value = '') {
  return decode(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function titleScore(left, right) {
  const ignored = new Set(['de', 'des', 'du', 'et', 'en', 'la', 'le', 'les', 'un', 'une', 'pour', 'sur', 'aux', 'tome', 'volume', 'edition']);
  const a = new Set(normalize(left).split(' ').filter(word => word.length > 1 && !ignored.has(word)));
  const b = new Set(normalize(right).split(' ').filter(word => word.length > 1 && !ignored.has(word)));
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return a.size && b.size ? (2 * shared) / (a.size + b.size) : 0;
}

function volume(value = '') {
  const normalized = normalize(value);
  const number = normalized.match(/(?:vol(?:ume)?|tome)\s*(\d+)/)?.[1];
  if (number) return number;
  const roman = normalized.match(/(?:vol(?:ume)?|tome)\s*(i{1,3}|iv|vi{0,3}|ix|x)\b/)?.[1];
  return ({ i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' })[roman] || null;
}

function authorLastNames(book) {
  return (book.authors || []).map(author => normalize(author.replace(/\([^)]*\)/g, '')).split(' ').filter(Boolean).at(-1)).filter(Boolean);
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
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return { width: (bytes[offset + 5] << 8) | bytes[offset + 6], height: (bytes[offset + 3] << 8) | bytes[offset + 4] };
    offset += length;
  }
  return null;
}

function pngDimensions(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (signature.some((value, index) => bytes[index] !== value) || bytes.length < 24) return null;
  return { width: (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19], height: (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23] };
}

function imageInfo(bytes) {
  const jpeg = jpegDimensions(bytes);
  if (jpeg) return { ...jpeg, extension: 'jpg', format: 'image/jpeg' };
  const png = pngDimensions(bytes);
  if (png) return { ...png, extension: 'png', format: 'image/png' };
  return null;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Eyrolles HTTP ${response.status}`);
  return response.text();
}

function parseProducts(html) {
  return html.split('<div class="row w-100 result-line').slice(1).flatMap(block => {
    const title = block.match(/<a aria-label="([^"]+)" href="([^"]+)"/);
    const image = block.match(/<img[^>]+src="\/\/([^"]+_internet_b200x200\.jpg)"/);
    const authorSection = block.match(/Auteur\s*:\s*([\s\S]*?)<\/p>/)?.[1] || '';
    const authors = [...authorSection.matchAll(/>([^<>]+)<\/a>/g)].map(([, author]) => decode(author.trim()));
    if (!title || !image || !authors.length) return [];
    return [{ title: decode(title[1]), url: new URL(title[2], 'https://www.eyrolles.com').href, imageUrl: `https://${image[1].replace('b200x200', 'b400x400')}`, authors }];
  });
}

async function catalogueProducts() {
  const products = new Map();
  for (let page = 1; page <= PAGE_COUNT; page += 1) {
    const url = page === 1 ? CATALOGUE_URL : `${CATALOGUE_URL}?page=${page}`;
    for (const product of parseProducts(await fetchText(url))) products.set(product.url, product);
    await new Promise(resolve => setTimeout(resolve, PAGE_DELAY_MS));
  }
  if (!products.size) throw new Error('Le catalogue Eyrolles n’a renvoyé aucune notice exploitable.');
  return [...products.values()];
}

function matchBook(book, products) {
  if (PRODUCT_OVERRIDES[book.id]) return { product: PRODUCT_OVERRIDES[book.id], score: 1 };
  const expectedVolume = volume(book.details);
  const expectedAuthors = authorLastNames(book);
  return products
    .map(product => {
      const productAuthors = normalize(product.authors.join(' '));
      return { product, score: titleScore(book.title, product.title), productVolume: volume(product.title), authorsMatch: expectedAuthors.every(author => productAuthors.includes(author)) };
    })
    .filter(candidate => candidate.score >= .40)
    .filter(candidate => !expectedVolume || candidate.productVolume === expectedVolume)
    .filter(candidate => candidate.authorsMatch || candidate.score >= .95)
    .sort((a, b) => b.score - a.score)[0];
}

function closestProduct(book, products) {
  const expectedAuthors = authorLastNames(book);
  return products
    .map(product => ({ product, score: titleScore(book.title, product.title), authorsMatch: expectedAuthors.every(author => normalize(product.authors.join(' ')).includes(author)), productVolume: volume(product.title) }))
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
    const books = Object.values(manifest.books).filter(book => /Calvage/.test(book.publisher) && !book.cover?.webPath);
    await mkdir(WEB_DIR, { recursive: true });
    let downloaded = 0;
    const unmatched = [];
    for (const book of books) {
      const candidate = matchBook(book, products);
      if (!candidate) {
        const closest = closestProduct(book, products);
        if (closest) process.stderr.write(`${book.id} : meilleure piste « ${closest.product.title} » (${closest.score.toFixed(2)}, auteurs ${closest.authorsMatch ? 'confirmés' : 'différents'}) — ${closest.product.url}\n`);
        unmatched.push(book.id);
        continue;
      }
      const response = await fetch(candidate.product.imageUrl, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) });
      const bytes = new Uint8Array(await response.arrayBuffer());
      const image = response.ok ? imageInfo(bytes) : null;
      if (!image?.width || !image.height) { unmatched.push(book.id); continue; }
      const webPath = `covers/web/${book.id}.${image.extension}`;
      await writeFile(path.join(ROOT, webPath), bytes);
      book.cover = { webPath, provider: 'Eyrolles (diffuseur Calvage & Mounet)', sourcePage: candidate.product.url, sourceUrl: candidate.product.imageUrl, width: image.width, height: image.height, aspectRatio: Number((image.width / image.height).toFixed(5)), format: image.format };
      book.review = ['cover-downloaded', 'publisher-title-and-author-matched'];
      downloaded += 1;
      await new Promise(resolve => setTimeout(resolve, PAGE_DELAY_MS));
    }
    await save(manifest);
    process.stdout.write(`${downloaded} couvertures Calvage & Mounet téléchargées via Eyrolles ; ${unmatched.length} notices sans correspondance automatique : ${unmatched.join(', ') || 'aucune'}.\n`);
  });
}

main().catch(error => { console.error(`Échec : ${error.message}`); process.exitCode = 1; });
