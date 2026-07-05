use serde::Serialize;
use std::collections::HashMap;
use std::fmt;

/// 可国际化的后端错误。
/// 序列化后会得到 JSON 字符串 `{ "key": "...", "params": {...} }`，
/// 前端解析后通过 i18n key 渲染对应语言文本。
#[derive(Debug, Clone, Serialize)]
pub struct I18nError {
    pub key: String,
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub params: HashMap<String, String>,
}

impl I18nError {
    pub fn new(key: impl Into<String>) -> Self {
        Self {
            key: key.into(),
            params: HashMap::new(),
        }
    }

    pub fn param(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.params.insert(key.into(), value.into());
        self
    }
}

impl fmt::Display for I18nError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{}",
            serde_json::to_string(self).unwrap_or_else(|_| self.key.clone())
        )
    }
}

impl std::error::Error for I18nError {}

/// 便捷宏：从现有错误构造带 detail 参数的 I18nError。
#[macro_export]
macro_rules! i18n_err {
    ($key:expr) => {
        $crate::i18n::error::I18nError::new($key)
    };
    ($key:expr, $detail:expr) => {
        $crate::i18n::error::I18nError::new($key).param("detail", $detail.to_string())
    };
}
