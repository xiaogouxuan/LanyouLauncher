import { useTranslation } from "@/i18n";
import { Badge } from "@/components/ui/Badge";
import { Folder, Package } from "lucide-react";

interface InstanceBadgeProps {
  instanceId?: string;
  isIsolated?: boolean;
}

export function InstanceBadge({ instanceId, isIsolated }: InstanceBadgeProps) {
  const { t } = useTranslation();

  if (!instanceId) return null;

  if (instanceId === "global") {
    return (
      <Badge variant="default" className="gap-1">
        <Folder size={12} />
        {t("mod.globalMods")}
      </Badge>
    );
  }

  return (
    <Badge variant="info" className="gap-1">
      <Package size={12} />
      {isIsolated ? t("mod.isolatedMods") : t("mod.globalMods")}: {instanceId}
    </Badge>
  );
}
