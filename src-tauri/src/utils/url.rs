use crate::models::settings::DownloadSource;

/// 根据下载源生成候选地址列表：优先源在前，备用源在后，任一失败可自动切换
pub fn resolve_download_urls(url: &str, source: &DownloadSource) -> Vec<String> {
    let mut mirrors = Vec::new();

    if let Some(mirror) = mirror_url(url) {
        mirrors.push(mirror);
    }

    // 依赖库镜像同时兼容 /maven 与 /libraries 两种路由，命中率更高
    if url.starts_with("https://libraries.minecraft.net/") {
        let alt = url.replacen(
            "https://libraries.minecraft.net/",
            "https://bmclapi2.bangbang93.com/libraries/",
            1,
        );
        mirrors.push(alt);
    }

    let mut result = vec![url.to_string()];
    match source {
        DownloadSource::Official => result.extend(mirrors),
        DownloadSource::Bmclapi => {
            let mut merged = mirrors;
            merged.push(url.to_string());
            result = merged;
        }
    }

    let mut deduped = Vec::with_capacity(result.len());
    for candidate in result {
        if !deduped.contains(&candidate) {
            deduped.push(candidate);
        }
    }
    deduped
}

fn mirror_url(url: &str) -> Option<String> {
    const RULES: [(&str, &str); 10] = [
        (
            "https://launchermeta.mojang.com/",
            "https://bmclapi2.bangbang93.com/",
        ),
        (
            "https://piston-meta.mojang.com/",
            "https://bmclapi2.bangbang93.com/",
        ),
        (
            "https://piston-data.mojang.com/",
            "https://bmclapi2.bangbang93.com/",
        ),
        (
            "https://launcher.mojang.com/",
            "https://bmclapi2.bangbang93.com/",
        ),
        (
            "https://libraries.minecraft.net/",
            "https://bmclapi2.bangbang93.com/maven/",
        ),
        (
            "https://resources.download.minecraft.net/",
            "https://bmclapi2.bangbang93.com/assets/",
        ),
        (
            "https://maven.fabricmc.net/",
            "https://bmclapi2.bangbang93.com/maven/",
        ),
        (
            "https://maven.minecraftforge.net/",
            "https://bmclapi2.bangbang93.com/maven/",
        ),
        (
            "https://maven.neoforged.net/releases/",
            "https://bmclapi2.bangbang93.com/maven/",
        ),
        (
            "https://maven.quiltmc.org/repository/release/",
            "https://bmclapi2.bangbang93.com/maven/",
        ),
    ];

    RULES
        .iter()
        .find(|(official, _)| url.starts_with(*official))
        .map(|(official, mirror)| url.replacen(*official, *mirror, 1))
}
