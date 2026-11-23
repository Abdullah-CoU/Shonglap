import { hashPassword, verifyPassword, hashPasswordString } from '../src/utils/password.js';
import bcrypt from 'bcrypt';

describe('Password hash + salt tests', () => {
  test('hashPassword returns distinct salt and hash', async () => {
    const a = await hashPassword('mypassword');
    const b = await hashPassword('mypassword');
    expect(a.salt).toBeTruthy();
    expect(a.hash).toBeTruthy();
    expect(a.salt).toHaveLength(32); // 16 bytes hex
    expect(a.hash).toHaveLength(128); // 64 bytes hex
    expect(a.salt).not.toBe(b.salt); // random salt each time
    expect(a.hash).not.toBe(b.hash);
  });

  test('verifyPassword accepts correct password', async () => {
    const { hash, salt } = await hashPassword('correct123');
    expect(await verifyPassword('correct123', hash, salt)).toBe(true);
  });

  test('verifyPassword rejects wrong password', async () => {
    const { hash, salt } = await hashPassword('correct123');
    expect(await verifyPassword('wrong123', hash, salt)).toBe(false);
  });

  test('verifyPassword rejects tampered hash or salt', async () => {
    const { hash, salt } = await hashPassword('secret');
    expect(await verifyPassword('secret', hash, '00'.repeat(16))).toBe(false);
    expect(await verifyPassword('secret', 'deadbeef', salt)).toBe(false);
  });

  test('verifyPassword supports legacy bcrypt hashes', async () => {
    const hash = await bcrypt.hash('legacy123', 10);
    expect(await verifyPassword('legacy123', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  test('verifyPassword handles missing hash gracefully', async () => {
    expect(await verifyPassword('x', null, null)).toBe(false);
    expect(await verifyPassword('x', '', '')).toBe(false);
  });

  test('hashPasswordString returns hash only', async () => {
    const h = await hashPasswordString('abc');
    expect(typeof h).toBe('string');
    expect(h).toHaveLength(128);
  });
});
