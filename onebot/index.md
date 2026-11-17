# OneBot 接入与网络拓扑

WeqBot 对外提供 **OneBot v11** 兼容接口。这一页讲清怎么连、怎么鉴权、出错怎么读。

动作清单见[动作列表](actions.md)（由代码自动生成，不会漂）。

## 网络拓扑

**四类网络可以同时存在**，每类都是数组：

| 类型 | 方向 | 用途 |
| --- | --- | --- |
| `wsServers` | 正向 WS | 客户端连过来，收发都在这一条连接上 |
| `httpServers` | HTTP 服务端 | 客户端 POST action；**不主动推事件** |
| `wsClients` | 反向 WS | bot 主动连客户端 |
| `httpClients` | HTTP 上报 | bot 主动 POST 事件到客户端 |

::: tip 一个账号挂多个

一个账号可以同时挂多个正向 WS、多个反向 WS、多个 HTTP 监听。这是 OneBot v11 的常规
用法，也是刻意支持的。

:::

### 配置形状

```json
{
  "onebotByUin": {
    "2863253201": {
      "networks": {
        "wsServers": [
          {
            "name": "client",
            "host": "127.0.0.1",
            "port": 6700,
            "role": "Universal",
            "messageFormat": "array",
            "reportSelfMessage": true,
            "accessToken": "可选"
          }
        ],
        "httpServers": [],
        "wsClients": [],
        "httpClients": []
      }
    }
  }
}
```

OneBot 配置按 QQ 号隔离，键是 uin；不同账号可以有不同的端口拓扑。
四类键**缺一不可**，不用就写空数组 `[]`。

### 公共字段

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `name` | 必填 | 配置名，日志与诊断用 |
| `enabled` | `true` | `false` 时保留配置但不启动 |
| `accessToken` | 无 | 空表示不鉴权 |
| `messageFormat` | — | `array` 或 `string` |
| `reportSelfMessage` | — | 是否下发自己发出的消息（`message_sent`） |

### 服务端字段

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `host` | `127.0.0.1` | 监听地址 |
| `port` | 必填 | 端口（`0` 表示随机，实际端口在日志里） |
| `path` | `/` | WS 的端点路径；HTTP 里是 action 前缀 |
| `role` | `Universal` | 仅 WS：`Api` / `Event` / `Universal` |
| `enableWebSocket` | `false` | 仅 HTTP：在同一个监听上接受 WS 客户端 |
| `maxPayloadBytes` | 100 MiB | 单帧上限，超过以 1009 关闭 |

### 客户端字段

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `url` | 必填 | 对端地址 |
| `role` | `Universal` | 仅 WS |
| `reconnectIntervalMs` | 内部默认 | 仅 WS：重连间隔 |
| `timeoutMs` | 内部默认 | 仅 HTTP client |
| `maxPayloadBytes` | 100 MiB | 仅 WS |

## WS 角色

| `role` | 能收 action | 能收事件 |
| --- | --- | --- |
| `Api` | ✅ | ✗ |
| `Event` | ✗ | ✅ |
| `Universal` | ✅ | ✅ |

`:path` 只是端点路径（默认 `/`），**不按路径分流**。角色只由配置的 `role` 字段决定 ——
同一个路径上的连接能收 action 还是事件，取决于它的 `role`。

## 鉴权

接受两种传法：

```http
Authorization: Bearer <token>
```

```text
ws://127.0.0.1:6700/?access_token=<token>
```

`accessToken` 为空表示**不鉴权**（默认）。`Authorization` 头必须是 `Bearer <token>`
形式，**裸 token 不被接受**（`isAuthorized` 的 `allowRawToken` 当前没有任何调用方开启）。

::: warning 默认只听 127.0.0.1

改 `host` 前先想清楚：OneBot 暴露的写能力包括发消息、踢人、改群名。绑到公网等于把这些
交给任何能连上的人，即使有 token。

:::

## HTTP 服务端

路由是 `POST /<action>`，路径即 action 名：

```bash
curl -H 'Authorization: Bearer <token>' \
  'http://127.0.0.1:6700/get_login_info'

curl -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"group_id":12345,"message":"hello"}' \
  'http://127.0.0.1:6700/send_msg'
```

::: warning GET 请求不执行 action

`GET` 只用于健康检查，返回 `{ "status": "ok", "retcode": 0, "data": { "online": true } }`。
**所有 action 都是 POST** —— 包括 `get_login_info` 这类只读的。

:::

`echo` 通过查询参数传：`?echo=1`。

请求体上限 **10 MiB**（HTTP 接口不该用来传整段媒体）。超过会以 `400` 拒绝。

::: tip `path` 配置的实际作用

`path` 是 action 的**前缀**，不是可路由的独立端点：

```text
path = ''      → POST /send_msg
path = '/api'  → POST /api/send_msg
```

:::

::: tip HTTP 不推事件

需要在收到新消息时被通知，请用 WS 正向或反向。HTTP 服务端只用于调用 action。

:::

## 请求与响应

### 请求

```json
{ "action": "send_group_msg", "params": { "group_id": 55555, "message": "hi" }, "echo": "1" }
```

`echo` 是可选的，但**强烈建议带**：客户端靠它把响应和请求配对。

### 响应

```json
{ "status": "ok", "retcode": 0, "data": { "message_id": 1000001 }, "echo": "1" }
```

失败时：

```json
{ "status": "failed", "retcode": 100, "data": null, "wording": "群号不存在", "echo": "1" }
```

::: danger `echo` 必须原样回传

早期版本这里丢过 `echo`，表现是「所有 action 都超时，但事件推送照常」—— 严格按
`echo` 过滤的客户端会一直等。现在响应总是带回传入的 `echo`，**不传就不加这个键**
（避免序列化成 `"echo": null`）。

:::

## 错误码

| `retcode` | `status` | 含义 |
| --- | --- | --- |
| `0` | `ok` | 成功 |
| `100` | `failed` | 业务失败（QQ 拒绝、目标不存在等） |
| `1200` | `failed` | 内部错误 |
| `1400` | `failed` | 参数错误 |
| `1404` | `failed` | 不支持的 action（当前后端没实现，或属于敏感能力） |

详见[错误码](errors.md)。

## Action 注册是动态的

::: warning 文档里有、实际可能没有

`ALL_ACTIONS` 有 205 条，但**注册由后端能力决定**：后端没实现的能力不会注册，调用时
返回 `1404`，而不是注册了再崩。

所以「文档列出这条」不等于「这个部署能调」。启动日志会打印注册数与跳过数：

```text
08:30:00 INFO  [cli] bot 已上线 {"uin":"…","onebot":{"port":6700,"actions":N}}
```

`N` 是实际注册成功的数量。

:::

[动作列表](actions.md)里每条都标了能力判定方式：

| 标记 | 含义 |
| --- | --- |
| 始终注册 | 不依赖后端任何能力，一定有 |
| 需要后端方法 | 后端实现了列出的方法才注册 |
| 按能力域判定 | 按功能域整体判定（如 `qzone` 开关关掉就整组不注册） |


deny-list 是代码里的常量（`DENIED_ACTIONS`），不是配置项。

## 消息格式

`message` 参数接受三种形状：

- CQ 码字符串：`"hello[CQ:face,id=1]"`
- segment 数组：`[{ "type": "text", "data": { "text": "hello" } }]`
- 单个 segment 对象：`{ "type": "text", "data": { "text": "hello" } }`

布尔参数接受 `true` / `false`、`1` / `0`、`"true"` / `"false"`。

`send_msg` 不传 `message_type` 时按唯一目标 ID 推断。

详见[消息段](segments.md)。

## 单帧与背压

| 项 | 值 |
| --- | --- |
| 单帧入站上限 | 100 MiB（`maxPayloadBytes` 可配），超过以 1009 关闭 |
| 慢客户端缓冲上限 | 8 MiB，超过直接断开 |

::: tip 为什么是断开而不是排队

无限排队会吃内存。慢客户端只会拖垮整个进程，不如让它自己重连。

:::

## 下一步

- [动作列表](actions.md) —— 205 条动作的入参
- [消息段](segments.md) —— 14 种 segment 的字段
- [错误码](errors.md) —— 各码的排查方向
- [事件推送](/events/) —— 事件格式
