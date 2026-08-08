import Anthropic from '@anthropic-ai/sdk';

/**
 * Thin wrapper over the Anthropic SDK in browser mode. The key never leaves
 * localStorage; calls go directly from the user's browser to the API.
 */

export const MODELS = [
  { id: 'claude-sonnet-5', label: 'Sonnet 5 (recommended — fast, cheap enough to talk to)' },
  { id: 'claude-opus-5', label: 'Opus 5 (sharper, pricier, slower)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 (cheapest; fine for compressed practice)' },
] as const;

export const DEFAULT_MODEL = 'claude-sonnet-5';

const SETTINGS_KEYS = {
  anthropicKey: 'wt.anthropicKey',
  openaiKey: 'wt.openaiKey',
  model: 'wt.model',
};

export function getSetting(key: keyof typeof SETTINGS_KEYS): string {
  try {
    return localStorage.getItem(SETTINGS_KEYS[key]) ?? '';
  } catch {
    return '';
  }
}

export function setSetting(key: keyof typeof SETTINGS_KEYS, value: string): void {
  try {
    localStorage.setItem(SETTINGS_KEYS[key], value);
  } catch {
    /* private mode etc. — session still works, just not persisted */
  }
}

export function makeClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * One-shot tool-forced call: the model must answer by calling `tool`.
 * The big system block is cache-marked — it's identical across the dozens of
 * wakes in a session, so prompt caching pays for itself immediately.
 */
export async function callWithTool<T>(
  client: Anthropic,
  opts: {
    model: string;
    system: string;
    messages: Anthropic.MessageParam[];
    tool: ToolSpec;
    maxTokens?: number;
  },
): Promise<T> {
  const res = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 1500,
    system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
    messages: opts.messages,
    tools: [{ ...opts.tool, input_schema: opts.tool.input_schema as Anthropic.Tool['input_schema'] }],
    tool_choice: { type: 'tool', name: opts.tool.name },
  });
  const block = res.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') {
    throw new Error('Model did not return the expected tool call');
  }
  return block.input as T;
}

/** Plain text call (the open coach conversation after the scorecard lands). */
export async function callText(
  client: Anthropic,
  opts: { model: string; system: string; messages: Anthropic.MessageParam[]; maxTokens?: number },
): Promise<string> {
  const res = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2000,
    system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
    messages: opts.messages,
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

export function imageBlock(pngBase64: string): Anthropic.ImageBlockParam {
  return {
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data: pngBase64 },
  };
}
