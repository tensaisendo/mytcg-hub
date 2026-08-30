# Checklist de preproduction

## Perimetre valide localement

- Catalogue de 765 cartes et medias associes.
- Enrichissement officiel et prix CardTrader.
- Inscription et connexion Strapi.
- Session frontend dans un cookie HTTP-only.
- Liste d'envies par utilisateur.
- Quantite possedee par utilisateur et par carte.
- Fusion des favoris locaux lors de la premiere connexion.

## Infrastructure requise

### Strapi

- Hebergement Node.js 20 compatible avec Strapi 5.
- Base PostgreSQL persistante.
- Stockage media externe persistant, par exemple S3 ou Cloudinary.
- URL HTTPS stable pour l'API et l'administration.
- Sauvegardes automatiques de PostgreSQL et des medias.

Ne pas utiliser SQLite ni `public/uploads` comme stockage de production.

### Frontend

- Deploiement Next.js avec `NEXT_PUBLIC_STRAPI_URL` dirige vers la preproduction Strapi.
- HTTPS obligatoire pour que le cookie de session soit marque `Secure`.
- Domaine de preproduction distinct du domaine public final.

## Variables Strapi

Generer des valeurs uniques et longues pour :

```text
APP_KEYS
API_TOKEN_SALT
ADMIN_JWT_SECRET
TRANSFER_TOKEN_SALT
JWT_SECRET
ENCRYPTION_KEY
DATABASE_URL
```

Ne jamais reutiliser les secrets locaux en preproduction ou en production.

## Ordre de mise en place

1. Creer PostgreSQL et le stockage media.
2. Deployer Strapi avec les variables de preproduction.
3. Installer et configurer le provider media choisi.
4. Transferer les composants, schemas, cartes, relations et utilisateurs de test autorises.
5. Transferer les 765 images vers le provider media.
6. Verifier les permissions publiques des cartes et authentifiees des `user-cards`.
7. Deployer Next.js avec l'URL Strapi de preproduction.
8. Tester inscription, connexion, deconnexion, wishlist et quantites possedees.
9. Tester une actualisation CardTrader sur un petit echantillon.
10. Activer les sauvegardes et les journaux avant toute ouverture publique.

## Avant la production publique

- Ajouter la page Extensions et la progression par extension.
- Ajouter une page Collection dediee avec les cartes manquantes.
- Configurer un fournisseur SMTP pour confirmation et recuperation de compte.
- Ajouter limitation de debit, politique de mot de passe et protection anti-abus.
- Definir les mentions legales, la confidentialite et la suppression de compte.
- Ajouter des tests de parcours automatises sur la preproduction.
