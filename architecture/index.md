# 项目架构

WeqBot 由 9 个包组成，依赖方向单一，**没有环**。这一页讲清每个包负责什么、为什么这么切，
以及那条靠脚本强制的架构护栏。

## 分层

```text
common  ←  wire  ←  protocol  ←  session  ←  onebot
                        ↑            ↑          ↑
                        └────────── bot ────────┘
                                     ↑
                                   node  ──→  control  ──→  common / wire
```

读取方式：箭头从右指向左表示「可以依赖」。`bot` 在中间，同时依赖 `protocol`、`session`、`onebot`。

| 包 | 职责 | 不负责 |
| --- | --- | --- |
| `@weqbot/common` | 日志、错误码、事件总线、退避、字节工具 | 任何业务 |
| `@weqbot/wire` | `NativePort` 契约、`SessionId`、能力探测、宿主绑定适配 | 网络、协议细节 |
| `@weqbot/protocol` | protobuf 运行时、OIDB / trpc spec、消息编解码、推送解码 | 会话管理 |
| `@weqbot/session` | a1 凭据、`quickLogin`、`openSession(mode 2)`、状态机、`BotEvent` 契约 | OneBot 词汇、元素编解码 |
| `@weqbot/onebot` | OneBot v11 事件 / 动作 / 网络适配 | 协议细节、登录上线 |
| `@weqbot/bot` | `createBot()` 门面，宿主与测试的唯一入口 | 加载原生组件 |
| `@weqbot/control` | desktop ↔ sidecar 控制通道契约与 NDJSON 编解码 | socket 实现、业务 |
| `@weqbot/node` | 独立宿主、sidecar 入口与 CLI | 被其它包 import |
| `@weqbot/webui` | WebUI 前端（纯静态 SPA），只通过 HTTP 与 node 通信 | 任何 `@weqbot` 运行时包 |

## 两条结构性约束

### 1. 只有 `node` 能加载原生组件

除 `packages/node` 外，任何文件出现 `.node` / `process.dlopen` / `createRequire` 一律失败。

这条不是风格偏好：WeQ 嵌入 WeqBot 时是**纯 TS 打包**，一旦某个包偷偷 `require` 了 `.node`，
宿主产物里就会出现第二份原生组件 —— 两份 `.node` 在同一进程里争同一个全局状态，症状是
随机崩溃，极难定位。

### 2. 不得依赖 `@weq/*`

WeqBot 必须能**独立构建、独立发版**。依赖 WeQ 的私有包会让它变成 WeQ 的附庸。

这两条 + 依赖方向都由 `scripts/check-pure-ts.mjs` 强制：

```bash
pnpm check:pure-ts
# 架构检查通过：依赖方向正确，除 @weqbot/node 外无原生加载。
```

为什么用脚本而不是 linter 规则：分层规则要读「当前文件属于哪个包」，linter 的规则是路径
glob，写出来会是一串重复配置，改结构时容易漏。脚本只有一张 `LAYERS` 表。

```js
const LAYERS = {
  common: [],
  wire: ['common'],
  protocol: ['common', 'wire'],
  session: ['common', 'wire', 'protocol'],
  onebot: ['common', 'protocol', 'session'],
  bot: ['common', 'wire', 'protocol', 'session', 'onebot'],
  control: ['common', 'wire'],
  node: ['common', 'wire', 'protocol', 'session', 'onebot', 'bot', 'control'],
  webui: [],
};
```

## 为什么 `control` 只依赖 `common` / `wire`

`@weqbot/control` 会被**同时**打进 WeQ 和 sidecar。它只承载线上协议（信封类型 + NDJSON
编解码）和 `DeviceProfile` 这一类共享形状，不含 socket 实现、不含 supervisor、不含事件语义。

socket 实现分居两侧：sidecar 侧在 `@weqbot/node`，宿主侧在 WeQ desktop。事件语义在
`@weqbot/bot` 的 `BotEventMap` 里定义，`control` 只固定通道上的名字。

## 运行时组装顺序

`createBot()` 的组装顺序是刻意固定的 —— 每一步失败后的动作不同：

```text
native 能力探测 → 预检 → 取 a1 → quickLogin → openSession(mode 2) → 挂 sink → 在线
```

本层只和 `sessionId` 打交道，**不接触 pid**。宿主把 native 端口递进来：

| 宿主 | 传什么 |
| --- | --- |
| WeQ desktop | `adaptNativeBinding(platform.native.ntHelper)` —— 注意 `NativeBundle` 不是扁平 binding |
| 独立进程 | slim 加载器（`packages/node/src/loader.ts`）的产物 |

两条 sink 都在这里接：

- **推送 sink**：推送帧 → `@weqbot/protocol/push` 解码 → `PushBridge` → `BotEvent`；
- **状态 sink**：状态事件 → 状态机（`kicked` 终止；`closed` 按网络掉线走退避重登）。

## 消息只来自推送

bot **不读本地数据库**。消息全部来自服务端推送，没有「拉历史补洞」这条路。

这条决定了三件事：

1. slim 产物可以裁掉 SQLite、数据库解密等全套模块；
2. 离线期间的消息不会补投（重连后只有新消息）；
3. 历史查询类 OneBot action 依赖**进程内观测**（`MessageStore` 的有界内存表），
   不落盘、不建索引。

## 读下去

- [登录与上线流程](session.md) —— 状态机每一步在做什么
- [凭据与设备档案](credentials.md) —— a1 / guid / device 的关系
- [嵌入 WeQ](embedding.md) —— sidecar 与控制通道
- [开发与测试](development.md) —— 命令、护栏、测试约定
