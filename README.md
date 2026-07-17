# Windup Asset Lab

Windup 是一个 2D 游戏角色资产演示工作台，覆盖角色定义、动作候选、逐帧审核、图集导出和 Cocos Creator 预览。

当前版本为 **Demo-only**：

- 不调用外部生成接口。
- 不需要 API Key。
- 不提供 Provider 会话或远程生成地址。
- 使用打包角色素材模拟生成、轮询、采用和审核闭环。
- 浏览器存储不可用时自动切换到内存保底。

## 打开项目

```bash
python3 -m server.app
```

访问：

- 产品首页：`http://127.0.0.1:4174/asset-lab/`
- 创建角色：`http://127.0.0.1:4174/asset-lab/create-character.html`
- 动作演示：`http://127.0.0.1:4174/asset-lab/generate.html`
- 角色资产：`http://127.0.0.1:4174/asset-lab/characters.html`
- 审核台：`http://127.0.0.1:4174/asset-lab/review.html`

`server.app` 只启动静态服务和 Demo-only 兼容路由，不会读取外部 Provider 凭据。

## 演示闭环

```text
从零开始 / 参考图 / 已有角色
→ 创建本地演示任务
→ queued / generating / processing
→ awaiting_review
→ 用户显式采用
→ 浏览器演示资产库
→ 逐帧审核与导出
```

角色创建默认提供母版、待机 8 帧和行走 8 帧。动作页支持完整 8 帧和单帧修复两种演示方式。

## 保底机制

演示数据按以下顺序读取：

1. `localStorage` 中保存的演示角色、任务和审核状态。
2. 当前页面内存状态。
3. 仓库打包的少年、点灯人、Skeleton 和 Lirael 资产。

如果浏览器禁止本地存储，页面会显示“演示模式 · 内存保底”；指定角色不存在时，审核台会提示并回退到默认少年，不会卡在加载状态。

## 关键目录

```text
asset-lab/
├─ core/
│  ├─ demo-api-client.js       # 演示接口、本地持久化、内存保底
│  ├─ api-contract.js          # 演示响应结构与版本校验
│  ├─ job-poller.js            # 任务阶段轮询
│  ├─ review-store.js          # 审核状态
│  ├─ editor-session.js        # 角色/视角/动作/帧状态
│  └─ playback-clock.js        # 8 FPS 唯一时钟
├─ data/
│  ├─ character-catalog.js     # 打包角色与动作资产
│  └─ generated-contract.js    # 自动生成契约
├─ pages/                      # 审核台页面模块
├─ create-character.*          # 角色演示
├─ generate.*                  # 动作演示
└─ characters.*                # 演示资产管理

contracts/windup.v1.json       # 视角、动作、8 FPS、相位和 demo model 单一来源
server/app.py                  # 静态服务 + Demo-only 兼容路由
tools/check-boundaries.mjs     # 禁止浏览器 fetch 等架构检查
```

## 架构规则

- 浏览器生成、资产库和审核调用只能通过 `demo-api-client.js`。
- 浏览器代码不得调用 `fetch`，不得恢复可配置 API Base。
- 不增加 API Key 输入框、Provider 会话端点或付费模型配置。
- `contracts/windup.v1.json` 是动作、视角、8 FPS、循环和相位的唯一来源。
- 候选必须由用户显式采用后才进入演示资产库。
- 编辑器动画定时器只能由 `PlaybackClock` 管理。
- 样式加载顺序保持 `foundation → surface → drawer → workspace → components → integrations → motion`。

## 验证

```bash
node tools/generate-contract.mjs --check
node tools/check-boundaries.mjs
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -p "test_*.py"
python3 -m py_compile server/app.py server/windup_pipeline/*.py
git diff --check
```

Windows 可以运行：

```bat
tools\verify-architecture.bat
```

## 更多文档

- `AGENTS.md`：协作规则
- `HANDOFF.md`：当前交付状态
- `docs/ARCHITECTURE.md`：模块边界与状态所有权
- `docs/DECISIONS.md`：架构决策
- `docs/ENGINEERING_PLAYBOOK.md`：演示保底和故障处理
- `CONTRIBUTING.md`：提交与验证流程
