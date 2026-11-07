import anvilIcon from "@/assets/icons/game/anvil.png";
import cleanroomIcon from "@/assets/icons/game/cleanroom.png";
import cobblestoneIcon from "@/assets/icons/game/cobblestone.png";
import commandBlockIcon from "@/assets/icons/game/command-block.png";
import eggIcon from "@/assets/icons/game/egg.png";
import fabricIcon from "@/assets/icons/game/fabric.png";
import goldBlockIcon from "@/assets/icons/game/gold-block.png";
import grassIcon from "@/assets/icons/game/grass.png";
import grassPathIcon from "@/assets/icons/game/grass-path.png";
import labymodIcon from "@/assets/icons/game/labymod.png";
import neoforgeIcon from "@/assets/icons/game/neoforge.png";
import quiltIcon from "@/assets/icons/game/quilt.png";
import redstoneBlockIcon from "@/assets/icons/game/redstone-block.png";
import type { VersionInfo, VersionType } from "@/types/version";

interface VersionIconProps {
  version?: VersionInfo | null;
  versionType?: VersionType;
  loader?: string | null;
  size?: number;
  className?: string;
}

/*
 * 图标取自 PCL 的方块资源，和桌面启动器的视觉习惯保持一致：
 * 原版用草方块、Forge 用铁砧、Fabric/Quilt 用各自的羊毛方块。
 */
const LOADER_ICONS: Record<string, string> = {
  forge: anvilIcon,
  fabric: fabricIcon,
  neoforge: neoforgeIcon,
  quilt: quiltIcon,
  cleanroom: cleanroomIcon,
  optifine: grassPathIcon,
  liteloader: eggIcon,
  labymod: labymodIcon,
};

const TYPE_ICONS: Record<string, string> = {
  release: grassIcon,
  snapshot: commandBlockIcon,
  prerelease: commandBlockIcon,
  releasecandidate: commandBlockIcon,
  pending: commandBlockIcon,
  oldbeta: cobblestoneIcon,
  oldalpha: cobblestoneIcon,
  aprilfools: goldBlockIcon,
  unobfuscated: redstoneBlockIcon,
};

/**
 * 版本入口统一使用方块 PNG 图标。
 * 传入 version 时按加载器优先、版本类型次之的顺序选择图标；
 * 也让调用方可以直接传 loader，用于加载器选择列表。
 * 资源本身为 64×64，列表里只显示 16~22px，必须走平滑缩放，
 * 否则像素化缩放会在小尺寸下产生锯齿和糊块。
 */
export function VersionIcon({
  version,
  versionType,
  loader,
  size = 20,
  className = "",
}: VersionIconProps) {
  const loaderKey = (loader ?? version?.loader ?? "").toLowerCase();
  const typeKey = (versionType ?? version?.version_type ?? "Release").toLowerCase();
  const source = LOADER_ICONS[loaderKey] ?? TYPE_ICONS[typeKey] ?? grassIcon;

  return (
    <img
      src={source}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`shrink-0 ${className}`}
    />
  );
}
