# 消息段

OneBot 的 `message` 由一组 segment 组成。这一页列出 WeqBot 支持的全部段类型，以及每个
字段的来源。

源码：`packages/onebot/src/segments.ts` —— 每种元素**一条双向表项**
（`toSegment` 收 / `fromSegment` 发），缺了哪个方向一眼可见。

## 双向覆盖

| 类型 | 收（协议元素 → segment） | 发（segment → 协议元素） |
| --- | --- | --- |
| `text` | ✅ | ✅ |
| `at` | ✅ | ✅ |
| `face` | ✅ | ✅ |
| `mface` | ✅ | ✅ |
| `reply` | ✅ | ✅ |
| `image` | ✅ | ✅ |
| `record` | ✅ | ✅ |
| `video` | ✅ | ✅ |
| `ark` | ✅ | ✅ |
| `xml` | ✅ | ✅ |
| `markdown` | ✅ | ✅ |
| `file` | ✅ | ✅ |
| `forward` | ✅ | ✅ |
| `poke` | ✅ | ✗ |

::: info `poke` 是单向的

`poke` 段只会出现在**入站**消息里（协议层的 poke 元素转成 segment）。发送戳一戳要用
`send_poke` action，不能拼一个 poke 段发出去。

:::

## `text`

```json
{ "type": "text", "data": { "text": "hello" } }
```

## `at`

```json
{ "type": "at", "data": { "qq": "123456789" } }
{ "type": "at", "data": { "qq": "all" } }
```

发送时除 `qq` 外可以带 `uid`（发送侧更可靠：`at` 只给 qq 时用 uin → uid 的映射去补）。
也可以带 `name` / `nickname` / `card`，用于生成文本占位。

`qq: "all"` 表示全体成员。

::: warning 收的时候可能没有 uin

入站 `at` 元素优先给 `atTargetUin`，没有就退化成 `atTargetUid`（uid 字符串）。
所以收到的 `qq` 可能是 `u_xxxx` 而不是数字。

:::

## `face`

```json
{ "type": "face", "data": { "id": "1" } }
{ "type": "face", "data": { "id": "1", "resultId": "xxx" } }
```

`id` 是 QQ 表情编号（`0` 合法）。带 `resultId` 时表示是超级表情，发送时会构造
`superSticker` 元素。

## `mface`（商城表情）

::: tip 收的时候是 `image` 段

商城表情**入站转成 `image` 段**，不是独立的 `mface` 段：

```json
{
  "type": "image",
  "data": {
    "file": "ab-0123456789abcdef.gif",
    "url": "https://gxh.vip.qq.com/club/item/parcel/item/ab/0123456789abcdef/raw300.gif",
    "summary": "[表情名]",
    "sub_type": 0,
    "emoji_id": "0123456789abcdef",
    "emoji_package_id": 123,
    "key": "<加密 key>"
  }
}
```

理由：不认识 `mface` 的客户端也能显示贴纸；认识的客户端回传 `emoji_id` 就能原样再发
（与 NapCat 行为一致）。

**发**商城表情时组织成这样的 `image` 段，带 `emoji_id` 即走商城表情路径。

:::

## `reply`（引用）

```json
{ "type": "reply", "data": { "id": "42" } }
```

`id` 是被引用消息的 `sequence`。也接受 `seq` 作为别名。

::: warning 引用要用服务端序号，不是 OneBot 的 message_id

这里填的是 QQ 侧的会话序号（`origMsgSeq`），不是适配层分配的 32 位 `message_id`。
两者不通。

:::

## `image`

```json
{
  "type": "image",
  "data": {
    "file": "a1b2c3.png",
    "url": "https://multimedia.nt.qq.com.cn/download?appid=1407&...",
    "sub_type": 0,
    "summary": ""
  }
}
```

发送时 `file` 可以是：

- 本机绝对路径；
- `base64://...` 或 `data:image/png;base64,...`；
- `http(s)://` URL（由宿主下载后上传）。

::: tip 入站 `url` 只是拼好的链接

收到图片时 `url` 由宿主换 rkey 拼出，**不会自动下载**。`file` 是文件名。

`url` 空串表示 rkey 没取到。群图 `appid` 是 1407，私聊图 1406。

:::

## `record`（语音）

```json
{ "type": "record", "data": { "file": "xxx.amr", "url": "https://..." } }
```

发送时同 `image`，接受路径 / base64 / URL。

## `video`

```json
{ "type": "video", "data": { "file": "xxx.mp4", "url": "https://..." } }
```

## `ark`

```json
{ "type": "ark", "data": { "data": "<ark json 字符串>" } }
```

`data` 是 Ark 卡片的 JSON **字符串**（不是对象）。

## `xml`

```json
{ "type": "xml", "data": { "data": "<xml ...>" } }
```

## `markdown`

```json
{ "type": "markdown", "data": { "content": "# 标题\n正文" } }
```

## `file`

```json
{ "type": "file", "data": { "file": "report.pdf", "url": "https://...", "file_id": "..." } }
```

## `forward`（合并转发）

```json
{ "type": "forward", "data": { "id": "<resId>" } }
```

`id` 是合并转发的资源 ID（`resId`）。发送合并转发要用 `send_group_forward_msg` /
`send_private_forward_msg`，段本身的 `forward` 只用于**表示**一段转发内容。

转发节点的形状见动作列表里那两条 action 的入参。

## 文本与 CQ 码

`messageFormat: 'string'` 时 `message` 是 CQ 码：

```text
hello[CQ:face,id=1][CQ:at,qq=123456789]
```

| 转换 | 说明 |
| --- | --- |
| `segmentsToRawMessage` | segment 数组 → CQ 串 |
| `parseMessageSegments` | CQ 串 → segment 数组 |
| `cqEscape` / `cqUnescape` | `&` `[` `]` `,` 的转义 |

::: warning `auto_escape`

`message` 参数为字符串时，`auto_escape: true` 会把整段当作纯文本，**不解析 CQ 码**。
需要发送字面量 `[CQ:...]` 时用它。

:::

`raw_message` 字段**始终**是 CQ 串，与 `messageFormat` 无关。

## 未识别的段

发送时遇到不认识的段类型会**明确报错**，不静默丢弃：

```json
{
  "status": "failed",
  "retcode": 1400,
  "data": null,
  "wording": "不支持的消息段：xxx"
}
```

静默丢弃会让「消息发出去了但少了一段」这种 bug 极难发现。
