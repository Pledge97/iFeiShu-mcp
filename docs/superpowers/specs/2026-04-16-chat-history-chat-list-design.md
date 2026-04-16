# Feishu MCP 设计文档：会话列表与历史消息读取

- 日期：2026-04-16
- 项目：Xfchat-MCP
- 范围：新增 `chat_list` 与 `message_get_history` 两个读取类工具
- 背景：当前项目已支持机器人发送消息，但缺少读取能力；需要支持“列出会话 + 获取历史消息”闭环

## 1. 目标与非目标

### 1.1 目标

1. 新增 `chat_list`，列出用户可访问的群聊/单聊会话并返回 `chat_id`。
2. 新增 `message_get_history`，按 `chat_id` 读取历史消息。
3. 读取能力统一使用 `user_access_token`，复用已有 OAuth 登录态。
4. 保持现有发送能力不变（`message_send_user` / `message_send_group` 继续使用机器人身份）。
5. 更新 README 工具清单与用法说明。

### 1.2 非目标

1. 不改造已有发送工具鉴权策略。
2. 不引入消息回执、消息撤回、实时订阅。
3. 不做复杂消息体还原（先聚焦文本摘要与基础字段）。
4. 不引入数据库持久化历史消息。

## 2. 方案选择

已评估方案：

- 方案 A（采用）：两个独立工具
  - `chat_list` 负责会话枚举
  - `message_get_history` 负责按 `chat_id` 拉历史
- 方案 B（放弃）：单工具按会话名自动解析
  - 单聊场景无法可靠按名称解析，覆盖不足

采用方案 A 的原因：

1. 与现有工具结构一致，边界清晰。
2. 单聊必须先获得会话 ID，分两步更可靠。
3. 测试粒度更小，失败定位更直接。

## 3. 架构与模块变更

### 3.1 代码位置

- 主改动文件：`src/mcp/tools/chat.ts`
- 复用模块：
  - `getUserToken(db, ctx)`（`src/feishu/userAuth.ts`）
  - `createFeishuClient(token)`（`src/feishu/client.ts`）
  - `logToolCall`（`src/mcp/logger.ts`）

### 3.2 边界约束

1. 读取工具与发送工具共存于 `chat.ts`，但鉴权路径严格分离。
2. 新增读取工具需要 `Db` 与 `SessionContext`，因此 `registerChatTools` 签名将从：
   - `registerChatTools(server)`
   调整为：
   - `registerChatTools(server, ctx, db)`
3. 调用方需同步更新传参（注册工具位置）。

## 4. 工具设计

### 4.1 `chat_list`

#### 描述
列出当前登录用户可访问的会话（群聊和单聊）。

#### 入参
- `count?: number`，默认 `20`，范围 `1-100`
- `sort_type?: "ByCreateTimeAsc" | "ByActiveTimeDesc"`，默认 `ByActiveTimeDesc`

#### 飞书接口
- `GET /im/v1/chats`
- 分页参数：`page_size`, `page_token`

#### 出参（MCP 文本）
按行输出关键字段：
- 会话名称
- `chat_id`
- 会话类型（若可得）
- 成员数（若可得）

无结果时返回“暂无可访问会话”。

### 4.2 `message_get_history`

#### 描述
按 `chat_id` 获取会话历史消息。

#### 入参
- `chat_id: string`（必填）
- `count?: number`，默认 `20`，范围 `1-100`
- `sort_type?: "ByCreateTimeAsc" | "ByCreateTimeDesc"`，默认 `ByCreateTimeAsc`
- `start_time?: number`（秒级时间戳，可选）
- `end_time?: number`（秒级时间戳，可选）

#### 飞书接口
- `GET /im/v1/messages`
- 固定容器参数：
  - `container_id_type=chat`
  - `container_id={chat_id}`

#### 出参（MCP 文本）
按消息顺序输出：
- 发送时间
- 发送人（可得则展示）
- 消息类型
- 文本摘要（优先 text，其次截断原始内容）
- `message_id`

无结果时返回“该会话暂无历史消息”。

## 5. 数据流

1. 工具入参通过 zod 校验。
2. 使用 `getUserToken(db, ctx)` 获取用户 token。
3. 用 `createFeishuClient(token)` 发起飞书 API 请求。
4. 分页收集消息/会话，直到满足 `count` 或无下一页。
5. 将结果格式化为易读文本返回。

## 6. 错误处理

1. 鉴权错误：保持现有 `AuthError` 文案风格，提示先登录。
2. 参数错误：zod 在入口拦截并由 MCP 返回参数错误。
3. 接口错误：统一返回“飞书 API 错误：{detail}”。
4. 会话不存在或无权限：返回可读提示，不抛未处理异常。

## 7. 测试设计

### 7.1 单元测试

新增或扩展 `chat` 相关测试，覆盖：

1. `chat_list` 正常返回会话列表。
2. `chat_list` 分页拼接与 `count` 截断。
3. `message_get_history` 正常返回历史消息。
4. `message_get_history` 在空消息场景返回空提示。
5. 未登录场景返回认证错误。

### 7.2 手工验收

1. 执行 `auth_login` 并完成登录。
2. 调用 `chat_list` 获取 `chat_id`。
3. 调用 `message_get_history` 验证群聊与单聊历史读取。

验收标准：
- 工具稳定返回数据；
- 参数非法场景有明确报错；
- README 文档与实现一致。

## 8. 文档更新

更新 `README.md`：

1. 可用工具数量从 14 调整为 16。
2. 在“聊天（机器人身份）”外新增“聊天读取（用户身份）”或同节明确标注。
3. 增加两个工具说明：
   - `chat_list`
   - `message_get_history`
4. 在权限清单中确认消息读取权限项（按实际飞书权限命名补充）。

## 9. 风险与缓解

1. 风险：不同租户对消息字段返回差异。
   - 缓解：对可选字段做容错，输出最小公共字段。
2. 风险：大量历史消息导致响应过长。
   - 缓解：`count` 上限设为 100，文本摘要截断。
3. 风险：发送与读取身份混淆。
   - 缓解：工具说明中显式注明鉴权身份与前置条件。

## 10. 里程碑

1. 实现 `chat_list` + `message_get_history`。
2. 补齐测试。
3. 更新 README。
4. 本地测试通过后进入实现计划阶段。