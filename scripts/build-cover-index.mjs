import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CATALOGUE_DIR = path.join(ROOT, 'catalogue');
const OUTPUT_DIR = path.join(ROOT, 'covers');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'index.json');
const PROGRESS_FILE = path.join(OUTPUT_DIR, '.build-progress.json');
const BATCH_SIZE = 8;
const REQUEST_DELAY_MS = 1100;
const USER_AGENT = 'BibliothequeScientifique/1.0 (+https://github.com/girianshiido/bibliotheque-livres-sciences)';

function normalize(value = '') {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value = '') {
  const ignored = new Set(['a', 'an', 'and', 'de', 'des', 'du', 'en', 'et', 'for', 'in', 'la', 'le', 'les', 'of', 'on', 'the', 'to', 'une']);
  return new Set(normalize(value).split(' ').filter(token => token.length > 1 && !ignored.has(token)));
}

function similarity(left, right) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common += 1;
  return (2 * common) / (a.size + b.size);
}

function hasContainedTitle(left, right) {
  const a = [...tokens(left)];
  const b = [...tokens(right)];
  if (Math.min(a.length, b.length) < 2) return false;
  const smaller = a.length <= b.length ? a : b;
  const larger = new Set(a.length <= b.length ? b : a);
  return smaller.every(token => larger.has(token)) && Math.max(a.length, b.length) - smaller.length <= 3;
}

function authorOverlap(expected, candidates = []) {
  const expectedTokens = tokens(expected);
  return candidates.some(candidate => [...tokens(candidate)].some(token => expectedTokens.has(token)));
}

function parseBook(line, sourceFile) {
  const match = line.match(/^- \*\*(B\d{4})\*\* — (.*?) — \*(.*?)\* (?:—|-) (.*)$/);
  if (!match) return null;
  return { id: match[1], authors: match[2], title: match[3], sourceFile };
}

async function readBooks() {
  const files = (await readdir(CATALOGUE_DIR)).filter(file => file.endsWith('.md')).sort();
  const books = [];
  for (const file of files) {
    const text = await readFile(path.join(CATALOGUE_DIR, file), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const book = parseBook(line, `catalogue/${file}`);
      if (book) books.push(book);
    }
  }
  return books;
}

function selectCandidate(book, candidates) {
  const normalizedTitle = normalize(book.title);
  return candidates
    .filter(candidate => candidate.cover_i && candidate.title)
    .map(candidate => {
      const exactTitle = normalize(candidate.title) === normalizedTitle;
      const titleScore = exactTitle ? 1 : similarity(book.title, candidate.title);
      const hasAuthor = authorOverlap(book.authors, candidate.author_name);
      const accepted = exactTitle
        ? hasAuthor || !candidate.author_name?.length
        : hasAuthor && (titleScore >= 0.86 || hasContainedTitle(book.title, candidate.title));
      return { candidate, accepted, score: titleScore + (hasAuthor ? 0.35 : 0) };
    })
    .filter(result => result.accepted)
    .sort((a, b) => b.score - a.score)[0]?.candidate;
}

async function searchBatch(batch, attempt = 1) {
  const query = batch.map(book => `title:"${book.title.replaceAll('"', '\\"')}"`).join(' OR ');
  const url = new URL('https://openlibrary.org/search.json');
  url.searchParams.set('q', query);
  url.searchParams.set('fields', 'key,title,author_name,cover_i,first_publish_year');
  url.searchParams.set('limit', '200');
  let response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(20000)
    });
  } catch (error) {
    if (attempt < 4) {
      await new Promise(resolve => setTimeout(resolve, attempt * 2500));
      return searchBatch(batch, attempt + 1);
    }
    throw error;
  }
  if (!response.ok) {
    if (attempt < 4 && (response.status === 429 || response.status >= 500)) {
      await new Promise(resolve => setTimeout(resolve, attempt * 2500));
      return searchBatch(batch, attempt + 1);
    }
    throw new Error(`Open Library a répondu ${response.status}`);
  }
  return response.json();
}

async function main() {
  const books = await readBooks();
  await mkdir(OUTPUT_DIR, { recursive: true });
  const existingIndex = await readFile(OUTPUT_FILE, 'utf8').then(JSON.parse).catch(() => ({}));
  const progress = await readFile(PROGRESS_FILE, 'utf8').then(JSON.parse).catch(() => ({ offset: 0, index: existingIndex }));
  const index = progress.index || existingIndex;
  const pendingBooks = books.filter(book => !index[book.id]);
  for (let offset = progress.offset || 0; offset < pendingBooks.length; offset += BATCH_SIZE) {
    const batch = pendingBooks.slice(offset, offset + BATCH_SIZE);
    const data = await searchBatch(batch);
    for (const book of batch) {
      const match = selectCandidate(book, data.docs || []);
      if (!match) continue;
      index[book.id] = {
        coverId: match.cover_i,
        workKey: match.key,
        matchedTitle: match.title,
        source: 'Open Library'
      };
    }
    const completed = Math.min(offset + BATCH_SIZE, pendingBooks.length);
    await writeFile(PROGRESS_FILE, `${JSON.stringify({ offset: completed, index }, null, 2)}\n`, 'utf8');
    const completedTotal = books.length - pendingBooks.length + completed;
    process.stdout.write(`\r${completedTotal}/${books.length} notices consultées — ${Object.keys(index).length} couvertures fiables`);
    if (completed < pendingBooks.length) await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
  }

  const temporaryFile = `${OUTPUT_FILE}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  await rename(temporaryFile, OUTPUT_FILE);
  await unlink(PROGRESS_FILE).catch(() => {});
  process.stdout.write(`\nIndex écrit dans ${path.relative(ROOT, OUTPUT_FILE)}.\n`);
}

main().catch(error => {
  console.error(`\nÉchec : ${error.message}`);
  process.exitCode = 1;
});
