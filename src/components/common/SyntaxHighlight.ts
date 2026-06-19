/**
 * 轻量级代码语法高亮
 *
 * 设计目标：
 *  - 零依赖（不引入 highlight.js / prismjs / shiki）
 *  - 与 Monaco 的 Stata 关键字集对齐
 *  - 支持常见语言：Stata / Python / R / JavaScript / TypeScript / SQL / JSON / Bash / CSS / HTML
 *  - 输出 token 数组：[{type, text}]，由调用方在 React 中渲染 <span>
 *
 * 设计取舍：
 *  - 使用纯正则匹配，复杂度可控，体积小
 *  - 注释/字符串优先匹配，避免被关键字吞掉
 *  - 长字符串使用状态机逐行扫描（一次性 replace 大字符串会很慢）
 */

export type HLTokenType =
  | "keyword"
  | "keyword-control"
  | "keyword-type"
  | "string"
  | "number"
  | "comment"
  | "operator"
  | "punctuation"
  | "function"
  | "variable"
  | "macro"
  | "global"
  | "local"
  | "type"
  | "tag"
  | "attr"
  | "selector"
  | "property"
  | "builtin"
  | "regex"
  | "text";

export interface HLToken {
  type: HLTokenType;
  text: string;
}

interface HLRule {
  type: HLTokenType;
  pattern: string | RegExp;
  /** 仅对正则生效：第几个捕获组是真正的高亮文本（0 表示整体） */
  group?: number;
}

interface HLLanguage {
  /** 注释：单行、多行 */
  comments: { line?: RegExp; block?: [RegExp, RegExp] };
  /** 字符串字面量：单/双/反引号 */
  strings: { quote: string; allowMultiline?: boolean }[];
  /** 数字字面量 */
  numbers: RegExp;
  /** 关键字、类型字、内建、函数前缀等 */
  keywords: string[];
  control?: string[];
  types?: string[];
  builtins?: string[];
  /** 标识符：先于关键字匹配；用于函数名/属性等高亮 */
  identifiers?: RegExp;
  /** 运算符 / 标点 */
  operators?: RegExp;
  /** 额外规则：先行匹配（用于 Stata 全局宏 $name 等） */
  extras?: HLRule[];
}

/**
 * 预编译语言：
 *  - 所有 RegExp 一次性加上 ^ 锚点
 *  - 关键字 / 类型 / 内建 / 控制字提前转 Set
 *  - lastIndex 由调用方在每次匹配前重置（这是 RegExp.exec / RegExp.test
 *    高效复用的关键）
 *  - 设置 SEARCH_CAP：单次 highlight 调用最多推进的字符数。
 *    兜底防止异常输入（缺少结束符的字符串等）导致 while 死循环。
 */
interface CompiledLanguage {
  src: HLLanguage;
  /** 注释：编译后的正则 */
  commentLineRe: RegExp | null;
  commentBlockStart: RegExp | null;
  commentBlockEnd: RegExp | null;
  /** 字符串引号集合 */
  stringQuotes: string[];
  /** 数字正则：已加 ^ */
  numbersRe: RegExp | null;
  /** 关键字、类型、内建、控制字 set（统一小写） */
  keywordSet: Set<string>;
  controlSet: Set<string>;
  typeSet: Set<string>;
  builtinSet: Set<string>;
  /** 标识符 / 函数调用正则（已加 ^） */
  identifiersRe: RegExp | null;
  /** 运算符正则（已加 ^） */
  operatorsRe: RegExp | null;
  /** 额外规则（已加 ^） */
  compiledExtras: { type: HLTokenType; re: RegExp }[];
}

/** 高亮时单次 tokenize 最大推进字符数。10MB 文本也只需 ~10M 步。
 *  超过此长度会被截断以防止病态输入挂死 UI。 */
const TOKENIZE_HARD_CAP = 1_000_000;

/** 预编译所有语言 */
const COMPILED: Record<string, CompiledLanguage> = {};

function anchor(re: RegExp): RegExp {
  // 把正则锚定到当前位置（^）以便 exec/test 一次返回
  // 同时保留原 flags + 移除可能的 g/y 标记
  return new RegExp("^(?:" + re.source + ")", re.flags.replace(/[gy]/g, ""));
}

function compileLang(_name: string, lang: HLLanguage): CompiledLanguage {
  const commentLineRe = lang.comments.line
    ? anchor(lang.comments.line)
    : null;
  const commentBlockStart = lang.comments.block
    ? anchor(lang.comments.block[0])
    : null;
  const commentBlockEnd = lang.comments.block
    ? anchor(lang.comments.block[1])
    : null;
  return {
    src: lang,
    commentLineRe,
    commentBlockStart,
    commentBlockEnd,
    stringQuotes: lang.strings.map((s) => s.quote),
    numbersRe: lang.numbers ? anchor(lang.numbers) : null,
    keywordSet: new Set(lang.keywords.map((k) => k.toLowerCase())),
    controlSet: new Set((lang.control || []).map((k) => k.toLowerCase())),
    typeSet: new Set((lang.types || []).map((k) => k.toLowerCase())),
    builtinSet: new Set((lang.builtins || []).map((k) => k.toLowerCase())),
    identifiersRe: lang.identifiers ? anchor(lang.identifiers) : null,
    operatorsRe: lang.operators ? anchor(lang.operators) : null,
    compiledExtras: (lang.extras || []).map((ex) => ({
      type: ex.type,
      re: anchor(typeof ex.pattern === "string"
        ? new RegExp(ex.pattern)
        : ex.pattern),
    })),
  };
}

const LANGS: Record<string, HLLanguage> = {
  stata: {
    comments: { line: /^\s*(\*|\/\/)/, block: [/\/\*/, /\*\//] },
    strings: [{ quote: '"', allowMultiline: false }, { quote: '`', allowMultiline: false }],
    numbers: /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/i,
    keywords: [
      "use", "save", "import", "export", "outsheet", "insheet", "sysuse", "webuse",
      "generate", "replace", "gen", "egen", "drop", "keep", "recode", "rename",
      "encode", "decode", "destring", "tostring", "sort", "gsort", "order", "aorder",
      "by", "bysort", "merge", "append", "joinby", "cross", "expand", "contract",
      "sample", "count", "summarize", "sum", "describe", "codebook", "list", "browse",
      "tab", "tabulate", "tab1", "tab2", "table", "tabstat", "tabi", "fre",
      "regress", "reg", "logit", "probit", "xtreg", "xtlogit", "xtprobit", "areg",
      "predict", "test", "testparm", "estimates", "esttab", "estout", "eststo",
      "estadd", "margins", "marginsplot", "marginsplot,", "margins",
      "display", "di", "scalar", "matrix", "mkmat", "matname", "matsize", "matlist",
      "foreach", "forvalues", "while", "if", "else", "in", "of", "local", "global",
      "tempfile", "tempname", "tempvar", "preserve", "restore", "capture", "assert",
      "quietly", "noi", "noisily", "include", "do", "run", "doedit", "dofile",
      "exit", "clear", "cls", "set", "version", "about", "adopath", "sysdir",
      "findfile", "which", "macro", "macros", "graph", "twoway", "scatter", "line",
      "lfit", "qfit", "histogram", "kdensity", "lowess", "lpoly", "matrix",
      "svy", "svyset", "svymean", "svyreg", "svytab",
    ],
    control: [
      "if", "else", "foreach", "forvalues", "while", "continue", "break", "in", "of", "return", "exit",
    ],
    types: [],
    builtins: [
      "_n", "_N", "_b", "_se", "_ci", "_coef", "_rc", "_N", "c(level)", "c(pi)",
    ],
    identifiers: /\b[a-zA-Z_][a-zA-Z0-9_]*(?=\s*\()/,
    operators: /[+\-*/=<>!~^&|]+|\.\w+|`[^`]+`/,
    extras: [
      { type: "global", pattern: /\$\{?[\w]+\}?/ },
      { type: "local", pattern: /`[^'`\n]+'/ },
      { type: "macro", pattern: /\$\w+/ },
    ],
  },
  python: {
    comments: { line: /#/, block: [/"""/, /"""/], block2: [/'''/, /'''/] } as any,
    strings: [
      { quote: '"', allowMultiline: true },
      { quote: "'", allowMultiline: true },
    ],
    numbers: /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?(?:j)?\b/i,
    keywords: [
      "and", "as", "assert", "async", "await", "break", "class", "continue", "def",
      "del", "elif", "else", "except", "finally", "for", "from", "global", "if",
      "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise",
      "return", "try", "while", "with", "yield", "match", "case",
    ],
    control: ["if", "else", "elif", "for", "while", "try", "except", "finally", "with", "return", "yield", "break", "continue", "pass"],
    types: [
      "int", "float", "str", "bool", "list", "dict", "tuple", "set", "frozenset",
      "bytes", "bytearray", "memoryview", "complex", "object", "type",
    ],
    builtins: [
      "print", "len", "range", "enumerate", "zip", "map", "filter", "sorted",
      "sum", "min", "max", "abs", "round", "isinstance", "hasattr", "getattr",
      "setattr", "type", "open", "input", "int", "float", "str", "list", "dict",
      "tuple", "set", "bool", "True", "False", "None", "self", "cls",
    ],
    identifiers: /\b[a-zA-Z_][a-zA-Z0-9_]*(?=\s*\()/,
    operators: /[+\-*/%=<>!~^&|]+|->|@/,
  },
  r: {
    comments: { line: /#/ },
    strings: [{ quote: '"', allowMultiline: false }, { quote: "'", allowMultiline: false }],
    numbers: /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/i,
    keywords: [
      "if", "else", "for", "while", "repeat", "function", "return", "break", "next",
      "TRUE", "FALSE", "NULL", "NA", "NaN", "Inf", "in", "...",
    ],
    control: ["if", "else", "for", "while", "repeat", "function", "return", "break", "next"],
    builtins: [
      "c", "list", "vector", "matrix", "data.frame", "factor", "numeric", "character",
      "integer", "logical", "complex", "list", "library", "require", "source", "install.packages",
      "read.csv", "read.table", "write.csv", "write.table", "head", "tail", "summary",
      "str", "dim", "nrow", "ncol", "names", "colnames", "rownames", "subset",
      "merge", "aggregate", "tapply", "sapply", "lapply", "apply", "mapply", "Reduce",
      "Filter", "Map", "do.call", "with", "within", "transform", "mutate", "filter",
      "arrange", "group_by", "summarise", "ggplot", "aes", "geom_point", "geom_line",
      "geom_histogram", "geom_smooth", "facet_wrap", "theme", "labs", "ggtitle",
    ],
    identifiers: /\b[a-zA-Z_.][a-zA-Z0-9_.]*(?=\s*\()/,
    operators: /[+\-*/^<>=!~|&]+|<-|->/,
  },
  javascript: {
    comments: { line: /\/\//, block: [/\/\*/, /\*\//] },
    strings: [
      { quote: '"', allowMultiline: false },
      { quote: "'", allowMultiline: false },
      { quote: "`", allowMultiline: true },
    ],
    numbers: /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?n?\b/i,
    keywords: [
      "var", "let", "const", "function", "return", "if", "else", "for", "while",
      "do", "switch", "case", "default", "break", "continue", "new", "delete",
      "typeof", "instanceof", "in", "of", "this", "super", "class", "extends",
      "static", "get", "set", "async", "await", "yield", "import", "export",
      "from", "as", "try", "catch", "finally", "throw", "void", "null", "undefined",
      "true", "false", "NaN", "Infinity",
    ],
    control: ["if", "else", "for", "while", "do", "switch", "case", "default", "return", "break", "continue", "throw", "try", "catch", "finally"],
    types: [
      "Array", "Object", "String", "Number", "Boolean", "Date", "RegExp", "Error",
      "Map", "Set", "WeakMap", "WeakSet", "Promise", "Symbol", "Function",
    ],
    builtins: ["console", "window", "document", "globalThis", "process", "Math", "JSON", "Object", "Array"],
    identifiers: /\b[a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*\()/,
    operators: /[+\-*/%=<>!~^&|?:]+|=>|\.\.\.|\./,
  },
  typescript: {
    comments: { line: /\/\//, block: [/\/\*/, /\*\//] },
    strings: [
      { quote: '"', allowMultiline: false },
      { quote: "'", allowMultiline: false },
      { quote: "`", allowMultiline: true },
    ],
    numbers: /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?n?\b/i,
    keywords: [
      "var", "let", "const", "function", "return", "if", "else", "for", "while",
      "do", "switch", "case", "default", "break", "continue", "new", "delete",
      "typeof", "instanceof", "in", "of", "this", "super", "class", "extends",
      "implements", "interface", "type", "enum", "namespace", "declare", "abstract",
      "static", "get", "set", "async", "await", "yield", "import", "export",
      "from", "as", "satisfies", "try", "catch", "finally", "throw", "void",
      "null", "undefined", "true", "false", "NaN", "Infinity", "readonly", "private",
      "protected", "public", "override", "keyof", "infer", "is", "never", "unknown",
      "any", "boolean", "number", "string", "symbol", "object", "bigint",
    ],
    control: ["if", "else", "for", "while", "do", "switch", "case", "default", "return", "break", "continue", "throw", "try", "catch", "finally"],
    types: [
      "Array", "Object", "String", "Number", "Boolean", "Date", "RegExp", "Error",
      "Map", "Set", "WeakMap", "WeakSet", "Promise", "Symbol", "Function", "Record",
      "Partial", "Required", "Readonly", "Pick", "Omit", "Exclude", "Extract",
    ],
    builtins: ["console", "window", "document", "globalThis", "process", "Math", "JSON"],
    identifiers: /\b[a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*[<(])/,
    operators: /[+\-*/%=<>!~^&|?:]+|=>|\.\.\.|\./,
  },
  sql: {
    comments: { line: /--/, block: [/\/\*/, /\*\//] },
    strings: [{ quote: "'", allowMultiline: false }, { quote: '"', allowMultiline: false }],
    numbers: /\b\d+(?:\.\d+)?\b/,
    keywords: [
      "SELECT", "FROM", "WHERE", "JOIN", "INNER", "LEFT", "RIGHT", "FULL", "OUTER",
      "ON", "AS", "AND", "OR", "NOT", "IN", "EXISTS", "BETWEEN", "LIKE", "IS",
      "NULL", "TRUE", "FALSE", "GROUP", "BY", "HAVING", "ORDER", "ASC", "DESC",
      "LIMIT", "OFFSET", "UNION", "ALL", "DISTINCT", "INSERT", "INTO", "VALUES",
      "UPDATE", "SET", "DELETE", "CREATE", "TABLE", "DROP", "ALTER", "ADD",
      "COLUMN", "CONSTRAINT", "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "INDEX",
      "VIEW", "TRIGGER", "PROCEDURE", "FUNCTION", "BEGIN", "END", "IF", "ELSE",
      "ELSEIF", "THEN", "CASE", "WHEN", "DECLARE", "CURSOR", "FETCH", "WITH",
      "RECURSIVE", "RETURN", "RETURNS", "LANGUAGE", "REPLACE", "TRUNCATE",
    ],
    control: ["IF", "ELSE", "ELSEIF", "THEN", "END", "CASE", "WHEN", "BEGIN"],
    identifiers: /\b[a-zA-Z_][a-zA-Z0-9_]*(?=\s*\()/,
    operators: /[+\-*/%=<>!~^&|]+/,
  },
  json: {
    comments: {},
    strings: [{ quote: '"', allowMultiline: false }],
    numbers: /-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/i,
    keywords: ["true", "false", "null"],
    identifiers: /(?<=:[\s"])[a-zA-Z_][a-zA-Z0-9_]*/,
    operators: /[{}[\],:]/,
  },
  bash: {
    comments: { line: /#/ },
    strings: [{ quote: '"', allowMultiline: false }, { quote: "'", allowMultiline: false }],
    numbers: /\b\d+(?:\.\d+)?\b/,
    keywords: [
      "if", "then", "else", "elif", "fi", "for", "in", "do", "done", "while",
      "case", "esac", "function", "return", "exit", "break", "continue", "echo",
      "cd", "pwd", "ls", "cat", "grep", "sed", "awk", "cut", "sort", "uniq",
      "head", "tail", "wc", "mkdir", "rmdir", "rm", "cp", "mv", "chmod", "chown",
      "export", "local", "source", "alias", "set", "unset", "read", "printf",
      "test", "true", "false",
    ],
    control: ["if", "then", "else", "elif", "fi", "for", "in", "do", "done", "while", "case", "esac", "function", "return"],
    builtins: ["echo", "cd", "pwd", "ls", "cat", "grep", "sed", "awk", "export", "source", "alias", "set", "unset", "printf", "read", "test"],
    identifiers: /\b[a-zA-Z_][a-zA-Z0-9_]*(?=\s*\()/,
    operators: /[|<>&=;(){}$`\\]+/,
    extras: [
      { type: "variable", pattern: /\$\{?[\w]+\}?/ },
    ],
  },
  css: {
    comments: { block: [/\/\*/, /\*\//] },
    strings: [{ quote: '"', allowMultiline: false }, { quote: "'", allowMultiline: false }],
    numbers: /-?\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|pt|pc|in|cm|mm)?\b/,
    keywords: [
      "important", "media", "keyframes", "from", "to", "and", "or", "not", "only",
    ],
    identifiers: /[.#][a-zA-Z_-][a-zA-Z0-9_-]*/,
    operators: /[{}:;,>~+]+/,
  },
  html: {
    comments: { block: [/<!--/, /-->/] },
    strings: [{ quote: '"', allowMultiline: false }, { quote: "'", allowMultiline: false }],
    numbers: /\b\d+\b/,
    keywords: ["doctype", "html"],
    identifiers: /[a-zA-Z][a-zA-Z0-9-]*/,
    operators: /[<>=\/]+/,
  },
  yaml: {
    comments: { line: /#/ },
    strings: [{ quote: '"', allowMultiline: false }, { quote: "'", allowMultiline: false }],
    numbers: /-?\b\d+(?:\.\d+)?\b/,
    keywords: ["true", "false", "null", "yes", "no", "on", "off", "True", "False", "Null", "Yes", "No"],
    identifiers: /[a-zA-Z_][a-zA-Z0-9_-]*/,
    operators: /[:\-|>]/,
  },
  markdown: {
    comments: {},
    strings: [],
    numbers: /\b\d+\b/,
    keywords: [],
    identifiers: /[a-zA-Z_][a-zA-Z0-9_-]*/,
    operators: /[*_`~#\[\]()]/,
  },
};

/** 规范化语言名 */
function normalizeLang(lang: string | undefined): string {
  if (!lang) return "text";
  const l = lang.toLowerCase().trim();
  if (l === "js" || l === "jsx") return "javascript";
  if (l === "ts" || l === "tsx") return "typescript";
  if (l === "py") return "python";
  if (l === "r" || l === "rscript") return "r";
  if (l === "sh" || l === "shell" || l === "zsh") return "bash";
  if (l === "htm") return "html";
  if (l === "yml") return "yaml";
  if (l === "do" || l === "ado" || l === "mata") return "stata";
  return l;
}

/**
 * 简单的状态机式高亮：将源码切分为 token。
 * 不追求完美高亮，只为常见语言提供 80% 的可读性提升。
 *
 * 性能要点：
 *  - 所有正则提前预编译（anchor + 去掉 g/y），避免每帧重建
 *  - 关键字 / 类型 / 内建 / 控制字都是 Set 查找（O(1)）
 *  - 单次 tokenize 推进字符数有上限（TOKENIZE_HARD_CAP），
 *    防止病态输入（未闭合字符串/块注释）把整个 UI 卡死
 *  - 主循环内不再创建 RegExp / Set
 */
export function highlight(code: string, lang: string): HLToken[] {
  const normalized = normalizeLang(lang);
  if (normalized === "text" || normalized === "" || !LANGS[normalized]) {
    return [{ type: "text", text: code }];
  }
  let compiled = COMPILED[normalized];
  if (!compiled) {
    compiled = compileLang(normalized, LANGS[normalized]);
    COMPILED[normalized] = compiled;
  }
  try {
    return tokenize(code, compiled);
  } catch (e) {
    console.error(`[SyntaxHighlight] tokenize 失败 (lang=${normalized}, len=${code.length})`, e);
    return [{ type: "text", text: code }];
  }
}

function tokenize(code: string, lang: CompiledLanguage): HLToken[] {
  const tokens: HLToken[] = [];
  const n = code.length;
  const cap = Math.min(n, TOKENIZE_HARD_CAP);
  let i = 0;
  // 安全计数器：防止任何正则零宽匹配导致的死循环
  let safetyCounter = 0;
  const MAX_ITERATIONS = cap * 3 + 100;
  const keywordSet = lang.keywordSet;
  const controlSet = lang.controlSet;
  const typeSet = lang.typeSet;
  const builtinSet = lang.builtinSet;
  const stringQuotes = lang.stringQuotes;

  const push = (type: HLTokenType, text: string) => {
    if (!text) return;
    const last = tokens[tokens.length - 1];
    if (last && last.type === type) last.text += text;
    else tokens.push({ type, text });
  };

  // 从指定位置执行正则匹配
  // ⚠️ 不能用 re.lastIndex + re.exec(code)：因为 anchor() 移除了 g/y 标志，
  //    没有 g/y 的 exec() 会忽略 lastIndex，永远从位置 0 匹配，导致死循环！
  // ✅ 正确做法：用 code.slice(from) 截取子串，让 ^ 锚定在子串开头
  const execAt = (re: RegExp | null, from: number): RegExpExecArray | null => {
    if (!re) return null;
    return re.exec(code.slice(from));
  };

  while (i < cap) {
    safetyCounter++;
    if (safetyCounter > MAX_ITERATIONS) {
      console.error(`[SyntaxHighlight] tokenize 安全计数器触发！i=${i}, cap=${cap}, lang=${lang.src ? 'unknown' : 'n/a'}, 已生成 ${tokens.length} 个 token`);
      push("text", code.slice(i));
      break;
    }
    // 块注释：先看起始，再扫描到结束
    if (lang.commentBlockStart) {
      const m = execAt(lang.commentBlockStart, i);
      if (m) {
        const startLen = m[0].length;
        // 起始匹配上，搜索结束
        // ⚠️ 同 execAt：anchor() 移除了 g/y 标志，不能用 lastIndex + exec(code)
        const endM = lang.commentBlockEnd!.exec(code.slice(i + startLen));
        const stop = endM ? i + startLen + endM.index + endM[0].length : cap;
        push("comment", code.slice(i, stop));
        i = stop;
        continue;
      }
    }
    // 行注释：仅在行首空白后
    if (lang.commentLineRe) {
      const lineStart = code.lastIndexOf("\n", i - 1) + 1;
      // 检测从 lineStart 到 i 是否全部为空白
      let isLineStart = true;
      for (let k = lineStart; k < i; k++) {
        const c = code.charCodeAt(k);
        // 空白字符：空格(32) \t(9) \r(13) \v(11) \f(12)
        if (c !== 32 && c !== 9 && c !== 13 && c !== 11 && c !== 12) {
          isLineStart = false;
          break;
        }
      }
      if (isLineStart) {
        const m = lang.commentLineRe.exec(code.slice(i));
        if (m) {
          const end = code.indexOf("\n", i);
          const stop = end === -1 || end > cap ? cap : end;
          push("comment", code.slice(i, stop));
          i = stop;
          continue;
        }
      }
    }
    // 字符串
    const ch = code[i];
    if (ch !== undefined) {
      let matchedString = false;
      for (let s = 0; s < stringQuotes.length; s++) {
        if (ch === stringQuotes[s]) {
          const allowMulti = lang.src.strings[s].allowMultiline;
          let j = i + 1;
          while (j < cap) {
            const cj = code.charCodeAt(j);
            if (cj === 92 /* '\\' */) {
              j += 2;
              continue;
            }
            if (cj === ch.charCodeAt(0)) {
              j++;
              break;
            }
            // 字符串内部遇到 \n：不结束（多行模式允许）
            if (cj === 10 /* '\n' */ && !allowMulti) {
              break;
            }
            j++;
          }
          push("string", code.slice(i, j));
          i = j;
          matchedString = true;
          break;
        }
      }
      if (matchedString) continue;
    }
    // 数字
    if (lang.numbersRe) {
      const num = execAt(lang.numbersRe, i);
      if (num) {
        push("number", num[0]);
        i += num[0].length;
        continue;
      }
    }
    // extras（如 Stata 全局宏）
    if (lang.compiledExtras.length > 0) {
      let extraMatched = false;
      for (let e = 0; e < lang.compiledExtras.length; e++) {
        const ex = lang.compiledExtras[e];
        const m = ex.re.exec(code.slice(i));
        if (m) {
          push(ex.type, m[0]);
          i += m[0].length;
          extraMatched = true;
          break;
        }
      }
      if (extraMatched) continue;
    }
    // 标识符 / 关键字 / 类型 / 内建
    const c0 = code.charCodeAt(i);
    // 字符判断：[a-zA-Z_]
    if ((c0 >= 97 && c0 <= 122) || (c0 >= 65 && c0 <= 90) || c0 === 95) {
      // 扫描 [a-zA-Z0-9_]*
      let j = i + 1;
      while (j < cap) {
        const cj = code.charCodeAt(j);
        const isAlnum =
          (cj >= 97 && cj <= 122) ||
          (cj >= 65 && cj <= 90) ||
          (cj >= 48 && cj <= 57) ||
          cj === 95;
        if (!isAlnum) break;
        j++;
      }
      const w = code.slice(i, j);
      const wl = w.toLowerCase();
      let type: HLTokenType = "text";
      if (keywordSet.has(wl)) type = controlSet.has(wl) ? "keyword-control" : "keyword";
      else if (typeSet.has(wl)) type = "type";
      else if (builtinSet.has(wl)) type = "builtin";
      else if (code.charCodeAt(j) === 40 /* '(' */) type = "function";
      else if (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w)) type = "variable";
      push(type, w);
      i = j;
      continue;
    }
    // 标识符形式的函数（用于 R 包函数：包含 . 的标识符）
    if (lang.identifiersRe) {
      const c0b = code.charCodeAt(i);
      if (
        (c0b >= 97 && c0b <= 122) ||
        (c0b >= 65 && c0b <= 90) ||
        c0b === 95 ||
        c0b === 46 /* '.' */
      ) {
        const m = execAt(lang.identifiersRe, i);
        if (m) {
          push("function", m[0]);
          i += m[0].length;
          continue;
        }
      }
    }
    // 运算符 / 标点
    if (lang.operatorsRe) {
      const m = execAt(lang.operatorsRe, i);
      if (m) {
        push("operator", m[0]);
        i += m[0].length;
        continue;
      }
    }
    // 兜底：原样推进一格（必须推进，否则会死循环）
    push("text", code[i] || "");
    i++;
  }

  // 超过 cap 的剩余内容：作为单个 text token，避免整段丢失
  if (i < n) {
    push("text", code.slice(i));
  }
  return tokens;
}
