import { Alert, ALERT_RETRY_ATTEMPTS } from '@tracer/core';
import { AlertRepository, AlertChannelRepository, AlertChannel, ApiKeyRepository, ProjectRepository, UserRepository } from '@tracer/db';
import { Resend } from 'resend';

interface ToolRouterSession {
  sessionId: string;
  mcpUrl: string;
}

// Rate limiting configuration (cooldown periods in milliseconds)
const RATE_LIMIT_COOLDOWNS: Record<string, number> = {
  low: 15 * 60 * 1000,      // 15 minutes
  medium: 10 * 60 * 1000,   // 10 minutes
  high: 5 * 60 * 1000,       // 5 minutes
  critical: 1 * 60 * 1000,   // 1 minute (critical alerts always sent)
};

// Batching window (group alerts within this time window)
const BATCH_WINDOW_MINUTES = 5;

export class AlertHandler {
  private session: ToolRouterSession | null = null;
  private alertRepository: AlertRepository;
  private channelRepository: AlertChannelRepository;
  private apiKeyRepository: ApiKeyRepository;
  private projectRepository: ProjectRepository;
  private userRepository: UserRepository;
  private apiKey: string;
  private userId: string;
  private toolkits: string[];
  private resend: Resend | null = null;

  constructor(
    alertRepository: AlertRepository,
    channelRepository: AlertChannelRepository,
    apiKeyRepository: ApiKeyRepository,
    projectRepository: ProjectRepository,
    userRepository: UserRepository,
    apiKey: string,
    userId: string,
    toolkits: string[]
  ) {
    this.alertRepository = alertRepository;
    this.channelRepository = channelRepository;
    this.apiKeyRepository = apiKeyRepository;
    this.projectRepository = projectRepository;
    this.userRepository = userRepository;
    this.apiKey = apiKey;
    this.userId = userId;
    this.toolkits = toolkits;
    
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      this.resend = new Resend(resendApiKey);
    }
  }

  async initializeSession(): Promise<void> {
    if (!this.apiKey) {
      return;
    }

    try {
      const response = await fetch('https://backend.composio.dev/api/v3/labs/tool_router/session', {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: this.userId,
          config: {
            toolkits: this.toolkits.map((toolkit) => ({ toolkit })),
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create Tool Router session: ${response.statusText}`);
      }

      const data = await response.json() as { session_id: string; chat_session_mcp_url?: string; mcpUrl?: string };
      this.session = {
        sessionId: data.session_id,
        mcpUrl: data.chat_session_mcp_url || data.mcpUrl || '',
      };

      // Tool Router session initialized (logged in composio-client)
    } catch (error) {
      // Failed to initialize Tool Router session (logged in composio-client)
      throw error;
    }
  }

  /**
   * Main method to send an alert with rate limiting and batching
   */
  async sendAlert(alert: Alert, alertId: number): Promise<boolean> {
    // Resolve projectId if not provided
    let projectId = alert.projectId;
    if (!projectId) {
      projectId = await this.apiKeyRepository.findProjectIdByService(alert.service) || undefined;
    }

    // Check rate limiting (cooldown period)
    const cooldown = RATE_LIMIT_COOLDOWNS[alert.severity] || RATE_LIMIT_COOLDOWNS.medium;
    const lastSentTime = await this.alertRepository.getLastSentTime(alert.service, alert.alertType, projectId);
    
    if (lastSentTime) {
      const timeSinceLastSent = Date.now() - lastSentTime.getTime();
      if (timeSinceLastSent < cooldown) {
        // Still in cooldown period - don't send individual alert, but batch it
        // The alert is already stored, we'll send a batched summary later
        return false;
      }
    }

    // Check for similar unsent alerts to batch together
    const similarAlerts = await this.alertRepository.getRecentUnsentAlerts(
      alert.service,
      alert.alertType,
      projectId,
      BATCH_WINDOW_MINUTES
    );

    // If we have multiple alerts, send a batched summary
    if (similarAlerts.length > 1) {
      return await this.sendBatchedAlerts(similarAlerts, projectId);
    }

    // Send single alert
    return await this.sendSingleAlert(alert, alertId, projectId);
  }

  /**
   * Send a batched summary of similar alerts
   */
  private async sendBatchedAlerts(alerts: any[], projectId?: number): Promise<boolean> {
    if (alerts.length === 0) return false;

    const firstAlert = alerts[0];
    const alertCount = alerts.length;
    const severity = firstAlert.severity;
    const service = firstAlert.service;
    const alertType = firstAlert.alertType;

    // Get alert channels
    const channels = projectId 
      ? await this.channelRepository.list(projectId, service, undefined)
      : [];

    // If no channels, try to get user email as fallback
    let userEmail: string | null = null;
    if (projectId && channels.length === 0) {
      try {
        const project = await this.projectRepository.findByIdInternal(projectId);
        if (project) {
          const user = await this.userRepository.findById(project.userId);
          if (user) {
            userEmail = user.email;
          }
        }
      } catch (error) {
        // Ignore errors when fetching user email
      }
    }

    if (channels.length === 0 && !userEmail) {
      return false;
    }

    const summaryMessage = this.formatBatchedSummary(alerts, alertCount, alertType, service, severity);
    let successCount = 0;

    // Send to configured channels
    for (const channel of channels) {
      try {
        if (channel.channelType === 'slack') {
          const sent = await this.sendSlackMessage(summaryMessage, channel);
          if (sent) successCount++;
        } else if (channel.channelType === 'email') {
          const sent = await this.sendEmailMessage(
            summaryMessage,
            `[${severity.toUpperCase()}] ${alertCount} ${alertType} alerts in ${service}`,
            channel
          );
          if (sent) successCount++;
        }
      } catch (error) {
        // Continue to next channel
      }
    }

    // Send to user email if no channels configured
    if (userEmail && channels.length === 0) {
      try {
        const sent = await this.sendEmailToUser(
          userEmail,
          summaryMessage,
          `[${severity.toUpperCase()}] ${alertCount} ${alertType} alerts in ${service}`
        );
        if (sent) successCount++;
      } catch (error) {
        // Ignore errors
      }
    }

    // Mark all alerts as sent
    if (successCount > 0) {
      for (const alert of alerts) {
        await this.alertRepository.markAsSent(alert.id, this.session?.sessionId || undefined);
      }
      return true;
    }

    return false;
  }

  /**
   * Send a single alert
   */
  private async sendSingleAlert(alert: Alert, alertId: number, projectId?: number): Promise<boolean> {
    // Get alert channels
    const channels = projectId 
      ? await this.channelRepository.list(projectId, alert.service, undefined)
      : [];

    // If no channels, try to get user email as fallback
    let userEmail: string | null = null;
    if (projectId && channels.length === 0) {
      try {
        const project = await this.projectRepository.findByIdInternal(projectId);
        if (project) {
          const user = await this.userRepository.findById(project.userId);
          if (user) {
            userEmail = user.email;
          }
        }
      } catch (error) {
        // Ignore errors when fetching user email
      }
    }

    if (channels.length === 0 && !userEmail) {
      // No alert channels configured and no user email
      return false;
    }

    let successCount = 0;
    const errors: string[] = [];

    // Send to configured channels
    for (const channel of channels) {
      try {
        if (channel.channelType === 'slack') {
          const sent = await this.sendSlackAlert(alert, channel);
          if (sent) successCount++;
        } else if (channel.channelType === 'email') {
          const sent = await this.sendEmailAlert(alert, channel);
          if (sent) successCount++;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${channel.channelType} channel ${channel.id}: ${errorMsg}`);
      }
    }

    // Send to user email if no channels configured
    if (userEmail && channels.length === 0) {
      try {
        const sent = await this.sendEmailToUser(
          userEmail,
          this.formatEmailMessage(alert),
          `[${alert.severity && typeof alert.severity === 'string' ? alert.severity.toUpperCase() : 'UNKNOWN'}] Alert: ${alert.alertType} - ${alert.service}`
        );
        if (sent) successCount++;
      } catch (error) {
        // Ignore errors
      }
    }

    if (successCount > 0) {
      await this.alertRepository.markAsSent(alertId, this.session?.sessionId || undefined);
      return true;
    } else {
      return false;
    }
  }

  private async sendSlackAlert(alert: Alert, channel: AlertChannel): Promise<boolean> {
    const slackMessage = this.formatSlackMessage(alert);
    return await this.sendSlackMessage(slackMessage, channel);
  }

  private async sendSlackMessage(message: string, channel: AlertChannel): Promise<boolean> {
    const config = channel.config as { slack?: { channel: string; accessToken?: string; webhookUrl?: string } };
    if (!config?.slack?.channel) {
      throw new Error('Slack channel not configured');
    }
    
    if (config.slack.webhookUrl) {
      const response = await fetch(config.slack.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: message,
        }),
      });
      return response.ok;
    } else if (this.session && this.toolkits.includes('slack')) {
      const response = await fetch(`${this.session.mcpUrl}/tools/multi_execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calls: [{
            tool_slug: 'SLACK_SEND_MESSAGE',
            arguments: {
              channel: config.slack?.channel || '',
              markdown_text: message,
            },
          }],
        }),
      });

      if (!response.ok) {
        throw new Error(`Slack send failed: ${response.statusText}`);
      }

      let result: { results?: Array<{ status: string }> };
      try {
        result = await response.json() as { results?: Array<{ status: string }> };
      } catch (error) {
        throw new Error(`Failed to parse Slack response: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      return result.results?.[0]?.status === 'success';
    }

    throw new Error('No Slack integration method available. Provide webhookUrl or set COMPOSIO_API_KEY for OAuth.');
  }

  private async sendEmailAlert(alert: Alert, channel: AlertChannel): Promise<boolean> {
    const emailMessage = this.formatEmailMessage(alert);
    const subject = `[${alert.severity && typeof alert.severity === 'string' ? alert.severity.toUpperCase() : 'UNKNOWN'}] Alert: ${alert.alertType} - ${alert.service}`;
    return await this.sendEmailMessage(emailMessage, subject, channel);
  }

  private async sendEmailMessage(message: string, subject: string, channel: AlertChannel): Promise<boolean> {
    const config = channel.config as { email?: { recipients: string[]; fromEmail?: string; resendApiKey?: string } };
    if (!config.email?.recipients || config.email.recipients.length === 0) {
      throw new Error('Email recipients not configured');
    }

    if (!this.resend && !config.email.resendApiKey) {
      throw new Error('Resend API key not configured');
    }

    const resend = config.email.resendApiKey ? new Resend(config.email.resendApiKey) : this.resend!;
    const fromEmail = config.email.fromEmail || process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    const results = await Promise.allSettled(
      config.email.recipients.map(recipient =>
        resend.emails.send({
          from: fromEmail,
          to: recipient,
          subject,
          html: message,
        })
      )
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    return successCount > 0;
  }

  private async sendEmailToUser(email: string, message: string, subject: string): Promise<boolean> {
    if (!this.resend) {
      throw new Error('Resend API key not configured');
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    try {
      const result = await this.resend.emails.send({
        from: fromEmail,
        to: email,
        subject,
        html: message,
      });
      return result.error === null || result.error === undefined;
    } catch (error) {
      return false;
    }
  }

  private formatSlackMessage(alert: Alert): string {
    const severityEmoji: Record<string, string> = {
      low: 'ℹ️',
      medium: '⚠️',
      high: '🔴',
      critical: '🚨',
    };

    return `# ${severityEmoji[alert.severity] || '⚠️'} Alert: ${alert.alertType}

**Service**: ${alert.service}
**Severity**: ${alert.severity && typeof alert.severity === 'string' ? alert.severity.toUpperCase() : 'UNKNOWN'}
**Message**: ${alert.message}
**Time**: ${alert.createdAt ? new Date(alert.createdAt).toISOString() : 'Invalid date'}

\`\`\`
Type: ${alert.alertType}
\`\`\`
`;
  }

  private formatBatchedSummary(alerts: any[], count: number, alertType: string, service: string, severity: string): string {
    const severityEmoji: Record<string, string> = {
      low: 'ℹ️',
      medium: '⚠️',
      high: '🔴',
      critical: '🚨',
    };

    const firstAlert = alerts[0];
    const lastAlert = alerts[alerts.length - 1];
    const timeRange = `${new Date(firstAlert.createdAt).toISOString()} to ${new Date(lastAlert.createdAt).toISOString()}`;

    return `# ${severityEmoji[severity] || '⚠️'} Alert Summary: ${count} ${alertType} alerts

**Service**: ${service}
**Severity**: ${severity.toUpperCase()}
**Count**: ${count} alerts
**Time Range**: ${timeRange}

**Recent Alerts**:
${alerts.slice(0, 10).map(a => `- ${a.message} (${new Date(a.createdAt).toISOString()})`).join('\n')}
${count > 10 ? `\n... and ${count - 10} more alerts` : ''}

All alerts have been logged. Please check your dashboard for details.
`;
  }

  private formatEmailMessage(alert: Alert): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; }
    .alert { border-left: 4px solid ${this.getSeverityColor(alert.severity)}; padding: 10px; margin: 10px 0; }
    .severity { font-weight: bold; color: ${this.getSeverityColor(alert.severity)}; }
  </style>
</head>
<body>
  <div class="alert">
    <h2>Alert: ${alert.alertType}</h2>
    <p><strong>Service:</strong> ${alert.service}</p>
    <p><strong>Severity:</strong> <span class="severity">${alert.severity && typeof alert.severity === 'string' ? alert.severity.toUpperCase() : 'UNKNOWN'}</span></p>
    <p><strong>Message:</strong> ${alert.message}</p>
    <p><strong>Time:</strong> ${alert.createdAt ? new Date(alert.createdAt).toISOString() : 'Invalid date'}</p>
  </div>
</body>
</html>
`;
  }

  private getSeverityColor(severity: string): string {
    const colors: Record<string, string> = {
      low: '#2196F3',
      medium: '#FF9800',
      high: '#F44336',
      critical: '#9C27B0',
    };
    return colors[severity] || '#000000';
  }
}
