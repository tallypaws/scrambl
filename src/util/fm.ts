const apiBase = "http://ws.audioscrobbler.com/2.0/";
const apiKey = process.env.LASTFM_API_KEY;

async function fmRequest(
  method: string,
  params: Record<string, string>
): Promise<any> {
  const url = new URL(apiBase);
  url.searchParams.append("method", method);
  url.searchParams.append("api_key", apiKey!);
  url.searchParams.append("format", "json");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(
      `last.fm request failed: ${response.status} ${response.statusText}`
    );
  }
  return response.json();
}

export async function fetchRecentAlbumsForUser(username: string): Promise<TopAlbumsResponse> {
  const data = await fmRequest("user.gettopalbums", { user: username });
  return data;
}
