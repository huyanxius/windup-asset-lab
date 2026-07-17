# 演示生成约束

当前产品只允许内置演示生成，不连接图像模型或其他外部 Provider。

## 固定约束

- 图像模型标识唯一来自 `contracts/windup.v1.json`，当前为 `windup-demo-fixture-v1`。
- 动作、视角、姿势、8 FPS 和循环规则仍以该合同为唯一来源。
- 浏览器只能通过 `asset-lab/core/demo-api-client.js` 读取打包素材和本地演示状态。
- 浏览器代码不得调用 `fetch`，后端管线不得包含出站 HTTP transport、API Key 或远程 API Base。
- 角色创建必须产生母版和所选基础动作的完整 8 帧候选包。
- 候选资产只有显式点击采用后才进入演示角色库。
- 参考图只在本地登记和校验，不上传到外部服务。

## 保底顺序

1. 优先读取 `localStorage` 中的演示状态。
2. 浏览器禁止或损坏本地存储时，自动切换到当前页面内存状态。
3. 自定义角色或帧缺失时，回退到打包内置角色；无法解析指定角色时使用 `boy`。

每层回退都必须继续返回符合当前合同版本的数据，不得以永久加载代替错误状态。

## 防回归门禁

- `tools/check-boundaries.mjs` 拦截浏览器 `fetch` 和后端出站 HTTP/凭据管线。
- `tests/demo-api-client.test.mjs` 覆盖零网络调用、本地持久化、内存保底、生成与审核。
- `tests/test_http_contract.py` 覆盖演示任务、晋升和已移除 Provider 路由的 404 行为。
- 改合同后必须运行 `node tools/generate-contract.mjs`，禁止手改生成文件。
