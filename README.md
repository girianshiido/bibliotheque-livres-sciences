# Bibliothèque scientifique

Catalogue de ma bibliothèque de livres scientifiques (principalement des livres de mathématiques).

## État actuel

- **495 ouvrages ou volumes** enregistrés.
- Les informations incertaines sont explicitement signalées.

## Interface web

Le dépôt contient une interface statique dans `index.html`, avec son moteur dans `app.js` et sa mise en forme dans `styles.css`.

L’interface :

- relit `README.md` pour découvrir automatiquement la liste des fichiers du catalogue ;
- recharge ensuite directement chaque fichier Markdown ;
- reflète donc automatiquement les corrections et les nouveaux ouvrages ;
- prend aussi en compte un nouveau fichier de catalogue dès que son lien est ajouté à la liste ci-dessous ;
- utilise une liste de secours si la lecture du README est temporairement indisponible pendant un déploiement Pages ;
- continue à afficher les fichiers disponibles si l’un d’eux est momentanément inaccessible, en le signalant dans le résumé ;
- permet la recherche plein texte, les filtres par auteur, éditeur et domaine, le tri, les favoris locaux, l’affichage en cartes ou en tableau et l’export CSV de la sélection.
- charge un index local de correspondances bibliographiques pour afficher les couvertures Open Library, sans rendre le catalogue dépendant de cet index.

Les variantes purement typographiques d’un même éditeur sont regroupées sous un nom canonique dans l’interface (`Calvage et Mounet.` devient par exemple `Calvage & Mounet`). Les coéditions réellement distinctes restent séparées.

### Couvertures

Le fichier `covers/index.json` contient uniquement les identifiants de couvertures dont la correspondance titre-auteur est suffisamment fiable. Les images sont servies par Open Library conformément à son API de couvertures ; elles ne sont pas copiées en masse dans le dépôt. En l’absence de correspondance fiable, le site génère une couverture typographique uniforme afin que toutes les fiches conservent la même dimension.

Après l’ajout ou la correction de livres, l’index peut être reconstruit avec :

```sh
node scripts/build-cover-index.mjs
```

Le script interroge l’API par lots, limite sa fréquence, reprend après une interruption et refuse les rapprochements bibliographiques trop faibles.

Une campagne de conservation locale des couvertures est également préparée dans `covers/manifest.json`. Elle distingue strictement : la notice du livre, l’ISBN de l’édition contrôlée, la provenance et les dimensions réelles de l’image. Une image locale validée (`covers/web/...`) est toujours préférée à Open Library. Les visuels ne sont jamais étirés ni recadrés : les cadres de la bibliothèque sont constants, mais chaque couverture est affichée dans son ratio natif, y compris les formats paysage.

Pour les ouvrages Springer et Birkhäuser, la campagne s’exécute séquentiellement — jamais en parallèle — afin de protéger le manifeste et de ne télécharger une image qu’après contrôle de l’ISBN :

```sh
node scripts/build-cover-manifest.mjs
node scripts/resolve-springer-isbns.mjs --limit 3
node scripts/fetch-springer-covers.mjs --limit 12
```

Les scripts prennent un verrou temporaire sur le manifeste. Si une étape est déjà en cours, la suivante s’arrête sans modifier les données.

### Domaines scientifiques — MSC 2020

La taxonomie suit la **Mathematics Subject Classification 2020**, maintenue conjointement par Mathematical Reviews et zbMATH. Chaque livre reçoit un domaine principal à deux chiffres ; les disciplines spécifiques ont priorité sur les mots généraux. Ainsi, la topologie algébrique relève de `55`, et non de l’algèbre.

Pour fixer manuellement la classification d’une notice, ajouter à sa fin :

```md
— MSC : 55
```

Le site accepte les codes MSC à deux ou cinq caractères et affiche leur domaine principal. L’ancienne syntaxe `Domaine :` reste comprise pour compatibilité, mais les codes MSC sont recommandés.

Pour la publier avec GitHub Pages : **Settings → Pages → Deploy from a branch → `main` → `/(root)`**.

> Attention : un site GitHub Pages est publiquement accessible, y compris lorsqu’il est construit depuis un dépôt privé. Ne pas activer Pages si le catalogue doit rester strictement privé.

## Catalogue

Le catalogue est actuellement réparti en onze fichiers Markdown :

- [`catalogue/001-046.md`](catalogue/001-046.md)
- [`catalogue/047-092.md`](catalogue/047-092.md)
- [`catalogue/093-138.md`](catalogue/093-138.md)
- [`catalogue/139-184.md`](catalogue/139-184.md)
- [`catalogue/185-230.md`](catalogue/185-230.md)
- [`catalogue/231-276.md`](catalogue/231-276.md)
- [`catalogue/277-322.md`](catalogue/277-322.md)
- [`catalogue/323-368.md`](catalogue/323-368.md)
- [`catalogue/369-414.md`](catalogue/369-414.md)
- [`catalogue/415-460.md`](catalogue/415-460.md)
- [`catalogue/461-506.md`](catalogue/461-506.md)

Une version CSV et JSON sera ajoutée après une nouvelle passe de vérification bibliographique.

## Méthode

1. aucune photographie de couverture n’est archivée ici ;
2. aucune donnée incertaine n’est complétée arbitrairement ;
3. les corrections futures conservent les identifiants existants ;
4. le classement thématique suit MSC 2020 et les exceptions ambiguës sont corrigées explicitement.

## Statuts

- sans mention : référence confirmée ;
- `à confirmer` : une donnée secondaire reste incertaine ;
- `à compléter` : une partie de la référence manque encore.
