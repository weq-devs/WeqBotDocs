# 下载与安装

::: info 尚未发布

WeqBot 还没有发布版本，下表的「发布包」渠道都是**规划中**的形态。当前只能用源码运行，
见下面的[从源码运行](#从源码运行)。

:::

## 发布包（规划中）

| 渠道 | 形态 | 状态 |
| --- | --- | --- |
| Release 压缩包 | 自带 slim 原生组件的目录 | 尚未实现 |
| Docker 镜像 | 单进程，挂载配置与凭据目录 | 尚未实现 |

发布包与源码运行的区别只有一处：**原生组件从哪来**。发布包自带
`native/<platform>-<arch>/weqbot.node`；源码运行要自己准备（见下）。

## 从源码运行

### 环境要求

| 项 | 要求 |
| --- | --- |
| Node.js | ≥ 22.12.0 |
| pnpm | 与根 `package.json` 的 `packageManager` 一致（`pnpm@12.8.1`） |
| 原生组件 | WeqBot 自己的 slim 产物，或本地调试时借用 WeQ 的 full 产物 |

### 安装依赖

```bash
git clone https://github.com/weq-devs/WeqBot.git
cd WeqBot
pnpm install
```

### 准备原生组件

原生组件是**唯一**需要按平台区分的部分。按查找顺序（`packages/node/src/loader.ts`）：

1. `--native-dir <dir>` 显式指定；
2. `WEQBOT_NATIVE_DIR` 环境变量；
3. `<repo>/native/<platform>-<arch>/`。

目录里要求有 `weqbot.node`（首选）或 `nt_helper.node`（兼容 WeQ 的 full 产物，便于本地调试）。

```bash
# 本地调试：借用 WeQ 的 full 产物
mkdir -p native/linux-x64
cp ../nt_helper/index.linux-x64-gnu.node native/linux-x64/weqbot.node
```

::: warning 时效

WeQ 的 full 产物自带 30 天有效期，而 WeqBot 的加载器**不校验**它（时效属于 WeQ 的发版
问题）。本地调试时可以无视，正式分发必须用无时效的 slim 产物。

:::

### 用源码直接跑

开发期不需要构建，`tsx` 直接跑 TypeScript 源码：

```bash
pnpm dev:cli --help                                  # 看全部参数
pnpm dev:cli --account <uin> --check                 # 只做 native 自检，不连网
pnpm dev:cli --account <uin> --config <path>         # 起 bot（含 OneBot）
```

`--check` 只加载原生组件、打印能力报告，**不联网也不读凭据**，适合第一次确认环境。

### 自检与诊断

```bash
pnpm dev:cli --print-capabilities                    # 打印原生组件能力清单
pnpm dev:cli --print-capabilities --qq-pid <pid> --account <uin>
```

第二条会额外打印从 QQ 进程内存里读到的 `secToken` **来源与剩余 TTL**（不打印 token 本身
—— 终端输出经常被贴进日志）。需要 root 或 `CAP_SYS_PTRACE`。

### 校验安装

```bash
pnpm verify
```

跑架构护栏（依赖方向 + 原生加载限制）、全包类型检查、OneBot 文档快照一致性，以及全量测试。

## Docker（尚未实现）

规划形态：单进程、非 root、配置与凭据目录挂载进容器。

```bash
# 尚未实现，下面是预期的用法
docker run -d \
  -v ./config.json:/etc/weqbot/config.json:ro \
  -v weqbot-accounts:/var/lib/weqbot/accounts \
  -p 6700:6700 \
  ghcr.io/weq-devs/weqbot:latest --account <uin> --config /etc/weqbot/config.json
```

需要先解决的三件事（这也是它还没做的原因）：

1. **原生组件要进镜像**：slim 产物必须随镜像分发，不能运行时再下载；
2. **凭据目录的所有权**：Linux 下 vault 是 `0600` 文件，容器内 uid 必须与挂载目录属主一致；
3. **优雅下线**：`stop()` 要发 `UnRegister`，容器必须给它留出时间。进程已经接
   `SIGTERM`（Docker 默认信号）并等待 `closeSession` 完成，但 `docker stop` 的默认
   10 秒超时对慢网络偏紧。

## 下一步

装好之后看[登录与凭据](login.md)——bot 需要一个 a1 才能上线。
