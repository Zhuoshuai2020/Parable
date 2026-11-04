# Parable · AI 预访谈

面向准备制定家族宪章的创始人，提供文字 AI 预访谈、独立 Agent 模拟访谈，以及完整访谈记录。

## 本地运行

需要 Node.js 24 或更新版本，无第三方依赖，无需安装依赖包。

```powershell
$env:PARABLE_API_BASE = 'https://llmapi.paratera.com/v1'
$env:PARABLE_MODEL = 'DeepSeek-V4.1-Flash-1017'
# 密钥由运行环境注入 PARABLE_API_KEY，勿写入文件或命令历史
npm start
```

打开 http://127.0.0.1:3000 。默认只监听本机，当前版本供本地使用，尚未提供多用户登录或公开部署能力。

模型供应商需支持兼容的 Chat Completions 接口：应用向 `PARABLE_API_BASE/chat/completions` 发送 `model` 与 `messages`，使用 Bearer 密钥认证，从 `choices[0].message.content` 读取文字。Base URL 是否包含 `/v1` 以供应商要求为准。不提供网页搜索。

全部配置从服务端环境变量读取，不加载 `.env` 文件。真实密钥不写入项目文件、数据库、配置包或导出记录，不返回浏览器。更改环境配置后重启。未配置密钥时可查看页面、编辑 Agent，但不会生成虚假模型回答。

## 使用

1. 在“Agent 设置”编辑采访者人设和 Skills，或新增独立模拟受访者。保存用于新会话，已开始的会话保留原配置快照。
2. 在“访谈空间”选择真人或模拟模式。真人输入回答；模拟可逐条推进，也可连续生成，每次连续运行上限为 40 条发言，可暂停。暂停后当前正在生成的发言仍会完成并保存。
3. 在“访谈记录”继续或查看历史，按轮次查看采访者提问与受访者回答；可导出可读的完整问答 Markdown，或含全部对话与配置快照的 JSON。

## 采访者的记忆

每次模型调用带上本场全部问答，并在调用前显式注入采访者最新的有效诊断；最近 40 版状态随原始发言持久化，暂停或重启后可恢复。模拟受访者只看到公开问答，不接收采访者的人设和诊断。

采访者自诊断需要通过字段校验。缺失时最多进行一次格式修复，标记 `diagnosticStatus: repaired` 并保留原正文；直接合格时标记 `validated`。修复后仍不合格则明确报错，不保存成成功发言。受访者发言仍可以 `diagnostic: null`。旧记录不自动补造诊断。原 DSH 的调用链核对与恢复说明见 [DSH 检查记录](docs/architecture/dsh-restoration.md)。

当前没有跨访谈长期记忆、向量检索或自动总结压缩。本地上下文上限为 180000 字符，达到上限时明确提示并保留记录，不静默丢弃早期提问。供应商实际 token 限制仍可能更早触发。检查细节见 [采访者检查记录](docs/architecture/interviewer-audit.md)。

默认采访者从用户提供的 v2.4.12 配置整理，保留候选性质，尚未完成真实模型访谈质量验收。Skills 首版为注入模型的可编辑方法文本，不执行脚本。自带受访者为虚构人物；未来可在同一入口新增乔布斯等模拟人设，不声称其表达代表真人。

## 存储

- `config/agents.json`：初始 Agent 模板，原始参考文件保持不动。
- `data/parable.sqlite`：SQLite 本地记录及用户保存的 Agent 配置，已由 Git 忽略。初次启动从模板导入，此后编辑模板不会覆盖已保存的配置。
- 访谈发言成功生成即落盘；请求失败时保留已有对话，允许重试。
- 备份时先停止服务，再复制完整 `data/` 目录。导出文件包含对话与人设，应按其内容妥善保存。

## 验证

Jobs v0.7.0 接入：运行 `powershell -File scripts/import-jobs.ps1 -Archive <jobs-private-portable-v0.7.0.zip 的完整路径>`，然后重启 `npm start`。在“模拟访谈”中选择“乔布斯 · Jobs（历史人物模拟）”。已有同版本资料不会覆盖。私有资料保存在忽略的 `data/jobs/0.7.0/`；可通过 `PARABLE_JOBS_DIR` 更换资料根目录。

Jobs 默认表达方法位于 `src/jobs/jobs-style.mjs`（`0.7.0-style.1`），在 Agent 设置的 Skills 中可以编辑。未自定义的旧默认方法在新访谈配置中升级，自定义内容与已有快照保留。每轮额外读取真实访谈片段作语气参照；表达调整说明见 `docs/acceptance/jobs-expression.md`。

每轮 Jobs 回答先调用模型选择至多三个主题，再由服务端读取主题所引用的原文段落，随后独立生成回答；这两次请求共享 180 秒预算。JSON 记录保存资料版本及本轮读取文件名，采访者只看到对话。没有复刻原包的交互式 `read_document`、`record_judgment` 工具，当前采用主题导航与引用段落预读取。模型生成质量需另行验收；模拟输出不代表乔布斯本人。线上适配使用服务端资料模块，原文不作为公开静态资源发布。

```powershell
npm test
```

测试使用临时数据库与本地模拟 API，覆盖真人与双 Agent 流程、私有人设隔离、配置快照、失败重试、重启恢复及记录导出。此测试不代表真实模型兼容性或访谈质量通过。

需求见 [docs/requirements.md](docs/requirements.md)，参考资料见 [docs/reference/README.md](docs/reference/README.md)。

精简采访者 v3 与线上定点续写对照：见 [运行与验证说明](docs/acceptance/slim-v3-evaluation.md)。命令：`python -u scripts/run-slim-evaluation.py`。

本地提交、分支和资料边界见 [Git 管理约定](docs/git-workflow.md)。

## 目录

```text
server.mjs          本地 HTTP 服务入口
src/interviewer/    采访者配置解析、上下文、诊断与生成
src/jobs/           Jobs 资料加载、检索与表达
src/model-client.mjs 模型 API 客户端
config/             当前运行配置（JSON）
public/             本地应用界面
tests/              本地应用测试
scripts/            导入与评估脚本
website/            独立运行的网站源码
docs/               需求、架构、验收与参考资料
```

原始采访者 v2.4.12 导入 JSON 与完整设置说明归档于 `docs/agents/archive/v2.4.12/`，用于追溯，不是当前运行入口。根目录 `package.json` 保留 npm 启动与测试定义。

公开网站的完整非私有开发源码位于 [website/](website/README.md)，协作开发前请阅读 [开发交接说明](docs/collaborator-handoff.md)。
