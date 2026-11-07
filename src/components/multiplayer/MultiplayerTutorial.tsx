import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Crown, Rocket, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useTranslation } from "@/i18n";

type TutorialRole = "host" | "guest";

interface StepDef {
  key: string;
  image?: string;
}

const STEP_DEFS: Record<TutorialRole, StepDef[]> = {
  host: [
    { key: "host1", image: "/tutorial/host-role.webp" },
    { key: "host2", image: "/tutorial/host-settings.webp" },
    { key: "host3", image: "/tutorial/host-world.webp" },
    { key: "host4", image: "/tutorial/host-lan-menu.webp" },
    { key: "host5", image: "/tutorial/host-lan-port.webp" },
    { key: "host6", image: "/tutorial/host-port-chat.webp" },
    { key: "host7", image: "/tutorial/host-online.webp" },
  ],
  guest: [
    { key: "guest1", image: "/tutorial/guest-join.webp" },
    { key: "guest2" },
    { key: "guest3", image: "/tutorial/guest-game.webp" },
  ],
};

interface MultiplayerTutorialProps {
  open: boolean;
  onClose: () => void;
  initialRole?: TutorialRole;
}

export function MultiplayerTutorial({
  open,
  onClose,
  initialRole = "host",
}: MultiplayerTutorialProps) {
  const { t } = useTranslation();
  const [role, setRole] = useState<TutorialRole>(initialRole);
  const [index, setIndex] = useState(0);

  const steps = STEP_DEFS[role];
  const step = steps[index];
  const total = steps.length;

  useEffect(() => {
    if (!open) return;
    setRole(initialRole);
    setIndex(0);
  }, [open, initialRole]);

  useEffect(() => {
    if (!open) return;
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        setIndex((current) => Math.max(0, current - 1));
      } else if (event.key === "ArrowRight") {
        setIndex((current) => Math.min(steps.length - 1, current + 1));
      }
    };
    window.addEventListener("keydown", handleKeys);
    return () => window.removeEventListener("keydown", handleKeys);
  }, [open, steps.length]);

  const progress = useMemo(() => `${((index + 1) / total) * 100}%`, [index, total]);
  const isLast = index === total - 1;

  const switchRole = (nextRole: TutorialRole) => {
    setRole(nextRole);
    setIndex(0);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("multiplayer.tutorial.title")}
      className="!max-w-[1010px]"
      bodyClassName="!p-0"
    >
      <div className="flex h-[min(72vh,620px)] min-h-[460px]">
        <aside className="w-[228px] shrink-0 border-r border-outline-variant bg-surface-container/60 flex flex-col">
          <div className="px-3.5 pt-3.5 pb-3">
            <p className="text-[11px] leading-relaxed text-on-surface-subtle">
              {t("multiplayer.tutorial.subtitle")}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-btn bg-surface-high p-1 border border-outline-variant">
              <button
                type="button"
                onClick={() => switchRole("host")}
                className={`h-8 rounded-[6px] flex items-center justify-center gap-1.5 text-[11.5px] font-medium transition-colors ${
                  role === "host"
                    ? "bg-primary text-white shadow-sm"
                    : "text-on-surface-subtle hover:bg-surface-hover"
                }`}
              >
                <Crown size={13} />
                {t("multiplayer.tutorial.hostTab")}
              </button>
              <button
                type="button"
                onClick={() => switchRole("guest")}
                className={`h-8 rounded-[6px] flex items-center justify-center gap-1.5 text-[11.5px] font-medium transition-colors ${
                  role === "guest"
                    ? "bg-primary text-white shadow-sm"
                    : "text-on-surface-subtle hover:bg-surface-hover"
                }`}
              >
                <UserPlus size={13} />
                {t("multiplayer.tutorial.guestTab")}
              </button>
            </div>
          </div>

          <div className="px-2.5 pb-2 space-y-1 overflow-y-auto min-h-0 flex-1">
            {steps.map((item, itemIndex) => {
              const active = itemIndex === index;
              const completed = itemIndex < index;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setIndex(itemIndex)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-btn text-left transition-colors ${
                    active
                      ? "bg-primary/10 text-on-surface"
                      : "text-on-surface-subtle hover:bg-surface-hover hover:text-on-surface"
                  }`}
                >
                  <span
                    className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10.5px] font-semibold border ${
                      active
                        ? "bg-primary text-white border-primary"
                        : completed
                          ? "bg-primary/10 text-primary border-primary/30"
                          : "bg-surface-high text-on-surface-subtle border-outline-variant"
                    }`}
                  >
                    {itemIndex + 1}
                  </span>
                  <span className="text-[12px] font-medium leading-snug line-clamp-2">
                    {t(`multiplayer.tutorial.${item.key}Title`)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="px-3.5 py-3 border-t border-outline-variant">
            <div className="flex items-center justify-between text-[10.5px] text-on-surface-subtle">
              <span>{t("multiplayer.tutorial.progressLabel")}</span>
              <span className="font-medium text-on-surface-variant">
                {t("multiplayer.tutorial.progressValue", {
                  current: String(index + 1),
                  total: String(total),
                })}
              </span>
            </div>
            <div className="mt-1.5 h-1 rounded-full bg-surface-hover overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: progress }}
              />
            </div>
          </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 p-4 pb-2 flex items-center justify-center">
            {step.image ? (
              <img
                src={step.image}
                alt={t(`multiplayer.tutorial.${step.key}Title`)}
                className="max-w-full max-h-full rounded-2xl border border-outline-variant shadow-card object-contain bg-black/20"
              />
            ) : (
              <div className="w-full h-full rounded-2xl border border-outline-variant shadow-card bg-primary/10
                flex flex-col items-center justify-center gap-3 text-primary">
                <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/25 flex items-center justify-center">
                  <Rocket size={30} />
                </div>
                <p className="text-[13px] font-medium">{t(`multiplayer.tutorial.${step.key}Title`)}</p>
                <p className="text-[11px] text-on-surface-subtle px-10 text-center leading-relaxed">
                  {t(`multiplayer.tutorial.${step.key}Desc`)}
                </p>
              </div>
            )}
          </div>

          <div className="shrink-0 px-4 pb-3 pt-2">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[14px] font-semibold text-on-surface leading-snug">
                {t(`multiplayer.tutorial.${step.key}Title`)}
              </h3>
              <span className="shrink-0 mt-0.5 text-[10.5px] text-on-surface-subtle">
                {t("multiplayer.tutorial.progressValue", {
                  current: String(index + 1),
                  total: String(total),
                })}
              </span>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-on-surface-subtle">
              {t(`multiplayer.tutorial.${step.key}Desc`)}
            </p>
            <div className="mt-2.5 rounded-btn border border-primary/20 bg-primary/10 px-3 py-2 flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-[10px] font-semibold text-primary rounded-[3px] border border-primary/30 px-1 py-0.5">
                {t("multiplayer.tutorial.tipLabel")}
              </span>
              <p className="text-[11px] leading-relaxed text-on-surface-variant">
                {t(`multiplayer.tutorial.${step.key}Tip`)}
              </p>
            </div>
          </div>

          <div className="shrink-0 h-[52px] px-4 border-t border-outline-variant flex items-center justify-between gap-3">
            <Button
              variant="outlined"
              size="md"
              disabled={index === 0}
              onClick={() => setIndex((current) => Math.max(0, current - 1))}
            >
              <ChevronLeft size={14} />
              {t("multiplayer.tutorial.prev")}
            </Button>
            <span className="text-[10.5px] text-on-surface-subtle">
              {t("multiplayer.tutorial.keyboardHint")}
            </span>
            <Button
              variant="filled"
              size="md"
              onClick={() => {
                if (isLast) {
                  onClose();
                } else {
                  setIndex((current) => Math.min(total - 1, current + 1));
                }
              }}
            >
              {isLast ? t("multiplayer.tutorial.done") : t("multiplayer.tutorial.next")}
              {!isLast && <ChevronRight size={14} />}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
