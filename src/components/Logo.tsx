import { cn } from "../utils/cn";

export function Logo({
  size = "md",
  className,
  logoUrl,
}: {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  logoUrl?: string | null;
}) {
  const sizes = {
    sm: { box: "h-9 w-9", text: "text-lg" },
    md: { box: "h-12 w-12", text: "text-2xl" },
    lg: { box: "h-16 w-16", text: "text-3xl" },
    xl: { box: "h-24 w-24", text: "text-5xl" },
  } as const;
  const s = sizes[size];
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn(
          "relative shrink-0 rounded-2xl flex items-center justify-center font-serif font-bold overflow-hidden bg-white",
          s.box
        )}
        style={{
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 6px 18px -6px rgba(0,0,0,0.4)",
          border: "1px solid rgba(212,160,23,0.4)",
        }}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Restaurant logo"
            className="h-full w-full object-contain p-1"
          />
        ) : (
          <>
            <span
              className={cn(
                "font-serif font-bold bg-clip-text text-transparent",
                s.text
              )}
              style={{
                backgroundImage:
                  "linear-gradient(135deg, #ffd24d 0%, #d4a017 50%, #8b6508 100%)",
                WebkitBackgroundClip: "text",
              }}
            >
              7
            </span>
            {/* decorative chili */}
            <svg
              viewBox="0 0 32 32"
              className="absolute -bottom-1 -right-1 h-5 w-5"
              aria-hidden
            >
              <path
                d="M6 4 C 12 6 18 8 22 14 C 26 20 24 26 18 28 C 12 30 6 26 6 20 C 6 14 8 10 6 4 Z"
                fill="#c0392b"
              />
              <path
                d="M8 2 C 10 4 12 6 12 8"
                stroke="#16a34a"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
          </>
        )}
      </div>
      <div className="flex flex-col leading-tight">
        <span
          className={cn(
            "font-serif font-bold bg-clip-text text-transparent",
            s.text
          )}
          style={{
            backgroundImage:
              "linear-gradient(135deg, #d4a017 0%, #b8860b 60%, #8b6508 100%)",
            WebkitBackgroundClip: "text",
          }}
        >
          7 Spices
        </span>
        <span className="text-[0.6rem] tracking-[0.25em] font-semibold text-gold-700 dark:text-gold-300">
          RESTAURANT
        </span>
      </div>
    </div>
  );
}
