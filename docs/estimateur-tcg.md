# Estimateur TCG Pokémon et One Piece

## Statut

Projet futur. Ne pas commencer avant la finalisation et la première mise en
production du site One Piece actuel.

## Objectif

Créer un outil mobile-first permettant d’évaluer rapidement une carte ou un
produit scellé Pokémon ou One Piece afin de décider s’il faut l’acheter sur
Whatnot, Vinted, Leboncoin, Cardmarket ou dans un magasin physique en France
ou au Japon.

L’outil doit être techniquement isolé du catalogue et des fonctionnalités One
Piece existantes, même s’il est initialement développé dans le même dépôt.

Route envisagée : `/estimateur`.

Une extraction ultérieure vers un domaine ou une application autonome doit
rester possible.

## Parcours principal

L’utilisateur :

1. prend une photo, importe une capture d’écran, saisit un nom ou colle une URL ;
2. indique le prix demandé ;
3. sélectionne la plateforme ou le contexte d’achat ;
4. vérifie ou corrige le produit identifié ;
5. obtient immédiatement une estimation et un verdict.

Exemple de résultat :

| Information | Exemple |
| --- | --- |
| Produit identifié | Special Box Pokémon Center Hiroshima JP |
| Prix demandé | 145 € |
| Prix marché France | 149 € |
| Prix marché Japon | 121 € |
| Coût final estimé | 156 € |
| Plafond conseillé | 135 € |
| Verdict | 🔴 Passe |
| Confiance | Élevée |

## Produits couverts

* cartes seules non gradées ;
* cartes gradées ;
* boosters ;
* ETB ;
* displays et booster boxes ;
* coffrets et collections premium ;
* bundles ;
* starter decks ;
* produits promotionnels ;
* produits exclusifs japonais ou chinois.

## Jeux et langues

Jeux :

* Pokémon ;
* One Piece Card Game.

Langues :

* français ;
* anglais ;
* japonais ;
* chinois simplifié ou traditionnel ;
* coréen.

L’identification doit impérativement distinguer le jeu, le produit,
l’extension, la langue, la région, la variante, l’état et, pour une carte
gradée, la société de grading et la note.

## Sources de données

### CardTrader

Réutiliser en priorité l’intégration CardTrader déjà présente dans le projet.

CardTrader doit servir au catalogue et aux offres actives pour Pokémon et One
Piece, notamment :

* cartes seules ;
* langues et variantes ;
* extensions ;
* boosters ;
* displays ;
* produits scellés disponibles dans son catalogue.

Ne pas utiliser uniquement l’offre la moins chère comme prix marché.

Calculer une valeur robuste à partir d’offres réellement comparables, après
filtrage par le jeu, la référence exacte, la langue, l’édition, l’état, le type
de produit, la localisation et la fiabilité ou les caractéristiques du vendeur
lorsqu’elles sont disponibles.

Utiliser par exemple la médiane des premières offres comparables, avec
exclusion des valeurs aberrantes.

### Cardmarket

L’API officielle Cardmarket n’accepte plus de nouvelles demandes d’accès.

Utiliser les fichiers officiels téléchargeables du catalogue et du guide des
prix, mis à jour quotidiennement. Ne pas bâtir la fonctionnalité sur du
scraping Cardmarket.

### PriceCharting et eBay

Envisager PriceCharting pour les prix issus de ventes réalisées et les produits
gradés. Son API étant payante, l’intégration doit rester optionnelle et
configurable.

L’accès officiel eBay aux historiques de ventes étant restreint, ne pas rendre
la V1 dépendante de cette source.

### Bases complémentaires

Étudier uniquement si nécessaire :

* TCGdex ou Pokémon TCG API pour l’identification Pokémon ;
* JustTCG ou API TCG pour Pokémon et One Piece ;
* un catalogue interne pour les produits scellés japonais ou chinois absents
  des autres sources.

Éviter de dupliquer les données déjà disponibles dans CardTrader.

### Whatnot, Vinted et Leboncoin

Ces plateformes servent d’abord de contexte d’achat, pas de référence absolue
de prix.

En V1, l’utilisateur fournit une capture, un nom ou une URL, le prix demandé et
les frais connus.

Ne pas rendre la V1 dépendante d’une API non publique ou d’un scraping fragile
de ces plateformes.

## Calcul du coût final

Le coût final doit prendre en compte :

* prix demandé ou enchère ;
* frais acheteur ;
* frais de service ;
* frais de port ;
* répartition éventuelle du port sur plusieurs achats ;
* conversion yen/euro ou autre devise ;
* TVA ou douane éventuelle ;
* paramètres propres à chaque plateforme.

Les frais doivent être configurables afin de rester corrects si les
plateformes modifient leurs tarifs.

## Profils d’achat

### Collection

Plafond indicatif : 90 à 95 % du prix marché fiable, après déduction des frais.

### Bonne affaire

Plafond indicatif : 80 à 85 % du prix marché fiable, après déduction des frais.

### Revente

Plafond indicatif : 60 à 70 % selon la liquidité, les frais de revente et la
marge recherchée.

Les pourcentages doivent être configurables.

## Formules

Collection :

`plafond = prix marché fiable × tolérance du profil − frais acheteur − port − autres coûts`

Revente :

`plafond = prix de revente estimé − commission de vente − expédition − fiscalité éventuelle − marge recherchée − marge de risque`

## Verdict

L’outil doit produire un verdict immédiatement compréhensible :

* 🟢 Prends ;
* 🟠 Correct, sans être une affaire ;
* 🔴 Passe.

Le verdict doit expliquer brièvement son calcul et ne jamais masquer une
incertitude d’identification ou de prix.

## Niveau de confiance

* Élevé : code produit, code-barres ou numéro de carte reconnu avec langue et
  variante confirmées ;
* Moyen : produit identifié visuellement, avec quelques attributs à confirmer ;
* Faible : langue, variante, contenu, grading ou référence incertaine.

En confiance moyenne ou faible, demander une validation avant de donner un
verdict définitif.

## V1

La première version doit comporter :

* interface mobile-first ou PWA selon la stack déjà présente ;
* photographie ou import d’image ;
* recherche textuelle ;
* lecture de code-barres si raisonnablement réalisable ;
* identification Pokémon et One Piece ;
* cartes seules et principaux produits scellés ;
* réutilisation de CardTrader ;
* guide de prix Cardmarket quotidien ;
* saisie du prix demandé ;
* sélection de la plateforme ou du magasin ;
* calcul des frais ;
* choix du profil d’achat ;
* prix marché estimé ;
* plafond conseillé ;
* verdict ;
* historique local ou persistant selon l’architecture retenue.

La V1 ne doit pas nécessiter la création d’un catalogue éditorial Pokémon
complet dans le site One Piece.

## V2 éventuelle

* surveillance d’annonces ;
* historique et évolution des prix ;
* comparaison détaillée France/Japon ;
* calcul de liquidité ;
* détection d’anomalies et de contrefaçons probables ;
* mode live permettant d’enchaîner les captures ;
* apprentissage à partir des corrections de l’utilisateur ;
* alertes de prix ;
* moteur d’estimation exposable à d’autres interfaces.

## Hors périmètre de la V1

* application mobile iOS ou Android native ;
* achat ou enchère automatique ;
* scraping intensif de Whatnot, Vinted, Leboncoin ou Cardmarket ;
* garantie d’authenticité ;
* prédiction spéculative de prix futurs ;
* catalogue éditorial Pokémon complet ;
* refonte du site One Piece existant.

## Principes techniques

* préserver la stack existante ;
* isoler le moteur d’estimation dans un module dédié ;
* isoler chaque fournisseur de données derrière une interface commune ;
* ne jamais exposer les clés API côté client ;
* ajouter du cache et des limites d’appels ;
* conserver la provenance et la date de chaque prix ;
* permettre l’extraction ultérieure du moteur ;
* distinguer strictement prix affichés et ventes réalisées ;
* ne jamais comparer silencieusement deux langues, variantes ou états
  différents.

## État actuel de l’intégration CardTrader

L’intégration existante se trouve dans `mytcg-hub` et peut servir de base,
sans être encore une intégration Pokémon ni une fonctionnalité d’estimation.
Le site est actuellement une application Next.js 16/React 19 reliée à un CMS
Strapi ; les traitements CardTrader sont des scripts de maintenance côté
serveur, et non du code exécuté dans le navigateur.

* `scripts/fetchCardTraderBlueprints.py` récupère les extensions One Piece et
  leurs blueprints depuis l’API CardTrader, puis les conserve dans
  `.cache/cardtrader/blueprints.json`.
* `scripts/mapCardTraderBlueprints.py` associe les cartes locales aux
  blueprints en combinant code, extension, traitement et similarité d’image.
  Il produit `data/cardtrader-mapping.json` et
  `data/cardtrader-mapping-report.json`.
* `scripts/cardTraderPricing.js` contient le calcul commun de prix : filtrage
  EUR, Near Mint et vendeurs européens, exclusion des annonces non
  comparables (par exemple produit gradé, vendeur absent ou lot), préférence
  aux offres françaises lorsqu’elles sont assez nombreuses, puis médiane des
  dix offres comparables les moins chères. Il expose aussi un self-test.
* `scripts/syncCardTraderPrices.py` est le synchroniseur historique EN vers la
  base Strapi locale. Il sait reprendre un cache, temporiser les appels,
  actualiser les prix et limiter le traitement aux prix manquants.
* `scripts/syncCardTraderPrintingPrice.js` traite explicitement une impression
  FR ou JP après contrôle du blueprint, de l’extension et de l’absence
  d’ambiguïté ; il fonctionne en simulation par défaut avant toute écriture.
* `scripts/syncCardTraderLocalizedPrices.js` traite en lot les impressions FR
  et JP, conserve les prix existants, écarte les variantes ambiguës, limite les
  appels et produit `data/cardtrader-localized-report.json`.
* `scripts/cardTraderLanguages.test.cjs` couvre les règles de langue et de
  filtrage du calcul partagé.

Les données versionnées disponibles sont les associations carte/blueprint et
leurs rapports (`data/cardtrader-mapping*.json`), ainsi que le rapport de la
dernière synchronisation localisée. Les réponses brutes ou temporaires sont
conservées sous `.cache/cardtrader/` : blueprints, images de rapprochement,
prix EN, expansions, blueprints et prix localisés, ainsi que sauvegardes avant
écriture. Ce dossier est ignoré par Git et ne constitue pas une source de
données durable.

Les champs déjà prévus dans le type Strapi `card-printing` pour la provenance
sont `price`, `priceCurrency`, `priceSource`, `priceUpdatedAt`,
`priceSampleSize`, `priceScope`, `priceMethod`, `priceCondition`,
`priceSourceUrl` et `cardTraderBlueprintId`. Les impressions distinguent déjà
les langues FR, EN et JP ainsi qu’une éventuelle variante.

La variable d’environnement nécessaire aux scripts est
`CARDTRADER_API_TOKEN`. Les scripts Python la lisent dans
`mytcg-hub/.env.local` ; les scripts Node la lisent dans l’environnement du
processus. Les synchronisations vers Strapi utilisent également
`STRAPI_API_TOKEN` (ou le mécanisme de jeton de maintenance existant) et
`NEXT_PUBLIC_STRAPI_URL` pour localiser le CMS. Seuls les noms de variables et
des valeurs factices figurent dans `.env.example` : aucune valeur réelle ne
doit être commitée, documentée, journalisée ou envoyée au navigateur.

Les éléments directement réutilisables pour l’estimateur sont le cache, le
client API côté serveur, les reprises et simulations des synchronisations, le
filtrage et l’agrégation de prix, la provenance, la date de collecte, les
limites d’appels et le principe de mapping par blueprint. Il faudra toutefois
généraliser le modèle, actuellement centré sur les cartes One Piece non
gradées en état Near Mint et les langues EN/FR/JP, pour Pokémon, les produits
scellés, les autres langues, régions, variantes et états. Il faudra aussi
distinguer explicitement les offres actives des ventes réalisées ; les caches
et rapports existants ne remplacent pas un historique de prix conçu pour
l’estimateur.

## Critères d’acceptation de la future V1

Un utilisateur doit pouvoir, depuis son téléphone :

1. envoyer une photo ou saisir un produit ;
2. obtenir une identification ou choisir parmi plusieurs correspondances ;
3. entrer le prix demandé ;
4. choisir son contexte d’achat et son profil ;
5. obtenir en quelques secondes le coût final, le prix marché, le plafond et le
   verdict ;
6. voir les sources, leur fraîcheur et le niveau de confiance ;
7. corriger une mauvaise identification.

## Questions à résoudre avant implémentation

* Quelle est la stack exacte du projet actuel ?
* Quelle partie de l’intégration CardTrader est réutilisable ?
* CardTrader couvre-t-il suffisamment les produits scellés Pokémon ciblés ?
* Comment récupérer et synchroniser les fichiers Cardmarket ?
* Quel service de reconnaissance visuelle utiliser ?
* Où conserver l’historique ?
* Quel modèle de frais appliquer par plateforme ?
* Faut-il conserver `/estimateur` dans le site One Piece ou l’extraire après
  validation du MVP ?
