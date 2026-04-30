import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

// Static class lookup so Tailwind's compile-time scanner sees every
// possible variant. Dynamic `bg-${color}-100` strings do NOT work with
// Tailwind v4 because the JIT only inspects literal class names.
const ACCENT_CLASSES: Record<string, string> = {
  violet:
    "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  emerald:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  amber:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  slate:
    "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300",
};

interface KpiCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  accent?: keyof typeof ACCENT_CLASSES;
}

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "violet",
}: KpiCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="px-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
            {label}
          </p>
          <p className="text-3xl font-semibold mt-2 tabular-nums">{value}</p>
          {hint ? (
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {hint}
            </p>
          ) : null}
        </div>
        <div
          className={cn(
            "size-10 rounded-lg flex items-center justify-center shrink-0",
            ACCENT_CLASSES[accent] ?? ACCENT_CLASSES.violet,
          )}
        >
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}
