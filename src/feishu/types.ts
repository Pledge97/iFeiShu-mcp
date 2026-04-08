export interface FeishuResponse<T> {
  code: number;
  msg: string;
  data: T;
}

export interface Session {
  session_id: string;
  open_id: string;
  user_name: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;   // Unix 秒
  updated_at: number;
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
