# Bibliothèque mathématique

Catalogue privé de la bibliothèque de mathématiques de Philippe.

## État actuel

- **495 ouvrages ou volumes** enregistrés.
- Inventaire provisoire, construit à partir des photographies et des titres saisis dans la conversation.
- Les photographies ne sont pas stockées dans ce dépôt.
- Les informations incertaines sont explicitement signalées.

## Interface web

Le dépôt contient une interface statique dans `index.html`, avec son moteur dans `app.js` et sa mise en forme dans `styles.css`.

L’interface :

- relit `README.md` pour découvrir automatiquement la liste des fichiers du catalogue ;
- recharge ensuite directement chaque fichier Markdown ;
- reflète donc automatiquement les corrections et les nouveaux ouvrages ;
- prend aussi en compte un nouveau fichier de catalogue dès que son lien est ajouté à la liste ci-dessous ;
- permet la recherche plein texte, les filtres par auteur et éditeur, le tri, les favoris locaux, l’affichage en cartes ou en tableau et l’export CSV de la sélection.

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

1. aucune photographie n’est archivée ici ;
2. aucune donnée incertaine n’est complétée arbitrairement ;
3. les corrections futures conservent les identifiants existants ;
4. le classement thématique sera ajouté après stabilisation de l’inventaire.

## Statuts

- sans mention : référence confirmée ;
- `à confirmer` : une donnée secondaire reste incertaine ;
- `à compléter` : une partie de la référence manque encore.
