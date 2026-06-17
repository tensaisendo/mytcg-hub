const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_URL;

export async function fetchCards() {
  const res = await fetch(`${STRAPI_URL}/api/cards?populate=*`)
  
  if (!res.ok) {
    throw new Error("Failed to fetch cards");
  }

  const json = await res.json();

  // 👉 on renvoie DIRECT le tableau propre
  return json.data;
}