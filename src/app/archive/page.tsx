"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ArchivePage() {
  const [years, setYears] = useState<Array<{ year: number; entryCount: number }> | null>(null);
  useEffect(() => {
    void fetch("/api/archive").then(async (r) => setYears((await r.json()).years));
  }, []);

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="font-mono text-xs text-[var(--gray-3)]">past years</h1>
      <ul className="mt-8 space-y-3">
        {years?.map((y) => (
          <li key={y.year}>
            <Link href={`/archive/${y.year}`} className="flex items-baseline justify-between border-b border-[var(--gray-1)] pb-3 hover:border-[var(--fg)]">
              <span className="text-2xl font-medium">{y.year}</span>
              <span className="font-mono text-xs text-[var(--gray-3)]">{y.entryCount}/52 sealed</span>
            </Link>
          </li>
        ))}
        {years?.length === 0 && <p className="text-sm text-[var(--gray-3)]">No unlocked years yet.</p>}
      </ul>
      <footer className="mt-20 font-mono text-xs">
        <Link href="/" className="text-[var(--gray-3)] hover:text-[var(--fg)]">← this year</Link>
      </footer>
    </main>
  );
}
