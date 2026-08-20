import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { withManifestLock } from './manifest-lock.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const MANIFEST_FILE = path.join(ROOT, 'covers', 'manifest.json');
const DELAY_MS = 1050;
const USER_AGENT = 'BibliothequeScientifique/1.0 (https://github.com/girianshiido/bibliotheque-livres-sciences; cover catalogue)';
const args = process.argv.slice(2);
const limit = Math.max(1, Number(args[args.indexOf('--limit') + 1]) || Infinity);
const onlyId = args.includes('--id') ? args[args.indexOf('--id') + 1] : null;
const retryAll = args.includes('--retry-all');
const concurrency = Math.min(3, Math.max(1, Number(args[args.indexOf('--concurrency') + 1]) || 1));

function normalize(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function words(value = '') {
  const ignored = new Set(['a', 'an', 'and', 'de', 'des', 'du', 'en', 'et', 'for', 'in', 'la', 'le', 'les', 'of', 'on', 'the', 'to', 'une']);
  return new Set(normalize(value).split(' ').filter(word => word.length > 1 && !ignored.has(word)));
}

function similarity(left, right) {
  const a = words(left);
  const b = words(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

function isbn13(value) {
  const digits = String(value || '').replace(/[^0-9X]/gi, '');
  if (!/^97[89]\d{10}$/.test(digits)) return null;
  const sum = [...digits.slice(0, 12)].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(digits[12]) ? digits : null;
}

function authorMatches(book, candidate) {
  const expected = new Set(book.authors.flatMap(author => [...words(author)]));
  return (candidate.author || []).some(author => [...words(`${author.given || ''} ${author.family || ''}`)].some(word => expected.has(word)));
}

function chooseRecord(book, items) {
  return items
    .filter(item => item.title?.[0] && item.ISBN?.length && /springer|birkh/i.test(item.publisher || ''))
    .map(item => ({ item, titleScore: similarity(book.title, item.title[0]), authorMatch: authorMatches(book, item) }))
    .filter(candidate => candidate.authorMatch && candidate.titleScore >= .88)
    .sort((left, right) => right.titleScore - left.titleScore)[0];
}

async function queryCrossref(book, field = 'query.bibliographic', attempt = 1) {
  const url = new URL('https://api.crossref.org/works');
  url.searchParams.set(field, field === 'query.title' ? book.title : `${book.title} ${book.authors.join(' ')}`);
  url.searchParams.set('select', 'title,author,ISBN,publisher,DOI');
  url.searchParams.set('rows', '8');
  url.searchParams.set('mailto', 'bibliotheque.scientifique@example.invalid');
  try {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Crossref HTTP ${response.status}`);
    return (await response.json()).message.items || [];
  } catch (error) {
    if (attempt < 4) {
      await new Promise(resolve => setTimeout(resolve, attempt * 2000));
      return queryCrossref(book, field, attempt + 1);
    }
    throw error;
  }
}

async function save(manifest) {
  const temp = `${MANIFEST_FILE}.tmp`;
  await writeFile(temp, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await rename(temp, MANIFEST_FILE);
}

async function main() {
  await withManifestLock(async () => {
  const manifest = JSON.parse(await readFile(MANIFEST_FILE, 'utf8'));
  const candidates = Object.values(manifest.books)
    .filter(book => /springer|birkh/i.test(book.publisher))
    .filter(book => !onlyId || book.id === onlyId)
    .filter(book => !book.identifiers?.some(identifier => identifier.type === 'ISBN-13' && identifier.evidence?.provider === 'Crossref'))
    .filter(book => retryAll || !book.review?.includes('isbn-not-found-crossref'))
    .slice(0, limit);

  let resolved = 0;
  let unavailable = 0;
  let completed = 0;
  async function resolveBook(book) {
    try {
      let match = chooseRecord(book, await queryCrossref(book));
      // Les monographies anciennes sont parfois indexées avec une forme d’auteur
      // incompatible avec la requête bibliographique ; le titre exact reste soumis
      // au même contrôle auteur-éditeur avant d’être retenu.
      if (!match) match = chooseRecord(book, await queryCrossref(book, 'query.title'));
      if (match) {
        const values = [...new Set(match.item.ISBN.map(isbn13).filter(Boolean))];
        if (values.length) {
          book.identifiers = values.map(value => ({
            value,
            type: 'ISBN-13',
            evidence: {
              provider: 'Crossref',
              title: match.item.title[0],
              authors: (match.item.author || []).map(author => `${author.given || ''} ${author.family || ''}`.trim()).filter(Boolean),
              publisher: match.item.publisher || null,
              doi: match.item.DOI || null
            }
          }));
          book.review = ['isbn-resolved', 'cover-required'];
          resolved += 1;
        }
      } else {
        book.review = ['isbn-not-found-crossref'];
      }
    } catch {
      // Une indisponibilité de Crossref ne doit pas interrompre les autres notices.
      book.review = ['isbn-source-temporarily-unavailable'];
      unavailable += 1;
    }
  }
  for (let offset = 0; offset < candidates.length; offset += concurrency) {
    const batch = candidates.slice(offset, offset + concurrency);
    await Promise.all(batch.map(resolveBook));
    completed += batch.length;
    await save(manifest);
    process.stdout.write(`\r${completed}/${candidates.length} notices vérifiées — ${resolved} ISBN retenus`);
    if (completed < candidates.length) await new Promise(resolve => setTimeout(resolve, DELAY_MS));
  }
  process.stdout.write(`\nTerminé : ${resolved}/${candidates.length} ISBN retenus avec titre, auteur et éditeur concordants ; ${unavailable} indisponibilités à reprendre.\n`);
  });
}

main().catch(error => {
  console.error(`\nÉchec : ${error.message}`);
  process.exitCode = 1;
});
