"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AuthDialog, type SessionUser } from "@/app/cards/CardsCatalog";
import WantedProfileButton from "@/components/WantedProfileButton";
import { getCardDisplay, getStrapiMediaUrl, type Card } from "@/lib/strapi";
import GameIdentity from "@/components/GameIdentity";

type DeckEntry = { card: Card; quantity: number; displayCode: string };
type Restriction = {
  type: "banned" | "restricted" | "banned_pair";
  displayCode: string;
  pairedDisplayCode: string | null;
  maxCopies: number | null;
};
type ValidationIssue = { type: string; message: string; displayCodes: string[] };
type Regulation = {
  name: string;
  effectiveFrom: string;
  sourceUrl: string;
  restrictions: Restriction[];
};
type Deck = {
  documentId: string;
  name: string;
  leader: Card;
  entries: DeckEntry[];
  validation: { total: number; valid: boolean; remaining: number; issues: ValidationIssue[] };
  regulation: Regulation | null;
};

function canonicalCards(cards: Card[]) {
  const byCode = new Map<string, Card>();
  for (const card of cards) {
    const code = card.displayCode || card.cardId;
    const current = byCode.get(code);
    if (!current || (!card.variant && current.variant)) byCode.set(code, card);
  }
  return [...byCode.values()];
}

function cardImage(card: Card) {
  const image = getCardDisplay(card).image;
  return image?.url ? getStrapiMediaUrl(image.url) : "";
}

function cardName(card: Card) {
  return getCardDisplay(card).name;
}

export default function DeckBuilder({ cards }: { cards: Card[] }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [regulation, setRegulation] = useState<Regulation | null>(null);
  const [entries, setEntries] = useState<DeckEntry[]>([]);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [leaderChoice, setLeaderChoice] = useState<Card | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [creatingDeck, setCreatingDeck] = useState(false);

  const allCanonical = useMemo(() => canonicalCards(cards), [cards]);
  const leaders = useMemo(() => allCanonical.filter((card) => card.types?.some((type) => type.name === "Leader")), [allCanonical]);

  async function loadDecks(selectId?: string) {
    const response = await fetch("/api/decks", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    setRegulation(payload.regulation);
    setDecks(payload.data);
    const selected = payload.data.find((item: Deck) => item.documentId === selectId) || payload.data[0] || null;
    setDeck(selected);
    setEntries(selected?.entries || []);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then(async (payload) => {
      if (!active) return;
      if (!payload?.user) { setAuthOpen(true); return; }
      setUser(payload.user);
      await loadDecks();
    });
    return () => { active = false; };
  }, []);

  const allowedCards = useMemo(() => {
    if (!deck) return [];
    const colors = new Set(deck.leader.colors.map((color) => color.name));
    const normalized = query.trim().toLowerCase();
    return allCanonical.filter((card) =>
      !card.types?.some((type) => type.name === "Leader") &&
      card.colors?.every((color) => colors.has(color.name)) &&
      (!normalized || cardName(card).toLowerCase().includes(normalized) || card.cardId.toLowerCase().includes(normalized)),
    );
  }, [allCanonical, deck, query]);

  const total = entries.reduce((sum, entry) => sum + entry.quantity, 0);

  const liveIssues = useMemo(() => {
    const quantities = new Map(entries.map((entry) => [entry.displayCode, entry.quantity]));
    const issues: ValidationIssue[] = [];
    for (const restriction of regulation?.restrictions || []) {
      const quantity = quantities.get(restriction.displayCode) || 0;
      if (restriction.type === "banned" && quantity > 0) {
        issues.push({ type: "banned", message: `${restriction.displayCode} est interdite dans ce format.`, displayCodes: [restriction.displayCode] });
      }
      if (restriction.type === "restricted" && quantity > (restriction.maxCopies ?? 1)) {
        issues.push({ type: "restricted", message: `${restriction.displayCode} dépasse la quantité autorisée.`, displayCodes: [restriction.displayCode] });
      }
      if (restriction.type === "banned_pair" && quantity > 0 && restriction.pairedDisplayCode && (quantities.get(restriction.pairedDisplayCode) || 0) > 0) {
        issues.push({ type: "banned_pair", message: `${restriction.displayCode} et ${restriction.pairedDisplayCode} ne peuvent pas être jouées ensemble.`, displayCodes: [restriction.displayCode, restriction.pairedDisplayCode] });
      }
    }
    return issues;
  }, [entries, regulation]);

  function maxCopies(displayCode: string) {
    const restriction = regulation?.restrictions.find((item) => item.displayCode === displayCode && item.type !== "banned_pair");
    if (restriction?.type === "banned") return 0;
    if (restriction?.type === "restricted") return restriction.maxCopies ?? 1;
    return 4;
  }

  function pairConflict(displayCode: string) {
    return regulation?.restrictions.some((restriction) => {
      if (restriction.type !== "banned_pair" || !restriction.pairedDisplayCode) return false;
      const counterpart = restriction.displayCode === displayCode
        ? restriction.pairedDisplayCode
        : restriction.pairedDisplayCode === displayCode ? restriction.displayCode : null;
      return counterpart ? entries.some((entry) => entry.displayCode === counterpart) : false;
    }) || false;
  }

  function openCreateDeck() {
    setMessage("");
    setLeaderChoice(leaders[0] || null);
    setCreating(true);
  }

  function addCard(card: Card) {
    const code = card.displayCode || card.cardId;
    const maximum = maxCopies(code);
    if (total >= 50 || maximum === 0 || pairConflict(code)) return;
    setEntries((current) => {
      const existing = current.find((entry) => entry.displayCode === code);
      if (existing) return existing.quantity >= maximum ? current : current.map((entry) => entry === existing ? { ...entry, quantity: entry.quantity + 1 } : entry);
      return [...current, { card, displayCode: code, quantity: 1 }];
    });
  }

  function changeQuantity(displayCode: string, quantity: number) {
    setEntries((current) => quantity <= 0 ? current.filter((entry) => entry.displayCode !== displayCode) : current.map((entry) => entry.displayCode === displayCode ? { ...entry, quantity: Math.min(maxCopies(displayCode), quantity) } : entry));
  }

  async function saveDeck() {
    if (!deck) return;
    setSaving(true); setMessage("");
    const response = await fetch(`/api/decks/${deck.documentId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { entries: entries.map((entry) => ({ cardDocumentId: entry.card.documentId, quantity: entry.quantity })) } }),
    });
    const payload = await response.json();
    if (!response.ok) setMessage(payload.error?.message || "La sauvegarde a échoué.");
    else {
      setDeck(payload.data);
      setEntries(payload.data.entries);
      setMessage(payload.data.validation.valid
        ? "Deck légal et sauvegardé."
        : payload.data.validation.issues.length
          ? `Deck sauvegardé, mais non conforme : ${payload.data.validation.issues[0].message}`
          : `Deck sauvegardé, encore ${payload.data.validation.remaining} cartes.`);
      await loadDecks(payload.data.documentId);
    }
    setSaving(false);
  }

  async function createDeck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!leaderChoice) { setMessage("Choisis un Leader."); return; }
    const name = String(new FormData(event.currentTarget).get("name") || "");
    setCreatingDeck(true);
    setMessage("");
    const response = await fetch("/api/decks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: { name, leaderDocumentId: leaderChoice.documentId } }) });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error?.message || "Création impossible.");
      setCreatingDeck(false);
      return;
    }
    if (typeof payload.meta?.berries === "number") setUser((current) => current ? { ...current, berries: payload.meta.berries } : current);
    setCreating(false); setLeaderChoice(null); await loadDecks(payload.data.documentId);
    setCreatingDeck(false);
  }

  async function deleteDeck() {
    if (!deck || !window.confirm(`Supprimer le deck « ${deck.name} » ?`)) return;
    const response = await fetch(`/api/decks/${deck.documentId}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json();
      setMessage(payload.error?.message || "La suppression a échoué.");
      return;
    }
    setMessage("");
    await loadDecks();
  }

  function importList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = String(new FormData(event.currentTarget).get("list") || "");
    const cardsByCode = new Map(allowedCards.map((card) => [(card.displayCode || card.cardId).toUpperCase(), card]));
    const imported = new Map<string, DeckEntry>();
    const errors: string[] = [];
    for (const original of text.split(/\r?\n/)) {
      const line = original.trim();
      if (!line || /^leader\s*:/i.test(line)) continue;
      const match = line.match(/^(?:(\d+)\s*[xX]?\s*)?([A-Z]{2,}\d*-\d{3})(?:\s*[xX]\s*(\d+))?$/i);
      if (!match) { errors.push(line); continue; }
      const quantity = Number(match[1] || match[3] || 1);
      const code = match[2].toUpperCase();
      const card = cardsByCode.get(code);
      const maximum = maxCopies(code);
      if (!card || quantity < 1 || quantity > maximum) { errors.push(line); continue; }
      const current = imported.get(code);
      const nextQuantity = (current?.quantity || 0) + quantity;
      if (nextQuantity > maximum) { errors.push(line); continue; }
      imported.set(code, { card, displayCode: code, quantity: nextQuantity });
    }
    for (const restriction of regulation?.restrictions || []) {
      if (restriction.type === "banned_pair" && restriction.pairedDisplayCode && imported.has(restriction.displayCode) && imported.has(restriction.pairedDisplayCode)) {
        errors.push(`${restriction.displayCode} + ${restriction.pairedDisplayCode}`);
      }
    }
    if (errors.length) { setMessage(`Lignes non reconnues : ${errors.slice(0, 3).join(", ")}`); return; }
    setEntries([...imported.values()]); setImporting(false); setMessage("Liste importée. Vérifie puis sauvegarde.");
  }

  async function authenticated(nextUser: SessionUser) { setUser(nextUser); setAuthOpen(false); await loadDecks(); }
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); setUser(null); setDeck(null); setDecks([]); setRegulation(null); setAuthOpen(true); }

  return (
    <main className="deck-shell">
      <header className="site-header">
        <Link className="brand" href="/cards"><span className="brand__mark">M</span><span>MYTCG</span><strong>HUB</strong></Link>
        <GameIdentity />
        <nav className="main-nav" aria-label="Navigation principale"><Link href="/cards">Cartes</Link><Link href="/sets">Extensions</Link><Link href="/collection">Collection</Link><Link href="/wishlist">Liste d’envies</Link><Link className="is-active" href="/decks">Decks</Link></nav>
        <button className="rules-header-button" type="button" onClick={() => setRulesOpen(true)} disabled={!regulation}><Image src="/assets/one-piece/ico_rules_white.png" alt="" width={22} height={18} />Règles et restrictions</button>
        <WantedProfileButton user={user} onClick={() => setAuthOpen(true)} />
      </header>

      <div className="deck-workspace">
        <aside className="deck-sidebar">
          <div><span>Mes decks</span><button type="button" onClick={openCreateDeck} aria-label="Créer un deck">+</button></div>
          {decks.map((item) => <button className={deck?.documentId === item.documentId ? "is-active" : ""} type="button" key={item.documentId} onClick={() => { setDeck(item); setEntries(item.entries); }}><span>{item.name}</span><small>{item.validation.total}/50</small></button>)}
          {!decks.length && <p>Aucun deck enregistré.</p>}
        </aside>

        {deck ? <>
          <section className="card-pool">
            <div className="deck-panel-title"><div><span>Cartes compatibles</span><h1>{cardName(deck.leader)}</h1></div><strong>{allowedCards.length}</strong></div>
            <input className="deck-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher par nom ou code" />
            <div className="pool-list">{allowedCards.map((card) => {
              const code = card.displayCode || card.cardId;
              const maximum = maxCopies(code);
              const incompatible = pairConflict(code);
              const quantity = entries.find((entry) => entry.displayCode === code)?.quantity || 0;
              return <article className={maximum === 0 || incompatible ? "is-restricted" : ""} key={code}>
                <div>{cardImage(card) && <Image src={cardImage(card)} alt="" width={56} height={78} unoptimized />}</div>
                <section><span>{code}</span><h2>{cardName(card)}</h2><small>{maximum === 0 ? "Interdite" : incompatible ? "Paire incompatible" : maximum < 4 ? `Limitée à ${maximum}` : `${card.types?.[0]?.name} · Coût ${card.cost ?? "—"}`}</small></section>
                <button type="button" onClick={() => addCard(card)} disabled={quantity >= maximum || incompatible || total === 50}>+</button>
              </article>;
            })}</div>
          </section>

          <section className="deck-composition">
            <div className="deck-summary"><div className="leader-mini">{cardImage(deck.leader) && <Image src={cardImage(deck.leader)} alt="" width={58} height={81} unoptimized />}<div><span>Leader</span><strong>{cardName(deck.leader)}</strong><small>{deck.leader.cardId}</small></div></div><div className={`deck-count${total === 50 && liveIssues.length === 0 ? " is-valid" : ""}`}><strong>{total}</strong><span>/ 50</span></div></div>
            {regulation && <div className="deck-regulation"><a href={regulation.sourceUrl} target="_blank" rel="noreferrer"><span>Réglementation</span><strong>{regulation.name}</strong></a></div>}
            <div className="deck-toolbar"><button type="button" onClick={() => setImporting(true)}>Importer une liste</button><button type="button" onClick={() => void deleteDeck()}>Supprimer</button><button className="save-deck" type="button" onClick={() => void saveDeck()} disabled={saving}>{saving ? "Sauvegarde..." : "Sauvegarder"}</button></div>
            {message && <p className="deck-message">{message}</p>}
            {liveIssues.length > 0 && <div className="deck-issues">{liveIssues.map((issue) => <p key={`${issue.type}-${issue.displayCodes.join("-")}`}>{issue.message}</p>)}</div>}
            <div className="deck-entries">{[...entries].sort((a, b) => (a.card.cost ?? 99) - (b.card.cost ?? 99)).map((entry) => <article className={liveIssues.some((issue) => issue.displayCodes.includes(entry.displayCode)) ? "is-restricted" : ""} key={entry.displayCode}>{cardImage(entry.card) && <Image src={cardImage(entry.card)} alt="" width={48} height={67} unoptimized />}<div><span>{entry.displayCode}</span><strong>{cardName(entry.card)}</strong></div><div><button type="button" onClick={() => changeQuantity(entry.displayCode, entry.quantity - 1)}>−</button><span>{entry.quantity}</span><button type="button" onClick={() => changeQuantity(entry.displayCode, entry.quantity + 1)} disabled={entry.quantity >= maxCopies(entry.displayCode) || total === 50}>+</button></div></article>)}</div>
          </section>
        </> : <section className="deck-empty"><Image className="deck-empty__art" src="/assets/one-piece/card-backs.webp" alt="" width={1072} height={512} /><h1>Construis ton premier deck</h1><p>Choisis un Leader pour afficher toutes les cartes compatibles.</p><button type="button" onClick={openCreateDeck}>Nouveau deck</button></section>}
      </div>

      {creating && <div className="modal-backdrop"><form className="deck-modal" onSubmit={createDeck}><button className="modal-close" type="button" onClick={() => setCreating(false)}>×</button><h2>Nouveau deck</h2><label>Nom du deck<input name="name" required maxLength={80} /></label><span>Choisir un Leader</span><div className="leader-picker">{leaders.map((leader) => <button className={leaderChoice?.documentId === leader.documentId ? "is-active" : ""} type="button" key={leader.documentId} onClick={() => setLeaderChoice(leader)}>{cardImage(leader) && <Image src={cardImage(leader)} alt="" width={72} height={101} unoptimized />}<span>{cardName(leader)}</span></button>)}</div>{message && <p className="deck-message">{message}</p>}<button className="auth-submit" type="submit" disabled={creatingDeck || !leaderChoice}>{creatingDeck ? "Création..." : "Créer le deck"}</button></form></div>}
      {importing && <div className="modal-backdrop"><form className="deck-modal" onSubmit={importList}><button className="modal-close" type="button" onClick={() => setImporting(false)}>×</button><h2>Importer une liste</h2><label>Liste de cartes<textarea name="list" rows={12} placeholder={"4 OP01-016\n4x OP02-004\nOP03-013 x2"} required /></label><button className="auth-submit" type="submit">Importer</button></form></div>}
      {rulesOpen && regulation && <div className="modal-backdrop"><section className="deck-modal rules-modal"><button className="modal-close" type="button" onClick={() => setRulesOpen(false)}>×</button><h2>Règles et restrictions</h2><p className="rules-version">{regulation.name}</p><div className="rules-basics"><p><strong>1</strong><span>Leader</span></p><p><strong>50</strong><span>cartes principales</span></p><p><strong>10</strong><span>cartes DON!! séparées</span></p><p><strong>4</strong><span>exemplaires maximum par code</span></p></div><p className="rules-note">Toutes les cartes du deck principal doivent respecter les couleurs du Leader. Les variantes d’illustration comptent comme le même code.</p><div className="restriction-groups"><section><h3>Cartes interdites</h3>{regulation.restrictions.filter((item) => item.type === "banned").map((item) => <p key={item.displayCode}><code>{item.displayCode}</code><span>0 exemplaire</span></p>)}</section><section><h3>Cartes limitées</h3>{regulation.restrictions.filter((item) => item.type === "restricted").length ? regulation.restrictions.filter((item) => item.type === "restricted").map((item) => <p key={item.displayCode}><code>{item.displayCode}</code><span>{item.maxCopies ?? 1} exemplaire</span></p>) : <small>Aucune actuellement</small>}</section><section><h3>Paires interdites</h3>{regulation.restrictions.filter((item) => item.type === "banned_pair").map((item) => <p key={`${item.displayCode}-${item.pairedDisplayCode}`}><code>{item.displayCode}</code><span>avec</span><code>{item.pairedDisplayCode}</code></p>)}</section></div><a className="rules-source" href={regulation.sourceUrl} target="_blank" rel="noreferrer">Consulter la source officielle Bandai</a></section></div>}
      {authOpen && <AuthDialog user={user} onClose={() => user && setAuthOpen(false)} onAuthenticated={authenticated} onLogout={logout} />}
    </main>
  );
}
