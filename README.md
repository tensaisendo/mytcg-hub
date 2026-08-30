This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Data migration

The WordPress to Strapi workflow and the CardTrader price commands are documented in [docs/MIGRATION_COMMANDS.md](docs/MIGRATION_COMMANDS.md).

The deployment prerequisites are tracked in [docs/PREPRODUCTION.md](docs/PREPRODUCTION.md).

Run `npm run` to list the available project commands.

### Add new cards or series from Media Library images

When the WordPress JSON is not available, upload the new card images in Strapi
first. The importer reads the Media Library, recognizes filenames such as
`OP09-001.png`, `OP09-001_P1.png`, `ST29-001.png` or `ST-29-001.png`, then
creates or completes cards depending on the selected language.

Cards are modeled in two levels:

- `Card` is the canonical gameplay card.
- `Card Printing` is the localized version with `FR`, `EN` or `JP` language,
  localized name, image and language-specific market price.

Price handling is split by language:

- `Card` stores the canonical `EN` market price.
- `Card Printing` stores the localized `FR` and `JP` market prices.
- Prices stay in EUR and keep using CardTrader as the source.
- Existing valid prices are preserved unless you explicitly overwrite them.

The frontend displays `FR` first when available, then falls back to `EN`, then
`JP`, then the legacy fields stored directly on `Card`.

Dry-run one series:

```bash
npm run import:cards-from-media -- --series OP09 --limit 5
```

Dry-run all configured new series:

```bash
npm run import:cards-from-media
```

Compact dry-run summary:

```bash
npm run import:cards-from-media -- --summary
```

Create the cards after checking the dry-run:

```bash
npm run import:cards-from-media -- --series OP09 --write
```

Import or refresh localized French printings from the `FR` Media Library folder:

```bash
npm run import:cards-from-media -- --language FR --summary
npm run import:cards-from-media -- --language FR --summary --write
```

Without `--write`, the command never creates entries. With `--language EN`, the
script creates missing canonical `Card` entries from the English official data
and updates their `EN` price fields on `Card`.

With `--language FR`, the script uses English official data for the canonical
`Card`, French official data for `Card Printing:FR`, and the image from the `FR`
Media Library folder. If a canonical card is missing, it is created before the
French printing. Existing French printings are updated when localized name or
effect data changes. `FR` prices are written on `Card Printing`.

`JP` follows the same structure once a Japanese official source is configured.

Missing `Set`, `Feature` and `Rarity` entries are created automatically in write
mode when official data is available. Missing `Treatment`, `Color`, `Type` or
`Attribute` entries are reported and must be created or corrected in Strapi
before the final import.

### Add cards from the WordPress JSON

1. Update `data/cards-export.json` with the new cards.
2. Upload the matching card images in the Strapi Media Library, for example in
   `EN/OP06`, `EN/OP07`, etc. The import script matches images by filename.
3. Enrich the JSON from the official One Piece Card Game data:

```bash
npm run enrich:cards
```

4. Run a small dry-run import:

```bash
npm run import:cards -- --limit 5
```

5. If the dry-run reports missing `Set`, `Feature`, `Rarity`, `Treatment`,
   `Color`, `Type` or `Attribute` entries, create them in Strapi and retry.
   Relation IDs are loaded from Strapi by `name`, `key` or `code`; they are not
   hardcoded in the import script.
6. When the dry-run is clean, set `DRY_RUN = false` in
   `scripts/importCardsToStrapi.js` and run:

```bash
npm run import:cards
```

## Deck regulations

Deck legality is based on dated regulations stored in Strapi. The application
supports banned cards, restricted cards and banned card pairs by canonical
`displayCode`, so alternate card arts follow the same rule.

The official Bandai page is checked automatically every Monday. To run the
same check manually from the Strapi project:

```bash
cd ../mytcg-cms
npm run regulations:check
```

The check only detects official changes. Creating and approving a new Strapi
regulation remains a manual operation. The complete procedure is documented in
[docs/MIGRATION_COMMANDS.md](docs/MIGRATION_COMMANDS.md#reglementation-des-decks).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
