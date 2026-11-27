import { useEffect, useState } from "react";
import { Check, Copy } from "@/components/icons";

/** Copies `getText()` to the clipboard and briefly shows a check. */
export function CopyButton({
  getText,
  label = "Copy",
  className,
}: {
  getText: () => string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(getText());
          setCopied(true);
        } catch {
          /* clipboard blocked; nothing useful to do */
        }
      }}
      className={className}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}
