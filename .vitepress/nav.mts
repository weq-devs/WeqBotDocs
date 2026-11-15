// 站点导航与侧栏的唯一来源。
//
// 只列「进站」的页面。架构 / 事件 / OneBot 三块是常青文档；
// 还没实现的功能在正文里用 `::: info 尚未实现` 标注，而不是从侧栏藏起来。

/** 顶部导航 */
export const nav = [
  { text: '使用手册', link: '/guide/', activeMatch: '/guide/' },
  { text: '运行原理', link: '/architecture/', activeMatch: '/architecture/' },
  { text: '事件推送', link: '/events/', activeMatch: '/events/' },
  { text: 'OneBot 接口', link: '/onebot/', activeMatch: '/onebot/' },
  { text: '下载', link: 'https://github.com/weq-devs/WeqBot/releases' },
  {
    text: '关于',
    items: [
      { text: '主仓库', link: 'https://github.com/weq-devs/WeqBot' },
      { text: '问题反馈', link: 'https://github.com/weq-devs/WeqBot/issues' },
      { text: 'WeQ 桌面端', link: 'https://github.com/weq-devs/WeQ' },
    ],
  },
];

/**
 * 使用手册侧栏。
 *
 * 顺序 = 用户实际会走的路径：装好 → 登录 → 配置 → 接客户端。
 * 没实现的条目照样列，正文里写明状态 —— 藏起来会让读者以为「找不到就是没有」。
 */
export const guideSidebar = [
  {
    text: '开始使用',
    collapsed: false,
    items: [
      { text: '总览', link: '/guide/' },
      { text: '下载与安装', link: '/guide/install' },
      { text: '登录与凭据', link: '/guide/login' },
      { text: '控制台', link: '/guide/console' },
      { text: '配置文件', link: '/guide/config' },
    ],
  },
  {
    text: '接入',
    collapsed: false,
    items: [
      { text: 'OneBot 客户端接入', link: '/onebot/' },
      { text: '事件推送', link: '/events/' },
    ],
  },
];

/** 运行原理侧栏：分层、会话、凭据、嵌入形态。 */
export const architectureSidebar = [
  {
    text: '运行原理',
    collapsed: false,
    items: [
      { text: '项目架构', link: '/architecture/' },
      { text: '登录与上线流程', link: '/architecture/session' },
      { text: '凭据与设备档案', link: '/architecture/credentials' },
      { text: '嵌入 WeQ（sidecar）', link: '/architecture/embedding' },
      { text: '开发与测试', link: '/architecture/development' },
    ],
  },
];

/** 事件推送侧栏。 */
export const eventsSidebar = [
  {
    text: '事件推送',
    collapsed: false,
    items: [
      { text: '总览与投递语义', link: '/events/' },
      { text: '消息事件', link: '/events/message' },
      { text: '通知事件', link: '/events/notice' },
      { text: '请求事件', link: '/events/request' },
      { text: '元事件', link: '/events/meta' },
      { text: '会话事件', link: '/events/session' },
    ],
  },
];

/** OneBot 侧栏。`actions` 页的数据由 `schema/onebot-actions.json` 自动渲染。 */
export const onebotSidebar = [
  {
    text: 'OneBot 接口',
    collapsed: false,
    items: [
      { text: '接入与网络拓扑', link: '/onebot/' },
      { text: '动作列表', link: '/onebot/actions' },
      { text: '消息段', link: '/onebot/segments' },
      { text: '错误码', link: '/onebot/errors' },
    ],
  },
];
