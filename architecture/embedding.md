# 嵌入 WeQ（sidecar）

WeqBot 可以脱离独立进程，由 WeQ desktop 拉起成一个 **sidecar 子进程**。这一页讲清
进程边界、控制通道、凭据交付，以及为什么不是「同进程对象注入」。

源码：`packages/control/src/{protocol,codec,socket}.ts`、`packages/node/src/{control-host,sidecar,daemon}.ts`。

## 为什么是子进程

::: info 尚未接通

sidecar 的**契约与实现都在**，但 WeQ desktop 侧的 sidecar 管理器尚未落地。
这一页描述的是已定契约与预期形态。

:::

早期设计是「同进程对象注入」，后来改成子进程（D6）。原因：

1. **一个进程只持有一个 uin 的一条 SSO 会话**。多账号 = 多进程，凭据不跨进程共享内存 ——
   结构上杜绝串号；
2. **生命周期可控**。sidecar 跟着宿主退，不留孤儿；需要「宿主关了 bot 还在」时改
   用常驻 daemon 形态（`--serve`，见下文）；
3. **纯 TS 打包**。sidecar 产物里**不能出现 `.node`**，只按路径加载 WeQ 资源里的那一个。

**没有 WebUI**：`--sidecar` / `--serve` 都不起控制台。管理界面由宿主编排（WeQ 在
Electron 里自己实现网络配置页）；weqbot 的 WebUI 只属于独立部署那一形态。

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
| `login` | `{ a1, guid, uid?, device?, qqDbPath? }` | `ControlStatus` | 交付 a1 并**自建上线**（mode 2，要求 QQ 离线） |
| `attach` | `{ pid, uin, uid, guid, a2, d2, d2Key, secToken?, subAppId, clientVersion?, qua?, wrapperPath?, device? }` | `ControlStatus` | **有头模式**（mode 1，要求 QQ 在线）：借 QQ 的会话 |
| `onebot.get` | `{}` | `ControlOneBotState` | 读 OneBot 配置（令牌打码）与实时监听 |
| `onebot.set` | `{ config }` | `ControlOneBotState` | 改配置并立即生效；失败回滚旧配置 |
| `shutdown` | `{ reason? }` | `null` | 主动下线并退出；宿主在 `before-quit` 里调 |

**没有 uin 参数** —— 账号由 spawn 时决定，控制通道拿不到第二个账号。

`login` 里的 `uid` 是 `openSession` 的必填字段：WeQ 的 `AccountConfig.uid` 是权威值，
而 native 的 EasyLogin 不回传 uid。宿主不传就只能依赖 vault 里已有的值。

### `login` 与 `attach` 互斥

两者在「谁拥有账号的在线状态」上是对立的：`login` 是我们自己注册上线，`attach`
只是搭 QQ 的 SSO 通道。同一个 daemon 只能成功其中一个，第二次调用返回
`ALREADY_ONLINE`。`attach` **不写 vault**（a2/d2/d2Key 是运行期易失物）也
**不发 `UnRegister`**（账号归 QQ 所有）。

### ⚠️ mode 1 只发不收：没有事件

这是设计边界，不是缺陷。mode 1 的 `openSession` 不发 `SsoInfoSync`、不注册，
服务端因此**不往这条连接推任何消息**：

| 能力 | mode 1（attach） | mode 2（login） |
| --- | --- | --- |
| action（发送 / 撤回 / 名单 / 群管理 / 空间） | ✅ | ✅ |
| 事件（message / notice / request / meta_event） | ❌ **一条都没有** | ✅ |

需要事件时由**宿主自己**提供：WeQ 已经有 `SsePushService`（轮询 `nt_msg.db` →
POST 到用户配置的 `pushUrl`），用户接那个即可。WeqBot 不提供、也不打算提供
mode 1 的事件转发 —— 多一条事件通道只会让同一份消息有两个来源。

所以 `CONTROL_EVENTS.onebot` 在 mode 1 下是静默的：宿主不要把它当成「还没收到消息」
的等待状态，UI 上应明确写「该模式只支持 action」。

### OneBot 配置归宿主所有

`onebot.set` 只改内存，**daemon 不落盘**：宿主（WeQ）是配置的权威来源，重启后会
重新下发。配置形状与 `@weqbot/onebot` 的 `OneBotNetworks` 同构（`wsServers` /
`wsClients` / `httpServers` / `httpClients` 四类）。

失败语义是**不做端口顺延**：客户端把 `ws://127.0.0.1:6700` 写死在配置里，悄悄换成
6701 只会让用户看到「运行中」却连不上。错误码 `ONEBOT_LISTEN_FAILED`，
`details` 里带 `{ network, kind, host, port }`，宿主可以定位到具体哪一条。

### 事件

| 事件名 | 数据 | 说明 |
| --- | --- | --- |
| `state` | 状态机变化 | |
| `heartbeat` | 心跳 / 重连 / 被踢 | 仅 mode 2 有心跳；mode 1 不会发 |
| `onebot` | OneBot 事件（消息、通知、请求） | **仅 mode 2**；mode 1 只发不收，见上 |
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

daemon（`--serve`）没有第 2 条：连接断开只说明「暂时没人看」，不代表宿主没了。它只在
收到 `shutdown` 或 `SIGINT` / `SIGTERM` / `SIGHUP` 时退。

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

## CLI 的 `--serve`（常驻 daemon）

sidecar 的生命周期跟着宿主：Electron 一退，QQ 会话就断。桌面端只是控制面板、bot 要
7×24 挂着的场景不适合这种形态，所以控制通道还有 socket 版本：

```bash
weqbot --serve --account <uin> --socket <path>
```

```text
WeQ desktop（或任何宿主）
   │  connect（NDJSON over unix socket / named pipe）
   ▼
weqbot --serve --account <uin>    ← 常驻，OneBot 端口一直在线
   │
   └─→ QQ 会话（mode 2）
```

| 项 | `--sidecar` | `--serve` |
| --- | --- | --- |
| 传输 | NDJSON over stdio | NDJSON over unix socket / named pipe |
| 生命周期 | 随宿主：stdin 关闭即退 | 独立：只有 `shutdown` / 信号才退 |
| 客户端 | 1（父进程） | 多个（控制台、探针、WeQ 同时连） |
| 客户端断开 | 等于宿主没了 → 退出 | 只是没人看 → **会话继续挂着** |
| 默认路径 | — | `$XDG_RUNTIME_DIR/weqbot/weqbot-<uin>.sock`（Windows 用命名管道） |

宿主侧：

```ts
import { connectControlSocket, defaultControlSocketPath } from '@weqbot/control';

const peer = await connectControlSocket({ path: defaultControlSocketPath(uin) });
await peer.request('login', { a1, guid, uid, device });
peer.on((envelope) => {
  /* state / heartbeat / onebot / bye */
});
```

几条刻意为之的约束：

- socket 文件权限 `0600`（父目录 `0700`）：unix socket 的访问控制就是文件权限，
  默认 umask 下同机其他用户也能连；
- 路径上残留的文件会**探测后**接管（先 connect 一次，被拒才认定是上次崩溃的尸体）。
  连得上说明有活着的 daemon，直接报错 —— 盲删会把两个 daemon 挂到同一个 uin 上；
- 凭据仍然只从 `login` 进来，daemon 不读 vault 之外的任何文件；
- 宿主关自己的窗口**不应该发 `shutdown`**：那会把 bot 也带走，正是这一形态要避免的。

## 打包要求

::: warning 三条硬要求

1. sidecar 产物里**没有** `.node`，没有 `@weq/native`；
2. 不要把 `@weqbot/node` 当 external —— 它必须连同 `bot` / `session` / `protocol` /
   `control` 一起打进 bundle；只 external `node:*` 内置模块和 `.node`；
3. `electron.vite.config.ts` 的 `EXCLUDE_FROM_EXTERNAL` 要加 `@weqbot/*`。

:::

## 端口拓扑

**没有拓扑问题。** mode 1 与 mode 2 互斥（见上），同一时刻只有一个 OneBot 后端在
监听，所以「两个进程抢同一个端口」不会发生。

真正要遵守的只有三条：

1. **每账号一个固定端口**：配置按 uin 存，客户端写死一次即可。QQ 上下线导致的
   断线重连是外部事实，不是我们换端口造成的。
2. **占用即失败**：不做自动顺延（原因见上）。上一个进程没退干净时，报错比
   静默换端口更容易排查。
3. **配置只有一个编辑点**：宿主（WeQ）的页面。daemon 只是执行者。

## 通过控制通道按需调用 OneBot

WeQ 的 MCP 使用当前在线账号已经注册的 OneBot 适配器。宿主可用 `onebot.mcpList` 分页获取精简条目，用 `onebot.mcpDescribe` 获取一项的参数，用 `onebot.mcpCall` 复用 OneBot 的参数处理与回执。三项控制方法均由启动时确定的账号执行，宿主调用时无需再传 QQ 号。

宿主依据当前会话的授权传入 `allowWrites`。控制端再次核对 action 是否已注册及是否接入 MCP。文本消息按纯文本处理，不能通过消息段访问宿主文件。直接接入的 OneBot HTTP／WebSocket 功能见[动作参考](../onebot/actions.md)。
