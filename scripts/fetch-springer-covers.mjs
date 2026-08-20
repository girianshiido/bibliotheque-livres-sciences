import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
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

function springerUrl(isbn13) {
  return `https://covers.springernature.com/books/jpg_height_648_pixels/${isbn13}.jpg`;
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
    .filter(book => !book.review?.includes('cover-not-available-springer'))
    .filter(book => book.identifiers?.some(identifier => identifier.type === 'ISBN-13'))
    .slice(0, limit);
  await mkdir(WEB_DIR, { recursive: true });

  let downloaded = 0;
  for (const [index, book] of books.entries()) {
    let found = false;
    for (const identifier of book.identifiers.filter(identifier => identifier.type === 'ISBN-13')) {
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
    if (!found) book.review = ['cover-not-available-springer'];
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
