import { SiteNav } from "@/components/SiteNav";
import { AdminConsole } from "./_components/AdminConsole";

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <SiteNav active="admin" variant="ops" />
      <main id="main-content" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <AdminConsole />
      </main>
    </div>
  );
}
