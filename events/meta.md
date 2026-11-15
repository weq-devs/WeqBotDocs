# 元事件

元事件是**线上层（OneBot）特有**的，语义层没有对应物。它们由适配器自己产生，
不来自 QQ 推送。

## 生命周期

```json
{
  "time": 1763200000,
  "self_id": 123456789,
  "post_type": "meta_event",
  "meta_event_type": "lifecycle",
  "sub_type": "connect"
}
```

| `sub_type` | 时机 |
| --- | --- |
| `connect` | 适配器启动完成、action 已注册、网络已监听 |
| `enable` | 预留（当前不发） |
| `disable` | 预留（当前不发） |

::: tip 每个连接独立下发

`connect` 是在**连接建立时**发给该连接的，不是全局广播一次。所以后连上的客户端也能收到。

:::

## 心跳

```json
{
  "time": 1763200000,
  "self_id": 123456789,
  "post_type": "meta_event",
  "meta_event_type": "heartbeat",
  "status": { "online": true, "good": true },
  "interval": 5000
}
```

| 字段 | 说明 |
| --- | --- |
| `interval` | 心跳间隔（ms） |
| `status.online` | 当前是否在线 |
| `status.good` | 是否正常（预留，当前恒 `true`） |

::: warning 这是 OneBot 心跳，不是 SSO 心跳

两者完全不同，不要混：

| 心跳 | 谁维持 | 间隔 | 作用 |
| --- | --- | --- | --- |
| OneBot 心跳 | 适配器（TS 侧定时器） | 默认 30s，可配 | 告诉客户端「我还活着」 |
| SSO 心跳 | native（C++ 侧） | 内部固定 | 向 QQ 服务端保活 |

OneBot 心跳停了不影响在线状态；SSO 心跳失败才会掉线。

:::

### 关闭心跳

`heartbeatMs` 默认 `30000`。设成 `0` 就不发：

```ts
createOneBotAdapter({ ..., heartbeatMs: 0 })
```

::: tip 固定 30 秒

`createBot()` 目前不暴露这个参数，走默认值。要改只能直接调 `createOneBotAdapter`。

::: 

## 与语义层的对应

| 线上层 | 语义层 |
| --- | --- |
| `meta_event` / `lifecycle` / `connect` | 无（适配器状态） |
| `meta_event` / `heartbeat` | 无（适配器状态） |
| — | `BotEvent` 的 `online` / `offline` / `state` / `heartbeat`（SSO 层） |

语义层的 `heartbeat` 是**一次 SSO 心跳往返**（带 `rttMs`），与 OneBot 的
`meta_event.heartbeat` 是两回事。见[会话事件](session.md)。
