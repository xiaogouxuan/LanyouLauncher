import { useState, useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Account } from "@/types/account";

interface SkinPreviewProps {
  account: Account | null;
  size?: number;
  className?: string;
}

/**
 * 根据 UUID 判断默认皮肤模型。
 * 规则与 HMCL/Minecraft 一致：UUID 最低有效位为奇数时使用 Alex（slim），否则 Steve（wide）。
 */
function isSlimSkin(uuid: string): boolean {
  try {
    const hex = uuid.replace(/-/g, "").toLowerCase();
    if (hex.length !== 32) return false;
    const lsb = BigInt(`0x${hex.slice(16, 32)}`);
    return (lsb & BigInt(1)) === BigInt(1);
  } catch {
    return false;
  }
}

function getSkinUrl(account: Account): string {
  // 离线账号如果设置了自定义皮肤，优先使用本地皮肤文件
  if (account.account_type === "Offline") {
    if (account.skin_path) {
      return convertFileSrc(account.skin_path);
    }
    return isSlimSkin(account.id) ? "/img/Alex.png" : "/img/Steve.png";
  }
  // 微软账号优先尝试 crafatar 皮肤接口（基于正版 UUID）
  return `https://crafatar.com/skins/${account.id.replace(/-/g, "")}`;
}

export function SkinPreview({ account, size = 96, className = "" }: SkinPreviewProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const skinUrl = useMemo(() => (account ? getSkinUrl(account) : null), [account]);
  const modelLabel = useMemo(() => {
    if (!account) return "";
    return account.account_type === "Microsoft" ? "Microsoft" : isSlimSkin(account.id) ? "Alex" : "Steve";
  }, [account]);

  if (!account || !skinUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`rounded-2xl bg-surface-container flex items-center justify-center ${className}`}
      >
        <span className="text-2xl">?</span>
      </div>
    );
  }

  return (
    <div
      style={{ width: size, height: size }}
      className={`relative rounded-2xl bg-surface-container overflow-hidden ring-2 ring-surface/80 shadow-md ${className}`}
      title={modelLabel}
    >
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-container animate-pulse">
          <span className="text-xs text-on-surface-variant">Skin</span>
        </div>
      )}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-container">
          <span className="text-xs text-on-surface-variant">Skin</span>
        </div>
      ) : (
        <img
          src={skinUrl}
          alt={`${account.username} skin`}
          className="w-full h-full object-contain object-top pixelated"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
    </div>
  );
}
