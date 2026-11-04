# 协作者开发交接

## 源码入口

- 根目录：本机单用户 Node.js / SQLite MVP，启动和验证见根 README。
- `website/`：公开网站的 Vinext / Cloudflare Workers 源码，包含界面、API、访客权限、模型调用、人物配置、锁文件、D1 迁移、测试与 Sites 构建集成。开发命令见该目录 README。
- `docs/agents/`、`docs/architecture/`、`docs/acceptance/`：人设参考、架构与历史验收材料。历史验收记录不自动证明当前版本已通过线上验收。
- `sites/parable-online/`、`sites/jobs-style-online/`、`sites/jobs-style-publish/`：原有的本地独立工作目录，保持忽略。协作者应开发 `website/`，不依赖这些目录或导出 ZIP。

网站快照来自本机 `sites/parable-online/` 干净工作区，提交 `4c9fde63a42d4dd03e8cfd31e165bbee32626254`。它包含先前 Jobs 表达改动及后续网站版本修改。复制保留全部 145 个非私有跟踪文件；`website/source-snapshot.json` 记录原路径和 SHA-256，便于核对。交接适配仅增加可选私有资料准备与空资料兼容等说明，不改原网站工作目录或线上部署。

## 数据和配置边界

Git 保存开发材料，不保存运行数据。数据库、真实访谈、Cookie、模型密钥、Jobs 私有原文、依赖目录和构建输出均不进入主仓库。授权协作者需要通过独立渠道获得所需私有资料与运行凭据。

网站 `config/jobs-private.json` 从公开源码中排除；默认准备脚本产生 `null`，不会伪造 Jobs 回答。需要 Jobs 功能时按网站 README 从授权本地资料生成。已有 Jobs 访谈在缺少对应资料时应报错，而非编造回复。

线上模型环境变量为 `PARABLE_API_BASE`、`PARABLE_MODEL`、`PARABLE_API_KEY`，可选 `PARABLE_DAILY_LIMIT`；密钥通过部署环境 Secret 配置。根 Node 应用只读取进程环境变量，不读取 `.env`，与网站的本地 Worker 环境配置区分。

## D1 与部署

网站 `.openai/hosting.json` 保留现有 Site 身份和 `DB` 绑定；`drizzle/` 保存有序迁移，`db/schema.ts` 保存结构。全新数据库需要按编号应用迁移，已有数据库只应用未执行迁移；不要在生产数据库盲目重复 SQL。开发和生产数据库必须分开。

发布目标仍是既有 Sites 项目，源码写入和部署需要该项目权限；GitHub 仓库协作权限不自动授予 Sites 发布权限。发布时从 `website/` 准备源码和构建产物，通过 Sites 正式流程同步到其源码仓库，保持原 Site ID 与访问范围。不要在本主仓库运行会替换 Git 远端的同步操作；可使用独立发布工作目录。

本轮仅保存本地源码并合并 Git，没有同步远端 Sites 源码、迁移线上数据库或发布。未重新读取托管平台状态，因此快照版本只代表本地来源提交，不宣称已经与线上最新部署核对。

## 本轮交接验证

- 无私有资料配置下，网站 12 项测试通过，TypeScript 严格检查通过，生产构建通过。
- 对全新本地 D1 数据库顺序执行两份 SQL 迁移成功；没有接触远端数据库。
- 142 个未适配的来源文件与校验清单完全一致，其余 3 个原文件的交接适配有明确记录。
- 未重新进行浏览器验收、真实模型访谈或线上发布验证。
