// Shared inline styling for plain HTML form controls across the admin pages,
// so every input/select/button looks consistent without a component library.
export const inputClass = "rounded border px-2 py-1 text-sm w-full";
export const inputStyle = { borderColor: "var(--border)", background: "var(--surface-1)" };

export const buttonClass = "rounded px-3 py-1.5 text-sm font-medium text-white whitespace-nowrap";
export const buttonStyle = { background: "var(--seq-450)" };

export const dangerButtonClass = "rounded px-3 py-1.5 text-sm font-medium text-white whitespace-nowrap";
export const dangerButtonStyle = { background: "#d03b3b" };
