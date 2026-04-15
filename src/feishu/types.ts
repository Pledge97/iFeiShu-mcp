export interface FeishuResponse<T> {
  code: number;
  msg: string;
  data: T;
}

/** 持久化到 SQLite 的用户 token，以 open_id 为主键（跨 MCP 连接复用）。 */
export interface Session {
  open_id: string;
  user_name: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;   // Unix 秒
  updated_at: number;
}

/**
 * 单个 MCP 连接的运行时上下文，存活于内存中。
 * openId 在 OAuth 回调完成后写入，工具层通过它查找持久化 token。
 */
export interface SessionContext {
  mcpSessionId: string;   // 传输层 UUID，用于 OAuth state 路由
  openId: string | null;  // 飞书 open_id，登录后才有值
}

export interface AppTokenResponse {
  app_access_token: string;
  expire: number;
}

export interface UserTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in: number;
}

export interface UserInfoResponse {
  open_id: string;
  name: string;
  en_name: string;
  email: string;
}

export interface DocxDocument {
  document_id: string;
  title: string;
  revision_id: number;
}

export interface SearchResult {
  docs_entities: Array<{
    doc_token: string;
    doc_type: string;
    title: string;
    url: string;
    owner_id: string;
    create_time: string;
    edit_time: string;
  }>;
  has_more: boolean;
  total: number;
}

export interface WikiSpace {
  space_id: string;
  name: string;
  description: string;
}

export interface WikiNode {
  space_id: string;
  node_token: string;
  obj_token: string;
  obj_type: string;
  title: string;
  has_child: boolean;
  parent_node_token: string;
}

export interface Message {
  message_id: string;
  chat_id: string;
  msg_type: string;
  create_time: string;
}

export interface Chat {
  chat_id: string;
  name: string;
}

export interface UserIdBatchResult {
  user_list: Array<{
    email: string;
    user_id: string;
    open_id: string;
  }>;
}
