# 登录与凭据

WeqBot 上线需要一份 **a1 凭据**。这一页讲清楚它从哪来、存在哪、什么时候失效，
以及换机器时该怎么办。

## 一句话

**a1 是唯一需要持久化的敏感物**。它属于两个**严格隔离**的账号组：

| 组 | 登录方式 | guid | a1 从哪来 |
| --- | --- | --- | --- |
| 本机账号 | 一键登录（本机缓存） | 复用本机的 | `login.db`，轮换后**写回** |
| 自主账号 | 扫码（或之后用它自己的凭据） | 首次扫码随机生成、之后复用 | vault |
| （有头模式） | 接运行中的 QQ | 复用本机的 | 不落盘（借 QQ 的会话） |

a2 / d2 / d2Key 是 `quickLogin` 派生物，**永不落盘** —— 掉线重连时重新换一张就行。

## 三种登录方式

### 1. 本机缓存一键登录（QQ 已在本机登录过）

QQ 客户端登录后会把 a1 存在本地数据库里。WeQBot 不读 QQ 的数据库（见[三条边界](/guide/#先说清三条边界)），
所以这一步由**宿主**完成：

| 宿主 | 谁提供 a1 |
| --- | --- |
| 独立进程（`@weqbot/node`） | `FileCredentialVault`，凭据文件在 `~/.weqbot/accounts/<group>-<uin>.json` |
| 嵌入 WeQ | WeQ 的登录流程解出 a1 后通过控制通道交付，sidecar 不自己解 |

::: warning 只持久化三样东西

凭据记录里只有 **a1 + guid + 设备档案**。设备档案（`os` / `appId` / `subAppId` / `qua` /
`clientVersion` / `deviceName` / `kernelVersion`）必须**跨重启稳定**，否则签名与风控行为会变。

:::

### 2. 自主登录（扫码，或它自己之后的一键登录）

全新机器上没有 QQ 登录记录，也就没有 a1。此时用**控制台的扫码登录**：

```text
起控制台 → 手机 QQ 扫二维码 → 确认 → 拿到 a1/uid → 写 vault → openSession 上线
```

二维码由原生 `qrLogin` 产生，通过 SSE 推给浏览器；45 秒硬超时，过期后页面点「刷新」重来。
成功后凭据进 **`self` 组**，`a1Origin` 记为 `qr`。

**guid 只在首次扫码时生成**：登录页每次扫码都会随机一个 32 位 hex 当设备身份，
随凭据存进 vault；之后这个账号的一键登录（`quickLogin`）一直用它。

为什么不借本机 guid —— 借了就变成「同一台设备上的两个身份」：本机 QQ 一登录，
两边就会互踢 / 反复触发设备确认。扫码 = 新设备，与 QQ 自己的语义一致。

::: tip 重扫会换设备身份

重新扫码会生成新的 guid（服务端会把它当成一台新设备，可能要求手机确认）。
日常重登不需要重扫：点「自主账号」里的那条就行，它会用存下来的 guid 换票。

:::

::: tip 四个 tab：本机账号 / 自主账号 / 有头模式 / 扫码

登录页按**分组**分页，同一账号可能两组各出现一条（那是两台设备）：

- **本机账号**：`login.db` 里 QQ 本体写入的 a1，uid / guid 复用本机的；点它会
  重新解密 `login.db`，上线后把轮换的 a1 写回 `login.db`。vault 里的本机镜像只在
  `login.db` 读不出来时兜底，不会重复列一条；
- **自主账号**：`self` 组的凭据（扫码来的），guid 自持；
- **有头模式**：接运行中的 QQ，复用本机 guid，不碰 vault；
- **扫码**：不依赖任何本机文件，成功后进自主组。

分页是有意的：两者的**设备身份和失效处理都不同**。a1 失效时只清失效那一组，
另一组同名账号原样保留（`login.db` 那头可能已经在我们不知道的时候刷新过）。

列表只显示**有可用 a1** 的条目；`login.db` 里有记录但解不出 a1 的行不会出现 ——
点进去必然失败，不如直接走扫码。所以某一页为空不等于机器上没登录过 QQ。

:::

::: tip 控制台是推荐入口

`weqbot` 不带 `--account` 启动时只起控制台（`127.0.0.1:6299`），登录、上线、看日志、改网络
都在浏览器里完成。细节见[控制台](./console.md)。

:::

## 凭据存在哪

```text
~/.weqbot/accounts/<group>-<uin>.json     # 默认；WEQBOT_VAULT_DIR 可覆盖
```

`<group>` 是 `local`（本机账号）或 `self`（自主账号）。同一 uin 两组各一份，
互不覆盖。旧版的 `<uin>.json` 仍能读，按 `a1Origin` 推断分组。

文件格式（`FileCredentialVault`）：

```json
{
  "version": 1,
  "account": {
    "uin": "123456789",
    "uid": "u_xxxxxxxxxxxx",
    "a1": "<base64>",
    "guid": "0123456789abcdef0123456789abcdef",
    "group": "local",
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

`quickLogin` 返回 **`140022014` / `140022015` / `140022016`**，文案都是「你的用户身份已失效，
请重新登录」。这是真机实测结论（服务端枚举：EXPIRE / KICKED / ILLEGAL_TICKET），三个码的
处置完全相同，任意一个都要**停止重试**并提示用户重新登录 QQ 或重新扫码 —— 反复用失效 a1
重试只会引发风控。

它不是 `unusual-device`，也不是邻近的 `140022017`（SEC_BEAT，缺签名）—— 后者重新登录修不好。

代码里的落地方式：

- `createBot` 把它单独归成 `A1_EXPIRED`（不是 `LOGIN_FAILED`），重登路径也据此**跳过退避
  重试**，以 `offline.reason = 'credential-expired'` 直接停下；
- 宿主（WebUI / WeQ）收到后**只删 vault 里那份凭据**，`login.db` 不动 —— 那边是 QQ 本体
  写的，可能已经刷新过；
- WebUI 会自动把页面切到「扫码登录」并给出提示，失效那一组里的该账号随之消失，
  另一组里的同一账号仍然可以点。

### a1 会被轮换

`quickLogin` 成功后 a1 可能变化（真机观察到 `a1Rotated=true`）。`createBot` 会把它写回 vault；
直调原生组件的路径**不会**，需要自己处理。

**本机账号额外写回 `login.db`**：控制台在本机组上线成功后，会把新 a1 用原生的
`updateLoginDbA1` 加密写回 `login.db` 的 `[1004]`（只改 a1，不碰时间字段，写后回读自检）。
不回写的话 QQ 本体那边会一直是旧 a1 —— 下次 QQ 启动要重新登录，而我们下次一键登录
又拿旧的去换票，两边越走越远。老原生组件没有这个能力时会跳过（只告警）。

## 与 QQ 本体的关系

真机实测（`scripts/v5-takeover-probe.mjs`）：同账号 mode 2 与 QQ **不互踢**，可双端同时在线。

但这只说明「技术上允许」，**产品口径仍坚持**：

- QQ 在线 → 借会话（mode 1）；
- QQ 离线 → 自建（mode 2）。

原因是双端在线会让消息出现两处、回执语义混乱。独立进程形态下用这个账号的 `nt_msg.db`
做预检（`isQqLoggedIn`）。路径按这个顺序取：

1. 显式配置的 `qq.dbPath`（`--qq-db` / `WEQBOT_QQ_DB`）；
2. 从 QQ 数据根 + 账号推导（Windows 是 `<数据根>/<uin>/nt_qq/nt_db/nt_msg.db`，
   Linux / macOS 是 `<数据根>/nt_qq_<md5(md5(uid)+"nt_kernel")>/nt_db/nt_msg.db`）。

两者都拿不到才跳过检查并打 warn —— 这是产品红线，独立部署仍建议显式配置。

## 换机与迁移

1. 把 `<uin>.json` 拷到新机器的 `~/.weqbot/accounts/`；
2. **保持 `guid` 与 `device` 不变**（同文件天然满足）；
3. 直接启动。`a1` 通常仍有效；失效则返回 `140022015`，回到扫码/登录流程。

::: tip 不要跨账号复制

`device` 里的 `subAppId` 随 QQ 版本变化（如 9.9.35 → 537382819，9.9.36 → 537391628）。
升级 QQ 后设备档案要能重扫，否则签名可能被拒。

:::
