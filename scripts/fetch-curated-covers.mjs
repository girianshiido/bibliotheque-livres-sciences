import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { withManifestLock } from './manifest-lock.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const MANIFEST_FILE = path.join(ROOT, 'covers', 'manifest.json');
const SOURCES_FILE = path.join(ROOT, 'covers', 'curated-sources.json');
const WEB_DIR = path.join(ROOT, 'covers', 'web');
const USER_AGENT = 'BibliothequeScientifique/1.0 (https://github.com/girianshiido/bibliotheque-livres-sciences; cover catalogue)';

function jpegDimensions(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  for (let offset = 2; offset + 9 < bytes.length;) {
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + length + 2 > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { width: (bytes[offset + 7] << 8) | bytes[offset + 8], height: (bytes[offset + 5] << 8) | bytes[offset + 6] };
    }
    offset += length + 2;
  }
  return null;
}

function pngDimensions(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (signature.some((value, index) => bytes[index] !== value)) return null;
  if (bytes.length < 24 || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') return null;
  return {
    width: ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0,
    height: ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0
  };
}

function inspectImage(_contentType, bytes) {
  // Quelques CDN conservent une extension ou un en-tête HTTP PNG pour un JPEG :
  // le contenu téléchargé, et non cette indication, fixe donc le format local.
  const jpeg = jpegDimensions(bytes);
  if (jpeg) return { dimensions: jpeg, extension: 'jpg', format: 'image/jpeg' };
  const png = pngDimensions(bytes);
  if (png) return { dimensions: png, extension: 'png', format: 'image/png' };
  return null;
}

async function save(manifest) {
  const temporary = `${MANIFEST_FILE}.tmp`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await rename(temporary, MANIFEST_FILE);
}

async function main() {
  await withManifestLock(async () => {
    const manifest = JSON.parse(await readFile(MANIFEST_FILE, 'utf8'));
    const sources = JSON.parse(await readFile(SOURCES_FILE, 'utf8'));
    await mkdir(WEB_DIR, { recursive: true });
    let downloaded = 0;
    for (const [id, source] of Object.entries(sources)) {
      if (source.enabled === false) continue;
      const book = manifest.books[id];
      if (!book || book.cover?.webPath) continue;
      const isbnKnown = book.identifiers?.some(identifier => identifier.type === 'ISBN-13' && identifier.value === source.isbn13);
      if (!isbnKnown && source.isbnEvidence) {
        book.identifiers = [{ value: source.isbn13, type: 'ISBN-13', evidence: source.isbnEvidence }];
      } else if (!isbnKnown) {
        throw new Error(`${id} : l’ISBN de la source ne correspond pas à une édition vérifiée.`);
      }
      const response = await fetch(source.sourceUrl, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`${id} : image éditeur indisponible.`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const image = inspectImage(response.headers.get('content-type'), bytes);
      const dimensions = image?.dimensions;
      if (!dimensions?.width || !dimensions.height) throw new Error(`${id} : dimensions de l’image invalides.`);
      const webPath = `covers/web/${id}.${image.extension}`;
      await writeFile(path.join(ROOT, webPath), bytes);
      book.cover = {
        webPath,
        provider: source.provider,
        sourcePage: source.sourcePage,
        sourceUrl: source.sourceUrl,
        isbn13: source.isbn13,
        width: dimensions.width,
        height: dimensions.height,
        aspectRatio: Number((dimensions.width / dimensions.height).toFixed(5)),
        format: image.format
      };
      book.review = ['cover-downloaded', 'edition-linked-by-isbn'];
      downloaded += 1;
    }
    await save(manifest);
    process.stdout.write(`${downloaded} couvertures éditoriales contrôlées téléchargées.\n`);
  });
}

main().catch(error => {
  console.error(`Échec : ${error.message}`);
  process.exitCode = 1;
});
