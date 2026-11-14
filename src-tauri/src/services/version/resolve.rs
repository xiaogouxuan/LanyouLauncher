use crate::i18n::I18nError;
use crate::i18n_err;
use serde_json::Value;
use std::path::Path;

/// 解析 `inheritsFrom` 版本链，返回合并后的完整 version.json
///
/// HMCL / PCL 以及 Forge / Fabric 等加载器安装出来的版本目录，
/// 往往只有一份「增量」json（带 inheritsFrom），
/// 直接读取会缺少 libraries / assetIndex / downloads 等字段，导致无法启动。
/// 这里按 Mojang 启动器的语义把父版本合并进来：
/// - libraries：父在前子在后，同名（group:artifact）以子为准
/// - arguments.jvm / arguments.game：父在前子在后拼接
/// - minecraftArguments：子版本存在则优先使用
/// - 其余字段（mainClass、type 等）：子版本覆盖父版本
pub fn load_merged_version_json(
    minecraft_dir: &Path,
    version_id: &str,
) -> Result<Value, I18nError> {
    let mut chain = Vec::new();
    let merged = load_with_chain(minecraft_dir, version_id, &mut chain)?;
    Ok(merged)
}

/// 获取版本继承链（自身在前，最底层的原版在最后）
pub fn load_version_chain(
    minecraft_dir: &Path,
    version_id: &str,
) -> Result<Vec<String>, I18nError> {
    let mut chain = Vec::new();
    load_with_chain(minecraft_dir, version_id, &mut chain)?;
    Ok(chain)
}

fn load_with_chain(
    minecraft_dir: &Path,
    version_id: &str,
    chain: &mut Vec<String>,
) -> Result<Value, I18nError> {
    if chain.iter().any(|id| id == version_id) {
        return Err(i18n_err!("errors.version.readVersionJsonFailed", "inheritsFrom cycle"));
    }
    chain.push(version_id.to_string());

    let json_path = crate::utils::paths::get_versions_dir(minecraft_dir)
        .join(version_id)
        .join(format!("{}.json", version_id));
    let content = std::fs::read_to_string(&json_path)
        .map_err(|e| i18n_err!("errors.version.readVersionJsonFailed", e))?;
    let mut current: Value = serde_json::from_str(&content)
        .map_err(|e| i18n_err!("errors.version.readVersionJsonFailed", e))?;

    let parent_id = current
        .get("inheritsFrom")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let mut merged = if let Some(parent_id) = parent_id {
        let parent = load_with_chain(minecraft_dir, &parent_id, chain)?;
        merge_version_json(&parent, &current)
    } else {
        current.take()
    };

    // 无论是否继承，最终 id 都对齐当前目录名，保证 jar、natives 路径正确
    if let Some(obj) = merged.as_object_mut() {
        obj.insert("id".to_string(), Value::String(version_id.to_string()));
        obj.remove("inheritsFrom");
    }

    Ok(merged)
}

/// 把子版本合并到父版本上
fn merge_version_json(parent: &Value, child: &Value) -> Value {
    let mut merged = parent.clone();
    let Some(merged_obj) = merged.as_object_mut() else {
        return child.clone();
    };
    let Some(child_obj) = child.as_object() else {
        return merged;
    };

    for (key, value) in child_obj {
        match key.as_str() {
            "id" | "inheritsFrom" => continue,
            "libraries" => continue,
            "arguments" => continue,
            "minecraftArguments" => {
                // 子版本自带的旧格式参数已包含完整启动参数，优先使用
                merged_obj.insert(key.clone(), value.clone());
            }
            _ => {
                merged_obj.insert(key.clone(), value.clone());
            }
        }
    }

    // libraries：父在前子在后，同名依赖以子版本为准
    let mut libraries: Vec<Value> = parent
        .get("libraries")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if let Some(child_libs) = child.get("libraries").and_then(|v| v.as_array()) {
        for lib in child_libs {
            if let Some(name) = lib.get("name").and_then(|v| v.as_str()) {
                let key = library_key(name);
                libraries.retain(|existing| {
                    existing
                        .get("name")
                        .and_then(|v| v.as_str())
                        .map(|n| library_key(n) != key)
                        .unwrap_or(true)
                });
            }
            libraries.push(lib.clone());
        }
    }
    merged_obj.insert("libraries".to_string(), Value::Array(libraries));

    // arguments：父在前子在后拼接，保持参数顺序
    let parent_args = parent.get("arguments");
    let child_args = child.get("arguments");
    if parent_args.is_some() || child_args.is_some() {
        let mut arguments = serde_json::Map::new();
        for section in ["jvm", "game"] {
            let mut items: Vec<Value> = Vec::new();
            for source in [parent_args, child_args] {
                if let Some(list) = source
                    .and_then(|args| args.get(section))
                    .and_then(|v| v.as_array())
                {
                    items.extend(list.iter().cloned());
                }
            }
            if !items.is_empty() {
                arguments.insert(section.to_string(), Value::Array(items));
            }
        }
        merged_obj.insert("arguments".to_string(), Value::Object(arguments));
    }

    merged
}

/// 依赖去重键：group:artifact（忽略版本号）
fn library_key(name: &str) -> String {
    let mut parts = name.split(':');
    match (parts.next(), parts.next()) {
        (Some(group), Some(artifact)) => format!("{}:{}", group, artifact),
        _ => name.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_merge_keeps_child_fields_and_parent_assets() {
        let parent = serde_json::json!({
            "id": "1.20.1",
            "mainClass": "net.minecraft.client.main.Main",
            "assetIndex": { "id": "5" },
            "downloads": { "client": { "size": 1, "url": "x" } },
            "libraries": [
                { "name": "com.example:base:1.0" },
                { "name": "org.lwjgl:lwjgl:3.3.2" }
            ],
            "arguments": { "game": ["--username"] }
        });
        let child = serde_json::json!({
            "id": "fabric-loader-0.15.11-1.20.1",
            "inheritsFrom": "1.20.1",
            "mainClass": "net.fabricmc.loader.impl.launch.knot.KnotClient",
            "libraries": [
                { "name": "net.fabricmc:fabric-loader:0.15.11" },
                { "name": "org.lwjgl:lwjgl:3.3.2" }
            ],
            "arguments": { "game": ["--fabric"] }
        });

        let merged = merge_version_json(&parent, &child);
        assert_eq!(merged["mainClass"], "net.fabricmc.loader.impl.launch.knot.KnotClient");
        assert_eq!(merged["assetIndex"]["id"], "5");
        assert_eq!(merged["libraries"].as_array().unwrap().len(), 3);
        assert_eq!(merged["arguments"]["game"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn test_library_key_ignores_version() {
        assert_eq!(library_key("org.lwjgl:lwjgl:3.3.2"), "org.lwjgl:lwjgl");
        assert_eq!(library_key("weird"), "weird");
    }
}
