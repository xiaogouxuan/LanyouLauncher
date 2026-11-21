use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Mutex;
use std::time::Duration;
use tokio::io::copy_bidirectional;
use tokio::net::{TcpListener, TcpStream, UdpSocket};

/// Minecraft 局域网世界广播使用的组播地址与端口
const LAN_GROUP: Ipv4Addr = Ipv4Addr::new(224, 0, 2, 60);
const LAN_PORT: u16 = 4445;
/// 广播间隔，与原版游戏的发送频率接近
const ANNOUNCE_INTERVAL: Duration = Duration::from_millis(1500);

/// 运行中的局域网桥接
struct Bridge {
    tasks: Vec<tokio::task::JoinHandle<()>>,
}

static BRIDGE: Mutex<Option<Bridge>> = Mutex::new(None);

/// 启动局域网桥接，返回本机代理端口
///
/// 原版游戏加入局域网世界只有两种方式：在局域网列表里双击，或者直接输 IP。
/// 直接输 IP 会触发会话校验，离线账号必然被踢回「无效会话」；
/// 而局域网列表依赖组播 224.0.2.60:4445，组播不会穿过联机的虚拟网络，
/// 所以客人在自己那边永远搜不到房间。
///
/// 这里在客人本机做两件事：
/// 1. 监听一个本地端口，把 TCP 流量转发到房主的虚拟 IP + 真实端口；
/// 2. 定期向本机组播地址播报这个代理端口，让游戏把它当成局域网世界列出来。
/// 这样客人只需在「多人游戏 → 局域网游戏」里双击，走的就是局域网通道，不会校验正版。
pub async fn start(host: &str, port: u16, motd: &str) -> Result<u16, String> {
    stop();

    let listener = TcpListener::bind(("0.0.0.0", 0))
        .await
        .map_err(|error| error.to_string())?;
    let local_port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();

    let target = format!("{host}:{port}");
    let proxy = tokio::spawn(async move {
        loop {
            let Ok((client, _)) = listener.accept().await else {
                continue;
            };
            let target = target.clone();
            tokio::spawn(async move {
                let Ok(mut server) = TcpStream::connect(&target).await else {
                    return;
                };
                let mut client = client;
                let _ = copy_bidirectional(&mut client, &mut server).await;
            });
        }
    });

    let payload = format!("[MOTD]{motd}[/MOTD][AD]{local_port}[/AD]");
    let announce = tokio::spawn(async move {
        let Ok(socket) = UdpSocket::bind(("0.0.0.0", 0)).await else {
            return;
        };
        let _ = socket.set_multicast_ttl_v4(4);
        let dest = SocketAddr::from((LAN_GROUP, LAN_PORT));
        loop {
            let _ = socket.send_to(payload.as_bytes(), dest).await;
            tokio::time::sleep(ANNOUNCE_INTERVAL).await;
        }
    });

    if let Ok(mut slot) = BRIDGE.lock() {
        *slot = Some(Bridge {
            tasks: vec![proxy, announce],
        });
    }

    Ok(local_port)
}

/// 停止局域网桥接，退出房间或断开联机时调用
pub fn stop() {
    if let Ok(mut slot) = BRIDGE.lock() {
        if let Some(bridge) = slot.take() {
            for task in bridge.tasks {
                task.abort();
            }
        }
    }
}
