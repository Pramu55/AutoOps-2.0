import { type NextRequest, NextResponse } from "next/server";

// Internal API URL — resolved server-side on the same VM, never exposed to browser
const API_BASE = process.env["API_URL"] ?? "http://localhost:3001";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as unknown;

    const apiRes = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await apiRes.json() as { success: boolean; data?: { accessToken?: string; expiresIn?: number }; message?: string; error?: string };

    if (!apiRes.ok) {
      return NextResponse.json(data, { status: apiRes.status });
    }

    const response = NextResponse.json(data, { status: 200 });

    // Forward the httpOnly cookie that the API set — set it here on the
    // Next.js origin so the browser stores it for same-origin requests
    const apiSetCookie = apiRes.headers.get("set-cookie");
    if (apiSetCookie) {
      response.headers.set("set-cookie", apiSetCookie);
    }

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: "PROXY_ERROR", message },
      { status: 500 }
    );
  }
}
