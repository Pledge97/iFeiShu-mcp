/**
 * MCP 工具调用日志工具。
 * 每次工具被调用时输出时间戳、工具名称和传参，方便排查问题。
 */
export function logToolCall(tool: string, args: Record<string, unknown>): void {
  const time = new Date().toISOString();
  console.log(`[${time}] tool=${tool} args=${JSON.stringify(args)}`);
}
