import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitepress';
import { architectureSidebar, eventsSidebar, guideSidebar, nav, onebotSidebar } from './nav.mts';

// 站点版本：优先取主仓的版本号（CI 注入 WEQBOT_VERSION），
// 独立 checkout 时退回自己的 package.json。0.0.0 是刻意的占位，见主仓 README。
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
const version = process.env.WEQBOT_VERSION ?? pkg.version;

// GitHub Pages 项目站点是 /WeqBotDocs/；本地 dev 和自定义域名是 /。
// 走环境变量而不是写死，换托管目标时只改 CI。
const base = process.env.DOCS_BASE ?? '/';

export default defineConfig({
  lang: 'zh-CN',
  title: 'WeqBot',
  description: '独立 QQ bot 框架：自己登录、自己上线，对外提供 OneBot v11',
  base,

  // 侧栏要按最近一次 commit 显示「最后更新」。
  // 注意：作为 submodule 时 .git 是文件而不是目录，VitePress 读不到主仓历史，
  // 会静默退化成空值 —— 这是接受的代价，不为此往文档仓复制一份历史。
  lastUpdated: true,

  head: [
    ['link', { rel: 'icon', type: 'image/png', href: `${base}brand/favicon-64.png` }],
    ['meta', { name: 'theme-color', content: '#0099ff' }],
  ],

  markdown: {
    lineNumbers: false,
  },

  // 内容目录就是 docs/，构建产物落在 docs/.vitepress/dist 里。
  // 不排除的话 dev server 会把自己的输出当成内容变化，无限重载。
  vite: {
    server: {
      watch: {
        ignored: ['**/.vitepress/dist/**', '**/.vitepress/cache/**'],
      },
    },
  },

  themeConfig: {
    logo: '/brand/logo-2x.png',
    siteTitle: 'WeqBot',

    nav,

    sidebar: {
      '/guide/': guideSidebar,
      '/architecture/': architectureSidebar,
      '/events/': eventsSidebar,
      '/onebot/': onebotSidebar,
    },

    outline: { level: [2, 3], label: '本页目录' },

    // 内置 MiniSearch 默认按空格切词，中文整句会被当成一个词。
    // 用 Intl.Segmenter 做词级切分，零额外依赖。
    search: {
      provider: 'local',
      options: {
        miniSearch: {
          options: {
            tokenize: (text) => {
              const seg = new Intl.Segmenter('zh-CN', { granularity: 'word' });
              return [...seg.segment(text)].filter((s) => s.isWordLike).map((s) => s.segment);
            },
          },
          searchOptions: {
            prefix: true,
            fuzzy: 0.2,
            boost: { title: 4, text: 2, titles: 3 },
          },
        },
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '没有找到结果',
            resetButtonTitle: '清除查询条件',
            footer: {
              selectText: '选择',
              navigateText: '切换',
              closeText: '关闭',
            },
          },
        },
      },
    },

    // 文档站是独立仓库（`weq-devs/WeqBotDocs`），仓库根就是 `docs/` 的内容，
    // 所以路径里**没有** `docs/` 前缀。这行在 submodule 化后无需改动。
    editLink: {
      pattern: 'https://github.com/weq-devs/WeqBotDocs/edit/main/:path',
      text: '在 GitHub 上编辑此页',
    },

    docFooter: { prev: '上一篇', next: '下一篇' },

    footer: {
      message: '版本未定（0.0.0 是占位）；文档与代码同步演进，以主仓为准',
      copyright: `WeqBot ${version}`,
    },

    lastUpdated: {
      text: '最后更新',
      formatOptions: { dateStyle: 'short', timeStyle: 'short' },
    },

    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '目录',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色',
    darkModeSwitchTitle: '切换到深色',

    socialLinks: [{ icon: 'github', link: 'https://github.com/weq-devs/WeqBot' }],
  },
});
