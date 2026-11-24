import { signUploadPath, verifyUploadToken } from '../src/utils/uploadUrls.js';
import { verifyRouting } from '../src/services/verification.js';

describe('Signed upload URLs', () => {
  const original = process.env.PROTECT_UPLOADS;

  afterEach(() => {
    if (original === undefined) delete process.env.PROTECT_UPLOADS;
    else process.env.PROTECT_UPLOADS = original;
  });

  test('dev mode serves paths unchanged', () => {
    delete process.env.PROTECT_UPLOADS;
    expect(signUploadPath('/uploads/a.jpg')).toBe('/uploads/a.jpg');
    expect(verifyUploadToken('/uploads/a.jpg', undefined)).toBe(true);
  });

  test('protected mode signs and verifies a path', () => {
    process.env.PROTECT_UPLOADS = 'true';
    const signed = signUploadPath('/uploads/a.jpg');
    expect(signed).toMatch(/^\/uploads\/a\.jpg\?t=\d+\.[a-f0-9]{64}$/);
    const token = signed.split('t=')[1];
    expect(verifyUploadToken('/uploads/a.jpg', token)).toBe(true);
    expect(verifyUploadToken('/uploads/b.jpg', token)).toBe(false);
  });

  test('expired tokens are rejected', () => {
    process.env.PROTECT_UPLOADS = 'true';
    expect(verifyUploadToken('/uploads/a.jpg', '1.deadbeef')).toBe(false);
  });
});

describe('Routing self-verification agent', () => {
  test('accepts a well-routed, confident part', () => {
    const result = verifyRouting({
      parts: [{ category: 'garbage', departmentId: 'dncc', jurisdictionType: 'DNCC', confidence: 0.9 }],
      area: 'Gulshan',
      departmentsById: { dncc: { jurisdictionType: 'DNCC' } },
    });
    expect(result.verified).toBe(true);
    expect(result.checks[0].status).toBe('verified');
  });

  test('flags a mismatched, low-confidence part for review', () => {
    const result = verifyRouting({
      parts: [{ category: 'gas', departmentId: 'x', jurisdictionType: 'Roads', confidence: 0.4 }],
      area: 'Gulshan',
      departmentsById: { x: { jurisdictionType: 'Roads' } },
    });
    expect(result.verified).toBe(false);
    expect(result.checks[0].status).toBe('review');
    expect(result.checks[0].reason).toMatch(/not typical|jurisdiction|confidence/);
  });
});
