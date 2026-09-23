"use client";

import { useState } from "react";

// Small warning marker for a match with an attendance-affecting note (e.g. a
// stand closed due to a sanction). Desktop gets the native title tooltip on
// hover; touch devices have no hover state, so tapping the badge also
// reveals the note inline right next to it — never color alone either way.
export function NoteBadge({ tooltip, className }: { tooltip: string; className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={`inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 p-0 text-[10px] leading-none font-bold text-white ${className ?? ""}`}
        style={{ background: "var(--status-warning)" }}
        title={tooltip}
        aria-label={tooltip}
        aria-expanded={open}
      >
        !
      </button>
      {open && (
        <span className="text-xs whitespace-pre-line" style={{ color: "var(--status-warning)" }}>
          {tooltip}
        </span>
      )}
    </span>
  );
}
