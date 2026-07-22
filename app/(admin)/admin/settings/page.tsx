import { Image as ImageIcon } from "lucide-react";
import type { Metadata } from "next";

import { LogoField } from "@/components/admin/logo-field";
import { Panel, SectionHeader } from "@/components/ui/panel";
import { requireAdmin } from "@/lib/access";
import { getLogoUrl } from "@/lib/settings";

export const metadata: Metadata = { title: "Settings — Admin" };

export default async function AdminSettingsPage() {
  await requireAdmin();
  const logoUrl = await getLogoUrl();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1">Settings</h1>
        <p className="text-mono text-text-faint">App configuration</p>
      </div>

      <Panel>
        <SectionHeader
          icon={ImageIcon}
          title="Branding"
          description="Your logo — shown in the marketing header and the app sidebar."
        />
        <div className="mt-5">
          <LogoField logoUrl={logoUrl} />
        </div>
      </Panel>
    </div>
  );
}
