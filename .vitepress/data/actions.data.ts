/**
 * OneBot action 快照的数据源。
 *
 * ## 为什么读文件而不是 import 包
 *
 * 文档站要能**独立构建**（它将来是 `weq-devs/WeqBotDocs` 这个独立仓库），
 * 不能 `import '@weqbot/onebot'` —— 那会把整个协议栈和它的依赖拖进构建。
 * 所以只消费主仓导出的 `schema/onebot-actions.json` 快照。
 *
 * ## 三处查找顺序（这是 submodule 化的关键）
 *
 * 1. `WEQBOT_ACTIONS_FILE` —— CI 显式指定，最可靠；
 * 2. `docs/data/actions.json` —— 独立 checkout 时 CI 从主仓拉下来放在这里；
 * 3. `../schema/onebot-actions.json` —— 在主仓里直接 `pnpm docs:dev` 时，
 *    `docs/` 的上一级就是主仓根。
 *
 * ⚠️ 不要写成「往上找 N 级」。`docs/` 在主仓里和在 submodule 里**上溯深度相同**，
 * 但两种 checkout 的仓库边界不同，硬编码级数会让其中一种静默读到错误文件
 * （WeQ 的 `supported-versions.data.ts` 就踩了这个坑）。所以这里只探**两个**
 * 明确的相对位置，都找不到就报出可操作的错误。
 *
 * 快照的权威来源始终是主仓的 `pnpm docs:actions`；这里只是读者。
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 与 `packages/onebot/src/docs/snapshot.ts` 的 `ActionsSnapshot` 对应（此处只声明消费用到的字段）。 */
export interface ActionsSnapshot {
  version: number;
  generatedFrom: string;
  totals: { actions: number; groups: number; withParams: number };
  deniedActions: string[];
  groups: ActionGroup[];
}

export interface ActionGroup {
  key: string;
  label: string;
  actions: ActionEntry[];
}

export interface ActionEntry {
  name: string;
  summary: string;
  description: string;
  inputSchema: Record<string, unknown>;
  params: string[];
  required: string[];
  denied: boolean;
  capability: { mode: 'always' } | { mode: 'requires'; requires: string[] } | { mode: 'predicate' };
}

const here = dirname(fileURLToPath(import.meta.url));

/** `docs/` 根目录（`data/` → `.vitepress/` → `docs/`）。 */
const docsRoot = resolve(here, '..', '..');

function candidates(): string[] {
  const list: string[] = [];
  const fromEnv = process.env.WEQBOT_ACTIONS_FILE;
  if (fromEnv) list.push(resolve(fromEnv));
  // 独立 checkout：CI 把快照落在 docs/data/actions.json
  list.push(join(docsRoot, 'data', 'actions.json'));
  // 主仓内直接开发：docs/ 的上一级是仓库根
  list.push(join(docsRoot, '..', 'schema', 'onebot-actions.json'));
  return list;
}

function findSnapshot(): string {
  const tried: string[] = [];
  for (const candidate of candidates()) {
    tried.push(candidate);
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(
    [
      '找不到 OneBot action 快照。已尝试：',
      ...tried.map((path) => `  - ${path}`),
      '',
      '主仓内：先跑 `pnpm docs:actions` 生成 schema/onebot-actions.json。',
      '独立仓库：设置 WEQBOT_ACTIONS_FILE，或把快照放到 docs/data/actions.json。',
    ].join('\n'),
  );
}

export default {
  watch: candidates(),

  load(): ActionsSnapshot {
    const path = findSnapshot();
    const snapshot = JSON.parse(readFileSync(path, 'utf8')) as ActionsSnapshot;

    if (snapshot.version !== 1) {
      throw new Error(
        `OneBot 快照版本 ${snapshot.version} 不受支持（本页面按 version 1 渲染）。` +
          '主仓升了形状后，文档站的格式化逻辑要跟着改。',
      );
    }
    return snapshot;
  },
};
