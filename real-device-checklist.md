# 真机验证清单（一次跑完）

> 目标：一次真机窗口把 P2.5 / P3 / P4 里**只有真机才能出结论**的项全跑完。
> 预计 40–60 分钟（含发消息与拔网线）。
> 每一步都标了它验的是哪个 V 编号，跑完把结论回填 `TODO.md` §11。

---

## 0. 准备

### 0.1 原生产物

```bash
mkdir -p /tmp/weqbot-native
cp ../nt_helper/index.linux-x64-gnu.node /tmp/weqbot-native/nt_helper.node
export WEQBOT_NATIVE_DIR=/tmp/weqbot-native
```

> 正式分发时是 `native/<platform>-<arch>/weqbot.node`；这里只是借用 WeQ 的 full 产物。

### 0.2 配置文件

```bash
cp docs/config.example.json /tmp/weqbot.json
# 按需改 wrapperPath / dbPath / onebot 端口
```

`--config` 现在会**校验键名和凭据字段**：写错 `oneBot`、或把 `a1` 写进 JSON 会直接报错退出（不会静默失效）。

### 0.3 确认 a1 有效

a1 失效会返回 `140022015`，后面所有步骤都跑不了。先确认 vault 里有可用凭据：

```bash
pnpm dev:cli --account <uin> --config /tmp/weqbot.json --check
```

---

## 1. 启动 bot（后台留一个终端）

```bash
pnpm dev:cli --account <uin> --config /tmp/weqbot.json --verbose 2>&1 | tee /tmp/weqbot.log
```

起来后应看到：

```text
[info] cli: bot 已上线 {"uin":"…","onebot":{"port":6700,"actions":N}}
```

`actions` 的 N 是注册成功的 action 数，**记下这个数字**（回归时对比）。

---

## 2. 一键冒烟（只读部分，约 30 秒）

另开终端：

```bash
pnpm smoke:onebot --url ws://127.0.0.1:6700 --self <uin>
```

覆盖：

| 用例                                                      | V       |
| --------------------------------------------------------- | ------- |
| `get_version_info` / `get_status`（`time` 应 > 0）        | 本地    |
| `get_login_info`                                          | V35     |
| `get_friend_list`（0xfd4_1 分页 + 字段完整性）            | **V31** |
| `get_group_list`（0xfe5_2）                               | **V31** |
| `get_group_member_list`（0xfe7_3 token 分页）             | **V31** |
| `get_group_info`                                          | V31     |
| `get_stranger_info`（新 `FetchUserProfile` 0xfe1_2）      | 资料    |
| `get_msg` 回查（先把 `--self` 换成会让 bot 收消息的场景） | V35     |
| `set_group_whole_ban(false)`（幂等）                      | 写      |

冒烟脚本里还有「5 秒内收到消息」这一条：**跑之前先让群里有人发一句话**。

---

## 3. 媒体：入站（V32 的一半）

脚本测不了「图能不能下载」，要人工看：

1. 用另一台设备 / 手机给 bot 发**一张图**（私聊 + 群各一张）和**一条语音**。
2. 看 `/tmp/weqbot.log` 里的消息事件；
3. 从任何 OneBot 客户端订阅事件，检查 `message` 段：

```json
{
  "type": "image",
  "data": {
    "file": "xxx.png",
    "url": "https://multimedia.nt.qq.com.cn/download?appid=…&fileid=…&spec=0&rkey=…"
  }
}
```

**判定**：把 `url` 直接粘进浏览器能出图 = 通过。

- 群图 `appid` 应是 **1407**，私聊图 **1406**。
- `url` 空串 = rkey 没取到，日志里会有「取下载 rkey 失败」。

> 注意：**入站图片 URL 不会自动下载**，只是一个拼好的链接；`file` 字段是文件名。

---

## 4. 发送 / 撤回（需要你授权真实发消息）

```bash
pnpm smoke:onebot --url ws://127.0.0.1:6700 --self <uin> \
  --send --peer <好友QQ> --group <群号> --image-path /tmp/test.png
```

会依次做：私聊文本 → 群文本 → 群 at+face → 群图片 → 私聊撤回 → 群撤回。

其中两条是**本轮刚修的东西**，重点看：

- **群图片**（V32 出站）：之前一定会抛「需要 params.media」，现在应发送成功。
- **私聊撤回**：之前 `random` 恒为 0，撤不掉；现在从 `contentHead.msgId` 取。若撤回失败，日志里会有 `撤回私聊需要…` 或服务端 `result != 0`。

---

## 5. 消息语义（回环 / 去重）

这几条脚本测不了，要人工配合：

| 步骤                                                                                             | 结论写哪 |
| ------------------------------------------------------------------------------------------------ | -------- |
| 用 **QQ 本体**给 bot 发一条消息，看 bot 是否把**自己发出的那条**也当事件推出来（`message_sent`） | **V33**  |
| 换一台设备（手机）也登录同一账号，同一条消息观察是否收到两次                                     | **V34**  |
| 在群里 @bot 并引用一条消息，看 `reply` / `at` 段是否带对                                         | V48      |

`reportSelfMessage: true` 时自身消息会被推成 `message_sent`，这是 OneBot 语义，不是 bug；要确认的是**没有回环**（bot 不会把自己的消息再发一遍）。

---

## 6. 会话生命周期（V42 / V43 / P3 遗留）

### 6.1 拔网线

1. `sudo iptables -I OUTPUT -m owner --uid-owner $(id -u) -j DROP`（或直接断网）
2. 观察日志：`degraded` → 重连退避 1/2/4/8/16s
3. 恢复网络：应回到 `online`

**V42**：退避耗尽后应看到 `closed(reason="reconnect-failed")` 且**不再自己重登**（`createBot` 直接 `stop('relogin-failed')`）。

### 6.2 重启进程

`Ctrl-C` 后重新起同一条命令，应直接回到 `online`（不需要重新扫码 / 登录）。

### 6.3 慢同步窗口（V43）

如果你有「登录特别慢」的账号：观察 native 15s 后是否返回 `registered=true/synced=false`，之后 `syncGraceMs` 窗口内是否收敛成 online。**记下实际耗时**——这个数字一直没人测过。

---

## 7. 登录期诊断（V30）

```bash
# 先让 QQ 本体登录着，拿 pid
WEQBOT_NATIVE_DIR=/tmp/weqbot-native \
  pnpm dev:cli --print-capabilities --qq-pid <pid> --account <uin>
```

期望：

```text
secToken: present
secTokenSource: session-map        # Linux；Windows 是 session-record，macOS 是 uin
secTokenTtl: 170000s
```

**再故意传一个别的 uin**：应返回 `secToken: missing`（权威地「没有」），而不是拿堆里的残留冒充。

这就是 **V52 的三端验收口径**；Windows / macOS 各跑一次。

`uid`（V30）目前只能从登录日志看（`quickLogin` 回传），与 `AccountConfig.uid` 比对。

---

## 7.5 顶号实验（V5，已做，2026-11-14）

结论：**不互踢，可双端同时在线**。脚本 `scripts/v5-takeover-probe.mjs`（绕过
`createBot` 的 `isQqLoggedIn` 红线，直接调 native）。

```bash
node scripts/v5-takeover-probe.mjs --uin <uin> --native /tmp/weqbot-native/nt_helper.node \
  --msg-db ~/.config/QQ/nt_qq_<hash>/nt_db/nt_msg.db --hold-ms 30000
```

判定要点（光看进程存活不够）：

- `probeDbLock` 的 QQ holder 是否变化
- `ss -tinp | grep pid=<QQ>` 的 `lastrcv` / `lastsnd` 是否还在更新（**这是关键**）
- `nt_msg.db-wal` 是否停止增长（注意：没新消息时本来就不涨，不能单看这个）
- `openSession` 返回的 `registered` / `synced`

⚠️ 实验会轮换 a1（`quickLogin` 行为）。`createBot` 会写回 vault，直调 native 不会，
所以实验账号的 a1 仍以 vault / `login.db` 里的为准。

---

## 8. 并发占位（V39，产品红线）

同时起两个进程（或同一进程并发两次 `openSession(mode=2)`）：

```bash
pnpm dev:cli --account <uin> --config /tmp/weqbot.json &
sleep 1
pnpm dev:cli --account <uin> --config /tmp/weqbot.json
```

第二个应报 `ALREADY_ONLINE` 或 `140022015`（取决于占位与 QQ 本体状态），**不能两个都 `online`**。

---

## 9. 结果回填

把每项结论写回 `TODO.md` §11 的对应行（`✅ 日期 + 现象`），并更新 §12 的勾选框。特别是：

- V31 / V32 / V35 通过 → P4 可以标「真机验收」
- V33 / V34 有结论 → 决定 P4 要不要加去重
- V42 / V43 → 记下实际耗时
- V30 / V39 → 产品红线，必须留证据

---

## 附：本轮改动对应的验证重点

| 本轮改的东西                                         | 在哪一步验       |
| ---------------------------------------------------- | ---------------- |
| `--config` 加载（新增）                              | 0.2 / 2          |
| 媒体入站 `media-url.ts`（新增）                      | 3                |
| 媒体出站 `params.media`（新增）                      | 4                |
| 入站 `random` 修复                                   | 4 的私聊撤回     |
| `get_stranger_info`（新 `FetchUserProfile`）         | 2                |
| `set_friend_add_request` / `set_group_special_title` | 需真人触发，见下 |
| `get_status` / `get_version_info`                    | 2                |

`set_friend_add_request`：找个小号加 bot 好友，在客户端 `approve=true`。
`set_group_special_title`：给自己或群友设一个头衔（`duration` 省略 = 永久）。
这两条没进冒烟脚本——它们需要真实的人际动作，没法自动造。
