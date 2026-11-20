# 凭据与设备档案

这一页讲清楚三样东西的关系：**a1**（唯一要持久化的敏感物）、**guid**（设备标识）、
**设备档案**（签名与风控的依据）。以及为什么 a2 / d2 / d2Key 不落盘。

源码：`packages/session/src/credentials.ts`、`packages/session/src/vault.ts`。

## 存什么，不存什么

```ts
interface StoredAccount {
  uin: string;
  uid: string;
  a1: Uint8Array;          // 敏感，落盘加密由宿主实现
  guid: string;            // 32 位小写 hex
  group: 'local' | 'self'; // 账号分组，见下一节
  device: {
    os: string;
    appId: string;
    subAppId: string;
    qua: string;
    clientVersion: string;
    deviceName?: string;
    kernelVersion?: string;
  };
  lastOnlineAt?: number;   // 仅用于展示
  a1Origin?: 'login-db' | 'qr' | 'manual';   // 诊断：迁移 / 换机
}
```

**存**：a1 + guid + 设备档案（外加 uin / uid 作索引）。

**不存**：

- a2 / d2 / d2Key —— `quickLogin` 的派生物，掉线重登时重新换。存它们只会制造
  「票据过期但状态显示在线」的假象；
- 数据库密钥 / `keyMeta` —— bot 不读 QQ 库；
- 扫描来的会话物料 —— 永远不做扫描凭据的 mode2。

## 账号分组：本机 / 自主

**同一份 guid 不能给两个身份用。** 分组就是为了守住这条：服务端按 guid 认设备，
本机账号借的是 QQ 本体那台设备的身份，自主账号必须是自己那台。混用会互相顶下线、
反复触发设备确认，而且「a1 失效时该清哪份」也会说不清。

| 组 | 是谁 | guid | a1 | 凭据来源 |
| --- | --- | --- | --- | --- |
| `local` | 本机账号（QQ 本体在这台机器登录过） | 本机数据根里那条 | 每次从 `login.db` 现解；轮换后写回 `login.db` | `login.db`，vault 只留镜像兜底 |
| `self` | 自主账号（扫码产生的新设备身份） | **首次扫码时随机生成**，之后一直复用 | vault | vault |

落盘按组分开：`<group>-<uin>.json`。同一个 uin 可以在两组里各存一份，互不覆盖 ——
这是「本机登录过的号后来也扫码登录」的唯一正确存法。

```text
~/.weqbot/accounts/local-123456789.json   # 本机账号（login.db 的镜像）
~/.weqbot/accounts/self-123456789.json    # 自主账号（自持 guid）
```

有头模式不进 vault：它借的是运行中 QQ 的会话，设备身份自然还是本机 guid。

## a1

a1 是长期身份凭据，`quickLogin(a1)` 用它换 a2 / d2 / d2Key。

### 会被轮换

`quickLogin` 成功后 a1 可能变化。真机观察到 `a1Rotated=true`，`createBot` 会把它写回 vault。

**本机组还要多写一步**：vault 只是镜像，QQ 本体读的是 `login.db`。所以控制台在本机
账号上线成功后会比对 vault 里那份 a1 与本次使用的 a1，不同就调原生的
`updateLoginDbA1`（对应 `update_login_db_a1`）加密写回 `login.db` 的 `[1004]`：

- 只改 a1，不碰 `[1008]` / `[1013]` / `[1014]` / `[1015]` 等时间字段；
- 原生侧在事务里写入并回读自检（`verified`），失败只告警 —— a1 已经能用，
  不该因为回写失败把上线判失败；
- 原生组件没有这个能力（老构建）时跳过，此时本机组只能「读」不能「回写」；
- 写之前 QQ 本体必须已退出（它持有写锁），本机组的登录流程本来就会先结束它。

::: warning 直调原生组件的路径不会写回

`createBot` 里有写回逻辑，绕过它直接调 `native.quickLogin()` 的代码需要自己处理轮换。

:::

### 失效

错误码 **`140022014` / `140022015` / `140022016`**，服务端枚举里分别叫
EXPIRE / KICKED / ILLEGAL_TICKET，文案都是「你的用户身份已失效，为保证账号安全，请你重新登录」。

这是真机实测结论：`140022015` 之外，真机也上报过 `140022016`，处置完全相同。
**三个码都要当成 a1 失效** —— 只认 015 的后果是 016 会被归到普通登录失败，
宿主既不删失效凭据也不提示改扫码，用户会拿同一串 a1 反复重试。

注意它**不是** `unusual-device` —— 失效 a1 会先被这个码拒掉，根本走不到设备确认流程。
也不要把它和邻近的 `140022017`（SEC_BEAT，缺签名）混为一谈：那个重新登录修不好。

`createBot` 把这种情况归成独立的 `A1_EXPIRED`（与 `LOGIN_FAILED` 的其它成因区分开），
重登时遇到它以 `offline.reason = 'credential-expired'` 直接停下、不再退避重试。

**宿主怎么清**：删 vault 里这个账号的文件即可（`<uin>.json`），`login.db` 一律不动 ——
那是 QQ 本体维护的库，里面的 a1 可能已经在我们不知道的时候刷新过。删完下次启动会
重新走「从 `login.db` 取 a1 → 写回 vault」的流程。

## guid

32 位小写 hex 的设备标识。**必须跨重启稳定**，否则服务端看到的是「一台新设备」，
触发设备确认流程。

同一份 vault 文件拷到新机器时 guid 跟着走，这是有意的 —— 迁移后对服务端而言仍是同一设备。

## 设备档案

`device` 里的值来自 QQ 的安装目录（WeQ 已有 `resolveAppidFromMajor`），**必须跨重启稳定**，
否则签名 / 风控行为会变。

| 字段 | 说明 |
| --- | --- |
| `os` | 平台标识 |
| `appId` / `subAppId` | 随 QQ 版本变化。如 `subAppId`：9.9.35 → 537382819，9.9.36 → 537391628 |
| `qua` | 版本串，签名要用 |
| `clientVersion` | 版本号 |
| `deviceName` / `kernelVersion` | 缺省时由 `createBot` 补 `os.hostname()` / `os.release()` |

升级 QQ 后这三项（`appId` / `subAppId` / `qua`）**不能缓存旧值**，必须每次从当前
`major.node` 重新解析。

## vault 实现

### 契约

```ts
interface CredentialVault {
  list(group?: AccountGroup): Promise<AccountSummary[]>;
  get(uin: string, group?: AccountGroup): Promise<StoredAccount | undefined>; // 取不到返回 undefined，不抛错
  put(account: StoredAccount): Promise<void>;
  delete(uin: string, group?: AccountGroup): Promise<void>;   // 删凭据 ≠ 停止 bot
}
```

`group` 省略时按 `self` 取：自主凭据是默认的持久化对象。只认 uin 的调用方
（`createBot`）由宿主用 `groupScopedVault(vault, group)` 包一层，这样它内部的
a1 轮换回写也不会跨组。

实现由宿主注入，业务代码里**不出现** `if (process.platform === ...)`。

### 独立进程：`FileCredentialVault`

```text
~/.weqbot/accounts/<group>-<uin>.json   # 默认；WEQBOT_VAULT_DIR 可覆盖
```

旧版的 `<uin>.json`（没有 `group` 字段）仍然能读：按 `a1Origin` 推断分组
（`login-db` → 本机，其余 → 自主）；下次 `put` 写到新文件名并清掉旧文件。
推断出的组与请求的组不一致时**当作不存在** —— 拿本机凭据去当自主账号用，
正是分组要禁止的事。

磁盘信封：

```json
{ "version": 1, "account": { "...": "..." } }
```

- 文件 `0600`、目录 `0700`；
- 写盘走「临时文件 + rename」，崩溃不会留下半个 JSON；
- 读取时校验 `version`，不认识的版本直接报错（`CREDENTIAL_CORRUPT`），不做「猜字段」。

### `SecretStore`：宿主注入的加密出口

```ts
interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
```

注入后 a1 走 `SecretStore`，JSON 里只留 `a1Ref`（如 `weqbot:account:<uin>`）；
未注入时 a1 直接落在 `0600` 文件里。

::: danger Linux 降级是显式的

没有桌面会话时走 `0600` 文件，启动时**会打印一次警告**：

```text
本机无 keychain，凭据以 0600 文件存放
```

不要静默降级 —— 用户有权知道自己的 a1 是明文落盘的。

:::

## 三端方案

| 平台 | 主方案 | 降级 |
| --- | --- | --- |
| macOS | Keychain（`SecItem`） | — |
| Windows | Credential Manager（DPAPI 保护） | — |
| Linux | Secret Service（`libsecret` / D-Bus） | 无桌面会话：`0600` 文件 + 警告 |

实现候选是 `@napi-rs/keyring`（三端、预编译产物，无需自己写 napi）。不引入 `keytar`（已停止维护）。

最终方案未定 —— 若将来改由 native 提供，也只是换一个实现，`CredentialVault` 契约不变。

## WeQ 嵌入场景

WeQ 已经有 `safeStorage`，由宿主持有 vault，sidecar **只在进程内存里保留**凭据：

- 宿主解出 a1 → 通过控制通道 `login` 交付 → sidecar 写入自己的 vault 后**立刻从内存清掉**
  （`login` 的 params 不在闭包里保留）；
- 凭据永不出 sidecar：控制通道的 `status` 只返回状态与设备档案，不含 a1。

详见[嵌入 WeQ](embedding.md)。
