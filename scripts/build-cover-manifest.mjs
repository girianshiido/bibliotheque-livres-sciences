import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { withManifestLock } from './manifest-lock.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CATALOGUE_DIR = path.join(ROOT, 'catalogue');
const COVERS_DIR = path.join(ROOT, 'covers');
const OUTPUT_FILE = path.join(COVERS_DIR, 'manifest.json');

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

async function recoverLocalCover(id, existing) {
  if (existing.cover) return existing.cover;
  const webPath = `covers/web/${id}.jpg`;
  const bytes = await readFile(path.join(ROOT, webPath)).catch(() => null);
  const dimensions = bytes && jpegDimensions(bytes);
  const identifier = existing.identifiers?.find(item => item.type === 'ISBN-13');
  if (!dimensions || !identifier) return null;
  return {
    webPath,
    provider: 'Springer Nature Cover Search',
    sourceUrl: `https://covers.springernature.com/books/jpg_height_648_pixels/${identifier.value}.jpg`,
    isbn13: identifier.value,
    width: dimensions.width,
    height: dimensions.height,
    aspectRatio: Number((dimensions.width / dimensions.height).toFixed(5)),
    format: 'image/jpeg'
  };
}

function stripMarkdown(value = '') {
  const trimmed = value.trim();
  return trimmed.startsWith('*') && trimmed.endsWith('*') ? trimmed.slice(1, -1).trim() : trimmed;
}

function parseBook(line, sourceFile) {
  const idMatch = line.match(/^- \*\*(B\d{4})\*\* — /);
  if (!idMatch) return null;
  const body = line.slice(idMatch[0].length);
  const authorSeparator = body.indexOf(' — *');
  if (authorSeparator < 0) return null;
  const titleAndRest = body.slice(authorSeparator + 3);
  const titleSeparator = Math.max(titleAndRest.lastIndexOf('* — '), titleAndRest.lastIndexOf('* - '));
  if (titleSeparator < 0) return null;
  const bibliography = titleAndRest.slice(titleSeparator + 4).trim().split(' — MSC')[0];
  const [publisher = 'Éditeur non indiqué', ...details] = bibliography.split(' — ').map(value => stripMarkdown(value));
  return {
    id: idMatch[1],
    title: stripMarkdown(titleAndRest.slice(0, titleSeparator + 1)),
    authors: stripMarkdown(body.slice(0, authorSeparator)).split(';').map(author => author.trim()).filter(Boolean),
    publisher,
    details: details.join(' — '),
    sourceFile
  };
}

async function catalogueBooks() {
  const files = (await readdir(CATALOGUE_DIR)).filter(file => file.endsWith('.md')).sort();
  const books = [];
  for (const file of files) {
    const text = await readFile(path.join(CATALOGUE_DIR, file), 'utf8');
    books.push(...text.split(/\r?\n/).map(line => parseBook(line, `catalogue/${file}`)).filter(Boolean));
  }
  return books;
}

async function main() {
  await withManifestLock(async () => {
    const prior = await readFile(OUTPUT_FILE, 'utf8').then(JSON.parse).catch(() => ({ books: {} }));
    const books = Object.fromEntries(await Promise.all((await catalogueBooks()).map(async book => {
    const existing = prior.books?.[book.id] || {};
    const cover = await recoverLocalCover(book.id, existing);
    return [book.id, {
      ...book,
      identifiers: existing.identifiers || (existing.isbn13 ? [{
        value: existing.isbn13,
        type: 'ISBN-13',
        evidence: existing.isbnEvidence || null
      }] : []),
      cover,
      review: cover ? existing.review || ['cover-downloaded', 'edition-linked-by-isbn'] : existing.review || ['isbn-required']
    }];
    })));
    const manifest = {
      schemaVersion: 1,
      description: 'Inventaire des couvertures : toute image locale doit être liée à une édition vérifiée.',
      books
    };
    await mkdir(COVERS_DIR, { recursive: true });
    const temp = `${OUTPUT_FILE}.tmp`;
    await writeFile(temp, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await rename(temp, OUTPUT_FILE);
    process.stdout.write(`${Object.keys(books).length} notices écrites dans covers/manifest.json.\n`);
  });
}

main().catch(error => {
  console.error(`Échec : ${error.message}`);
  process.exitCode = 1;
});
