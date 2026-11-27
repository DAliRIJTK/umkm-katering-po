import Link from "next/link";

interface SiteNavProps {
  active: "home" | "lacak" | "dapur" | "kasir" | "admin";
  variant?: "public" | "ops";
}

const NAV_ITEMS: Array<{ key: SiteNavProps["active"]; href: string; label: string }> = [
  { key: "home", href: "/", label: "Katalog" },
  { key: "lacak", href: "/lacak", label: "Lacak PO" },
  { key: "dapur", href: "/dapur", label: "Dapur & BOM" },
  { key: "kasir", href: "/kasir", label: "Kasir" },
  { key: "admin", href: "/admin", label: "Admin" },
];

export function SiteNav({ active, variant = "public" }: SiteNavProps) {
  const isOps = variant === "ops";

  return (
    <header
      className={
        isOps
          ? "border-b border-[#1E293B] bg-[#0F172A] text-white"
          : "border-b border-[#E5D3C8] bg-white text-[#0F172A]"
      }
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex min-h-[44px] items-center gap-2.5 rounded-lg pr-2 transition-opacity hover:opacity-90"
        >
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#C2410C] text-white"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth={2}>
              <path d="M5 10h14l-1.2 8.2A2 2 0 0 1 15.8 20H8.2a2 2 0 0 1-2-1.8L5 10Z" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              <path d="M4 10h16" />
            </svg>
          </span>
          <span className="font-display text-lg font-bold tracking-tight">DapurRantang</span>
        </Link>

        <nav aria-label="Navigasi utama" className="flex flex-wrap items-center gap-1.5">
          {NAV_ITEMS.map((item) => {
            const isCurrent = item.key === active;
            let className =
              "inline-flex min-h-[44px] items-center rounded-lg px-3.5 text-sm font-semibold transition-colors ";
            if (isCurrent) {
              className += isOps
                ? "bg-[#C2410C] text-white"
                : "bg-[#FFF7ED] text-[#C2410C] ring-1 ring-[#EA580C]/40";
            } else {
              className += isOps
                ? "text-slate-200 hover:bg-slate-800 hover:text-white"
                : "text-[#475569] hover:bg-[#FDF4F0] hover:text-[#0F172A]";
            }
            return (
              <Link key={item.key} href={item.href} className={className}>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
