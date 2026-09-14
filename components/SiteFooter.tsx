import Image from "next/image";
import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__content">
          <Link className="brand site-footer__brand" href="/cards" aria-label="MYTCG HUB, catalogue">
            <span className="brand__mark">M</span><span>MYTCG</span><strong>HUB</strong>
          </Link>
          <p>Construisez une collection fidèle à chaque langue, chaque impression et chaque variante.</p>
          <nav aria-label="Navigation de pied de page">
            <Link href="/cards">Cartes</Link>
            <Link href="/sets">Extensions</Link>
            <Link href="/collection">Collection</Link>
            <Link href="/wishlist">Liste d’envies</Link>
            <Link href="/decks">Decks</Link>
          </nav>
          <div className="site-footer__legal">
            <span>MYTCG HUB est un projet indépendant, non affilié à Bandai.</span>
            <a href="https://en.onepiece-cardgame.com/" target="_blank" rel="noreferrer">Site officiel One Piece Card Game</a>
          </div>
        </div>
        <div className="site-footer__art" aria-hidden="true">
          <Image
            src="/assets/one-piece/card-backs.webp"
            alt=""
            width={1072}
            height={512}
            sizes="(max-width: 960px) 0px, 520px"
            loading="lazy"
          />
        </div>
      </div>
    </footer>
  );
}
