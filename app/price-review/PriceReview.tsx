"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Language = "EN" | "FR" | "JP";
type PriceSource = "Cardmarket" | "eBay";
type Candidate = {
  documentId: string;
  canonicalDocumentId: string;
  cardId: string;
  name: string;
  variant?: string | null;
  language: Language;
  imageUrl: string | null;
  imageName?: string | null;
  mediaFolder?: string | null;
  searchUrls: Record<PriceSource, string>;
  treatment?: { name?: string } | null;
  distribution?: string | null;
  acquisition?: string | null;
  event?: string | null;
  distributionRegion?: string | null;
  distributionSourceUrl?: string | null;
  distributionVerifiedAt?: string | null;
  price?: number | null;
  priceSource?: string | null;
};
type SaleForm = { soldPrice: string; soldAt: string; sourceUrl: string; confirmed: boolean };
type FilterOption = { name: string; code?: string | null };
type ReviewOptions = { sets: FilterOption[]; rarities: FilterOption[]; treatments: FilterOption[]; distributions: string[] };
const NO_TREATMENT = "__none__";
const EVENT_OPTIONS = ["Championship", "Regional", "Store Championship", "Treasure Cup", "Tournament", "Sealed Battle", "Event", "Flagship Battle", "Pirates Party"];
const ACQUISITION_OPTIONS = ["Participation", "Vainqueur", "Finaliste", "Top 2", "Top 4", "Top 8", "Top 16", "Top 32", "Judge"];
const REGION_OPTIONS: Record<Language, string[]> = {
  FR: ["France", "Europe"],
  EN: ["Europe", "North America", "Oceania", "Latin America", "Middle East", "Global"],
  JP: ["Japan"],
};

const emptySale = (): SaleForm => ({ soldPrice: "", soldAt: "", sourceUrl: "", confirmed: false });

export default function PriceReview() {
  const [authStatus, setAuthStatus] = useState<"loading" | "guest" | "authenticated" | "unconfigured">("loading");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [language, setLanguage] = useState<Language>("FR");
  const [source, setSource] = useState<PriceSource>("Cardmarket");
  const [offset, setOffset] = useState(0);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [setCode, setSetCode] = useState("");
  const [version, setVersion] = useState<"all" | "base" | "variant">("all");
  const [rarity, setRarity] = useState("");
  const [treatment, setTreatment] = useState("");
  const [includeCommon, setIncludeCommon] = useState(false);
  const [options, setOptions] = useState<ReviewOptions>({ sets: [], rarities: [], treatments: [], distributions: [] });
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [total, setTotal] = useState(0);
  const [sales, setSales] = useState<SaleForm[]>([emptySale(), emptySale(), emptySale()]);
  const [message, setMessage] = useState("");
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
  const [editedTreatment, setEditedTreatment] = useState("");
  const [editedDistribution, setEditedDistribution] = useState({ distribution: "", acquisition: "", event: "", region: "", sourceUrl: "" });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async (successMessage = "") => {
    if (authStatus !== "authenticated") return;
    setLoading(true);
    if (!successMessage) setMessage("");
    try {
      setLoadError("");
      const params = new URLSearchParams({ language, offset: String(offset) });
      if (query) params.set("query", query);
      if (setCode) params.set("set", setCode);
      if (version !== "all") params.set("version", version);
      if (rarity) params.set("rarity", rarity);
      if (treatment) params.set("treatment", treatment);
      if (includeCommon) params.set("includeCommon", "true");
      const response = await fetch(`/api/price-review?${params}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Chargement impossible");
      setCandidate(payload.data);
      setEditedTreatment(payload.data ? payload.data.treatment?.name || NO_TREATMENT : "");
      setEditedDistribution(payload.data ? { distribution: payload.data.distribution || "", acquisition: payload.data.acquisition || "", event: payload.data.event || "", region: payload.data.distributionRegion || "", sourceUrl: payload.data.distributionSourceUrl || "" } : { distribution: "", acquisition: "", event: "", region: "", sourceUrl: "" });
      setTotal(payload.total || 0);
      setSales([emptySale(), emptySale(), emptySale()]);
      setOverwriteConfirmed(false);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Chargement impossible";
      setLoadError(detail);
      setMessage(successMessage ? `${successMessage} Chargement de la carte suivante impossible : ${detail}` : detail);
    } finally {
      setLoading(false);
    }
  }, [authStatus, includeCommon, language, offset, query, rarity, setCode, treatment, version]);

  useEffect(() => {
    let active = true;
    fetch("/api/price-review/auth", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return;
        setAuthStatus(!payload.configured ? "unconfigured" : payload.authenticated ? "authenticated" : "guest");
      })
      .catch(() => { if (active) setAuthStatus("guest"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    // Loading is intentionally tied to the selected language and queue offset.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let active = true;
    fetch(`/api/catalog/options?lang=${language}`)
      .then((response) => response.json())
      .then((payload) => { if (active && !payload.error) setOptions(payload); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [authStatus, language]);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    const response = await fetch("/api/price-review/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setAuthError(payload.error || "Connexion impossible.");
      return;
    }
    setPassword("");
    setAuthStatus("authenticated");
  }

  async function logout() {
    await fetch("/api/price-review/auth", { method: "DELETE" });
    setCandidate(null);
    setAuthStatus("guest");
  }

  const visibleSales = source === "Cardmarket" ? sales.slice(0, 1) : sales;
  const accepted = visibleSales.filter((sale) => sale.confirmed && Number(sale.soldPrice) > 0 && (source === "Cardmarket" || sale.soldAt) && sale.sourceUrl);
  const proposedPrice = useMemo(() => {
    if (accepted.length < 1) return null;
    const values = accepted.map((sale) => Number(sale.soldPrice)).sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  }, [accepted]);
  const confidence = source === "Cardmarket" && accepted.length
    ? "Prix tendance agrégé par Cardmarket"
    : accepted.length >= 3 ? "Fiabilité correcte" : accepted.length === 2 ? "Fiabilité moyenne" : accepted.length === 1 ? "Fiabilité faible" : "Aucune vente validée";

  function updateSale(index: number, field: keyof SaleForm, value: string | boolean) {
    setSales((current) => current.map((sale, saleIndex) => saleIndex === index ? { ...sale, [field]: value } : sale));
  }

  function resetFilters() {
    setQueryInput("");
    setQuery("");
    setSetCode("");
    setVersion("all");
    setRarity("");
    setTreatment("");
    setIncludeCommon(false);
    setOffset(0);
  }

  async function submit() {
    if (!candidate || proposedPrice == null) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/price-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: candidate.documentId,
          cardId: candidate.cardId,
          language: candidate.language,
          source,
          overwrite: candidate.price != null && overwriteConfirmed,
          sales: accepted.map((sale) => ({ ...sale, soldPrice: Number(sale.soldPrice), currency: "EUR", graded: false })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Écriture impossible");
      const successMessage = payload.data.source === "Cardmarket"
        ? `Prix tendance Cardmarket enregistré : ${payload.data.price.toFixed(2)} €.`
        : `Prix enregistré : ${payload.data.price.toFixed(2)} € (${payload.data.sampleSize} ventes).`;
      setMessage(successMessage);
      setOffset(0);
      await load(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Écriture impossible");
    } finally {
      setLoading(false);
    }
  }

  async function saveTreatment() {
    const currentTreatment = candidate?.treatment?.name || NO_TREATMENT;
    if (!candidate || !editedTreatment || editedTreatment === currentTreatment) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/price-review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: candidate.documentId,
          canonicalDocumentId: candidate.canonicalDocumentId,
          cardId: candidate.cardId,
          language: candidate.language,
          treatment: editedTreatment === NO_TREATMENT ? null : editedTreatment,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Correction impossible");
      setCandidate((current) => current ? { ...current, treatment: payload.data.treatment } : current);
      setMessage(payload.data.treatment
        ? `Traitement corrigé : ${payload.data.treatment.name}.`
        : "Traitement supprimé : cette variante n’a désormais aucun traitement.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Correction impossible");
    } finally {
      setLoading(false);
    }
  }

  async function saveDistribution() {
    if (!candidate) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/price-review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "distribution",
          documentId: candidate.documentId,
          canonicalDocumentId: candidate.canonicalDocumentId,
          cardId: candidate.cardId,
          language: candidate.language,
          distribution: editedDistribution.distribution || null,
          acquisition: editedDistribution.acquisition || null,
          event: editedDistribution.event || null,
          distributionRegion: editedDistribution.region || null,
          distributionSourceUrl: editedDistribution.sourceUrl || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Correction impossible");
      setCandidate((current) => current ? { ...current, ...payload.data } : current);
      setMessage(payload.data.distribution ? `Distribution corrigée : ${payload.data.distribution}.` : "Distribution supprimée.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Correction impossible");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="price-review">
      <header className="price-review__header">
        <Link className="brand" href="/cards"><span className="brand__mark">M</span><span>MYTCG</span><strong>HUB</strong></Link>
        <div>
          <span>Outil interne</span>
          <h1>Validation des prix eBay</h1>
        </div>
        {authStatus === "authenticated" ? <div className="price-review__session"><div className="language-switch" aria-label="Langue de la carte">
          {(["FR", "EN", "JP"] as Language[]).map((item) => (
            <button key={item} className={language === item ? "is-active" : ""} onClick={() => { setLanguage(item); setOffset(0); setSetCode(""); setRarity(""); setTreatment(""); }}>{item}</button>
          ))}
        </div><button onClick={logout}>Déconnexion</button></div> : <span />}
      </header>

      {authStatus !== "authenticated" ? <section className="price-login">
        <div className="price-login__mark">€</div>
        <span>Accès protégé</span>
        <h2>Validation des prix</h2>
        <p>Identifie-toi avec le compte réservé à cet outil interne.</p>
        {authStatus === "loading" ? <div className="price-login__loading">Vérification de la session…</div> : authStatus === "unconfigured" ? <p className="price-login__error">Ajoute les variables PRICE_REVIEW_* dans .env.local puis redémarre Next.js.</p> : <form onSubmit={login}>
          <label><span>Identifiant</span><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
          <label><span>Mot de passe</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {authError && <p className="price-login__error">{authError}</p>}
          <button type="submit">Se connecter</button>
        </form>}
      </section> : <section className="price-review__workspace">
        <aside className="price-reference">
          <form className="price-reference__search" onSubmit={(event) => { event.preventDefault(); setOffset(0); setQuery(queryInput.trim()); }}>
            <input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Code ou nom de carte" />
            <button type="submit">Rechercher</button>
            {query && <button type="button" onClick={() => { setQueryInput(""); setQuery(""); setOffset(0); }}>Effacer</button>}
          </form>
          <div className="price-reference__filters">
            <label><span>Extension</span><select value={setCode} onChange={(event) => { setSetCode(event.target.value); setOffset(0); }}><option value="">Toutes</option>{options.sets.map((item) => <option key={item.code || item.name} value={item.code || ""}>{item.code ? `${item.code} · ${item.name}` : item.name}</option>)}</select></label>
            <label><span>Version</span><select value={version} onChange={(event) => { setVersion(event.target.value as "all" | "base" | "variant"); setOffset(0); }}><option value="all">Toutes</option><option value="base">Carte de base</option><option value="variant">Variante</option></select></label>
            <label><span>Rareté</span><select value={rarity} onChange={(event) => { setRarity(event.target.value); setOffset(0); }}><option value="">Toutes</option>{options.rarities.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
            <label><span>Traitement</span><select value={treatment} onChange={(event) => { setTreatment(event.target.value); setOffset(0); }}><option value="">Tous</option>{options.treatments.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
            <label className="price-reference__common"><input type="checkbox" checked={includeCommon} onChange={(event) => { setIncludeCommon(event.target.checked); setOffset(0); }} /><span>Inclure C et UC</span></label>
          </div>
          {(query || setCode || version !== "all" || rarity || treatment || includeCommon) && <button className="price-reference__reset" onClick={resetFilters}>Réinitialiser tous les filtres</button>}
          <div className="price-reference__counter">{query ? `${total} résultat${total > 1 ? "s" : ""}` : `${total ? offset + 1 : 0} / ${total} sans prix`}</div>
          {loading && !candidate ? <div className="price-reference__empty">Chargement…</div> : loadError && !candidate ? <div className="price-reference__empty"><span>Le CMS Strapi est indisponible.</span><button type="button" onClick={() => void load()}>Réessayer</button></div> : candidate ? <>
            <div className="price-reference__image">
              {candidate.imageUrl ? <img src={candidate.imageUrl} alt={candidate.cardId} /> : <span>Image indisponible</span>}
            </div>
            <p>{candidate.cardId}{candidate.variant ? ` · ${candidate.variant}` : ""}</p>
            <h2>{candidate.name}</h2>
            <div className="price-reference__tags"><span>{candidate.language}</span>{candidate.treatment?.name && <span>{candidate.treatment.name}</span>}{candidate.distribution && <span>{candidate.distribution}</span>}</div>
            <div className="price-reference__media">
              <span>Dossier Media Library</span>
              <strong>{candidate.mediaFolder || "Dossier inconnu"}</strong>
              {candidate.imageName && <small>{candidate.imageName}</small>}
            </div>
            <div className="price-reference__treatment-editor">
              <label><span>Traitement de cette variante</span><select value={editedTreatment} onChange={(event) => setEditedTreatment(event.target.value)}><option value={NO_TREATMENT}>Aucun traitement</option>{options.treatments.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
              <button type="button" disabled={!editedTreatment || editedTreatment === (candidate.treatment?.name || NO_TREATMENT) || loading} onClick={saveTreatment}>Corriger</button>
              <small>Cette correction ne valide pas le prix. La carte reste ouverte pour terminer son estimation ci-contre.</small>
            </div>
            <div className="price-reference__distribution-editor">
              <div className="price-reference__distribution-heading"><span>Distribution de cette impression</span>{candidate.distributionVerifiedAt && <small>Vérifiée le {new Date(candidate.distributionVerifiedAt).toLocaleDateString("fr-FR")}</small>}</div>
              <label><span>Distribution</span><input list={`distribution-options-${language}`} value={editedDistribution.distribution} onChange={(event) => setEditedDistribution((current) => ({ ...current, distribution: event.target.value }))} placeholder="Choisir ou saisir une distribution" /><datalist id={`distribution-options-${language}`}>{options.distributions.map((item) => <option key={item} value={item} />)}</datalist></label>
              <label><span>Événement</span><input list="distribution-event-options" value={editedDistribution.event} onChange={(event) => setEditedDistribution((current) => ({ ...current, event: event.target.value }))} placeholder="Choisir ou saisir" /><datalist id="distribution-event-options">{EVENT_OPTIONS.map((item) => <option key={item} value={item} />)}</datalist></label>
              <label><span>Obtention</span><input list="distribution-acquisition-options" value={editedDistribution.acquisition} onChange={(event) => setEditedDistribution((current) => ({ ...current, acquisition: event.target.value }))} placeholder="Choisir ou saisir" /><datalist id="distribution-acquisition-options">{ACQUISITION_OPTIONS.map((item) => <option key={item} value={item} />)}</datalist></label>
              <label><span>Région</span><input list={`distribution-region-options-${language}`} value={editedDistribution.region} onChange={(event) => setEditedDistribution((current) => ({ ...current, region: event.target.value }))} placeholder="Choisir ou saisir une région" /><datalist id={`distribution-region-options-${language}`}>{REGION_OPTIONS[language].map((item) => <option key={item} value={item} />)}</datalist></label>
              <label className="price-reference__distribution-source"><span>Page officielle justificative · recommandée</span><input type="url" value={editedDistribution.sourceUrl} onChange={(event) => setEditedDistribution((current) => ({ ...current, sourceUrl: event.target.value }))} placeholder={`https://${language === "JP" ? "www" : language.toLowerCase()}.onepiece-cardgame.com/events/…`} /></label>
              <button type="button" disabled={loading || (!!editedDistribution.distribution && !editedDistribution.region)} onClick={saveDistribution}>{editedDistribution.distribution ? "Corriger la distribution" : "Supprimer la distribution"}</button>
              <small>Avec une URL officielle, la donnée sera marquée comme vérifiée. Sans URL, elle restera enregistrée mais non vérifiée. Cette correction reste indépendante du traitement et du prix.</small>
            </div>
            {candidate.price != null && <div className="price-reference__current"><span>Prix actuel · {candidate.priceSource || "source inconnue"}</span><strong>{Number(candidate.price).toFixed(2)} €</strong></div>}
            <a href={candidate.searchUrls[source]} target="_blank" rel="noreferrer">Rechercher cette carte sur {source}</a>
            <div className="price-reference__nav">
              <button disabled={offset === 0 || loading} onClick={() => setOffset((value) => Math.max(0, value - 1))}>Précédente</button>
              <button disabled={offset >= total - 1 || loading} onClick={() => setOffset((value) => value + 1)}>Ignorer</button>
            </div>
          </> : <div className="price-reference__empty"><span>{query || setCode || version !== "all" || rarity || treatment || includeCommon ? "Aucune carte ne correspond à ces filtres." : "Aucune carte sans prix dans cette langue."}</span>{(query || setCode || version !== "all" || rarity || treatment || includeCommon) && <button onClick={resetFilters}>Réinitialiser les filtres</button>}</div>}
        </aside>

        <section className="price-sales">
          <div className="price-source" aria-label="Source du prix">
            <span>Source</span>
            <div>
              {(["Cardmarket", "eBay"] as PriceSource[]).map((item) => <button key={item} className={source === item ? "is-active" : ""} onClick={() => { setSource(item); setSales([emptySale(), emptySale(), emptySale()]); }}>{item}</button>)}
            </div>
          </div>
          <div className="price-sales__title">
            <div><span>Contrôle visuel obligatoire</span><h2>{source === "eBay" ? "Ventes correspondant à cette illustration" : "Prix tendance Cardmarket"}</h2></div>
            {source === "eBay" && <button onClick={() => setSales((current) => [...current, emptySale()])}>Ajouter une vente</button>}
          </div>
          {source === "Cardmarket" && <p className="price-source-note">Recopie la valeur « Tendance des prix » affichée sur la page exacte de cette carte. Ne saisis pas trois offres individuelles dans ce mode.</p>}
          <div className="price-sales__columns"><span>{source === "eBay" ? "Prix vendu" : "Prix tendance"}</span><span>{source === "eBay" ? "Date de vente" : "Date du relevé"}</span><span>URL {source}</span><span>{source === "eBay" ? "Carte identique" : "Page vérifiée"}</span></div>
          {visibleSales.map((sale, index) => (
            <div className="price-sale" key={index}>
              <label><span>Prix</span><input type="number" min="0" step="0.01" value={sale.soldPrice} onChange={(event) => updateSale(index, "soldPrice", event.target.value)} placeholder="0,00" /><b>€</b></label>
              {source === "eBay" ? <label><span>Date de vente</span><input type="date" value={sale.soldAt} onChange={(event) => updateSale(index, "soldAt", event.target.value)} /></label> : <div className="price-sale__automatic"><span>Date du relevé</span><strong>Automatique à la validation</strong></div>}
              <label><span>URL</span><input type="url" value={sale.sourceUrl} onChange={(event) => updateSale(index, "sourceUrl", event.target.value)} placeholder={source === "eBay" ? "https://www.ebay.fr/itm/..." : "https://www.cardmarket.com/fr/OnePiece/..."} /></label>
              <label className="price-sale__check"><input type="checkbox" checked={sale.confirmed} onChange={(event) => updateSale(index, "confirmed", event.target.checked)} /><span>{source === "Cardmarket" ? "Page et illustration vérifiées" : "Illustration vérifiée"}</span></label>
            </div>
          ))}
          <footer className="price-decision">
            <div><span>{source === "Cardmarket" ? "Prix tendance" : "Prix proposé"}</span><strong>{proposedPrice == null ? "—" : `${proposedPrice.toFixed(2)} €`}</strong><small className={`price-confidence price-confidence--${source === "Cardmarket" && accepted.length ? "good" : accepted.length >= 3 ? "good" : accepted.length ? "low" : "empty"}`}>{confidence}{source === "eBay" ? ` · ${accepted.length} vente${accepted.length > 1 ? "s" : ""} validée${accepted.length > 1 ? "s" : ""}` : ""}</small></div>
            <div className="price-decision__action">
              {candidate?.price != null && <label><input type="checkbox" checked={overwriteConfirmed} onChange={(event) => setOverwriteConfirmed(event.target.checked)} /><span>Je confirme le remplacement du prix actuel</span></label>}
              <button disabled={!candidate || proposedPrice == null || loading || (candidate.price != null && !overwriteConfirmed)} onClick={submit}>{loading ? "Traitement…" : candidate?.price != null ? "Corriger le prix" : "Valider et enregistrer"}</button>
            </div>
          </footer>
          {message && <p className="price-review__message">{message}</p>}
        </section>
      </section>}
    </main>
  );
}
