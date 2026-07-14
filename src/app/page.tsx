"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import YearGrid from "@/components/YearGrid";
import WritingSurface from "@/components/WritingSurface";
import ReadingPane from "@/components/ReadingPane";
import type { YearState } from "@/lib/years";
import type { EntryMeta } from "@/lib/entries";

export type YearResponse = YearState & {
  anchorPrompt: string;
  entries: Array<EntryMeta & { content: string }> | null;
};

export default function Home() {
  const [data, setData] = useState<YearResponse | null>(null);
  const [revealSeen, setRevealSeen] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/year");
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from localStorage, an external store
    if (data?.status === "unlocked") setRevealSeen(Boolean(localStorage.getItem(`mm-revealed-${data.year}`)));
  }, [data?.status, data?.year]);

  const retry = useCallback(async () => {
    await fetch("/api/reflection/retry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ year: data?.year }),
    });
    void load();
  }, [data?.year, load]);

  useEffect(() => {
    if (data?.reflection.status === "running" || (data?.status === "unlocked" && data.reflection.status === "none")) {
      const t = setTimeout(() => void load(), 4000);
      return () => clearTimeout(t);
    }
  }, [data, load]);

  if (!data) return null;

  const currentCell = data.cells.find((c) => c.week === data.currentWeek);
  const sealedThisWeek = currentCell?.state === "sealed";

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <header className="mb-10 flex items-baseline justify-between font-mono text-xs text-[var(--gray-3)]">
        <span>{data.year}</span>
        <span>
          {data.cells.filter((c) => c.state === "sealed").length} sealed ·{" "}
          {data.cells.filter((c) => c.state === "future").length} to come
        </span>
      </header>

      <YearGrid cells={data.cells} revealing={data.status === "unlocked" && !revealSeen} />

      {data.status === "active" && data.currentWeek !== null && !sealedThisWeek && (
        <WritingSurface
          anchorPrompt={data.anchorPrompt}
          week={data.currentWeek}
          year={data.year}
          unlockDate={data.unlockDate}
          onSealed={load}
        />
      )}
      {data.status === "active" && sealedThisWeek && (
        <p className="mt-14 font-mono text-sm text-[var(--gray-3)] mm-enter">
          Week {data.currentWeek} is sealed. Nothing to do here until next week.
        </p>
      )}
      {data.status === "unlocked" && <ReadingPane data={data} onRetry={retry} showReveal />}

      <footer className="mt-20 flex items-center justify-between font-mono text-xs text-[var(--gray-3)]">
        <Link href="/archive" className="hover:text-[var(--fg)]">past years</Link>
        <Link href="/settings" className="hover:text-[var(--fg)]">⚙</Link>
      </footer>
    </main>
  );
}
