# Windup 开发交接

> 更新：2026-07-16
>
> GitHub：<https://github.com/huyanxius/windup-asset-lab>
>
> 默认分支：`main`

## 当前分支与 PR

| Scope | Branch | Pull request | Status |
|---|---|---|---|
| Issue #14 完整导航骨架 | `codex/issue-14-workflow-skeleton` | [Draft PR #15](https://github.com/huyanxius/windup-asset-lab/pull/15) | 已推送，待 Review |
| 节点创作台、交互与流程复用 | `codex/canvas-workbench-workflow-reuse` | 堆叠在 PR #15 之上 | 当前开发分支 |

当前分支不直接合并到 `main`。先审查 PR #15 的导航基线，再审查创作台堆叠 PR，避免把 Issue #14 的路由骨架与后续产品改造混成一个巨型 diff。

## 产品入口

启动服务：

```bash
cd /Users/huyan/Desktop/点灯人-issue-14
PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin python3 -m server.app --demo
```

| Surface | URL |
|---|---|
| 产品首页 | <http://127.0.0.1:4174/asset-lab/> |
| 项目资产 | <http://127.0.0.1:4174/asset-lab/#/library> |
| 节点创作画布 | <http://127.0.0.1:4174/asset-lab/#/studio> |
| 逐帧审核台 | <http://127.0.0.1:4174/asset-lab/review.html> |
| Cocos Web Runtime | <http://127.0.0.1:4173/> |

工作台为原生 ES Modules + Python 服务，不是 React/Vite 项目，不使用 `npm run dev`。

## 当前已完成

- 主导航收敛为“首页 / 项目资产 / 创作”。
- 创作页使用全屏节点画布，节点可拖动、缩放、整理，连线状态可持久化。
- 未确认连接为虚线；点击目标卡片后通过动画转为实线。
- 母版、Walk / Idle 首帧和完整动画均有明确表单和确认点；Walk 与 Idle 可并发。
- 生成视觉为点阵波纹和模糊渐显，不使用扫描线。
- 最终节点提供导出资产和发送到预览台。
- 普通流程逐步人工确认；已验证流程可保存为后端模板并用于新角色自动运行。
- 自动复用仍在候选采用前停下，用户确认后才调用 promote 原子入库。

## 流程复用数据与 API

- 模板目录：`generation-data/workflows/`
- 存储边界：`server/windup_pipeline/workflow_store.py`
- `GET /api/workflows`：列出模板。
- `POST /api/workflows`：保存当前已验证流程。
- 模板中的 `graph` 保存节点清单、连线、位置和画布视口；旧模板缺少 `graph` 时由前端恢复标准完整链路。
- `POST /api/workflows/{id}/runs`：为新角色创建带模板来源的角色包任务。
- `POST /api/characters/generations`：以结构化字段添加角色候选素材。
- `POST /api/quick-start`：以一句自然语言推断角色名和基础动作，并复用角色生成管线。
- `POST /api/generations/{id}/promote`：最终人工采用。

详细数据结构和调用示例见 [`docs/WORKFLOW_REUSE.md`](docs/WORKFLOW_REUSE.md)。

## 验证基线

```bash
PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin ./tools/verify-architecture.sh
git diff --check
```

2026-07-16 最近一次通过：

- 前端 Node tests：56 项。
- 后端 Python tests：11 项。
- 架构边界：39 个前端模块、29 个后端模块。
- 实测 `GET /api/health` 和 `GET /api/workflows` 均返回 200。

## 已知限制

- 流程模板当前是单机 JSON Store，尚无删除、编辑、团队共享和版本对比 UI。
- 可复用节点当前固定为母版 + Idle + Walk；自定义动作节点仍是扩展占位。
- Demo 画布进度动画和后端 job 分别维护显示与生成状态；真实供应商耗时可能长于前端预估，最终 promote 以后端状态为准。
- 俯视和 2.5D 的完整动作资产仍不齐全。

## 下一步

1. 将创作台改动作为堆叠 PR 推送，Review 时不与 Issue #14 的导航骨架混在一起。
2. 使用真实供应商做一次“保存流程 → 新角色复用 → 候选审核 → promote”端到端验收。
3. 将模板列表扩展为独立的流程管理页，增加更新、删除和版本比较。
