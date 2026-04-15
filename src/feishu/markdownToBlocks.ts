/** 飞书 block 结构（写入 API 时使用） */
export type FeishuBlock = Record<string, unknown>;

/** 飞书 text element（text_run） */
interface TextElement {
  text_run: {
    content: string;
    text_element_style?: {
      bold?: boolean;
      italic?: boolean;
      strikethrough?: boolean;
      inline_code?: boolean;
    };
  };
}

/** 普通 block 项 */
export interface SimpleBlockItem {
  kind: 'block';
  data: FeishuBlock;
}

/** 表格描述符（需要多步 API 调用，单独处理） */
export interface TableDescriptor {
  kind: 'table';
  headers: string[];
  rows: string[][];
}

export type BlockItem = SimpleBlockItem | TableDescriptor;

/** 客户端接口（兼容 axios 实例） */
interface DocClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  post: (url: string, data?: unknown) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: (url: string, config?: any) => Promise<any>;
}

/** 在两次 API 调用之间等待指定毫秒，避免触发 429 限流 */
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 解析行内 Markdown 为飞书 text elements。
 * 支持：**粗体**、*斜体*、~~删除线~~、`行内代码`、普通文本。
 */
function parseInlineElements(text: string): TextElement[] {
  const elements: TextElement[] = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~|`(.+?)`|([^*~`]+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match[1] !== undefined) {
      elements.push({ text_run: { content: match[1], text_element_style: { bold: true } } });
    } else if (match[2] !== undefined) {
      elements.push({ text_run: { content: match[2], text_element_style: { italic: true } } });
    } else if (match[3] !== undefined) {
      elements.push({ text_run: { content: match[3], text_element_style: { strikethrough: true } } });
    } else if (match[4] !== undefined) {
      elements.push({ text_run: { content: match[4], text_element_style: { inline_code: true } } });
    } else if (match[5] !== undefined) {
      elements.push({ text_run: { content: match[5] } });
    }
  }

  if (elements.length === 0) {
    elements.push({ text_run: { content: '' } });
  }
  return elements;
}

/** 构造带 elements 的 SimpleBlockItem */
function makeBlock(blockType: number, key: string, elements: TextElement[]): SimpleBlockItem {
  return { kind: 'block', data: { block_type: blockType, [key]: { elements, style: {} } } };
}

/** 解析一行表格单元格（去除首尾 | 后按 | 分割） */
function parseTableRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
}

/** 判断是否为表格分隔行（如 |---|:---:|---| ） */
function isTableSeparator(line: string): boolean {
  return /^\|[\s\-:|]+\|/.test(line.trim());
}

/**
 * 将 Markdown 字符串解析为 BlockItem 数组。
 *
 * 支持的语法：
 * - `# ~ ######`  → heading1~6（block_type 3~8）
 * - `- / * / +`   → 无序列表（block_type 12）
 * - `1. 2. ...`   → 有序列表（block_type 13）
 * - ` ``` ``` `   → 代码块（block_type 14）
 * - `---` / `***` → 分隔线（block_type 22）
 * - `| 表格 |`    → 飞书 table（block_type 31）
 * - 其余行        → 段落（block_type 2）
 * - 行内：**粗体**、*斜体*、~~删除线~~、`行内代码`
 */
export function markdownToFeishuBlocks(markdown: string): BlockItem[] {
  const lines = markdown.split('\n');
  const items: BlockItem[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── 代码块 ─────────────────────────────────────────────────────────
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // 跳过结束 ```
      items.push({
        kind: 'block',
        data: {
          block_type: 14,
          code: {
            elements: [{ text_run: { content: codeLines.join('\n') } }],
            style: { language: 1 },
          },
        },
      });
      continue;
    }

    // ── 分隔线 ─────────────────────────────────────────────────────────
    if (/^(---+|\*\*\*+|___+)\s*$/.test(line)) {
      items.push({ kind: 'block', data: { block_type: 22 } });
      i++;
      continue;
    }

    // ── Markdown 表格 ──────────────────────────────────────────────────
    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = parseTableRow(line);
      i += 2; // 跳过 header 行和分隔行
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      items.push({ kind: 'table', headers, rows });
      continue;
    }

    // ── 标题 ───────────────────────────────────────────────────────────
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 6);
      const blockType = level + 2; // # → 3, ## → 4, ... ###### → 8
      items.push(makeBlock(blockType, `heading${level}`, parseInlineElements(headingMatch[2])));
      i++;
      continue;
    }

    // ── 无序列表 ───────────────────────────────────────────────────────
    const bulletMatch = line.match(/^[-*+]\s+(.+)/);
    if (bulletMatch) {
      items.push(makeBlock(12, 'bullet', parseInlineElements(bulletMatch[1])));
      i++;
      continue;
    }

    // ── 有序列表 ───────────────────────────────────────────────────────
    const orderedMatch = line.match(/^\d+\.\s+(.+)/);
    if (orderedMatch) {
      items.push(makeBlock(13, 'ordered', parseInlineElements(orderedMatch[1])));
      i++;
      continue;
    }

    // ── 空行（跳过） ───────────────────────────────────────────────────
    if (line.trim() === '') {
      i++;
      continue;
    }

    // ── 普通段落 ───────────────────────────────────────────────────────
    items.push(makeBlock(2, 'text', parseInlineElements(line)));
    i++;
  }

  return items;
}

/** 将普通 block 批量 POST 到文档（每批最多 50 个，批次间等待 200ms） */
async function flushSimpleBlocks(
  client: DocClient,
  documentId: string,
  blocks: FeishuBlock[]
): Promise<void> {
  for (let i = 0; i < blocks.length; i += 50) {
    if (i > 0) await sleep(200);
    await client.post(
      `/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
      { children: blocks.slice(i, i + 50) }
    );
  }
}

/**
 * 在文档中创建飞书 table block 并逐格填充内容。
 * ① 创建 table block（block_type: 31）
 * ② 获取自动生成的 cell block IDs（block_type: 32）
 * ③ 按行列顺序逐格写入文本内容
 */
async function createFeishuTable(
  client: DocClient,
  documentId: string,
  table: TableDescriptor
): Promise<void> {
  const allRows = [table.headers, ...table.rows];
  const rowSize = allRows.length;
  const columnSize = table.headers.length;

  // ① 创建 table block
  const createRes = await client.post(
    `/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
    {
      children: [{
        block_type: 31,
        table: {
          property: { row_size: rowSize, column_size: columnSize, header_row: true },
        },
      }],
    }
  );

  const tableBlockId: string | undefined = createRes?.data?.children?.[0]?.block_id;
  if (!tableBlockId) return;

  // ② 获取 cell 子块
  const cellsRes = await client.get(
    `/docx/v1/documents/${documentId}/blocks/${tableBlockId}/children`,
    { params: { page_size: 500 } }
  );
  const tableCells: Array<{ block_id: string; block_type: number }> =
    (cellsRes?.data?.items ?? []).filter((b: { block_type: number }) => b.block_type === 32);

  // ③ 逐格写入（行列顺序，每格间隔 200ms 避免 429）
  for (let r = 0; r < allRows.length; r++) {
    for (let c = 0; c < columnSize; c++) {
      const cell = tableCells[r * columnSize + c];
      if (!cell) continue;
      await sleep(200);
      await client.post(
        `/docx/v1/documents/${documentId}/blocks/${cell.block_id}/children`,
        {
          children: [{
            block_type: 2,
            text: { elements: parseInlineElements(allRows[r][c] ?? ''), style: {} },
          }],
        }
      );
    }
  }
}

/**
 * 将 BlockItem 数组写入飞书文档。
 * - 普通 block 缓冲后每 50 个批量写入
 * - 遇到 table 先 flush 缓冲区，再调用 createFeishuTable（多步 API）
 */
export async function writeBlocksInBatches(
  client: DocClient,
  documentId: string,
  items: BlockItem[]
): Promise<void> {
  let simpleBuffer: FeishuBlock[] = [];

  for (const item of items) {
    if (item.kind === 'block') {
      simpleBuffer.push(item.data);
    } else {
      await flushSimpleBlocks(client, documentId, simpleBuffer);
      simpleBuffer = [];
      await createFeishuTable(client, documentId, item);
    }
  }

  await flushSimpleBlocks(client, documentId, simpleBuffer);
}
