import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { withManifestLock } from './manifest-lock.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const MANIFEST_FILE = path.join(ROOT, 'covers', 'manifest.json');
const WEB_DIR = path.join(ROOT, 'covers', 'web');
const DELAY_MS = 900;
const USER_AGENT = 'BibliothequeScientifique/1.0 (https://github.com/girianshiido/bibliotheque-livres-sciences; cover catalogue)';
const args = process.argv.slice(2);
const limit = Math.max(1, Number(args[args.indexOf('--limit') + 1]) || Infinity);
const onlyId = args.includes('--id') ? args[args.indexOf('--id') + 1] : null;
const execFileAsync = promisify(execFile);

function springerUrl(isbn13) {
  return `https://covers.springernature.com/books/jpg_height_648_pixels/${isbn13}.jpg`;
}

function normalize(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function titleScore(left, right) {
  const ignored = new Set(['a', 'an', 'and', 'de', 'des', 'du', 'en', 'et', 'for', 'in', 'la', 'le', 'les', 'of', 'on', 'the', 'to', 'une']);
  const a = new Set(normalize(left).split(' ').filter(word => word.length > 1 && !ignored.has(word)));
  const b = new Set(normalize(right).split(' ').filter(word => word.length > 1 && !ignored.has(word)));
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return a.size && b.size ? (2 * shared) / (a.size + b.size) : 0;
}

function authorLastNames(book) {
  return (book.authors || []).map(author => normalize(author).split(' ').filter(Boolean).at(-1)).filter(Boolean);
}

function officialSearchMatches(book, result) {
  const expectedTitle = normalize(book.title);
  const actualTitle = normalize(result.title);
  const actualAuthors = normalize(result.authors);
  const exactMainTitle = actualTitle.split(' ').length >= 3 && expectedTitle.startsWith(actualTitle);
  return (exactMainTitle || titleScore(book.title, result.title) >= .88)
    && authorLastNames(book).every(name => actualAuthors.includes(name));
}

function parseSpringerSearch(html) {
  return html.split('<li class="app-card-open').slice(1).flatMap(fragment => {
    const card = fragment.split('</li>')[0];
    const book = card.match(/<a href="(\/book\/[^\"]+)"[^>]*>[\s\S]*?<span>([^<]+)<\/span>/);
    const authors = card.match(/data-test="authors">\s*([^<]+)/);
    const cover = card.match(/cover\/book\/([0-9-]+)\.jpg/);
    if (!book || !authors || !cover) return [];
    return [{
      productUrl: new URL(book[1], 'https://link.springer.com').href,
      title: book[2].replace(/&amp;/g, '&').trim(),
      authors: authors[1].replace(/&amp;/g, '&').trim(),
      isbn13: cover[1].replace(/-/g, '')
    }];
  });
}

async function findOnSpringerLink(book) {
  const url = new URL('https://link.springer.com/search');
  url.searchParams.set('query', `${book.title} ${book.authors.join(' ')}`);
  // SpringerLink redirige les requêtes fetch vers son portail d'identité, tandis
  // que sa recherche publique est accessible via une requête HTTP classique.
  const { stdout } = await execFileAsync('curl', ['-fsSL', url.href], { timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  return parseSpringerSearch(stdout).find(result => officialSearchMatches(book, result)) || null;
}

function jpegDimensions(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  for (let offset = 2; offset + 9 < bytes.length;) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + length + 2 > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { width: (bytes[offset + 7] << 8) | bytes[offset + 8], height: (bytes[offset + 5] << 8) | bytes[offset + 6] };
    }
    offset += length + 2;
  }
  return null;
}

async function save(manifest) {
  const temporary = `${MANIFEST_FILE}.tmp`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await rename(temporary, MANIFEST_FILE);
}

async function download(isbn13, attempt = 1) {
  const response = await fetch(springerUrl(isbn13), {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(20000)
  }).catch(error => ({ ok: false, status: 0, error }));
  if (!response.ok) {
    if (attempt < 3 && (!response.status || response.status === 429 || response.status >= 500)) {
      await new Promise(resolve => setTimeout(resolve, attempt * 1800));
      return download(isbn13, attempt + 1);
    }
    return null;
  }
  if (!response.headers.get('content-type')?.startsWith('image/jpeg')) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  const dimensions = jpegDimensions(bytes);
  return dimensions?.width && dimensions.height ? { bytes, dimensions, sourceUrl: springerUrl(isbn13) } : null;
}

async function main() {
  await withManifestLock(async () => {
  const manifest = JSON.parse(await readFile(MANIFEST_FILE, 'utf8'));
  const books = Object.values(manifest.books)
    .filter(book => /springer|birkh/i.test(book.publisher))
    .filter(book => !onlyId || book.id === onlyId)
    .filter(book => !book.cover?.webPath)
    .filter(book => onlyId || !book.review?.some(flag => /^cover-not-available-springer/.test(flag)))
    .slice(0, limit);
  await mkdir(WEB_DIR, { recursive: true });

  let downloaded = 0;
    for (const [index, book] of books.entries()) {
      let found = false;
    for (const identifier of (book.identifiers || []).filter(identifier => identifier.type === 'ISBN-13')) {
      const result = await download(identifier.value);
      if (!result) continue;
      const relativePath = `covers/web/${book.id}.jpg`;
      await writeFile(path.join(ROOT, relativePath), result.bytes);
      book.cover = {
        webPath: relativePath,
        provider: 'Springer Nature Cover Search',
        sourceUrl: result.sourceUrl,
        isbn13: identifier.value,
        width: result.dimensions.width,
        height: result.dimensions.height,
        aspectRatio: Number((result.dimensions.width / result.dimensions.height).toFixed(5)),
        format: 'image/jpeg'
      };
      book.review = ['cover-downloaded', 'edition-linked-by-isbn'];
      downloaded += 1;
      found = true;
      break;
    }
    if (!found) {
      const official = await findOnSpringerLink(book).catch(() => null);
      const result = official && await download(official.isbn13);
      if (result) {
        const relativePath = `covers/web/${book.id}.jpg`;
        await writeFile(path.join(ROOT, relativePath), result.bytes);
        book.identifiers = [...(book.identifiers || []).filter(identifier => identifier.type !== 'ISBN-13'), {
          value: official.isbn13,
          type: 'ISBN-13',
          evidence: {
            provider: 'SpringerLink',
            title: official.title,
            authors: official.authors.split(/\s*,\s*/),
            publisher: 'Springer Nature',
            url: official.productUrl
          }
        }];
        book.cover = {
          webPath: relativePath,
          provider: 'Springer Nature / SpringerLink',
          sourcePage: official.productUrl,
          sourceUrl: result.sourceUrl,
          isbn13: official.isbn13,
          width: result.dimensions.width,
          height: result.dimensions.height,
          aspectRatio: Number((result.dimensions.width / result.dimensions.height).toFixed(5)),
          format: 'image/jpeg'
        };
        book.review = ['cover-downloaded', 'edition-linked-by-springerlink-search'];
        downloaded += 1;
        found = true;
      }
    }
    if (!found) book.review = ['cover-not-available-springerlink'];
    await save(manifest);
    process.stdout.write(`\r${index + 1}/${books.length} couvertures demandées — ${downloaded} téléchargées`);
    if (index + 1 < books.length) await new Promise(resolve => setTimeout(resolve, DELAY_MS));
  }
  process.stdout.write(`\nTerminé : ${downloaded}/${books.length} couvertures Springer téléchargées et liées à une édition.\n`);
  });
}

main().catch(error => {
  console.error(`\nÉchec : ${error.message}`);
  process.exitCode = 1;
});
