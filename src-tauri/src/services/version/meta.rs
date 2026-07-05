use crate::models::version::VersionMeta;
use std::path::Path;

/// 读取版本元数据文件，不存在时返回默认值
pub fn read_version_meta(minecraft_dir: &Path, version_id: &str) -> VersionMeta {
    let meta_path = crate::utils::paths::get_version_meta_file(minecraft_dir, version_id);
    if !meta_path.exists() {
        return VersionMeta::default();
    }
    std::fs::read_to_string(&meta_path)
        .ok()
        .and_then(|content| serde_json::from_str::<VersionMeta>(&content).ok())
        .unwrap_or_default()
}

/// 保存版本元数据文件
pub fn save_version_meta(
    minecraft_dir: &Path,
    version_id: &str,
    meta: &VersionMeta,
) -> Result<(), std::io::Error> {
    let meta_path = crate::utils::paths::get_version_meta_file(minecraft_dir, version_id);
    if let Some(parent) = meta_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let content = serde_json::to_string_pretty(meta)?;
    std::fs::write(&meta_path, content)
}

/// 获取版本实际使用的游戏目录
/// - 启用了隔离且未指定自定义目录：返回 versions/<id>/.minecraft
/// - 启用了隔离且指定了自定义目录：返回自定义目录
/// - 未启用隔离：返回 minecraft_dir
pub fn resolve_version_game_dir(
    minecraft_dir: &Path,
    version_id: &str,
    meta: &VersionMeta,
) -> std::path::PathBuf {
    if !meta.is_isolated {
        return minecraft_dir.to_path_buf();
    }

    if meta.game_dir.is_empty() {
        crate::utils::paths::get_version_isolation_dir(minecraft_dir, version_id)
    } else {
        Path::new(&meta.game_dir).to_path_buf()
    }
}
