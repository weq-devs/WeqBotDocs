<script setup lang="ts">
/**
 * OneBot action 浏览器：分组折叠 + 搜索 + 筛选。
 *
 * 数据来自 `docs/.vitepress/data/actions.data.ts`（构建期读取主仓导出的快照），
 * 本组件**不做任何网络请求**，也不引用 `@weqbot/*`。
 *
 * 196 条一页放得下，所以不分页。默认全部展开会让页面很长，因此默认折叠，
 * 搜索时自动展开命中的分组。
 */

import { computed, ref } from 'vue';
import type { ActionEntry, ActionGroup } from '../../data/actions.data';

const props = defineProps<{ groups: ActionGroup[] }>();

const keyword = ref('');
const mode = ref<'all' | 'withParams' | 'noParams'>('all');
const onlyAvailable = ref(false);

/** 能力判定方式的中文说明。`predicate` 说明「取决于运行时的后端能力面」。 */
const GATE_LABEL: Record<string, string> = {
  always: '始终注册',
  requires: '需要后端方法',
  predicate: '按能力域判定',
};

function matches(action: ActionEntry): boolean {
  if (mode.value === 'withParams' && action.params.length === 0) return false;
  if (mode.value === 'noParams' && action.params.length > 0) return false;
  // `onlyAvailable` 语义：不依赖具体后端方法（always）的条目一定可用；
  // requires / predicate 取决于运行时，这里只能提示「可能未注册」。
  if (onlyAvailable.value && action.capability.mode !== 'always') return false;

  const terms = keyword.value.trim().toLowerCase();
  if (!terms) return true;
  const haystack = `${action.name} ${action.summary} ${action.description}`.toLowerCase();
  return terms.split(/\s+/).every((term) => haystack.includes(term));
}

const filtered = computed(() =>
  props.groups
    .map((group) => ({ ...group, actions: group.actions.filter(matches) }))
    .filter((group) => group.actions.length > 0),
);

const matchedCount = computed(() =>
  filtered.value.reduce((sum, group) => sum + group.actions.length, 0),
);

/** 折叠状态：默认折叠；有搜索词时视为全展开。 */
const collapsed = ref<Record<string, boolean>>({});

function isCollapsed(key: string): boolean {
  if (keyword.value.trim()) return false;
  return collapsed.value[key] ?? true;
}

function toggle(key: string): void {
  collapsed.value = { ...collapsed.value, [key]: !isCollapsed(key) };
}

const expanded = ref<Record<string, boolean>>({});

function toggleDetail(name: string): void {
  expanded.value = { ...expanded.value, [name]: !expanded.value[name] };
}

const total = computed(() => props.groups.reduce((sum, group) => sum + group.actions.length, 0));
</script>

<template>
  <div class="actions-explorer">
    <div class="toolbar">
      <input
        v-model="keyword"
        class="search"
        type="search"
        placeholder="搜索 action 名、摘要或描述（空格分隔多个词）"
        aria-label="搜索 action"
      />
      <div class="filters">
        <label>
          <input v-model="mode" type="radio" value="all" />
          全部
        </label>
        <label>
          <input v-model="mode" type="radio" value="withParams" />
          有入参
        </label>
        <label>
          <input v-model="mode" type="radio" value="noParams" />
          无入参
        </label>
        <label class="only-available" title="只列出不依赖后端能力的方法">
          <input v-model="onlyAvailable" type="checkbox" />
          只看恒定可用
        </label>
      </div>
      <p class="count">
        显示 {{ matchedCount }} / {{ total }} 条
        <span v-if="matchedCount !== total" class="hint">（已筛选）</span>
      </p>
    </div>

    <p v-if="matchedCount === 0" class="empty">没有匹配的 action。</p>

    <section v-for="group in filtered" :key="group.key" class="group">
      <button class="group-title" type="button" @click="toggle(group.key)">
        <span class="chevron" :class="{ open: !isCollapsed(group.key) }">▸</span>
        {{ group.label }}
        <code class="group-key">{{ group.key }}</code>
        <span class="group-count">{{ group.actions.length }}</span>
      </button>

      <div v-show="!isCollapsed(group.key)" class="group-body">
        <article
          v-for="action in group.actions"
          :key="action.name"
          class="action"
          :class="{ denied: action.denied }"
        >
          <header class="action-head">
            <code class="action-name">{{ action.name }}</code>
            <span class="action-summary">{{ action.summary }}</span>
            <span class="gate" :class="`gate-${action.capability.mode}`">
              {{ GATE_LABEL[action.capability.mode] }}
            </span>
            <button
              v-if="action.params.length"
              class="toggle-detail"
              type="button"
              @click="toggleDetail(action.name)"
            >
              {{ action.params.length }} 个入参
              <span class="chevron" :class="{ open: expanded[action.name] }">▸</span>
            </button>
            <span v-else class="no-params">无入参</span>
          </header>

          <p v-if="expanded[action.name]" class="action-desc">{{ action.description }}</p>

          <div v-if="expanded[action.name]" class="params">
            <table>
              <thead>
                <tr>
                  <th>参数</th>
                  <th>必填</th>
                  <th>类型与说明</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="param in action.params" :key="param">
                  <td><code>{{ param }}</code></td>
                  <td>
                    <span v-if="action.required.includes(param)" class="req">必填</span>
                    <span v-else class="opt">可选</span>
                  </td>
                  <td>
                    <SchemaView
                      :schema="
                        (action.inputSchema.properties as Record<string, Record<string, unknown>>)[
                          param
                        ] ?? {}
                      "
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            <p
              v-if="
                (action.inputSchema as Record<string, unknown>).additionalProperties === true
              "
              class="additional"
            >
              允许额外字段（OneBot 客户端常带 <code>auto_escape</code> 等兼容参数，不计入上表）。
            </p>
            <div
              v-if="action.capability.mode === 'requires'"
              class="capability-detail"
            >
              需要后端实现：
              <code
                v-for="method in action.capability.requires"
                :key="method"
                class="cap-method"
                >{{ method }}</code
              >
            </div>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.actions-explorer {
  margin-top: 16px;
}

.toolbar {
  position: sticky;
  top: var(--vp-nav-height);
  z-index: 10;
  padding: 12px 0;
  background: var(--vp-c-bg);
  border-bottom: 1px solid var(--vp-c-divider);
}

.search {
  width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-alt);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
}

.search:focus {
  border-color: var(--vp-c-brand-1);
  outline: none;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 8px;
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.filters label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.only-available {
  margin-left: auto;
}

.count {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--vp-c-text-3);
}

.hint {
  color: var(--vp-c-brand-1);
}

.empty {
  padding: 24px 0;
  color: var(--vp-c-text-3);
  text-align: center;
}

.group {
  margin-top: 20px;
}

.group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  text-align: left;
  cursor: pointer;
  background: none;
  border: none;
}

.chevron {
  display: inline-block;
  font-size: 11px;
  color: var(--vp-c-text-3);
  transition: transform 0.15s;
}

.chevron.open {
  transform: rotate(90deg);
}

.group-key {
  font-size: 11px;
  font-weight: 400;
  color: var(--vp-c-text-3);
}

.group-count {
  padding: 1px 7px;
  margin-left: auto;
  font-size: 12px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-default-soft);
  border-radius: 10px;
}

.action {
  padding: 10px 0;
  border-bottom: 1px solid var(--vp-c-divider);
}

.action:last-child {
  border-bottom: none;
}

.action-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;
}

.action-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-brand-1);
}

.action-summary {
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.gate {
  padding: 1px 6px;
  font-size: 11px;
  border-radius: 4px;
}

.gate-always {
  color: var(--vp-c-green-1, #10b981);
  background: var(--vp-c-green-soft, rgba(16, 185, 129, 0.1));
}

.gate-requires,
.gate-predicate {
  color: var(--vp-c-text-3);
  background: var(--vp-c-default-soft);
}

.toggle-detail {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  margin-left: auto;
  font-size: 11px;
  color: var(--vp-c-text-2);
  cursor: pointer;
  background: var(--vp-c-default-soft);
  border: none;
  border-radius: 4px;
}

.toggle-detail:hover {
  color: var(--vp-c-brand-1);
}

.no-params {
  margin-left: auto;
  font-size: 11px;
  color: var(--vp-c-text-3);
}

.action-desc {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--vp-c-text-2);
}

.params {
  margin-top: 10px;
  overflow-x: auto;
}

.params table {
  width: 100%;
  font-size: 13px;
  border-collapse: collapse;
}

.params th {
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--vp-c-text-3);
  text-align: left;
  border-bottom: 1px solid var(--vp-c-divider);
}

.params td {
  padding: 8px 10px;
  vertical-align: top;
  border-bottom: 1px solid var(--vp-c-divider);
}

.params td:first-child {
  white-space: nowrap;
}

.req {
  color: var(--vp-c-danger-1);
  font-size: 12px;
}

.opt {
  color: var(--vp-c-text-3);
  font-size: 12px;
}

.additional {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--vp-c-text-3);
}

.capability-detail {
  margin-top: 8px;
  font-size: 12px;
  color: var(--vp-c-text-3);
}

.cap-method {
  margin-left: 4px;
  font-size: 11px;
}
</style>
