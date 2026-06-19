import { useState, useEffect, useRef } from "react";
import { Sparkles, Eye, EyeOff, RotateCcw, Send, Trash2, Download, Upload, Edit2, FolderOpen, Check, X as XIcon, Database, Save, Star, ChevronDown, ChevronUp } from "lucide-react";
import { useAIStore, AI_PROVIDER_PRESETS, AI_MODEL_PRESETS, type AIProvider, type AIPreset } from "@/stores/aiStore";
import { ProviderIcon } from "@/components/sidebar/ModelIcon";
import styles from "./AIConfigPanel.module.css";

/**
 * OpenAI 兼容模式可用的品牌图标。
 * 用户可从中选一个最适合自己实际服务商的图标。
 */
const OPENAI_BRAND_OPTIONS: { id: string; label: string }[] = [
  { id: "openai", label: "OpenAI" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "anthropic", label: "Anthropic" },
  { id: "gemini", label: "Gemini" },
  { id: "qwen", label: "通义千问" },
  { id: "mistral", label: "Mistral" },
  { id: "meta", label: "Llama" },
  { id: "grok", label: "Grok" },
  { id: "cohere", label: "Cohere" },
  { id: "moonshot", label: "月之暗面" },
  { id: "zhipu", label: "智谱 GLM" },
  { id: "hunyuan", label: "腾讯混元" },
  { id: "wenxin", label: "文心一言" },
  { id: "spark", label: "讯飞星火" },
  { id: "doubao", label: "字节豆包" },
  { id: "yi", label: "零一万物" },
  { id: "baichuan", label: "百川" },
  { id: "ollama", label: "Ollama" },
  { id: "custom", label: "自定义" },
];

/**
 * AI 助手配置面板 - 重构为直观的"配置 = 卡片"模式
 *
 * 设计原则：
 * 1. 顶部：当前激活预设的"大卡片"（名字 / 提供商 / 模型 / 状态）
 * 2. 醒目"保存为新预设"按钮 + 内联名称输入
 * 3. 已保存的预设列表 - 卡片化，每条带 [激活/重命名/删除] 按钮
 * 4. API 配置表单 - 修改后实时显示"已修改"提示
 */
export function AIConfigPanel() {
  const config = useAIStore((s) => s.config);
  const setProvider = useAIStore((s) => s.setProvider);
  const updateConfig = useAIStore((s) => s.updateConfig);
  const resetConfig = useAIStore((s) => s.resetConfig);
  const isReady = useAIStore((s) => s.isReady);
  const presets = useAIStore((s) => s.presets);
  const savePreset = useAIStore((s) => s.savePreset);
  const loadPreset = useAIStore((s) => s.loadPreset);
  const deletePreset = useAIStore((s) => s.deletePreset);
  const renamePreset = useAIStore((s) => s.renamePreset);
  const exportPresets = useAIStore((s) => s.exportPresets);
  const importPresets = useAIStore((s) => s.importPresets);
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [newPresetName, setNewPresetName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saveHint, setSaveHint] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTestStatus('idle');
    setTestMessage('');
  }, [config.provider, config.apiKey, config.baseUrl, config.model]);

  const handleProviderChange = (p: AIProvider) => {
    setProvider(p);
  };

  const handleTest = async () => {
    if (!isReady()) {
      setTestStatus('fail');
      setTestMessage('请先填写 Base URL 和模型');
      return;
    }
    setTestStatus('testing');
    setTestMessage('正在测试连接…');
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (config.provider !== 'ollama') {
        headers.Authorization = `Bearer ${config.apiKey}`;
      }
      const res = await fetch(`${stripTrailingSlash(config.baseUrl)}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 8,
          temperature: 0,
          stream: false,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        setTestStatus('fail');
        setTestMessage(`HTTP ${res.status}：${errText.slice(0, 200)}`);
        return;
      }
      setTestStatus('ok');
      setTestMessage('连接成功 ✓');
    } catch (err) {
      setTestStatus('fail');
      setTestMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSavePreset = () => {
    const name = newPresetName.trim() || `${currentPreset?.label}-${Date.now()}`;
    savePreset(name);
    setNewPresetName('');
    setSaveHint(`已保存为「${name}」`);
    setTimeout(() => setSaveHint(''), 2500);
  };

  const handleSaveAsUpdate = (p: AIPreset) => {
    // 把当前表单内容覆盖到此预设
    savePreset(p.name);
    setSaveHint(`已更新「${p.name}」`);
    setTimeout(() => setSaveHint(''), 2500);
  };

  const handleExport = () => {
    const json = exportPresets();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pocketdata-ai-presets-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === 'string') {
        const r = importPresets(text);
        if (r.ok) {
          setTestStatus('ok');
          setTestMessage(`已导入 ${r.added} 个配置`);
        } else {
          setTestStatus('fail');
          setTestMessage(`导入失败：${r.error}`);
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const startRename = (p: AIPreset) => {
    setRenamingId(p.id);
    setRenameValue(p.name);
  };

  const commitRename = () => {
    if (renamingId) {
      renamePreset(renamingId, renameValue);
      setRenamingId(null);
      setRenameValue('');
    }
  };

  const currentPreset = AI_PROVIDER_PRESETS.find((p) => p.id === config.provider);
  // 启发式：当前配置是否与某个预设完全一致
  const matchingPreset = presets.find((p) =>
    p.config.provider === config.provider &&
    p.config.apiKey === config.apiKey &&
    p.config.baseUrl === config.baseUrl &&
    p.config.model === config.model
  );

  return (
    <div className={styles.panel} data-pane-id="ai-config">
      {/* ========== 当前配置大卡片 ========== */}
      <section className={`${styles.section} ${styles.activeCard}`}>
        <div className={styles.activeCardHeader}>
          <div className={styles.activeCardIcon}>
            <ProviderIcon provider={config.provider === 'openai' ? (config.openaiBrand || 'openai') : config.provider} size={18} />
          </div>
          <div className={styles.activeCardInfo}>
            <div className={styles.activeCardTitle}>
              {matchingPreset ? matchingPreset.name : '当前未命名配置'}
            </div>
            <div className={styles.activeCardMeta}>
              {currentPreset?.label} · <code>{config.model || '未设置模型'}</code>
            </div>
          </div>
          <div className={styles.activeCardStatus}>
            {isReady() ? (
              <span className={styles.statusOk}>● 就绪</span>
            ) : (
              <span className={styles.statusWarn}>● 待配置</span>
            )}
          </div>
        </div>
        <div className={styles.activeCardActions}>
          <button
            className={styles.primaryAction}
            onClick={handleSavePreset}
            title="将当前表单内容保存为新的命名预设"
          >
            <Save size={12} />
            保存为新预设
          </button>
          {matchingPreset && (
            <button
              className={styles.secondaryAction}
              onClick={() => handleSaveAsUpdate(matchingPreset)}
              title="覆盖保存到当前激活的预设"
            >
              <Upload size={12} />
              覆盖保存
            </button>
          )}
        </div>
        {saveHint && <div className={styles.saveHint}>✓ {saveHint}</div>}
      </section>

      {/* ========== 已保存的预设列表 ========== */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>
            <Database size={13} />
            已保存的配置
            <span className={styles.countBadge}>{presets.length}</span>
          </h3>
          <div className={styles.presetImportExport}>
            <button
              className={styles.iconAction}
              onClick={handleExport}
              disabled={presets.length === 0}
              title="导出所有预设到 JSON 文件"
            >
              <Download size={11} />
              导出
            </button>
            <button
              className={styles.iconAction}
              onClick={() => fileInputRef.current?.click()}
              title="从 JSON 文件导入预设"
            >
              <Upload size={11} />
              导入
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        {presets.length === 0 ? (
          <div className={styles.presetEmpty}>
            <Database size={20} />
            <p>暂无已保存的配置</p>
            <small>填写下方 API 信息后，点击上方的"保存为新预设"即可创建第一个配置。</small>
          </div>
        ) : (
          <ul className={styles.presetList}>
            {presets.map((p) => {
              const isActive = matchingPreset?.id === p.id;
              return (
                <li
                  key={p.id}
                  className={`${styles.presetItem} ${isActive ? styles.presetItemActive : ''}`}
                >
                  <div className={styles.presetIcon}>
                    <ProviderIcon provider={p.config.provider === 'openai' ? (p.config.openaiBrand || 'openai') : p.config.provider} size={16} />
                  </div>
                  <div className={styles.presetInfo}>
                    {renamingId === p.id ? (
                      <input
                        className={styles.presetRenameInput}
                        value={renameValue}
                        autoFocus
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename();
                          else if (e.key === 'Escape') {
                            setRenamingId(null);
                            setRenameValue('');
                          }
                        }}
                        onBlur={commitRename}
                      />
                    ) : (
                      <>
                        <div className={styles.presetName}>
                          {isActive && <Star size={10} className={styles.activeStar} />}
                          {p.name}
                        </div>
                        <div className={styles.presetMeta}>
                          {AI_PROVIDER_PRESETS.find((x) => x.id === p.config.provider)?.label || p.config.provider}
                          {' · '}
                          <code>{p.config.model}</code>
                        </div>
                      </>
                    )}
                  </div>
                  <div className={styles.presetBtns}>
                    {renamingId === p.id ? (
                      <>
                        <button className={styles.presetIconBtn} onClick={commitRename} title="确认">
                          <Check size={12} />
                        </button>
                        <button
                          className={styles.presetIconBtn}
                          onClick={() => {
                            setRenamingId(null);
                            setRenameValue('');
                          }}
                          title="取消"
                        >
                          <XIcon size={12} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className={styles.presetIconBtn}
                          onClick={() => loadPreset(p.id)}
                          title="激活此预设（覆盖当前配置）"
                        >
                          <FolderOpen size={12} />
                        </button>
                        <button
                          className={styles.presetIconBtn}
                          onClick={() => startRename(p)}
                          title="重命名"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          className={`${styles.presetIconBtn} ${styles.presetIconBtnDanger}`}
                          onClick={() => {
                            if (confirm(`删除预设 “${p.name}”？`)) deletePreset(p.id);
                          }}
                          title="删除"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ========== API 配置表单 ========== */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <Sparkles size={13} />
          连接配置
        </h3>
        <p className={styles.sectionDesc}>
          配置当前激活预设的 API 连接信息。修改后点击上方"保存为新预设"或"覆盖保存"。
        </p>

        <div className={styles.field}>
          <label className={styles.label}>服务提供商</label>
          <div className={styles.providerGroup}>
            {AI_PROVIDER_PRESETS.map((p) => (
              <button
                key={p.id}
                className={`${styles.providerBtn} ${
                  config.provider === p.id ? styles.providerBtnActive : ''
                }`}
                onClick={() => handleProviderChange(p.id)}
              >
                <ProviderIcon
                  provider={p.id === 'openai' && config.provider === 'openai' ? (config.openaiBrand || 'openai') : p.id}
                  size={11}
                  className={styles.providerBtnIcon}
                />
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {currentPreset?.needsApiKey && (
          <div className={styles.field}>
            <label className={styles.label}>API Key</label>
            <div className={styles.keyWrap}>
              <input
                ref={keyInputRef}
                className={styles.input}
                type={showKey ? 'text' : 'password'}
                value={config.apiKey}
                onChange={(e) => updateConfig({ apiKey: e.target.value })}
                placeholder="sk-..."
                autoComplete="new-password"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
              />
              <button
                type="button"
                className={styles.keyToggle}
                onClick={() => setShowKey((v) => !v)}
                title={showKey ? '隐藏' : '显示'}
                tabIndex={-1}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
        )}

        {/* OpenAI 兼容模式：选择品牌图标 */}
        {config.provider === 'openai' && (
          <div className={styles.field}>
            <label className={styles.label}>提供商图标（OpenAI 兼容）</label>
            <p className={styles.hint}>
              兼容模式下可选择一个更准确的品牌图标。
            </p>
            <div className={styles.brandGrid}>
              {OPENAI_BRAND_OPTIONS.map((b) => {
                const active = (config.openaiBrand || 'openai') === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={`${styles.brandBtn} ${active ? styles.brandBtnActive : ''}`}
                    onClick={() => updateConfig({ openaiBrand: b.id })}
                    title={b.label}
                  >
                    <ProviderIcon provider={b.id} size={16} />
                    <span>{b.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label}>Base URL</label>
          <input
            className={styles.input}
            type="text"
            value={config.baseUrl}
            onChange={(e) => updateConfig({ baseUrl: e.target.value })}
            placeholder={currentPreset?.defaultBaseUrl || 'https://api.example.com/v1'}
            spellCheck={false}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>模型</label>
          <input
            className={styles.input}
            type="text"
            list={`models-${config.provider}`}
            value={config.model}
            onChange={(e) => updateConfig({ model: e.target.value })}
            placeholder={currentPreset?.defaultModel || 'model-name'}
            spellCheck={false}
          />
          <datalist id={`models-${config.provider}`}>
            {/* 内置预设模型 */}
            {(AI_MODEL_PRESETS[config.provider] || []).map((m) => (
              <option key={`b-${m}`} value={m} />
            ))}
            {/* 已保存配置中所有模型（去重） */}
            {Array.from(
              new Set(
                presets
                  .filter((p) => p.config.provider === config.provider && p.config.model)
                  .map((p) => p.config.model)
              )
            ).map((m) => (
              <option key={`p-${m}`} value={m} />
            ))}
          </datalist>
          {presets.filter((p) => p.config.provider === config.provider).length > 0 && (
            <small className={styles.hint}>
              已合并 {presets.filter((p) => p.config.provider === config.provider).length} 个已保存配置中的模型名
            </small>
          )}
        </div>

        <div className={styles.row2}>
          <div className={styles.field}>
            <label className={styles.label}>Temperature</label>
            <input
              className={styles.input}
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={config.temperature}
              onChange={(e) => updateConfig({ temperature: Number(e.target.value) })}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Max Tokens</label>
            <input
              className={styles.input}
              type="number"
              min={64}
              max={32768}
              step={64}
              value={config.maxTokens}
              onChange={(e) => updateConfig({ maxTokens: Number(e.target.value) })}
            />
          </div>
        </div>

        <button
          className={styles.advancedToggle}
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          {advancedOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          高级设置
        </button>
        {advancedOpen && (
          <div className={styles.advancedPanel}>
            <div className={styles.field}>
              <label className={styles.label}>
                <input
                  type="checkbox"
                  checked={config.stream}
                  onChange={(e) => updateConfig({ stream: e.target.checked })}
                />
                <span style={{ marginLeft: 4 }}>启用流式输出（实时渲染）</span>
              </label>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>系统提示词</label>
              <textarea
                className={styles.textarea}
                value={config.systemPrompt}
                onChange={(e) => updateConfig({ systemPrompt: e.target.value })}
                rows={4}
                placeholder="可选：自定义 AI 角色与行为（被 Agent 角色覆盖时可忽略）"
              />
            </div>
          </div>
        )}

        <div className={styles.actions}>
          <button
            className={styles.testBtn}
            onClick={handleTest}
            disabled={testStatus === 'testing'}
          >
            <Send size={12} />
            {testStatus === 'testing' ? '测试中…' : '测试连接'}
          </button>
          <button className={styles.resetBtn} onClick={resetConfig}>
            <RotateCcw size={12} />
            重置
          </button>
        </div>

        {testStatus !== 'idle' && testMessage && (
          <div
            className={`${styles.testResult} ${
              testStatus === 'ok'
                ? styles.testResultOk
                : testStatus === 'fail'
                ? styles.testResultFail
                : ''
            }`}
          >
            {testMessage}
          </div>
        )}
      </section>
    </div>
  );
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '');
}
