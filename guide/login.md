# 登录与凭据

WeqBot 上线需要一份 **a1 凭据**。这一页讲清楚它从哪来、存在哪、什么时候失效，
以及换机器时该怎么办。

## 一句话

**a1 是唯一需要持久化的敏感物**。它的来源有两条路径：本机已有的 QQ 登录（本机凭据），
或扫码登录（新设备）。a2 / d2 / d2Key 是 `quickLogin` 派生物，**永不落盘** —— 掉线重连时
重新换一张就行。

## 两种来源

### 本机凭据（QQ 已在本机登录过）

QQ 客户端登录后会把 a1 存在本地数据库里。WeQBot 不读 QQ 的数据库（见[三条边界](/guide/#先说清三条边界)），
所以这一步由**宿主**完成：

| 宿主 | 谁提供 a1 |
| --- | --- |
| 独立进程（`@weqbot/node`） | `FileCredentialVault`，凭据文件在 `~/.weqbot/accounts/<uin>.json` |
| 嵌入 WeQ | WeQ 的登录流程解出 a1 后通过控制通道交付，sidecar 不自己解 |

::: warning 只持久化三样东西

凭据记录里只有 **a1 + guid + 设备档案**。设备档案（`os` / `appId` / `subAppId` / `qua` /
`clientVersion` / `deviceName` / `kernelVersion`）必须**跨重启稳定**，否则签名与风控行为会变。

:::

### 扫码登录（新设备）

全新机器上没有 QQ 登录记录，也就没有 a1。此时用**控制台的扫码登录**：

```text
起控制台 → 手机 QQ 扫二维码 → 确认 → 拿到 a1/uid → 写 vault → openSession 上线
```

二维码由原生 `qrLogin` 产生，通过 SSE 推给浏览器；45 秒硬超时，过期后页面点「刷新」重来。
成功后 `a1Origin` 记为 `qr`，与 `login.db` 来的凭据区分开。

::: tip 控制台是推荐入口

`weqbot` 不带 `--account` 启动时只起控制台（`127.0.0.1:6099`），登录、上线、看日志、改网络
都在浏览器里完成。细节见[控制台](./console.md)。

:::

## 凭据存在哪

```text
~/.weqbot/accounts/<uin>.json     # 默认；WEQBOT_VAULT_DIR 可覆盖
```

文件格式（`FileCredentialVault`）：

```json
{
  "version": 1,
  "account": {
    "uin": "123456789",
    "uid": "u_xxxxxxxxxxxx",
    "a1": "<base64>",
    "guid": "0123456789abcdef0123456789abcdef",
    "device": { "os": "Linux", "appId": "537...", "qua": "V1_...", "...": "..." },
    "lastOnlineAt": 1763200000000,
    "a1Origin": "login-db"
  }
}
```

### 权限与降级

| 平台 | 主方案 | 降级 |
| --- | --- | --- |
| macOS | Keychain | — |
| Windows | Credential Manager | — |
| Linux | Secret Service | 无桌面会话时：`0600` 文件 + 启动时明确警告 |

注入 `SecretStore` 后，a1 进 keychain，JSON 里只留 `a1Ref`；未注入时 a1 直接落在
`0600` 文件里 —— 这是**明确接受的降级**，不是遗漏。启动时会打印一次警告。

写盘走「临时文件 + rename」，崩溃不会留下半个 JSON。读取时校验 `version`，不认识的版本
直接报错（`CREDENTIAL_CORRUPT`），不做「猜字段」。

## 上线流程

状态机（`packages/session/src/state.ts`）把每一步显式建模，因为**失败后的正确动作不同**：

```text
idle → preflight → logging-in → logged-in → registering → online
          ↓            ↓            ↓            ↓
       closed      degraded ←───────────────────┘
                    ↓
                 logging-in（重登）或 online（native 自己重连成功）
```

| 状态 | 在做什么 | 失败了怎么办 |
| --- | --- | --- |
| `preflight` | 平台、QQ 安装路径、VM 可用性、native 能力、vault 有无 a1 | 停，报配置问题 |
| `logging-in` | `quickLogin(a1)` 换 a2/d2/d2Key | a1 失效 → 停；网络 → 退避重试；风控 → 停并报错 |
| `logged-in` | 拿到票据，尚未注册 | — |
| `registering` | `openSession(mode 2)`：`SsoInfoSync` 注册 + 首屏同步 + 挂推送 | 超时 → 退避重登 |
| `online` | 心跳由 native 维持，事件从 sink 进来 | 掉线 → `degraded` |

**状态迁移不允许跳步**，只有 `closed` 可以从任何状态一步进入。

### a1 失效长什么样

`quickLogin` 返回 **`140022015`**「你的用户身份已失效，请重新登录」。这是真机实测结论，
不是 `unusual-device`。遇到它应当**停止重试**并提示用户重新登录 QQ 或重新扫码 —— 反复
用失效 a1 重试只会引发风控。

### a1 会被轮换

`quickLogin` 成功后 a1 可能变化（真机观察到 `a1Rotated=true`）。`createBot` 会把它写回 vault；
直调原生组件的路径**不会**，需要自己处理。

## 与 QQ 本体的关系

真机实测（`scripts/v5-takeover-probe.mjs`）：同账号 mode 2 与 QQ **不互踢**，可双端同时在线。

但这只说明「技术上允许」，**产品口径仍坚持**：

- QQ 在线 → 借会话（mode 1）；
- QQ 离线 → 自建（mode 2）。

原因是双端在线会让消息出现两处、回执语义混乱。独立进程形态下用 `qq.dbPath` 做预检
（`isQqLoggedIn`）；不配就跳过检查并打 warn —— 这是产品红线，独立部署应尽量配置。

## 换机与迁移

1. 把 `<uin>.json` 拷到新机器的 `~/.weqbot/accounts/`；
2. **保持 `guid` 与 `device` 不变**（同文件天然满足）；
3. 直接启动。`a1` 通常仍有效；失效则返回 `140022015`，回到扫码/登录流程。

::: tip 不要跨账号复制

`device` 里的 `subAppId` 随 QQ 版本变化（如 9.9.35 → 537382819，9.9.36 → 537391628）。
升级 QQ 后设备档案要能重扫，否则签名可能被拒。

:::
