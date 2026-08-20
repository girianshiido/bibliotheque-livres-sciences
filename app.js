'use strict';

const FALLBACK_FILES = [
  'catalogue/001-046.md', 'catalogue/047-092.md', 'catalogue/093-138.md',
  'catalogue/139-184.md', 'catalogue/185-230.md', 'catalogue/231-276.md',
  'catalogue/277-322.md', 'catalogue/323-368.md', 'catalogue/369-414.md',
  'catalogue/415-460.md', 'catalogue/461-506.md'
];

const REPOSITORY_URL = 'https://github.com/girianshiido/bibliotheque-livres-sciences';
const appScript = document.querySelector('script[data-app]');
const SITE_BASE_URL = new URL('.', appScript ? appScript.src : location.href);
const MSC_DOMAINS = {
  '00': 'Généralités et collections',
  '01': 'Histoire et biographies',
  '03': 'Logique mathématique et fondements',
  '05': 'Combinatoire',
  '06': 'Ordres, treillis et structures ordonnées',
  '08': 'Systèmes algébriques généraux',
  '11': 'Théorie des nombres',
  '12': 'Théorie des corps et polynômes',
  '13': 'Algèbre commutative',
  '14': 'Géométrie algébrique',
  '15': 'Algèbre linéaire et théorie des matrices',
  '16': 'Anneaux et algèbres associatives',
  '18': 'Théorie des catégories et algèbre homologique',
  '19': 'K-théorie',
  '20': 'Théorie des groupes',
  '22': 'Groupes topologiques et groupes de Lie',
  '26': 'Fonctions réelles',
  '28': 'Mesure et intégration',
  '30': 'Fonctions d’une variable complexe',
  '31': 'Théorie du potentiel',
  '32': 'Plusieurs variables complexes et espaces analytiques',
  '33': 'Fonctions spéciales',
  '34': 'Équations différentielles ordinaires',
  '35': 'Équations aux dérivées partielles',
  '37': 'Systèmes dynamiques et théorie ergodique',
  '39': 'Équations aux différences et fonctionnelles',
  '40': 'Suites, séries et sommabilité',
  '41': 'Approximation et développements',
  '42': 'Analyse harmonique sur les espaces euclidiens',
  '43': 'Analyse harmonique abstraite',
  '44': 'Transformées intégrales et calcul opérationnel',
  '45': 'Équations intégrales',
  '46': 'Analyse fonctionnelle',
  '47': 'Théorie des opérateurs',
  '49': 'Calcul des variations et optimisation',
  '51': 'Géométrie',
  '52': 'Géométrie convexe et discrète',
  '53': 'Géométrie différentielle',
  '54': 'Topologie générale',
  '55': 'Topologie algébrique',
  '57': 'Variétés et complexes cellulaires',
  '58': 'Analyse globale et analyse sur les variétés',
  '60': 'Probabilités et processus stochastiques',
  '62': 'Statistique',
  '65': 'Analyse numérique',
  '68': 'Informatique',
  '70': 'Mécanique des particules et systèmes',
  '74': 'Mécanique des solides déformables',
  '76': 'Mécanique des fluides',
  '78': 'Optique et théorie électromagnétique',
  '80': 'Thermodynamique classique et transferts de chaleur',
  '81': 'Théorie quantique',
  '82': 'Mécanique statistique et structure de la matière',
  '83': 'Relativité et gravitation',
  '85': 'Astronomie et astrophysique',
  '86': 'Géophysique',
  '90': 'Recherche opérationnelle et programmation mathématique',
  '91': 'Théorie des jeux, économie et sciences sociales',
  '93': 'Théorie des systèmes et contrôle',
  '94': 'Information, communication et circuits',
  '92': 'Biologie et autres sciences naturelles',
  '97': 'Enseignement des mathématiques'
};

// Les règles sont ordonnées : une discipline spécifique prime toujours sur un mot
// plus général. Par exemple « topologie algébrique » relève de MSC 55, pas de l’algèbre.
const MSC_RULES = [
  ['01', /\b(history|histoi|histor|biograph|development of|genesis|origins?|heritage|correspondance|collected works|oeuvres|leben und werk)/],
  ['97', /\b(education|teaching|pedagog|didact|olympiad|problem solving|problems? for mathematicians|capes|agregation|school mathematics)/],
  ['55', /\b(algebraic topology|topologie algebrique|homotop|homology|homologie|cohomolog|fibre bundles?|fiber bundles?|characteristic classes?|classes caracteristiques|cobord)/],
  ['19', /\b(k-theor|k theor)/],
  ['14', /\b(algebraic geometr|geometrie algebrique|schemes?|varieties|varietes|hodge|intersection theory|moduli|algebraic curves?|courbes algebriques)/],
  ['32', /\b(several complex variables|plusieurs variables complexes|complex manifolds?|varietes complexes|complex surfaces?|surfaces complexes|stein spaces?|analytic spaces?|espaces analytiques|holomorphic)/],
  ['57', /\b(differential topology|topologie differentielle|topology from the differentiable viewpoint|three-dimensional geometry and topology|smooth manifolds?|differential manifolds?|varietes differentiables|knots?|noeuds|singularities|morse theory)/],
  ['54', /\b(general topology|topologie generale|continuum theory|topological spaces?|espaces topologiques)/],
  ['58', /\b(global analysis|analysis on manifolds|analyse sur les varietes|geometric analysis|analysis, manifolds|stokes|topological stability of smooth mappings)/],
  ['53', /\b(differential geometr|geometrie differentielle|riemannian|riemannienne|symplectic|contact geometr)/],
  ['52', /\b(convex geometr|geometrie convexe|discrete geometr|geometrie discrete|polytopes?|convex bodies)/],
  ['51', /\b(projective geometr|euclidean geometr|geometrie elementaire|elementary geometry|foundations of geometry|geometry of|geometrie de)/],
  ['18', /\b(category theor|categories?|categorical|categoriel|categorique|homological algebra|algebre homologique|sheaf theory|faisceaux|topos|topoi|operads?)/],
  ['22', /\b(lie groups?|groupes? de lie|topological groups?|groupes? topologiques|lie algebras?)/],
  ['20', /\b(group theory|theorie des groupes|finite groups?|groupes finis|representation theory|representations? of groups?)/],
  ['13', /\b(commutative algebra|algebre commutative|local algebra|algebre locale|commutative rings?|anneaux commutatifs|ideals?)/],
  ['12', /\b(field theory|theorie des corps|galois theory|theorie de galois|polynomials?|polynomes?)/],
  ['47', /\b(operator theory|theorie des operateurs|operators? and classical function|composition operators?|distribution operators?|operator algebras?|c\*[- ]?algebras?|spectral theory|fixed point theory|fixed points?|semigroups? of operators?)/],
  ['46', /\b(functional analysis|analyse fonctionnelle|distributions?|banach|hilbert spaces?|espaces de hilbert|topological vector spaces?|espaces vectoriels topologiques|locally convex)/],
  ['15', /\b(linear algebra|algebre lineaire|multilinear|matrix theory|matrices|vector spaces?|espaces vectoriels)/],
  ['16', /\b(noncommutative|rings? and modules?|anneaux|associative algebras?|algebras? and modules?)/],
  ['06', /\b(lattices?|treillis|ordered algebraic|continuous geometry)/],
  ['08', /\b(abstract algebra|algebre generale|universal algebra|algebraic structures?)/],
  ['43', /\b(abstract harmonic analysis|harmonic analysis on groups|analyse harmonique abstraite)/],
  ['42', /\b(fourier|wavelets?|ondelettes|harmonic analysis|analyse harmonique)/],
  ['35', /\b(partial differential equations?|equations? aux derivees partielles|elliptic equations?|hyperbolic equations?|parabolic equations?)/],
  ['34', /\b(ordinary differential equations?|equations? differentielles ordinaires|differential equations?)/],
  ['37', /\b(dynamical systems?|systemes? dynamiques|complex dynamics|dynamique holomorphe|ergodic|chaos|bifurcation|catastrophe theory)/],
  ['39', /\b(functional equations?|equations? fonctionnelles|difference equations?)/],
  ['49', /\b(calculus of variations|calcul des variations|optimal control|controle optimal|optimization|optimisation)/],
  ['31', /\b(potential theory|theorie du potentiel)/],
  ['30', /\b(complex analysis|analyse complexe|complex plane|complex variable|variable complexe|riemann surfaces?|surfaces de riemann|conformal maps?|analytic functions?|meromorphic|univalent functions?|normal families?)/],
  ['28', /\b(measure theory|theorie de la mesure|measure and integration|geometric integration|integration theory|theorie de l integration|integrale de|lebesgue)/],
  ['44', /\b(laplace transform|z transform|radon transform|transformation de radon|integral transforms?)/],
  ['26', /\b(real analysis|analyse reelle|real functions?|fonctions reelles|real analytic functions?|calcul infinitesimal|calcul differentiel|differential calculus|calculus|inequalities|inegalites|lipschitz functions?|trigonometry|integrals?, sums?, and series)/],
  ['41', /\b(approximation theory|theorie de l approximation|orthogonal polynomials?|splines?)/],
  ['33', /\b(special functions?|fonctions speciales|hypergeometric|elliptic integrals? and elliptic functions?|lambert w)/],
  ['40', /\b(sequences? and series|suites? et series|divergent series|series divergentes|summability)/],
  ['11', /\b(number theory|theory of numbers|theorie des nombres|prime numbers?|nombres premiers|pell equation|elliptic curves?|modular forms?|zeta|p-adic|number fields?|nombres p-adiques|diophant|arithmetic|arithmetique|valuations?|transcendental numbers?|continued fractions?|fermat|catalan s conjecture|book of numbers|surreal numbers)/],
  ['05', /\b(combinator|graph theory|theorie des graphes|digraphs?|coloring|enumeration|generatingfunctionology|eulerian numbers|shuffling cards|matroids?)/],
  ['03', /\b(mathematical logic|logique mathematique|set theory|theorie des ensembles|descriptive set|model theory|proof theory|calculabilit|computability|nonstandard analysis|axiom|foundations of mathematics)/],
  ['94', /\b(cryptograph|coding theory|information theory|theorie de l information|error-correcting)/],
  ['68', /\b(algorithms?|algorithmique|computer science|informatique|programming|complexity theory|automata)/],
  ['65', /\b(numerical analysis|analyse numerique|numerical methods?|methodes numeriques|scientific computing)/],
  ['82', /\b(statistical mechanics|physique statistique|structure of matter|many-body problem)/],
  ['60', /\b(probabil|stochastic|stochastique|random|aleatoir|markov|martingal|brownian)/],
  ['62', /\b(statistics?|statistique|statistical inference|data analysis)/],
  ['81', /\b(quantum|quantique)/],
  ['83', /\b(relativit|gravitation)/],
  ['78', /\b(electromagnet|optics|optique)/],
  ['80', /\b(thermodynamic|thermodynamique|heat transfer)/],
  ['76', /\b(fluid mechanics|mecanique des fluides|hydrodynamic)/],
  ['74', /\b(elasticity|elasticite|deformable solids?|solides deformables)/],
  ['70', /\b(classical mechanics|mecanique classique|celestial mechanics|mecanique analytique|mathematical mechanic|physique theorique : mecanique)/],
  ['93', /\b(control theory|theorie du controle|systems theory|theorie des systemes)/],
  ['90', /\b(operations research|recherche operationnelle|linear programming|programmation lineaire)/],
  ['91', /\b(game theory|theory of games|theorie des jeux|prisoner s dilemma|dilemme du prisonnier|mathematical economics|economie mathematique)/],
  ['92', /\b(mathematical biology|biologie mathematique)/],
  ['97', /\b(exercices?|problems? and solutions|problem book|problemes? choisis|oraux|math sup|putnam|berkeley problems|solutions d expert|master class|young mathematicians|recreations?|casse-tetes)/],
  ['20', /\b(theory of groups|groupes?|symmetric group|groupe symetrique|braids?|tresses)/],
  ['15', /\b(endomorph|quadratic forms?|formes quadratiques|algebre et geometrie lineaires?)/],
  ['08', /\b(algebra|algebre)/],
  ['54', /\b(topology|topologie|topological)/],
  ['51', /\b(geometry|geometrie|conics?|coniques?|quadrics?|quadriques?|geometric transformations?)/],
  ['26', /\b(mathematical analysis|analyse mathematique|analysis now|cours d analyse|analyse i+|analysis i+)/]
];

// Corrections éditoriales pour les titres ambigus ou trop généraux pour une
// classification fiable par vocabulaire seul.
const MSC_OVERRIDES = {
  B0015: '08', B0018: '01', B0024: '49', B0025: '05', B0029: '30', B0030: '03',
  B0041: '20', B0044: '28', B0048: '11', B0058: '01', B0060: '01', B0069: '51',
  B0071: '01', B0078: '54', B0084: '20', B0085: '20', B0095: '11', B0117: '30', B0118: '81', B0128: '05',
  B0130: '05', B0133: '52', B0134: '15', B0138: '58', B0150: '51', B0157: '41',
  B0162: '26', B0166: '54', B0168: '01', B0176: '26', B0179: '54', B0186: '05',
  B0192: '97', B0198: '11', B0207: '51', B0233: '26', B0250: '01', B0272: '97',
  B0273: '97', B0279: '39', B0288: '11', B0294: '97', B0306: '97', B0308: '34',
  B0311: '97', B0312: '97', B0316: '35', B0323: '54', B0341: '11', B0347: '11',
  B0354: '05', B0358: '01', B0359: '01', B0360: '01', B0361: '01', B0362: '01',
  B0373: '92', B0374: '01', B0378: '97', B0379: '51', B0393: '03', B0394: '01',
  B0404: '97', B0407: '81', B0421: '01', B0433: '94', B0454: '97', B0457: '81',
  B0460: '28', B0475: '68', B0476: '68', B0477: '68', B0478: '68', B0480: '68',
  B0481: '81', B0482: '81', B0483: '81', B0493: '01'
};

const PUBLISHER_ALIASES = {
  'Academic Press / Elsevier': 'Academic Press',
  'Addison-Wesley Professional': 'Addison-Wesley',
  'AMS Chelsea': 'American Mathematical Society',
  'AMS / London Mathematical Society': 'American Mathematical Society / London Mathematical Society',
  'Calvage et Mounet': 'Calvage & Mounet',
  'Copernicus / Springer': 'Copernicus',
  'CRC Press / Chapman & Hall': 'CRC Press',
  'North-Holland / Elsevier': 'North-Holland',
  'Oxford Science Publications': 'Oxford University Press',
  'PUF': 'Presses universitaires de France',
  'Seuil': 'Éditions du Seuil',
  'Springer Dordrecht': 'Springer',
  'Springer-Verlag': 'Springer'
};

const PAGE_SIZE = 48;
const state = {
  books: [], filtered: [], query: '', publisher: '', author: '', domain: '', status: '',
  sort: 'id-asc', initial: '', page: 1, view: 'grid', favorites: new Set(),
  sourceFiles: [], loadNotice: '', covers: {}, coverManifest: {}
};

const elements = {
  loading: document.querySelector('#loadingState'), error: document.querySelector('#errorState'),
  errorMessage: document.querySelector('#errorMessage'), results: document.querySelector('#results'),
  pagination: document.querySelector('.pagination'), previous: document.querySelector('#previousPageButton'),
  next: document.querySelector('#nextPageButton'), pageIndicator: document.querySelector('#pageIndicator'),
  search: document.querySelector('#searchInput'), publisher: document.querySelector('#publisherFilter'),
  author: document.querySelector('#authorFilter'), domain: document.querySelector('#domainFilter'), status: document.querySelector('#statusFilter'),
  sort: document.querySelector('#sortSelect'), summary: document.querySelector('#resultSummary'),
  title: document.querySelector('#resultTitle'), alphabet: document.querySelector('#alphabetNav'),
  gridButton: document.querySelector('#gridViewButton'), tableButton: document.querySelector('#tableViewButton'),
  dialog: document.querySelector('#bookDialog'), dialogContent: document.querySelector('#dialogContent'),
  cardTemplate: document.querySelector('#bookCardTemplate'), bookCount: document.querySelector('#bookCount'),
  authorCount: document.querySelector('#authorCount'), publisherCount: document.querySelector('#publisherCount'),
  domainCount: document.querySelector('#domainCount'),
  heroStack: document.querySelector('#heroStack'), filterPanel: document.querySelector('#filterPanel'),
  activeFilterCount: document.querySelector('#activeFilterCount')
};

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

function normalize(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
}

function stripMarkdown(value = '') {
  let cleaned = value.trim();
  if (cleaned.startsWith('*') && cleaned.endsWith('*')) cleaned = cleaned.slice(1, -1);
  return cleaned.replace(/\\\*/g, '*').replace(/\*\*/g, '').trim();
}

function mscDomain(code) {
  return `${code} — ${MSC_DOMAINS[code] || MSC_DOMAINS['00']}`;
}

function inferDomains(value = '', id = '') {
  if (MSC_OVERRIDES[id]) return [mscDomain(MSC_OVERRIDES[id])];
  const normalized = normalize(value);
  const rule = MSC_RULES.find(([, pattern]) => pattern.test(normalized));
  return [mscDomain(rule ? rule[0] : '00')];
}

function parseDomains(value = '') {
  const domains = value.split(/[;,]/).map(domain => stripMarkdown(domain)).filter(Boolean);
  return domains.length ? [...new Set(domains)] : [];
}

function canonicalPublisher(value = '') {
  const cleaned = value.trim();
  return PUBLISHER_ALIASES[cleaned] || cleaned;
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
  const titleSeparator = Math.max(titleAndRest.lastIndexOf('* — '), titleAndRest.lastIndexOf('* - '));
  if (titleSeparator < 0) return null;

  const title = stripMarkdown(titleAndRest.slice(0, titleSeparator + 1));
  const rawRest = titleAndRest.slice(titleSeparator + 4).trim();
  const status = /\[(?:à confirmer|à compléter)\]/i.test(rawRest) ? 'uncertain' : 'confirmed';
  const cleanedRest = rawRest.replace(/\s*\[(?:à confirmer|à compléter)\]/gi, '').trim();
  const noteIndex = cleanedRest.indexOf(' — Note :');
  const bibliographicAndDomains = noteIndex >= 0 ? cleanedRest.slice(0, noteIndex) : cleanedRest;
  const note = noteIndex >= 0 ? cleanedRest.slice(noteIndex + 9).trim() : '';
  const mscMatch = bibliographicAndDomains.match(/^(.*?)\s+—\s+MSC\s*:\s*([0-9]{2})(?:[A-Z][0-9]{2}|-XX)?$/i);
  const domainMatch = !mscMatch && bibliographicAndDomains.match(/^(.*?)\s+—\s+Domaines?\s*:\s*(.+)$/i);
  const bibliographic = mscMatch ? mscMatch[1].trim() : domainMatch ? domainMatch[1].trim() : bibliographicAndDomains;
  const parts = bibliographic.split(' — ').map(part => part.trim()).filter(Boolean);
  const publisher = canonicalPublisher(parts.shift() || 'Éditeur non indiqué');
  const details = parts.join(' — ');
  const authorList = authors.split(';').map(author => author.trim()).filter(Boolean);
  const mscCode = mscMatch && MSC_DOMAINS[mscMatch[2]] ? mscMatch[2] : null;
  const domains = mscCode ? [mscDomain(mscCode)] : domainMatch ? parseDomains(domainMatch[2]) : inferDomains(title, id);

  return {
    id, authors, authorList, title, publisher, details, note, domains, mscCode: mscCode || domains[0].slice(0, 2), status, sourceFile,
    number: Number(id.slice(1)),
    searchText: normalize([id, authors, title, publisher, details, note, ...domains].join(' '))
  };
}

function parseCatalogue(markdown, sourceFile) {
  return markdown.split(/\r?\n/).map(line => parseBookLine(line, sourceFile)).filter(Boolean);
}

async function fetchText(path) {
  const url = new URL(path, SITE_BASE_URL);
  url.searchParams.set('v', String(Date.now()));
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path} : erreur HTTP ${response.status}`);
  return response.text();
}

function catalogueFilesFromReadme(readme) {
  const files = [...readme.matchAll(/(?:\]\(|\b)(catalogue\/[A-Za-z0-9._-]+\.md)\b/g)]
    .map(match => match[1])
    .filter(file => !file.split('/').includes('..'));
  return [...new Set(files)];
}

async function discoverCatalogueFiles() {
  try {
    const readme = await fetchText('README.md');
    const files = catalogueFilesFromReadme(readme);
    if (files.length) return { files, usedFallback: false };
  } catch {
    // GitHub Pages peut momentanément servir une version incomplète pendant un déploiement.
  }
  return { files: FALLBACK_FILES, usedFallback: true };
}

async function fetchCoverIndex() {
  try {
    const value = JSON.parse(await fetchText('covers/index.json'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    // Les notices restent entièrement utilisables si l’index des couvertures manque.
    return {};
  }
}

async function fetchCoverManifest() {
  try {
    const value = JSON.parse(await fetchText('covers/manifest.json'));
    return value && typeof value.books === 'object' && !Array.isArray(value.books) ? value.books : {};
  } catch {
    // Le manifeste local est facultatif tant que les couvertures téléchargées sont en cours de constitution.
    return {};
  }
}

async function fetchCatalogueFiles(files) {
  const settled = await Promise.allSettled(files.map(async file => ({ file, text: await fetchText(file) })));
  const loaded = settled.filter(result => result.status === 'fulfilled').map(result => result.value);
  const failed = settled
    .map((result, index) => result.status === 'rejected' ? `${files[index]} (${result.reason?.message || 'indisponible'})` : null)
    .filter(Boolean);
  return { loaded, failed };
}

async function loadCatalogue() {
  showLoading();
  try {
    const [discovery, covers, coverManifest] = await Promise.all([discoverCatalogueFiles(), fetchCoverIndex(), fetchCoverManifest()]);
    state.covers = covers;
    state.coverManifest = coverManifest;
    let { loaded, failed } = await fetchCatalogueFiles(discovery.files);

    // Si la découverte dynamique tombe sur une version de README en avance sur Pages,
    // la liste intégrée permet encore de servir le catalogue connu.
    if (!loaded.length && !discovery.usedFallback) {
      const fallback = await fetchCatalogueFiles(FALLBACK_FILES);
      loaded = fallback.loaded;
      failed = fallback.failed;
    }

    state.sourceFiles = loaded.map(({ file }) => file);
    state.books = [...new Map(loaded
      .flatMap(({ file, text }) => parseCatalogue(text, file))
      .map(book => [book.id, book])).values()]
      .sort((a, b) => a.number - b.number);
    if (!state.books.length) throw new Error('Aucune entrée bibliographique reconnue dans les fichiers Markdown.');
    state.loadNotice = failed.length ? `${failed.length} fichier${failed.length > 1 ? 's' : ''} indisponible${failed.length > 1 ? 's' : ''} : affichage partiel.` : '';
    loadFavorites();
    hydrateStateFromUrl();
    populateFilters();
    renderAlphabet();
    updateStats();
    renderHeroStack();
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
  state.loadNotice = '';
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
  populateSelect(elements.domain, uniqueSorted(state.books.flatMap(book => book.domains)), 'Tous les domaines');
  elements.publisher.value = state.publisher;
  elements.author.value = state.author;
  elements.domain.value = state.domain;
  elements.status.value = state.status;
  elements.sort.value = state.sort;
  elements.search.value = state.query;
  setView(state.view);
  if ([state.query, state.publisher, state.author, state.domain, state.status, state.initial].filter(Boolean).length) {
    elements.filterPanel.open = true;
  }
}

function updateStats() {
  elements.bookCount.textContent = state.books.length.toLocaleString('fr-FR');
  elements.authorCount.textContent = uniqueSorted(state.books.flatMap(book => book.authorList).filter(a => normalize(a) !== 'collectif')).length.toLocaleString('fr-FR');
  elements.publisherCount.textContent = uniqueSorted(state.books.map(book => book.publisher)).length.toLocaleString('fr-FR');
  elements.domainCount.textContent = uniqueSorted(state.books.flatMap(book => book.domains)).length.toLocaleString('fr-FR');
}

function renderHeroStack() {
  const books = state.books.filter(book => state.covers[book.id]?.coverId).slice(0, 3);
  if (!books.length) return;
  const fragment = document.createDocumentFragment();
  books.forEach(book => {
    const item = document.createElement('div');
    item.className = 'hero-stack__book';
    item.style.setProperty('--book-hue', String((Number(book.mscCode) * 7 + book.number) % 360));
    item.innerHTML = `<div class="book-cover"><img class="book-cover__image" alt="" decoding="async" hidden><div class="book-cover__placeholder" aria-hidden="true"><span class="book-cover__code"></span><strong class="book-cover__placeholder-title"></strong><span class="book-cover__monogram">BS</span></div></div>`;
    setupBookCover(item, book, 'M');
    fragment.append(item);
  });
  const caption = document.createElement('span');
  caption.className = 'hero-stack__caption';
  caption.textContent = 'Une collection en mouvement';
  fragment.append(caption);
  elements.heroStack.replaceChildren(fragment);
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
    if (state.domain && !book.domains.includes(state.domain)) return false;
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
  updateFilterBadge();
  renderBooks();
  updateSummary();
  if (updateUrl) updateUrlState();
}

function updateFilterBadge() {
  const activeCount = [state.query, state.publisher, state.author, state.domain, state.status, state.initial].filter(Boolean).length;
  elements.activeFilterCount.textContent = activeCount ? `${activeCount} filtre${activeCount > 1 ? 's' : ''} actif${activeCount > 1 ? 's' : ''}` : 'Aucun filtre';
}

function updateAlphabetButtons() {
  for (const button of elements.alphabet.querySelectorAll('button')) {
    button.classList.toggle('is-active', button.dataset.letter === state.initial);
  }
}

function updateSummary() {
  const total = state.filtered.length;
  elements.summary.textContent = `${total.toLocaleString('fr-FR')} ${total > 1 ? 'références affichées' : 'référence affichée'} sur ${state.books.length.toLocaleString('fr-FR')}.${state.loadNotice ? ` ${state.loadNotice}` : ''}`;
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
  card.style.setProperty('--book-hue', String((Number(book.mscCode) * 7 + book.number) % 360));
  setupBookCover(card, book, 'M');
  card.querySelector('.book-card__id').textContent = book.id;
  card.querySelector('.book-card__domain').textContent = `MSC ${book.mscCode}`;
  card.querySelector('.book-card__title').textContent = book.title;
  card.querySelector('.book-card__authors').textContent = book.authors;
  const meta = card.querySelector('.book-card__meta');
  meta.append(createBadge(book.publisher));
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

function coverUrl(cover, size = 'M') {
  return `https://covers.openlibrary.org/b/id/${encodeURIComponent(cover.coverId)}-${size}.jpg?default=false`;
}

function localCoverUrl(book) {
  const localPath = state.coverManifest[book.id]?.cover?.webPath;
  if (typeof localPath !== 'string' || !localPath.startsWith('covers/web/')) return null;
  return new URL(localPath, SITE_BASE_URL).href;
}

function setupBookCover(root, book, size = 'M') {
  const frame = root.querySelector('.book-cover');
  if (!frame) return;
  const image = frame.querySelector('.book-cover__image');
  const placeholder = frame.querySelector('.book-cover__placeholder');
  frame.querySelector('.book-cover__code').textContent = `MSC ${book.mscCode}`;
  frame.querySelector('.book-cover__placeholder-title').textContent = book.title;
  const cover = state.covers[book.id];
  const source = localCoverUrl(book) || (cover?.coverId ? coverUrl(cover, size) : null);
  if (!source) return;

  const showImage = () => {
    const ratio = image.naturalWidth / image.naturalHeight;
    if (Number.isFinite(ratio) && ratio > 0) {
      frame.dataset.orientation = ratio > 1.08 ? 'landscape' : ratio < .82 ? 'portrait' : 'standard';
      frame.style.setProperty('--cover-image-ratio', String(Math.min(3, Math.max(.25, ratio))));
    }
    image.hidden = false;
    placeholder.hidden = true;
  };
  image.alt = `Première de couverture de « ${book.title} »`;
  image.addEventListener('load', showImage, { once: true });
  image.addEventListener('error', () => {
    image.hidden = true;
    placeholder.hidden = false;
  }, { once: true });
  // L’image doit participer au rendu pour que le chargement différé démarre ;
  // le visuel typographique la masque jusqu’à l’événement load.
  image.hidden = false;
  image.src = source;
  if (image.complete && image.naturalWidth) showImage();
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
  const cover = state.covers[book.id];
  const openLibraryLink = cover?.workKey
    ? `<a class="button button--quiet" href="https://openlibrary.org${escapeHtml(cover.workKey)}" target="_blank" rel="noopener">Notice Open Library</a>`
    : '';
  elements.dialogContent.innerHTML = `
    <div class="dialog-layout" style="--book-hue: ${(Number(book.mscCode) * 7 + book.number) % 360}">
      <div class="dialog-cover-column">
        <div class="book-cover book-cover--dialog">
          <img class="book-cover__image" alt="" decoding="async" hidden>
          <div class="book-cover__placeholder" aria-hidden="true">
            <span class="book-cover__code"></span>
            <strong class="book-cover__placeholder-title"></strong>
            <span class="book-cover__monogram">BS</span>
          </div>
        </div>
        ${cover ? '<p class="cover-credit">Couverture : Open Library</p>' : '<p class="cover-credit">Visuel typographique du catalogue</p>'}
      </div>
      <div class="dialog-body">
        <div class="dialog-id">${escapeHtml(book.id)} · MSC ${escapeHtml(book.mscCode)}</div>
        <h2 class="dialog-title">${escapeHtml(book.title)}</h2>
        <p class="dialog-authors">${escapeHtml(book.authors)}</p>
        <dl class="dialog-grid">
          <dt>Éditeur</dt><dd>${escapeHtml(book.publisher)}</dd>
          <dt>Domaine${book.domains.length > 1 ? 's' : ''}</dt><dd>${escapeHtml(book.domains.join(' · '))}</dd>
          <dt>Collection / édition</dt><dd>${escapeHtml(book.details || 'Non précisée')}</dd>
          <dt>État</dt><dd>${book.status === 'uncertain' ? 'Référence à vérifier' : 'Référence confirmée'}</dd>
          ${book.note ? `<dt>Note</dt><dd>${escapeHtml(book.note)}</dd>` : ''}
          <dt>Fichier source</dt><dd><code>${escapeHtml(book.sourceFile)}</code></dd>
        </dl>
        <div class="dialog-actions">
          <button id="dialogFavoriteButton" class="button" type="button">${favorite ? '★ Retirer des favoris' : '☆ Ajouter aux favoris'}</button>
          ${openLibraryLink}
          <a class="button button--quiet" href="${REPOSITORY_URL}/blob/main/${encodeURI(book.sourceFile)}" target="_blank" rel="noopener">Voir la source GitHub</a>
        </div>
      </div>
    </div>`;
  setupBookCover(elements.dialogContent, book, 'L');
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
  state.query = state.publisher = state.author = state.domain = state.status = state.initial = '';
  state.sort = 'id-asc'; state.page = 1;
  elements.search.value = '';
  elements.publisher.value = '';
  elements.author.value = '';
  elements.domain.value = '';
  elements.status.value = '';
  elements.sort.value = 'id-asc';
  applyFilters();
}

function updateUrlState() {
  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  if (state.publisher) params.set('publisher', state.publisher);
  if (state.author) params.set('author', state.author);
  if (state.domain) params.set('domain', state.domain);
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
  state.domain = params.get('domain') || '';
  state.status = params.get('status') || '';
  state.sort = params.get('sort') || 'id-asc';
  state.initial = params.get('initial') || '';
  state.view = params.get('view') || localStorage.getItem('bibliotheque-view') || 'grid';
  state.page = Math.max(1, Number(params.get('page')) || 1);
}

function exportSelection() {
  const rows = [['Identifiant', 'Auteur(s)', 'Titre', 'Éditeur', 'Collection / édition', 'Domaine MSC 2020', 'État']];
  for (const book of state.filtered) rows.push([book.id, book.authors, book.title, book.publisher, book.details, book.domains.join(' ; '), book.status === 'uncertain' ? 'À vérifier' : 'Confirmé']);
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
elements.domain.addEventListener('change', event => { state.domain = event.target.value; state.page = 1; applyFilters(); });
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
