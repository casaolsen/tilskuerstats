"use client";

import { useState } from "react";

// Copies a value (e.g. a media asset's URL) to the clipboard so it can be
// pasted into a plain URL field elsewhere in admin (venue image, team logo, ...).
export function CopyButton({
  value,
  className,
  style,
  children,
}: {
  value: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard API unavailable — nothing more we can do here
        }
      }}
    >
      {copied ? "Kopieret!" : children}
    </button>
  );
}
