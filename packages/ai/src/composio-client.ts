/**
 * Composio Tool Router client for observability platform
 * Provides access to 500+ external integrations via MCP
 */

import { Composio } from '@composio/core';
import { OpenAIAgentsProvider } from '@composio/openai-agents';
import { experimental_createMCPClient } from '@ai-sdk/mcp';

export interface ToolRouterSession {
  sessionId: string;
  mcpUrl: string;
  toolkits: string[];
}

export interface ToolRouterConfig {
  apiKey: string;
  userId?: string;
  toolkits?: string[];
}

export class ComposioClient {
  private composio: Composio;
  private apiKey: string;
  private userId: string;
  private toolkits: string[];

  constructor(config: ToolRouterConfig) {
    this.apiKey = config.apiKey;
    this.userId = config.userId || 'tracer-system';
    this.toolkits = config.toolkits || ['slack', 'gmail'];

    this.composio = new Composio({
      apiKey: this.apiKey,
      provider: new OpenAIAgentsProvider(),
    }) as any; // Type compatibility issue between Composio versions
  }

  /**
   * Create or get Tool Router session
   */
  async getSession(): Promise<ToolRouterSession> {
    try {
      const session = await this.composio.experimental.toolRouter.createSession(
        this.userId,
        { toolkits: this.toolkits }
      );

      const sessionResponse = session as any;
      const sessionUrl = sessionResponse.url || 
                        sessionResponse.chat_session_mcp_url || 
                        sessionResponse.tool_router_instance_mcp_url;
      const sessionId = sessionResponse.session_id || sessionResponse.sessionId;

      return {
        sessionId: sessionId || '',
        mcpUrl: sessionUrl || '',
        toolkits: this.toolkits,
      };
    } catch (error) {
      console.error('Failed to create Tool Router session:', error);
      throw error;
    }
  }

  /**
   * Create MCP client for Tool Router
   */
  async createMCPClient(): Promise<Awaited<ReturnType<typeof experimental_createMCPClient>>> {
    const session = await this.getSession();
    
    if (!session.mcpUrl) {
      throw new Error('Tool Router session URL not available');
    }

    return await experimental_createMCPClient({
      transport: {
        type: 'http',
        url: session.mcpUrl,
        headers: session.sessionId
          ? {
              'X-Session-Id': session.sessionId,
            }
          : undefined,
      },
    });
  }
}

