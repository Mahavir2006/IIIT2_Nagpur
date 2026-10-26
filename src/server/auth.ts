export function getRequestApiKey(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim() || null;
  }

  const fallback = request.headers.get("x-pravaah-key");
  return fallback?.trim() || null;
}

export function isApiKeyRequired(): boolean {
  return Boolean(process.env["PRAVAAH_API_KEY"]?.trim());
}

export function isAuthorizedRequest(request: Request): boolean {
  const expected = process.env["PRAVAAH_API_KEY"]?.trim();
  if (!expected) return true;

  const supplied = getRequestApiKey(request);
  return Boolean(supplied) && supplied === expected;
}

export function unauthorizedResponse() {
  return new Response(
    JSON.stringify({
      error: "Unauthorized.",
      message: "Provide a valid PRAVAAH API key using the Authorization: Bearer header or x-pravaah-key header.",
    }),
    {
      status: 401,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-pravaah-key",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
    },
  );
}
