import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env.local"
CARDS_PATH = ROOT / "data" / "cards-enriched.json"
CACHE_DIR = ROOT / ".cache" / "cardtrader"
CACHE_PATH = CACHE_DIR / "blueprints.json"
API_URL = "https://api.cardtrader.com/api/v2"


def read_token():
    content = ENV_PATH.read_text(encoding="utf-8")
    match = re.search(r"(?m)^CARDTRADER_API_TOKEN\s*=\s*(.+)$", content)
    if not match:
        raise RuntimeError("Missing CARDTRADER_API_TOKEN in .env.local")
    return match.group(1).strip().strip("\"'")


def api_get(path, token, attempts=3):
    request = urllib.request.Request(
        f"{API_URL}/{path}",
        headers={"Authorization": f"Bearer {token}"},
    )
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                payload = json.load(response)
                return payload.get("array", []) if isinstance(payload, dict) else payload
        except (urllib.error.URLError, TimeoutError):
            if attempt == attempts:
                raise
            time.sleep(attempt * 2)


def get_display_code(collector_number):
    match = re.search(r"\b(OP0[1-5]|ST0[134])[-_ ]?(\d{3})", collector_number.upper())
    return f"{match.group(1)}-{match.group(2)}" if match else None


def compact_blueprint(blueprint, expansion):
    properties = blueprint.get("fixed_properties") or {}
    return {
        "id": blueprint["id"],
        "name": blueprint.get("name"),
        "version": blueprint.get("version"),
        "expansionId": blueprint.get("expansion_id"),
        "expansionCode": expansion.get("code"),
        "expansionName": expansion.get("name"),
        "collectorNumber": properties.get("collector_number"),
        "rarity": properties.get("onepiece_rarity"),
        "imageUrl": blueprint.get("image_url"),
        "cardMarketIds": blueprint.get("card_market_ids") or [],
    }


def save_cache(cache):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(f"{json.dumps(cache, indent=2, ensure_ascii=False)}\n", encoding="utf-8")


def main():
    token = read_token()
    cards = json.loads(CARDS_PATH.read_text(encoding="utf-8"))
    expected_codes = {card["slug"].split("_")[0].upper() for card in cards}
    expansions = [item for item in api_get("expansions", token) if item.get("game_id") == 15]

    if CACHE_PATH.exists():
        cache = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    else:
        cache = {"completedExpansionIds": [], "blueprints": {}}

    completed = set(cache["completedExpansionIds"])
    blueprints = cache["blueprints"]

    for index, expansion in enumerate(expansions, start=1):
        expansion_id = expansion["id"]
        if expansion_id in completed:
            continue

        print(f"[{index}/{len(expansions)}] {expansion['name']}", flush=True)
        items = api_get(f"blueprints/export?expansion_id={expansion_id}", token)

        for blueprint in items:
            collector_number = (blueprint.get("fixed_properties") or {}).get("collector_number") or ""
            display_code = get_display_code(collector_number)
            if display_code not in expected_codes:
                continue
            blueprints.setdefault(display_code, []).append(compact_blueprint(blueprint, expansion))

        completed.add(expansion_id)
        cache["completedExpansionIds"] = sorted(completed)
        save_cache(cache)
        time.sleep(0.25)

    candidate_count = sum(len(items) for items in blueprints.values())
    print(f"Completed expansions: {len(completed)}/{len(expansions)}")
    print(f"Codes covered: {len(blueprints)}/{len(expected_codes)}")
    print(f"Relevant blueprints: {candidate_count}")


if __name__ == "__main__":
    main()
