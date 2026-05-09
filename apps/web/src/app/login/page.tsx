"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { loginRequest } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await loginRequest({ email, password });
      // Redirect to the page the user was trying to reach, or dashboard
      const params = new URLSearchParams(window.location.search);
      const from = params.get("from") ?? "/";
      router.push(from);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Internal Server Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-2xl px-8 py-10 shadow-2xl">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
              <svg
                className="w-7 h-7 text-white"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M13 2L4.09 12.26a1 1 0 0 0 .91 1.64L11 13l-2 9 8.91-10.26a1 1 0 0 0-.91-1.64L11 11l2-9z" />
              </svg>
            </div>
            <h1 className="text-white text-xl font-semibold">Sign in to AutoOps</h1>
            <p className="text-gray-400 text-sm mt-1">AI-native DevOps control plane</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-300 mb-1.5"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@autoops.local"
                className="w-full bg-[#0f1117] border border-[#2a2d3a] rounded-lg px-3.5 py-2.5 text-white text-sm
                           placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                           transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-300 mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#0f1117] border border-[#2a2d3a] rounded-lg px-3.5 py-2.5 text-white text-sm
                           placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                           transition-colors"
              />
            </div>

            {/* Error banner */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3.5 py-2.5">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed
                         text-white font-medium text-sm rounded-lg px-4 py-2.5 transition-colors mt-2"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {/* Demo credentials hint */}
          <p className="text-center text-gray-600 text-xs mt-6">
            Demo:{" "}
            <span className="text-gray-400">admin@autoops.local</span>
            {" / "}
            <span className="text-gray-400">AutoOpsAdmin1!</span>
          </p>
        </div>
      </div>
    </div>
  );
}
