import { SiteNav } from "@/components/SiteNav";
import { CashierDesk } from "./_components/CashierDesk";

export default function KasirPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <SiteNav active="kasir" variant="ops" />
      <main id="main-content" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <CashierDesk />
      </main>
    </div>
  );
}
