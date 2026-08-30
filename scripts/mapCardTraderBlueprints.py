import io
import json
import math
import re
import sqlite3
import time
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent
CARDS_PATH = ROOT / "data" / "cards-enriched.json"
BLUEPRINTS_PATH = ROOT / ".cache" / "cardtrader" / "blueprints.json"
IMAGE_CACHE = ROOT / ".cache" / "cardtrader" / "images"
MAPPING_PATH = ROOT / "data" / "cardtrader-mapping.json"
REPORT_PATH = ROOT / "data" / "cardtrader-mapping-report.json"
DB_PATH = WORKSPACE / "mytcg-cms" / ".tmp" / "data.db"
UPLOADS_PATH = WORKSPACE / "mytcg-cms" / "public"

# These original-print images are nearly identical to later reprints. The
# official set carried by the enriched card data disambiguates them.
MANUAL_OVERRIDES = {
    "OP05-097": "270436",
    "OP05-007": "268461",
    "OP01-100": "244645",
    "OP01-070": "244584",
    "OP01-041": "244550",
    "OP01-016": "244494",
}


def normalize(value):
    return re.sub(r"[^a-z0-9]", "", (value or "").lower())


def treatment_name(card):
    nodes = (card.get("treatments") or {}).get("nodes") or []
    return nodes[0]["name"] if nodes else None


def expected_expansion(card):
    nodes = (card.get("sets") or {}).get("nodes") or []
    if nodes:
        match = re.match(r"([A-Z]+\d+)", nodes[0]["name"])
        if match:
            return match.group(1).lower()
    return card["slug"].split("-")[0].lower()


def collector_suffix(candidate, display_code):
    collector = (candidate.get("collectorNumber") or "").upper().replace("_", "-")
    normalized_code = display_code.upper()
    return collector[len(normalized_code):].lower() if collector.startswith(normalized_code) else ""


def text_score(card, candidate):
    display_code = card["slug"].split("_")[0].upper()
    variant = card["slug"].split("_", 1)[1].upper() if "_" in card["slug"] else None
    treatment = treatment_name(card)
    version = (candidate.get("version") or "").lower()
    suffix = collector_suffix(candidate, display_code)
    collector = (candidate.get("collectorNumber") or "").upper().replace("_", "-")
    score = 0

    if normalize(candidate.get("name")) == normalize(card["cardsFields"]["cardTitle"]):
        score += 40
    if candidate.get("expansionCode", "").lower() == expected_expansion(card):
        score += 25

    special_terms = ("alternate", "manga", "signed", "stamp", "parallel", "special", "treasure")
    is_special = bool(suffix) or any(term in version for term in special_terms)

    if not variant:
        if collector == display_code:
            score += 60
        if not is_special:
            score += 30
        else:
            score -= 40
    else:
        if is_special:
            score += 15

    if treatment == "Manga Rare":
        score += 100 if "manga" in version or suffix == "m" else -30
    elif treatment == "Alternative Art":
        if any(term in version for term in ("alternate", "parallel", "gold", "signed")):
            score += 45
        if suffix in ("a", "s", "m"):
            score += 20
    elif treatment == "SP":
        if re.search(r"\bsp\b|special", version) or "sp" in candidate.get("expansionCode", "").lower():
            score += 70

    return score


def load_local_images():
    database = sqlite3.connect(DB_PATH)
    rows = database.execute(
        """
        SELECT c.card_id, f.url
        FROM cards c
        JOIN files_related_mph m
          ON m.related_id = c.id
         AND m.related_type = 'api::card.card'
         AND m.field = 'image'
        JOIN files f ON f.id = m.file_id
        WHERE c.published_at IS NOT NULL
        """
    )
    result = {card_id: UPLOADS_PATH / url.lstrip("/") for card_id, url in rows}
    database.close()
    return result


def download_image(candidate):
    IMAGE_CACHE.mkdir(parents=True, exist_ok=True)
    target = IMAGE_CACHE / f"{candidate['id']}.img"
    if target.exists():
        return target

    request = urllib.request.Request(
        candidate["imageUrl"],
        headers={"User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        target.write_bytes(response.read())
    time.sleep(0.05)
    return target


def dct_matrix(size):
    result = np.zeros((size, size), dtype=np.float32)
    factor = math.pi / (2 * size)
    for row in range(size):
        scale = math.sqrt(1 / size) if row == 0 else math.sqrt(2 / size)
        for column in range(size):
            result[row, column] = scale * math.cos((2 * column + 1) * row * factor)
    return result


DCT = dct_matrix(32)


def image_signature(path):
    with Image.open(path) as source:
        image = source.convert("RGB")
        width, height = image.size
        crops = [
            image,
            image.crop((0, 0, width, int(height * 0.36))),
            image.crop((0, int(height * 0.70), width, height)),
        ]

        hashes = []
        histograms = []
        for crop in crops:
            gray = np.asarray(crop.convert("L").resize((32, 32)), dtype=np.float32)
            transformed = DCT @ gray @ DCT.T
            low = transformed[:8, :8].flatten()[1:]
            hashes.append(low > np.median(low))

            rgb = np.asarray(crop.resize((64, 64)), dtype=np.uint8)
            histogram = np.concatenate(
                [np.histogram(rgb[:, :, channel], bins=16, range=(0, 256))[0] for channel in range(3)]
            ).astype(np.float32)
            histogram /= np.linalg.norm(histogram) or 1
            histograms.append(histogram)

    return hashes, histograms


def image_similarity(first, second):
    first_hashes, first_histograms = first
    second_hashes, second_histograms = second
    weights = (0.35, 0.45, 0.20)
    scores = []
    for index, weight in enumerate(weights):
        hash_score = 1 - np.count_nonzero(first_hashes[index] != second_hashes[index]) / len(first_hashes[index])
        histogram_score = float(np.dot(first_histograms[index], second_histograms[index]))
        scores.append(weight * (hash_score * 0.65 + histogram_score * 0.35))
    return sum(scores)


def map_card(card, candidates, local_path):
    scored = sorted(
        ((text_score(card, candidate), candidate) for candidate in candidates),
        key=lambda item: item[0],
        reverse=True,
    )
    shortlist = [candidate for _, candidate in scored[:15]]

    if len(shortlist) == 1:
        candidate = shortlist[0]
        return candidate, 1.0, 1.0, "single_candidate"

    local_signature = image_signature(local_path)
    image_scores = []
    for candidate in shortlist:
        if not candidate.get("imageUrl"):
            continue
        try:
            candidate_path = download_image(candidate)
            similarity = image_similarity(local_signature, image_signature(candidate_path))
            candidate_text_score = text_score(card, candidate)
            combined_score = similarity + candidate_text_score * 0.0015
            image_scores.append((combined_score, similarity, candidate))
        except Exception as error:
            print(f"IMAGE_ERROR {candidate['id']}: {error}", flush=True)

    if not image_scores:
        return scored[0][1], 0.0, 0.0, "text_only"

    image_scores.sort(key=lambda item: item[0], reverse=True)
    best_combined, best_score, best_candidate = image_scores[0]
    runner_up = image_scores[1][0] if len(image_scores) > 1 else 0.0
    return best_candidate, best_score, best_combined - runner_up, "image"


def confidence_for(card, score, margin, method):
    if method == "single_candidate":
        return "high"
    if method == "image" and score >= 0.78 and margin >= 0.035:
        return "high"
    if method == "image" and score >= 0.72 and margin >= 0.015:
        return "medium"
    if not card.get("variant") and method == "text_only":
        return "medium"
    return "low"


def main():
    cards = json.loads(CARDS_PATH.read_text(encoding="utf-8"))
    cache = json.loads(BLUEPRINTS_PATH.read_text(encoding="utf-8"))
    blueprints = cache["blueprints"]
    local_images = load_local_images()
    mapping = {}
    report = []

    for index, card in enumerate(cards, start=1):
        card_id = card["slug"].upper()
        display_code = card_id.split("_")[0]
        candidates = blueprints.get(display_code, [])
        local_path = local_images.get(card_id)

        if not candidates or not local_path:
            report.append({"cardId": card_id, "confidence": "unresolved", "reason": "missing_candidates_or_image"})
            continue

        override_id = MANUAL_OVERRIDES.get(card_id)
        if override_id:
            candidate = next(item for item in candidates if str(item["id"]) == override_id)
            image_score, margin, method, confidence = 1.0, 1.0, "official_set_override", "high"
        else:
            candidate, image_score, margin, method = map_card(card, candidates, local_path)
            confidence = confidence_for(card, image_score, margin, method)
        entry = {
            "cardId": card_id,
            "blueprintId": str(candidate["id"]),
            "confidence": confidence,
            "method": method,
            "imageScore": round(image_score, 4),
            "margin": round(margin, 4),
            "collectorNumber": candidate.get("collectorNumber"),
            "version": candidate.get("version"),
            "expansion": candidate.get("expansionName"),
        }
        report.append(entry)
        if confidence == "high":
            mapping[card_id] = str(candidate["id"])

        if index % 25 == 0:
            print(f"Mapped {index}/{len(cards)}", flush=True)

    MAPPING_PATH.write_text(f"{json.dumps(mapping, indent=2)}\n", encoding="utf-8")
    counts = {}
    for entry in report:
        counts[entry["confidence"]] = counts.get(entry["confidence"], 0) + 1
    REPORT_PATH.write_text(
        f"{json.dumps({'counts': counts, 'cards': report}, indent=2, ensure_ascii=False)}\n",
        encoding="utf-8",
    )
    print(json.dumps(counts, indent=2))
    print(f"High-confidence mappings: {len(mapping)}/{len(cards)}")


if __name__ == "__main__":
    main()
