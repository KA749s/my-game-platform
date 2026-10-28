#!/usr/bin/env python3
"""Package tested browser rules and UI as offline Android app assets (no PeerJS CDN)."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
website = root / "starlit-cards" / "three-player"
assets = root / "android-lan" / "app" / "src" / "main" / "assets" / "lan"
assets.mkdir(parents=True, exist_ok=True)
for name in ("game-core.js", "style.css"):
    (assets / name).write_bytes((website / name).read_bytes())
html = (website / "index.html").read_text(encoding="utf-8")
html = re.sub(r'\s*<script src="https://cdn\.jsdelivr\.net/npm/peerjs[^"]+" defer></script>', "", html)
assert 'cdn.jsdelivr.net/npm/peerjs' not in html
html = re.sub(r'./app\\.js\\?v=\\d+', './app-lan.js', html)
html = re.sub(r'game-core\\.js\\?v=\\d+', 'game-core.js', html)
html = re.sub(r'style\\.css\\?v=\\d+', 'style.css', html)
html = html.replace('<div class="battle-heading"><span class="eyebrow">⚔ 星火卡牌对决</span>', '<div class="battle-heading"><span class="eyebrow">⚔ 星火卡牌对决</span><div class="lan-controls"><span id="turn-clock" class="turn-clock">45s</span><button id="sound-toggle" type="button">🔊</button><button id="battle-exit" type="button">✕ 退出</button></div>')
html = html.replace('三人联机 · 无需登录', '局域网对战 · 免登录')
html = html.replace('1～3 人自定义卡组版 v1.1.0', '局域网优化版 v1.2.0')
html = html.replace('单人挑战 AI，双人好友切磋，三人自由混战。自己组 22 张牌，无需账号、无需安装。',
                    '单人挑战 AI、双人单挑、三人混战。自己组 22 张牌；联机时三部手机连接同一个 Wi-Fi。')
html = html.replace('无需账号、无需安装', '无需账号')
html = html.replace('请输入 6 位房间号', '请输入房主的局域网 IP')
html = html.replace('placeholder="输入 6 位房间号"', 'placeholder="房主 IP，例如 192.168.1.2"')
html = html.replace('maxlength="6" inputmode="text"', 'maxlength="15" inputmode="decimal"')
html = html.replace('房主可以分享 6 位房间号或邀请链接给好友。', '房主显示 IP；朋友接入相同 Wi-Fi 后输入这个 IP。端口 38643。')
html = html.replace('邀请一位好友进行双人对决', '同 Wi-Fi 邀请一位好友进行双人对决')
html = html.replace('把房间号发给朋友，人数凑齐才能正式开战。', '把房主 IP 发给朋友，人数凑齐才能正式开战。')
html = html.replace('六位房间号', '房主局域网 IP')
html = html.replace('分享这个号码给朋友', '在同一 Wi-Fi 下把此 IP 发给朋友')
html = html.replace('邀请链接', '房主连接地址')
html = html.replace('复制邀请链接', '复制 IP')
html = html.replace('联机模式需网络连接和 WebRTC 信令服务。部分移动网络或严格防火墙可能无法互联；房主离开时对局结束。公开分享房间号可能允许陌生人加入。',
                    '联机只在同一 Wi-Fi 的设备间使用本地 TCP 连接，不需要公网房间服务器。请在可信 Wi-Fi 上测试；路由器启用客户端隔离时无法联机，房主离开后对局结束。')
html = html.replace('href="./privacy.html"', 'href="./privacy.html"')
html = html.replace('联机隐私与网络说明', '局域网隐私与网络说明')
html = html.replace('class="brand" href="./"', 'class="brand" href="./"')
html = html.replace('<title>星火牌局 · 1~3人卡牌对战 | 无需登录</title>', '<title>星火牌局 · 局域网 1～3 人对战</title>')
(assets / 'index.html').write_text(html, encoding="utf-8")
assert 'app-lan.js' in html and 'peerjs' not in html.lower()
print("Android offline LAN assets prepared:", [p.name for p in assets.iterdir()])
