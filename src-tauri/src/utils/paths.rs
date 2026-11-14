use std::path::PathBuf;

const LAUNCHER_DIR_NAME: &str = "LanyouLauncher";

/// 获取启动器数据目录
/// 便携设计：放在启动器 exe 所在目录下的 LanyouLauncher 子文件夹中
/// 避免账号、设置等文件直接散落在 exe 旁边
pub fn get_launcher_dir() -> PathBuf {
    get_exe_dir().join(LAUNCHER_DIR_NAME)
}

/// 获取默认 Minecraft 目录
///
/// 便携设计，优先复用本机已有的游戏目录：
/// 1. exe 直接放在 `.minecraft` 根目录里（常见的 HMCL/PCL 便携布局）→ 直接使用该目录
/// 2. exe 与 `versions` 目录同级（PCL/HMCL 绿色版根目录）→ 把 exe 所在目录当作游戏目录
/// 3. 其余情况 → exe 目录下的 `.minecraft`
pub fn get_default_minecraft_dir() -> PathBuf {
    let exe_dir = get_exe_dir();

    let is_minecraft_root = exe_dir
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.eq_ignore_ascii_case(".minecraft"))
        .unwrap_or(false);
    if is_minecraft_root {
        return exe_dir;
    }

    // exe 与 versions 同级，且自身没有 .minecraft 子目录：视为绿色版游戏根目录
    let has_versions = exe_dir.join("versions").is_dir();
    let has_nested_minecraft = exe_dir.join(".minecraft").is_dir();
    if has_versions && !has_nested_minecraft {
        return exe_dir;
    }

    exe_dir.join(".minecraft")
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

/// 获取全局 Mods 目录
pub fn get_global_mods_dir(minecraft_dir: &std::path::Path) -> PathBuf {
    minecraft_dir.join("mods")
}

/// 获取指定版本的 Mods 目录
/// 若该版本启用了版本隔离，返回 versions/<id>/mods；
/// 否则返回全局 .minecraft/mods。
/// 调用方需自行确保目录存在。
pub fn get_mods_dir_for_version(
    minecraft_dir: &std::path::Path,
    version_id: Option<&str>,
) -> PathBuf {
    if let Some(id) = version_id {
        let meta_file = get_version_meta_file(minecraft_dir, id);
        let is_isolated = std::fs::read_to_string(&meta_file)
            .ok()
            .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
            .and_then(|json| json.get("is_isolated").and_then(|v| v.as_bool()))
            .unwrap_or(false);

        if is_isolated {
            // 与启动时的游戏目录保持一致：优先 versions/<id>/.minecraft，
            // 否则使用 HMCL/PCL 风格的 versions/<id>
            return get_version_instance_dir(minecraft_dir, id).join("mods");
        }
    }
    get_global_mods_dir(minecraft_dir)
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

/// 获取版本的实例目录（真正存放 mods/saves/options.txt 的地方）
///
/// 兼容多种启动器的隔离布局：
/// - 有 `versions/<id>/.minecraft` → 使用该目录（本启动器早期的隔离布局）
/// - 否则使用 `versions/<id>` 本身（HMCL / PCL 的版本隔离目录）
pub fn get_version_instance_dir(minecraft_dir: &std::path::Path, version_id: &str) -> PathBuf {
    let isolation_dir = get_version_isolation_dir(minecraft_dir, version_id);
    if isolation_dir.is_dir() {
        return isolation_dir;
    }
    get_versions_dir(minecraft_dir).join(version_id)
}

/// 获取启动器为该版本保存的元数据文件路径
/// 用于保存版本隔离、自定义游戏目录等启动器专属配置
pub fn get_version_meta_file(minecraft_dir: &std::path::Path, version_id: &str) -> PathBuf {
    get_versions_dir(minecraft_dir)
        .join(version_id)
        .join("lanyou.json")
}