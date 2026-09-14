import argparse
import json
import math
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT.parent / "mytcg-cms" / ".tmp" / "data.db"
MAPPING_PATH = ROOT / "data" / "cardtrader-mapping.json"
CACHE_PATH = ROOT / ".cache" / "cardtrader" / "prices.json"
ENV_PATH = ROOT / ".env.local"
API_URL = "https://api.cardtrader.com/api/v2/marketplace/products"
EU_COUNTRIES = {
    "AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "ES", "FI",
    "FR", "GR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL",
    "PT", "RO", "SE", "SI", "SK",
}


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def read_env(name):
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        if line.strip() and not line.lstrip().startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            if key.strip() == name:
                return value.strip().strip('"').strip("'")
    raise RuntimeError(f"Missing {name} in {ENV_PATH}")


def flatten_products(value):
    if isinstance(value, list):
        return [item for child in value for item in flatten_products(child)]
    if not isinstance(value, dict):
        return []
    if "blueprint_id" in value or "blueprintId" in value:
        return [value]
    return [item for child in value.values() for item in flatten_products(child)]


def market_price(payload, captured_at):
    offers = []
    for product in flatten_products(payload):
        price = product.get("price") or {}
        properties = product.get("properties_hash") or product.get("properties") or {}
        user = product.get("user") or {}
        cents = price.get("cents", product.get("price_cents"))
        currency = price.get("currency", product.get("price_currency"))
        country = user.get("country_code")
        try:
            cents = int(cents)
        except (TypeError, ValueError):
            continue
        if cents > 0 and currency == "EUR" and properties.get("condition") == "Near Mint" and country in EU_COUNTRIES:
            offers.append((cents, country))

    french = [cents for cents, country in offers if country == "FR"]
    scope = "FR" if len(french) >= 5 else "EU"
    scoped = french if scope == "FR" else [cents for cents, _ in offers]
    selected = sorted(scoped)[:10]
    minimum = 5 if scope == "FR" else 3
    price = None
    if len(scoped) >= minimum:
        middle = len(selected) // 2
        median_cents = selected[middle] if len(selected) % 2 else math.floor((selected[middle - 1] + selected[middle]) / 2 + 0.5)
        price = median_cents / 100

    return {
        "price": price,
        "priceCurrency": "EUR",
        "priceSource": "CardTrader",
        "priceUpdatedAt": captured_at,
        "priceSampleSize": len(selected) if price is not None else len(scoped),
        "priceScope": scope,
        "priceMethod": "median_lowest_listings",
    }


def fetch_price(blueprint_id, token):
    query = urllib.parse.urlencode({"blueprint_id": blueprint_id, "language": "en"})
    request = urllib.request.Request(
        f"{API_URL}?{query}",
        headers={"Authorization": f"Bearer {token}", "User-Agent": "mytcg-hub-price-sync/1.0"},
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        payload = json.loads(response.read().decode("utf-8"))
    captured_at = utc_now()
    return market_price(payload, captured_at)


def write_cache(cache):
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = CACHE_PATH.with_suffix(".tmp")
    temporary.write_text(f"{json.dumps(cache, indent=2, ensure_ascii=False)}\n", encoding="utf-8")
    temporary.replace(CACHE_PATH)


def update_record(database, table, card_id, blueprint_id, result=None):
    if result is None:
        database.execute(
            f"UPDATE {table} SET card_trader_blueprint_id = ? WHERE card_id = ?",
            (blueprint_id, card_id),
        )
        return

    database.execute(
        f"""
        UPDATE {table}
        SET card_trader_blueprint_id = ?, price = ?, price_currency = ?,
            price_source = ?, price_updated_at = ?, price_sample_size = ?,
            price_scope = ?, price_method = ?, updated_at = ?
        WHERE card_id = ?
        """,
        (
            blueprint_id, result["price"], result["priceCurrency"],
            result["priceSource"], result["priceUpdatedAt"], result["priceSampleSize"],
            result["priceScope"], result["priceMethod"], result["priceUpdatedAt"], card_id,
        ),
    )


def main():
    parser = argparse.ArgumentParser(description="Sync CardTrader blueprint IDs and market prices into local Strapi.")
    parser.add_argument("--table", choices=["cards", "card_printings"], default="cards")
    parser.add_argument("--blueprints-only", action="store_true")
    parser.add_argument("--rebuild-cache-from-db", action="store_true")
    parser.add_argument("--refresh", action="store_true", help="Ignore cached price responses.")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing prices instead of skipping them.")
    parser.add_argument("--only-missing-prices", action="store_true", help="Only process records whose price is NULL.")
    parser.add_argument("--only-null-from-db", action="store_true", help="Build the worklist directly from rows whose price is NULL in the database.")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--delay", type=float, default=1.05)
    args = parser.parse_args()

    if args.table == "card_printings":
        parser.error("This legacy sync is EN-only. Use sync:cardtrader-printing-price with an explicit language and verified blueprint instead.")

    mapping = json.loads(MAPPING_PATH.read_text(encoding="utf-8"))
    items = list(mapping.items())
    cache = json.loads(CACHE_PATH.read_text(encoding="utf-8")) if CACHE_PATH.exists() else {"prices": {}, "failures": {}}
    database = sqlite3.connect(DB_PATH, timeout=30)

    if args.only_null_from_db:
        query = f"""
            SELECT card_id, card_trader_blueprint_id
            FROM {args.table}
            WHERE published_at IS NOT NULL
              AND price IS NULL
              AND card_trader_blueprint_id IS NOT NULL
            ORDER BY card_id
        """
        items = [(card_id, blueprint_id) for card_id, blueprint_id in database.execute(query).fetchall()]

    if args.rebuild_cache_from_db:
        rebuilt = {"prices": {}, "failures": {}}
        rows = database.execute(
            """
            SELECT card_id, card_trader_blueprint_id, price, price_currency,
                   price_source, price_updated_at, price_sample_size,
                   price_scope, price_method
            FROM {table}
            WHERE published_at IS NOT NULL AND price_updated_at IS NOT NULL
            """.format(table=args.table)
        )
        for card_id, blueprint_id, price, currency, source, updated_at, sample_size, scope, method in rows:
            rebuilt["prices"][blueprint_id] = {
                "fetchedAt": updated_at,
                "result": {
                    "price": price,
                    "priceCurrency": currency,
                    "priceSource": source,
                    "priceUpdatedAt": updated_at,
                    "priceSampleSize": sample_size,
                    "priceScope": scope,
                    "priceMethod": method,
                },
            }
        write_cache(rebuilt)
        database.close()
        print(f"Cache rebuilt: {len(rebuilt['prices'])}", flush=True)
        return

    token = None if args.blueprints_only else read_env("CARDTRADER_API_TOKEN")

    for card_id, blueprint_id in mapping.items():
        update_record(database, args.table, card_id, blueprint_id)
    database.commit()
    print(f"Blueprint IDs written: {len(mapping)} ({args.table})", flush=True)

    if args.blueprints_only:
        database.close()
        return

    if args.limit:
        items = items[: args.limit]

    fetched = reused = failures = 0
    try:
        for index, (card_id, blueprint_id) in enumerate(items, start=1):
            current = database.execute(
                f"SELECT price FROM {args.table} WHERE card_id = ?",
                (card_id,),
            ).fetchone()
            has_price = current and current[0] is not None
            if args.only_missing_prices and has_price:
                reused += 1
                print(f"[{index}/{len(items)}] {card_id}: skipped existing price", flush=True)
                continue
            if not args.overwrite and has_price:
                reused += 1
                print(f"[{index}/{len(items)}] {card_id}: skipped existing price", flush=True)
                continue
            cached = cache["prices"].get(blueprint_id)
            if cached and not args.refresh:
                result = cached["result"]
                reused += 1
            else:
                result = None
                for attempt in range(1, 4):
                    try:
                        result = fetch_price(blueprint_id, token)
                        break
                    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
                        if attempt == 3:
                            cache["failures"][card_id] = {"blueprintId": blueprint_id, "error": str(error), "at": utc_now()}
                            write_cache(cache)
                            failures += 1
                        else:
                            time.sleep(attempt * 3)
                if result is None:
                    print(f"[{index}/{len(items)}] {card_id}: failed", flush=True)
                    continue
                cache["prices"][blueprint_id] = {"fetchedAt": result["priceUpdatedAt"], "result": result}
                cache["failures"].pop(card_id, None)
                write_cache(cache)
                fetched += 1
                time.sleep(args.delay)

            update_record(database, args.table, card_id, blueprint_id, result)
            database.commit()
            value = "no price" if result["price"] is None else f"EUR {result['price']:.2f}"
            print(f"[{index}/{len(items)}] {card_id}: {value} ({result['priceScope']}, n={result['priceSampleSize']})", flush=True)
    finally:
        database.close()

    print(json.dumps({"cards": len(items), "fetched": fetched, "reused": reused, "failures": failures}, indent=2), flush=True)


if __name__ == "__main__":
    main()
