import { Loader2 } from "lucide-react";

// Friendly loading spinner — used in place of `return null` so the
// screen is never blank while auth/route data is being resolved.
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-premium">
      <div className="flex flex-col items-center gap-3 text-neutral-500 dark:text-neutral-400">
        <Loader2 className="h-10 w-10 animate-spin text-gold-500" />
        <p className="text-sm font-medium">{label}</p>
      </div>
    </div>
  );
}

export default Loading;
