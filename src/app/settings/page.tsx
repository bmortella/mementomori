"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Settings = {
  anchorPrompt: string;
  unlockDay: string;
  confirmSeal: boolean;
  providerType: string;
  providerModel: string;
  ollamaHost: string;
  anthropicKeySet: boolean;
};

const FIELD = "mt-1 w-full border-b border-[var(--gray-2)] bg-transparent pb-1 outline-none focus:border-[var(--fg)]";
const LABEL = "block font-mono text-xs text-[var(--gray-3)]";

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void fetch("/api/settings").then(async (r) => setS(await r.json()));
  }, []);

  async function save() {
    if (!s) return;
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        anchorPrompt: s.anchorPrompt,
        unlockDay: s.unlockDay,
        confirmSeal: s.confirmSeal ? "1" : "0",
        providerType: s.providerType,
        providerModel: s.providerModel,
        ollamaHost: s.ollamaHost,
        ...(apiKey ? { anthropicApiKey: apiKey } : {}),
      }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!s) return null;
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="font-mono text-xs text-[var(--gray-3)]">settings</h1>
      <div className="mt-8 space-y-6 text-sm">
        <label className="block">
          <span className={LABEL}>anchor prompt</span>
          <input className={FIELD} value={s.anchorPrompt} onChange={(e) => setS({ ...s, anchorPrompt: e.target.value })} />
        </label>
        <label className="block">
          <span className={LABEL}>unlock day (MM-DD)</span>
          <input className={FIELD} value={s.unlockDay} onChange={(e) => setS({ ...s, unlockDay: e.target.value })} />
        </label>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={s.confirmSeal}
            onChange={(e) => setS({ ...s, confirmSeal: e.target.checked })}
            className="h-4 w-4 accent-[var(--fg)]"
          />
          <span className={LABEL}>ask for confirmation before sealing</span>
        </label>
        <label className="block">
          <span className={LABEL}>reflection provider</span>
          <select className={FIELD} value={s.providerType} onChange={(e) => setS({ ...s, providerType: e.target.value })}>
            <option value="anthropic">anthropic</option>
            <option value="ollama">ollama</option>
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>model</span>
          <input className={FIELD} value={s.providerModel} onChange={(e) => setS({ ...s, providerModel: e.target.value })} />
        </label>
        {s.providerType === "anthropic" ? (
          <label className="block">
            <span className={LABEL}>anthropic api key {s.anthropicKeySet ? "(set — leave blank to keep)" : "(not set)"}</span>
            <input className={FIELD} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </label>
        ) : (
          <label className="block">
            <span className={LABEL}>ollama host</span>
            <input className={FIELD} value={s.ollamaHost} onChange={(e) => setS({ ...s, ollamaHost: e.target.value })} />
          </label>
        )}
        <button onClick={save} className="bg-[var(--fg)] px-6 py-2.5 text-sm font-medium text-[var(--bg)] active:scale-95">
          {saved ? "Saved" : "Save"}
        </button>
      </div>
      <footer className="mt-20 font-mono text-xs">
        <Link href="/" className="text-[var(--gray-3)] hover:text-[var(--fg)]">← this year</Link>
      </footer>
    </main>
  );
}
