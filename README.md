# WeqBot 文档站

[WeqBot](https://github.com/weq-devs/WeqBot) 的文档源文件，用 [VitePress](https://vitepress.dev/) 构建。

## 内容

| 目录 | 内容 |
| --- | --- |
| `guide/` | 使用手册：下载安装、登录与凭据、配置文件 |
| `architecture/` | 运行原理：项目架构、登录流程、凭据、嵌入 WeQ、开发 |
| `events/` | 事件推送：语义层 `BotEvent` 的完整说明 |
| `onebot/` | OneBot v11 接口：接入、动作列表、消息段、错误码 |

## 本地预览

```bash
pnpm install
pnpm dev      # http://127.0.0.1:5175
pnpm build
```

## OneBot 动作列表是自动生成的

`onebot/actions.md` 的数据来自 `data/actions.json`，**不要手改**。它的权威来源在主仓：

```bash
# 在 WeqBot 主仓
pnpm docs:actions        # 生成 schema/onebot-actions.json
```

CI 会在构建前把主仓的快照拉到 `data/actions.json`。本地开发时如果 `data/actions.json`
不存在，数据加载器会回退到主仓内的 `../schema/onebot-actions.json`（仅当本仓库嵌在
WeqBot 里作为 `docs/` 子目录时有效）。

要指定快照位置：

```bash
WEQBOT_ACTIONS_FILE=/path/to/onebot-actions.json pnpm dev
```

## 这个仓库与主仓的关系

它是 WeqBot 的 `docs/` 目录（submodule）。改文档时：

- 直接在主仓的 `docs/` 里改，提交会同时更新 submodule 指针；
- 或者在本仓库单独提交，再回主仓提交指针更新。

内容本身与主仓代码同步演进 —— 已实现与未实现在正文里逐条标注，不靠页面是否存在区分。
