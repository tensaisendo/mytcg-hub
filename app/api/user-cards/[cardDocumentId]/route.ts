import { NextResponse } from "next/server";
import { strapiAuthRequest } from "@/lib/strapi-auth";

export async function PUT(request: Request, context: { params: Promise<{ cardDocumentId: string }> }) {
  const { cardDocumentId } = await context.params;
  const response = await strapiAuthRequest(`/api/user-cards/${encodeURIComponent(cardDocumentId)}`, {
    method: "PUT",
    body: JSON.stringify(await request.json()),
  });
  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}
