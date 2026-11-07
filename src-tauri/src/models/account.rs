use serde::{Deserialize, Serialize};

/// 账号类型：离线账号、微软正版账号或外置登录（Yggdrasil / authlib-injector）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AccountType {
    Offline,
    Microsoft,
    ThirdParty,
}

/// 账号数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    /// 账号唯一标识（UUID）
    pub id: String,
    /// 玩家用户名
    pub username: String,
    /// 账号类型
    pub account_type: AccountType,
    /// 头像 URL（微软账号有真实头像）
    pub avatar_url: Option<String>,
    /// 自定义皮肤文件路径（离线账号）
    pub skin_path: Option<String>,
    /// 访问令牌
    pub access_token: Option<String>,
    /// 刷新令牌（仅微软账号）
    pub refresh_token: Option<String>,
    /// 令牌过期时间戳
    pub expires_at: Option<i64>,
    /// 是否为当前活跃账号
    pub is_active: bool,
    /// 外置登录认证服务器地址（仅 ThirdParty 账号）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_server: Option<String>,
}

/// 账号列表存储结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountStore {
    pub accounts: Vec<Account>,
    pub active_id: Option<String>,
}