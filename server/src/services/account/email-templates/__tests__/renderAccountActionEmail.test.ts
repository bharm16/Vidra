import { describe, expect, it } from 'vitest';
import { renderAccountActionEmail, type AccountActionEmailInput } from '../renderAccountActionEmail';

const base = {
  kind: 'verify-email',
  recipientEmail: 'creator@example.com',
  actionLink: 'https://vidra.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=opaque&continueUrl=https%3A%2F%2Fvidra.app%2Fapp',
} satisfies AccountActionEmailInput;

describe('Retained account action email templates', () => {
  it.each([
    ['verify-email', 'Verify your email', 'Verify email', 'Confirm creator@example.com to finish verifying your Vidra account.'],
    ['reset-password', 'Reset your password', 'Choose a new password', 'A password reset was requested for creator@example.com. Use the link to choose a new password.'],
  ] as const)('renders the %s action with its recipient and a usable plaintext alternative', (kind, subject, action, message) => {
    const result = renderAccountActionEmail({ ...base, kind });
    expect(result.subject).toBe(subject);
    expect(result.html).toContain(`<h1 style=`);
    expect(result.html).toContain(`>${subject}</h1>`);
    expect(result.html).toContain(message);
    expect(result.html).toContain(`>${action}</a>`);
    expect(result.text).toContain(`${action}:\n${base.actionLink}`);
    expect(result.text).toContain(message);
    expect(result.html).toContain('href="https://vidra.app/terms-of-service"');
    expect(result.html).toContain('href="https://vidra.app/privacy-policy"');
    expect(result.html).toContain('href="https://vidra.app/contact"');
    expect(result.html).toContain('href="mailto:support@vidra.app"');
  });

  it('escapes text and attribute values without corrupting the plaintext action link', () => {
    const recipientEmail = "creator'team@example.com";
    const actionLink = 'https://auth.vidra.app/action?token=a&note="<b>\'"';
    const result = renderAccountActionEmail({ ...base, recipientEmail, actionLink });
    expect(result.html).toContain('creator&#39;team@example.com');
    expect(result.html).toContain('href="https://auth.vidra.app/action?token=a&amp;note=&quot;&lt;b&gt;&#39;&quot;"');
    expect(result.html).not.toContain('<b>');
    expect(result.text).toContain(recipientEmail);
    expect(result.text).toContain(actionLink);
  });

  it.each(['javascript:alert(1)', 'data:text/html,<b>go</b>', '//evil.example/action', 'http://example.com/action', 'https://user:password@example.com/action', 'https://example.com/action\nInjected'])('rejects an unsafe action URL: %s', (actionLink) => {
    expect(() => renderAccountActionEmail({ ...base, actionLink })).toThrow();
  });

  it.each(['<img src=x onerror=alert(1)>@example.com', 'creator@example.com\r\nBcc:other@example.com'])('rejects a malformed recipient before building either body', (recipientEmail) => {
    expect(() => renderAccountActionEmail({ ...base, recipientEmail })).toThrow();
  });

  it('uses an explicitly configured public origin for legal routes and Figtree assets', () => {
    const result = renderAccountActionEmail({ ...base, siteOrigin: 'https://preview.vidra.app' });
    expect(result.html).toContain('https://preview.vidra.app/design-assets/figtree-700.ttf');
    expect(result.html).toContain('href="https://preview.vidra.app/privacy-policy"');
    expect(result.text).toContain('Help: https://preview.vidra.app/contact');
    expect(() => renderAccountActionEmail({ ...base, siteOrigin: 'https://example.com/subpath?injected=yes' })).toThrow();
  });
});
