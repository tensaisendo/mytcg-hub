import { cookies } from "next/headers";

export const AUTH_COOKIE = "mytcg_session";
export const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_URL || "http://localhost:1337";
const RETRYABLE_CODES = new Set(["ECONNRESET", "ETIMEDOUT", "ECONNABORTED", "EAI_AGAIN", "EPROTO"]);

export async function getAuthToken() {
  return (await cookies()).get(AUTH_COOKIE)?.value;
}

export async function strapiAuthRequest(path: string, init: RequestInit = {}) {
  const token = await getAuthToken();
  if (!token) return new Response(null, { status: 401 });
  const url = `${STRAPI_URL}${path}`;
  let lastError: unknown;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await fetch(url, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
        cache: "no-store",
      });
    } catch (error) {
      lastError = error;
      const code = (error as { cause?: { code?: string } })?.cause?.code;
      if (attempt < 4 && (!code || RETRYABLE_CODES.has(code))) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Request failed for ${path}`);
}
