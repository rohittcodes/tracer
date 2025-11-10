/**
 * AI Agent for observability platform
 * Combines AI SDK with observability tools and Composio Tool Router
 */

import { streamText, tool, stepCountIs, CoreMessage } from 'ai';
import { AIClient, AIConfig } from './ai-client';
import { ComposioClient } from './composio-client';
import { createObservabilityTools } from './observability-tools';
import { TraceRepository, LogRepository, AlertRepository, MetricRepository } from '@tracer/db';

export interface AIAgentConfig {
  ai: AIConfig;
  composio?: {
    apiKey: string;
    userId?: string;
    toolkits?: string[];
  };
  repositories: {
    traceRepository: TraceRepository;
    logRepository: LogRepository;
    alertRepository: AlertRepository;
    metricRepository: MetricRepository;
  };
}

export class ObservabilityAIAgent {
  private aiClient: AIClient;
  private composioClient?: ComposioClient;
  private repositories: AIAgentConfig['repositories'];

  constructor(config: AIAgentConfig) {
    this.aiClient = new AIClient(config.ai);
    this.repositories = config.repositories;

    if (config.composio?.apiKey) {
      this.composioClient = new ComposioClient({
        apiKey: config.composio.apiKey,
        userId: config.composio.userId,
        toolkits: config.composio.toolkits,
      });
    }
  }

  /**
   * Analyze observability data using AI
   * Supports both single query string and message array (for conversation history)
   */
  async analyze(
    queryOrMessages: string | CoreMessage[],
    options?: {
      includeToolRouter?: boolean;
      maxSteps?: number;
    }
  ) {
    const model = this.aiClient.getModel();
    const observabilityTools = createObservabilityTools(this.repositories);

    // Combine observability tools with Tool Router tools if available
    let allTools: Record<string, any> = observabilityTools;
    let mcpClient: Awaited<ReturnType<ComposioClient['createMCPClient']>> | null = null;

    if (options?.includeToolRouter && this.composioClient) {
      try {
        mcpClient = await this.composioClient.createMCPClient();
        const mcpTools = await mcpClient.tools();
        
        // Prefix Tool Router tools to avoid conflicts (following docs pattern)
        for (const [toolName, mcpTool] of Object.entries(mcpTools)) {
          allTools[`toolRouter_${toolName}`] = mcpTool;
        }
      } catch (error) {
        console.warn('Failed to load Tool Router tools, continuing with observability tools only:', error);
      }
    }

    const systemPrompt = `You are an expert observability engineer analyzing distributed systems.

You have access to:
1. **Observability Tools**: Analyze traces, search logs, check alerts, view metrics, and understand service dependencies
2. **External Tools** (if enabled): Access to 500+ external integrations via Tool Router (Slack, Gmail, GitHub, etc.)

**Guidelines**:
- Use observability tools to understand system state
- Provide actionable insights and recommendations
- Be specific and reference actual data (trace IDs, service names, etc.)
- For external actions (sending alerts, creating tickets), use Tool Router tools
- Break down complex queries into multiple tool calls if needed

**Example Queries**:
- "What's causing errors in the user-service?" → Use analyzeTrace or searchLogs
- "Show me active alerts" → Use getActiveAlerts
- "What services depend on the payment service?" → Use getServiceDependencies
- "Send a Slack message about this alert" → Use toolRouter_slack_send_message`;

    // Convert query string to messages array, or use provided messages
    const messages: CoreMessage[] = typeof queryOrMessages === 'string'
      ? [{ role: 'user', content: queryOrMessages }]
      : queryOrMessages;

    const maxSteps = options?.maxSteps || 10;

    // Stream response with proper cleanup (following docs pattern)
    // Ensure MCP client is closed even if streamText throws synchronously
    try {
      const result = await streamText({
        model,
        system: systemPrompt,
        messages,
        tools: allTools,
        stopWhen: stepCountIs(maxSteps), // Allow multi-step tool calling (as per AI SDK docs)
        temperature: 0.3,
        // When streaming, the client should be closed after the response is finished (following docs pattern)
        onFinish: async () => {
          console.log('[Tool] Stream finished, closing MCP client');
          if (mcpClient) {
            try {
              await mcpClient.close();
            } catch (closeError) {
              console.error('[Tool] Error closing MCP client:', closeError);
            }
          }
        },
        // Closing clients onError is optional but recommended (following docs pattern)
        // - Closing: Immediately frees resources, prevents hanging connections
        // - Not closing: Keeps connection open for retries
        onError: async (error: unknown) => {
          console.error('[Tool] Error during streaming:', error);
          if (mcpClient) {
            try {
              await mcpClient.close();
            } catch (closeError) {
              console.error('[Tool] Error closing MCP client:', closeError);
            }
          }
        },
      });

      return result;
    } catch (error) {
      // If streamText throws synchronously, ensure MCP client is closed
      if (mcpClient) {
        try {
          await mcpClient.close();
        } catch (closeError) {
          console.error('[Tool] Error closing MCP client after streamText error:', closeError);
        }
      }
      throw error;
    }
  }

  /**
   * Analyze trace for root cause (convenience method)
   */
  async analyzeTraceRootCause(traceId: string): Promise<string> {
    const result = await this.analyze(
      `Analyze trace ${traceId} and identify the root cause of any failures or performance issues. Provide specific recommendations.`
    );

    // Collect the full response
    let response = '';
    for await (const chunk of result.textStream) {
      response += chunk;
    }

    return response;
  }

  /**
   * Summarize logs (convenience method)
   */
  async summarizeLogs(service?: string, timeWindowHours: number = 1): Promise<string> {
    const startTime = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000).toISOString();
    const endTime = new Date().toISOString();

    const query = service
      ? `Summarize logs for service "${service}" from ${startTime} to ${endTime}. Identify patterns, errors, and provide insights.`
      : `Summarize all logs from ${startTime} to ${endTime}. Identify patterns, errors, and provide insights.`;

    const result = await this.analyze(query);

    let response = '';
    for await (const chunk of result.textStream) {
      response += chunk;
    }

    return response;
  }
}

