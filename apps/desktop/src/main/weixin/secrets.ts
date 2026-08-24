import fs from "node:fs/promises";
import path from "node:path";

export interface WeixinSecretsData {
  token?: string;
  contextToken?: string;
}

interface SecretCipher {
  available(): boolean;
  encrypt(value: string): Buffer;
  decrypt(value: Buffer): string;
}

interface StoredSecretsEnvelope {
  encrypted?: string;
  plaintext?: WeixinSecretsData;
}

type CipherLoader = () => Promise<SecretCipher | undefined>;

export class WeixinSecrets {
  constructor(
    private readonly filePath: string,
    private readonly loadCipher: CipherLoader = loadElectronCipher,
  ) {}

  async read(): Promise<WeixinSecretsData> {
    let envelope: StoredSecretsEnvelope;
    try {
      envelope = JSON.parse(await fs.readFile(this.filePath, "utf8")) as StoredSecretsEnvelope;
    } catch {
      return {};
    }
    if (typeof envelope.encrypted === "string") {
      const cipher = await this.loadCipher().catch(() => undefined);
      if (!cipher?.available()) return {};
      try {
        return JSON.parse(cipher.decrypt(Buffer.from(envelope.encrypted, "base64"))) as WeixinSecretsData;
      } catch {
        return {};
      }
    }
    return normalizeSecrets(envelope.plaintext);
  }

  async write(data: WeixinSecretsData): Promise<void> {
    const normalized = normalizeSecrets(data);
    const cipher = await this.loadCipher().catch(() => undefined);
    const envelope: StoredSecretsEnvelope = cipher?.available()
      ? { encrypted: cipher.encrypt(JSON.stringify(normalized)).toString("base64") }
      : { plaintext: normalized };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(envelope)}\n`, { mode: 0o600 });
    await fs.rename(temporaryPath, this.filePath);
    await fs.chmod(this.filePath, 0o600);
  }

  async clear(): Promise<void> {
    await fs.rm(this.filePath, { force: true });
  }
}

async function loadElectronCipher(): Promise<SecretCipher | undefined> {
  const { safeStorage } = await import("electron");
  return {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (value) => safeStorage.encryptString(value),
    decrypt: (value) => safeStorage.decryptString(value),
  };
}

function normalizeSecrets(value: unknown): WeixinSecretsData {
  if (!value || typeof value !== "object") return {};
  const data = value as Record<string, unknown>;
  return {
    ...(typeof data.token === "string" && data.token ? { token: data.token } : {}),
    ...(typeof data.contextToken === "string" && data.contextToken ? { contextToken: data.contextToken } : {}),
  };
}
