import Image from "next/image";
import type { SessionUser } from "@/app/cards/CardsCatalog";

const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_URL || "http://localhost:1337";

export function avatarUrl(user: SessionUser | null) {
  const path = user?.avatar?.url || "";
  return path && !/^(https?:|data:|blob:)/.test(path) ? `${STRAPI_URL}${path}` : path;
}

export default function WantedProfileButton({ user, onClick }: { user: SessionUser | null; onClick: () => void }) {
  const avatar = avatarUrl(user);
  return <button className={`wanted-profile-button${user ? " is-connected" : ""}`} type="button" onClick={onClick} title={user ? `Compte de ${user.username}` : "Se connecter"} aria-label={user ? `Compte de ${user.username}` : "Se connecter"}>
    {user ? <>
      <span className="wanted-profile-button__photo">{avatar ? <Image src={avatar} alt="" fill unoptimized /> : user.username.slice(0, 2).toUpperCase()}</span>
      <span className="wanted-profile-button__text"><strong>{user.username}</strong><small>{user.berries.toLocaleString("fr-FR")} B</small></span>
    </> : <span className="wanted-profile-button__guest">OP</span>}
  </button>;
}
