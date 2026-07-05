import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft, Puzzle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageTransition } from "@/components/common/PageTransition";
import { useTranslation } from "@/i18n";
import { useToast } from "@/components/ui/Toast";
import { openUrl } from "@/utils/openUrl";
import type { ModInfo } from "@/types/mod";

export default function ModDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { showToast } = useToast();

  const mod: ModInfo | undefined = (location.state as { mod?: ModInfo } | undefined)?.mod;

  const handleOpenSource = () => {
    if (!mod) return;
    const url =
      mod.source === "Modrinth"
        ? `https://modrinth.com/mod/${mod.id}`
        : `https://curseforge.com/minecraft/mc-mods/${mod.id}`;
    openUrl(url).catch(() => {
      showToast("error", t("errors.system.openUrlFailed", { detail: url }));
    });
  };

  return (
    <PageTransition>
      <div className="p-6 space-y-4 h-full flex flex-col">
        <Button variant="text" size="sm" onClick={() => navigate("/mods")} className="w-fit">
          <ChevronLeft size={16} />
          {t("common.back")}
        </Button>

        {!mod ? (
          <>
            <h1 className="text-2xl font-bold text-on-surface">{id}</h1>
            <Card>
              <p className="text-sm text-on-surface-variant">{t("mod.detailComingSoon")}</p>
            </Card>
          </>
        ) : (
          <>
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary-container flex items-center justify-center flex-shrink-0 overflow-hidden">
                {mod.icon_url ? (
                  <img src={mod.icon_url} alt={mod.name} className="w-full h-full object-cover" />
                ) : (
                  <Puzzle size={32} className="text-on-primary-container" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold text-on-surface truncate">{mod.name}</h1>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <Badge>{mod.source === "Modrinth" ? t("mod.sourceModrinth") : t("mod.sourceCurseForge")}</Badge>
                  {mod.loader && <Badge>{t(`version.${mod.loader.toLowerCase()}`)}</Badge>}
                </div>
              </div>
            </div>

            <Card>
              <h3 className="text-sm font-semibold text-on-surface mb-2">{t("mod.basicInfo")}</h3>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                {mod.description || t("mod.noDescription")}
              </p>
            </Card>

            <Card>
              <h3 className="text-sm font-semibold text-on-surface mb-4">{t("mod.basicInfo")}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-on-surface-variant mb-0.5">{t("mod.gameVersion")}</p>
                  <p className="text-on-surface font-medium">{mod.game_version || "-"}</p>
                </div>
                <div>
                  <p className="text-on-surface-variant mb-0.5">{t("mod.versionFilter")}</p>
                  <p className="text-on-surface font-medium">{mod.version || "-"}</p>
                </div>
                <div>
                  <p className="text-on-surface-variant mb-0.5">{t("mod.loaderFilter")}</p>
                  <p className="text-on-surface font-medium">{mod.loader ? t(`version.${mod.loader.toLowerCase()}`) : "-"}</p>
                </div>
                <div>
                  <p className="text-on-surface-variant mb-0.5">{t("mod.source")}</p>
                  <p className="text-on-surface font-medium">
                    {mod.source === "Modrinth" ? t("mod.sourceModrinth") : t("mod.sourceCurseForge")}
                  </p>
                </div>
              </div>
            </Card>

            <div className="flex gap-2">
              <Button variant="outlined" size="sm" onClick={handleOpenSource}>
                <ExternalLink size={16} className="mr-1" />
                {t("mod.viewPage", { source: mod.source })}
              </Button>
            </div>
          </>
        )}
      </div>
    </PageTransition>
  );
}
