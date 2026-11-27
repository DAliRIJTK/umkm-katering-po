import { SiteNav } from "@/components/SiteNav";
import { TrackOrderClient } from "./_components/TrackOrderClient";

export default function TrackPage() {
  return (
    <div className="min-h-screen bg-[#FFF7ED] text-[#0F172A]">
      <SiteNav active="lacak" variant="public" />
      <main id="main-content" className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <TrackOrderClient />
      </main>
    </div>
  );
}
