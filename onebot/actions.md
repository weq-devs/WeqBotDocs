<script setup>
import { data } from '../.vitepress/data/actions.data.ts';
</script>

# 动作列表

::: tip 这一页是自动生成的

内容来自 `schema/onebot-actions.json`，由 `pnpm docs:actions` 从
`packages/onebot/src/actions/` 的代码导出。**不要手改这个页面** —— 改代码后重跑脚本。

最后同步的版本：{{ data.totals.actions }} 条 action / {{ data.totals.groups }} 个分组 /
{{ data.totals.withParams }} 条有入参。

:::

## 怎么读

点开任意一条可以看完整描述与参数表。能力标记的含义：

| 标记 | 含义 |
| --- | --- |
| **始终注册** | 不依赖后端任何能力，这个部署一定有 |
| **需要后端方法** | 后端实现了列出的方法才注册，否则调用返回 `1404` |
| **按能力域判定** | 按功能域整体判定（如关掉 `qzone` 则整组不注册） |

::: warning 文档列出 ≠ 当前部署能调

注册由后端能力决定，能力不足的 action 不会注册，调用时返回 `1404`。
启动日志里的 `actions: N` 才是这个部署的真实数量。

:::

## 敏感能力

以下命令**永不注册**（即使后端实现了），属于资金类，不通过 OneBot 暴露：

<code v-for="name in data.deniedActions" :key="name" class="denied-name">{{ name }}</code>

<style scoped>
.denied-name {
  display: inline-block;
  margin: 0 6px 6px 0;
  padding: 2px 8px;
  font-size: 12px;
  color: var(--vp-c-danger-1);
  background: var(--vp-c-danger-soft, rgba(244, 63, 94, 0.1));
  border-radius: 4px;
}
</style>

## 全部动作

<ActionsExplorer :groups="data.groups" />
