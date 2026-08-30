import { NextResponse } from "next/server";
import { strapiAuthRequest } from "@/lib/strapi-auth";

type Context = { params: Promise<{ documentId: string }> };

export async function GET(_: Request, context: Context) {
  const { documentId } = await context.params;
  const response = await strapiAuthRequest(`/api/decks/${encodeURIComponent(documentId)}`);
  return NextResponse.json(await response.json(), { status: response.status });
}

export async function PUT(request: Request, context: Context) {
  const { documentId } = await context.params;
  const response = await strapiAuthRequest(`/api/decks/${encodeURIComponent(documentId)}`, {
    method: "PUT",
    body: JSON.stringify(await request.json()),
  });
  return NextResponse.json(await response.json(), { status: response.status });
}

export async function DELETE(_: Request, context: Context) {
  const { documentId } = await context.params;
  const response = await strapiAuthRequest(`/api/decks/${encodeURIComponent(documentId)}`, { method: "DELETE" });
  return NextResponse.json(await response.json(), { status: response.status });
}
