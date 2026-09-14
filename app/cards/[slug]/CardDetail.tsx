"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { AuthDialog, type SessionUser } from "@/app/cards/CardsCatalog";
import WantedProfileButton from "@/components/WantedProfileButton";
import GameIdentity from "@/components/GameIdentity";
import { getCardDisplay, getRelationLabel, getTreatmentLabel, getStrapiMediaUrl, type Card, type CardLanguage } from "@/lib/strapi";

function subscribeWishlist(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("mytcg-wishlist", callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener("mytcg-wishlist", callback); };
}

function wishlistSnapshot() { return window.localStorage.getItem("mytcg-wishlist") || "[]"; }

function formatPrice(price: number | null) {
  if (price === null) return "Prix indisponible";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(price);
}

export default function CardDetail({ card, variants, initialLanguage = "EN" }: { card: Card; variants: Card[]; initialLanguage?: CardLanguage }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlLanguage = searchParams.get("lang");
  const [language, setLanguage] = useState<CardLanguage>(
    urlLanguage === "FR" || urlLanguage === "EN" || urlLanguage === "JP" ? urlLanguage : initialLanguage,
  );
  const [user, setUser] = useState<SessionUser | null>(null);
  const [owned, setOwned] = useState(0);
  const [wanted, setWanted] = useState(0);
  const [authOpen, setAuthOpen] = useState(false);
  const snapshot = useSyncExternalStore(subscribeWishlist, wishlistSnapshot, () => "[]");
  const localWishlist = useMemo(() => {
    try { return new Set(JSON.parse(snapshot) as string[]); }
    catch { return new Set<string>(); }
  }, [snapshot]);

  useEffect(() => {
    try {
      window.localStorage.setItem("mytcg-language", language);
      window.dispatchEvent(new Event("mytcg-language"));
    } catch {}
  }, [language]);

  useEffect(() => {
    if (urlLanguage === "FR" || urlLanguage === "EN" || urlLanguage === "JP") {
      setLanguage(urlLanguage);
    }
  }, [urlLanguage]);

  function changeLanguage(nextLanguage: CardLanguage) {
    setLanguage(nextLanguage);
    const params = new URLSearchParams(searchParams.toString());
    params.set("lang", nextLanguage);
    router.replace(`${pathname}?${params.toString()}`);
  }

  const loadEntry = useCallback(async () => {
    const response = await fetch("/api/user-cards", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    const currentPrintingId = getCardDisplay(card, language).printing?.documentId;
    const entry = payload.data.find((item: { printing: { documentId: string } }) => item.printing.documentId === currentPrintingId);
    setOwned(entry?.ownedQuantity || 0);
    setWanted(entry?.wantedQuantity || 0);
  }, [card, language]);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then(async (payload) => {
      if (!active || !payload?.user) return;
      setUser(payload.user);
      await loadEntry();
    });
    return () => { active = false; };
  }, [loadEntry]);

  async function persist(nextOwned: number, nextWanted: number) {
    const printingId = getCardDisplay(card, language).printing?.documentId;
    if (!printingId) return;
    const previous = { owned, wanted };
    setOwned(nextOwned); setWanted(nextWanted);
    const response = await fetch(`/api/user-cards/${printingId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { ownedQuantity: nextOwned, wantedQuantity: nextWanted } }),
    });
    if (!response.ok) { setOwned(previous.owned); setWanted(previous.wanted); setAuthOpen(true); return; }
    const payload = await response.json();
    if (typeof payload.meta?.berries === "number") setUser((current) => current ? { ...current, berries: payload.meta.berries } : current);
  }

  function toggleWanted() {
    if (user) { void persist(owned, wanted > 0 ? 0 : 1); return; }
    const next = new Set(localWishlist);
    const printingId = getCardDisplay(card, language).printing?.documentId;
    if (!printingId) return;
    if (next.has(printingId)) next.delete(printingId); else next.add(printingId);
    window.localStorage.setItem("mytcg-wishlist", JSON.stringify([...next]));
    window.dispatchEvent(new Event("mytcg-wishlist"));
  }

  async function authenticated(nextUser: SessionUser) {
    setUser(nextUser);
    setAuthOpen(false);
    const printingId = getCardDisplay(card, language).printing?.documentId;
    if (printingId && localWishlist.has(printingId)) await persist(owned, 1);
    else await loadEntry();
    window.localStorage.removeItem("mytcg-wishlist");
    window.dispatchEvent(new Event("mytcg-wishlist"));
    setAuthOpen(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null); setOwned(0); setWanted(0); setAuthOpen(false);
  }

  const favorite = user ? wanted > 0 : localWishlist.has(getCardDisplay(card, language).printing?.documentId || "");
  const display = getCardDisplay(card, language);
  const badge = getTreatmentLabel(display.treatment) || getRelationLabel(card.rarity, language);
  const image = display.image?.url;
  const languages = (["FR", "EN", "JP"] as CardLanguage[]).filter((item) =>
    item === "EN" || card.printings?.some((printing) => printing.language === item),
  );

  return (
    <main className="detail-shell">
      <header className="detail-nav">
        <Link className="brand" href="/cards"><span className="brand__mark">M</span><span>MYTCG</span><strong>HUB</strong></Link>
        <Link className="back-link" href="/cards">← Retour aux cartes</Link>
        <GameIdentity />
        <WantedProfileButton user={user} onClick={() => setAuthOpen(true)} />
      </header>

      <section className="detail-heading">
        <p>{display.cardId.replace("_", " · ")} <span>•</span> {getRelationLabel(card.rarity, language)} <span>•</span> {getRelationLabel(card.types?.[0], language)}</p>
        <h1>{display.name}</h1>
      </section>

      <div className="detail-layout">
        <section className="detail-art">
          {image && (
            <Image
              src={getStrapiMediaUrl(image)}
              alt={`${display.name} ${display.cardId}`}
              fill
              sizes="(max-width: 900px) 100vw, 42vw"
              quality={85}
              priority
              unoptimized
            />
          )}
          {badge && <span className="detail-art__badge">{badge}</span>}
        </section>

        <section className="detail-data">
          {languages.length > 1 && (
            <div className="language-switch" aria-label="Langue de la carte">
              {languages.map((item) => (
                <button
                  className={item === display.language ? "is-active" : ""}
                  key={item}
                  type="button"
                  onClick={() => changeLanguage(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
          <div className="detail-commerce">
            <div><span>Prix estimé</span><strong>{formatPrice(display.price)}</strong><small>{display.priceSource || "CardTrader"} · {display.priceScope || "EU"}</small></div>
            <button className={`detail-wishlist${favorite ? " is-active" : ""}`} type="button" onClick={toggleWanted}>{favorite ? "♥" : "♡"}<span>{favorite ? "Dans mes envies" : "Ajouter aux envies"}</span></button>
            <div className={`detail-quantity${owned > 0 ? " is-owned" : ""}`}><span>Possédées</span><div><button type="button" onClick={() => user ? void persist(Math.max(0, owned - 1), wanted) : setAuthOpen(true)}>−</button><strong>{owned}</strong><button type="button" onClick={() => user ? void persist(owned + 1, wanted) : setAuthOpen(true)}>+</button></div></div>
          </div>

          <div className="official-stats">
            <Stat label="Rareté" value={getRelationLabel(card.rarity, language) || null} />
            <Stat label="Traitement" value={getTreatmentLabel(display.treatment) || "Non renseigné"} />
            <Stat label={card.life !== null ? "Vie" : "Coût"} value={card.life ?? card.cost} />
            <Stat label="Attribut" value={<AttributeValue attributes={card.attributes || []} language={language} />} />
            <Stat label="Puissance" value={card.power} />
            <Stat label="Contre" value={card.counter} />
            <Stat label="Couleur" value={card.colors?.map((item) => getRelationLabel(item, language)).join(", ")} />
            <Stat label="Type de carte" value={card.types?.map((item) => getRelationLabel(item, language)).join(", ")} />
          </div>

          {display.distribution && (
            <div className="distribution-details">
              <div><span>Distribution</span><strong>{display.distribution}</strong></div>
              {display.acquisition && <div><span>Obtention</span><strong>{display.acquisition}</strong></div>}
              {display.event && <div><span>Événement</span><strong>{display.event}</strong></div>}
              {display.distributionRegion && <div><span>Région</span><strong>{display.distributionRegion}</strong></div>}
              {display.distributionSourceUrl && <a href={display.distributionSourceUrl} target="_blank" rel="noreferrer">Source officielle</a>}
            </div>
          )}

          <div className="detail-text"><h2>Type</h2><p>{card.features?.map((item) => getRelationLabel(item, language)).join(" / ") || "—"}</p></div>
          <div className="detail-text"><h2>Effet</h2><p>{display.effect || "Cette carte ne possède pas d’effet."}</p></div>
          <Link className="detail-set" href={`/cards?set=${encodeURIComponent(display.set?.name || "")}`}><Image className="detail-set__anchor" src="/assets/one-piece/ico_anchor_red.png" alt="" width={22} height={29} /><span>Extension</span><strong>{getRelationLabel(display.set, language) || "Non renseignée"}</strong></Link>
        </section>
      </div>

      {variants.length > 1 && (
        <section className="variants-section">
          <div><p>Autres versions</p><h2>Variantes de {card.displayCode}</h2></div>
          <div className="variants-row">
            {variants.map((variant) => (
                <Link className={variant.documentId === card.documentId ? "is-current" : ""} href={`/cards/${variant.slug}?lang=${language}`} key={variant.documentId}>
                {getCardDisplay(variant, language).image?.url && (
                  <Image
                    src={getStrapiMediaUrl(getCardDisplay(variant, language).image?.url)}
                    alt={variant.cardId}
                    width={110}
                    height={154}
                    sizes="110px"
                    quality={75}
                    unoptimized
                  />
                )}
                <span>{variant.variant || "Standard"}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {authOpen && <AuthDialog user={user} onClose={() => setAuthOpen(false)} onAuthenticated={authenticated} onLogout={logout} />}
    </main>
  );
}

function AttributeValue({ attributes, language }: { attributes: Card["attributes"]; language: CardLanguage }) {
  if (!attributes.length) return <>—</>;
  const names = new Set(attributes.map((item) => item.name));
  const has = (...values: string[]) => values.every((value) => names.has(value));
  const icon = has("Slash", "Strike") ? "ico_type06.png"
    : has("Slash", "Special") ? "ico_type07.png"
    : has("Strike", "Ranged") ? "ico_type08.png"
    : has("Strike", "Special") ? "ico_type09.png"
    : has("Strike", "Wisdom") ? "ico_type10.png"
    : has("Slash", "Wisdom") ? "ico_type11.png"
    : has("Special", "Wisdom") ? "ico_type13.png"
    : names.has("Strike") ? "ico_type01.png"
    : names.has("Slash") ? "ico_type02.png"
    : names.has("Special") ? "ico_type03.png"
    : names.has("Ranged") ? "ico_type04.png"
    : names.has("Wisdom") ? "ico_type05.png"
    : "ico_type12.png";
  const label = attributes.map((item) => getRelationLabel(item, language)).join(" / ");
  return <span className="attribute-value">{icon && <Image src={`/assets/one-piece/${icon}`} alt="" width={28} height={28} />}<span>{label}</span></span>;
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return <div className="stat-row"><span>{label}</span><strong>{value ?? "—"}</strong></div>;
}
