import { type NextRequest, NextResponse } from "next/server";

const API_BASE = process.env["API_URL"] ?? "http://localhost:3001";

export async function GET(request: NextRequest) {
  try {
    const cookie = request.cookies.get("autoops_token")?.value;
    if (!cookie) {
      return NextResponse.json({ success: false, error: "UNAUTHORIZED", message: "Not authenticated" }, { status: 401 });
    }

    const apiRes = await fetch(`${API_BASE}/api/v1/auth/me`, {
      headers: { Cookie: `autoops_token=${cookie}` },
    });

    const data = await apiRes.json() as unknown;
    return NextResponse.json(data, { status: apiRes.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: "PROXY_ERROR", message }, { status: 500 });
  }
}
