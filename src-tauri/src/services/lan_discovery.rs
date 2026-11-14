use serde::Serialize;
use std::net::{Ipv4Addr, UdpSocket};
use std::time::{Duration, Instant};

/// Minecraft 局域网世界广播使用的组播地址与端口
const LAN_GROUP: Ipv4Addr = Ipv4Addr::new(224, 0, 2, 60);
const LAN_PORT: u16 = 4445;

/// 从局域网广播中发现的世界
#[derive(Debug, Clone, Serialize)]
pub struct LanWorld {
    /// 世界名称（MOTD）
    pub motd: String,
    /// 真实端口，单机开房时通常是 5xxxx
    pub port: u16,
}

/// 监听 Minecraft 局域网广播，返回发现的世界
///
/// 游戏内点击「对局域网开放」后会向 224.0.2.60:4445 周期性地发送
/// `[MOTD]世界名[/MOTD][AD]端口[/AD]`，这里直接解析广播内容，
/// 比读日志可靠，也不需要知道游戏进程。
pub fn discover(timeout: Duration) -> Vec<LanWorld> {
    let Ok(socket) = UdpSocket::bind(("0.0.0.0", LAN_PORT)) else {
        return Vec::new();
    };
    // 加入组播组；失败时仍然尝试接收（部分网络环境允许直接收到广播）
    let _ = socket.join_multicast_v4(&LAN_GROUP, &Ipv4Addr::UNSPECIFIED);
    let _ = socket.set_read_timeout(Some(Duration::from_millis(250)));

    let deadline = Instant::now() + timeout;
    let mut buffer = [0u8; 2048];
    let mut worlds: Vec<LanWorld> = Vec::new();

    while Instant::now() < deadline {
        let Ok((len, _)) = socket.recv_from(&mut buffer) else {
            continue;
        };
        let payload = String::from_utf8_lossy(&buffer[..len]).to_string();
        let Some(port) = parse_port(&payload) else {
            continue;
        };
        let motd = parse_segment(&payload, "MOTD").unwrap_or_else(|| "Minecraft".to_string());
        if worlds.iter().any(|world| world.port == port) {
            continue;
        }
        worlds.push(LanWorld { motd, port });
    }

    worlds
}

/// 取出 `[TAG]内容[/TAG]` 中的内容
fn parse_segment(payload: &str, tag: &str) -> Option<String> {
    let open = format!("[{}]", tag);
    let close = format!("[/{}]", tag);
    let start = payload.find(&open)? + open.len();
    let end = payload[start..].find(&close)? + start;
    Some(payload[start..end].trim().to_string())
}

/// 解析广播里的端口
fn parse_port(payload: &str) -> Option<u16> {
    parse_segment(payload, "AD")
        .and_then(|value| value.trim().parse::<u16>().ok())
        .filter(|port| *port > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_lan_broadcast() {
        let payload = "[MOTD]我的世界 - 生存[/MOTD][AD]52341[/AD]";
        assert_eq!(parse_port(payload), Some(52341));
        assert_eq!(
            parse_segment(payload, "MOTD").as_deref(),
            Some("我的世界 - 生存")
        );
    }

    #[test]
    fn ignores_invalid_payload() {
        assert_eq!(parse_port("hello"), None);
        assert_eq!(parse_port("[MOTD]x[/MOTD][AD]abc[/AD]"), None);
    }
}
