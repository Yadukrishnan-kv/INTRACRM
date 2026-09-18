import { createHash, randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../common/config/configuration';

@Injectable()
export class LocalFileStore {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  resolve(storageKey: string): string {
    const root = this.config.get('storageRoot', { infer: true });
    const base = isAbsolute(root) ? root : join(process.cwd(), root);
    return join(base, storageKey);
  }

  async save(params: {
    tenantId: string;
    resourceType: string;
    resourceId: string;
    extension: string;
    bytes: Buffer;
  }): Promise<{ storageKey: string; checksumSha256: string }> {
    const fileId = randomUUID();
    const storageKey = `tenants/${params.tenantId}/${params.resourceType}/${params.resourceId}/${fileId}.${params.extension}`;
    const fullPath = this.resolve(storageKey);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, params.bytes);
    return {
      storageKey,
      checksumSha256: createHash('sha256').update(params.bytes).digest('hex'),
    };
  }

  async remove(storageKey: string): Promise<void> {
    try {
      await unlink(this.resolve(storageKey));
    } catch {
      // Missing files are ignored so a failed cleanup cannot block the visit.
    }
  }
}
