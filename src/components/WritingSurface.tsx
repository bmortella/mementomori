"use client";

import { useEffect, useState } from "react";
import { MAX_ENTRY_CHARS } from "@/lib/config";

type Drawn = { id: string; text: string };

export default function WritingSurface({
  anchorPrompt,
  week,
  year,
  unlockDate,
  onSealed,
}: {
  anchorPrompt: string;
  week: number;
  year: number;
  unlockDate: string;
  onSealed: () => void;
}) {
  const draftKey = `mm-draft-${year}-${week}`;
  const [content, setContent] = useState("");
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(draftKey);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate draft from localStorage on mount
    if (saved) setContent(saved);
  }, [draftKey]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (content) localStorage.setItem(draftKey, content);
      else localStorage.removeItem(draftKey);
    }, 2000);
    return () => clearTimeout(t);
  }, [content, draftKey]);

  async function draw() {
    const res = await fetch("/api/prompts/draw", { method: "POST" });
    if (res.ok) setDrawn(await res.json());
  }

  async function seal() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/seal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ week, content, promptId: drawn?.id }),
    });
    setBusy(false);
    if (res.ok) {
      localStorage.removeItem(draftKey);
      onSealed();
    } else {
      const { error: code } = await res.json();
      setError(
        code === "ALREADY_SEALED" ? "This week is already sealed."
        : code === "WRONG_WEEK" ? "This week has passed. The cell stays empty."
        : code === "TOO_LONG" ? `Too long — ${MAX_ENTRY_CHARS} characters at most.`
        : "One paragraph only.",
      );
      setConfirming(false);
    }
  }

  const unlockLabel = new Date(`${unlockDate}T00:00:00`).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
  const over = content.length > MAX_ENTRY_CHARS;

  return (
    <section className="mt-14">
      <h1 className="text-2xl font-medium tracking-tight">{anchorPrompt}</h1>
      {drawn && <p className="mt-3 text-sm text-[var(--gray-3)] mm-enter">{drawn.text}</p>}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value.replace(/[\r\n]/g, " "))}
        rows={4}
        placeholder="One paragraph. Then it's sealed."
        className="mt-6 w-full resize-none border-b border-[var(--gray-2)] bg-transparent pb-2 text-base leading-relaxed outline-none placeholder:text-[var(--gray-3)] focus:border-[var(--fg)]"
      />
      <div className="mt-3 flex items-center justify-between font-mono text-xs text-[var(--gray-3)]">
        <button onClick={draw} className="hover:text-[var(--fg)]">
          I&apos;m circling — draw a prompt
        </button>
        {content.length >= MAX_ENTRY_CHARS * 0.8 && (
          <span className={`mm-enter ${over ? "text-[var(--fg)] font-bold" : ""}`}>
            {content.length}/{MAX_ENTRY_CHARS}
          </span>
        )}
      </div>
      {error && <p className="mt-4 font-mono text-xs">{error}</p>}
      <div className="mt-8">
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            disabled={!content.trim() || over}
            className="bg-[var(--fg)] px-6 py-2.5 text-sm font-medium text-[var(--bg)] transition-transform active:scale-95 disabled:opacity-30"
          >
            Seal
          </button>
        ) : (
          <div className="mm-enter flex items-center gap-4">
            <p className="text-sm">Sealed is sealed. No reading, no editing, until {unlockLabel}.</p>
            <button onClick={seal} disabled={busy}
              className="bg-[var(--fg)] px-4 py-2 text-sm text-[var(--bg)] active:scale-95 disabled:opacity-50">
              Seal it
            </button>
            <button onClick={() => setConfirming(false)} className="text-sm text-[var(--gray-3)] hover:text-[var(--fg)]">
              Back
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
