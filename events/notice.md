# 通知事件

语义层的通知事件按 `kind` 判别。线上层对应 `post_type: 'notice'`。

## 已建模的 `kind`

| `kind` | 字段 | 线上 `notice_type` |
| --- | --- | --- |
| `group-member-increase` | `group` `member` `operator?` | `group_increase`（`sub_type: approve`） |
| `group-member-decrease` | `group` `member` `operator?` | `group_decrease`（`sub_type: approve`） |
| `group-admin` | `group` `member?` `detail?` | `group_admin`（`sub_type: set`） |
| `group-card` | `group` `member?` `detail?` | `group_card` |
| `group-name` | `group` `member?` `detail?` | `notify` / `group_name` |
| `message-recall` | `peer` `sender?` `messageId` `operator?` | `group_recall` 或 `friend_recall` |
| `friend-add` | `friend` | `friend_add` |
| `poke` | `peer` `sender` `target?` | `notify` / `poke` |
| `input-status` | `peer` `eventType` `text` | `notify` / `input_status` |
| `other` | `name` `detail?` | **不下发**，见下 |

## 逐个说明

### 群成员增减

```ts
{ type: 'notice'; kind: 'group-member-increase' | 'group-member-decrease';
  at: number; group: PeerRef; member: PeerRef; operator?: PeerRef }
```

自己入群时 `member` 是本账号（`self-join` 分支），会带上自己的 uin / uid。

::: warning `sub_type` 恒为 `approve`

服务端推送不带「主动退出 / 被踢」的区分，所以线上层统一给 `approve`。
需要区分的话只能靠 `operator_id` 与 `user_id` 是否相等去推 —— 但框架不替你猜。

:::

### 群管理变更

```ts
{ type: 'notice'; kind: 'group-admin' | 'group-card' | 'group-name';
  at: number; group: PeerRef; member?: PeerRef; detail?: string }
```

`detail` 的含义按 `kind` 不同：

| `kind` | `detail` |
| --- | --- |
| `group-admin` | `'set'` / `'unset'` |
| `group-card` | 新群名片（线上层放 `card_new`，`card_old` 恒为空串） |
| `group-name` | 新群名（线上层 `name_new`） |

::: warning `card_old` 拿不到

推送只带新名片，旧名片不在帧里。线上层给空串而不是去查 —— 查询会额外打一次网络请求，
且与事件到达时刻的缓存可能不一致。

:::

### 撤回

```ts
{ type: 'notice'; kind: 'message-recall';
  at: number; peer: PeerRef; sender?: PeerRef; messageId: string; operator?: PeerRef }
```

`messageId` 的语义**按场景不同**：

| 场景 | `messageId` 来自 |
| --- | --- |
| 群聊 | 消息的 `sequence` |
| 私聊 | 消息的 `clientSequence` |

线上层的判断逻辑是 `event.peer.uid === undefined || event.sender !== undefined` 决定
`group_recall` 还是 `friend_recall`。

::: danger 私聊撤回的 `message_id` 可能是 0

私聊推送只带 `clientSequence` 时，线上层 `message_id` 会是 `0`。这是**如实反映**
拿不到 OneBot 侧的映射，不是 bug。要拿到可用的 `message_id`，那条消息必须先在进程内
被观测过（收到过原消息事件）。

:::

### 戳一戳

```ts
{ type: 'notice'; kind: 'poke'; at: number; peer: PeerRef; sender: PeerRef; target?: PeerRef }
```

群里的戳一戳 `peer` 是群，私聊时是对方。`sender` 是发起者，`target` 是被戳的人。

### 输入状态

```ts
{ type: 'notice'; kind: 'input-status'; at: number; peer: PeerRef;
  eventType: number; text: string }
```

`eventType`：**1 = 输入中，3 = 讲话中**。只有 C2C 有，群聊没有这个推送。

### 好友添加

```ts
{ type: 'notice'; kind: 'friend-add'; at: number; friend: PeerRef }
```

这是「已经成为好友」的通知，**不是**好友申请。申请走[请求事件](request.md)。

## 未映射到 OneBot 的通知

::: warning `kind: 'other'` 不下发

`group-mute`、`group-reaction`、`group-essence`、`client-receipt` 这四类推送在语义层
建成了 `kind: 'other'`，但 **OneBot 层返回 `null`，不会推给客户端**。

原因是 OneBot v11 没有对应的 `notice_type`。编造一个会破坏客户端兼容性 —— 未知
`notice_type` 的客户端可能直接抛错或断开。

这些事件仍然会在 `bot.events.on('event')` 里出现（`kind: 'other'`，`name` 是推送种类，
`detail` 是可读摘要）。需要它们的时候直接消费语义层。

注意 `bot.events.on('notice')` **也会**收到它们 —— `kind: 'other'` 是 `NoticeEvent` 的
一个合法分支，只是 OneBot 转换器返回 `null`。

:::

## 未建模的推送

协议层解得出、但语义层连 `other` 都没建的推送，不会变成 `BotEvent`，只出现在
`PushBridgeResult.unhandled` 里：

```ts
const { events, unhandled } = pushBridge.handle(frame);
if (unhandled.length) log.debug('未建模的推送', unhandled.map((e) => e.kind));
```

::: tip 为什么不建

`events.ts` 的纪律是「只放语义」。协议层解出来的 raw 推送带大量 wire 字段，
直接暴露给宿主会让上游和 wire 结构绑定死。等某类推送真的需要被消费时再建模，
而不是先建一个字段会漂的空壳。

:::

## `other` 的 `detail` 格式

诊断用途，**不保证稳定**，不要解析它：

| `name` | `detail` 示例 |
| --- | --- |
| `group-mute` | `group=12345 target=u_xxx duration=60` |
| `group-reaction` | `group=12345 seq=42 code=1 count=3` |
| `group-essence` | `group=12345 seq=42 set=true` |
| `client-receipt` | 已读回执摘要 |
