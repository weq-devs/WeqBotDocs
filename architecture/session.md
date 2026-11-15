# 登录与上线流程

mode 2（自建上线）的每一步都可能失败，而且**失败后的正确动作不同**：凭据错要停，
网络断要重登，注册被拒要退避。把「当前在哪一步」显式建模成状态机，比散落的 boolean
好排查，也方便宿主 UI 直接显示进度。

源码：`packages/session/src/state.ts`、`packages/bot/src/createBot.ts`。

## 状态机

```text
idle ──→ preflight ──→ logging-in ──→ logged-in ──→ registering ──→ online
  │          │              │              │               │            │
  └──────────┴──────────────┴──────────────┴───────────────┴────────────┤
                                                                        ↓
                                        degraded ←───────────────────────┘
                                           │  ↑
                              logging-in ──┘  └── online（native 自己重连成功）
```

| 状态 | 含义 |
| --- | --- |
| `idle` | 还没开始 |
| `preflight` | 环境预检：平台、QQ 安装路径、VM 可用性、native 能力 |
| `logging-in` | `quickLogin(a1)` 换票 |
| `logged-in` | 拿到 a2/d2/d2Key，尚未注册 |
| `registering` | `openSession(mode 2)`：`SsoInfoSync` 注册 + 首屏同步 + 挂推送 |
| `online` | 在线：心跳由 native 维持，事件从 sink 进来 |
| `degraded` | 掉线重试中（退避等待 / 重登） |
| `closed` | 终止态 |

**迁移不允许跳步**，跳步会抛 `IllegalTransitionError`。唯一例外是 `closed`：任何状态都能
一步关掉。

`degraded` 有两条出口：

- → `logging-in`：a1 还能用时重新换票；
- → `online`：native 自己完成了重连（`reconnected`），不重走登录。

## 每一步的失败处理

### preflight

检查项：平台支持、QQ 安装路径存在、签名 VM 可用、native 能力齐全、vault 里有 a1。

任一失败都**停在这里**并报具体项 —— 这一步能查出来的问题，拖到联网阶段只会更难定位。

### logging-in

`quickLogin(a1)` 的失败分三类，处理方式完全不同：

| 类型 | 表现 | 动作 |
| --- | --- | --- |
| a1 失效 | `140022015`「用户身份已失效，请重新登录」 | **停**，提示重新登录 QQ 或扫码 |
| 网络错误 | 超时 / 连接失败 | 退避重试 |
| 风控 | `unusual-device` 等 | **停**并报错 |

::: warning 不要拿失效 a1 硬重试

反复用失效 a1 调用 `quickLogin` 只会引发风控。错误码是 `140022015` 时必须停下来。

:::

### registering

`openSession(mode 2)` 内部完成：连接 → 注册（`SsoInfoSync`）→ 心跳 → 首屏同步。
TS 侧再额外等 `session.syncGraceMs`（默认 15s），因为慢账号的 `InfoSyncPush` 可能晚到。

等不到仍然报 `REGISTER_FAILED`，**不会假装在线** —— 「状态显示在线但收不到消息」比直接
报错难查得多。

### online

心跳由 native 维持。TS 侧只接两件事：

- **推送 sink**：解码成 `BotEvent`；
- **状态 sink**：`kicked` 直接终止（正常不该出现，因为我们不抢登录）；`closed` 按网络
  掉线走退避重登。

## 退避与重登

```text
degraded → 等 1s → logging-in → 失败 → 等 2s → 4s → 8s → 16s → …
```

`maxReloginAttempts`（默认 5）耗尽后进入 `relogin-failed`，进程停止重试。

a1 还能用就不用重新登录 QQ —— 重登只是重新 `quickLogin(a1)`。

## 崩溃恢复

进程重启 = 从 vault 拿 a1 → 重走一遍 `preflight` 之后的所有步骤。

**不需要持久化任何票据**：a2 / d2 / d2Key 都是派生物，重新换就行。这也避免了
「票据过期但状态显示在线」的假象。

## 优雅下线

`bot.stop()` 会走 `closeSession` → 发 `UnRegister`，服务端才会把这条会话摘掉。

CLI 接了三个信号：

| 信号 | 场景 |
| --- | --- |
| `SIGINT` | Ctrl-C |
| `SIGTERM` | systemd / docker / kill 默认 |
| `SIGHUP` | 关终端窗口 |

`SIGHUP` 之前漏过 —— 在终端里直接关窗口时进程会被直接杀掉，`UnRegister` 根本发不出去，
手机端会一直显示「电脑在线」。

`SIGKILL` 接不住（内核直接回收），那种情况只能靠服务端心跳超时把会话摘掉。

## 离线原因（`OfflineReason`）

离线是一等事件，必须报告原因，否则上层无法决定要不要重登：

| 值 | 含义 |
| --- | --- |
| `kicked` | 服务端 `KickNT`。正常情况下不该出现（我们不与 QQ 抢登录） |
| `network` | 网络断 / 心跳超时 |
| `closed` | 主动下线（用户关账号 / bot 停止） |
| `bot-exit` | OneBot `bot_exit` 主动下线 |
| `relogin-failed` | 重登失败次数耗尽 |
| `register-failed` | 注册阶段就被拒（凭据失效 / 风控） |

事件格式见[会话事件](/events/session)。
