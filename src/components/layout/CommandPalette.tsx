import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Home,
  Package,
  Puzzle,
  Network,
  User,
  Settings,
  Search,
  CornerDownLeft,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "@/i18n";
import { useVersionStore } from "@/stores/versionStore";
import { useAccountStore } from "@/stores/accountStore";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface PaletteItem {
  id: string;
  group: string;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  keywords: string;
  action: () => void;
}

/**
 * 命令面板（Ctrl+K）：以键盘驱动的方式快速跳转到页面、版本与账号。
 */
export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const installedVersions = useVersionStore((s) => s.installedVersions);
  const accounts = useAccountStore((s) => s.accounts);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const pages: PaletteItem[] = [
      { id: "nav-home", group: "pages", title: t("nav.home"), icon: Home, keywords: t("nav.home"), action: () => navigate("/") },
      { id: "nav-versions", group: "pages", title: t("nav.versions"), icon: Package, keywords: t("nav.versions"), action: () => navigate("/versions") },
      { id: "nav-mods", group: "pages", title: t("nav.mods"), icon: Puzzle, keywords: t("nav.mods"), action: () => navigate("/mods") },
      { id: "nav-multiplayer", group: "pages", title: t("nav.multiplayer"), icon: Network, keywords: t("nav.multiplayer"), action: () => navigate("/multiplayer") },
      { id: "nav-accounts", group: "pages", title: t("nav.accounts"), icon: User, keywords: t("nav.accounts"), action: () => navigate("/accounts") },
      { id: "nav-settings", group: "pages", title: t("nav.settings"), icon: Settings, keywords: t("nav.settings"), action: () => navigate("/settings") },
    ];

    const versions: PaletteItem[] = installedVersions.map((version) => ({
      id: `version-${version.id}`,
      group: "versions",
      title: version.id,
      subtitle: version.loader
        ? `${t(`version.${version.loader.toLowerCase()}`)} · ${t(`version.${version.version_type.toLowerCase()}`)}`
        : t(`version.${version.version_type.toLowerCase()}`),
      icon: Package,
      keywords: version.id,
      action: () => navigate(`/versions/${version.id}`, { state: { version } }),
    }));

    const accountItems: PaletteItem[] = accounts.map((account) => ({
      id: `account-${account.id}`,
      group: "accounts",
      title: account.username,
      subtitle:
        account.account_type === "Microsoft"
          ? t("account.microsoft")
          : account.account_type === "ThirdParty"
            ? t("account.thirdParty")
            : t("account.offline"),
      icon: User,
      keywords: `${account.username} ${account.id}`,
      action: () => navigate("/accounts"),
    }));

    return [...pages, ...versions, ...accountItems];
  }, [installedVersions, accounts, navigate, t, ]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) =>
      `${item.title} ${item.subtitle ?? ""} ${item.keywords}`.toLowerCase().includes(keyword)
    );
  }, [items, query]);

  useEffect(() => setActiveIndex(0), [query]);

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const node = listRef.current.children[activeIndex] as HTMLElement | undefined;
      node?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const run = (item: PaletteItem) => {
    onClose();
    item.action();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (filtered.length ? (index + 1) % filtered.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        filtered.length ? (index - 1 + filtered.length) % filtered.length : 0
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = filtered[activeIndex];
      if (item) run(item);
    }
  };

  if (!open) return null;

  const groupLabels: Record<string, string> = {
    pages: t("more.palettePages"),
    versions: t("more.paletteVersions"),
    accounts: t("more.paletteAccounts"),
  };

  return createPortal(
    <div className="fixed inset-0 z-[9998]">
      <div className="absolute inset-0 bg-scrim backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className="relative mx-auto mt-[10vh] w-[min(560px,calc(100%-2rem))] rounded-[10px] bg-surface-high border border-outline shadow-dialog animate-scale-in overflow-hidden">
        <div className="flex items-center gap-2 px-3.5 h-11 border-b border-outline-variant">
          <Search size={15} className="text-on-surface-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("more.palettePlaceholder")}
            className="flex-1 bg-transparent outline-none text-[13px] text-on-surface placeholder:text-on-surface-subtle"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded-[3px] border border-outline-variant text-on-surface-subtle">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="text-center text-[12px] text-on-surface-subtle py-8">{t("more.paletteEmpty")}</p>
          ) : (
            filtered.map((item, index) => {
              const Icon = item.icon;
              const showGroup =
                index === 0 || filtered[index - 1].group !== item.group;
              return (
                <div key={item.id}>
                  {showGroup && (
                    <p className="px-3.5 pt-2 pb-1 text-[10px] uppercase tracking-wide text-on-surface-subtle">
                      {groupLabels[item.group] ?? item.group}
                    </p>
                  )}
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => run(item)}
                    className={`w-full flex items-center gap-2.5 px-3.5 h-10 text-left transition-colors
                      ${index === activeIndex ? "bg-surface-hover" : ""}`}
                  >
                    <Icon size={15} className="text-on-surface-variant flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-on-surface truncate">{item.title}</p>
                      {item.subtitle && (
                        <p className="text-[10.5px] text-on-surface-subtle truncate">{item.subtitle}</p>
                      )}
                    </div>
                    {index === activeIndex && (
                      <CornerDownLeft size={13} className="text-on-surface-subtle" />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
