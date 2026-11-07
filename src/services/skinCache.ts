import { accountService } from "@/services/accountService";
import type { Account } from "@/types/account";

/**
 * 皮肤纹理/头像缓存服务
 *
 * 统一所有皮肤加载路径，避免头像、3D 预览、全屏预览各自实现导致的不一致：
 *   1. 内存缓存
 *   2. 本地自定义皮肤（base64，避免 convertFileSrc 在多平台路径下的失败）
 *   3. 离线账号内置皮肤（Steve / Alex）
 *   4. 在线皮肤 API
 *   5. 最终兜底：内置 Steve 皮肤
 */

interface CacheEntry {
  /** 完整皮肤纹理 data URL */
  skinDataUrl: string;
  /** 预渲染头部头像 data URL */
  headDataUrl: string;
  /** 检测到的模型类型 */
  isSlim: boolean;
}

const cache = new Map<string, CacheEntry>();

const FALLBACK_STEVE = "/img/Steve.png";
const FALLBACK_ALEX = "/img/Alex.png";

/** UUID 最低有效位为奇数 → Alex（slim），与 HMCL 默认皮肤规则一致 */
export function isSlimUuid(uuid: string): boolean {
  try {
    const hex = uuid.replace(/-/g, "").toLowerCase();
    if (hex.length !== 32) return false;
    const lsb = BigInt(`0x${hex.slice(16, 32)}`);
    return (lsb & BigInt(1)) === BigInt(1);
  } catch {
    return false;
  }
}

export function getDefaultSkinUrl(accountPick: Pick<Account, "id">): string {
  return isSlimUuid(accountPick.id) ? FALLBACK_ALEX : FALLBACK_STEVE;
}

export function loadImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!url.startsWith("data:image/") && !url.startsWith("blob:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`skin image load failed: ${url.slice(0, 48)}`));
    if (signal) {
      if (signal.aborted) {
        reject(new DOMException("aborted", "AbortError"));
        return;
      }
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }
    img.src = url;
  });
}

/**
 * 从皮肤纹理中绘制 Minecraft 风格头像（脸层 + 帽子层）
 * 与 HMCL TexturesLoader.drawAvatar() 算法一致
 */
export function drawHeadFromSkin(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  size: number,
) {
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = false;

  const scale = img.naturalWidth / 64;

  ctx.drawImage(img, 8 * scale, 8 * scale, 8 * scale, 8 * scale, 0, 0, size, size);

  if (img.naturalHeight >= 64 * scale) {
    ctx.drawImage(img, 40 * scale, 8 * scale, 8 * scale, 8 * scale, 0, 0, size, size);
  }
}

/**
 * 从皮肤纹理生成头部头像 data URL
 */
export function generateHeadDataUrl(img: HTMLImageElement, size = 64): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  drawHeadFromSkin(ctx, img, size);
  return canvas.toDataURL("image/png");
}

/**
 * 从皮肤纹理像素检测 Alex (slim) 模型
 * 检测区域一次性读取，避免逐像素 getImageData 造成的卡顿
 */
export function detectSlimFromImage(img: HTMLImageElement): boolean {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0);

  const scale = img.naturalWidth / 64;

  const regionIsTransparentOrBlack = (x: number, y: number, w: number, h: number): boolean => {
    const px = ctx.getImageData(
      Math.floor(x * scale),
      Math.floor(y * scale),
      Math.max(1, Math.floor(w * scale)),
      Math.max(1, Math.floor(h * scale)),
    ).data;
    for (let i = 0; i < px.length; i += 4) {
      const alpha = px[i + 3];
      const isBlack = px[i] === 0 && px[i + 1] === 0 && px[i + 2] === 0;
      if (alpha !== 0 && !(isBlack && alpha === 255)) return false;
    }
    return true;
  };

  return (
    regionIsTransparentOrBlack(50, 16, 2, 4) ||
    regionIsTransparentOrBlack(54, 20, 2, 12) ||
    regionIsTransparentOrBlack(42, 48, 2, 4) ||
    regionIsTransparentOrBlack(46, 52, 2, 12)
  );
}

/** 清除指定账号的缓存（用于皮肤更换后强制重新加载） */
export function invalidateCache(accountId: string): void {
  cache.delete(accountId);
}

/** 获取缓存的皮肤条目 */
export function getCachedSkin(accountId: string): CacheEntry | null {
  return cache.get(accountId) ?? null;
}

/** 缓存皮肤纹理并预渲染头像 */
export function cacheSkin(accountId: string, img: HTMLImageElement): void {
  if (img.naturalWidth < 64 || img.naturalHeight < 32) return;

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(img, 0, 0);

  const entry: CacheEntry = {
    skinDataUrl: canvas.toDataURL("image/png"),
    headDataUrl: generateHeadDataUrl(img),
    isSlim: detectSlimFromImage(img),
  };

  cache.set(accountId, entry);
}

/**
 * 统一皮肤加载入口：任何情况下都返回一张可用皮肤纹理。
 */
export async function loadSkinForAccount(
  account: Account,
  signal?: AbortSignal,
): Promise<HTMLImageElement> {
  const cached = cache.get(account.id);
  if (cached?.skinDataUrl) {
    try {
      return await loadImage(cached.skinDataUrl, signal);
    } catch {
      // 缓存失效，继续走完整流程
    }
  }

  const isOffline = account.account_type === "Offline";

  // 本地自定义皮肤优先
  if (account.skin_path) {
    try {
      const dataUrl = await accountService.readSkinDataUrl(account.skin_path);
      const img = await loadImage(dataUrl, signal);
      if (img.naturalWidth >= 64 && img.naturalHeight >= 32) {
        cacheSkin(account.id, img);
        return img;
      }
    } catch (err) {
      console.warn("[skinCache] 读取本地皮肤失败:", err);
    }
  }

  // 离线账号使用内置皮肤，保证一定有头像
  if (isOffline) {
    try {
      const img = await loadImage(getDefaultSkinUrl(account), signal);
      cacheSkin(account.id, img);
      return img;
    } catch {
      // 继续尝试在线接口
    }
  }

  // 在线皮肤 API
  const uuid = account.id.replace(/-/g, "");
  const urls = [
    `https://crafatar.com/skins/${uuid}`,
    `https://mc-heads.net/skin/${uuid}`,
    `https://visage.surgeplay.com/skin/${uuid}`,
  ];
  for (const url of urls) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    try {
      const img = await loadImage(url, signal);
      if (img.naturalWidth >= 64 && img.naturalHeight >= 32) {
        cacheSkin(account.id, img);
        return img;
      }
    } catch {
      continue;
    }
  }

  // 最终兜底：内置 Steve，避免出现空白或把整张皮肤塞进头像
  const fallback = await loadImage(FALLBACK_STEVE, signal);
  cacheSkin(account.id, fallback);
  return fallback;
}

/** 预加载皮肤（用于列表页提前取图，后续渲染即时可用） */
export async function preloadSkin(account: Account, signal?: AbortSignal): Promise<void> {
  if (cache.has(account.id)) return;
  try {
    await loadSkinForAccount(account, signal);
  } catch {
    // 预加载失败不影响页面
  }
}
