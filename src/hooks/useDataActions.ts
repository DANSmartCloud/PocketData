import { useCallback } from 'react';
import { useFileStore, DTAFile, Variable } from '@/stores/fileStore';
import { useUIStore } from '@/stores/uiStore';
import { useNotify, useAlert, useConfirm, usePrompt } from './useNotify';

export interface DescriptiveStats {
  variable: string;
  count: number;
  missing: number;
  mean: number | null;
  std: number | null;
  min: number | null;
  max: number | null;
  median: number | null;
  unique?: number;
}

function isNumeric(v: unknown): v is number {
  return typeof v === 'number' && !Number.isNaN(v) && Number.isFinite(v);
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (isNumeric(v)) return v;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

export function calculateDescriptive(file: DTAFile, varName: string): DescriptiveStats {
  const values: number[] = [];
  let missing = 0;
  for (const row of file.data) {
    const v = row[varName];
    if (v === null || v === undefined || v === '') {
      missing++;
      continue;
    }
    const n = toNumber(v);
    if (n === null) missing++;
    else values.push(n);
  }
  if (values.length === 0) {
    return {
      variable: varName,
      count: 0,
      missing,
      mean: null,
      std: null,
      min: null,
      max: null,
      median: null
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / Math.max(values.length - 1, 1);
  const median =
    values.length % 2 === 0
      ? (sorted[values.length / 2 - 1] + sorted[values.length / 2]) / 2
      : sorted[(values.length - 1) / 2];
  return {
    variable: varName,
    count: values.length,
    missing,
    mean,
    std: Math.sqrt(variance),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median
  };
}

export function useDataActions() {
  const { getActiveFile } = useFileStore();
  const setSort = useUIStore(s => s.setSort);
  const notify = useNotify();
  const alert_ = useAlert();
  const confirm_ = useConfirm();
  const prompt_ = usePrompt();

  /**
   * 描述统计 - 弹出格式化的统计摘要
   */
  const describe = useCallback(async (varName?: string) => {
    const file = getActiveFile();
    if (!file) {
      await alert_('请先打开一个数据文件', 'warning');
      return;
    }
    const targetVar = varName ?? file.variables[0]?.name;
    if (!targetVar) {
      await alert_('没有可用的变量', 'warning');
      return;
    }
    const stats = calculateDescriptive(file, targetVar);
    const fmt = (v: number | null) => v === null ? '—' : v.toFixed(4);
    const lines = [
      `变量: ${stats.variable}`,
      `观测值: ${stats.count}`,
      `缺失值: ${stats.missing}`,
      `均值: ${fmt(stats.mean)}`,
      `标准差: ${fmt(stats.std)}`,
      `最小值: ${fmt(stats.min)}`,
      `最大值: ${fmt(stats.max)}`,
      `中位数: ${fmt(stats.median)}`
    ];
    notify('info', `${targetVar}: N=${stats.count} 均值=${fmt(stats.mean)} ± ${fmt(stats.std)}`, 5000);
    console.log('[描述统计]\n' + lines.join('\n'));
  }, [getActiveFile, notify, alert_]);

  /**
   * 排序 - 真正修改 file.data 的排序顺序
   */
  const sort = useCallback(async (varName?: string, direction?: 'asc' | 'desc') => {
    const file = getActiveFile();
    if (!file) {
      await alert_('请先打开一个数据文件', 'warning');
      return;
    }
    const targetVar = varName ?? await prompt_('请输入要排序的变量名', '排序', file.variables[0]?.name ?? '');
    if (!targetVar) return;
    if (!file.variables.find(v => v.name === targetVar)) {
      await alert_(`变量 "${targetVar}" 不存在`, 'error');
      return;
    }
    const dir = direction ?? await prompt_('排序方向：asc 升序 / desc 降序', '排序', 'asc') as 'asc' | 'desc';
    if (dir !== 'asc' && dir !== 'desc') {
      await alert_('方向必须是 asc 或 desc', 'error');
      return;
    }

    // 创建副本排序，不影响原引用
    const sorted = [...file.data].sort((a, b) => {
      const va = a[targetVar];
      const vb = b[targetVar];
      const na = toNumber(va);
      const nb = toNumber(vb);

      // 缺失值始终排在最后
      if (na === null && nb === null) return 0;
      if (na === null) return 1;
      if (nb === null) return -1;

      if (na !== null && nb !== null) {
        return dir === 'asc' ? na - nb : nb - na;
      }
      // 字符串比较
      const sa = String(va ?? '');
      const sb = String(vb ?? '');
      const cmp = sa.localeCompare(sb);
      return dir === 'asc' ? cmp : -cmp;
    });

    useFileStore.setState(state => {
      const f = state.files[file.id];
      if (!f) return state;
      return {
        files: {
          ...state.files,
          [file.id]: { ...f, data: sorted, isDirty: true }
        }
      };
    });
    // 同步 UI 状态以让菜单显示当前排序方向
    setSort(targetVar, dir);
    notify('success', `已按 ${targetVar} ${dir === 'asc' ? '升序' : '降序'}排列`, 3000);
  }, [getActiveFile, prompt_, alert_, notify, setSort]);

  /**
   * 生成新变量
   */
  const generateVariable = useCallback(async () => {
    const file = getActiveFile();
    if (!file) {
      await alert_('请先打开一个数据文件', 'warning');
      return;
    }
    const name = await prompt_('新变量名 (字母开头，只能包含字母/数字/下划线)', '生成变量');
    if (!name) return;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      await alert_('变量名格式不合法', 'error');
      return;
    }
    if (file.variables.find(v => v.name === name)) {
      await alert_(`变量 "${name}" 已存在`, 'error');
      return;
    }
    const formula = await prompt_('初始值 (数值或 "=expr" 表达式，目前仅支持数值)', '生成变量', '0');
    if (formula === null) return;
    let value: number | string = 0;
    const n = Number(formula);
    if (!Number.isNaN(n) && /^-?\d+(\.\d+)?$/.test(formula.trim())) {
      value = n;
    } else if (formula.startsWith('=')) {
      // 简化：=后面是字面值
      const expr = formula.slice(1).trim();
      const num = Number(expr);
      value = Number.isNaN(num) ? expr : num;
    } else {
      value = formula;
    }

    const newVar: Variable = { name, type: 'double', label: name };
    useFileStore.setState(state => {
      const f = state.files[file.id];
      if (!f) return state;
      const newData = f.data.map(row => ({ ...row, [name]: value }));
      return {
        files: {
          ...state.files,
          [file.id]: {
            ...f,
            variables: [...f.variables, newVar],
            data: newData,
            nvar: f.nvar + 1,
            isDirty: true
          }
        }
      };
    });
    notify('success', `已创建变量 ${name}`, 3000);
  }, [getActiveFile, prompt_, alert_, notify]);

  /**
   * 重命名变量
   */
  const renameVariable = useCallback(async () => {
    const file = getActiveFile();
    if (!file) {
      await alert_('请先打开一个数据文件', 'warning');
      return;
    }
    const oldName = await prompt_(`当前变量名（从 ${file.variables.map(v=>v.name).join(', ')} 中选择）`, '重命名变量', file.variables[0]?.name ?? '');
    if (!oldName) return;
    const variable = file.variables.find(v => v.name === oldName);
    if (!variable) {
      await alert_(`变量 "${oldName}" 不存在`, 'error');
      return;
    }
    const newName = await prompt_('新变量名', '重命名变量', oldName);
    if (!newName || newName === oldName) return;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newName)) {
      await alert_('变量名格式不合法', 'error');
      return;
    }
    if (file.variables.find(v => v.name === newName)) {
      await alert_(`变量 "${newName}" 已存在`, 'error');
      return;
    }

    useFileStore.setState(state => {
      const f = state.files[file.id];
      if (!f) return state;
      return {
        files: {
          ...state.files,
          [file.id]: {
            ...f,
            variables: f.variables.map(v => v.name === oldName ? { ...v, name: newName, label: newName } : v),
            data: f.data.map(row => {
              const r = { ...row };
              r[newName] = r[oldName];
              delete r[oldName];
              return r;
            }),
            isDirty: true
          }
        }
      };
    });
    notify('success', `已将 ${oldName} 重命名为 ${newName}`, 3000);
  }, [getActiveFile, prompt_, alert_, notify]);

  /**
   * 缺失值处理：删除包含缺失值的行
   */
  const dropMissing = useCallback(async () => {
    const file = getActiveFile();
    if (!file) {
      await alert_('请先打开一个数据文件', 'warning');
      return;
    }
    const before = file.data.length;
    const cleaned = file.data.filter(row => {
      return file.variables.every(v => {
        const x = row[v.name];
        return x !== null && x !== undefined && x !== '';
      });
    });
    const removed = before - cleaned.length;
    if (removed === 0) {
      notify('info', '数据中无缺失值', 2000);
      return;
    }
    const ok = await confirm_(`将删除 ${removed} 行包含缺失值的数据，是否继续？`, '缺失值处理');
    if (!ok) return;
    useFileStore.setState(state => {
      const f = state.files[file.id];
      if (!f) return state;
      return {
        files: {
          ...state.files,
          [file.id]: { ...f, data: cleaned, nobs: cleaned.length, isDirty: true }
        }
      };
    });
    notify('success', `已删除 ${removed} 行缺失值`, 3000);
  }, [getActiveFile, confirm_, alert_, notify]);

  /**
   * 数据筛选：按值/范围过滤行
   */
  const filter = useCallback(async () => {
    const file = getActiveFile();
    if (!file) {
      await alert_('请先打开一个数据文件', 'warning');
      return;
    }
    const varName = await prompt_('请输入筛选变量名', '数据筛选', file.variables[0]?.name ?? '');
    if (!varName) return;
    if (!file.variables.find(v => v.name === varName)) {
      await alert_(`变量 "${varName}" 不存在`, 'error');
      return;
    }
    const condition = await prompt_('筛选条件（如：> 10、== "yes"、包含 "test"）', '数据筛选', '> 0');
    if (!condition) return;

    // 解析条件: > n, < n, >= n, <= n, == v, != v, 包含 str
    const trimmed = condition.trim();
    const numMatch = trimmed.match(/^(>=|<=|>|<|==|!=)\s*(-?\d+(?:\.\d+)?)$/);
    const strEqMatch = trimmed.match(/^==\s*"(.+)"$/);
    const strNeMatch = trimmed.match(/^!=\s*"(.+)"$/);
    const containsMatch = trimmed.match(/^包含\s*"(.+)"$/);

    if (!numMatch && !strEqMatch && !strNeMatch && !containsMatch) {
      await alert_('条件格式不支持，请使用 >, <, >=, <=, ==, != 或 包含 "x"', 'warning');
      return;
    }

    const before = file.data.length;
    let filtered: typeof file.data;
    if (numMatch) {
      const op = numMatch[1];
      const n = Number(numMatch[2]);
      filtered = file.data.filter(row => {
        const v = toNumber(row[varName]);
        if (v === null) return false;
        switch (op) {
          case '>': return v > n;
          case '<': return v < n;
          case '>=': return v >= n;
          case '<=': return v <= n;
          case '==': return v === n;
          case '!=': return v !== n;
        }
        return true;
      });
    } else if (strEqMatch) {
      const target = strEqMatch[1];
      filtered = file.data.filter(row => String(row[varName] ?? '') === target);
    } else if (strNeMatch) {
      const target = strNeMatch[1];
      filtered = file.data.filter(row => String(row[varName] ?? '') !== target);
    } else if (containsMatch) {
      const target = containsMatch[1];
      filtered = file.data.filter(row => String(row[varName] ?? '').includes(target));
    } else {
      filtered = file.data;
    }

    const removed = before - filtered.length;
    if (removed === 0) {
      notify('info', '无匹配行', 2000);
      return;
    }
    const ok = await confirm_(`将保留 ${filtered.length} 行，删除 ${removed} 行，是否继续？`, '数据筛选');
    if (!ok) return;
    useFileStore.setState(state => {
      const f = state.files[file.id];
      if (!f) return state;
      return {
        files: {
          ...state.files,
          [file.id]: { ...f, data: filtered, nobs: filtered.length, isDirty: true }
        }
      };
    });
    notify('success', `筛选完成：保留 ${filtered.length} 行`, 3000);
  }, [getActiveFile, prompt_, alert_, confirm_, notify]);

  /**
   * 简单的相关性分析（皮尔逊）
   */
  const correlation = useCallback(async (xVar?: string, yVar?: string) => {
    const file = getActiveFile();
    if (!file) {
      await alert_('请先打开一个数据文件', 'warning');
      return;
    }
    if (file.variables.length < 2) {
      await alert_('至少需要两个变量', 'warning');
      return;
    }
    const x = xVar ?? await prompt_('X 变量', '相关性分析', file.variables[0]?.name ?? '');
    if (!x) return;
    const y = yVar ?? await prompt_('Y 变量', '相关性分析', file.variables[1]?.name ?? '');
    if (!y) return;
    if (!file.variables.find(v => v.name === x) || !file.variables.find(v => v.name === y)) {
      await alert_('变量不存在', 'error');
      return;
    }
    const pairs: [number, number][] = [];
    for (const row of file.data) {
      const xv = toNumber(row[x]);
      const yv = toNumber(row[y]);
      if (xv !== null && yv !== null) pairs.push([xv, yv]);
    }
    if (pairs.length < 2) {
      await alert_('有效数据对不足', 'warning');
      return;
    }
    const n = pairs.length;
    const sumX = pairs.reduce((a, [vx]) => a + vx, 0);
    const sumY = pairs.reduce((a, [, vy]) => a + vy, 0);
    const meanX = sumX / n, meanY = sumY / n;
    let num = 0, denX = 0, denY = 0;
    for (const [vx, vy] of pairs) {
      const dx = vx - meanX, dy = vy - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }
    const r = (denX === 0 || denY === 0) ? NaN : num / Math.sqrt(denX * denY);
    const t = r * Math.sqrt((n - 2) / Math.max(1 - r * r, 1e-12));
    const message = `Pearson r(${x}, ${y}) = ${r.toFixed(4)}  N=${n}  t=${t.toFixed(3)}`;
    notify('info', message, 5000);
    console.log('[相关性分析] ' + message);
  }, [getActiveFile, prompt_, alert_, notify]);

  /**
   * 简单线性回归
   */
  const regression = useCallback(async () => {
    const file = getActiveFile();
    if (!file) {
      await alert_('请先打开一个数据文件', 'warning');
      return;
    }
    if (file.variables.length < 2) {
      await alert_('至少需要两个变量', 'warning');
      return;
    }
    const yVar = await prompt_('因变量 Y', '回归分析', file.variables[0]?.name ?? '');
    if (!yVar) return;
    const xVar = await prompt_('自变量 X', '回归分析', file.variables[1]?.name ?? '');
    if (!xVar) return;
    const pairs: [number, number][] = [];
    for (const row of file.data) {
      const xv = toNumber(row[xVar]);
      const yv = toNumber(row[yVar]);
      if (xv !== null && yv !== null) pairs.push([xv, yv]);
    }
    if (pairs.length < 2) {
      await alert_('有效数据点不足', 'warning');
      return;
    }
    const n = pairs.length;
    const sumX = pairs.reduce((a, [vx]) => a + vx, 0);
    const sumY = pairs.reduce((a, [, vy]) => a + vy, 0);
    const meanX = sumX / n, meanY = sumY / n;
    let sxy = 0, sxx = 0;
    for (const [vx, vy] of pairs) {
      const dx = vx - meanX, dy = vy - meanY;
      sxy += dx * dy;
      sxx += dx * dx;
    }
    const beta = sxx === 0 ? NaN : sxy / sxx;
    const alpha = meanY - beta * meanX;
    let ssRes = 0, ssTot = 0;
    for (const [, vy] of pairs) {
      ssRes += (vy - (alpha + beta * meanX)) ** 2;
      ssTot += (vy - meanY) ** 2;
    }
    const r2 = ssTot === 0 ? NaN : 1 - ssRes / ssTot;
    const message = `回归: ${yVar} = ${alpha.toFixed(4)} + ${beta.toFixed(4)} × ${xVar}  R²=${r2.toFixed(4)}  N=${n}`;
    notify('info', message, 5000);
    console.log('[回归分析] ' + message);
  }, [getActiveFile, prompt_, alert_, notify]);

  /**
   * 简单 T 检验（单样本）
   */
  const ttest = useCallback(async () => {
    const file = getActiveFile();
    if (!file) {
      await alert_('请先打开一个数据文件', 'warning');
      return;
    }
    const varName = await prompt_('变量名', 'T 检验', file.variables[0]?.name ?? '');
    if (!varName) return;
    const muStr = await prompt_('参考均值 μ₀（默认 0）', 'T 检验', '0');
    if (muStr === null) return;
    const mu0 = Number(muStr);
    const values: number[] = [];
    for (const row of file.data) {
      const v = toNumber(row[varName]);
      if (v !== null) values.push(v);
    }
    if (values.length < 2) {
      await alert_('有效样本不足', 'warning');
      return;
    }
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1);
    const se = Math.sqrt(variance / n);
    const t = (mean - mu0) / se;
    const df = n - 1;
    const message = `单样本 T 检验: t(${df}) = ${t.toFixed(3)}  mean=${mean.toFixed(4)}  μ₀=${mu0}  N=${n}`;
    notify('info', message, 5000);
    console.log('[T 检验] ' + message);
  }, [getActiveFile, prompt_, alert_, notify]);

  /**
   * 单因素方差分析 (one-way ANOVA)
   * 分组变量应是离散型，反应变量应是连续型
   */
  const anova = useCallback(async () => {
    const file = getActiveFile();
    if (!file) {
      await alert_('请先打开一个数据文件', 'warning');
      return;
    }
    if (file.variables.length < 2) {
      await alert_('至少需要两个变量（反应变量 + 分组变量）', 'warning');
      return;
    }
    const yVar = await prompt_('反应变量（连续型）', '方差分析 (one-way ANOVA)', file.variables[0]?.name ?? '');
    if (!yVar) return;
    const gVar = await prompt_('分组变量（离散型）', '方差分析 (one-way ANOVA)', file.variables[1]?.name ?? '');
    if (!gVar) return;
    if (!file.variables.find(v => v.name === yVar) || !file.variables.find(v => v.name === gVar)) {
      await alert_('变量不存在', 'error');
      return;
    }

    // 按组收集数据
    const groups = new Map<string, number[]>();
    for (const row of file.data) {
      const y = toNumber(row[yVar]);
      const g = row[gVar];
      if (y === null || g === null || g === undefined) continue;
      const key = String(g);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(y);
    }
    const groupArr = Array.from(groups.entries()).filter(([, vals]) => vals.length > 0);
    if (groupArr.length < 2) {
      await alert_('至少需要 2 个分组', 'warning');
      return;
    }

    const k = groupArr.length;
    const groupSizes = groupArr.map(([, v]) => v.length);
    const N = groupSizes.reduce((a, b) => a + b, 0);
    if (N <= k) {
      await alert_('样本量不足', 'warning');
      return;
    }

    // 总均值
    const allVals = groupArr.flatMap(([, v]) => v);
    const grandMean = allVals.reduce((a, b) => a + b, 0) / N;
    // 组内均值
    const groupMeans = groupArr.map(([, v]) => v.reduce((a, b) => a + b, 0) / v.length);

    // SSB (组间平方和)
    let SSB = 0;
    groupArr.forEach(([, v], i) => {
      SSB += v.length * (groupMeans[i] - grandMean) ** 2;
    });
    // SSW (组内平方和)
    let SSW = 0;
    groupArr.forEach(([, v], i) => {
      for (const x of v) SSW += (x - groupMeans[i]) ** 2 });
    const dfB = k - 1;
    const dfW = N - k;
    const MSB = SSB / dfB;
    const MSW = SSW / dfW;
    const F = MSW === 0 ? NaN : MSB / MSW;

    const detail = [
      `单因素方差分析: ${yVar} ~ ${gVar}`,
      `  组数 k = ${k}   总样本 N = ${N}`,
      `  SSB = ${SSB.toFixed(4)}  df = ${dfB}  MSB = ${MSB.toFixed(4)}`,
      `  SSW = ${SSW.toFixed(4)}  df = ${dfW}  MSW = ${MSW.toFixed(4)}`,
      `  F = ${F.toFixed(4)}  (df1=${dfB}, df2=${dfW})`,
    ].join('\n');
    const summary = `ANOVA ${yVar}~${gVar}: F(${dfB}, ${dfW}) = ${F.toFixed(3)}  k=${k}  N=${N}`;
    notify('info', summary, 6000);
    console.log('[' + detail + ']');
  }, [getActiveFile, prompt_, alert_, notify]);

  /**
   * 卡方检验（独立性 / 拟合优度）
   * 简化：只支持 2x2 列联表的独立性检验（chi-square test of independence）
   */
  const chisq = useCallback(async () => {
    const file = getActiveFile();
    if (!file) {
      await alert_('请先打开一个数据文件', 'warning');
      return;
    }
    if (file.variables.length < 2) {
      await alert_('至少需要两个变量', 'warning');
      return;
    }
    const rVar = await prompt_('行变量', '卡方检验 (Chi-square)', file.variables[0]?.name ?? '');
    if (!rVar) return;
    const cVar = await prompt_('列变量', '卡方检验 (Chi-square)', file.variables[1]?.name ?? '');
    if (!cVar) return;
    if (!file.variables.find(v => v.name === rVar) || !file.variables.find(v => v.name === cVar)) {
      await alert_('变量不存在', 'error');
      return;
    }
    // 构建列联表
    const table = new Map<string, Map<string, number>>();
    const rowSet = new Set<string>();
    const colSet = new Set<string>();
    for (const row of file.data) {
      const r = row[rVar];
      const c = row[cVar];
      if (r === null || r === undefined || c === null || c === undefined) continue;
      const rKey = String(r);
      const cKey = String(c);
      rowSet.add(rKey);
      colSet.add(cKey);
      if (!table.has(rKey)) table.set(rKey, new Map());
      const rMap = table.get(rKey)!;
      rMap.set(cKey, (rMap.get(cKey) ?? 0) + 1);
    }
    if (rowSet.size < 2 || colSet.size < 2) {
      await alert_('每个变量至少需要 2 个水平', 'warning');
      return;
    }
    const rows = Array.from(rowSet).sort();
    const cols = Array.from(colSet).sort();
    const N = rows.reduce((a, r) => a + cols.reduce((b, c) => b + (table.get(r)?.get(c) ?? 0), 0), 0);
    if (N === 0) {
      await alert_('无有效数据', 'warning');
      return;
    }
    // 行/列合计
    const rowTotals: Record<string, number> = {};
    const colTotals: Record<string, number> = {};
    for (const r of rows) {
      rowTotals[r] = cols.reduce((a, c) => a + (table.get(r)?.get(c) ?? 0), 0);
    }
    for (const c of cols) {
      colTotals[c] = rows.reduce((a, r) => a + (table.get(r)?.get(c) ?? 0), 0);
    }
    // 计算 chi-square 统计量
    let chi2 = 0;
    for (const r of rows) {
      for (const c of cols) {
        const observed = table.get(r)?.get(c) ?? 0;
        const expected = (rowTotals[r] * colTotals[c]) / N;
        if (expected > 0) {
          chi2 += (observed - expected) ** 2 / expected;
        }
      }
    }
    const df = (rows.length - 1) * (cols.length - 1);
    const summary = `卡方检验 ${rVar}×${cVar}: χ²(${df}) = ${chi2.toFixed(3)}  ${rows.length}×${cols.length}表  N=${N}`;
    notify('info', summary, 6000);
    console.log('[卡方检验] ' + summary);
  }, [getActiveFile, prompt_, alert_, notify]);

  return {
    describe,
    sort,
    filter,
    generateVariable,
    renameVariable,
    dropMissing,
    correlation,
    regression,
    ttest,
    anova,
    chisq
  };
}
