"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [wrong, setWrong] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) router.push("/");
    else setWrong(true);
  }

  return (
    <main className="mx-auto max-w-xs px-6 py-32">
      <form onSubmit={submit}>
        <label className="block font-mono text-xs text-[var(--gray-3)]">password</label>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full border-b border-[var(--gray-2)] bg-transparent pb-1 outline-none focus:border-[var(--fg)]"
        />
        {wrong && <p className="mt-3 font-mono text-xs">Wrong password.</p>}
        <button type="submit" className="mt-6 bg-[var(--fg)] px-6 py-2 text-sm text-[var(--bg)] active:scale-95">
          Enter
        </button>
      </form>
    </main>
  );
}
