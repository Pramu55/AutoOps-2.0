import { type NextRequest, NextResponse } from "next/server";

const API_BASE = process.env["API_URL"] ?? "http://localhost:3001";

export async function POST(request: NextRequest) {
  try {
    const cookie = request.cookies.get("autoops_token")?.value ?? "";

    await fetch(`${API_BASE}/api/v1/auth/logout`, {
      method: "POST",
      headers: { Cookie: `autoops_token=${cookie}` },
    });

    const response = NextResponse.json({ success: true, message: "Logged out" });
    response.cookies.delete("autoops_token");
    return response;
  } catch {
    const response = NextResponse.json({ success: true, message: "Logged out" });
    response.cookies.delete("autoops_token");
    return response;
  }
}
