import type { ComfortScore } from "@/lib/tunnels";
import { comfortLabel } from "@/lib/tunnels";

const bg: Record<ComfortScore, string> = {
  very: "bg-[var(--color-comfort-very)]/55 text-[oklch(0.32_0.05_165)]",
  good: "bg-[var(--color-comfort-good)]/55 text-[oklch(0.34_0.05_220)]",
  moderate: "bg-[var(--color-comfort-moderate)]/55 text-[oklch(0.36_0.06_60)]",
  difficult: "bg-[var(--color-comfort-difficult)]/55 text-[oklch(0.36_0.05_18)]",
  unknown: "bg-[var(--color-comfort-unknown)]/55 text-foreground",
};

export function ComfortBadge({ score, size = "md" }: { score: ComfortScore; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "text-xs px-2.5 py-1" : "text-sm px-3 py-1.5";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${cls} ${bg[score]}`}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {comfortLabel[score]}
    </span>
  );
}
