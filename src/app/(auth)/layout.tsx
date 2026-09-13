import Link from "next/link";

/**
 * The shell for every unauthenticated screen. Centred card, full-height, works
 * the same on a phone and a laptop — no separate mobile treatment.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 items-center justify-center px-5 py-10 sm:py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/login" className="inline-block">
            <p className="font-mono text-eyebrow text-orange uppercase">
              Allegro Strategia
            </p>
            <p className="font-display mt-1 text-display font-medium text-ink">aOS</p>
          </Link>
        </div>

        <div className="rounded-card border border-ink/8 bg-card shadow-soft p-6 shadow-sm sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
