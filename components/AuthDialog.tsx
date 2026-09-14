"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { SessionUser } from "@/app/cards/CardsCatalog";
import Image from "next/image";
import { avatarUrl } from "@/components/WantedProfileButton";

type Mode = "login" | "register" | "forgot" | "reset";

async function prepareAvatar(file: File) {
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 720 / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    image.close();
    return file;
  }
  context.fillStyle = "#f0dfb5";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  image.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  return blob ? new File([blob], "avatar.jpg", { type: "image/jpeg" }) : file;
}

async function fileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Avatar illisible"));
    reader.readAsDataURL(file);
  });
}

export function AuthDialog({ user, onClose, onAuthenticated, onLogout }: {
  user: SessionUser | null;
  onClose: () => void;
  onAuthenticated: (user: SessionUser) => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState("");

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  function changeMode(next: Mode) {
    setMode(next);
    setError("");
    setSuccess("");
    setShowPassword(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (mode === "reset" && values.password !== values.passwordConfirmation) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    const body = mode === "login"
      ? { identifier: values.email, password: values.password }
      : mode === "register"
        ? { username: values.username, email: values.email, password: values.password }
        : mode === "forgot"
          ? { email: values.email }
          : { code: values.code, password: values.password, passwordConfirmation: values.passwordConfirmation };
    const endpoint = mode === "forgot" ? "forgot-password" : mode === "reset" ? "reset-password" : mode;
    try {
      const response = await fetch("/api/auth/" + endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(response.status >= 500 ? (mode === "login" && ["AUTH_UPSTREAM", "AUTH_RESPONSE", "AUTH_COOKIE", "AUTH_TIMEOUT", "AUTH_NETWORK"].includes(payload.error?.code)
          ? payload.error.message : "Le serveur est indisponible. Réessaie dans un instant.")
          : response.status === 429 ? "Trop de tentatives. Patiente avant de réessayer."
          : mode === "login" ? "Connexion refusée. Vérifie tes identifiants et l’activation du compte."
          : mode === "register" ? "Inscription impossible. Vérifie les champs ou utilise un autre identifiant."
          : "Impossible de continuer. Vérifie les informations saisies.");
        return;
      }
      if (mode === "forgot") {
        setSuccess("Si cette adresse est reconnue, un lien de réinitialisation sera envoyé.");
        return;
      }
      if (mode === "reset") {
        setMode("login");
        setSuccess("Mot de passe réinitialisé. Tu peux te connecter.");
        return;
      }
      if (!payload.user) throw new Error("Missing session user");
      await onAuthenticated(payload.user);
    } catch (failure) {
      // The session cookie may have been set even if the login response was lost.
      if (mode === "login") {
        try {
          const session = await fetch("/api/auth/session", { cache: "no-store", signal: AbortSignal.timeout(5000) });
          const payload = await session.json();
          if (session.ok && payload.user) {
            await onAuthenticated(payload.user);
            return;
          }
        } catch { /* Keep the original login failure if session recovery fails. */ }
      }
      const name = failure instanceof Error ? failure.name : "";
      setError(name === "TimeoutError"
        ? "Le serveur met trop de temps à répondre. Vérifie que Strapi est démarré, puis réessaie."
        : name === "SyntaxError"
          ? "Le serveur a renvoyé une réponse illisible. Réessaie après la fin du redémarrage du frontend."
          : "La connexion au serveur a été interrompue. Vérifie que le frontend et Strapi sont démarrés, puis réessaie.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setError("");
    try { await onLogout(); }
    catch { setError("Déconnexion impossible. Réessaie."); }
    finally { setBusy(false); }
  }

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const form = new FormData(event.currentTarget);
      const avatar = form.get("avatar");
      const avatarData = avatar instanceof File && avatar.size > 0
        ? await fileAsDataUrl(await prepareAvatar(avatar))
        : undefined;
      const response = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.get("username"),
          email: form.get("email"),
          currentPassword: form.get("currentPassword"),
          newPassword: form.get("newPassword"),
          avatarData,
        }),
        signal: AbortSignal.timeout(150000),
      });
      const payload = await response.json();
      if (!response.ok || !payload.user) {
        setError(payload.error || "Le profil n’a pas pu être mis à jour.");
        return;
      }
      setSuccess("Profil mis à jour.");
      await onAuthenticated(payload.user);
    } catch {
      setError("La mise à jour du profil a échoué. Réessaie.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} className={`auth-dialog${user ? " is-account" : ""}`} aria-labelledby="auth-title" onCancel={onClose}
      onClick={(event) => { if (event.target === dialog.current) {
        const bounds = dialog.current.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      } }}>
      <button className="modal-close" type="button" onClick={onClose} aria-label="Fermer">×</button>
      <p className="auth-kicker">Compte MYTCG HUB</p>
      {user ? <>
        <h2 id="auth-title">Mon compte</h2>
        <div className="wanted-account">
          <div className="wanted-account__photo">
            {(avatarPreview || avatarUrl(user)) ? <Image src={avatarPreview || avatarUrl(user)} alt="Portrait du profil" fill unoptimized /> : <span>{user.username.slice(0, 2).toUpperCase()}</span>}
          </div>
          <strong className="wanted-account__name">{user.username}</strong>
          <p className="wanted-account__bounty"><span>฿</span>{user.berries.toLocaleString("fr-FR")}</p>
        </div>
        <form className="profile-form" onSubmit={updateProfile}>
          <fieldset className="auth-fields" disabled={busy}>
            <label className="profile-avatar-field">Photo du Wanted<input name="avatar" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
              if (avatarPreview) URL.revokeObjectURL(avatarPreview);
              setAvatarPreview(event.target.files?.[0] ? URL.createObjectURL(event.target.files[0]) : "");
            }} /></label>
            <div className="profile-field-grid">
              <label>Pseudo<input name="username" defaultValue={user.username} minLength={3} maxLength={40} required autoComplete="username" /></label>
              <label>Adresse e-mail<input name="email" type="email" defaultValue={user.email} required autoComplete="email" /></label>
            </div>
            <div className="profile-security">
              <span>Sécurité du compte</span>
              <label>Mot de passe actuel<input name="currentPassword" type={showPassword ? "text" : "password"} autoComplete="current-password" /></label>
              <label>Nouveau mot de passe<input name="newPassword" type={showPassword ? "text" : "password"} minLength={8} autoComplete="new-password" /></label>
              <label className="auth-password-toggle"><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />Afficher les mots de passe</label>
            </div>
          </fieldset>
          {error && <p className="auth-error" role="alert">{error}</p>}
          {success && <p className="auth-success" role="status">{success}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer les modifications"}</button>
        </form>
        {user.isAdmin && <section className="auth-admin-tools" aria-labelledby="auth-admin-title">
          <div>
            <span>Administration</span>
            <h3 id="auth-admin-title">Outils d’administration</h3>
            <p>La validation des prix utilise une authentification séparée.</p>
          </div>
          <Link href="/price-review" onClick={onClose}>Ouvrir Price Review</Link>
        </section>}
        <button className="auth-submit is-secondary" type="button" disabled={busy} onClick={() => void logout()}>
          {busy ? "Déconnexion…" : "Se déconnecter"}
        </button>
      </> : <>
        <h2 id="auth-title">{mode === "login" ? "Connexion" : mode === "register" ? "Créer un compte" : mode === "forgot" ? "Mot de passe oublié" : "Nouveau mot de passe"}</h2>
        {(mode === "login" || mode === "register") && <div className="auth-tabs" aria-label="Accès au compte">
          <button className={mode === "login" ? "is-active" : ""} type="button" disabled={busy} aria-pressed={mode === "login"} onClick={() => changeMode("login")}>Connexion</button>
          <button className={mode === "register" ? "is-active" : ""} type="button" disabled={busy} aria-pressed={mode === "register"} onClick={() => changeMode("register")}>Inscription</button>
        </div>}
        <form onSubmit={submit} aria-busy={busy}>
          <fieldset disabled={busy} className="auth-fields">
            {mode === "register" && <label>Nom d’utilisateur<input name="username" minLength={3} required autoComplete="username" /></label>}
            {mode !== "reset" && <label>Adresse e-mail<input name="email" type="email" required autoComplete="email" autoCapitalize="none" /></label>}
            {mode === "reset" && <label>Code de réinitialisation<input name="code" required autoComplete="one-time-code" /></label>}
            {mode !== "forgot" && <>
              <label>{mode === "reset" ? "Nouveau mot de passe" : "Mot de passe"}<input name="password" type={showPassword ? "text" : "password"} minLength={mode === "login" ? undefined : 8} required autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
              {mode === "reset" && <label>Confirmer le mot de passe<input name="passwordConfirmation" type={showPassword ? "text" : "password"} minLength={8} required autoComplete="new-password" /></label>}
              <label className="auth-password-toggle"><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />Afficher le mot de passe</label>
            </>}
          </fieldset>
          {error && <p className="auth-error" role="alert">{error}</p>}
          {success && <p className="auth-success" role="status">{success}</p>}
          {mode === "login" && <button className="auth-link" disabled={busy} type="button" onClick={() => changeMode("forgot")}>Mot de passe oublié ?</button>}
          <button className="auth-submit" disabled={busy} type="submit">
            {busy ? (mode === "login" ? "Connexion en cours…" : "Envoi en cours…") : mode === "login" ? "Se connecter" : mode === "register" ? "Créer mon compte" : mode === "forgot" ? "Envoyer le lien" : "Réinitialiser"}
          </button>
          {(mode === "forgot" || mode === "reset") && <button className="auth-link" disabled={busy} type="button" onClick={() => changeMode("login")}>Retour à la connexion</button>}
          {mode === "forgot" && <button className="auth-link" disabled={busy} type="button" onClick={() => changeMode("reset")}>J’ai un code de réinitialisation</button>}
        </form>
      </>}
    </dialog>
  );
}
