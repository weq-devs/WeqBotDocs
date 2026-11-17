# 控制台（WebUI）

控制台是 WeqBot 的自带管理界面：登录账号、看运行状态、改 OneBot 网络、翻日志、手调 action。
它由 `@weqbot/node` 直接托管，不需要单独部署前端。

## 启动

```bash
weqbot                                   # 只起控制台，等你在浏览器里选账号
weqbot --account <uin> --config <cfg>    # 先上线，再提供控制台
weqbot --account <uin> --no-webui        # 纯 CLI，不开控制台
```

启动后终端会打印：

```text
  WeqBot 控制台已启动
  打开：http://127.0.0.1:6299/#token=wqb_xxxxxxxxxxxxxxxxxxxxxxxx
  令牌：wqb_xxxxxxxxxxxxxxxxxxxxxxxx
```

打开那个链接即可 —— 令牌在 URL 的 hash 里，**不会发给服务端**，页面读完立刻把它从地址栏抹掉。
令牌只打印在终端，不进日志、不进任何 HTTP 响应。

| 选项 / 环境变量 | 说明 |
| --- | --- |
| `--webui-port <port>` | 端口，默认 `6299` |
| `--webui-host <host>` | 监听地址，默认 `127.0.0.1`；改成非回环时启动会告警 |
| `WEQBOT_WEBUI_TOKEN` | 固定令牌（默认每次启动随机生成并打印） |

终端只留上面那个横幅。原生组件加载、WebUI 监听这些细节在 `--verbose`（或
`--trace`）下才输出，并且默认同时写到 `./logs/`（见[开发与测试](../architecture/development.md#日志)）。
`--trace` 会把收发包的完整 hex 打到终端 —— 排查协议用，内容不脱敏。

## 安全边界

这个端口后面是完整的 QQ 账号能力，所以边界写死在服务里：

- **只监听回环**（`127.0.0.1` / `localhost`）。监听别的地址必须显式配置，且启动时告警。
- **Host 校验**：只认 `127.0.0.1:<port>` / `localhost:<port>`，防 DNS rebinding
  （攻击者的域名解析到 127.0.0.1 时，浏览器发来的 `Host` 会是他的域名）。
- **写请求再校验 Origin**：跨站表单 / fetch 一律 403。
- **访问令牌**：`wqb_` + 24 位 base62，常量时间比较；连续 5 次错误锁 30 秒。
  会话是 HttpOnly + SameSite=Strict cookie，前端拿不到。
- **CSP `default-src 'self'`**：页面里没有 inline script，头像走后端同源代理
  （`/api/avatar/:uin`，只允许 qlogo 域名，防 SSRF）。
- **敏感值脱敏**：日志与 action 参数里的 skey / pskey / cookie / clientKey / a1 / secToken
  在写进观测缓冲前就替换成 `***`。

## 页面

| 页面 | 作用 |
| --- | --- |
| 访问令牌 | 用终端打印的令牌换浏览器会话 |
| 账号登录 | 三个 tab：「已保存」（vault 里的凭据）/「QQ 记录」（本机 `login.db`）/「扫码登录」。两个账号列表都只列**能直接上线**的条目；没有 a1 的记录不列出。a1 失效会自动清掉「已保存」那条并跳到扫码页 |
| 总览 | 账号主卡、收 / 发消息、action 调用与成功率、心跳 RTT、OneBot 各网络状态、会话时间线、调用最多的 action |
| 网络 | 四类网络（HTTP 服务端 / HTTP 上报 / 正向 WS / 反向 WS）的启停、抽屉编辑、全局 qzone 开关；保存后只重启 OneBot 适配器，**账号保持在线** |
| 日志 | 三条流（运行日志 / action 调用 / 推送事件）+ 统计头 + 详情抽屉 |
| 调试 | 按域分组的 action 列表、参数 JSON、响应；写操作需二次确认 |
| 设置 | 环境检查卡（QQ 安装 / wrapper / 客户端身份 / 数据目录 / `login.db` / `nt_msg.db` / QQ 本体是否在线）、日志落盘、运行信息 |

### 环境检查与手动指定路径

环境检查卡上的每一项都带**来源标记**：`手动` / `环境变量` / `协议注册` / `注册表` / `Spotlight` / `自动`。
来源是自动探测但结果是错的（或者干脆找不到）时，在「安装目录」和「数据根」两个输入框里直接填路径：

- 可以在**设置页填写**，保存后会写回 `--config` 指向的配置文件（`qq.installDir` / `qq.dataDir`）；
- 也可以设环境变量：`WEQBOT_QQ_INSTALL_DIR`（安装根）、`WEQBOT_QQ_ROOT`（数据根）。

优先级是 **设置页 / 配置 > 环境变量 > 自动探测**。填错层级不会报错 —— 比如把
`resources/app` 当成安装根、或者把某个 `nt_qq_<hash>` 账号目录当成数据根，服务端会自动归一化到
正确的那一层。只有路径确实不存在才会返回 400。

右上角的「重新检查」会跳过 30 秒的探测缓存立即重算：换过 QQ 安装目录、重装过 QQ、或者刚插上
数据盘时用它，不用重启进程。

账号菜单里三个动作是**分开**的：

- **退出登录**：让 QQ 账号下线（发 `UnRegister`），控制台回到登录页；
- **退出并删除本机凭据**：同上，并删掉 vault 里这个账号的 a1；
- **退出控制台**：只清浏览器会话，**账号不下线**。

## 开发前端

```bash
pnpm dev:webui                              # vite dev server，/api 代理到 127.0.0.1:6299
VITE_WEBUI_MOCK=1 pnpm dev:webui            # 脱离后端看界面（mock 数据）
pnpm build:webui                            # 构建 dist/，由控制台服务托管
```

前端不 import 任何 `@weqbot/*` 运行时包（`check-pure-ts` 的 `LAYERS` 记为 `[]`），
它与后端的契约只在 `packages/webui/src/api/types.ts`。

## 配置落点

网络页保存时：

1. 先停旧适配器 → 按新配置起；起不来会**回滚**上一份并报错（不能因为改错端口把 OneBot 面搞没）；
2. 成功后才写回 `--config` 指定的文件 —— 只替换 `onebot` 这一块，其余键原样保留，
   用 `.tmp` + rename 原子写。
