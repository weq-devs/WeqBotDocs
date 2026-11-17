# 会话事件

不针对具体消息的会话级事件。它们**只在语义层存在**，OneBot 层只把其中一部分
映射成元事件。

```ts
type SessionEvent =
  | { type: 'state'; from: SessionState; to: SessionState; at: number; detail?: string }
  | { type: 'online'; uin: string; at: number }
  | { type: 'offline'; reason: OfflineReason; at: number; detail?: string }
  | { type: 'heartbeat'; at: number; rttMs?: number }
  | { type: 'error'; error: WeqBotError; at: number };
```

## `state`

状态机每次迁移都发，便于宿主 UI 画进度。

```ts
bot.events.on('state', (change) => {
  console.log(`${change.from} → ${change.to}`, change.detail ?? '');
});
```

`detail` 是可选的补充说明（如重登的第几次）。

状态取值与迁移规则见[登录与上线流程](/architecture/session)。

## `online`

注册被接受、心跳已起、推送已接通之后发一次。

```ts
{ type: 'online'; uin: string; at: number }
```

::: tip 它比 `state: online` 晚一点

`state` 的迁移在进入 `online` 状态时发；`online` 事件在**推送 sink 挂好之后**才发。
要做「上线后立即干活」的事情，等 `online` 而不是 `state`。

:::

## `offline`

```ts
{ type: 'offline'; reason: OfflineReason; at: number; detail?: string }
```

离线是**一等事件**：必须报告原因，否则上层无法决定要不要重登。

| `reason` | 含义 | 常见处理 |
| --- | --- | --- |
| `kicked` | 服务端 `KickNT` | 停。正常情况下不该出现（我们不与 QQ 抢登录） |
| `network` | 网络断 / 心跳超时 | 框架自动退避重登 |
| `closed` | 主动下线（用户关账号 / bot 停止） | 不重登 |
| `bot-exit` | OneBot `bot_exit` 主动下线 | 不重登 |
| `relogin-failed` | 重登失败次数耗尽 | 需要人工介入 |
| `register-failed` | 注册阶段就被拒（凭据失效 / 风控） | 检查 a1 或风控 |
| `credential-expired` | a1 已失效（`140022014` / `015` / `016`），重登时发现 | 清除该账号凭据，让用户重新登录 / 扫码 |

```ts
bot.events.on('offline', (event) => {
  if (event.reason === 'kicked' || event.reason === 'register-failed') {
    // 人工介入
  }
  if (event.reason === 'credential-expired') {
    // 凭据没用了：删掉它，别拿同一串 a1 再试（会触发风控）
  }
});
```

## `heartbeat`

一次 SSO 心跳往返（native 上报），仅观测用。

```ts
{ type: 'heartbeat'; at: number; rttMs?: number }
```

::: warning 与 OneBot 的 heartbeat 不是一回事

OneBot 的 `meta_event.heartbeat` 是适配器自己的定时器；这个是 native 的 SSO 心跳往返。
后者能反映真实网络延迟。见[元事件](meta.md#心跳)。

:::

## `login-progress`

`quickLogin` 期间的进度。存在的意义是**异常设备确认**：

```ts
{ type: 'login-progress'; event: LoginProgressEvent; at: number }

interface LoginProgressEvent {
  kind: 'state' | 'unusual-device' | 'qr-state' | 'info';
  state?: string;
  message: string; // 面向用户的一句话
}
```

服务端把当前设备判成异常设备时，native 会在登录链路里等用户在手机 QQ 上点「确认登录」，
最长 45 秒。这段时间**没有任何其它信号** —— 宿主不消费这条事件，UI 就只能一直转圈。

```ts
bot.events.on('login-progress', ({ event }) => {
  if (event.kind === 'unusual-device') showPhonePrompt(event.message);
  else showStage(event.message);
});
```

事件里的认证物料（`unusualDeviceCheckSig` / 二维码字节）在 `@weqbot/wire` 的
`parseLoginProgress` 里就被丢掉了：宿主不需要它们，多传一次就多一个泄漏面。

## `error`

```ts
{ type: 'error'; error: WeqBotError; at: number }
```

`WeqBotError` 带 `code` / `message`。错误不终止会话，除非它同时触发了状态迁移。

## 订阅

```ts
bot.events.on('state', (change) => { ... });
bot.events.on('online', (event) => { ... });
bot.events.on('offline', (event) => { ... });
bot.events.on('heartbeat', (event) => { ... });
```

这些事件也能通过 `on('event')` 收到（`type` 分别是 `state` / `online` / `offline` /
`heartbeat` / `error`），但用具体事件名类型更准。

## 线上层映射

| 语义层 | OneBot |
| --- | --- |
| `state` | 不下发 |
| `online` | 不下发（`lifecycle/connect` 由适配器自己产生） |
| `offline` | 不下发 |
| `heartbeat` | 不下发（OneBot 的 `meta_event.heartbeat` 是另一回事） |
| `error` | 不下发 |

::: info OneBot 看不到会话状态

OneBot v11 没有对应的事件类型。需要会话状态时请消费语义层，或者用 `get_status`
action 主动查。
