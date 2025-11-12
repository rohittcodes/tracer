import { ApiKey } from '../schema';
export declare class ApiKeyRepository {
    private hashKey;
    generateKey(): {
        key: string;
        hash: string;
    };
    create(data: {
        name?: string;
        service?: string;
        expiresAt?: Date;
    }): Promise<{
        id: number;
        key: string;
    }>;
    validate(key: string): Promise<ApiKey | null>;
    list(service?: string): Promise<ApiKey[]>;
    revoke(id: number): Promise<void>;
    delete(id: number): Promise<void>;
}
//# sourceMappingURL=api-keys.d.ts.map