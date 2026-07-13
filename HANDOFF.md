# 《点灯人》项目交接

> 交接日期：2026-07-13  
> 项目根目录：`/Users/huyan/Desktop/点灯人`

## 1. 项目现状

当前已完成一套可运行的 Cocos Creator 3.8.8 游戏 MVP，以及独立的人物资产管理与测试平台。

- 资产平台：`http://127.0.0.1:4174/asset-lab/`
- Cocos 游戏：`http://127.0.0.1:4173/`
- 帧率：全链路固定 8 FPS
- 视角：横屏侧视、俯视、2.5D
- 操作：A / D、左右方向键、界面按钮、自动巡走

## 2. 核心目录

- `assets/scripts/GameRoot.ts`：Cocos 游戏主逻辑、键盘移动、动画播放、平台联调接口。
- `assets/resources/character/`：游戏可直接加载的人物帧资产。
- `asset-lab/`：人物资产审核、播放、质检、操控和 Cocos 联调平台。
- `artifacts/raw/`：生成模型返回的原始大图，已保留历史版本。
- `tools/`：抠图、切帧、归一化处理脚本。
- `build/lamplighter-mvp/`：已构建的 Web 版 Cocos 游戏。
- `reports/`：实测报告与验证截图。

## 3. 快速启动

```bash
cd /Users/huyan/Desktop/点灯人
python3 -m http.server 4173 --bind 127.0.0.1 --directory build/lamplighter-mvp
python3 -m http.server 4174 --bind 127.0.0.1 --directory /Users/huyan/Desktop/点灯人
```

如需编辑 Cocos 项目：

```bash
open -a CocosCreator /Users/huyan/Desktop/点灯人
```

## 4. 已完成功能

- 人物动作库：待机、行走、奔跑、跳跃、举灯。
- 不同视角使用不同帧资产，不使用 CSS 伪造视角。
- 256×256 标准化帧、透明背景、统一脚底锚点。
- 自动质检：画布、Alpha、脚底线、主体高度、相邻帧位移、轮廓波动、循环接缝。
- 逐帧通过 / 退回、审核状态保存、导出门禁与 metadata 导出。
- 平台可将当前视角和动作通过 `postMessage` 推送到 Cocos。
- 一键进入独立 Cocos 游戏。
- 预览舞台可直接操控人物和自动巡走。
- 左侧资产栏为 macOS 毛玻璃抽屉：默认收起，鼠标移入左侧热区展开，移出后自动收回。

## 5. 资产缺口

- 俯视和 2.5D 仍需补齐 idle、jump、lantern 等动作。
- 横屏可继续补 attack、受击、倒地、交互等动作。
- 俯视与 2.5D 的镜头角度区分仍需进一步拉大。
- 几何质检不能判断脚步语义、解剖和风格一致性，仍需人工逐帧审核。

## 6. 下一步建议

1. 补齐三视角的共用动作矩阵。
2. 实现“退回单帧 → 带相邻帧重生成 → 新批次替换”。
3. 将生成模型、提示词、参考图版本、成本与耗时自动写入批次。
4. 将角色母版约束转为可计算特征，增加跨视角一致性评分。

## 7. 交付验证

- Cocos Creator Web 构建成功。
- 资产平台与 Cocos 联调成功，实测 `topdown / walk / 8帧`。
- 手动移动、自动巡走、停止待机已验证。
- 最终测试未发现 JavaScript 运行错误。
- 项目中未保存 API Key、`.env` 或凭据文件。

