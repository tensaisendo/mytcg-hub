import { NextResponse } from "next/server";
import { strapiAuthRequest } from "@/lib/strapi-auth";

export async function GET() {
  try {
    const response = await strapiAuthRequest("/api/users/me");
    if (!response.ok) return NextResponse.json({ user: null }, { status: 401 });
    const user = await response.json();
    return NextResponse.json({ user: { id: user.id, username: user.username, email: user.email } });
  } catch {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
