"use client";

import { useEffect, useState } from "react";
import type { YearResponse } from "@/app/page";

export default function ReadingPane({
  data,
  onRetry,
  showReveal,
}: {
  data: YearResponse;
  onRetry: () => void;
  showReveal: boolean;
}) {
  const revealKey = `mm-revealed-${data.year}`;
  const [revealed, setRevealed] = useState(true);

  useEffect(() => {
    if (showReveal && !localStorage.getItem(revealKey)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from localStorage, an external store
      setRevealed(false);
      const sealedCount = data.cells.filter((c) => c.state === "sealed").length;
      const t = setTimeout(() => {
        localStorage.setItem(revealKey, "1");
        setRevealed(true);
      }, sealedCount * 60 + 1200);
      return () => clearTimeout(t);
    }
  }, [showReveal, revealKey, data.cells]);

  if (!revealed) {
    return (
      <div className="mt-14 text-center">
        <p className="font-mono text-xs text-[var(--gray-3)]">{data.year} opens.</p>
        <button
          onClick={() => {
            localStorage.setItem(revealKey, "1");
            setRevealed(true);
          }}
          className="mt-4 font-mono text-xs text-[var(--gray-3)] underline hover:text-[var(--fg)]"
        >
          skip
        </button>
      </div>
    );
  }

  const r = data.reflection;
  return (
    <section className="mt-14 space-y-10">
      {(data.entries ?? []).map((e) => {
        const cell = data.cells.find((c) => c.week === e.week)!;
        return (
          <article key={e.week} id={`week-${e.week}`} className="mm-enter">
            <h2 className="font-mono text-xs text-[var(--gray-3)]">
              week {e.week} · {cell.dates}
            </h2>
            <p className="mt-2 leading-relaxed">{e.content}</p>
          </article>
        );
      })}

      <div className="border-t border-[var(--gray-2)] pt-10">
        <h2 className="font-mono text-xs text-[var(--gray-3)]">the year, read back</h2>
        {r.status === "done" && r.text && (
          <p className="mt-3 whitespace-pre-line leading-relaxed">{r.text}</p>
        )}
        {r.status === "done" && !r.text && (
          <p className="mt-3 text-sm text-[var(--gray-3)]">No entries were sealed this year.</p>
        )}
        {(r.status === "running" || r.status === "none") && (
          <p className="mt-3 text-sm text-[var(--gray-3)]">Being written…</p>
        )}
        {r.status === "failed" && (
          <div className="mt-3 text-sm">
            <p className="text-[var(--gray-3)]">The reflection failed: {r.error}</p>
            <button onClick={onRetry} className="mt-2 underline hover:text-[var(--fg)]">
              retry reflection
            </button>
          </div>
        )}
        {r.status === "done" && r.text && (
          <button onClick={onRetry} className="mt-4 font-mono text-xs text-[var(--gray-3)] underline hover:text-[var(--fg)]">
            regenerate
          </button>
        )}
      </div>
    </section>
  );
}
