import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * AI 助手配置 Store
 *
 * 支持配置 Deepseek API、OpenAI 兼容 API 等。
 * 字段:
 *  - provider: 'deepseek' | 'openai' | 'custom'
 *  - apiKey: 用户 API key（明文，仅保存在本地 localStorage）
 *  - baseUrl: API base URL（如 https://api.deepseek.com/v1）
 *  - model: 模型名（如 deepseek-chat, gpt-4o-mini, ...）
 *  - temperature: 0~2 之间的浮点数
 *  - maxTokens: 单次最大 token 数
 *  - systemPrompt: 自定义系统提示词
 *  - enabled: 是否启用（未配置或 key 为空则视为禁用）
 *
 * 安全注意：API key 仅保存在 localStorage（明文），不会发送到任何第三方服务器。
 * 应用调用模型时直接通过用户配置的 baseUrl 发起请求。
 */

export type AIProvider = 'deepseek' | 'openai' | 'ollama';

export type AIModel = string;

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
  model: AIModel;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  stream: boolean;
  // 多模态图片（仅当模型支持）
  enableImages: boolean;
  // 当前 Agent 角色
  agentRole: AgentRoleId;
  // 当前选中的 Skills
  skills: SkillId[];
  /**
   * OpenAI 兼容模式下的自定义提供商品牌 ID（用于显示图标）。
   * 取值：'openai' | 'anthropic' | 'gemini' | 'qwen' | 'deepseek' |
   *       'mistral' | 'llama' | 'grok' | 'cohere' | 'moonshot' | 'zhipu' |
   *       'hunyuan' | 'wenxin' | 'spark' | 'doubao' | 'yi' | 'baichuan' |
   *       'ollama' | 'custom'（用 Server 图标）
   */
  openaiBrand?: string;
}

export type AgentRoleId = 'dataAnalyst' | 'statistician' | 'coder' | 'researcher' | 'general';

export type SkillId = 'webSearch' | 'codeRun' | 'fileOps' | 'sqlQuery' | 'chartDraw' | 'webBrowse';

export interface AgentRole {
  id: AgentRoleId;
  label: string;
  desc: string;
  /** 图标标识（用于菜单项左侧彩色图标，渲染端用 switch 映射到 lucide-react 组件） */
  icon: AgentRoleIcon;
  systemPrompt: string;
}

export type AgentRoleIcon =
  | "general"
  | "dataAnalyst"
  | "statistician"
  | "coder"
  | "researcher";

export interface Skill {
  id: SkillId;
  label: string;
  desc: string;
  /** 图标标识 */
  icon: SkillIcon;
}

export type SkillIcon =
  | "codeRun"
  | "fileOps"
  | "sqlQuery"
  | "chartDraw"
  | "webSearch"
  | "webBrowse";

/**
 * 史诗级预设提示词（紧凑、高密度，避免浪费 token）。
 *
 * 设计原则：
 *  - 角色定位一句话精准（让模型立刻进入状态）
 *  - 强制"可执行优先"：先给能跑的最简示例，再补完整方案
 *  - 强制"诚实优先"：不确定就直说，绝不编造函数/参数/包
 *  - 强制"输出结构"：结论→数据/代码→注意事项，避免大段空话
 *  - 强制"语言风格"：中文优先；公式用 $$...$$ 块级；图用 mermaid
 *  - 每个角色都自包含、可独立工作，不依赖 systemPrompt 默认值
 */
export const AGENT_ROLES: AgentRole[] = [
  {
    id: 'general',
    label: '通用助手',
    desc: '默认角色，Stata/Python/R 通用',
    icon: 'general',
    systemPrompt:
      '你是 MellowAgent（米洛助手），PocketData 内置的 AI 助手，不是任何外部产品。\n' +
      '【领域】Stata / Python (pandas/numpy/sklearn/matplotlib) / R 数据工作。\n' +
      '【规则】(1) 短答案优先，需要时再展开；(2) 不确定就直说，绝不编造函数/参数/包名；(3) 涉及统计的给可运行代码 + 一句假设说明；(4) 公式用 $$...$$；图用 mermaid；中文输出。',
  },
  {
    id: 'dataAnalyst',
    label: '数据分析师',
    desc: 'EDA / 清洗 / 特征工程 / 可视化',
    icon: 'dataAnalyst',
    systemPrompt:
      '你是 MellowAgent 的"数据分析师"角色。\n' +
      '【工作流】1) describe 看结构 → 2) 缺失/异常/重复 → 3) 单变量分布 → 4) 双变量关系 → 5) 业务结论。\n' +
      '【输出】每步先一句结论，再给一段 Stata / Python / R 代码（含必要 import / seed）。\n' +
      '【风格】中文，markdown 代码块带语言标签；不要堆术语；图用 matplotlib/seaborn/plotly 优先；公式用 $$...$$。',
  },
  {
    id: 'statistician',
    label: '统计学家',
    desc: '回归 / 推断 / 因果 / 模型选择',
    icon: 'statistician',
    systemPrompt:
      '你是 MellowAgent 的"统计学家"角色。\n' +
      '【流程】陈述假设 → 写模型（$$...$$ 块级 LaTeX）→ 给估计代码 → 解释系数（符号/量级/显著性）→ 提示稳健性（异方差 Robust SE、多重共线 VIF、Bootstrap）。\n' +
      '【纪律】p 值 ≠ 效应量；相关 ≠ 因果；样本量 < 30 时优先非参；多重比较要校正。\n' +
      '【输出】中文；公式用 $$...$$；代码加语言标签；不要伪造文献。',
  },
  {
    id: 'coder',
    label: '代码工程师',
    desc: 'Stata / Python / R 编程与调试',
    icon: 'coder',
    systemPrompt:
      '你是 MellowAgent 的"代码工程师"角色。\n' +
      '【原则】可执行 > 优雅；最小可复现示例 (data shape + 期望 I/O) > 长篇分析；报错先看 traceback 最后一行；删除未用 import。\n' +
      '【风格】中文注释；变量名 snake_case；函数 <= 50 行；输出 markdown ```语言\\n…```；长输出用 tqdm/tqdm.notebook。\n' +
      '【调试】复现步骤 → 最小输入 → 假设 → 验证 → 修复 → 增加回归测试。',
  },
  {
    id: 'researcher',
    label: '研究助理',
    desc: '文献综述 / 研究设计 / 论文写作',
    icon: 'researcher',
    systemPrompt:
      '你是 MellowAgent 的"研究助理"角色。\n' +
      '【结构】摘要（≤150 字）→ 方法 → 发现 → 局限 → 下一步。\n' +
      '【引用】用 (作者, 年份) 风格；不伪造文献；图用 mermaid（流程/架构/时序）。\n' +
      '【写作】避免被动语态堆砌；术语首次出现给中文+英文+缩写；公式用 $$...$$；图表必须有 caption 候选。\n' +
      '【纪律】区分"已有证据"与"假设"；不可证伪的陈述要明确标注。',
  },
];

export const SKILLS: Skill[] = [
  { id: 'codeRun', label: '运行代码', desc: '在你的终端中执行 Stata / Python / R 代码并回显结果', icon: 'codeRun' },
  { id: 'fileOps', label: '读写文件', desc: '读取、创建、修改项目文件', icon: 'fileOps' },
  { id: 'sqlQuery', label: '查询数据', desc: '对打开的数据表执行查询与汇总', icon: 'sqlQuery' },
  { id: 'chartDraw', label: '绘制图表', desc: '生成直方图 / 散点图 / 折线图等', icon: 'chartDraw' },
  { id: 'webSearch', label: '联网搜索', desc: '在网络上检索最新信息与文档', icon: 'webSearch' },
  { id: 'webBrowse', label: '抓取网页', desc: '抓取指定 URL 的网页内容', icon: 'webBrowse' },
];

/**
 * 欢迎页快速提示（与 systemPrompt 分离，避免污染上下文）。
 * 设计原则：
 *  - 一句话描述场景 + 一个示例指令（可点击直接发送）
 *  - 中文，<30 字，不超过 3 条
 *  - 缺省角色下系统提示已很短，这里只是建议，不影响 token
 */
export const PROMPT_SUGGESTIONS: { label: string; text: string }[] = [
  { label: '写 Stata 描述统计', text: '请写一段 Stata 代码，对当前打开的数据集做描述统计' },
  { label: '跑 Python 回归', text: '请用 Python 写一段 OLS 回归，输出系数表与 R²' },
  { label: '解释 regress 输出', text: '请逐项解释 regress 命令的输出字段' },
];

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  // 流式输出中：true 表示仍在生成
  pending?: boolean;
  // 错误信息
  error?: string;
  // 用户中断生成（用于显示"继续生成"按钮）
  interrupted?: boolean;
  createdAt: number;
}

// ===== 模块级 AbortController（非响应式，不触发重渲染）=====
let currentAbortController: AbortController | null = null;

/** 设置当前正在进行的请求 controller（供 AIAssistant 在发起 fetch 时调用） */
export function setAbortController(controller: AbortController | null) {
  currentAbortController = controller;
}

// ===== 模块级 token 批量缓冲（减少高频 store 更新）=====
let appendBuffer = new Map<string, string>();
let appendFlushTimer: ReturnType<typeof setTimeout> | null = null;

const DEFAULTS: Record<AIProvider, Omit<AIConfig, 'provider'>> = {
  deepseek: {
    apiKey: '',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    temperature: 0.7,
    maxTokens: 2048,
    systemPrompt:
      '你是 MellowAgent（米洛助手），PocketData 内置的 AI 助手。专注 Stata/Python/R 数据处理与统计建模。回答用清晰中文，必要时给可运行代码。',
    stream: true,
    enableImages: false,
    agentRole: 'dataAnalyst',
    skills: ['codeRun', 'fileOps'],
  },
  openai: {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 2048,
    systemPrompt:
      '你是 MellowAgent（米洛助手），PocketData 内置的 AI 助手。请用清晰中文回答数据处理、统计建模相关问题。',
    stream: true,
    enableImages: true,
    agentRole: 'dataAnalyst',
    skills: ['codeRun', 'fileOps'],
  },
  ollama: {
    apiKey: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1',
    temperature: 0.7,
    maxTokens: 2048,
    systemPrompt:
      '你是 MellowAgent（米洛助手），运行在本地 Ollama 上。请用清晰中文回答数据处理、统计建模相关问题。',
    stream: true,
    enableImages: false,
    agentRole: 'dataAnalyst',
    skills: ['codeRun', 'fileOps'],
  },
};

interface AIState {
  config: AIConfig;
  messages: ChatMessage[];
  enabled: boolean;
  /** 已保存的配置预设（命名配置） */
  presets: AIPreset[];
  /** 对话会话（多会话历史） */
  sessions: AISession[];
  /** 当前激活的会话 ID */
  activeSessionId: string | null;
  // 操作
  setProvider: (p: AIProvider) => void;
  updateConfig: (patch: Partial<AIConfig>) => void;
  resetConfig: () => void;
  /** 保存当前配置为命名预设 */
  savePreset: (name: string) => void;
  /** 加载已保存的预设 */
  loadPreset: (id: string) => void;
  /** 删除预设 */
  deletePreset: (id: string) => void;
  /** 重命名预设 */
  renamePreset: (id: string, name: string) => void;
  /** 导出所有预设（返回 JSON 字符串） */
  exportPresets: () => string;
  /** 导入预设 */
  importPresets: (json: string) => { ok: boolean; added: number; error?: string };
  addMessage: (m: Omit<ChatMessage, 'id' | 'createdAt'>) => string;
  appendToMessage: (id: string, delta: string) => void;
  setMessagePending: (id: string, pending: boolean) => void;
  setMessageError: (id: string, error: string | null) => void;
  removeMessage: (id: string) => void;
  /** 修改指定消息的内容（用于编辑已发送消息） */
  updateMessageContent: (id: string, content: string) => void;
  /** 删除指定消息及其之后的所有消息（用于"回退到消息发出前"） */
  truncateFromMessage: (id: string) => void;
  /** 重新生成指定助手消息（清空内容并标记为 pending；调用方负责重新发起请求） */
  resetMessageForRegenerate: (id: string) => void;
  /** 中断当前生成：abort fetch 并标记消息为 interrupted */
  stopGeneration: () => void;
  /** 标记消息为已中断（显示"继续生成"按钮） */
  setMessageInterrupted: (id: string, interrupted: boolean) => void;
  /** 立即刷新 token 批量缓冲（在 setMessagePending 前调用确保最后几个 token 已写入） */
  flushAppendBuffer: () => void;
  clearMessages: () => void;
  /** 创建新会话并激活（清空当前 messages 之前会先保存到历史） */
  createSession: (title?: string) => string;
  /** 切换到指定会话（会恢复 messages） */
  switchSession: (id: string) => void;
  /** 删除指定会话 */
  deleteSession: (id: string) => void;
  /** 重命名会话 */
  renameSession: (id: string, title: string) => void;
  /** 导出会话（可指定单个 id 或全部），返回 JSON 字符串 */
  exportSessions: (ids?: string[]) => string;
  /** 导入会话：返回 { ok, added, error? } */
  importSessions: (json: string) => { ok: boolean; added: number; error?: string };
  /** 清空全部会话 */
  clearAllSessions: () => void;
  isReady: () => boolean;
}

export interface AIPreset {
  id: string;
  name: string;
  config: AIConfig;
  createdAt: number;
  updatedAt: number;
}

export interface AISession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export const useAIStore = create<AIState>()(
  persist(
    (set, get) => ({
      config: { provider: 'deepseek', ...DEFAULTS.deepseek },
      messages: [],
      enabled: false,
      presets: [],
      sessions: [],
      activeSessionId: null,

      setProvider: (p) => {
        set({
          config: { provider: p, ...DEFAULTS[p] },
        });
      },

      updateConfig: (patch) => {
        set((state) => ({ config: { ...state.config, ...patch } }));
      },

      resetConfig: () => {
        set({ config: { provider: 'deepseek', ...DEFAULTS.deepseek } });
      },

      savePreset: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const { config, presets } = get();
        const now = Date.now();
        const existing = presets.find((p) => p.name === trimmed);
        if (existing) {
          set({
            presets: presets.map((p) =>
              p.id === existing.id ? { ...p, config, updatedAt: now } : p
            ),
          });
        } else {
          set({
            presets: [
              ...presets,
              {
                id: `preset_${now}_${Math.random().toString(36).slice(2, 6)}`,
                name: trimmed,
                config: { ...config },
                createdAt: now,
                updatedAt: now,
              },
            ],
          });
        }
      },

      loadPreset: (id) => {
        const preset = get().presets.find((p) => p.id === id);
        if (preset) set({ config: { ...preset.config } });
      },

      deletePreset: (id) => {
        set((state) => ({ presets: state.presets.filter((p) => p.id !== id) }));
      },

      renamePreset: (id, name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        set((state) => ({
          presets: state.presets.map((p) =>
            p.id === id ? { ...p, name: trimmed, updatedAt: Date.now() } : p
          ),
        }));
      },

      exportPresets: () => {
        return JSON.stringify({ version: 1, presets: get().presets }, null, 2);
      },

      importPresets: (json) => {
        try {
          const parsed = JSON.parse(json);
          if (!parsed || !Array.isArray(parsed.presets)) {
            return { ok: false, added: 0, error: '格式错误：缺少 presets 数组' };
          }
          const incoming: AIPreset[] = parsed.presets
            .filter((p: any) => p && typeof p.name === 'string' && p.config)
            .map((p: any) => ({
              id: p.id || `preset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              name: p.name,
              config: p.config,
              createdAt: p.createdAt || Date.now(),
              updatedAt: p.updatedAt || Date.now(),
            }));
          if (incoming.length === 0) {
            return { ok: false, added: 0, error: '未找到有效配置' };
          }
          // 合并：按 name 去重（已存在则覆盖）
          const { presets: existing } = get();
          const map = new Map(existing.map((p) => [p.name, p]));
          for (const p of incoming) map.set(p.name, p);
          set({ presets: Array.from(map.values()) });
          return { ok: true, added: incoming.length };
        } catch (e) {
          return { ok: false, added: 0, error: e instanceof Error ? e.message : String(e) };
        }
      },

      addMessage: (m) => {
        const id = `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        set((state) => ({
          messages: [...state.messages, { ...m, id, createdAt: Date.now() }],
        }));
        return id;
      },

      appendToMessage: (id, delta) => {
        // 批量缓冲：累积 delta，每 16ms 刷新一次，避免高频 token 触发过多 store 更新
        appendBuffer.set(id, (appendBuffer.get(id) ?? "") + delta);
        if (appendFlushTimer === null) {
          appendFlushTimer = setTimeout(() => {
            appendFlushTimer = null;
            const buffer = appendBuffer;
            appendBuffer = new Map();
            if (buffer.size === 0) return;
            const t0 = performance.now();
            set((state) => ({
              messages: state.messages.map((msg) => {
                const d = buffer.get(msg.id);
                return d ? { ...msg, content: msg.content + d } : msg;
              }),
            }));
            const dt = performance.now() - t0;
            if (dt > 8) {
              console.warn(`[aiStore] appendToMessage flush 耗时 ${dt.toFixed(1)}ms (buffer=${buffer.size})`);
            }
          }, 16);
        }
      },

      flushAppendBuffer: () => {
        if (appendFlushTimer !== null) {
          clearTimeout(appendFlushTimer);
          appendFlushTimer = null;
        }
        const buffer = appendBuffer;
        appendBuffer = new Map();
        if (buffer.size === 0) return;
        set((state) => ({
          messages: state.messages.map((msg) => {
            const d = buffer.get(msg.id);
            return d ? { ...msg, content: msg.content + d } : msg;
          }),
        }));
      },

      setMessagePending: (id, pending) => {
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === id
              ? { ...msg, pending, ...(pending ? { interrupted: false } : {}) }
              : msg
          ),
        }));
      },

      setMessageError: (id, error) => {
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === id ? { ...msg, error: error || undefined } : msg
          ),
        }));
      },

      removeMessage: (id) => {
        set((state) => ({
          messages: state.messages.filter((m) => m.id !== id),
        }));
      },

      updateMessageContent: (id, content) => {
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === id ? { ...msg, content, error: undefined } : msg
          ),
        }));
      },

      truncateFromMessage: (id) => {
        set((state) => {
          const idx = state.messages.findIndex((m) => m.id === id);
          if (idx < 0) return state;
          return { messages: state.messages.slice(0, idx) };
        });
      },

      resetMessageForRegenerate: (id) => {
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === id
              ? { ...msg, content: "", pending: true, error: undefined, interrupted: false }
              : msg
          ),
        }));
      },

      stopGeneration: () => {
        if (currentAbortController) {
          currentAbortController.abort();
          currentAbortController = null;
        }
      },

      setMessageInterrupted: (id, interrupted) => {
        // 先刷新缓冲确保内容完整
        if (appendFlushTimer !== null) {
          clearTimeout(appendFlushTimer);
          appendFlushTimer = null;
        }
        const buffer = appendBuffer;
        appendBuffer = new Map();
        set((state) => ({
          messages: state.messages.map((msg) => {
            if (msg.id !== id) return msg;
            const d = buffer.get(id);
            return {
              ...msg,
              content: d ? msg.content + d : msg.content,
              interrupted,
              pending: false,
            };
          }),
        }));
      },

      clearMessages: () => set({ messages: [] }),

      createSession: (title) => {
        const { messages, sessions, activeSessionId } = get();
        const now = Date.now();
        // 先保存当前会话到历史（如果存在消息）
        let nextSessions = sessions;
        if (activeSessionId && messages.length > 0) {
          nextSessions = sessions.map((s) =>
            s.id === activeSessionId
              ? { ...s, messages: [...messages], updatedAt: now }
              : s
          );
        } else if (messages.length > 0) {
          // 没有活动会话但有消息，先保存为旧会话
          const oldId = `session_${now}_${Math.random().toString(36).slice(2, 6)}`;
          nextSessions = [
            ...sessions,
            {
              id: oldId,
              title: title || '历史会话',
              messages: [...messages],
              createdAt: now,
              updatedAt: now,
            },
          ];
        }
        // 创建新会话
        const newId = `session_${now}_${Math.random().toString(36).slice(2, 6)}`;
        const newSession: AISession = {
          id: newId,
          title: title || '新对话',
          messages: [],
          createdAt: now,
          updatedAt: now,
        };
        set({
          sessions: [...nextSessions, newSession],
          activeSessionId: newId,
          messages: [],
        });
        return newId;
      },

      switchSession: (id) => {
        const { sessions, messages, activeSessionId } = get();
        const target = sessions.find((s) => s.id === id);
        if (!target) return;
        const now = Date.now();
        // 先保存当前会话
        let nextSessions = sessions;
        if (activeSessionId && messages.length > 0) {
          nextSessions = sessions.map((s) =>
            s.id === activeSessionId
              ? { ...s, messages: [...messages], updatedAt: now }
              : s
          );
        }
        set({
          sessions: nextSessions,
          activeSessionId: id,
          messages: [...target.messages],
        });
      },

      deleteSession: (id) => {
        const { sessions, activeSessionId } = get();
        const filtered = sessions.filter((s) => s.id !== id);
        set({ sessions: filtered });
        // 如果删除的是当前会话，切换到最近的会话或清空
        if (id === activeSessionId) {
          const last = filtered[filtered.length - 1];
          if (last) {
            set({ activeSessionId: last.id, messages: [...last.messages] });
          } else {
            set({ activeSessionId: null, messages: [] });
          }
        }
      },

      renameSession: (id, title) => {
        const trimmed = title.trim();
        if (!trimmed) return;
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, title: trimmed, updatedAt: Date.now() } : s
          ),
        }));
      },

      exportSessions: (ids) => {
        const all = get().sessions;
        const target = ids && ids.length > 0 ? all.filter((s) => ids.includes(s.id)) : all;
        // 同时把当前活动 messages 一起打包（如果活动会话不在 target 中）
        const { messages, activeSessionId } = get();
        const active = activeSessionId ? all.find((s) => s.id === activeSessionId) : null;
        const merged: AISession[] = [...target];
        if (active && !merged.find((s) => s.id === active.id)) {
          merged.push({ ...active, messages: [...messages] });
        }
        return JSON.stringify(
          {
            version: 1,
            kind: "pocketdata-ai-sessions",
            exportedAt: Date.now(),
            sessions: merged,
          },
          null,
          2
        );
      },

      importSessions: (json) => {
        try {
          const parsed = JSON.parse(json);
          if (!parsed || !Array.isArray(parsed.sessions)) {
            return { ok: false, added: 0, error: "格式错误：缺少 sessions 数组" };
          }
          const incoming: AISession[] = parsed.sessions
            .filter((s: any) => s && typeof s.title === "string" && Array.isArray(s.messages))
            .map((s: any) => ({
              id: s.id || `session_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              title: s.title,
              messages: s.messages,
              createdAt: s.createdAt || Date.now(),
              updatedAt: s.updatedAt || Date.now(),
            }));
          if (incoming.length === 0) {
            return { ok: false, added: 0, error: "未找到有效会话" };
          }
          // 合并：按 id 去重（已存在则跳过以避免覆盖；用户可手动删除旧版）
          const { sessions: existing } = get();
          const existingIds = new Set(existing.map((s) => s.id));
          const toAdd = incoming.filter((s) => !existingIds.has(s.id));
          set({ sessions: [...existing, ...toAdd] });
          return { ok: true, added: toAdd.length };
        } catch (e) {
          return { ok: false, added: 0, error: e instanceof Error ? e.message : String(e) };
        }
      },

      clearAllSessions: () => {
        const { activeSessionId } = get();
        set({ sessions: [], activeSessionId: null, messages: [] });
        // 防止 TS 报 unused 警告
        void activeSessionId;
      },

      isReady: () => {
        const { config } = get();
        if (config.provider === 'ollama') {
          // Ollama 走本地，无需 key
          return Boolean(config.baseUrl && config.model);
        }
        return Boolean(config.apiKey && config.baseUrl && config.model);
      },
    }),
    {
      name: 'pocketdata-ai',
      version: 3,
      partialize: (state) => ({
        config: state.config,
        // 持久化时清除 pending / interrupted 标志：
        // 如果应用在生成中关闭，pending 消息会残留；重启后没有 fetch 在进行，
        // 导致永久卡在"生成中"。清理后这些消息显示为普通已完成消息。
        messages: state.messages.map((m) => ({
          ...m,
          pending: false,
          interrupted: false,
        })),
        presets: state.presets,
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
      }),
      // 迁移：v1 的 'custom' provider 合并到 'openai'（OpenAI 兼容）
      migrate: (persisted: any, version) => {
        if (!persisted) return persisted as any;
        const cfg = persisted.config;
        if (version < 2) {
          if (cfg && cfg.provider === 'custom') {
            cfg.provider = 'openai';
          }
        }
        // 补齐新增字段
        if (cfg && cfg.enableImages === undefined) cfg.enableImages = cfg.provider === 'openai';
        if (cfg && !cfg.agentRole) cfg.agentRole = 'dataAnalyst';
        if (cfg && !Array.isArray(cfg.skills)) cfg.skills = ['codeRun', 'fileOps'];
        // v3：补齐 presets
        if (version < 3 && !Array.isArray(persisted.presets)) {
          persisted.presets = [];
        }
        // 清理残留的 pending / interrupted 标志
        // 场景：应用在 AI 生成中关闭 → 重启后 messages 中有 pending:true
        // 但实际没有 fetch 在进行，必须清除否则 UI 卡死
        if (Array.isArray(persisted.messages)) {
          persisted.messages = persisted.messages.map((m: any) => ({
            ...m,
            pending: false,
            interrupted: false,
          }));
        }
        return persisted as any;
      },
    }
  )
);

/** 内置提供商预设 */
export const AI_PROVIDER_PRESETS: { id: AIProvider; label: string; defaultBaseUrl: string; defaultModel: string; needsApiKey: boolean }[] = [
  {
    id: 'deepseek',
    label: 'Deepseek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    needsApiKey: true,
  },
  {
    id: 'openai',
    label: 'OpenAI 兼容',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    needsApiKey: true,
  },
  {
    id: 'ollama',
    label: 'Ollama（本地）',
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.1',
    needsApiKey: false,
  },
];

/** 各提供商的模型候选列表（用于模型下拉） */
export const AI_MODEL_PRESETS: Record<AIProvider, string[]> = {
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1-preview', 'o1-mini'],
  ollama: ['llama3.1', 'llama3.2', 'qwen2.5', 'qwen2.5-coder', 'gemma2', 'mistral', 'deepseek-r1'],
};

/**
 * 模型上下文窗口大小（tokens）
 *  - 数据来源：各厂商官方文档
 *  - 用于"上下文使用率"计算与显示
 *  - 未列出模型走 fallback（按 provider 给一个保守值）
 */
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // Deepseek
  "deepseek-chat": 64000,
  "deepseek-reasoner": 64000,
  // OpenAI
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "gpt-4-turbo": 128000,
  "gpt-4": 8192,
  "gpt-3.5-turbo": 16385,
  "o1-preview": 128000,
  "o1-mini": 128000,
  // Ollama（常见开源模型）
  "llama3.1": 128000,
  "llama3.2": 128000,
  "qwen2.5": 32768,
  "qwen2.5-coder": 32768,
  "gemma2": 8192,
  "mistral": 32768,
  "deepseek-r1": 64000,
};

/**
 * 模型计费（USD / 1M tokens，仅主流厂商，自定义/本地模型无费用）
 *  - 用于"费用估算"展示
 *  - 数据来源：各厂商公开定价（2025 年初）
 *  - 前端展示时按 USD→CNY 汇率换算为 RMB（CONTEXT_USAGE_USD_TO_CNY）
 */
export interface ModelPricing {
  input: number;  // USD per 1M input tokens
  output: number; // USD per 1M output tokens
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "deepseek-chat":     { input: 0.27, output: 1.10 },
  "deepseek-reasoner": { input: 0.55, output: 2.19 },
  "gpt-4o":            { input: 2.50, output: 10.00 },
  "gpt-4o-mini":       { input: 0.15, output: 0.60 },
  "gpt-4-turbo":       { input: 10.00, output: 30.00 },
  "gpt-3.5-turbo":     { input: 0.50, output: 1.50 },
  "o1-preview":        { input: 15.00, output: 60.00 },
  "o1-mini":           { input: 3.00, output: 12.00 },
};

/**
 * USD → CNY 汇率（用于"费用估算"展示，参考 2025 年汇率，约 1:7.2）
 *  - 实际扣费以第三方账单为准，本估算仅供提示
 */
export const USD_TO_CNY = 7.2;

/**
 * 查询模型上下文窗口大小（tokens）
 *  - 精确匹配 → 查表
 *  - 未列出 → 按 provider fallback
 *  - 最终兜底 8192
 */
export function getContextWindow(model: string, provider: AIProvider): number {
  if (MODEL_CONTEXT_WINDOWS[model]) return MODEL_CONTEXT_WINDOWS[model];
  // 模糊匹配（如 gpt-4o-2024-08-06 → gpt-4o）
  for (const key of Object.keys(MODEL_CONTEXT_WINDOWS)) {
    if (model.startsWith(key)) return MODEL_CONTEXT_WINDOWS[key];
  }
  // provider fallback
  const fallback: Record<AIProvider, number> = {
    deepseek: 32000,
    openai: 8192,
    ollama: 8192,
  };
  return fallback[provider] || 8192;
}

/**
 * 查询模型计费
 *  - 未列出 → 返回 null（按"免费"处理）
 */
export function getModelPricing(model: string): ModelPricing | null {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  for (const key of Object.keys(MODEL_PRICING)) {
    if (model.startsWith(key)) return MODEL_PRICING[key];
  }
  return null;
}

/**
 * 估算字符串的 token 数（粗略算法）
 *  - 公式：英文 ~ 4 字符 / token，中文 ~ 1.5 字符 / token
 *  - 仅用于客户端展示，不参与计费决策
 *  - 实测误差：±15%，可接受
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let chineseChars = 0;
  let otherChars = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // CJK 统一汉字 + 扩展 + 假名韩文等
    if (code >= 0x3000 && code <= 0x9fff) chineseChars++;
    else if (code >= 0xac00 && code <= 0xd7af) chineseChars++;
    else if (code >= 0xff00 && code <= 0xffef) chineseChars++;
    else otherChars++;
  }
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}
