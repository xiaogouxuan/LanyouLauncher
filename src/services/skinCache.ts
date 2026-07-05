import { accountService } from "@/services/accountService";
import type { Account } from "@/types/account";

/**
 * 皮肤纹理/头像内存缓存服务
 *
 * 参考 PCL-CE ModSkin 的缓存机制：
 *   Cache\Skin\{hash}.png      — 完整皮肤纹理
 *   Cache\Skin\Head\{id}.png   — 预渲染头部头像
 *
 * 本模块使用内存缓存（同进程生命周期内有效），
 * 避免每次挂载组件都重新发起网络请求，实现即时渲染。
 */

interface CacheEntry {
  /** 完整皮肤纹理 data URL */
  skinDataUrl: string;
  /** 预渲染 8x8 头像 data URL (32px canvas) */
  headDataUrl: string;
  /** 检测到的模型类型 */
  isSlim: boolean;
}

const cache = new Map<string, CacheEntry>();

/**
 * 从皮肤纹理 HTMLImageElement 生成头部头像 data URL
 */
function generateHeadDataUrl(img: HTMLImageElement, size = 32): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.imageSmoothingEnabled = false;
  const scale = img.naturalWidth / 64;
  const inset = Math.round(size / 18);

  // 脸层 (8,8, 8x8)
  ctx.drawImage(
    img,
    8 * scale, 8 * scale, 8 * scale, 8 * scale,
    inset, inset, size - 2 * inset, size - 2 * inset,
  );

  // 帽子层 (40,8, 8x8)
  if (img.naturalHeight >= 64) {
    ctx.drawImage(
      img,
      40 * scale, 8 * scale, 8 * scale, 8 * scale,
      0, 0, size, size,
    );
  }

  return canvas.toDataURL("image/png");
}

/**
 * 从皮肤纹理像素检测 Alex (slim) 模型
 * 与 HMCL NormalizedSkin.isSlim() 一致
 */
function detectSlimFromImage(img: HTMLImageElement): boolean {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  ctx.drawImage(img, 0, 0);
  const scale = img.naturalWidth / 64;

  // 检测区域是否全透明或全黑
  const hasOnlyTransparentOrBlack = (x: number, y: number, w: number, h: number): boolean => {
    for (let dy = 0; dy < h * scale; dy++) {
      for (let dx = 0; dx < w * scale; dx++) {
        const px = ctx.getImageData(
          Math.floor(x * scale + dx),
          Math.floor(y * scale + dy),
          1, 1,
        ).data;
        if (px[3] !== 0 && !(px[0] === 0 && px[1] === 0 && px[2] === 0 && px[3] === 255)) {
          return false;
        }
      }
    }
    return true;
  };

  // 检查右臂左侧区域 (50,16, 2x4), (54,20, 2x12)
  // 检查左臂右侧区域 (42,48, 2x4), (46,52, 2x12)
  return (
    hasOnlyTransparentOrBlack(50, 16, 2, 4) ||
    hasOnlyTransparentOrBlack(54, 20, 2, 12) ||
    hasOnlyTransparentOrBlack(42, 48, 2, 4) ||
    hasOnlyTransparentOrBlack(46, 52, 2, 12)
  );
}

/**
 * 清除指定账号的缓存（用于皮肤更换后强制重新加载）
 */
export function invalidateCache(accountId: string): void {
  cache.delete(accountId);
}

/**
 * 获取缓存的皮肤条目
 */
export function getCachedSkin(accountId: string): CacheEntry | null {
  return cache.get(accountId) ?? null;
}

/**
 * 缓存皮肤纹理并预渲染头像
 */
export function cacheSkin(accountId: string, img: HTMLImageElement): void {
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
 * 尝试从多个皮肤 API 加载并缓存（下次渲染即时可用）
 */
export async function preloadSkin(account: Account, signal?: AbortSignal): Promise<void> {
  const accountId = account.id;
  if (cache.has(accountId)) return;

  const urls = await getSkinUrlsForAccount(account);
  for (const url of urls) {
    if (signal?.aborted) return;
    try {
      const img = await loadImage(url, signal);
      if (img.naturalWidth >= 64 && img.naturalHeight >= 32) {
        cacheSkin(accountId, img);
        return;
      }
    } catch {
      continue;
    }
  }
}

async function getSkinUrlsForAccount(account: Account): Promise<string[]> {
  const urls: string[] = [];
  if (account.skin_path) {
    // 本地自定义皮肤优先：convertFileSrc 不稳定，使用 base64 兜底
    try {
      const dataUrl = await accountService.readSkinDataUrl(account.skin_path);
      urls.push(dataUrl);
    } catch (err) {
      console.warn("[skinCache] read skin data url failed:", err);
    }
  }
  const uuid = account.id.replace(/-/g, "");
  urls.push(`https://crafatar.com/skins/${uuid}`);
  urls.push(`https://mc-heads.net/skin/${uuid}`);
  urls.push(`https://visage.surgeplay.com/skin/${uuid}`);
  return urls;
}

function loadImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!url.startsWith("data:image/")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("load failed"));
    if (signal) {
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }
    img.src = url;
  });
}
