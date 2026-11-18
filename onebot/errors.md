# 错误码

所有错误都收敛成 OneBot 响应，**不向外抛**。

```json
{ "status": "failed", "retcode": 100, "data": null, "wording": "群号不存在", "echo": "1" }
```

## 码表

```ts
const RETCODE = {
  ACTION_FAILED: 100,
  INTERNAL_ERROR: 1200,
  BAD_REQUEST: 1400,
  UNKNOWN_ACTION: 1404,
} as const;
```

| `retcode` | 常量 | 含义 | 排查方向 |
| --- | --- | --- | --- |
| `0` | — | 成功 | — |
| `100` | `ACTION_FAILED` | 业务失败 | QQ 侧拒绝 / 目标不存在 / 权限不足。看 `wording` |
| `1200` | `INTERNAL_ERROR` | 内部错误 | 框架 bug 或未预期的异常 |
| `1400` | `BAD_REQUEST` | 参数错误 | 缺必填、类型不对、值越界。看 `wording` |
| `1404` | `UNKNOWN_ACTION` | 不支持的 action | 见下 |

## `1404`：不支持的 action

这个码有**三个**来源，含义不同但客户端处理方式相同（都是「这条命令用不了」）：

1. **action 名拼错** —— 检查[动作列表](actions.md)；
2. **后端能力不足** —— action 存在但没注册。启动日志里的 `actions: N` 与文档总数不一致时
   就是这个原因；

::: tip 怎么区分

`1404` 的 `wording` 会带具体 action 名。结合启动日志能判断是哪一类：

```text
08:30:00 INFO  [cli] bot 已上线 {"uin":"…","onebot":{"port":6700,"actions":N}}
```

`N` 小于文档里的总数（214）就说明有 action 因后端能力不足被跳过了。
具体跳过了哪些，看 `adapter.skipped()` 或 `--verbose` 日志。

:::

## `1400`：参数错误

`ParamError` 的语义**始终是 1400**，不因抛出位置不同而改变。

```json
{ "status": "failed", "retcode": 1400, "data": null, "wording": "group_id 必须是正整数" }
```

`wording` 一定指出**是哪个字段** —— 只说「参数错误」等于没说。

::: tip 需要 `ctx` 才能判定的参数错误

有些校验只能在 `run()` 里做（如「`message_id` 与会话不匹配」）。这类也抛 `ParamError`，
所以同样是 1400，不会变成 100。

:::

## `100`：业务失败

参数没问题，但 QQ 拒绝了。常见原因：

| 场景 | 可能原因 |
| --- | --- |
| 发消息失败 | 不是好友 / 不在群里 / 被禁言 / 账号风控 |
| 群管理操作失败 | 权限不足（不是管理员 / 群主） |
| 撤回失败 | 超过撤回时限 / 不是自己的消息 / 没有管理权限 |
| 文件操作失败 | 文件名非法 / 空间不足 / 文件不存在 |

`wording` 是原始错误信息，多数是中文，可直接展示给用户。

## `1200`：内部错误

正常情况下不该出现。遇到时请带上完整日志提 issue：

- `wording`；
- 触发的 action 与参数；
- `--verbose` 下的日志。

## 鉴权失败

鉴权失败**不是**上述任何一个码，而是在**握手阶段**就拒绝，根本建立不了连接：

| 场景 | 表现 |
| --- | --- |
| WS token 错 | 握手响应 `401 Unauthorized` |
| WS 路径不合法 | 握手响应 `404 Not Found` |
| HTTP token 错 | HTTP 状态码，非 OneBot 响应体 |

::: tip 不会走到 OneBot 响应层

`WsServerAdapter` 用 `verifyClient` 在升级前校验，所以客户端看到的是 HTTP 层错误，
不是 `{ status: 'failed' }`。

:::

## 关闭码

| 码 | 含义 | 触发场景 |
| --- | --- | --- |
| `1008` | policy violation | 角色不接受 action（`Event` 角色收到 action）；慢客户端 |
| `1009` | message too big | 入站单帧超过 `maxPayloadBytes`（由 `ws` 库产生） |
| `1012` | service restart | 服务端下线 |

::: warning 优雅关闭实际是 `terminate()`

`WsServerAdapter.stop()` 用 `terminate()` 而不是 `close()` —— `close()` 要等对端回
close 帧，客户端不配合时会挂住。所以客户端**多数情况下看到的是连接直接断开**，
而不是收到 `1012` 帧。

`1012` 常量已定义，但当前不主动发送。

:::

## 单帧超限

入站单帧超过 `maxPayloadBytes`（默认 100 MiB）→ 连接被关闭（`ws` 库以 1009 结束）。

::: tip 大文件走 URL

超过 100 MiB 的内容（整段无损语音、大视频）应当传 URL 让框架自己去取，
不要塞进一帧。

:::

## 慢客户端

服务端到客户端的缓冲（`bufferedAmount`）超过 8 MiB → 连接以 `1008` 关闭。

这是有意的：无限排队会吃内存，一个慢客户端能拖垮整个进程。断掉让它自己重连更好。

## 响应形状汇总

```ts
interface ApiResponse {
  status: 'ok' | 'failed';
  retcode: number;
  data: JsonValue;          // 失败时恒为 null
  echo?: JsonValue;         // 传了就原样回传，没传就没有这个键
  wording?: string;         // 仅失败时出现
  message?: string;         // 流式接口用，普通响应不带
  stream?: string;          // 流式接口用
}
```

::: warning 流式接口尚未实现

`message` / `stream` 两个字段是预留给流式 action 的，当前没有任何 action 使用它们。

:::
