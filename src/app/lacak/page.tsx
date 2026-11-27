import { Suspense } from "react";
import { SiteNav } from "@/components/SiteNav";
import { TrackOrderClient } from "./_components/TrackOrderClient";

export default function TrackPage() {
  return (
    <div className="min-h-screen bg-[#FFF7ED] text-[#0F172A]">
      <SiteNav active="lacak" variant="public" />
      <main id="main-content" className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Suspense
          fallback={
            <div className="rounded-2xl border border-[#E5D3C8] bg-white p-6 text-sm text-[#574337]">
              Memuat form pelacak pre-order...
            </div>
          }
        >
          <TrackOrderClient />
        </Suspense>
      </main>
    </div>
  );
}
