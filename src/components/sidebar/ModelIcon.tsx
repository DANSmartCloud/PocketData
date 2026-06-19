import { Sparkles, Server } from "lucide-react";
// 已有 Color 子组件的图标（直接双变体）
import DeepSeekColor from "@lobehub/icons/es/DeepSeek/components/Color";
import DeepSeekMono from "@lobehub/icons/es/DeepSeek/components/Mono";
import QwenColor from "@lobehub/icons/es/Qwen/components/Color";
import QwenMono from "@lobehub/icons/es/Qwen/components/Mono";
import GemmaColor from "@lobehub/icons/es/Gemma/components/Color";
import GemmaMono from "@lobehub/icons/es/Gemma/components/Mono";
import MistralColor from "@lobehub/icons/es/Mistral/components/Color";
import MistralMono from "@lobehub/icons/es/Mistral/components/Mono";
import MetaColor from "@lobehub/icons/es/Meta/components/Color";
import MetaMono from "@lobehub/icons/es/Meta/components/Mono";
import ClaudeColor from "@lobehub/icons/es/Claude/components/Color";
import ClaudeMono from "@lobehub/icons/es/Claude/components/Mono";
import GeminiColor from "@lobehub/icons/es/Gemini/components/Color";
import GeminiMono from "@lobehub/icons/es/Gemini/components/Mono";
import MicrosoftColor from "@lobehub/icons/es/Microsoft/components/Color";
import MicrosoftMono from "@lobehub/icons/es/Microsoft/components/Mono";
import AwsColor from "@lobehub/icons/es/Aws/components/Color";
import AwsMono from "@lobehub/icons/es/Aws/components/Mono";
import GoogleColor from "@lobehub/icons/es/Google/components/Color";
import GoogleMono from "@lobehub/icons/es/Google/components/Mono";
import HuggingFaceColor from "@lobehub/icons/es/HuggingFace/components/Color";
import HuggingFaceMono from "@lobehub/icons/es/HuggingFace/components/Mono";
import StabilityColor from "@lobehub/icons/es/Stability/components/Color";
import StabilityMono from "@lobehub/icons/es/Stability/components/Mono";
import CohereColor from "@lobehub/icons/es/Cohere/components/Color";
import CohereMono from "@lobehub/icons/es/Cohere/components/Mono";
import PerplexityColor from "@lobehub/icons/es/Perplexity/components/Color";
import PerplexityMono from "@lobehub/icons/es/Perplexity/components/Mono";
import TogetherColor from "@lobehub/icons/es/Together/components/Color";
import TogetherMono from "@lobehub/icons/es/Together/components/Mono";
import FireworksColor from "@lobehub/icons/es/Fireworks/components/Color";
import FireworksMono from "@lobehub/icons/es/Fireworks/components/Mono";
import NovitaColor from "@lobehub/icons/es/Novita/components/Color";
import NovitaMono from "@lobehub/icons/es/Novita/components/Mono";
import YiColor from "@lobehub/icons/es/Yi/components/Color";
import YiMono from "@lobehub/icons/es/Yi/components/Mono";
import ZhipuColor from "@lobehub/icons/es/Zhipu/components/Color";
import ZhipuMono from "@lobehub/icons/es/Zhipu/components/Mono";
import StepfunColor from "@lobehub/icons/es/Stepfun/components/Color";
import StepfunMono from "@lobehub/icons/es/Stepfun/components/Mono";
import SparkColor from "@lobehub/icons/es/Spark/components/Color";
import SparkMono from "@lobehub/icons/es/Spark/components/Mono";
import WenxinColor from "@lobehub/icons/es/Wenxin/components/Color";
import WenxinMono from "@lobehub/icons/es/Wenxin/components/Mono";
import BaichuanColor from "@lobehub/icons/es/Baichuan/components/Color";
import BaichuanMono from "@lobehub/icons/es/Baichuan/components/Mono";
import HunyuanColor from "@lobehub/icons/es/Hunyuan/components/Color";
import HunyuanMono from "@lobehub/icons/es/Hunyuan/components/Mono";
import DoubaoColor from "@lobehub/icons/es/Doubao/components/Color";
import DoubaoMono from "@lobehub/icons/es/Doubao/components/Mono";
// 仅 Mono 子组件的图标（Color 模式也用 Mono）
import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import OllamaMono from "@lobehub/icons/es/Ollama/components/Mono";
import AnthropicMono from "@lobehub/icons/es/Anthropic/components/Mono";
import GroqMono from "@lobehub/icons/es/Groq/components/Mono";
import ReplicateMono from "@lobehub/icons/es/Replicate/components/Mono";
import XAIMono from "@lobehub/icons/es/XAI/components/Mono";
import MoonshotMono from "@lobehub/icons/es/Moonshot/components/Mono";

/**
 * 模型品牌图标
 *
 * 基于 @lobehub/icons（200+ AI/LLM 品牌 SVG 标志）
 * - 直接导入各品牌的 Color / Mono 组件（避免 antd 重依赖）
 * - 智能匹配：模型名关键字 → 对应品牌组件
 * - 终极退路：Sparkles（lucide-react）
 */

interface BrandPair {
  Color: any;
  Mono: any;
}

function pickByModel(model: string): BrandPair | null {
  const m = (model || "").toLowerCase();

  if (m.includes("deepseek")) return { Color: DeepSeekColor, Mono: DeepSeekMono };
  if (m.includes("gpt") || m.includes("o1") || m.includes("o3") || m.includes("o4")) {
    return { Color: OpenAIMono, Mono: OpenAIMono };
  }
  if (m.includes("claude")) return { Color: ClaudeColor, Mono: ClaudeMono };
  if (m.includes("gemini") || m.includes("bard")) return { Color: GeminiColor, Mono: GeminiMono };
  if (m.includes("llama") || m.includes("meta-llama")) return { Color: MetaColor, Mono: MetaMono };
  if (m.includes("qwen") || m.includes("tongyi")) return { Color: QwenColor, Mono: QwenMono };
  if (m.includes("gemma")) return { Color: GemmaColor, Mono: GemmaMono };
  if (m.includes("mistral") || m.includes("mixtral")) return { Color: MistralColor, Mono: MistralMono };
  if (m.includes("anthropic")) return { Color: AnthropicMono, Mono: AnthropicMono };
  if (m.includes("yi-") || m.includes("yi:")) return { Color: YiColor, Mono: YiMono };
  if (m.includes("glm") || m.includes("chatglm") || m.includes("zhipu")) return { Color: ZhipuColor, Mono: ZhipuMono };
  if (m.includes("step")) return { Color: StepfunColor, Mono: StepfunMono };
  if (m.includes("wenxin") || m.includes("ernie")) return { Color: WenxinColor, Mono: WenxinMono };
  if (m.includes("spark") || m.includes("iflytek")) return { Color: SparkColor, Mono: SparkMono };
  if (m.includes("hunyuan") || m.includes("tencent")) return { Color: HunyuanColor, Mono: HunyuanMono };
  if (m.includes("moonshot") || m.includes("kimi")) return { Color: MoonshotMono, Mono: MoonshotMono };
  if (m.includes("doubao") || m.includes("bytedance")) return { Color: DoubaoColor, Mono: DoubaoMono };
  if (m.includes("baichuan")) return { Color: BaichuanColor, Mono: BaichuanMono };
  if (m.includes("stability") || m.includes("sd-")) return { Color: StabilityColor, Mono: StabilityMono };
  if (m.includes("cohere") || m.includes("command")) return { Color: CohereColor, Mono: CohereMono };
  if (m.includes("groq")) return { Color: GroqMono, Mono: GroqMono };
  if (m.includes("perplexity") || m.includes("pplx")) return { Color: PerplexityColor, Mono: PerplexityMono };
  if (m.includes("xai") || m.includes("grok")) return { Color: XAIMono, Mono: XAIMono };
  if (m.includes("together")) return { Color: TogetherColor, Mono: TogetherMono };
  if (m.includes("replicate")) return { Color: ReplicateMono, Mono: ReplicateMono };
  if (m.includes("fireworks")) return { Color: FireworksColor, Mono: FireworksMono };
  if (m.includes("novita")) return { Color: NovitaColor, Mono: NovitaMono };
  if (m.includes("huggingface") || m.includes("hugging-face")) return { Color: HuggingFaceColor, Mono: HuggingFaceMono };
  if (m.includes("aws") || m.includes("bedrock") || m.includes("titan")) return { Color: AwsColor, Mono: AwsMono };
  if (m.includes("microsoft") || m.includes("phi-") || m.includes("wizardlm")) return { Color: MicrosoftColor, Mono: MicrosoftMono };
  if (m.includes("google") || m.includes("palm")) return { Color: GoogleColor, Mono: GoogleMono };
  if (m.includes("ollama") || m === "llama3" || m === "llama2") return { Color: OllamaMono, Mono: OllamaMono };

  return null;
}

export function ModelIcon({
  model,
  size = 12,
  className,
  type = "color",
}: {
  model: string;
  size?: number;
  className?: string;
  type?: "color" | "mono";
}) {
  const picked = pickByModel(model);
  if (picked) {
    const Cmp = type === "mono" ? picked.Mono : picked.Color;
    return <Cmp size={size} className={className} />;
  }
  return <Sparkles size={size} className={className} aria-hidden />;
}

/**
 * Provider 品牌图标 - 用于 AI 设置面板中
 */
function pickByProvider(provider: string): BrandPair | null {
  const p = (provider || "").toLowerCase();
  if (p === "deepseek") return { Color: DeepSeekColor, Mono: DeepSeekMono };
  if (p === "openai" || p === "gpt") return { Color: OpenAIMono, Mono: OpenAIMono };
  if (p === "ollama") return { Color: OllamaMono, Mono: OllamaMono };
  if (p === "qwen" || p === "tongyi" || p === "alibaba") return { Color: QwenColor, Mono: QwenMono };
  if (p === "gemma" || p === "google") return { Color: GemmaColor, Mono: GemmaMono };
  if (p === "mistral") return { Color: MistralColor, Mono: MistralMono };
  if (p === "meta" || p === "llama") return { Color: MetaColor, Mono: MetaMono };
  if (p === "claude" || p === "anthropic") return { Color: AnthropicMono, Mono: AnthropicMono };
  if (p === "gemini" || p === "bard") return { Color: GeminiColor, Mono: GeminiMono };
  if (p === "zhipu" || p === "glm" || p === "chatglm") return { Color: ZhipuColor, Mono: ZhipuMono };
  if (p === "stepfun" || p === "step") return { Color: StepfunColor, Mono: StepfunMono };
  if (p === "baidu" || p === "wenxin" || p === "ernie") return { Color: WenxinColor, Mono: WenxinMono };
  if (p === "spark" || p === "iflytek") return { Color: SparkColor, Mono: SparkMono };
  if (p === "hunyuan" || p === "tencent") return { Color: HunyuanColor, Mono: HunyuanMono };
  if (p === "moonshot" || p === "kimi") return { Color: MoonshotMono, Mono: MoonshotMono };
  if (p === "doubao" || p === "bytedance") return { Color: DoubaoColor, Mono: DoubaoMono };
  if (p === "baichuan") return { Color: BaichuanColor, Mono: BaichuanMono };
  if (p === "yi") return { Color: YiColor, Mono: YiMono };
  if (p === "xai" || p === "grok") return { Color: XAIMono, Mono: XAIMono };
  if (p === "groq") return { Color: GroqMono, Mono: GroqMono };
  if (p === "perplexity" || p === "pplx") return { Color: PerplexityColor, Mono: PerplexityMono };
  if (p === "cohere") return { Color: CohereColor, Mono: CohereMono };
  if (p === "huggingface" || p === "hugging-face") return { Color: HuggingFaceColor, Mono: HuggingFaceMono };
  if (p === "aws" || p === "bedrock") return { Color: AwsColor, Mono: AwsMono };
  if (p === "microsoft" || p === "azure") return { Color: MicrosoftColor, Mono: MicrosoftMono };
  if (p === "stability") return { Color: StabilityColor, Mono: StabilityMono };
  if (p === "replicate") return { Color: ReplicateMono, Mono: ReplicateMono };
  if (p === "together") return { Color: TogetherColor, Mono: TogetherMono };
  if (p === "fireworks") return { Color: FireworksColor, Mono: FireworksMono };
  if (p === "novita") return { Color: NovitaColor, Mono: NovitaMono };
  return null;
}

export function ProviderIcon({
  provider,
  size = 14,
  className,
  type = "color",
}: {
  provider: string;
  size?: number;
  className?: string;
  type?: "color" | "mono";
}) {
  const picked = pickByProvider(provider);
  if (picked) {
    const Cmp = type === "mono" ? picked.Mono : picked.Color;
    return <Cmp size={size} className={className} />;
  }
  if ((provider || "").toLowerCase() === "ollama") {
    return <Server size={size} className={className} aria-hidden />;
  }
  return <Sparkles size={size} className={className} aria-hidden />;
}
