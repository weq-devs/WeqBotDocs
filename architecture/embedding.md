# 嵌入 WeQ（sidecar）

WeqBot 可以脱离独立进程，由 WeQ desktop 拉起成一个 **sidecar 子进程**。这一页讲清
进程边界、控制通道、凭据交付，以及为什么不是「同进程对象注入」。

源码：`packages/control/src/protocol.ts`、`packages/node/src/sidecar.ts`。

## 为什么是子进程

::: info 尚未接通

sidecar 的**契约与实现都在**，但 WeQ desktop 侧的 sidecar 管理器尚未落地。
这一页描述的是已定契约与预期形态。

:::

早期设计是「同进程对象注入」，后来改成子进程（D6）。原因：

1. **一个进程只持有一个 uin 的一条 SSO 会话**。多账号 = 多进程，凭据不跨进程共享内存 ——
   结构上杜绝串号；
2. **生命周期随 desktop**。宿主退出 / 崩溃，sidecar 跟着退，不留孤儿；
3. **纯 TS 打包**。sidecar 产物里**不能出现 `.node`**，只按路径加载 WeQ 资源里的那一个。

## 进程拓扑

```text
WeQ desktop (主进程)
   │  spawn
   ▼
weqbot-sidecar.mjs --sidecar --account <uin>
   │  NDJSON over stdio
   └─→ 控制通道（@weqbot/control）
```

多账号：

```text
desktop
  ├── sidecar(uin=A)   ← 凭据 A
  └── sidecar(uin=B)   ← 凭据 B
```

同 uin 第二次请求复用已在跑的实例，不重复 spawn。

## 控制通道

传输是 **NDJSON over stdio**，不是 RPC 框架。用到的只有「请求-应答 + 单向事件」，
一行一个 JSON 已经够，且 `text` 日志里可读。

### 信封

```ts
type ControlEnvelope = ControlRequest | ControlResponse | ControlEvent;

interface ControlBase {
  v: 1;                                  // 协议版本，破坏性变更时 +1
  kind: 'request' | 'response' | 'event';
}

interface ControlRequest  { kind: 'request';  id: number; method: string; params?: unknown }
interface ControlResponse { kind: 'response'; id: number; ok: boolean; result?: unknown; error?: ControlFailure }
interface ControlEvent    { kind: 'event';    event: string; data?: unknown }
```

`id` 由调用方自增，只用于配对 `response`；事件不带 `id`。单行上限
`MAX_CONTROL_LINE_BYTES`，超过视为协议错误。

### 方法表

| 方法 | 参数 | 结果 | 说明 |
| --- | --- | --- | --- |
| `ping` | `{}` | `{ pid, ts }` | 连通性探针；宿主确认子进程真的起来了 |
| `status` | `{}` | `ControlStatus` | 当前状态与设备档案（**不含 a1**） |
| `login` | `{ a1, guid, uid?, device?, qqDbPath? }` | `ControlStatus` | 交付 a1 并开始上线 |
| `shutdown` | `{ reason? }` | `null` | 主动下线并退出；宿主在 `before-quit` 里调 |

**没有 uin 参数** —— 账号由 spawn 时决定，控制通道拿不到第二个账号。

`login` 里的 `uid` 是 `openSession` 的必填字段：WeQ 的 `AccountConfig.uid` 是权威值，
而 native 的 EasyLogin 不回传 uid。宿主不传就只能依赖 vault 里已有的值。

### 事件

| 事件名 | 数据 | 说明 |
| --- | --- | --- |
| `state` | 状态机变化 | |
| `heartbeat` | 心跳 / 重连 / 被踢 | |
| `onebot` | OneBot 事件（消息、通知、请求） | |
| `bye` | — | sidecar 自己即将退出 |

事件语义在 `@weqbot/bot` 的 `BotEventMap` 里定义，`control` 只固定通道上的名字。

### 状态

```ts
interface ControlStatus {
  uin: string | null;
  state: 'idle' | 'connecting' | 'online' | 'degraded' | 'closed';
  sessionId: number | null;      // native 分配的会话 ID
  lastEventAt: number | null;    // 最近一次 native 上报的时间（ms）
  device: DeviceProfile | null;
}
```

::: tip 凭据永不出 sidecar

`status` 不含 a1。宿主给出去的只有状态，收不回来凭据。

:::

## 退出语义

sidecar 的退出条件有三个，任一条成立即退：

1. 收到 `shutdown`；
2. **stdin 关闭**（宿主退出 / 崩溃）—— 这条不依赖父进程的 signal，是 V10 的验收点；
3. 宿主显式 kill。

宿主在 `app.on('before-quit')` 里应当先 `control.shutdown()` 再 kill，确保 `UnRegister`
发得出去。

## CLI 的 `--sidecar`

```bash
weqbot --sidecar --account <uin> --config <path>
```

差异只有两处：

| 项 | 独立进程 | sidecar |
| --- | --- | --- |
| 凭据来源 | 自己的 vault | 控制通道 `login` |
| 输出 | 日志到 stdout / stderr | **stdout 是协议流**，日志走 stderr |

OneBot 配置**来自启动参数，不走控制通道**：一个 sidecar 一个账号，端口拓扑属于部署形态，
不该由每次 login 决定。

## 打包要求

::: warning 三条硬要求

1. sidecar 产物里**没有** `.node`，没有 `@weq/native`；
2. 不要把 `@weqbot/node` 当 external —— 它必须连同 `bot` / `session` / `protocol` /
   `control` 一起打进 bundle；只 external `node:*` 内置模块和 `.node`；
3. `electron.vite.config.ts` 的 `EXCLUDE_FROM_EXTERNAL` 要加 `@weqbot/*`。

:::

## 端口拓扑（尚未定）

WeQ desktop 现有进程内 OneBot 服务端只服务 mode 1；sidecar 的 OneBot 适配器服务 mode 2。
**两个进程不能绑同一端口。**

两条路：

| 方案 | 做法 | 代价 |
| --- | --- | --- |
| A（省事） | mode 2 账号用独立端口，账号页显示两套配置 | 客户端要按账号切换 |
| B（体验好） | desktop 做 OneBot 网关，按账号状态路由 | 网关要同时懂两种事件源 |

倾向先做 A，验证产品闭环后再评估 B。
