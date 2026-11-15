# 事件推送

WeqBot 的事件分**三层**，每层职责不同。写插件或接入客户端前先分清自己在哪一层：

```text
QQ 推送帧（PushEvent）   →  BotEvent（@weqbot/session）  →  OneBot post（@weqbot/onebot）
   协议层                       语义层                        线上层
```

| 层 | 谁消费 | 长什么样 |
| --- | --- | --- |
| 协议层 | 只有 `@weqbot/session` 内部 | 带 protobuf 字段名，含 wire 细节 |
| **语义层** | 嵌入 WeQ 的宿主、插件、`@weqbot/onebot` | `BotEvent` 联合类型，只放语义 |
| 线上层 | OneBot 客户端 | `post_type` + `message_type` 等 |

::: tip 嵌入 WeQ 时看语义层

宿主直接消费 `BotEvent`，**不经过** OneBot 层。所以如果你在写 WeQ 侧的功能，看这一节
和它的子页面就够了，不需要读 OneBot 的字段。

:::

## 语义层的三条纪律

`packages/session/src/events.ts` 定下的：

1. **只放语义，不放 wire 细节**。`seq` / `msgId` 可以带，但不把 raw SSO 包头塞进来；
   需要原始字节的走 `event.raw` 显式字段。
2. **不做 OneBot 词汇映射**。这里叫 `scene: 'group'`，不叫 `message_type`。
3. **离线是一等事件**。被踢、心跳失效、主动关闭都必须报告 `reason`，否则上层无法决定
   「要不要重登 / 要不要提示用户」。

## 事件分类

`BotEvent` 是四类事件的联合：

| 类型 | 联合成员 | 文档 |
| --- | --- | --- |
| `message` | `{ type: 'message'; message: InboundMessage }` | [消息事件](message.md) |
| `notice` | 按 `kind` 判别的通知 | [通知事件](notice.md) |
| `request` | 好友申请 / 群申请 | [请求事件](request.md) |
| 会话级 | `state` / `online` / `offline` / `heartbeat` / `error` | [会话事件](session.md) |

元事件（`lifecycle` / `heartbeat`）是**线上层**特有的，语义层没有对应物，见[元事件](meta.md)。

## 订阅方式

```ts
const bot = createBot({ ... });

// 只订某一类
bot.events.on('message', (message) => { ... });
bot.events.on('notice', (notice) => { ... });
bot.events.on('request', (request) => { ... });

// 订全部（OneBot 适配层就是这么接的）
const off = bot.events.on('event', (event) => { ... });
off();   // 取消订阅
```

`on()` 返回取消订阅函数。`createBot` 返回的 `Bot.events` 是 `TypedEventBus<BotEventMap>`，
事件名与 payload 类型有映射，写错事件名在类型层面就报错。

## 投递语义

| 问题 | 答案 |
| --- | --- |
| 顺序 | 同一 `sessionId` 内按到达顺序投递 |
| 丢失 | 进程内不丢；**离线期间不补投**（重新连上后只有新消息） |
| 重放 | 不支持。需要历史请走 OneBot 的历史 action（读进程内观测，不读磁盘） |
| 背压 | 无。监听器是同步调用，慢监听器会阻塞后续事件 |

::: warning 慢监听器会阻塞投递

事件总线是同步的。做 IO 的监听器应当自己丢进队列异步处理，不要在回调里 `await` 长时间操作。

:::

## 尚未建模的推送

协议层解得出、但语义层**故意没建**的推送不会变成 `BotEvent`。它们记在
`PushBridgeResult.unhandled` 里，供诊断日志用：

```ts
const { events, unhandled } = pushBridge.handle(frame);
```

当前未建模的推送见[通知事件](notice.md#未建模的推送)。
