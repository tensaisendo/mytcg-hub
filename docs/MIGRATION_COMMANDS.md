# Commandes de migration WordPress vers Strapi

## Set editions

### Reprints and promotional identifiers

Bilan actualise du 3 septembre 2026 : 393 cartes EN rattrapees au total
(pilote inclus), dont 366 lors de la derniere passe. Une candidate EN reste
non confirmee : `ST14-010_R1` (Brook), presente dans le dossier ST26 EN mais
dont le champ produit officiel est vide. Aucun Set n'a ete devine pour elle.
Les nouvelles recherches par code complet ont permis de confirmer `P-105_P1`
et les promotions precedemment laissees de cote.
Le rattrapage localise est termine : 204 CardPrinting FR et 212 JP ont ete
creees puis verifiees par lots. L'audit final ne contient plus aucune candidate
automatique FR ou JP. Chaque impression conserve son image, son texte, son Set
et son prix propres a sa langue ; aucune Card partagee n'a ete recreee.
Les autres categories (identifiants existants, dossiers generiques, produits
ambigus et fiches partagees manquantes) ne sont pas declarees resolues.

Les recherches officielles promotionnelles utilisent le code complet (`P-014`),
pas une recherche generale sur `P`. Pour verifier un lot pendant des saisies de
prix FR/JP, les changements de prix et de publication sont consignes separement.
Les images, Sets, identifiants et textes localises doivent rester identiques ;
les anciennes donnees EN et de collection restent strictement controlees.

Les lots suivants ignorent les identifiants deja examines mais non confirmes,
conserves dans `unverifiedIds` des journaux. Pour les reexaminer explicitement :
`npm run recover:english-batch -- --limit 50 --retry-unverified` (simulation).

Rattrapage EN par lots, depuis `mytcg-hub` :

```powershell
npm run recover:english-batch -- --limit 25
npm run recover:english-batch -- --limit 25 --write
```

Rattrapage FR ou JP par lots, depuis `mytcg-hub` :

```powershell
npm run recover:localized-batch -- --language FR --limit 50
npm run recover:localized-batch -- --language FR --limit 50 --write
npm run recover:localized-batch -- --language JP --limit 50
npm run recover:localized-batch -- --language JP --limit 50 --write
```

La commande ignore les `printingId` deja presents et ne cree donc pas de
doublon. Elle exige une Card partagee existante, les donnees officielles exactes
de la langue, l'image du dossier localise et le Set correspondant. Avec
`--write`, elle sauvegarde SQLite, rejoue le meme lot, puis controle les textes,
images, Sets, anciennes Cards et collections. Une republication technique de
Strapi est comparee par `documentId`, pas par ses identifiants SQLite volatils.

Le plan `mytcg-cms/.tmp/reports/card-recovery-plan.json` doit exister (commande
`cards:plan-recovery` cote CMS). Les identifiants deja presents sont ignores.
Meme avec `--write`, une simulation est executee avant toute ecriture : seules
les cartes validees officiellement sont retenues, et une relation manquante
interrompt le lot. Limite de 1 a 50. Sauvegarde SQLite avant creation, journaux
JSON et comparaison des anciennes donnees apres import. Les cartes non confirmees
restent signalees, sans remplacement par une autre variante.

Deuxieme lot du 3 septembre 2026 : 24 nouvelles cartes EN creees et verifiees,
sur 25 candidates. `P-105_P1` non creee faute de correspondance produit officielle.
Total rattrape avec le pilote : 27 cartes. Rapport de ce lot :
`mytcg-cms/.tmp/reports/en-recovery-batch-1788443874438.json`.

Lot pilote EN du 3 septembre 2026 applique : `EB01-006_R1`, `OP01-006_R1`,
`OP01-024_R1`, tous dans PRB01 EN. Les prix restent null (aucun prix deduit).
Sauvegarde et resultat des controles :
`mytcg-cms/.tmp/reports/en-recovery-pilot.json`.
Les anciennes fiches, prix, images et collections ont ete compares a la sauvegarde.

L'import reconnait maintenant `P-001`, `_R1`, `_R2` et les suffixes combines,
sans les convertir en `_P1`. Un suffixe R ne signifie pas Alternative Art.
La selection officielle exige l'identifiant exact et le produit correspondant
au dossier ; aucun repli sur la carte sans suffixe ou sur une autre langue.
Le site JP est interroge pour les textes JP. Les imports FR/JP ne modifient plus
les champs de la Card partagee. Si celle-ci manque, le cas reste a examiner.
Les dossiers generiques de promotions restent bloques tant que leur produit
officiel precis n'est pas identifie.

Simulation ciblee depuis `mytcg-hub` :

```powershell
npm run import:cards-from-media -- --language EN --card-id EB01-006_R1 --only-missing --summary
```

`--only-missing` ignore les identifiants deja presents (Card pour EN,
CardPrinting pour FR/JP). Il ne corrige pas les images de fiches existantes.
Les collisions entre produits bloquent toujours l'import. Ne pas ajouter
`--write` a un import global avant examen des simulations et sauvegarde.

Rattrapage des cartes, depuis `mytcg-cms` : `npm run cards:plan-recovery`.
Cette simulation regenere l'audit puis classe les images sans fiche liee dans
`.tmp/reports/card-recovery-plan.md` et `.json`. Elle ne propose jamais de creer
une fiche dont l'identifiant existe deja et ne modifie rien dans Strapi.
Les codes promo, suffixes de reedition et collisions entre produits sont isoles.
Les candidats ne sont pas des payloads valides : verifier les sources officielles
de la bonne langue et du bon produit avant toute creation. `--write` est refuse.

Audit du 7 septembre 2026 apres rattrapage : 572 images restent classees pour
revue, dont 295 identites EN deja existantes, 18 produits EN ambigus, 202 dossiers
generiques (67 EN, 27 FR, 108 JP), 56 Cards partagees absentes (27 FR, 29 JP) et
une candidate EN non confirmee (`ST14-010_R1`). Ces categories ne doivent pas
etre importees globalement sans decision metier ou correspondance officielle.

Noms officiels FR (depuis `mytcg-cms`, Python 3 et Internet requis pour l'audit) :

```powershell
npm run sets:audit-names-fr
npm run sets:apply-names-fr
npm run sets:apply-names-fr -- --write
```

La premiere commande compare les noms aux pages produits Bandai FR, par code
exact et langue. La deuxieme simule ; seule la troisieme modifie les noms via
l'API locale Strapi, avec journal avant/apres et verification. Le token est lu
dans `mytcg-hub/.env.local`. Les prix, images et relations ne sont pas envoyes.
Les noms deja modifies depuis l'audit bloquent l'application pour eviter un
ecrasement ; les correspondances absentes ou ambigues ne sont pas appliquees.

Depuis `mytcg-cms`, `npm run sets:audit-coverage` produit un audit en lecture seule
dans `.tmp/reports/set-coverage.md` et `.json`, sans arreter Strapi. Il distingue
les images de cartes sans fiche dans leur langue, les relations incoherentes,
les noms non reconnus et les memes identifiants dans plusieurs produits.
Une correspondance de nom ne valide pas l'illustration. Ne pas importer ni
supprimer automatiquement les elements signales.

Un dossier produit sous EN, FR ou JP correspond a un Set localise.
Identite : `code:language`, par exemple `ST16:FR`. Le nom ne contient pas le code.
Les produits combines `OP14-EB04` et `OP15-EB04` restent distincts des produits JP.
Les dossiers sans code utilisent une cle stable `MEDIA-<folderId>:<language>`.
Ne plus remplir `labelFr`/`labelJp` pour les Sets. Les anciens Sets sont marques
`isLegacy=true`, exclus des filtres, conserves pour les liens non resolus.

Exception aux commandes hub ci-dessous : depuis **mytcg-cms**, appliquer le nouveau
schema en demarrant Strapi une fois, puis l'arreter avant l'ecriture :

```powershell
npm run sets:migrate-editions
npm run sets:migrate-editions -- --write
npm run develop
```

La simulation ne modifie pas SQLite. L'ecriture exige Strapi arrete, sauvegarde
la base dans `.tmp/backups`, puis modifie uniquement les Sets et leurs relations
dans une transaction. Les cartes/prix/images/collections sont controles avant et
apres. Les rapports sont dans `.tmp/reports/set-editions-*.json`.
Les liens utilisent l'image effectivement rattachee et son dossier, jamais le
prefixe du code de carte. Une image absente ou d'une autre langue est signalee,
pas remplacee. Les brouillons et les versions publiees sont traites sans publication.

L'import `import:cards-from-media` reutilise seulement un Set de la bonne langue
et du bon dossier. Il ne remplace plus les traductions des Sets. Il s'arrete avant
ecriture si le meme identifiant de carte correspond a plusieurs dossiers produits
ou contredit le Set existant : la prise en charge de plusieurs impressions d'une
meme variante/langue dans differents produits necessite une migration distincte.
Ne pas contourner ce controle en supprimant des cartes ou des prix.

L'ancien `importCardsToStrapi.js` WordPress refuse les ecritures lorsque des Sets
localises existent. Utiliser l'import depuis les medias pour les nouveaux imports.

Bilan de la migration du 2 septembre 2026 : 137 Sets localises (52 EN, 30 FR,
55 JP), 18 696 relations de lignes corrigees, brouillons et publications compris.
832 documents Card restent a examiner : 516 sans image et 316 avec une image
d'une autre langue. Leurs liens historiques sont conserves ; aucune image ou
carte n'a ete supprimee. Les CardPrinting ont toutes pu etre rattachees.
Cela ne garantit pas que chaque fichier uploade possede deja sa propre impression.

Tests : `npm run test:set-editions` dans mytcg-cms ;
`node --test scripts/importCardsFromMedia.test.cjs` dans mytcg-hub.

Toutes les commandes ci-dessous sont a lancer depuis le dossier `mytcg-hub`.

Pour afficher les commandes disponibles sans rien executer :

```bash
npm run
```

## Demarrer les applications

Frontend Next.js :

```bash
npm run dev
```

Strapi, depuis un second terminal :

```bash
cd ../mytcg-cms
npm run develop
```

## Uploader de gros dossiers d'images

Pour les dossiers de 90 a 360 images, eviter l'upload manuel via l'admin
Strapi. Utiliser la commande batch depuis le dossier `mytcg-cms`.

Dry-run :

```bash
cd ../mytcg-cms
npm run media:upload-folder -- --source "C:\path\to\OP09" --target "EN/OP09 - EMPERORS IN THE NEW WORLD"
```

Upload reel :

```bash
cd ../mytcg-cms
npm run media:upload-folder -- --source "C:\path\to\OP09" --target "EN/OP09 - EMPERORS IN THE NEW WORLD" --write
```

Options utiles :

```bash
npm run media:upload-folder -- --source "C:\path\to\OP09" --target "EN/OP09 - EMPERORS IN THE NEW WORLD" --write --concurrency 2 --retries 3
```

- `--source` : dossier local contenant les images.
- `--target` : dossier Media Library cible, avec son chemin complet.
- Sans `--write`, aucune image n'est uploadee.
- Les fichiers deja presents avec le meme nom dans le dossier cible sont
  ignores.
- Les doublons de noms locaux bloquent le lancement.
- A la fin, la commande verifie que chaque fichier local existe dans le dossier
  cible Strapi.
- Ne pas lancer cette commande en meme temps qu'un upload manuel dans l'admin
  sur le meme dossier.

## Pipeline sans JSON, depuis les images Strapi

Ce pipeline sert pour les nouvelles series quand les images sont deja uploadees
dans la Media Library Strapi et qu'il n'y a pas de nouveau JSON WordPress.

Le script reconnait les fichiers par nom, par exemple `OP09-001.png`,
`OP09-001_P1.png`, `ST29-001.png` ou `ST-29-001.png`, puis recupere les donnees
officielles depuis le site One Piece Card Game.

Depuis la preparation du multi-langue, `Card` represente la carte canonique
et `Card Printing` represente une impression localisee :

- `Card` garde les donnees de jeu communes : code, variante, stats, relations,
  rarete, extension et regles de deck.
- `Card Printing` porte `language` (`FR`, `EN`, `JP`), nom localise, image,
  effet localise si disponible et prix.
- Le frontend privilegie `FR`, puis retombe sur `EN`, puis `JP`, puis les
  anciens champs de `Card` si aucune impression n'existe encore.
- Le script depuis Media Library sait creer des impressions `EN`, `FR` ou `JP`
  avec `--language`.
- Par defaut, `--language EN` lit le dossier Media Library `EN`, `--language FR`
  lit `FR`, et `--language JP` lit `JP`.
- En `EN`, le script cree les cartes canoniques absentes depuis les donnees
  officielles anglaises, puis cree ou met a jour leur impression `EN`.
- En `FR`, le script utilise les donnees officielles anglaises pour la `Card`
  canonique, les donnees officielles francaises pour `Card Printing:FR`, et
  l'image du dossier Media Library `FR`. Si la `Card` canonique manque, elle est
  creee avant l'impression francaise.
- En `FR`, les impressions existantes sont aussi mises a jour si le nom ou
  l'effet localise a change.
- `JP` suit la meme structure une fois une source officielle japonaise configuree.
- Pour filtrer un autre dossier racine, utiliser `--media-folder "Nom du dossier"`.
- Pour les imports locaux filtres par dossier, le script lit la base SQLite
  Strapi locale afin de retrouver les chemins Media Library de facon fiable.

### Dry-run d'une serie

```bash
npm run import:cards-from-media -- --series OP09 --limit 5
```

- Ne cree aucune carte sans l'option `--write`.
- Ignore les cartes dont le `cardId` existe deja dans Strapi.
- Signale les relations manquantes avec `MISSING`.
- Signale les `Set` et `Feature` absents et indique qu'ils seraient crees.

### Dry-run de toutes les nouvelles series configurees

```bash
npm run import:cards-from-media
```

Version resumee, conseillee avant un gros import :

```bash
npm run import:cards-from-media -- --summary
```

Dry-run des images francaises :

```bash
npm run import:cards-from-media -- --language FR --summary
```

Creation ou mise a jour des impressions francaises :

```bash
npm run import:cards-from-media -- --language FR --summary --write
```

Dry-run des images japonaises :

```bash
npm run import:cards-from-media -- --language JP --summary
```

Le script detecte les series depuis les images selectionnees. Le nom du dossier
Media Library est utilise pour rattacher les cartes aux bons sets quand une
carte est une reedition ou une variante dont le code garde une ancienne serie.

### Creation reelle

```bash
npm run import:cards-from-media -- --series OP09 --write
```

En mode `--write`, les cartes absentes sont creees avec les donnees officielles
anglaises quand elles sont disponibles. Si une carte existe deja, le script peut
ajouter ou mettre a jour l'impression de la langue demandee sans recreer la
carte. Les `Set`, `Feature` et `Rarity` manquants sont crees automatiquement.
Les autres relations (`Treatment`, `Color`, `Type`, `Attribute`) doivent deja
exister dans Strapi ou etre creees manuellement apres lecture du dry-run.

## Pipeline complet des cartes avec JSON WordPress

L'ordre recommande pour reconstruire les donnees est le suivant.

### 1. Enrichir le JSON avec les donnees officielles

```bash
npm run enrich:cards
```

- Lit `data/cards-export.json`.
- Recupere les informations du site officiel One Piece Card Game.
- Genere `data/cards-enriched.json` et un rapport d'enrichissement.
- Ne modifie pas Strapi.

### 2. Importer les cartes dans Strapi

```bash
npm run import:cards
```

- Lit `data/cards-enriched.json`.
- Associe les medias et les relations Strapi.
- Charge les relations depuis Strapi par `name`, `key` ou `code`; les IDs ne
  sont pas hardcodes dans le script.
- Le comportement depend de `DRY_RUN` dans `scripts/importCardsToStrapi.js`.
- Avec `DRY_RUN = true`, aucune carte n'est creee.
- Avec `DRY_RUN = false`, les cartes absentes sont creees et publiees.

Verifier attentivement `DRY_RUN` avant chaque lancement.

Pour tester seulement les premieres cartes :

```bash
npm run import:cards -- --limit 5
```

Avant d'importer une nouvelle serie, creer ou verifier dans Strapi les instances
necessaires : `Set`, `Feature`, `Rarity`, `Treatment`, `Color`, `Type` et
`Attribute`. Le dry-run signale les instances manquantes avec `MISSING`.

### 3. Recuperer les blueprints CardTrader

```bash
npm run fetch:cardtrader-blueprints
```

- Interroge CardTrader avec `CARDTRADER_API_TOKEN` depuis `.env.local`.
- Met les blueprints en cache dans `.cache/cardtrader/blueprints.json`.
- Peut etre relance : les extensions deja terminees sont conservees.

### 4. Associer les cartes aux blueprints

```bash
npm run map:cardtrader-blueprints
```

- Compare code, edition, traitement et image.
- Genere `data/cardtrader-mapping.json`.
- Genere aussi `data/cardtrader-mapping-report.json` avec les niveaux de confiance.
- Ne recupere pas les prix et ne recree pas les cartes.

### 5. Synchroniser les prix

A partir de maintenant, la synchronisation des prix suit le split de modèle :

- `Card` porte les prix des cartes `EN`
- `Card Printing` porte les prix `FR` et `JP`
- les prix sont toujours en EUR et toujours issus de CardTrader
- les prix deja valides sont preserves sauf si on force l'ecrasement

Avec le cache existant :

```bash
npm run sync:cardtrader-prices
```

- Reutilise les reponses deja en cache.
- Inscrit les blueprint IDs et les prix dans le Strapi local.
- Est rapide si les 765 prix sont deja en cache.

Pour forcer une actualisation complete depuis CardTrader :

```bash
npm run sync:cardtrader-prices -- --refresh
```

- Ignore les anciens prix en cache.
- Effectue environ un appel API par seconde.
- Prend environ 15 minutes pour 765 cartes.
- Ne cree et ne supprime aucune carte.

Options utiles :

```bash
npm run sync:cardtrader-prices -- --limit 5
npm run sync:cardtrader-prices -- --blueprints-only
npm run sync:cardtrader-prices -- --rebuild-cache-from-db
npm run sync:cardtrader-prices -- --table cards
```

- `--limit 5` : traite seulement les cinq premieres associations.
- `--blueprints-only` : inscrit uniquement les IDs CardTrader, sans chercher les prix.
- `--rebuild-cache-from-db` : reconstruit le cache a partir des prix deja presents dans Strapi.
- `--table cards` : cible les prix EN sur `Card`.
- `--table card_printings` : desactive sur ce script historique EN pour eviter de copier un prix EN vers FR/JP.
- `--overwrite` : force l'ecriture d'un prix meme si un prix existe deja.

## Verifications

### Prix FR/JP : traitement global

```bash
npm run sync:cardtrader-localized-prices
npm run sync:cardtrader-localized-prices -- --write
```

La premiere commande est un dry-run : elle inspecte toutes les CardPrinting FR
et JP publiees, sans ecrire dans Strapi. La seconde complete les prix manquants
dont la correspondance et le nombre d'offres sont suffisants, puis relit chaque
prix ecrit. Les Cards EN et les prix deja presents ne sont pas modifies.

Les offres sont demandees par extension/langue. Le cache dedie expire apres
24 heures ; `--refresh` le renouvelle. Le rapport complet, incluant les cas a
revoir et les erreurs, est `data/cardtrader-localized-report.json`.
Un redemarrage conserve les prix deja ecrits et peut reutiliser le cache.

Le rapprochement automatique exige une version de base, un code exact,
une extension exacte et la langue disponible. Les variantes, traitements
speciaux et correspondances multiples restent a valider manuellement.
Les brouillons avec des changements en attente ne sont pas publies par ce
script. Des instantanes des champs scalaires avant ecriture sont conserves
dans `.cache/cardtrader/localized-v1/` (ce ne sont pas des sauvegardes completes).

### Prix FR/JP : test unitaire sur une carte

Le script historique reste reserve aux prix EN. Pour FR/JP, verifier la
reference CardTrader et son extension. Le pilote ci-dessous n'accepte que les
versions de base dont le code et l'extension correspondent, sans variante.
Les variantes et reimpressions ambigues demandent une validation supplementaire.

```bash
npm run sync:cardtrader-printing-price -- --language JP --card-id OP09-001 --blueprint-id 313141 --expansion-id 3848
```

Sans `--write`, aucune donnee Strapi n'est modifiee. Ajouter `--write` pour
enregistrer et publier le prix de cette seule CardPrinting si elle n'en a pas.
Utiliser `--language FR` pour tester les offres francaises de la meme reference.
Le script verifie aussi `onepiece_language` sur chaque offre, conserve les prix
existants et n'utilise pas l'ancien cache EN. Seules les offres EUR, Near Mint,
non gradees/non signees/non alterees et disponibles sont admissibles.
Il faut 5 offres de vendeurs FR, sinon au moins 3 offres EU (marche indique EU).
Le prix est une mediane des 10 offres les moins cheres, pas un prix de vente realise.
En dessous du seuil, aucun prix n'est ecrit. Le frontend ne remplace jamais un
prix FR/JP manquant par le prix EN.

```bash
node --test scripts/cardTraderLanguages.test.cjs scripts/importCardsFromMedia.test.cjs
```

Tester uniquement la formule de calcul du prix :

```bash
npm run test:cardtrader-price
```

Verifier le code du frontend :

```bash
npm run lint
npm run build
```

## Reglementation des decks

La source officielle est la page Bandai :
`https://en.onepiece-cardgame.com/news/restriction.html`.

Pour comparer manuellement la reglementation enregistree dans le projet avec
la page officielle, lancer la commande depuis Strapi :

```bash
cd ../mytcg-cms
npm run regulations:check
```

- Un message `Deck regulation is current` signifie que la date et les codes
  correspondent toujours.
- Un message `Deck regulation update detected` signifie qu'une verification
  humaine et une nouvelle version Strapi sont necessaires.
- Cette verification est aussi executee automatiquement chaque lundi par
  `.github/workflows/check-deck-regulations.yml` dans le projet `mytcg-cms`.
- Le controle automatique detecte les changements, mais ne modifie jamais les
  regles de production sans validation.

### Creer une nouvelle reglementation dans Strapi

1. Ouvrir le Content Manager de Strapi.
2. Dans `Deck Regulation`, creer une entree avec un nom, le format `standard`,
   la date officielle d'entree en vigueur et l'URL source Bandai.
3. Activer cette entree. Une date future ne remplacera la reglementation
   courante qu'a partir du jour indique.
4. Dans `Card Restriction`, creer une entree par regle et la relier a la
   nouvelle `Deck Regulation`.
5. Utiliser le `displayCode` officiel, sans variante (`OP06-047`, et non
   `OP06-047_P1`).
6. Pour `banned`, mettre `maxCopies` a `0`.
7. Pour `restricted`, renseigner la quantite maximale autorisee.
8. Pour `banned_pair`, renseigner une carte dans `displayCode` et l'autre dans
   `pairedDisplayCode`.
9. Tester un deck concerne avant la mise en production.

L'ancienne reglementation peut rester active jusqu'a la date d'effet de la
nouvelle. Le moteur choisit automatiquement la version active la plus recente
dont la date d'effet est atteinte.

## Ancienne commande ciblee

```bash
npm run fetch:card-names
```

Cette commande ne recupere que les noms officiels dans `data/card-names.json`.
Pour une reconstruction complete, utiliser plutot `npm run enrich:cards`.

## Routine conseillee

Pour une simple mise a jour des prix, seule cette commande est necessaire :

```bash
npm run sync:cardtrader-prices -- --refresh
```

Ne relancer le pipeline complet que lorsque le JSON WordPress, les cartes ou les images changent.
# Treatments existants

L'import depuis la Media Library conserve tout `treatment` deja renseigne
dans Strapi. Il complete uniquement les relations explicitement vides.
Pour corriger Manga Rare, SP ou Alternative Art : modifier le treatment
de la Card dans Strapi, puis publier. Aucun mapping par carte n'est requis.
Les nouvelles cartes conservent la deduction initiale du script, a verifier
manuellement pour les variantes speciales.

Test sans import ni ecriture en base :

```bash
node --test scripts/importCardsFromMedia.test.cjs
```

## Prix eBay vendus sans API payante

Ce pipeline complete uniquement les prix manquants et reste en dry-run par
defaut. Il genere une URL eBay avec les filtres `Vendus` et `Ventes terminees`
pour chaque carte. Les ventes validees sont saisies dans
`data/ebay-sold-observations.json`, puis le script calcule leur mediane.

```bash
npm run sync:ebay-sold-prices -- --language FR --limit 5
npm run sync:ebay-sold-prices -- --language JP --limit 5
```

Format d'une observation :

```json
{
  "cardId": "OP05-119_P2",
  "language": "FR",
  "soldPrice": 120.0,
  "currency": "EUR",
  "soldAt": "2026-08-30",
  "graded": false,
  "condition": "Near Mint",
  "sourceUrl": "https://www.ebay.fr/itm/..."
}
```

Au moins une vente en EUR, non gradee et munie d'une URL et d'une date est
necessaire. Une vente donne une fiabilite faible, deux une fiabilite moyenne,
et trois ou plus une fiabilite correcte. Les annonces actives, les cartes gradees et les devises non
converties sont refusees. Le rapport est ecrit dans
`data/ebay-sold-price-report.json`.

Apres verification du rapport :

```bash
npm run sync:ebay-sold-prices -- --language FR --write
```

Utiliser `--language EN` ou `--language JP` pour une autre langue. Les prix
existants sont preserves ; `--overwrite` doit rester reserve a une correction
explicite. Le script enregistre la mediane, la taille de l'echantillon et l'URL
source, puis relit chaque entree ecrite.

### Interface locale de validation

Quand Strapi et le frontend sont demarres, ouvrir :

```text
http://localhost:3000/price-review
```

L'interface charge une seule carte sans prix a la fois et affiche son image de
reference. Choisir EN, FR ou JP, puis Cardmarket ou eBay. L'outil ouvre la
recherche associee a la carte. Saisir une ou plusieurs offres Cardmarket ou
ventes eBay de la meme illustration. Chaque ligne doit contenir un prix EUR,
une date, une URL de la source choisie et la confirmation visuelle.

Le bouton de validation calcule la mediane et ecrit le prix dans `Card` pour EN
ou `CardPrinting` pour FR/JP. Il refuse une carte qui possede deja un prix ou
dont l'identite a change. L'outil est disponible automatiquement en local ; en
production, il reste desactive sauf avec `PRICE_REVIEW_ENABLED=true`.

Pour Cardmarket, recopier uniquement la valeur agregee `Tendance des prix` de
la page exacte de la carte. Le formulaire Cardmarket n'accepte qu'une valeur et
ne demande pas de selectionner trois offres. La taille d'echantillon reste vide
car Cardmarket ne publie pas le nombre de transactions utilisees. La date du
releve est automatiquement celle de la validation ; elle n'est pas saisie
manuellement. Pour eBay, la date de chaque vente reste obligatoire.

Cardmarket est enregistre avec `priceSource=Cardmarket` et
`priceMethod=cardmarket_trend`. eBay est enregistre avec
`priceSource=eBay` et `priceMethod=median_sold_listings`. Les deux sources ne
sont donc jamais confondues dans Strapi.

Configurer l'acces dans `.env.local`, puis redemarrer le frontend :

```dotenv
PRICE_REVIEW_USERNAME=price-admin
PRICE_REVIEW_PASSWORD=un-mot-de-passe-long-et-unique
PRICE_REVIEW_SESSION_SECRET=une-valeur-aleatoire-d-au-moins-32-caracteres
```

La session est signee, stockee dans un cookie HTTP-only et expire apres huit
heures. Ces valeurs ne doivent jamais utiliser les identifiants d'un compte
collectionneur ni etre exposees avec le prefixe `NEXT_PUBLIC_`.

### Corriger un prix deja valide

La file normale ne montre que les cartes sans prix. Pour retrouver une carte
deja renseignee, utiliser la recherche par code ou par nom dans la colonne de
gauche. L'outil affiche alors le prix et la source actuels. Saisir la nouvelle
observation, puis cocher explicitement la confirmation de remplacement avant
de cliquer sur `Corriger le prix`. Sans cette confirmation, l'API refuse toute
modification d'un prix existant.

### Filtrer la file de review

La file peut etre filtree par extension, type de version (`Carte de base` ou
`Variante`), rarete et traitement dans les trois langues. Pour FR et JP, la
rarete reste issue de la Card commune, mais le traitement est celui de la
CardPrinting selectionnee. Les raretes C et UC sont exclues par defaut ; cocher `Inclure C et UC`
pour les reintegrer. La recherche par code ou nom peut etre combinee avec les
filtres. Seules les cartes correspondant aux criteres sont chargees, une par une.

Le bloc `Traitement de cette variante` permet aussi de corriger une classification
erronee. Pour EN, la correction porte sur la Card. Pour FR et JP, elle porte
uniquement sur la CardPrinting selectionnee : deux impressions de langues
differentes peuvent donc avoir des traitements et meme des codes imprimes
differents. L'API verifie l'identite, relit la valeur publiee et invalide le
catalogue. Le prix et l'image ne sont pas modifies.
Les choix disponibles sont `Alternative Art`, `Manga Rare`, `Red Manga`, `SP`
et `Aucun traitement`. Ce dernier supprime explicitement une classification
erronee sans en substituer une autre.

Le bloc `Distribution de cette impression` permet de corriger independamment
la provenance de la carte selectionnee. Il accepte le nom de la distribution,
l'evenement, le mode d'obtention, la region et l'URL justificative. Les champs
Distribution, Evenement, Obtention et Region proposent des valeurs normalisees
mais restent editables pour les cas exceptionnels. La region est obligatoire
lorsqu'une distribution est renseignee. L'URL est recommandee : lorsqu'elle est
presente, la donnee recoit une date de verification ; sans URL, elle reste
explicitement non verifiee. L'API refuse une URL qui ne correspond pas au domaine officiel de la langue active :
`fr.onepiece-cardgame.com`, `en.onepiece-cardgame.com` ou
`www.onepiece-cardgame.com` pour JP. La date de verification est enregistree
automatiquement.

Le champ Distribution propose les valeurs deja etablies pour la langue active.
Il reste editable afin d'ajouter une valeur absente, mais une nouvelle saisie
doit reprendre exactement le nom officiel et etre accompagnee de sa page source.

Pour supprimer une attribution erronee, vider le champ `Distribution` puis
utiliser le bouton de suppression. Cette action efface uniquement les champs de
provenance. Elle ne valide pas le prix et ne modifie ni traitement, ni rarete,
ni image. EN cible la `Card` canonique ; FR et JP ciblent exclusivement la
`CardPrinting` selectionnee.

### Modele Card et CardPrinting

`Card` contient l'identite de jeu commune et les caracteristiques qui ne changent
pas selon la langue. `CardPrinting` represente l'objet collectionnable reel en
FR, EN ou JP et porte son propre `cardId`, visuel, texte, prix, Set et traitement.
La relation explicite `CardPrinting.card` est la seule source de rattachement :
le frontend ne suppose pas qu'un suffixe comme `_P1` designe la meme illustration
dans toutes les langues.

Lors d'une evolution de schema, la migration historique peut etre controlee puis
appliquee depuis le projet Strapi, avec Strapi arrete pour l'ecriture :

```bash
npm run printings:migrate-card-treatment
npm run printings:migrate-card-treatment -- --write
```

L'import Media Library remplit cette relation pour les nouvelles CardPrinting et
ne remplace jamais un traitement deja renseigne manuellement.

## Distributions officielles

Une distribution de tournoi n'est ni une rarete ni un traitement. `Promo`,
`SR` ou `Leader` restent des raretes. `Alternative Art`, `Manga Rare`, `SP` et
les variantes paralleles restent des traitements. `Championship`, `Winner
Pack`, `Regional`, `Treasure Cup`, `Tournament Pack` et `Event Pack` decrivent
la provenance d'une impression.

### Modele et identite

La provenance est portee par l'objet collectionnable de la langue concernee :
`Card` pour la version canonique EN actuelle et `CardPrinting` pour FR/JP. Les
champs sont `distribution`, `acquisition`, `event`, `distributionRegion`,
`distributionSourceUrl` et `distributionVerifiedAt`.

Une correspondance est identifiee par le code complet de l'impression, la
langue et la region. Ne jamais retirer un suffixe `_P1`, `_P2`, etc. et ne
jamais supposer que le meme suffixe designe la meme illustration dans deux
langues. Une distribution EN ne doit pas etre recopiee vers FR ou JP.

Les index officiels autorises sont declares dans
`data/distribution-sources.json`. Ils couvrent separement :

- FR : France ;
- EN : NA/EU/OC/LATAM/ME ;
- JP : Japon.

### Audit des sites officiels

L'audit est en lecture seule. Il parcourt les index et pages d'evenements,
extrait les codes de cartes rencontres et ecrit
`data/official-distribution-audit.json` :

```bash
npm run audit:official-distributions -- --language=FR --max-pages=80
npm run audit:official-distributions -- --language=EN --max-pages=80
npm run audit:official-distributions -- --language=JP --max-pages=80
```

Un code detecte n'est pas automatiquement une recompense. Une page peut aussi
lister les cartes autorisees, interdites, recommandees ou toutes les cartes
d'un produit. Avant de creer une correspondance, verifier sur la page que le
code apparait bien dans une section de recompense, participation, classement
ou produit distribue. Verifier ensuite l'illustration et le suffixe dans la
Media Library de la meme langue.

Pour chaque correspondance validee, conserver le nom officiel, le mode
d'obtention, l'evenement, la region, l'URL exacte et la date de verification.
Si la page prouve l'evenement mais pas le suffixe de l'image, laisser le cas en
attente plutot que de deviner.

### Simulation et ecriture

Le rattrapage est idempotent et fonctionne en simulation par defaut :

```bash
npm run backfill:printing-distribution
```

Examiner les nombres de fiches candidates et les divergences avant toute
ecriture. Appliquer uniquement le registre valide :

```bash
npm run backfill:printing-distribution -- --write
```

La synchronisation ne doit modifier ni rarete, ni traitement, ni image, ni
prix. Une nouvelle preuve peut completer une valeur vide. Une valeur existante
differente doit etre signalee comme modification et revue avant remplacement.
Apres une evolution du schema Strapi, redemarrer Strapi avant l'audit ou la
synchronisation.

### Maintenance courante

Pour chaque nouvelle saison, auditer les trois langues separement. Ajouter les
nouvelles correspondances validees, corriger celles dont une page officielle a
ete mise a jour, puis relancer la simulation. Les pages archivees restent des
preuves valides pour les anciennes cartes. Si Bandai indique que les lots
different selon la region, creer des correspondances regionales distinctes,
meme lorsque la langue imprimee est identique.

## Images des extensions

Le champ media `image` du type Strapi `Set` reste editable dans le Content
Manager. Les visuels importes peuvent etre associes en lot depuis
`mytcg-cms` avec une simulation :

```bash
npm run sets:link-images
```

La correspondance est stricte par langue, dossier et code de fichier :
`EN|FR/BOOSTERS`, `EN|FR/DECKS DE DEMARRAGE`, `JP/ブースター` et `JP/デッキ`.
Les codes `OPnn`, `PRBnn`, `EBnn` et `STnn` sont reconnus avec ou sans tiret.
Apres controle, arreter Strapi puis appliquer :

```bash
npm run sets:link-images -- --write
```

Une sauvegarde de `.tmp/data.db` est creee dans `.tmp/backups` avant toute
ecriture. Redemarrer ensuite Strapi. Un changement manuel ulterieur du champ
`image` reste prioritaire jusqu'a la prochaine execution explicite du script.

## Profils et prime Berry

Les donnees d'affichage du compte sont stockees dans `User Profile`, relie en
un-a-un a l'utilisateur Strapi. L'utilisateur peut modifier son avatar, son
pseudo et son adresse e-mail. Le changement d'identite et de mot de passe exige
le mot de passe actuel. La prime n'est jamais saisissable par le client : elle
est calculee par des recompenses idempotentes enregistrees dans `rewardKeys`.

| Activite | Berry |
|---|---:|
| Inscription | 1 000 |
| Premiere connexion | 250 |
| Premiere connexion de la journee | 100 |
| Nouvelle carte ajoutee a la collection | 25 |
| Nouvelle carte ajoutee aux favoris | 10 |
| Creation d'un deck | 500 |
| Extension completee | 2 500 |

Retirer puis remettre une carte, un favori ou un deck ne redonne pas la meme
recompense. `lastDailyReward` garantit egalement un seul bonus journalier.
