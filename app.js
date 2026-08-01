'use strict';

const FALLBACK_FILES = [
  'catalogue/001-046.md', 'catalogue/047-092.md', 'catalogue/093-138.md',
  'catalogue/139-184.md', 'catalogue/185-230.md', 'catalogue/231-276.md',
  'catalogue/277-322.md', 'catalogue/323-368.md', 'catalogue/369-414.md',
  'catalogue/415-460.md', 'catalogue/461-506.md'
];

const PAGE_SIZE = 48;
const state = {
  books: [], filtered: [], query: '', publisher: '', author: '', status: '',
  sort: 'id-asc', initial: '', page: 1, view: 'grid', favorites: new Set(),
  sourceFiles: []
};

const elements = {
  loading: document.querySelector('#loadingState'), error: document.querySelector('#errorState'),
  errorMessage: document.querySelector('#errorMessage'), results: document.querySelector('#results'),
  pagination: document.querySelector('.pagination'), previous: document.querySelector('#previousPageButton'),
  next: document.querySelector('#nextPageButton'), pageIndicator: document.querySelector('#pageIndicator'),
  search: document.querySelector('#searchInput'), publisher: document.querySelector('#publisherFilter'),
  author: document.querySelector('#authorFilter'), status: document.querySelector('#statusFilter'),
  sort: document.querySelector('#sortSelect'), summary: document.querySelector('#resultSummary'),
  title: document.querySelector('#resultTitle'), alphabet: document.querySelector('#alphabetNav'),
  gridButton: document.querySelector('#gridViewButton'), tableButton: document.querySelector('#tableViewButton'),
  dialog: document.querySelector('#bookDialog'), dialogContent: document.querySelector('#dialogContent'),
  cardTemplate: document.querySelector('#bookCardTemplate'), bookCount: document.querySelector('#bookCount'),
  authorCount: document.querySelector('#authorCount'), publisherCount: document.querySelector('#publisherCount'),
  uncertainCount: document.querySelector('#uncertainCount')
};

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

function normalize(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
}

function stripMarkdown(value = '') {
  return value.replace(/\*\*/g, '').replace(/\*/g, '').replace(/\\\*/g, '*').trim();
}

function parseBookLine(line, sourceFile) {
  const idMatch = line.match(/^- \*\*(B\d{4})\*\* — /);
  if (!idMatch) return null;

  const id = idMatch[1];
  const body = line.slice(idMatch[0].length);
  const authorSeparator = body.indexOf(' — *');
  if (authorSeparator < 0) return null;

  const authors = stripMarkdown(body.slice(0, authorSeparator));
  const titleAndRest = body.slice(authorSeparator + 3);
  const titleSeparator = titleAndRest.lastIndexOf('* — ');
  if (titleSeparator < 0) return null;

  const title = stripMarkdown(titleAndRest.slice(0, titleSeparator + 1));
  const rawRest = titleAndRest.slice(titleSeparator + 4).trim();
  const status = /\[(?:à confirmer|à compléter)\]/i.test(rawRest) ? 'uncertain' : 'confirmed';
  const cleanedRest = rawRest.replace(/\s*\[(?:à confirmer|à compléter)\]/gi, '').trim();
  const noteIndex = cleanedRest.indexOf(' — Note :');
  const bibliographic = noteIndex >= 0 ? cleanedRest.slice(0, noteIndex) : cleanedRest;
  const note = noteIndex >= 0 ? cleanedRest.slice(noteIndex + 9).trim() : '';
  const parts = bibliographic.split(' — ').map(part => part.trim()).filter(Boolean);
  const publisher = parts.shift() || 'Éditeur non indiqué';
  const details = parts.join(' — ');
  const authorList = authors.split(';').map(author => author.trim()).filter(Boolean);

  return {
    id, authors, authorList, title, publisher, details, note, status, sourceFile,
    number: Number(id.slice(1)),
    searchText: normalize([id, authors, title, publisher, details, note].join(' '))
  };
}

function parseCatalogue(markdown, sourceFile) {
  return markdown.split(/\r?\n/).map(line => parseBookLine(line, sourceFile)).filter(Boolean);
}

async function fetchText(path) {
  const response = await fetch(`${path}?v=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path} : erreur HTTP ${response.status}`);
  return response.text();
}

async function discoverCatalogueFiles() {
  try {
    const readme = await fetchText('README.md');
    const files = [...readme.matchAll(/\((catalogue\/[^)]+\.md)\)/g)].map(match => match[1]);
    return [...new Set(files.length ? files : FALLBACK_FILES)];
  } catch {
    return FALLBACK_FILES;
  }
}

async function loadCatalogue() {
  showLoading();
  try {
    state.sourceFiles = await discoverCatalogueFiles();
    const contents = await Promise.all(state.sourceFiles.map(async file => ({ file, text: await fetchText(file) })));
    state.books = contents.flatMap(({ file, text }) => parseCatalogue(text, file)).sort((a, b) => a.number - b.number);
    if (!state.books.length) throw new Error('Aucune entrée bibliographique reconnue dans les fichiers Markdown.');
    loadFavorites();
    hydrateStateFromUrl();
    populateFilters();
    renderAlphabet();
    updateStats();
    applyFilters();
    showResults();
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
}

function showLoading() {
  elements.loading.hidden = false;
  elements.error.hidden = true;
  elements.results.hidden = true;
  elements.pagination.hidden = true;
}

function showResults() {
  elements.loading.hidden = true;
  elements.error.hidden = true;
  elements.results.hidden = false;
}

function showError(message) {
  elements.loading.hidden = true;
  elements.results.hidden = true;
  elements.pagination.hidden = true;
  elements.error.hidden = false;
  elements.errorMessage.textContent = message;
}

function loadFavorites() {
  try { state.favorites = new Set(JSON.parse(localStorage.getItem('bibliotheque-favorites') || '[]')); }
  catch { state.favorites = new Set(); }
}

function saveFavorites() {
  localStorage.setItem('bibliotheque-favorites', JSON.stringify([...state.favorites]));
}

function toggleFavorite(id) {
  state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id);
  saveFavorites();
  applyFilters(false);
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort(collator.compare);
}

function populateSelect(select, values, firstLabel) {
  select.replaceChildren(new Option(firstLabel, ''));
  for (const value of values) select.add(new Option(value, value));
}

function populateFilters() {
  populateSelect(elements.publisher, uniqueSorted(state.books.map(book => book.publisher)), 'Tous les éditeurs');
  populateSelect(elements.author, uniqueSorted(state.books.flatMap(book => book.authorList)), 'Tous les auteurs');
  elements.publisher.value = state.publisher;
  elements.author.value = state.author;
  elements.status.value = state.status;
  elements.sort.value = state.sort;
  elements.search.value = state.query;
  setView(state.view);
}

function updateStats() {
  elements.bookCount.textContent = state.books.length.toLocaleString('fr-FR');
  elements.authorCount.textContent = uniqueSorted(state.books.flatMap(book => book.authorList).filter(a => normalize(a) !== 'collectif')).length.toLocaleString('fr-FR');
  elements.publisherCount.textContent = uniqueSorted(state.books.map(book => book.publisher)).length.toLocaleString('fr-FR');
  elements.uncertainCount.textContent = state.books.filter(book => book.status === 'uncertain').length.toLocaleString('fr-FR');
}

function renderAlphabet() {
  const letters = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  elements.alphabet.replaceChildren(...letters.map(letter => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = letter;
    button.dataset.letter = letter;
    button.title = letter === '#' ? 'Titres commençant par un chiffre ou un symbole' : `Titres commençant par ${letter}`;
    button.addEventListener('click', () => {
      state.initial = state.initial === letter ? '' : letter;
      state.page = 1;
      applyFilters();
    });
    return button;
  }));
}

function titleInitial(title) {
  const cleaned = normalize(title).replace(/^(the|a|an|le|la|les|l'|un|une|des)\s+/i, '').trim();
  const char = cleaned.charAt(0).toUpperCase();
  return /[A-Z]/.test(char) ? char : '#';
}

function applyFilters(updateUrl = true) {
  const query = normalize(state.query.trim());
  state.filtered = state.books.filter(book => {
    if (query && !book.searchText.includes(query)) return false;
    if (state.publisher && book.publisher !== state.publisher) return false;
    if (state.author && !book.authorList.includes(state.author)) return false;
    if (state.status === 'confirmed' && book.status !== 'confirmed') return false;
    if (state.status === 'uncertain' && book.status !== 'uncertain') return false;
    if (state.status === 'favorite' && !state.favorites.has(book.id)) return false;
    if (state.initial && titleInitial(book.title) !== state.initial) return false;
    return true;
  });

  const sorters = {
    'id-asc': (a, b) => a.number - b.number,
    'id-desc': (a, b) => b.number - a.number,
    title: (a, b) => collator.compare(a.title, b.title),
    author: (a, b) => collator.compare(a.authors, b.authors),
    publisher: (a, b) => collator.compare(a.publisher, b.publisher) || collator.compare(a.title, b.title)
  };
  state.filtered.sort(sorters[state.sort] || sorters['id-asc']);

  const maxPage = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
  state.page = Math.min(state.page, maxPage);
  updateAlphabetButtons();
  renderBooks();
  updateSummary();
  if (updateUrl) updateUrlState();
}

function updateAlphabetButtons() {
  for (const button of elements.alphabet.querySelectorAll('button')) {
    button.classList.toggle('is-active', button.dataset.letter === state.initial);
  }
}

function updateSummary() {
  const total = state.filtered.length;
  elements.summary.textContent = `${total.toLocaleString('fr-FR')} ${total > 1 ? 'références affichées' : 'référence affichée'} sur ${state.books.length.toLocaleString('fr-FR')}.`;
  elements.title.textContent = state.status === 'favorite' ? 'Mes favoris' : 'Catalogue';
}

function renderBooks() {
  elements.results.replaceChildren();
  const start = (state.page - 1) * PAGE_SIZE;
  const pageBooks = state.filtered.slice(start, start + PAGE_SIZE);

  if (!pageBooks.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<h3>Aucun livre ne correspond à ces critères.</h3><p>Essayez une recherche plus courte ou effacez les filtres.</p>';
    elements.results.append(empty);
  } else if (state.view === 'table') {
    renderTable(pageBooks);
  } else {
    const fragment = document.createDocumentFragment();
    pageBooks.forEach(book => fragment.append(createBookCard(book)));
    elements.results.append(fragment);
  }
  renderPagination();
}

function createBookCard(book) {
  const card = elements.cardTemplate.content.firstElementChild.cloneNode(true);
  card.querySelector('.book-card__id').textContent = book.id;
  card.querySelector('.book-card__title').textContent = book.title;
  card.querySelector('.book-card__authors').textContent = book.authors;
  const meta = card.querySelector('.book-card__meta');
  meta.append(createBadge(book.publisher));
  if (book.details) meta.append(createBadge(book.details));
  if (book.status === 'uncertain') meta.append(createBadge('À vérifier', true));

  const favorite = card.querySelector('.favorite-button');
  const isFavorite = state.favorites.has(book.id);
  favorite.textContent = isFavorite ? '★' : '☆';
  favorite.classList.toggle('is-favorite', isFavorite);
  favorite.setAttribute('aria-label', isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris');
  favorite.title = favorite.getAttribute('aria-label');
  favorite.addEventListener('click', event => { event.stopPropagation(); toggleFavorite(book.id); });

  card.querySelector('.book-card__open').addEventListener('click', () => openBookDialog(book));
  card.addEventListener('dblclick', () => openBookDialog(book));
  return card;
}

function createBadge(text, warning = false) {
  const badge = document.createElement('span');
  badge.className = `badge${warning ? ' badge--warning' : ''}`;
  badge.textContent = text;
  return badge;
}

function renderTable(books) {
  const shell = document.createElement('div');
  shell.className = 'table-shell';
  const table = document.createElement('table');
  table.className = 'catalogue-table';
  table.innerHTML = '<thead><tr><th>ID</th><th>Titre</th><th>Auteur(s)</th><th>Éditeur</th><th>Complément</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const book of books) {
    const row = document.createElement('tr');
    const titleCell = document.createElement('td');
    const titleButton = document.createElement('button');
    titleButton.type = 'button';
    titleButton.textContent = book.title;
    titleButton.addEventListener('click', () => openBookDialog(book));
    titleCell.append(titleButton);
    [book.id, titleCell, book.authors, book.publisher, book.details].forEach((value, index) => {
      if (index === 1) row.append(value);
      else { const cell = document.createElement('td'); cell.textContent = value || '—'; row.append(cell); }
    });
    tbody.append(row);
  }
  table.append(tbody);
  shell.append(table);
  elements.results.append(shell);
}

function renderPagination() {
  const totalPages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
  const visible = totalPages > 1;
  elements.pagination.hidden = !visible;
  elements.previous.disabled = state.page <= 1;
  elements.next.disabled = state.page >= totalPages;
  elements.pageIndicator.textContent = `Page ${state.page} sur ${totalPages}`;
}

function openBookDialog(book) {
  const favorite = state.favorites.has(book.id);
  elements.dialogContent.innerHTML = `
    <div class="dialog-body">
      <div class="dialog-id">${escapeHtml(book.id)}</div>
      <h2 class="dialog-title">${escapeHtml(book.title)}</h2>
      <p class="dialog-authors">${escapeHtml(book.authors)}</p>
      <dl class="dialog-grid">
        <dt>Éditeur</dt><dd>${escapeHtml(book.publisher)}</dd>
        <dt>Collection / édition</dt><dd>${escapeHtml(book.details || 'Non précisée')}</dd>
        <dt>État</dt><dd>${book.status === 'uncertain' ? 'Référence à vérifier' : 'Référence confirmée'}</dd>
        ${book.note ? `<dt>Note</dt><dd>${escapeHtml(book.note)}</dd>` : ''}
        <dt>Fichier source</dt><dd><code>${escapeHtml(book.sourceFile)}</code></dd>
      </dl>
      <div class="dialog-actions">
        <button id="dialogFavoriteButton" class="button" type="button">${favorite ? '★ Retirer des favoris' : '☆ Ajouter aux favoris'}</button>
        <a class="button button--quiet" href="https://github.com/girianshiido/bibliotheque-mathematique/blob/main/${encodeURI(book.sourceFile)}" target="_blank" rel="noopener">Voir la source GitHub</a>
      </div>
    </div>`;
  elements.dialogContent.querySelector('#dialogFavoriteButton').addEventListener('click', () => {
    toggleFavorite(book.id);
    elements.dialog.close();
  });
  elements.dialog.showModal();
}

function escapeHtml(value = '') {
  return value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function setView(view) {
  state.view = view === 'table' ? 'table' : 'grid';
  elements.results.className = state.view === 'grid' ? 'book-grid' : 'book-grid book-grid--table';
  elements.gridButton.classList.toggle('is-active', state.view === 'grid');
  elements.tableButton.classList.toggle('is-active', state.view === 'table');
  elements.gridButton.setAttribute('aria-pressed', String(state.view === 'grid'));
  elements.tableButton.setAttribute('aria-pressed', String(state.view === 'table'));
}

function resetFilters() {
  state.query = state.publisher = state.author = state.status = state.initial = '';
  state.sort = 'id-asc'; state.page = 1;
  elements.search.value = '';
  elements.publisher.value = '';
  elements.author.value = '';
  elements.status.value = '';
  elements.sort.value = 'id-asc';
  applyFilters();
}

function updateUrlState() {
  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  if (state.publisher) params.set('publisher', state.publisher);
  if (state.author) params.set('author', state.author);
  if (state.status) params.set('status', state.status);
  if (state.sort !== 'id-asc') params.set('sort', state.sort);
  if (state.initial) params.set('initial', state.initial);
  if (state.view !== 'grid') params.set('view', state.view);
  if (state.page > 1) params.set('page', state.page);
  history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`);
}

function hydrateStateFromUrl() {
  const params = new URLSearchParams(location.search);
  state.query = params.get('q') || '';
  state.publisher = params.get('publisher') || '';
  state.author = params.get('author') || '';
  state.status = params.get('status') || '';
  state.sort = params.get('sort') || 'id-asc';
  state.initial = params.get('initial') || '';
  state.view = params.get('view') || localStorage.getItem('bibliotheque-view') || 'grid';
  state.page = Math.max(1, Number(params.get('page')) || 1);
}

function exportSelection() {
  const rows = [['Identifiant', 'Auteur(s)', 'Titre', 'Éditeur', 'Collection / édition', 'État']];
  for (const book of state.filtered) rows.push([book.id, book.authors, book.title, book.publisher, book.details, book.status === 'uncertain' ? 'À vérifier' : 'Confirmé']);
  const csv = rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'selection-bibliotheque.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function initializeTheme() {
  const saved = localStorage.getItem('bibliotheque-theme');
  const preferredDark = matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = saved || (preferredDark ? 'dark' : 'light');
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('bibliotheque-theme', next);
}

let searchTimer;
elements.search.addEventListener('input', event => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.query = event.target.value; state.page = 1; applyFilters(); }, 120);
});
elements.publisher.addEventListener('change', event => { state.publisher = event.target.value; state.page = 1; applyFilters(); });
elements.author.addEventListener('change', event => { state.author = event.target.value; state.page = 1; applyFilters(); });
elements.status.addEventListener('change', event => { state.status = event.target.value; state.page = 1; applyFilters(); });
elements.sort.addEventListener('change', event => { state.sort = event.target.value; state.page = 1; applyFilters(); });
elements.gridButton.addEventListener('click', () => { setView('grid'); localStorage.setItem('bibliotheque-view', 'grid'); renderBooks(); updateUrlState(); });
elements.tableButton.addEventListener('click', () => { setView('table'); localStorage.setItem('bibliotheque-view', 'table'); renderBooks(); updateUrlState(); });
elements.previous.addEventListener('click', () => { state.page--; renderBooks(); updateUrlState(); scrollToResults(); });
elements.next.addEventListener('click', () => { state.page++; renderBooks(); updateUrlState(); scrollToResults(); });
document.querySelector('#resetButton').addEventListener('click', resetFilters);
document.querySelector('#exportButton').addEventListener('click', exportSelection);
document.querySelector('#refreshButton').addEventListener('click', loadCatalogue);
document.querySelector('#retryButton').addEventListener('click', loadCatalogue);
document.querySelector('#themeButton').addEventListener('click', toggleTheme);
document.addEventListener('keydown', event => {
  if (event.key === '/' && !/input|select|textarea/i.test(document.activeElement.tagName)) { event.preventDefault(); elements.search.focus(); }
});

function scrollToResults() { document.querySelector('.results-heading').scrollIntoView({ behavior: 'smooth', block: 'start' }); }

initializeTheme();
loadCatalogue();
