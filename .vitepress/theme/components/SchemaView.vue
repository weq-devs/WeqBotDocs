<script setup lang="ts">
/**
 * 递归渲染一份 JSON Schema（OpenAPI 3.1 风格）。
 *
 * 只覆盖 `action-metadata.ts` 里实际会产出的小工具子集：
 * `int` / `str` / `bool` / `arrayOf` / `object` / `enumOf` / `stringOrArray` / `messageSchema`
 * 以及它们的组合。**不追求通用 JSON Schema 渲染** —— 遇到不认识的写法就降级成
 * 「原始类型 + description」，而不是猜。
 */

import { computed } from 'vue';

const props = defineProps<{ schema: Record<string, unknown> }>();

/** schema 的类型标签：`type` 优先，其次从 `anyOf` / `enum` 推。 */
const typeLabel = computed(() => {
  const schema = props.schema;
  const type = schema.type;
  if (typeof type === 'string') {
    if (type === 'array') {
      const items = schema.items as Record<string, unknown> | undefined;
      const inner = typeof items?.type === 'string' ? items.type : 'any';
      return `array<${inner}>`;
    }
    return type;
  }
  if (Array.isArray(schema.anyOf)) {
    const parts = (schema.anyOf as Record<string, unknown>[])
      .map((branch) => (typeof branch.type === 'string' ? branch.type : 'any'))
      .filter((value, index, all) => all.indexOf(value) === index);
    return parts.length > 0 ? parts.join(' | ') : 'any';
  }
  if (Array.isArray(schema.enum)) return 'enum';
  return 'any';
});

const description = computed(() =>
  typeof props.schema.description === 'string' ? props.schema.description : '',
);

/** 值得单独列出来的约束；`description` / `type` / `required` 已在别处渲染。 */
const constraints = computed(() => {
  const out: string[] = [];
  const schema = props.schema;
  if (typeof schema.minimum === 'number') out.push(`≥ ${schema.minimum}`);
  if (typeof schema.maximum === 'number') out.push(`≤ ${schema.maximum}`);
  if (typeof schema.minLength === 'number') out.push(`长度 ≥ ${schema.minLength}`);
  if (typeof schema.minItems === 'number') out.push(`至少 ${schema.minItems} 项`);
  if (typeof schema.default !== 'undefined') out.push(`默认 ${JSON.stringify(schema.default)}`);
  return out;
});

const enumValues = computed(() => {
  const values = props.schema.enum;
  if (!Array.isArray(values)) return [];
  return values.map((value) => JSON.stringify(value));
});

/** 嵌套对象：`properties` 有内容就展开一层。 */
const children = computed(() => {
  const properties = props.schema.properties;
  if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) return [];
  const required = Array.isArray(props.schema.required) ? (props.schema.required as string[]) : [];
  return Object.entries(properties as Record<string, Record<string, unknown>>).map(
    ([name, fieldSchema]) => ({
      name,
      required: required.includes(name),
      schema: fieldSchema,
    }),
  );
});

/** 数组元素的 schema（用于 `arrayOf` 有 items 描述时）。 */
const itemSchema = computed(() => {
  const items = props.schema.items;
  if (typeof items !== 'object' || items === null || Array.isArray(items)) return null;
  return items as Record<string, unknown>;
});
</script>

<template>
  <div class="schema-view">
    <div class="schema-line">
      <code class="schema-type">{{ typeLabel }}</code>
      <span v-if="description" class="schema-desc">{{ description }}</span>
    </div>

    <div v-if="constraints.length" class="schema-constraints">
      <span v-for="constraint in constraints" :key="constraint" class="schema-constraint">
        {{ constraint }}
      </span>
    </div>

    <div v-if="enumValues.length" class="schema-enum">
      可选值：<code v-for="value in enumValues" :key="value" class="schema-enum-value">{{
        value
      }}</code>
    </div>

    <ul v-if="children.length" class="schema-children">
      <li v-for="child in children" :key="child.name">
        <code class="schema-field">{{ child.name }}</code>
        <span v-if="child.required" class="schema-required" title="必填">*</span>
        <SchemaView :schema="child.schema" />
      </li>
    </ul>

    <div v-else-if="itemSchema" class="schema-items">
      元素：<SchemaView :schema="itemSchema" />
    </div>
  </div>
</template>

<style scoped>
.schema-view {
  font-size: 13px;
  line-height: 1.6;
}

.schema-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
}

.schema-type {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-2);
  font-size: 12px;
}

.schema-desc {
  color: var(--vp-c-text-2);
}

.schema-constraints {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

.schema-constraint {
  color: var(--vp-c-text-3);
  font-size: 12px;
}

.schema-enum {
  margin-top: 2px;
  color: var(--vp-c-text-2);
  font-size: 12px;
}

.schema-enum-value {
  margin-left: 4px;
}

.schema-children {
  margin: 4px 0 0;
  padding-left: 16px;
  list-style: none;
  border-left: 1px solid var(--vp-c-divider);
}

.schema-children > li {
  margin: 4px 0;
}

.schema-field {
  margin-right: 4px;
  color: var(--vp-c-brand-1);
  font-size: 12px;
}

.schema-required {
  margin-right: 4px;
  color: var(--vp-c-danger-1);
  font-weight: 600;
}

.schema-items {
  margin-top: 2px;
  padding-left: 16px;
  color: var(--vp-c-text-2);
  font-size: 12px;
}
</style>
