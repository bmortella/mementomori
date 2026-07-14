"use client";

import type { Cell } from "@/lib/years";

const CELL_STYLE: Record<Cell["state"], string> = {
  sealed: "bg-[var(--fg)]",
  current: "bg-[var(--bg)] mm-breathe",
  missed: "border border-[var(--gray-2)]",
  future: "border border-[var(--gray-1)]",
};

export default function YearGrid({
  cells,
  revealing = false,
  linkToEntries = false,
}: {
  cells: Cell[];
  revealing?: boolean;
  linkToEntries?: boolean;
}) {
  return (
    <div className="grid grid-cols-13 gap-[6px]" role="img" aria-label="52 weeks of the year">
      {cells.map((cell, i) => {
        const square = (
          <div
            className={`aspect-square w-full rounded-[3px] mm-enter ${revealing && cell.state === "sealed" ? "mm-fill" : ""} ${CELL_STYLE[cell.state]}`}
            style={{
              animationDelay: revealing
                ? `${cell.state === "sealed" ? i * 60 : 0}ms`
                : `${i * 12}ms`,
              ...(cell.state === "missed"
                ? { backgroundImage: "linear-gradient(135deg, transparent 46%, var(--gray-2) 46%, var(--gray-2) 54%, transparent 54%)" }
                : {}),
            }}
          />
        );
        return (
          <div key={cell.week} className="group relative">
            {linkToEntries && cell.state === "sealed" ? (
              <a href={`#week-${cell.week}`} aria-label={`read week ${cell.week}`}>
                {square}
              </a>
            ) : (
              square
            )}
            <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-[var(--fg)] px-2 py-1 font-mono text-[10px] text-[var(--bg)] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              wk {cell.week} · {cell.dates}
              {cell.sealedAt ? ` · sealed ${new Date(cell.sealedAt).toLocaleDateString()}` : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}
