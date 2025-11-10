import { AlertChannel } from '../schema';
export declare class AlertChannelRepository {
    create(data: {
        channelType: 'slack' | 'email';
        name?: string;
        service?: string;
        config: {
            slack?: {
                channel: string;
                accessToken?: string;
                webhookUrl?: string;
            };
            email?: {
                recipients: string[];
                fromEmail?: string;
                resendApiKey?: string;
            };
        };
    }): Promise<AlertChannel>;
    list(service?: string, channelType?: 'slack' | 'email'): Promise<AlertChannel[]>;
    getById(id: number): Promise<AlertChannel | null>;
    update(id: number, data: Partial<{
        name: string | null;
        service: string | null;
        active: boolean;
        config: any;
    }>): Promise<void>;
    delete(id: number): Promise<void>;
    deactivate(id: number): Promise<void>;
}
//# sourceMappingURL=alert-channels.d.ts.map