# 配置文件

`--config <path>` 读一份 JSON。设计上有一条硬规则：

> **配置里不能出现凭据。** 遇到 `a1` / `d1` / `a2` / `d2` / `d2Key` / `uid` / `guid`
> 这类键会**直接报错退出**，而不是静默忽略。

理由很直接：把 a1 写进 JSON 是最常见的泄漏路径，而这份文件经常被贴进 issue、提交进仓库、
打进镜像。凭据只能走 `CredentialVault`。

同理，**不认识的顶层键也报错**——拼错的键（`oneBot` vs `onebotByUin`）静默失效比报错更糟。

## 完整样例

仓库里有一份可直接改的：`packages/node/config.example.json`。

```json
{
  "native": {
    "wrapperPath": "/opt/QQNT/resources/app/wrapper.node"
  },
  "qq": {
    "dbPath": "/home/you/.config/QQ/naive/nt_qq/nt_msg.db"
  },
  "session": {
    "syncGraceMs": 15000
  },
  "secToken": {
    "rotateMs": 86400000
  },
  "log": {
    "level": "info"
  },
  "keepRaw": false,
  "maxReloginAttempts": 5,
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
            "reportSelfMessage": true
          }
        ],
        "httpServers": [],
        "wsClients": [],
        "httpClients": []
      },
      "qzone": true,
      "qzoneDomain": "qzone.qq.com"
    }
  }
}
```

## 字段说明

### `native`

| 键 | 说明 |
| --- | --- |
| `wrapperPath` | QQ 的 `wrapper.node` 绝对路径。mode 2 的注册与签名必须用它；不传时由原生组件自己探测 |

### `qq`

| 键 | 说明 |
| --- | --- |
| `dbPath` | 账号 `nt_msg.db` 的绝对路径。**只**用于 `isQqLoggedIn` 预检（判断 QQ 本体是否在线），不读内容 |
| `installDir` | QQ 安装根：Linux 是含 `qq` 的目录（如 `/opt/QQ`），macOS 是 `QQ.app`，Windows 是含 `QQ.exe` 的目录。**只**给控制台的环境探测用，bot 本身不读它 |
| `dataDir` | QQ 数据根：Linux / macOS 是 `~/.config/QQ` 那种目录，Windows 是 `Tencent Files`。同样是控制台侧提示 |

`installDir` / `dataDir` 也可以直接在控制台的**设置页**填写，效果等价（设置页会写回这一份配置）。
它们的优先级高于环境变量与自动探测：**设置页 / 配置 > 环境变量 > 自动探测**。

`dbPath` 不配时，控制台会按「数据根 + 当前账号」推导出 `nt_msg.db`；推导不到才跳过预检并打
warn。独立部署仍建议显式配置，否则无法守住「QQ 在线不抢登录」的红线。

### `session`

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `syncGraceMs` | `15000` | 首屏同步的额外等待。原生组件自己等 15s；慢账号的 `InfoSyncPush` 可能更晚到，这里再等一段。等不到仍然报 `REGISTER_FAILED`，**不会假装在线** |

### `secToken`

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `rotateMs` | `86400000`（24h） | 原地轮换 `SecToken` 的间隔。QQ 客户端 token 缓存 TTL 是 48h，24h 轮换留一倍余量。`<= 0` 关闭自动轮换 |

### 其他顶层键

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `log.level` | `info` | `trace` / `debug` / `info` / `warn` / `error`；`trace` 会打印收发包 hex（不脱敏） |
| `keepRaw` | `false` | 保留入站原始推送帧，诊断用。**会显著增大内存占用** |
| `maxReloginAttempts` | `5` | 重登失败次数上限，耗尽后进入 `relogin-failed` |

### `onebotByUin`

OneBot 配置**按 QQ 号隔离**，键是 uin：

```ts
interface OneBotByUin {
  [uin: string]: OneBotConfig;
}

interface OneBotConfig {
  networks: {
    httpServers: HttpServerNetwork[];
    httpClients: HttpClientNetwork[];
    wsServers: WsServerNetwork[];
    wsClients: WsClientNetwork[];
  };
  qzone?: boolean;         // 默认 true
  qzoneDomain?: string;    // 默认 qzone.qq.com
}
```

`--account` 指定的账号只读自己的那一份；WebUI 网络页也只读写当前登录账号。
**四类网络都是数组** —— 一个账号可以同时挂多个正向 WS、多个反向 WS、多个 HTTP 监听。

::: warning `networks` 的四类键缺一不可

即使不用，也要写空数组 `[]`。少写一类会直接报错，因为「省略」和「拼错」在这里无法区分。

:::

各网络的字段见 [OneBot 接入与网络拓扑](/onebot/)。

## 命令行覆盖

配置文件的优先级低于命令行。目前只有两项能被覆盖：

| 命令行 | 覆盖 |
| --- | --- |
| `--account <uin>` | 账号。**永远**命令行优先，配置文件里不允许出现账号 |
| `--qq-db <path>` | `qq.dbPath` |
| `--native-dir <dir>` | 原生组件目录（优先级高于 `WEQBOT_NATIVE_DIR`） |

## 环境变量

| 变量 | 作用 |
| --- | --- |
| `WEQBOT_NATIVE_DIR` | 原生组件目录 |
| `WEQBOT_VAULT_DIR` | 凭据目录（默认 `~/.weqbot/accounts`），多实例隔离时用 |
| `WEQBOT_QQ_DB` | 等价于 `--qq-db` |
| `WEQBOT_QQ_INSTALL_DIR` | QQ **安装根**（含 `qq` / `QQ.exe` 的目录；macOS 是 `QQ.app`）。优先级低于配置文件的 `qq.installDir` |
| `WEQBOT_QQ_ROOT` | QQ **数据根**（`~/.config/QQ` 那类目录）。**不是**安装目录；优先级低于 `qq.dataDir` |
| `WEQBOT_QQ_EXE` | QQ 可执行文件的完整路径；等价于指定安装根，优先级低于 `WEQBOT_QQ_INSTALL_DIR` |

## 校验行为

`packages/node/src/config.ts` 只做「形状 + 明显错误」的检查：

- 顶层必须是对象；
- 出现凭据类键 → 报错；
- 出现不认识的键 → 报错并列出可用键；
- `onebotByUin` 存在时，每个值都必须有 `networks`，且四类都是数组。

深层业务校验交给 `createBot`（它启动时逐项校验）。两边不重复，避免规则漂移。

报错信息一定带**具体是哪一项**，因为这个文件是手写的，只说「配置无效」等于没写：

```text
配置文件 /tmp/weqbot.json 无效：不认识的键 "oneBot"（可用：native / qq / session / secToken / onebotByUin / log / keepRaw / maxReloginAttempts）
```
