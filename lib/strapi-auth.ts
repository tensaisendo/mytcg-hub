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
  const method = init.method?.toUpperCase() || "GET";
  // GET and PUT are safe to replay when Strapi briefly restarts in development.
  const attempts = method === "GET" || method === "PUT" ? 2 : 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, {
        ...init,
        headers: {
          ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
        cache: "no-store",
        signal: init.signal || AbortSignal.timeout(Number(process.env.AUTH_SESSION_TIMEOUT_MS || 30000)),
      });
    } catch (error) {
      lastError = error;
      const code = (error as { cause?: { code?: string } })?.cause?.code;
      if (attempt < attempts && (!code || RETRYABLE_CODES.has(code))) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Request failed for ${path}`);
}
