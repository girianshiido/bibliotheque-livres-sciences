import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { withManifestLock } from './manifest-lock.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const MANIFEST_FILE = path.join(ROOT, 'covers', 'manifest.json');
const WEB_DIR = path.join(ROOT, 'covers', 'web');
const SITE = 'https://www.calvage-et-mounet.fr';
const USER_AGENT = 'BibliothequeScientifique/1.0 (https://github.com/girianshiido/bibliotheque-livres-sciences; cover catalogue)';
const PAGE_DELAY_MS = 450;
const PAGE_COUNT = 9;
const SITEMAP_PATH = '/plan-du-site';
// Les anciennes notices conservent parfois une graphie différente de celle du catalogue local.
// Chaque lien ci-dessous a été vérifié directement sur la couverture officielle.
const OFFICIAL_PAGE_OVERRIDES = {
  B0080: '/les-clefs-pour-l-info-ismael-belghiti-roger-mansuy-et-jill-jenn-vie',
  B0092: '/formes-quadriques-et-geometries',
  B0225: '/algebre-electique',
  B0227: '/algebre-commutative-methodes-constructives-henri-lombardi-et-claude-quitte',
  B0437: '/ouvrages/articles/alain-debreil-rached-mneimne-lr-groupe-symetriques-s4-et-ses-metamorphoses-une-introduction-a-la-symetrie'
};
const CATEGORY_PATHS = [
  '/ouvrages/categories/tableau-noir-160mm-x-240mm',
  '/ouvrages/categories/mathematiques-en-devenir-157mm-x-234mm',
  '/ouvrages/categories/im-et-ker-157mm-x-234mm',
  '/ouvrages/categories/orizzonti-200mm-x-270mm',
  '/ouvrages/categories/nano-100mm-x-200mm',
  '/ouvrages/categories/la-perle-et-le-harnais-100mm-x-200mm3'
];

function normalize(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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
  return (book.authors || [])
    .map(author => normalize(author.replace(/\([^)]*\)/g, '')).split(' ').filter(Boolean).at(-1))
    .filter(name => name && name !== 'collectif');
}

function pageMatchesAuthors(page, book) {
  const text = normalize(page.replace(/<[^>]*>/g, ' '));
  const names = authorLastNames(book);
  return names.length > 0 && names.every(name => text.includes(name));
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
  if (!response.ok) throw new Error(`Calvage & Mounet HTTP ${response.status}`);
  return response.text();
}

function schemaImageUrl(page) {
  for (const [, json] of page.matchAll(/<script type="application\/ld\+json">\s*({.*?})\s*<\/script>/gs)) {
    try {
      const article = JSON.parse(json);
      if (article['@type'] === 'Article' && typeof article.image === 'string') return article.image;
    } catch {
      // Une donnée structurée mal formée ne doit pas empêcher l'utilisation des autres notices.
    }
  }
  return null;
}

async function catalogueArticles() {
  const articles = new Map();
  const paths = [
    ...Array.from({ length: PAGE_COUNT }, (_, index) => `/ouvrages${index ? `/page/${index + 1}` : ''}`),
    ...CATEGORY_PATHS
  ];
  for (const pathName of paths) {
    const html = await fetchText(`${SITE}${pathName}`);
    for (const [, json] of html.matchAll(/<script type="application\/ld\+json">\s*({.*?})\s*<\/script>/gs)) {
      try {
        const article = JSON.parse(json);
        if (article['@type'] === 'Article' && article.headline && article.image && article.url) {
          articles.set(article.url, { title: article.headline, imageUrl: article.image, url: article.url });
        }
      } catch {
        // Une notice mal formée ne doit pas empêcher le reste du catalogue de charger.
      }
    }
    await new Promise(resolve => setTimeout(resolve, PAGE_DELAY_MS));
  }
  const sitemap = await fetchText(`${SITE}${SITEMAP_PATH}`);
  for (const [, href, title] of sitemap.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    if (!href.startsWith('/')) continue;
    const cleanTitle = title.replace(/<[^>]*>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    if (cleanTitle) {
      const url = new URL(href, SITE).href;
      if (!articles.has(url)) articles.set(url, { title: cleanTitle, url });
    }
  }
  if (!articles.size) throw new Error('Le catalogue Calvage & Mounet n’a renvoyé aucune notice exploitable.');
  return [...articles.values()];
}

function matchBook(book, articles) {
  const override = OFFICIAL_PAGE_OVERRIDES[book.id];
  if (override) return { article: { title: book.title, url: new URL(override, SITE).href }, score: 1, verifiedOverride: true };
  const expectedVolume = volume(book.details);
  return articles
    .map(article => {
      const titleWithoutAuthor = article.title.split(/\s[-–—]\s/)[0];
      return { article, score: Math.max(titleScore(book.title, article.title), titleScore(book.title, titleWithoutAuthor)), articleVolume: volume(article.title) };
    })
    .filter(candidate => candidate.score >= .70)
    .filter(candidate => !expectedVolume || candidate.articleVolume === expectedVolume)
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
    const articles = await catalogueArticles();
    const books = Object.values(manifest.books).filter(book => /Calvage/.test(book.publisher) && !book.cover?.webPath);
    await mkdir(WEB_DIR, { recursive: true });
    let downloaded = 0;
    const unmatched = [];
    for (const book of books) {
      const candidate = matchBook(book, articles);
      if (!candidate) {
        unmatched.push(book.id);
        continue;
      }
      const page = await fetchText(candidate.article.url);
      const authorConfirmed = pageMatchesAuthors(`${candidate.article.title}\n${page}`, book);
      if (!authorConfirmed && candidate.score < .95 && !candidate.verifiedOverride) {
        process.stderr.write(`${book.id} : titre voisin, mais auteurs non confirmés sur la notice officielle.\n`);
        unmatched.push(book.id);
        continue;
      }
      const imageUrl = candidate.article.imageUrl || schemaImageUrl(page);
      if (!imageUrl) {
        process.stderr.write(`${book.id} : la notice officielle ne fournit pas d’image exploitable.\n`);
        unmatched.push(book.id);
        continue;
      }
      const response = await fetch(imageUrl, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) });
      const bytes = new Uint8Array(await response.arrayBuffer());
      const image = response.ok ? imageInfo(bytes) : null;
      if (!image?.width || !image.height) {
        process.stderr.write(`${book.id} : image officielle invalide.\n`);
        unmatched.push(book.id);
        continue;
      }
      const webPath = `covers/web/${book.id}.${image.extension}`;
      await writeFile(path.join(ROOT, webPath), bytes);
      book.cover = { webPath, provider: 'Calvage & Mounet', sourcePage: candidate.article.url, sourceUrl: imageUrl, width: image.width, height: image.height, aspectRatio: Number((image.width / image.height).toFixed(5)), format: image.format };
      book.review = ['cover-downloaded', 'publisher-title-and-author-matched'];
      downloaded += 1;
      await new Promise(resolve => setTimeout(resolve, PAGE_DELAY_MS));
    }
    await save(manifest);
    process.stdout.write(`${downloaded} couvertures Calvage & Mounet téléchargées ; ${unmatched.length} notices sans correspondance automatique : ${unmatched.join(', ') || 'aucune'}.\n`);
  });
}

main().catch(error => { console.error(`Échec : ${error.message}`); process.exitCode = 1; });
