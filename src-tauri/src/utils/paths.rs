use std::path::PathBuf;

const LAUNCHER_DIR_NAME: &str = "LanyouLauncher";

/// 获取启动器数据目录
/// 便携设计：放在启动器 exe 所在目录下的 LanyouLauncher 子文件夹中
/// 避免账号、设置等文件直接散落在 exe 旁边
pub fn get_launcher_dir() -> PathBuf {
    get_exe_dir().join(LAUNCHER_DIR_NAME)
}

/// 获取默认 Minecraft 目录
/// 便携设计：放在启动器 exe 所在目录下的 .minecraft 中
pub fn get_default_minecraft_dir() -> PathBuf {
    get_exe_dir().join(".minecraft")
}

/// 获取启动器 exe 所在目录
fn get_exe_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from("."))
}

/// 获取版本目录
pub fn get_versions_dir(minecraft_dir: &std::path::Path) -> PathBuf {
    minecraft_dir.join("versions")
}

/// 获取 Mods 目录
pub fn get_mods_dir(minecraft_dir: &std::path::Path) -> PathBuf {
    minecraft_dir.join("mods")
}

/// 获取指定版本的 Mods 目录
/// 若传入版本 ID，优先使用该版本的 mods 目录，便于版本隔离
pub fn get_mods_dir_for_version(
    minecraft_dir: &std::path::Path,
    version_id: Option<&str>,
) -> PathBuf {
    if let Some(id) = version_id {
        let version_mods_dir = get_versions_dir(minecraft_dir)
            .join(id)
            .join("mods");
        if version_mods_dir.exists() || std::fs::create_dir_all(&version_mods_dir).is_ok() {
            return version_mods_dir;
        }
    }
    get_mods_dir(minecraft_dir)
}

/// 获取账号存储文件路径
pub fn get_accounts_file(launcher_dir: &std::path::Path) -> PathBuf {
    launcher_dir.join("accounts.json")
}

/// 获取设置存储文件路径
pub fn get_settings_file(launcher_dir: &std::path::Path) -> PathBuf {
    launcher_dir.join("settings.json")
}

/// 获取版本隔离时的游戏目录
/// HMCL 风格：versions/<version_id>/.minecraft
pub fn get_version_isolation_dir(minecraft_dir: &std::path::Path, version_id: &str) -> PathBuf {
    get_versions_dir(minecraft_dir)
        .join(version_id)
        .join(".minecraft")
}

/// 获取启动器为该版本保存的元数据文件路径
/// 用于保存版本隔离、自定义游戏目录等启动器专属配置
pub fn get_version_meta_file(minecraft_dir: &std::path::Path, version_id: &str) -> PathBuf {
    get_versions_dir(minecraft_dir)
        .join(version_id)
        .join("lanyou.json")
}