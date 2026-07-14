"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import YearGrid from "@/components/YearGrid";
import ReadingPane from "@/components/ReadingPane";
import type { YearResponse } from "@/app/page";

export default function ArchiveYearPage({ params }: { params: Promise<{ year: string }> }) {
  const { year } = use(params);
  const [data, setData] = useState<YearResponse | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/year?year=${year}`);
    if (res.ok) setData(await res.json());
  }, [year]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
  }, [load]);

  const retry = useCallback(async () => {
    await fetch("/api/reflection/retry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ year: Number(year) }),
    });
    void load();
  }, [year, load]);

  useEffect(() => {
    if (data?.status === "unlocked" && (data.reflection.status === "running" || data.reflection.status === "none")) {
      const t = setTimeout(() => void load(), 4000);
      return () => clearTimeout(t);
    }
  }, [data, load]);

  if (!data) return null;
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <header className="mb-10 font-mono text-xs text-[var(--gray-3)]">{data.year}</header>
      <YearGrid cells={data.cells} />
      <ReadingPane data={data} onRetry={retry} showReveal={false} />
      <footer className="mt-20 font-mono text-xs">
        <Link href="/archive" className="text-[var(--gray-3)] hover:text-[var(--fg)]">← past years</Link>
      </footer>
    </main>
  );
}
