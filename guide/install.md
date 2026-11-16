# 下载与安装

::: info 尚未发布

WeqBot 还没有发布版本，下表的「发布包」渠道都是**规划中**的形态。当前只能用源码运行，
见下面的[从源码运行](#从源码运行)。

:::

## 发布包（规划中）

| 渠道 | 形态 | 状态 |
| --- | --- | --- |
| Release 压缩包 | 自带原生组件的目录 | 尚未实现 |
| Docker 镜像 | 单进程，挂载配置与凭据目录 | 尚未实现 |

发布包与源码运行的区别只有一处：**原生组件从哪来**。发布包自带
`native/<platform>/<arch>/nt_helper.node`；源码运行用 `pnpm native:fetch` 取（见下）。

WeqBot **不做 slim 裁剪版**：用的就是 `nt_helper` 的完整产物，与 WeQ 同一份。

## 从源码运行

### 环境要求

| 项 | 要求 |
| --- | --- |
| Node.js | ≥ 22.12.0 |
| pnpm | 与根 `package.json` 的 `packageManager` 一致（`pnpm@12.8.1`） |
| 原生组件 | `nt_helper` 构建产物（`pnpm native:fetch` 取，或本地 cargo 构建） |

### 一键跑起来（推荐）

```bash
git clone https://github.com/weq-devs/WeqBot.git
cd WeqBot
pnpm dev
```

`pnpm dev`（`scripts/dev.mjs`）按顺序做四件事，已经就绪的步骤会跳过：

1. `node_modules` 不完整 → `pnpm install --frozen-lockfile`；
2. 原生组件缺 `openSession` / `attachPushSink` → 优先装本地 `nt_helper` 构建
   （同级的 `../nt_helper` 或 `NT_HELPER_DIR`），没有才回落 release 产物；
3. `packages/webui/dist` 缺失或比源码旧 → `build:webui`；
4. 起控制台，参数原样透传给 CLI。

后面的参数照常传：`pnpm dev -- --account <uin> --config <cfg>`。开关有 `--rebuild`
（强制重建前端）、`--no-build`（不构建前端）、`--release`（强制 release 产物）。

### 手动安装

想一步步来，或者要看每一步的原始输出：

```bash
git clone https://github.com/weq-devs/WeqBot.git
cd WeqBot
pnpm install
```

### 准备原生组件

原生组件是**唯一**需要按平台区分的部分。按查找顺序（`packages/node/src/loader.ts`）：

1. `--native-dir <dir>` 显式指定；
2. `WEQBOT_NATIVE_DIR` 环境变量；
3. `<repo>/native/<platform>/<arch>/`（与 WeQ 同布局）。

目录里要有 `nt_helper.node`（`native:fetch` 的落点名；旧布局的 `weqbot.node` 也认）。

```bash
pnpm native:fetch            # 本机平台，取 native/pinned.json 锚定的 tag
pnpm native:fetch --all      # 五个平台
pnpm native:fetch --check    # 只比对，不下载
pnpm native:fetch --verify   # 装完在隔离子进程里 require 一次，看 getInitStatus()
```

::: warning 开发期必须装本地构建

`native/pinned.json` 锚的发布仓那份**现在**就是旧 napi 绑定构建：缺 `openSession` /
`pushSink` / `statusSink`，只能登录换票，跑不了 mode2 上线。所以开发期要走本机 cargo 构建
（`pnpm dev` 会自动找，见上）。等发布仓补上新绑定后，这条限制自然消失。

手动装本地构建：

```bash
cd ../nt_helper && cargo build --release   # 或 napi build
cd ../WeqBot
pnpm native:fetch --from-file ../nt_helper/index.linux-x64-gnu.node
```

`--from-file` 不写版本锚、不写安装记录（下次 `--check` 会如实说「本地没装过」），
并在装之前检查有没有 `openSession`，没有会明确警告。

:::

::: tip 时效

WeqBot 的加载器**不自己计算有效期**，也不许写死天数：天数只在 nt_helper 的 Rust 里定义一处
（`common::BUILD_VALIDITY_SECS`，当前 60 天），二进制通过 `getInitStatus()` 给结论、
通过 `getBuildInfo()` 自报 `buildTime` / `expireTime` / `validitySecs`。
加载时会检查 `getInitStatus()`：过期就明确提示更新，而不是等到第一次 native 调用才报
`Environment validation failed`。本地 cargo 构建是 `isDev: true`，不带时间戳、不过期；
`pnpm native:fetch` 会把剩余时间打印出来，`--require-fresh` 只是发版前的临时门禁。
按 2026-11-16 的口径，今后统一取消时效。

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

1. **原生组件要进镜像**：镜像构建时用 `pnpm native:fetch --all` 预置，不在运行时下载；
2. **凭据目录的所有权**：Linux 下 vault 是 `0600` 文件，容器内 uid 必须与挂载目录属主一致；
3. **优雅下线**：`stop()` 要发 `UnRegister`，容器必须给它留出时间。进程已经接
   `SIGTERM`（Docker 默认信号）并等待 `closeSession` 完成，但 `docker stop` 的默认
   10 秒超时对慢网络偏紧。

## 下一步

装好之后看[登录与凭据](login.md)——bot 需要一个 a1 才能上线。
