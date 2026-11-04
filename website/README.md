# Parable 线上适配版

家族宪章准备阶段的 AI 文字预访谈工作台。保留本机版本的界面、人设编辑、模拟受访者、整场问答和导出。

- 框架：Vinext / Cloudflare Workers；保留 Sites 的登录和部署集成。
- 存储：D1，迁移文件位于 drizzle/；所有访谈问答公开可读、可导出；写入操作与个人 Agent 配置仍按浏览器访客凭据的哈希归属鉴权。
- 模型：兼容 Chat Completions 的 API。PARABLE_API_BASE、PARABLE_MODEL、PARABLE_API_KEY 由 Sites 运行环境配置，其中密钥为 Secret，不进入源码或打包产物。
- 现为公开免登录入口；没有导入原本机数据库。问答记录公开，只有创建者浏览器能继续或结束；公开读取不暴露私有人设与内部诊断。清除 Cookie 或换设备会失去编辑权限。
- API 调用发生瞬时连接中断或网关 502/503/504 时最多重试一次；180 秒总时间上限。失败原因分类返回，日志仅记网关主机、状态码和网络错误码，不记密钥或访谈正文。

## 开发和构建

需要 Node.js 24。从本仓库根目录开始：

```powershell
cd website
node scripts/prepare-private-jobs.mjs
npm run install:ci
node --test tests/*.test.mjs
npx tsc --noEmit
npm run build
```

准备脚本默认创建被忽略的 `config/jobs-private.json`，内容为 `null`，不启用 Jobs 私有资料；真人访谈和普通模拟的源码不依赖私有语料。模型调用仍需要环境变量，存储仍需要本地 D1 迁移。

本地开发可将模型环境变量放入本目录被忽略的 `.dev.vars`，不要填写真实密钥后提交：

```text
PARABLE_API_BASE=https://your-provider.example/v1
PARABLE_MODEL=your-model
PARABLE_API_KEY=your-key
PARABLE_DAILY_LIMIT=200
```

全新本地数据库可在构建后按顺序初始化，再启动本地预览：

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --config dist/server/wrangler.json --local --persist-to .wrangler/state --file drizzle/0000_fearless_exiles.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --config dist/server/wrangler.json --local --persist-to .wrangler/state --file drizzle/0001_thankful_firebird.sql
npm start
```

已有数据库不要重复执行初始化 SQL；新增迁移按顺序执行。热更新开发使用 `npm run dev`。不要把远端数据库或真实访谈导入共享源码。数据库绑定、环境变量和发布步骤见主仓库 `docs/collaborator-handoff.md`。

授权获得 Jobs 原始包后，在主仓库按 README 导入，再从本目录执行 `node scripts/prepare-private-jobs.mjs --from-local` 生成私有服务端资料包。该文件只供服务端使用，禁止移动到 `public/`。生成脚本不会调用在线模型。

访问无需登录 ChatGPT、Codex 或 GitHub；浏览器 HttpOnly Cookie 使用 256 位随机值，服务端只使用其哈希作为数据归属。默认每日全站最多 200 次生成尝试（北京时间零点重置），可通过 PARABLE_DAILY_LIMIT 调整；达到上限仍可回看和导出。D1 迁移通过 Sites 发布流程应用，不在请求处理时建表。

本目录是主 Git 仓库直接跟踪的网站源码，来源为 `sites/parable-online/` 的本地提交 `4c9fde63a42d4dd03e8cfd31e165bbee32626254`；不是嵌套 Git 仓库。来源校验清单见 `source-snapshot.json`。主项目的 Node 服务与本目录的 Workers 服务分别运行；共享逻辑需要有选择地同步并分别验证，不能整目录覆盖。
