# DSH 原底座检查与恢复

检查来源：用户指定的 `D:/Desktop/Parable-cognitive-worker`。仅阅读原项目，没有改动它。实现放在当前 Parable 及 Sites 线上适配版。

## 已核对的实际调用链

- 原工作台 `apps/workbench/cognitive-worker-v02.html` 的 `onlineSuggest()` 拼接人设、策略和最近 8 轮 transcript，并附加“只输出下一个问题本身”。该末尾要求与人设中诊断输出约定存在冲突。
- `apps/workbench/bridge.mjs` 默认 `PARABLE_DRIVER=api`；也可调用各角色的 `driver.mts`。
- 原 bridge 在完成模型调用后才追加“上一轮访谈主线状态”至 `body.system`，因此本次调用看不到这段状态。这是原实现的时序缺陷，不能照抄。
- 诊断从 HTML 注释提取，按 sessionId 写入 `records/_threads/`，保存最新状态与最近 40 次历史。但原代码既不校验完整字段，也没有诊断缺失后的修复。

## 三项结论

| 检查项 | 原实现实际情况 | 当前处理 |
| --- | --- | --- |
| 独立自检 | 未发现采访者独立自检调用；自诊断与访谈正文同次输出。观察者是另一个角色，不能等同于采访者自检 | 保持同次诊断，增加字段校验；缺失时只允许一次格式修复，不增加观察者或循环评分服务 |
| 记忆压缩 | DSH 通用 base profile 挂载 token-meter、compaction-basic、command-compact，具有摘要压缩能力。但 Parable 自定义 driver 仅挂载 testkit 最小服务、AgentLoop 和 pi-ai，每次新建 sessionId、临时 cwd，未挂载压缩后端；原工作台只截取最近 8 轮 | 不声称已恢复原采访者没有使用的压缩链；保留全量原始记录和当前上下文上限，不静默删除早期问答 |
| 阶段控制 | 原策略包含关键词段落：原因、详细故事、规则落地、取舍挑战、修订总结；由模型与主线状态推进，没有强制状态机 | 保留 v2.4.12 策略；在模型调用前注入最新有效诊断，延续当前议题、证据、未决项和 next_action，不添加机械轮数配额 |

## 恢复与修正

1. 按原诊断字段契约校验：active_thread、detected_obsessions、new_evidence、unresolved_tensions、rule_hypothesis、next_action、reason_for_switch；maturity 为 L0–L3。
2. 在每次采访者模型调用前显式注入上一轮有效状态，附对应原始消息 ID；只向采访者注入，不向模拟受访者泄漏。
3. 将状态历史等价保存在已有会话消息中：最新状态与最近 40 版可恢复，原始消息不删。无需复制原文件落盘机制或新增数据库表。
4. 采访者诊断缺失时进行一次格式修复；保留第一次生成的正文与 rawContent，额外响应存 diagnosticRepairRawContent，标记 diagnosticStatus=repaired。直接合格的响应标为 validated。
5. 修复仍不合格则返回 DIAGNOSTIC_INVALID，不追加不完整发言，也不虚构诊断填充 null。受访者发言仍可正常 diagnostic=null。
6. 初次生成和格式修复共用 90 秒总预算，避免超过云端记录锁期限。网络重试与诊断修复分别有界。
7. 既有 null 或不完整诊断保持原样，不补写历史；下一次有效采访者发言重新建立可验证状态。

## 验证范围

本机模拟测试覆盖缺失修复、修复失败拒绝、保留原正文、诊断状态调用前注入、40 版恢复及受访者隔离。没有将历史真实访谈或原底座文件发送到模型；真实网关遵循率仍需后续行为验收。结构合格不代表模型的自诊断判断一定正确。
