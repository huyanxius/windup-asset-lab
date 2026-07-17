# 从创建界面到动画：演示闭环

## 1. 填写角色

打开 `asset-lab/create-character.html`，填写名称、角色定义、风格、配色并选择基础动作。界面固定使用 `windup-demo-fixture-v1`，不显示 API Key、远程地址或付费模型。

## 2. 本地创建任务

提交后，`asset-lab/core/demo-api-client.js` 在浏览器内创建任务。任务会按以下状态推进：

`queued → generating → processing → awaiting_review`

这个过程不调用 `fetch`，也不会上传参考图。

## 3. 组装候选角色包

演示 API 根据输入确定性选择打包角色形象，并返回：

- 1 张角色母版；
- 每个已选基础动作的 8 张合同帧；
- 当前合同版本、8 FPS、动作路线和零外部调用计数。

不同描述会在现有打包形象之间产生稳定差异；这不是在线生图。

## 4. 审核与采用

候选包不会自动覆盖角色库。只有点击采用后，它才会写入演示角色库。审核状态带版本号，旧版本写入会被拒绝。

## 5. 刷新与故障保底

- 正常情况下，刷新后从 `localStorage` 恢复角色与审核状态。
- 本地存储不可用时，自动使用页面内存，当前会话仍可继续。
- 自定义角色数据缺失或损坏时，回退到打包角色；指定角色不存在时使用默认少年并显示提示。

## 6. 动画预览

编辑器按合同中的 8 FPS 播放打包帧。手动移动、自动巡走和停止待机继续共用 `PlaybackClock` 与动作状态机，不受演示 API 回退影响。

## 7. 验证边界

运行以下检查可证明演示闭环没有重新接入真实服务：

```powershell
node tools/check-boundaries.mjs
node --test tests/*.test.mjs
python -m unittest discover -s tests -p "test_*.py"
```

其中架构检查会阻止浏览器网络调用、后端出站 HTTP transport、API Key 和远程 API Base 回到活跃代码。
