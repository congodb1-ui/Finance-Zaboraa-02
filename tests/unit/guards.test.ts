import { describe, it, expect } from 'vitest';
import { maskForAI, maskTransactionForAI } from '../../src/lib/ai/pii-mask';
import { encryptWithSecret, decryptWithSecret } from '../../src/lib/crypto';

describe('Guards Unit Tests', () => {
  it('PII mask redacts PAN, email, mobile numbers, and names', () => {
    const text = 'Payment by John Doe (ABCDE1234F, john@example.com, +91 9876543210)';
    const masked = maskForAI(text, 'John Doe');
    expect(masked).not.toContain('ABCDE1234F');
    expect(masked).not.toContain('john@example.com');
    expect(masked).not.toContain('9876543210');
    expect(masked).not.toContain('John Doe');
    expect(masked).toContain('[PAN-REDACTED]');
    expect(masked).toContain('[EMAIL-REDACTED]');
  });

  it('maskTransactionForAI strips PII and sensitive fields', () => {
    const tx = {
      id: 'tx-101',
      description: 'Transfer to Ramesh Kumar HDFC0001234',
      debit: 5000,
      credit: null,
      balance: 45000, // Should be excluded from MaskedTransaction output
    };
    const masked = maskTransactionForAI(tx, 'Ramesh Kumar');
    expect(masked.id).toBe('tx-101');
    expect(masked.debit).toBe(5000);
    expect(masked.masked_description).toContain('[IFSC-REDACTED]');
    expect((masked as any).balance).toBeUndefined();
  });

  it('AES-256-GCM encryption/decryption round-trip with zbf:v1: prefix', async () => {
    const secret = '0123456789abcdef0123456789abcdef';
    const plaintext = 'ABCDE1234F';
    const ciphertext = await encryptWithSecret(plaintext, secret);
    expect(ciphertext.startsWith('zbf:v1:')).toBe(true);

    const decrypted = await decryptWithSecret(ciphertext, secret);
    expect(decrypted).toBe(plaintext);
  });

  it('decryptWithSecret throws on wrong secret or invalid payload', async () => {
    const secret = '0123456789abcdef0123456789abcdef';
    const wrongSecret = 'fedcba9876543210fedcba9876543210';
    const ciphertext = await encryptWithSecret('SECRET_DATA', secret);

    await expect(decryptWithSecret(ciphertext, wrongSecret)).rejects.toThrow();
    await expect(decryptWithSecret('invalid-payload', secret)).rejects.toThrow();
  });
});
