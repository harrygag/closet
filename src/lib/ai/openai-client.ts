/**
 * OpenAI Client Wrapper
 *
 * Provides a typed, cost-aware wrapper around the OpenAI API
 * with token accounting, retry logic, and structured output support
 */

import OpenAI from 'openai';
import { z } from 'zod';

export interface OpenAIConfig {
  apiKey: string;
  chatModel?: string;
  embeddingModel?: string;
  fallbackModel?: string;
  temperatureStructured?: number;
  temperatureCreative?: number;
  maxRetries?: number;
  timeout?: number;
}

export interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json_object' | 'text';
  systemPrompt?: string;
}

export interface CompletionResult<T = any> {
  data: T;
  rawResponse: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  costEstimate: {
    inputCostUSD: number;
    outputCostUSD: number;
    totalCostUSD: number;
  };
  model: string;
  latencyMs: number;
}

export interface EmbeddingResult {
  embedding: number[];
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
  costEstimate: {
    totalCostUSD: number;
  };
  model: string;
  dimension: number;
  latencyMs: number;
}

/**
 * OpenAI pricing (as of 2025)
 * https://openai.com/api/pricing/
 */
const PRICING = {
  'gpt-4o-mini': {
    input: 0.00015 / 1000, // $0.15 per 1M tokens = $0.00015 per 1K
    output: 0.0006 / 1000, // $0.60 per 1M tokens = $0.0006 per 1K
  },
  'gpt-4o': {
    input: 0.0025 / 1000, // $2.50 per 1M tokens
    output: 0.01 / 1000, // $10 per 1M tokens
  },
  'text-embedding-3-small': {
    input: 0.00002 / 1000, // $0.02 per 1M tokens
  },
  'text-embedding-3-large': {
    input: 0.00013 / 1000, // $0.13 per 1M tokens
  },
};

export class OpenAIClient {
  private client: OpenAI;
  private config: Required<OpenAIConfig>;

  constructor(config: OpenAIConfig) {
    this.config = {
      chatModel: config.chatModel || 'gpt-4o-mini',
      embeddingModel: config.embeddingModel || 'text-embedding-3-large',
      fallbackModel: config.fallbackModel || 'gpt-4o-mini',
      temperatureStructured: config.temperatureStructured ?? 0.0,
      temperatureCreative: config.temperatureCreative ?? 0.3,
      maxRetries: config.maxRetries ?? 3,
      timeout: config.timeout ?? 60000,
      apiKey: config.apiKey,
    };

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      maxRetries: this.config.maxRetries,
      timeout: this.config.timeout,
    });
  }

  /**
   * Create a structured completion with Zod schema validation
   */
  async createStructuredCompletion<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options: CompletionOptions = {}
  ): Promise<CompletionResult<T>> {
    const startTime = Date.now();

    const model = options.model || this.config.chatModel;
    const temperature = options.temperature ?? this.config.temperatureStructured;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (options.systemPrompt) {
      messages.push({
        role: 'system',
        content: options.systemPrompt,
      });
    }

    messages.push({
      role: 'user',
      content: prompt,
    });

    try {
      const response = await this.client.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: options.maxTokens,
        response_format: { type: 'json_object' },
      });

      const latencyMs = Date.now() - startTime;
      const rawResponse = response.choices[0]?.message?.content || '';

      // Parse JSON response
      let parsed: any;
      try {
        parsed = JSON.parse(rawResponse);
      } catch (e) {
        throw new Error(`Failed to parse JSON response: ${rawResponse.substring(0, 200)}`);
      }

      // Validate with Zod schema
      const validated = schema.parse(parsed);

      // Calculate cost
      const usage = {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      };

      const pricing = PRICING[model as keyof typeof PRICING] || PRICING['gpt-4o-mini'];
      const costEstimate = {
        inputCostUSD: usage.promptTokens * pricing.input,
        outputCostUSD: usage.completionTokens * (pricing.output || pricing.input),
        totalCostUSD: 0,
      };
      costEstimate.totalCostUSD = costEstimate.inputCostUSD + costEstimate.outputCostUSD;

      return {
        data: validated,
        rawResponse,
        usage,
        costEstimate,
        model,
        latencyMs,
      };
    } catch (error) {
      if (this.shouldRetryWithFallback(error)) {
        console.warn(`Retrying with fallback model: ${this.config.fallbackModel}`);
        return this.createStructuredCompletion(prompt, schema, {
          ...options,
          model: this.config.fallbackModel,
        });
      }
      throw this.normalizeError(error);
    }
  }

  /**
   * Create a creative text completion (for titles, descriptions)
   */
  async createCompletion(
    prompt: string,
    options: CompletionOptions = {}
  ): Promise<CompletionResult<string>> {
    const startTime = Date.now();

    const model = options.model || this.config.chatModel;
    const temperature = options.temperature ?? this.config.temperatureCreative;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (options.systemPrompt) {
      messages.push({
        role: 'system',
        content: options.systemPrompt,
      });
    }

    messages.push({
      role: 'user',
      content: prompt,
    });

    const response = await this.client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: options.maxTokens,
    });

    const latencyMs = Date.now() - startTime;
    const rawResponse = response.choices[0]?.message?.content || '';

    const usage = {
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      totalTokens: response.usage?.total_tokens || 0,
    };

    const pricing = PRICING[model as keyof typeof PRICING] || PRICING['gpt-4o-mini'];
    const costEstimate = {
      inputCostUSD: usage.promptTokens * pricing.input,
      outputCostUSD: usage.completionTokens * (pricing.output || pricing.input),
      totalCostUSD: 0,
    };
    costEstimate.totalCostUSD = costEstimate.inputCostUSD + costEstimate.outputCostUSD;

    return {
      data: rawResponse,
      rawResponse,
      usage,
      costEstimate,
      model,
      latencyMs,
    };
  }

  /**
   * Create embeddings for text
   */
  async createEmbedding(text: string, model?: string): Promise<EmbeddingResult> {
    const startTime = Date.now();

    const embeddingModel = model || this.config.embeddingModel;

    const response = await this.client.embeddings.create({
      model: embeddingModel,
      input: text,
      encoding_format: 'float',
    });

    const latencyMs = Date.now() - startTime;

    const embedding = response.data[0]?.embedding || [];
    const usage = {
      promptTokens: response.usage?.prompt_tokens || 0,
      totalTokens: response.usage?.total_tokens || 0,
    };

    const pricing = PRICING[embeddingModel as keyof typeof PRICING] || PRICING['text-embedding-3-large'];
    const costEstimate = {
      totalCostUSD: usage.totalTokens * pricing.input,
    };

    return {
      embedding,
      usage,
      costEstimate,
      model: embeddingModel,
      dimension: embedding.length,
      latencyMs,
    };
  }

  /**
   * Create embeddings for multiple texts in batch
   */
  async createEmbeddings(texts: string[], model?: string): Promise<EmbeddingResult[]> {
    const embeddingModel = model || this.config.embeddingModel;

    // OpenAI supports batch embeddings (up to 2048 inputs)
    const batchSize = 2048;
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const startTime = Date.now();

      const response = await this.client.embeddings.create({
        model: embeddingModel,
        input: batch,
        encoding_format: 'float',
      });

      const latencyMs = Date.now() - startTime;

      const usage = {
        promptTokens: response.usage?.prompt_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      };

      const pricing = PRICING[embeddingModel as keyof typeof PRICING] || PRICING['text-embedding-3-large'];
      const totalCost = usage.totalTokens * pricing.input;

      response.data.forEach((item, idx) => {
        results.push({
          embedding: item.embedding,
          usage: {
            promptTokens: Math.floor(usage.promptTokens / batch.length),
            totalTokens: Math.floor(usage.totalTokens / batch.length),
          },
          costEstimate: {
            totalCostUSD: totalCost / batch.length,
          },
          model: embeddingModel,
          dimension: item.embedding.length,
          latencyMs: Math.floor(latencyMs / batch.length),
        });
      });
    }

    return results;
  }

  /**
   * Check if error should trigger fallback to different model
   */
  private shouldRetryWithFallback(error: any): boolean {
    if (error?.status === 429) return true; // Rate limit
    if (error?.status === 500) return true; // Server error
    if (error?.status === 503) return true; // Service unavailable
    return false;
  }

  /**
   * Normalize OpenAI errors
   */
  private normalizeError(error: any): Error {
    if (error instanceof Error) return error;

    const message = error?.message || error?.error?.message || 'Unknown OpenAI error';
    const code = error?.code || error?.error?.code || 'UNKNOWN_ERROR';

    return new Error(`[OpenAI ${code}] ${message}`);
  }

  /**
   * Estimate tokens for a string (rough approximation)
   * OpenAI uses ~4 characters per token on average
   */
  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate cost for a completion before making the call
   */
  static estimateCost(promptText: string, model: string = 'gpt-4o-mini'): {
    estimatedPromptTokens: number;
    estimatedCostUSD: number;
  } {
    const estimatedPromptTokens = this.estimateTokens(promptText);
    const pricing = PRICING[model as keyof typeof PRICING] || PRICING['gpt-4o-mini'];

    return {
      estimatedPromptTokens,
      estimatedCostUSD: estimatedPromptTokens * pricing.input,
    };
  }
}

/**
 * Singleton instance (use environment variables)
 */
let defaultClient: OpenAIClient | null = null;

export function getOpenAIClient(config?: Partial<OpenAIConfig>): OpenAIClient {
  if (!defaultClient || config) {
    const apiKey = config?.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    defaultClient = new OpenAIClient({
      apiKey,
      chatModel: config?.chatModel || process.env.OPENAI_CHAT_MODEL,
      embeddingModel: config?.embeddingModel || process.env.OPENAI_EMBEDDING_MODEL,
      temperatureStructured: config?.temperatureStructured
        ? parseFloat(String(config.temperatureStructured))
        : parseFloat(process.env.OPENAI_TEMPERATURE_STRUCTURED || '0.0'),
      temperatureCreative: config?.temperatureCreative
        ? parseFloat(String(config.temperatureCreative))
        : parseFloat(process.env.OPENAI_TEMPERATURE_CREATIVE || '0.3'),
    });
  }

  return defaultClient;
}
