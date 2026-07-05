use crate::models::settings::DownloadSource;

/// 根据下载源将官方 URL 转换为镜像 URL
pub fn resolve_download_url(url: &str, source: &DownloadSource) -> String {
    if matches!(source, DownloadSource::Official) {
        return url.to_string();
    }

    // BMCLAPI 镜像映射
    if url.starts_with("https://launchermeta.mojang.com/") {
        return url.replacen(
            "https://launchermeta.mojang.com/",
            "https://bmclapi2.bangbang93.com/",
            1,
        );
    }
    if url.starts_with("https://piston-meta.mojang.com/") {
        return url.replacen(
            "https://piston-meta.mojang.com/",
            "https://bmclapi2.bangbang93.com/",
            1,
        );
    }
    if url.starts_with("https://piston-data.mojang.com/") {
        return url.replacen(
            "https://piston-data.mojang.com/",
            "https://bmclapi2.bangbang93.com/",
            1,
        );
    }
    if url.starts_with("https://launcher.mojang.com/") {
        return url.replacen(
            "https://launcher.mojang.com/",
            "https://bmclapi2.bangbang93.com/",
            1,
        );
    }
    if url.starts_with("https://libraries.minecraft.net/") {
        return url.replacen(
            "https://libraries.minecraft.net/",
            "https://bmclapi2.bangbang93.com/maven/",
            1,
        );
    }
    if url.starts_with("https://resources.download.minecraft.net/") {
        return url.replacen(
            "https://resources.download.minecraft.net/",
            "https://bmclapi2.bangbang93.com/assets/",
            1,
        );
    }

    url.to_string()
}
