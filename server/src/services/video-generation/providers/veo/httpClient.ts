export async function veoFetch(
  baseUrl: string,
  apiKey: string,
  path: string,
  init: RequestInit,
): Promise<unknown> {
  init.signal?.throwIfAborted();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  init.signal?.throwIfAborted();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `Non-JSON response (${response.status}): ${text.slice(0, 400)}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${JSON.stringify(json).slice(0, 800)}`,
    );
  }

  return json;
}
