# Windup 架构说明

这份文档是代码导航和扩展约定。目标是让第一次进入仓库的人能快速判断：功能在哪里、状态由谁拥有、增加能力时应该改什么、不应该改什么。

## 设计原则

1. **一个状态只有一个所有者。** 人物播放与移动只由 `motion-state.js` 决策，页面不能直接拼装另一套运动状态。
2. **页面负责组装，不承载基础能力。** 网络、任务轮询、审核存储、质检、图集与游戏通信都由独立模块提供。
3. **候选资产和正式资产隔离。** 生成结果先进入任务目录，人工采用时才备份并写入正式目录。
4. **外部服务只有一个边界。** API Key、鉴权、超时、重试和上游错误只在后端 `provider.py` 中处理；凭据按浏览器会话隔离，绝不进入任务文件。
5. **契约只有一个来源。** 动作、视角、8 FPS、循环语义、相位和模型来自 `contracts/windup.v1.json`，前后端文件由工具生成。
6. **可替换基础设施。** HTTP 页面不直接读写任务、审核 JSON；未来将本地文件换成 SQLite、对象存储或队列时，接口层不需要重写。

## 运行结构

```text
asset-lab/
├─ app.js                       # 审核台极薄入口
├─ pages/
│  ├─ editor.js                 # Composition Root，只组装模块与用例
│  ├─ editor-view.js            # DOM 渲染，不拥有业务状态
│  ├─ editor-bindings.js        # 鼠标、键盘和按钮事件适配
│  └─ editor-elements.js        # DOM ID 契约与启动校验
├─ data/
│  ├─ generated-contract.js     # 自动生成的前端领域常量
│  ├─ generated-contract.d.ts   # 自动生成的类型边界
│  └─ character-catalog.js      # 角色与帧目录，不重复定义动作规格
├─ core/
│  ├─ editor-session.js         # 角色/视角/动作/帧/锚点的唯一所有者
│  ├─ motion-state.js           # 纯动作状态机，无 DOM
│  ├─ playback-clock.js         # 唯一 8 FPS 播放时钟
│  ├─ api-client.js             # 唯一 HTTP 客户端，携带隔离会话
│  ├─ runtime-config.js         # API、Cocos 和消息命名空间运行配置
│  ├─ job-poller.js             # 生成任务生命周期轮询
│  └─ review-store.js           # 本地即时反馈 + 服务端版本同步与冲突合并
├─ features/
│  ├─ quality-check.js          # 帧几何质检
│  ├─ sprite-packer.js          # Cocos 图集和 metadata
│  ├─ game-bridge.js            # 工作台与 Cocos 的消息协议
│  ├─ drawer-controller.js      # 左侧抽屉生命周期
│  ├─ onboarding-controller.js  # 聚光灯、模式选择和点击引导
│  ├─ provider-session-controller.js # 生成页面共用的 Key/模型连接状态
│  └─ workflow-stepper.js       # 生成流程步骤状态
├─ styles/
│  ├─ foundation.css            # 设计变量和基础组件（第 1 层）
│  ├─ surface.css               # 黑白专业表面与控件质感
│  ├─ drawer.css                # macOS 毛玻璃抽屉结构
│  ├─ workspace.css             # 全屏舞台与浮动布局
│  ├─ components.css            # Inspector、图集等部件
│  ├─ integrations.css          # 角色和生成入口
│  └─ motion.css                # 动效与 reduced-motion 降级
├─ generate.*                   # 独立动作生成页面
├─ create-character.*           # 独立新角色创建页面
└─ characters.*                 # 独立角色资产管理页面

contracts/
├─ windup.schema.json           # 产品契约 Schema
└─ windup.v1.json               # 前后端唯一动作/视角/模型契约

server/
├─ app.py                       # 薄 HTTP 适配：路由、Cookie、CORS、静态文件
└─ windup_pipeline/
   ├─ application.py            # 生成、采用、角色目录等应用用例
   ├─ config.py                 # 只放环境配置和图像处理规格
   ├─ generated_contract.py     # 自动生成的后端领域常量
   ├─ domain.py                 # 内建角色目录 + 生成契约导出
   ├─ provider.py               # 七牛云鉴权、请求、重试和错误映射
   ├─ generate.py               # 组装图像模型请求
   ├─ processing.py             # 抠图与 256×256 归一化
   ├─ job_store.py              # 线程安全的任务持久化边界
   ├─ review_store.py           # 乐观锁版本化审核存储
   └─ session_store.py          # 不落盘的会话级 API 凭据
```

## 关键数据流

```mermaid
flowchart LR
  UI["独立页面"] --> API["api-client"]
  API --> HTTP["app.py 路由"]
  HTTP --> App["GenerationApplication"]
  App --> Store["JobStore / ReviewStore"]
  App --> Session["ProviderSession"]
  Session --> Provider["QnAIGC Provider"]
  Provider --> Generate["生成步骤"]
  Generate --> Process["抠图与归一化"]
  Process --> Candidate["候选任务目录"]
  Candidate --> Review["人工采用"]
  Review --> Assets["正式资产 + 备份"]
  Assets --> Cocos["Cocos Runtime"]
```

生成任务状态只有一条合法主路径：

```text
queued → generating → awaiting_review → approved
                    ↘ failed
服务重启中的活动任务 → interrupted
```

完整的“需求 → 规格 → 候选 → 质检 → 审核 → 采用 → Cocos → 发布”退出条件见 `ENGINEERING_PLAYBOOK.md`。本文件定义代码结构，Playbook 定义团队如何持续使用这套结构。

## 人物交互契约

人物移动由 `core/motion-state.js` 中的纯状态机控制。任何按钮、键盘和人物点击都只发送事件：

- `CHARACTER_TOGGLE`：第一次点击开始自动行走，再次点击冻结，第三次从原位置恢复。
- `PLAYBACK_TOGGLE`：只切换帧播放，不偷偷修改人物位置。
- `AUTO_TOGGLE`：开启或停止自动巡走。
- `MANUAL_INPUT`：A/D、方向键和屏幕按钮共用的手动输入。
- `PAUSE_FOR_REVIEW`：逐帧审核时进入静止状态。

禁止给人物和舞台分别编写互相竞争的点击业务逻辑；禁止用 `stopPropagation()` 表达“开始或暂停”的状态转换。

## 状态所有权

| 状态 | 唯一所有者 | 页面如何使用 |
|---|---|---|
| 角色、视角、动作、帧、逐帧偏移、锚点 | `EditorSession` | 调用明确的选择和调整方法 |
| 播放/暂停、自动/手动移动、方向、位置 | `motion-state.js` | 发送事件给纯 reducer |
| 8 FPS 定时器 | `PlaybackClock` | 启停一个时钟，不直接创建 interval |
| 审核结论 | 前端 `ReviewStore` + 后端 `ReviewStore` | 本地即时更新，服务端版本同步，409 时按本帧意图合并 |
| API 凭据 | `ProviderSessionStore` | HttpOnly 会话标识隔离；任务线程仅接收凭据快照 |
| DOM 表现 | `EditorView` | 读取状态并渲染，不反向修改领域状态 |
| 浏览器输入 | `editor-bindings.js` | 将事件翻译成应用命令 |

新增交互时先判断它属于哪位所有者；如果没有明确所有者，先扩展契约，不能直接在页面里增加平行状态。

## 如何扩展

### 增加动作

1. 只在 `contracts/windup.v1.json` 增加动作名称、循环语义和 8 个相位。
2. 运行 `node tools/generate-contract.mjs`，生成前端常量、类型与后端常量。
3. 在 `data/character-catalog.js` 增加资产目录，放入对应正式帧。
4. 为新的状态转换补纯函数测试，不在 DOM 事件里直接改多处状态。

### 增加角色

内建角色加到前后端目录；用户生成角色通过 `/api/characters/generations` 创建，确认后由后端写入运行时角色库。角色母版、动作候选和正式帧必须保持不同目录。

### 更换生成供应商

新增一个实现与 `provider.py` 相同职责的适配器，然后在服务启动配置中选择。页面不应感知供应商 SDK，也不能持有 API Key。

### 更换任务存储

实现 `JobStore` 的 `add`、`get`、`update`、`load` 语义即可。路由和生成流程不应依赖 JSON 文件结构。

## 维护红线

- 不在页面脚本中复制 `fetch`、轮询或资产 URL 拼接。
- 不在渲染函数中发起不可追踪的业务状态转换。
- 不让生成结果直接覆盖正式资产。
- 不把 API Key、生成会话、任务输出或用户提示提交到 Git。
- 不把不同视角伪装成 CSS 旋转；每个视角必须有独立资产。
- 审核台按 `foundation → surface → drawer → workspace → components → integrations → motion` 固定顺序加载。当前视觉依赖这套明确覆盖顺序；禁止批量删除优先级或改成 Cascade Layers。样式债只能逐组件迁移，并人工确认抽屉收起、左侧胶片栏、舞台居中和右侧 Inspector 后再删除旧规则。
- HTML 不写行内样式，业务逻辑不能依赖颜色或动画类名。
- 不手工编辑 `generated-contract.js`、`.d.ts` 或 `.py`；改动必须从版本化契约生成。
- 不把 API Key 写入全局配置、任务 JSON、浏览器存储或日志；一个会话不得覆盖另一个会话的模型与凭据。
- `generate.js` 与 `create-character.js` 必须复用 provider controller 和 stepper，不再复制 Key 连接与流程状态。

## 自动架构门禁

`tools/check-boundaries.mjs` 在每次验证中检查：

- `core → pages/features` 和 `features → pages` 的逆向依赖。
- 绕过 `api-client` 的浏览器 `fetch`。
- 绕过 `PlaybackClock` 的动画 interval。
- HTTP 适配层重新吸收业务/存储逻辑或超过合理体积。
- 全局 API Key 写入、硬编码运行地址和生成契约漂移。

规则应尽可能由机器执行；文档只保留无法自动判断的产品语义和取舍。

## 最小自检

```bash
./tools/verify-architecture.sh
```

样式修改后统一运行：

```bash
node tools/format-css.mjs asset-lab/styles/*.css
```

这些检查覆盖动作状态、生成契约漂移、CSS 层级、会话隔离、审核并发、HTTP 主流程、API 地址和任务恢复。视觉验收仍由人工页面检查完成，不使用截图自动化替代产品判断。
