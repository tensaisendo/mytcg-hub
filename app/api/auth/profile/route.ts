import { NextResponse } from "next/server";
import { STRAPI_URL, strapiAuthRequest } from "@/lib/strapi-auth";
import { isSiteAdmin } from "@/lib/site-admin";

function responseError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

function upstreamError(status: number, fallback: string) {
  if (status === 401) return responseError(401, "Votre session a expiré. Reconnectez-vous pour modifier votre profil.");
  return responseError(status, fallback);
}

export async function PUT(request: Request) {
  let step = "lecture du formulaire";
  try {
    const input = await request.json();
    const username = String(input.username || "").trim();
    const email = String(input.email || "").trim();
    const currentPassword = String(input.currentPassword || "");
    const newPassword = String(input.newPassword || "");
    const avatarData = typeof input.avatarData === "string" ? input.avatarData : undefined;
    if (newPassword && newPassword.length < 8) return responseError(400, "Le nouveau mot de passe doit contenir au moins 8 caractères.");
    if (avatarData && (!avatarData.startsWith("data:image/jpeg;base64,") || avatarData.length > 1_500_000)) return responseError(400, "L’image du profil est invalide ou trop volumineuse.");

    step = "mise à jour des informations";
    let profile = await strapiAuthRequest("/api/profile/me", {
      method: "PUT",
      body: JSON.stringify({ data: { username, email, currentPassword, avatarData } }),
    });
    if (!profile.ok) return upstreamError(profile.status, profile.status === 409 ? "Ce pseudo ou cet e-mail est déjà utilisé." : "Les informations actuelles sont incorrectes.");
    let profilePayload = await profile.json();

    if (newPassword) {
      step = "changement du mot de passe";
      const password = await strapiAuthRequest("/api/auth/change-password", {
        method: "POST", body: JSON.stringify({ currentPassword, password: newPassword, passwordConfirmation: newPassword }),
      });
      if (!password.ok) return upstreamError(password.status, "Le mot de passe actuel est incorrect ou le nouveau mot de passe est invalide.");
    }

    const user = profilePayload.data;
    return NextResponse.json({ user: { ...user, avatar: user.avatar?.url ? { ...user.avatar, url: /^(https?:|data:)/.test(user.avatar.url) ? user.avatar.url : `${STRAPI_URL}${user.avatar.url}` } : null, isAdmin: isSiteAdmin(user) } });
  } catch (error) {
    console.error("[auth/profile]", step, error);
    return responseError(503, "La mise à jour du profil est temporairement indisponible.");
  }
}
