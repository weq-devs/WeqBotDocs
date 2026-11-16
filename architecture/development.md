# 开发与测试

## 命令

```bash
pnpm install
pnpm verify          # 架构护栏 + 全量类型检查 + 文档快照一致性 + 契约测试
pnpm typecheck       # 只跑类型检查
pnpm test            # 只跑测试
pnpm lint            # biome
pnpm check:pure-ts   # 只跑架构护栏
pnpm dev:cli --help  # 源码直接跑（tsx）
```

`pnpm verify` 是提交前应该跑的那一条——它串联了四道门禁，任一道失败都会中断。

## 架构护栏

`scripts/check-pure-ts.mjs`，规则见[项目架构](index.md#两条结构性约束)。要点：

- 除 `packages/node` 外不得出现 `.node` / `process.dlopen` / `createRequire`；
- 不得依赖 `@weq/*`；
- 依赖只能按 `LAYERS` 表的方向走；
- 不得 import `@weqbot/node`。

新增一个包时**必须**同时改 `LAYERS`，否则它会被当成「没有 src 目录」跳过，护栏形同虚设。

## 测试约定

用 Node 内置的 `node:test`，不用 vitest：

```bash
pnpm test
```

测试文件在 `packages/*/test/*.test.ts`，通过 `node --import tsx --test` 跑。

### 契约测试优先

大部分测试验证的是**契约不漂移**，而不是业务逻辑：

| 测试 | 守什么 |
| --- | --- |
| `action-docs.test.ts` | 每条 action 都有元数据，没有多余登记 |
| `actions-snapshot.test.ts` | `schema/onebot-actions.json` 与代码一致 |
| `event-converter.test.ts` | `BotEvent` → OneBot post 的映射不变 |
| `segments.test.ts` | 协议元素 ⇄ OneBot 消息段的双向表 |
| `network.test.ts` | 鉴权、角色、单帧上限 |

这类测试的价值在于：改代码的人会被强制做一次「你到底改了没改对外形状」的决定。

### 不碰真环境

测试里不联网、不读真 QQ 数据、不需要原生组件。需要协议形状的用假数据。

真机验证是另一条路，见下面的「真机验证」。

## OneBot 文档快照

OneBot 的 action 文档**不手写**，由代码生成：

```bash
pnpm docs:actions          # 生成 schema/onebot-actions.json
pnpm docs:actions:check    # 只校验是否最新（CI 用）
```

改了 action 的 `summary` / `description` / `inputSchema` 后必须重跑，否则
`actions-snapshot.test.ts` 和 `pnpm verify` 都会红。

::: warning 新增 action 模块要改两处

1. 在 `packages/onebot/src/actions/index.ts` 的 `ALL_ACTIONS` 里拼进新模块；
2. 在 `packages/onebot/src/docs/snapshot.ts` 的 `GROUPS` 里加一行分组映射。

漏掉第二处会被 `actions-snapshot.test.ts` 的「分组不漏」用例发现。

:::

为什么快照提交在**主仓**而不是文档仓：文档站是独立仓库，读不到源码；放在主仓则「改 action」
与「更新文档数据」是同一个 PR 的两行，漂移在 CI 里直接红灯。

## 文档站

```bash
pnpm docs:dev      # http://127.0.0.1:5175
pnpm docs:build    # 静态构建到 docs/.vitepress/dist
```

内容目录就是 `docs/` 本身。快照查找顺序（`docs/.vitepress/data/actions.data.ts`）：

1. `WEQBOT_ACTIONS_FILE` 环境变量；
2. `docs/data/actions.json`（独立 checkout 时 CI 落的）；
3. `../schema/onebot-actions.json`（主仓内直接开发）。

## 真机验证

需要真账号、真网络、真好友的用例不写在 `test/` 里。

```bash
pnpm dev:cli --account <uin> --config <path> --verbose
pnpm smoke:onebot --url ws://127.0.0.1:6700 --self <uin>          # 只读
pnpm smoke:onebot --url ws://127.0.0.1:6700 --self <uin> --send   # 含真实发消息
```

`smoke:onebot` 输出一张 PASS / FAIL / SKIP 表。`--readonly` 连幂等写操作也跳过，
保证脚本里没有任何非 GET 语义的调用。

## 日志

```bash
pnpm dev:cli --account <uin>              # info 级（默认）
pnpm dev:cli --account <uin> --verbose    # debug 级
pnpm dev:cli --account <uin> --trace      # trace：完整打印收发包
```

五级：`trace` < `debug` < `info` < `warn` < `error`。终端输出带颜色（非 TTY 或
`NO_COLOR` 时自动关闭），格式是 `HH:MM:SS LEVEL [scope] 消息 {字段}`。

### 落盘

终端之外同时写文件，默认落在 `./logs/`：

```text
logs/weqbot-2026-11-16.log   # 按天，级别 >= WEQBOT_LOG_FILE_LEVEL（默认 debug）
logs/native.log              # nt_helper 自己的日志（含签名 / 发包含 hex 的调试行）
```

| 环境变量 | 说明 |
| --- | --- |
| `WEQBOT_LOG_DIR` | 改落盘目录；设为 `off` 关闭落盘 |
| `WEQBOT_LOG_LEVEL` | 终端级别（`--verbose` / `--trace` 会覆盖它） |
| `WEQBOT_LOG_FILE_LEVEL` | 落盘级别，默认 `debug` |

`trace` **不落盘**：它是按包计的高流量流（发包 / 回包 hex，不脱敏），只进终端和
WebUI 观测缓冲。原生组件的日志也永远走文件 —— 终端只留我们自己的分级日志。

`createLogger(module)`，模块名会出现在每行前缀里；`log.child('event')` 派生
`bot.event` 这样的子 scope。日志写失败（只读挂载 / 磁盘满）只报一次，不影响业务。

::: tip stdout 是有语义的

sidecar 模式下 **stdout 是协议流**，日志走 stderr。不要把调试输出写到 stdout。

:::

## 提交约定

Conventional Commits，描述可以用中文：

```text
feat(onebot): 为全部 action 补充文档描述与入参 schema
fix(bot,protocol): 补齐加群请求处理与出站媒体 URL 源
```

版本号未定，`0.0.0` 只是占位。**不要**在功能提交里顺手改版本号。

## 发版

只在准备发版时统一改版本号，不要在功能提交里手改：

```bash
pnpm version:set 0.1.0   # 根 package.json + packages/* + docs
pnpm i                   # 刷新 lockfile
git commit -am "chore(release): v0.1.0"
git tag v0.1.0
git push origin main --tags
```

推送 `v*` tag 会触发 `.github/workflows/release.yml`：先跑 `pnpm verify`，再构建
五平台 × 两变体，最后创建 GitHub Release。Release 正文包含下载 / 校验说明，并自动
追加 GitHub 生成的 commit / PR 变更列表。带 `-` 的版本（如 `v0.2.0-beta.1`）会标成
预发布。需要重跑时，在 Actions 页面手动指定已存在的 tag 即可。
