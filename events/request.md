# 请求事件

加好友、加群这两类**需要你回应**的事件。线上层对应 `post_type: 'request'`。

## 类型

```ts
type RequestEvent =
  | { type: 'request'; kind: 'friend'; at: number; from: PeerRef;
      comment?: string; flag: string }
  | { type: 'request'; kind: 'group'; at: number; group: PeerRef; from: PeerRef;
      comment?: string; flag: string; invite: boolean };
```

| 字段 | 说明 |
| --- | --- |
| `from` | 申请人 |
| `comment` | 验证消息；推送没带就没有这个字段 |
| `flag` | 回应时**必须原样回传**的凭据 |
| `invite` | 仅群请求：「被邀请」(`true`) 还是「主动申请」(`false`) |

::: danger `flag` 不是可选的

`flag` 由服务端生成，`set_friend_add_request` / `set_group_add_request` 要用它定位请求。
自己拼、缓存后复用、或跨请求混用都会失败。

:::

## 线上层格式

### 好友申请

```json
{
  "time": 1763200000,
  "self_id": 123456789,
  "post_type": "request",
  "request_type": "friend",
  "user_id": 987654321,
  "comment": "我是谁谁谁",
  "flag": "xxxxx"
}
```

回应用 [`set_friend_add_request`](/onebot/actions)：

```json
{
  "action": "set_friend_add_request",
  "params": { "flag": "xxxxx", "approve": true, "remark": "备注名" }
}
```

### 群申请

```json
{
  "time": 1763200000,
  "self_id": 123456789,
  "post_type": "request",
  "request_type": "group",
  "sub_type": "add",
  "group_id": 55555,
  "user_id": 987654321,
  "comment": "申请理由",
  "flag": "xxxxx"
}
```

`sub_type` 是 `invite`（被邀请）或 `add`（主动申请）。

回应用 [`set_group_add_request`](/onebot/actions)：

```json
{
  "action": "set_group_add_request",
  "params": { "flag": "xxxxx", "approve": true, "reason": "" }
}
```

::: warning 只传 `flag` / `approve` / `reason`

`set_group_add_request` **不接受 `sub_type`** —— 与部分 OneBot 实现的签名不同。
请求类型（加群申请 vs 被邀请）的信息已经在 `flag` 里，不需要也不应该另外传。

`reason` 是拒绝理由，同意时留空。

:::

## 语义层订阅

```ts
bot.events.on('request', (request) => {
  if (request.kind === 'friend') {
    // request.from.id / request.comment / request.flag
  } else {
    // request.group.id / request.from.id / request.invite / request.flag
  }
});
```

## 错过了怎么办

请求事件**只推一次**，bot 离线期间不会重投。补查有两条路：

| 场景 | Action |
| --- | --- |
| 被过滤的入群请求 | `get_group_ignored_notifies` / `get_group_ignore_add_request` |
| 可疑好友申请 | `get_doubt_friends_add_request` |

::: warning 这两条只覆盖被服务端过滤的那部分

普通的好友 / 加群申请没有「列出未处理项」的 action —— 错过就是错过了。
需要可靠处理时，应当把收到的请求**立刻落盘**（`flag` 有时效）。

::: 
