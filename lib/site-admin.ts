type SiteUser = { email?: string | null };

function adminEmails() {
  return new Set(
    (process.env.SITE_ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLocaleLowerCase())
      .filter(Boolean),
  );
}

export function isSiteAdmin(user: SiteUser | null | undefined) {
  const email = user?.email?.trim().toLocaleLowerCase();
  return Boolean(email && adminEmails().has(email));
}
