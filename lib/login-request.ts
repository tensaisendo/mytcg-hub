export async function requestLogin(url: string, credentials: { identifier: string; password: string }) {
  const timeoutMs = Number(process.env.AUTH_LOGIN_TIMEOUT_MS || 45000);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
        cache: "no-store",
        signal,
      });
      // Read the body within the deadline too: a connection can drop after headers.
      const payload = response.status >= 500 ? null : await response.json();
      return { response, payload };
    } catch (error) {
      const code = (error as { cause?: { code?: string }; code?: string })?.cause?.code
        || (error as { code?: string })?.code;
      const retryable = signal.aborted || ["ECONNRESET", "EPIPE", "UND_ERR_SOCKET", "ETIMEDOUT", "ECONNREFUSED"].includes(code || "");
      if (attempt > 0 || !retryable) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  throw new Error("Login request failed");
}
