import { FolderOpen, Box, Clock, History, Sparkles, AlertCircle, FileCode } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { VersionInfo, VersionType } from "@/types/version";
import { useTranslation } from "@/i18n";

interface VersionCardProps {
  version: VersionInfo;
  onClick?: () => void;
}

const TYPE_ICON: Record<VersionType, React.ReactNode> = {
  Release: <Box size={20} />,
  Snapshot: <Clock size={20} />,
  PreRelease: <FileCode size={20} />,
  ReleaseCandidate: <FileCode size={20} />,
  OldBeta: <History size={20} />,
  OldAlpha: <History size={20} />,
  Pending: <AlertCircle size={20} />,
  AprilFools: <Sparkles size={20} />,
  Unobfuscated: <FileCode size={20} />,
};

const TYPE_VARIANT: Record<VersionType, "success" | "warning" | "default" | "danger" | "info" | "purple"> = {
  Release: "success",
  Snapshot: "warning",
  PreRelease: "info",
  ReleaseCandidate: "info",
  OldBeta: "default",
  OldAlpha: "default",
  Pending: "info",
  AprilFools: "purple",
  Unobfuscated: "default",
};

export function VersionCard({ version, onClick }: VersionCardProps) {
  const { t } = useTranslation();

  return (
    <Card hover onClick={onClick} className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-on-surface-variant">{TYPE_ICON[version.version_type] ?? <FolderOpen size={20} />}</span>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-on-surface">{version.id}</span>
            <Badge variant={TYPE_VARIANT[version.version_type] ?? "default"}>
              {t(`version.${version.version_type.toLowerCase()}`)}
            </Badge>
            {version.loader && (
              <Badge>{t(`version.${version.loader.toLowerCase()}`)}</Badge>
            )}
          </div>
          {version.install_time && (
            <p className="text-xs text-on-surface-variant mt-0.5">
              {t("version.installedAt")} {new Date(version.install_time).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
