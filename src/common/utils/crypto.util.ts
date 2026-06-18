import * as crypto from 'crypto';

export class CryptoUtil {
  private static readonly ALGORITHM = 'aes-256-gcm';

  private static getKey(): Buffer {
    const keyHex = process.env.ENCRYPTION_KEY || '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
    return Buffer.from(keyHex, 'hex');
  }

  static encrypt(text: string): string {
    if (!text) return text;
    const iv = crypto.randomBytes(12);
    const key = this.getKey();
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag().toString('hex');
    
    return `${iv.toString('hex')}:${encrypted}:${tag}`;
  }

  static decrypt(encryptedText: string): string {
    if (!encryptedText) return encryptedText;
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      // Fallback in case of raw inputs
      return encryptedText;
    }

    const [ivHex, encryptedHex, tagHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const key = this.getKey();
    
    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
