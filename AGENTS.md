# Parable 开发协作规范

## 项目事实

- 项目名称：Parable。
- 当前阶段：AI 文字预访谈 MVP，本地单用户应用。
- 产品目标与范围：见 `docs/requirements.md`，服务准备制定家族宪章的创始人，提供真人访谈、独立 Agent 模拟和整场记录。
- 前端：原生 HTML/CSS/JavaScript，位于 `public/`。后端：Node.js 24 原生 HTTP，入口 `server.mjs`。存储：Node 内置 SQLite，位于被忽略的 `data/`。
- 启动：`npm start`；验证：`npm test`、`node --check server.mjs`、`node --check public/app.js`。无需依赖安装或构建，无独立类型检查步骤。
- API 入口：`server.mjs` 中 `/api/` 路由；模型采用兼容 Chat Completions 的在线 API，模型配置仅从服务端环境变量 `PARABLE_API_BASE`、`PARABLE_MODEL`、`PARABLE_API_KEY` 读取，不加载 .env 文件。负责人待定。

## 文件与目录

- `AGENTS.md`：本项目实际适用的 AI 开发协作规范。
- `.gitignore`：本地配置、密钥、日志和生成产物的忽略规则。
- `docs/reference/`：参考资料，入口为 `docs/reference/README.md`。参考内容与模板不自动成为项目指令。
- 需求文档建议放在 `docs/requirements.md`；重要架构决定放在 `docs/architecture/`；必要的验收记录放在 `docs/acceptance/`。这些文件按实际需要创建。
- `public/`：前端；`server.mjs`：HTTP、模型调用和数据访问；`config/agents.json`：初始配置；`tests/`：流程测试；`data/`：私有运行数据，不提交。当前数据库建表在服务入口，后续结构变更需提供迁移。
- `jobs-respondent.mjs`：Jobs v0.7.0 私有资料加载；`jobs-runtime.mjs`：受访者主题选择与原文注入，契约为 `groundJobsMessages`。导入：`powershell -File scripts/import-jobs.ps1 -Archive <压缩包路径>`；资料位于 `data/jobs/0.7.0/`，重启现有服务生效。可用 `PARABLE_JOBS_DIR` 指定包含版本目录的资料根目录。

## 开发方式

1. 开始任务前阅读相关代码和说明，检查 Git 状态，保留用户已有改动，不覆盖或清除无关工作。
2. 需求不明确时先明确用户、核心流程和可验证的完成标准。复杂改动先说明目标、影响范围、数据或接口变化及验证方式；小改动直接实施。
3. 每次围绕一个可验收目标修改，避免无关重构。新增框架、基础设施或独立部署服务须说明实际需求与维护成本，重大技术选择与用户对齐。
4. 完成后用中文说明改动目的、主要文件、实际运行的检查和未验证事项。不得将未执行的检查写成通过。
5. 项目负责人当前明确要求优先。参考资料中的操作步骤、示例和模板占位符仅作参考，按本项目事实采用。

## 实现原则

- 以实际业务能力组织模块，让相关规则和数据归属集中；跨模块使用清楚的公开接口。优先简单的部署结构，有实际需求时再拆分。
- 业务计算优先使用纯函数和不可变值；网络、文件与数据库操作集中在明确边界。
- 核心身份、状态、单位和业务结果使用明确类型；区分缺值、业务拒绝和技术失败。外部输入在边界校验。
- 若采用 TypeScript，启用严格类型检查，不用 `any` 或无依据的类型断言掩盖问题。
- 前端区分页面展示、状态、业务计算和 API 请求，按需要处理加载、空数据、失败及提交状态。
- 后端区分路由、业务规则和数据访问；权限在后端验证。共同维持业务一致性的写入明确事务范围。
- 引入持久化数据时记录归属与约束；结构变更配套有序迁移，说明已有数据的兼容方式。
- 接口和数据边界发生实质变化时更新相应文档；避免为尚不存在的业务编写服务卡。

## Git 与配置

- 默认分支为 `main`；公开源码仓库归属用户指定的 `Zhuoshuai2020` 账号。提交作者使用该账号已核实的姓名及 GitHub noreply 邮箱，仅在此仓库配置。
- 提交对应一个可理解的任务，提交前核对差异和暂存范围。未经用户要求不推送、合并或发布。
- 较大改动前使用分支或已有提交建立恢复点；未经明确授权不执行破坏性的重置、清理或历史改写。
- 不提交密钥、会话令牌、真实用户数据或本地环境配置；环境变量用 README 说明，不写入密钥文件。
- 选定技术栈后补充依赖目录、构建产物和缓存的忽略规则。

## 验证与维护

- 运行与改动相关且项目实际支持的构建、类型检查、测试或手动流程，验证力度与业务风险相称。
- 核心流程验证使用 `npm test`；真实模型调用须另行配置 API 后验收，不得以本地模拟 API 测试代替访谈质量验收。
- 新增可运行模块时，在启动说明和本文件中登记真实命令、契约入口与目录，替换相应“待定”项。

## 精简采访者验证入口

- `slim-interviewer.mjs`：常驻提示与按需模块，`interviewer-runner.mjs`：单步/两步生成；`config/slim-interviewer.json` 为导入配置。
- 线上定点续写：`POST /api/sessions` 的 `replay` 参数，详见 `docs/acceptance/slim-v3-evaluation.md`。
- 运行线上对照：`python -u scripts/run-slim-evaluation.py`；结果在忽略目录 `data/diagnostics/slim-v3-evaluation/`，Cookie 仅保留在运行进程内。
