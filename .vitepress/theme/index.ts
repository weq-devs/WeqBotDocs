import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import ActionsExplorer from './components/ActionsExplorer.vue';
import SchemaView from './components/SchemaView.vue';
import './style/onebot.css';

/**
 * 文档站主题：默认主题 + 两个 OneBot 组件。
 *
 * 组件通过 `app.component` 全局注册，Markdown 里直接写 `<ActionsExplorer>`
 * 而不用在每个页面 import —— 与 WeQ 文档站的做法一致。
 */
export default {
  extends: DefaultTheme,

  enhanceApp({ app }) {
    app.component('ActionsExplorer', ActionsExplorer);
    app.component('SchemaView', SchemaView);
  },
} satisfies Theme;
