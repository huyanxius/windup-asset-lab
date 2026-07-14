# 生图工作流

一个进程同时承担前端静态托管与生成后端(`python3 -m server.app --port 4174`,加 `--demo` 为演示模式)。前端轮询 job,后端逐张发布 outputs,新到的图片带点亮动画弹入。每步的 prompt 原文与约束参数见 `GENERATION_CONSTRAINTS.md`。

## 总览

```mermaid
flowchart LR
    subgraph 前端 asset-lab
        A[创建角色表单] -->|POST /api/characters/generations| B
        P[job-poller 900ms 轮询] -->|GET /api/generations/:id| B
        P --> R[renderAssetPackage<br>只追加新帧 + is-new 点亮动画]
    end
    subgraph 后端 server
        B[application 校验参数<br>开 daemon 线程] --> E[generation_executor]
        E --> AP[action_pipeline]
        AP --> G[generate 调图像 API]
        AP --> PR[processing 后处理]
        E -->|update/publish| J[(job_store<br>job.json)]
        P -.读.- J
    end
```

## 角色包生成(run_character)

```mermaid
flowchart TD
    S[gen_character<br>文字 → 母版 raw] --> GATE{母版门禁 VLM<br>侧面/四分之三 且 朝右?}
    GATE -->|不合格| REGEN[重新生成一次] --> GATE
    GATE -->|两次不合格| FAIL[任务失败<br>提示调整角色定义]
    GATE -->|合格 或 门禁故障放行| M1[matte_chroma 抠品红底]
    M1 --> N1[normalize_frame → 256×256 母版]
    N1 --> PUB0[publish 母版 ← 前端第一张点亮]
    PUB0 --> LOOP{每个基础动作<br>idle / walk}
    LOOP --> ROUTE{route}
    ROUTE -->|sheet 默认| SH[gen_action_sheet<br>一次调用生成 8 格横条<br>prompt 含 Action 名与全条一致性合同]
    SH --> M2[matte_chroma] --> SP[split_action_sheet<br>校验 ≥3:1 → 全条公共缩放系数<br>切 8 帧逐帧 normalize]
    SP --> PUB1[publish 8 帧一批]
    SH -->|格式异常 ×2| FB[回退 frames 路线]
    ROUTE -->|frames / 回退| FR[gen_frame ×8<br>参考 = 母版 + 上一帧<br>prompt = 动作名 + 帧序 N/8 + 姿势<br>+ 朝向锁 + 轮廓比例锁]
    FR --> M3[逐帧 matte + normalize] --> PUB2[publish 每帧一张 ← 逐张点亮]
    PUB1 & PUB2 --> Q[sequence_quality 几何连续性质检]
    Q --> AR[awaiting_review<br>人工整体确认 → promote 入库]
```

## 一次图像调用内部(generate._call)

```mermaid
flowchart LR
    T[text + 参考图 base64] --> API[POST /chat/completions<br>stream:false]
    API --> X{choices0.message<br>里有图?}
    X -->|有 >5KB| W[写 out_path]
    X -->|无| RETRY[重试 ≤3 次] --> API
    RETRY -->|耗尽| ERR[ProviderError]
```

只从 `choices[0].message` 提取图像——响应其他字段可能回显请求里的参考图,全文匹配会把参考图当生成结果(已修)。

## 一致性合同(三道锁)

| 锁 | 位置 | 内容 |
|---|---|---|
| 母版门禁 | `generation_executor.run_character` | 生成后用 VLM 判定 view/facing,非"侧面或四分之三 + 非朝左"重生一次,再不合格任务失败;门禁自身故障放行不阻断 |
| 单帧合同 | `action_pipeline._frames` | 每帧 prompt 必带:动作名大写 + 帧序 N/8 + 姿势行 + "SAME facing as reference" + "stance/scale/silhouette IDENTICAL, change ONLY the pose" |
| 姿势库单源 | `contracts/windup.v1.json` → `generate-contract.mjs` | 姿势文本唯一来源;idle 八帧均以 "IDLE BREATHING, feet planted, stance IDENTICAL" 开头,只描述呼吸位移;改姿势改合同再重新生成,不改生成物 |

## 关键约定

| 环节 | 约定 |
|---|---|
| 画布 | 每帧 256×256,主体贴 224×208,脚底基线 y=238 |
| 背景 | 生成时品红纯底 → 色键抠图,失败回退 AI 分割,仍 >60% 前景则拒帧 |
| 比例 | 同一动作条 8 帧共用一个缩放系数,禁止逐帧各自适配 |
| 动作条 | 必须 8 格单行、宽高比 ≥3:1,否则重试一次后回退逐帧 |
| 实时反馈 | 后端每 publish 一次,前端下个轮询只追加新帧并触发 `packageArrive` 点亮动画 |
| 计费 | sheet 路线 1 次调用/动作 + 母版门禁 1 次 VLM;frames 路线 8 次;demo 模式 0 次 |

## 已知取舍

- sheet 路线一次调用出 8 帧,便宜但生成期间(最长 240s)无逐帧反馈;frames 路线逐张反馈但 8 倍调用量。
- 回退时烧掉的 sheet 调用未计入 `sourceCallCount`;sheet 的 provenance 把整条耗时重复记给 8 帧。
- 生成请求无并发上限,每请求一个线程。
- `actions.py` 的 STANDARD 是旧 CLI 用的姿势库,与合同并存;活管线只读合同生成物。
- 待机双重锁死:单帧合同 IDENTICAL ×2 压制形变 + normalize 脚底锚定抹平纵向位移 → idle 近乎静止(详见 `GENERATION_CONSTRAINTS.md` 末尾)。
