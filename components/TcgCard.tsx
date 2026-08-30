"use client";

import { useEffect, useRef, useState, type CSSProperties, PointerEvent } from "react";
import Link from "next/link";
import { Card, getCardDisplay, getRelationLabel, getStrapiImageUrl, type CardLanguage } from "@/lib/strapi";

const colorValues: Record<string, string> = {
  Red: "#dc3848",
  Blue: "#2b79c2",
  Green: "#2a9971",
  Purple: "#8864c8",
  Black: "#7d8390",
  Yellow: "#d8ad39",
};

const rarityLabels: Record<string, string> = {
  C: "Commune",
  UC: "Peu commune",
  R: "Rare",
  SR: "Super rare",
  SEC: "Secrète",
  L: "Leader",
};

function formatPrice(price: number | null) {
  if (price === null) return "Prix indisponible";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(price);
}

export default function TcgCard({
  card,
  view,
  language = "FR",
  favorite,
  ownedQuantity,
  onToggleFavorite,
  onOwnedChange,
  priority = false,
}: {
  card: Card;
  view: "grid" | "list";
  language?: CardLanguage;
  favorite: boolean;
  ownedQuantity: number;
  onToggleFavorite: () => void;
  onOwnedChange: (quantity: number) => void;
  priority?: boolean;
}) {
  const display = getCardDisplay(card, language);
  const imagePath = display.image?.url;
  const thumbnailImageUrl = getStrapiImageUrl(display.image, "small");
  const originalImageUrl = getStrapiImageUrl(display.image);
  const rarity = card.rarity?.name || "N/A";
  const badge = [getRelationLabel(card.rarity, language) || rarityLabels[rarity] || rarity, getRelationLabel(card.treatment, language)].filter(Boolean).join(" · ");
  const accent = colorValues[card.colors?.[0]?.name] || "#8b929e";
  const [loaded, setLoaded] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setLoaded(false);
    setImageAttempt(0);
  }, [thumbnailImageUrl]);

  useEffect(() => {
    if (imageRef.current?.complete) setLoaded(true);
  }, [thumbnailImageUrl, imageAttempt]);

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    if (view === "list") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    event.currentTarget.style.setProperty("--rotate-x", `${(0.5 - y) * 7}deg`);
    event.currentTarget.style.setProperty("--rotate-y", `${(x - 0.5) * 7}deg`);
    event.currentTarget.style.setProperty("--shine-x", `${x * 100}%`);
    event.currentTarget.style.setProperty("--shine-y", `${y * 100}%`);
  }

  function resetTilt(event: PointerEvent<HTMLElement>) {
    event.currentTarget.style.setProperty("--rotate-x", "0deg");
    event.currentTarget.style.setProperty("--rotate-y", "0deg");
  }

  return (
    <article
      className={`tcg-card tcg-card--${view}`}
      style={{ "--card-accent": accent } as CSSProperties}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
    >
      <Link className="tcg-card__visual" href={`/cards/${display.printing?.slug || card.slug}?lang=${language}`} aria-label={`Voir ${display.name}`}>
        {!loaded && imagePath && <div className="tcg-card__skeleton" aria-hidden="true" />}
        {imagePath ? (
          <img
            ref={imageRef}
            className="tcg-card__image"
            src={imageAttempt === 0 ? thumbnailImageUrl : imageAttempt === 1 ? `${thumbnailImageUrl}?retry=1` : `${originalImageUrl}?retry=1`}
            alt={display.image?.alternativeText || `${display.name} ${card.cardId}`}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={priority ? "high" : "auto"}
            onLoad={() => setLoaded(true)}
            onError={() => {
              if (imageAttempt < 2) {
                window.setTimeout(() => setImageAttempt((attempt) => attempt + 1), 350 * (imageAttempt + 1));
                return;
              }
              setLoaded(true);
            }}
          />
        ) : (
          <div className="tcg-card__missing">{card.displayCode}</div>
        )}
        <div className="tcg-card__shade" />
        <div className="tcg-card__shine" />
        <span className="tcg-card__rarity" title={badge}>{badge}</span>
        <span className={`tcg-card__price${display.price === null ? " is-missing" : ""}`}>
          {formatPrice(display.price)}
        </span>
      </Link>
      <div className="tcg-card__meta">
        <div>
          <p className="tcg-card__code">{card.cardId.replace("_", " · ")}</p>
          <h2><Link href={`/cards/${display.printing?.slug || card.slug}?lang=${language}`}>{display.name}</Link></h2>
        </div>
        <div className="tcg-card__stats" aria-label="Card statistics">
          {card.cost !== null && <span>Coût {card.cost}</span>}
          {card.power !== null && <span>{card.power} puissance</span>}
        </div>
        <div className={`owned-stepper${ownedQuantity > 0 ? " is-owned" : ""}`} aria-label={`Quantité possédée : ${ownedQuantity}`}>
          {ownedQuantity > 0 && <button type="button" onClick={() => onOwnedChange(ownedQuantity - 1)} aria-label={`Retirer un exemplaire de ${display.name}`}>−</button>}
          <span>{ownedQuantity}</span>
          <button type="button" onClick={() => onOwnedChange(ownedQuantity + 1)} aria-label={`Ajouter un exemplaire de ${display.name}`}>+</button>
        </div>
        <button
          className={`favorite-button${favorite ? " is-active" : ""}`}
          type="button"
          aria-label={favorite ? `Retirer ${display.name} de la liste d'envies` : `Ajouter ${display.name} à la liste d'envies`}
          aria-pressed={favorite}
          title={favorite ? "Retirer de la liste d’envies" : "Ajouter à la liste d’envies"}
          onClick={onToggleFavorite}
        >
          {favorite ? "♥" : "♡"}
        </button>
      </div>
    </article>
  );
}
