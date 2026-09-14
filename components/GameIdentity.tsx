import Image from "next/image";

export default function GameIdentity() {
  return (
    <div className="game-identity" title="Jeu actuellement sélectionné">
      <Image src="/assets/one-piece/logo_op_white.png" alt="One Piece Card Game" width={93} height={24} />
      <span>Catalogue actif</span>
    </div>
  );
}
