import { SiteNav } from "@/components/SiteNav";
import { KitchenWorkspace } from "./_components/KitchenWorkspace";

export default function DapurPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <SiteNav active="dapur" variant="ops" />
      <main id="main-content" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <KitchenWorkspace />
      </main>
    </div>
  );
}
