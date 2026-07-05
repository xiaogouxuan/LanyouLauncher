use uuid::Uuid;

/// 基于用户名生成离线 UUID（与 Minecraft 官方/Java 版完全一致）
/// 算法：UUID.nameUUIDFromBytes(("OfflinePlayer:" + username).getBytes(StandardCharsets.UTF_8))
/// 即对 "OfflinePlayer:<username>" 的 UTF-8 字节做 MD5，然后设置 version=3 和 variant=2
pub fn generate_offline_uuid(username: &str) -> String {
    let input = format!("OfflinePlayer:{}", username);
    let digest = md5::compute(input.as_bytes());
    let mut bytes = [0u8; 16];
    bytes.copy_from_slice(digest.as_ref());
    // version 3 (bits 12-15 of time_hi_and_version field)
    bytes[6] = (bytes[6] & 0x0f) | 0x30;
    // variant 2 (RFC 4122, bits 62-63)
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Uuid::from_bytes(bytes).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_offline_uuid_format() {
        let uuid = generate_offline_uuid("Player123");
        assert_eq!(uuid.len(), 36);
        assert!(uuid.chars().filter(|&c| c == '-').count() == 4);
    }

    #[test]
    fn test_offline_uuid_deterministic() {
        let a = generate_offline_uuid("Steve");
        let b = generate_offline_uuid("Steve");
        assert_eq!(a, b);
    }
}
