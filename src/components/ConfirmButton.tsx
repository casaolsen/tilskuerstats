"use client";

// Wraps a submit button with a native confirm() prompt — used for destructive
// admin actions (delete) so a misclick doesn't immediately submit the form.
export function ConfirmButton({
  confirmText,
  className,
  style,
  children,
}: {
  confirmText: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      style={style}
      onClick={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
