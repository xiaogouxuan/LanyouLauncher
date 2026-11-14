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
/// - 启用了隔离且未指定自定义目录：返回版本实例目录
///   （有 `versions/<id>/.minecraft` 用之，否则用 HMCL/PCL 风格的 `versions/<id>`）
/// - 启用了隔离且指定了自定义目录：返回自定义目录
/// - 未启用隔离：返回 minecraft_dir
///
/// 另外兼容 HMCL/PCL 的隔离实例：它们不会写 lanyou.json，
/// 但如果 `versions/<id>` 下已经有 mods/saves/.minecraft，
/// 说明这是一个独立实例，仍按隔离目录启动。
pub fn resolve_version_game_dir(
    minecraft_dir: &Path,
    version_id: &str,
    meta: &VersionMeta,
) -> std::path::PathBuf {
    if !meta.is_isolated {
        if version_has_own_instance(minecraft_dir, version_id) {
            return crate::utils::paths::get_version_instance_dir(minecraft_dir, version_id);
        }
        return minecraft_dir.to_path_buf();
    }

    if meta.game_dir.is_empty() {
        crate::utils::paths::get_version_instance_dir(minecraft_dir, version_id)
    } else {
        Path::new(&meta.game_dir).to_path_buf()
    }
}

/// 判断版本目录是否是外部启动器（HMCL/PCL）留下的隔离实例
fn version_has_own_instance(minecraft_dir: &Path, version_id: &str) -> bool {
    let version_dir = crate::utils::paths::get_versions_dir(minecraft_dir).join(version_id);
    version_dir.join(".minecraft").is_dir()
        || version_dir.join("mods").is_dir()
        || version_dir.join("saves").is_dir()
}
