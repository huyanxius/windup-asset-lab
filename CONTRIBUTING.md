# Contributing to Windup

这份规则负责回答：一个新需求如何安全进入产品，而不会再次把编辑器、生成管线和游戏运行时耦合在一起。

## 十分钟进入项目

1. 阅读 `README.md` 了解产品和三仓库关系。
2. 阅读 `docs/ARCHITECTURE.md` 确认模块边界与状态所有权。
3. 阅读 `docs/ENGINEERING_PLAYBOOK.md` 确认从需求到发布的完整流程。
4. 运行 `git status`，辨认并保护已有本地改动。
5. 运行 `./tools/verify-architecture.sh`，建立修改前基线。

## 改动顺序

```text
需求与验收标准
  → 判断是否改变产品契约
  → 选择唯一状态所有者和模块边界
  → 先补最小失败测试
  → 实现用例
  → 跑架构与契约检查
  → 小提交
  → PR + 队友 Review
  → 合并后部署与数据观察
```

如果动作、视角、FPS、循环语义、相位或模型列表改变，先改 `contracts/windup.v1.json`，再生成两端定义。其他功能不得复制这套枚举。

## 修改位置

| 需求 | 首要位置 | 必须验证 | 不应修改 |
|---|---|---|---|
| 新动作/视角 | `contracts/`、角色目录 | contract + editor session + HTTP flow | 路由中的平行枚举 |
| 新编辑交互 | `motion-state` 或 `EditorSession` | reducer/session test | DOM 中的临时状态 |
| 新页面 | `pages/` + 复用 `features/core` | DOM/logic test | 复制 fetch、Key 连接、轮询 |
| 新供应商 | provider adapter | provider error mapping + session test | 浏览器 Key 存储 |
| 新审核规则 | quality feature / review store | geometry or version-conflict test | 直接覆盖正式资产 |
| 新存储 | `JobStore`/`ReviewStore` 接口实现 | recovery/concurrency test | HTTP 路由语义 |
| Cocos 协议 | `contracts/` + 生成的 Cocos 合约 + `game-bridge`/`GameRoot.ts` | payload + frame mapping contract | 手写 FPS、循环或帧名 |

## Definition of Done

- 功能有一个明确状态所有者，没有第二套同义状态。
- 错误、空状态、重试和恢复路径已定义。
- API Key、用户提示和候选资产不会进入 Git。
- 新公共契约有版本或兼容策略。
- 相关逻辑测试和 `./tools/verify-architecture.sh` 通过。
- Pyright 和后端孤儿代码检查通过；新增后端模块必须从应用入口可达。
- README/HANDOFF/架构文档仅在事实改变时同步更新。
- PR 单一主题、提交按关注点拆分，作者能够解释数据流与失败路径。

## Review 顺序

Review 时按风险而不是文件顺序检查：安全与数据覆盖 → 契约兼容 → 状态所有权 → 并发/失败恢复 → 可测试性 → UI 表现。至少一位队友通过后再合并。
