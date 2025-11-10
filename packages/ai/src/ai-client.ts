/**
 * AI SDK client for observability platform
 * Provides unified interface for multiple LLM providers
 */

import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

export type AIProvider = 'openai' | 'google' | 'anthropic';
export type AIModel = 
  // OpenAI models
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'gpt-4-turbo'
  | 'gpt-3.5-turbo'
  // Google models
  | 'gemini-2.0-flash-exp'
  | 'gemini-1.5-pro'
  | 'gemini-1.5-flash'
  // Anthropic models (via custom provider)
  | 'claude-3-5-sonnet-20241022'
  | 'claude-3-opus-20240229'
  | 'claude-3-haiku-20240307';

export interface AIConfig {
  provider: AIProvider;
  model?: AIModel;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

export class AIClient {
  private config: AIConfig;
  private model: LanguageModel;

  constructor(config: AIConfig) {
    this.config = {
      provider: config.provider || 'openai',
      model: config.model || (config.provider === 'openai' ? 'gpt-4o-mini' : 'gemini-1.5-flash'),
      temperature: config.temperature || 0.3,
      maxTokens: config.maxTokens || 2000,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    };

    this.model = this.createModel();
  }

  private createModel(): LanguageModel {
    const apiKey = this.config.apiKey || 
                   (this.config.provider === 'openai' ? process.env.OPENAI_API_KEY : undefined) ||
                   (this.config.provider === 'google' ? process.env.GOOGLE_GENERATIVE_AI_API_KEY : undefined);

    if (!apiKey && !this.config.baseUrl) {
      throw new Error(`API key not configured for provider: ${this.config.provider}. Set ${this.config.provider.toUpperCase()}_API_KEY or provide baseUrl`);
    }

    switch (this.config.provider) {
      case 'openai':
        // OpenAI SDK doesn't support baseURL in constructor, would need custom fetch
        return openai(this.config.model as any);
      
      case 'google':
        // Google SDK doesn't support baseURL in constructor, would need custom fetch
        return google(this.config.model as any);
      
      case 'anthropic':
        // Anthropic via custom provider (would need @ai-sdk/anthropic or custom implementation)
        throw new Error('Anthropic provider not yet implemented. Use OpenAI or Google.');
      
      default:
        throw new Error(`Unsupported provider: ${this.config.provider}`);
    }
  }

  getModel(): LanguageModel {
    return this.model;
  }

  getConfig(): AIConfig {
    return { ...this.config };
  }
}

