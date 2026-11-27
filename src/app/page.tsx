import type { DailyCapacityInfo, MenuPackage, PublicSettings } from "@/lib/domain/types";
import { SiteNav } from "@/components/SiteNav";
import { PublicCatalogClient } from "./_components/PublicCatalogClient";
import { getDb } from "@/lib/db";
import { ensureInitialized, getPublicSnapshot } from "@/lib/repo/catering-repo";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let snapshot: {
    settings: PublicSettings;
    packages: MenuPackage[];
    capacities: DailyCapacityInfo[];
  };

  try {
    const db = await getDb();
    await ensureInitialized(db);
    snapshot = await getPublicSnapshot(db);
  } catch {
    snapshot = {
      settings: {
        businessName: "DapurRantang",
        whatsappNumber: "081200002711",
        addressArea: "Coblong, Bandung",
        dailyCapacityBoxes: 200,
        minDpPercent: 30,
      },
      packages: [],
      capacities: [],
    };
  }

  return (
    <div className="min-h-screen bg-[#FFF7ED] text-[#0F172A]">
      <SiteNav active="home" variant="public" />
      <main id="main-content">
        <PublicCatalogClient
          initialSettings={snapshot.settings}
          initialPackages={snapshot.packages}
          initialCapacities={snapshot.capacities}
        />
      </main>
    </div>
  );
}
