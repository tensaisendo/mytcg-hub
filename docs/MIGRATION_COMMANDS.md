# Commandes de migration WordPress vers Strapi

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
npm run sync:cardtrader-prices -- --table card_printings
npm run sync:cardtrader-prices -- --table card_printings --overwrite
```

- `--limit 5` : traite seulement les cinq premieres associations.
- `--blueprints-only` : inscrit uniquement les IDs CardTrader, sans chercher les prix.
- `--rebuild-cache-from-db` : reconstruit le cache a partir des prix deja presents dans Strapi.
- `--table cards` : cible les prix EN sur `Card`.
- `--table card_printings` : cible les prix FR/JP sur `Card Printing`.
- `--overwrite` : force l'ecriture d'un prix meme si un prix existe deja.

## Verifications

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
