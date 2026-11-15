# 消息事件

语义层的消息事件是 `{ type: 'message'; message: InboundMessage }`。
线上层对应 `post_type: 'message'`（他人发的）或 `'message_sent'`（自己发的）。

## `InboundMessage`

```ts
interface InboundMessage {
  messageId: string;        // wire 上的 msg_id
  seq: number;              // 会话内序号
  clientSequence?: number;  // 发送方客户端序号（C2C 才有）
  ntMsgSeq?: number;        // NT 会话序号（跨双方递增；群聊没有）
  random?: number;          // wire 上的 random（= contentHead.msgId）
  time: number;             // 秒级时间戳
  scene: 'private' | 'group' | 'temp' | 'guild';
  peer: PeerRef;            // 私聊 = 对方；群聊 = 群；频道 = 子频道
  sender: PeerRef;
  self: { uin: string; uid?: string };
  elements: Record<string, unknown>[];   // 解码后的元素，见下
  dress?: DecodedDress;                  // 气泡 / 字体 / 挂件
  raw?: Uint8Array;                      // 仅当 keepRaw 打开
}
```

### `PeerRef`

```ts
interface PeerRef {
  id: string;      // 群号 / 对方 uin / 频道 id
  uid?: string;    // 群聊时的发送者 uid（u_...）
  name?: string;
}
```

::: warning `peer.id` 可能是 uid 而不是 uin

输入状态这类推送只带 uid。遇到查不到对应 uin 的情况，`id` 会退化成 uid 本身。
需要 uin 的地方应当走 `IdentityCache`（`PushBridge` 自动维护，来源是聊天消息里观测到的
`sender` / `session`，**不持久化**，重启后靠首条消息重建）。

:::

## 四个序号的区别

这几个字段是撤回、引用、历史分页能不能工作的关键，不能混用：

| 字段 | 场景 | 用途 |
| --- | --- | --- |
| `seq` | 都有 | 会话内序号。群聊撤回用它定位 |
| `clientSequence` | C2C | 发送方客户端序号。`delete_msg` / 引用要拿它定位原消息 |
| `ntMsgSeq` | 私聊 | NT 会话序号（跨双方递增）。私聊拉历史的分页单位 |
| `random` | 都有 | wire 上的 `msgId`（`contentHead.msgId`）。私聊撤回定位三元组的一部分 |

私聊撤回的定位三元组是 `(clientSequence, messageSequence, random, timestamp)` ——
少了任何一个 `delete_msg` 都只能碰运气。群聊撤回只用 `seq`，但一并带上不碍事。

::: warning 私聊历史不要用 `seq`

私聊的 `seq` 是会话内序号，不能拿去拉历史；历史窗口的单位是 `ntMsgSeq`。
两者分清才不会把窗口算到错误区间。

:::

## `elements`

元素列表由 `@weqbot/protocol` 的 `decodeMessage` 定义，形状是**以 `kind` 区分的对象**
（`{ kind: 'text', textContent }` 这类）。

::: tip 刻意不转成自有类型

入站解出来的对象要能**原样**交给 `buildSendElems` 再发出去（转发 / 搬运），
多一层映射就多一处漂移。所以 `elements` 直接用协议层的形状。

:::

转成 OneBot 消息段见[消息段](/onebot/segments)。

## `dress`

```ts
interface DecodedDress {
  bubble?: number;   // 气泡 itemId
  font?: number;     // 字体 itemId
  widget?: number;   // 挂件 itemId
}
```

与 `elements` 同源，历史消息、合并转发节点解出来的值一致。`0` 表示未设置。

## 线上层格式

`post_type: 'message'` 时：

```json
{
  "time": 1763200000,
  "self_id": 123456789,
  "post_type": "message",
  "message_type": "group",
  "sub_type": "normal",
  "message_id": 1000001,
  "message_seq": 42,
  "user_id": 987654321,
  "group_id": 55555,
  "message": [ { "type": "text", "data": { "text": "hello" } } ],
  "raw_message": "hello",
  "font": 0,
  "sender": { "user_id": 987654321, "nickname": "张三", "sex": "unknown", "age": 0 }
}
```

`message` 字段的形状取决于该连接的 `messageFormat`：

| `messageFormat` | `message` |
| --- | --- |
| `array` | segment 数组 |
| `string` | CQ 码字符串 |

`raw_message` **始终**是 CQ 码字符串。

### `sub_type`

| 场景 | `message_type` | `sub_type` |
| --- | --- | --- |
| 群聊 | `group` | `normal` |
| 好友私聊 | `private` | `friend` |
| 临时会话 | `private` | `group`（同时带 `group_id`） |

### 自己发的消息

`post_type: 'message_sent'`，字段与 `message` 相同。是否下发取决于该连接的
`reportSelfMessage` 配置（默认 `false`）。

### `message_id`

由适配层分配的**有符号 32 位整数**，与 QQ 的 64 位 `msgId` 不是一回事。进程内有界表
维护映射（`MessageIdMap` + `MessageStore`）：

- 撤回（`delete_msg`）靠它反查定位信息；
- `get_msg` 靠它取完整事件快照；
- 历史分页把上一页的 `message_id` 当锚点传回来。

::: warning 进程重启后旧 ID 失效

映射表在内存里，重启即丢。拿旧 `message_id` 调用会返回 `1404`（未知 action 语义上
等同「找不到这条消息的定位信息」）。

:::

## 元素 → 消息段

`elementsToSegments` 里有个细节值得知道：**商城表情（`mface`）转成 `image` 段**，
而不是独立的 `mface` 段。

理由：不认识 `mface` 的客户端也能显示贴纸；认识的客户端回传 `emoji_id` 就能原样再发
（与 NapCat 行为一致）。

## 图片的 `url`

入站的 `pic` 元素只有 `fileToken` / `storeId`，**必须换 rkey 才能拼出下载 URL**。
宿主用 `FetchDownloadRkeys` + CDN 拼接补上（`@weqbot/bot` 的 `createMediaUrlResolver`）。

::: tip 图片不会自动下载

`url` 只是一个拼好的链接，`file` 字段是文件名。把 `url` 粘进浏览器能出图就说明链路通了。

`url` 为空串表示 rkey 没取到，日志里会有「取下载 rkey 失败」。

:::

群图 `appid` 是 **1407**，私聊图 **1406**。
