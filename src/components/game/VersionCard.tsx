import { VersionIcon } from "./VersionIcon";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { VersionInfo, VersionType, LoaderType } from "@/types/version";
import { useTranslation } from "@/i18n";

function getInstalledLoaderFromHistory(version: VersionInfo): { loader: LoaderType; version: string } | null {
  if (!version.loader_history) return null;
  const entry = (Object.entries(version.loader_history) as [LoaderType, string | undefined][])
    .find(([, v]) => v && v.length > 0);
  return entry ? { loader: entry[0], version: entry[1] ?? "" } : null;
}

interface VersionCardProps {
  version: VersionInfo;
  onClick?: () => void;
}

const TYPE_VARIANT: Record<VersionType, "success" | "warning" | "default" | "danger" | "info"> = {
  Release: "info",
  Snapshot: "warning",
  PreRelease: "info",
  ReleaseCandidate: "info",
  OldBeta: "default",
  OldAlpha: "default",
  Pending: "info",
  AprilFools: "warning",
  Unobfuscated: "default",
};

export function VersionCard({ version, onClick }: VersionCardProps) {
  const { t } = useTranslation();
  const installedLoader = version.loader
    ? { loader: version.loader, version: "" }
    : getInstalledLoaderFromHistory(version);

  return (
    <Card hover onClick={onClick} className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <VersionIcon version={version} size={22} />
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-on-surface">{version.id}</span>
            <Badge variant={TYPE_VARIANT[version.version_type] ?? "default"}>
              {t(`version.${version.version_type.toLowerCase()}`)}
            </Badge>
            {installedLoader && (
              <Badge className="gap-1">
                <VersionIcon loader={installedLoader.loader} size={13} />
                {t(`version.${installedLoader.loader.toLowerCase()}`)}
                {installedLoader.version && (
                  <span className="text-on-surface-variant">{installedLoader.version}</span>
                )}
              </Badge>
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
