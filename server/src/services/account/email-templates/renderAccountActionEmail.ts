import { z } from 'zod';

const httpsUrl = z.string().url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !/[\r\n]/.test(value);
  } catch { return false; }
}, 'Email links must be absolute HTTPS URLs without credentials.');

const inputSchema = z.object({
  kind: z.enum(['verify-email', 'reset-password']),
  recipientEmail: z.string().trim().email().max(254),
  actionLink: httpsUrl,
  siteOrigin: httpsUrl.default('https://vidra.app').refine((value) => {
    try {
      const url = new URL(value);
      return url.pathname === '/' && !url.search && !url.hash;
    } catch { return false; }
  }, 'The public site must be an HTTPS origin.'),
});

export type AccountActionEmailInput = z.input<typeof inputSchema>;
export interface AccountActionEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

const font = "font-family:Figtree,Arial,sans-serif;";
const secondary = `${font}color:#b8b8b8;`;
const caption = `${secondary}font-size:12px;font-weight:500;line-height:16px;letter-spacing:0.12px;`;

/** T01/T02 presentation only. The caller supplies an Admin-generated action link and owns delivery. */
export function renderAccountActionEmail(input: AccountActionEmailInput): AccountActionEmail {
  const { kind, recipientEmail, actionLink, siteOrigin } = inputSchema.parse(input);
  const verify = kind === 'verify-email';
  const subject = verify ? 'Verify your email' : 'Reset your password';
  const action = verify ? 'Verify email' : 'Choose a new password';
  const message = verify
    ? `Confirm ${recipientEmail} to finish verifying your Vidra account.`
    : `A password reset was requested for ${recipientEmail}. Use the link to choose a new password.`;
  const ignore = 'If you did not request this, you can ignore this email.';
  const help = 'Need help? Contact support@vidra.app.';
  const termsUrl = new URL('/terms-of-service', siteOrigin).href;
  const privacyUrl = new URL('/privacy-policy', siteOrigin).href;
  const helpUrl = new URL('/contact', siteOrigin).href;
  const fontFace = [400, 500, 700].map((weight) =>
    `@font-face{font-family:Figtree;font-style:normal;font-weight:${weight};src:url("${escapeHtml(new URL(`/design-assets/figtree-${weight}.ttf`, siteOrigin).href)}") format("truetype");}`,
  ).join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${subject}</title>
<style>${fontFace}
body{margin:0;padding:0;background:#111111;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}
table{border-collapse:collapse;border-spacing:0;}
a{color:inherit;}
</style>
</head>
<body bgcolor="#111111" style="margin:0;padding:0;background:#111111;${font}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#111111"><tr><td align="center" style="padding:0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#111111;"><tr><td style="padding:48px 48px 41px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;">
<tr><td style="padding:0 0 24px;${font}color:#f7f7f7;font-size:32px;font-weight:700;line-height:38px;letter-spacing:-0.8px;">Vidra</td></tr>
<tr><td style="padding:0 0 24px;"><h1 style="margin:0;${font}color:#f7f7f7;font-size:32px;font-weight:700;line-height:40px;letter-spacing:-0.8px;">${subject}</h1></td></tr>
<tr><td style="padding:0 0 24px;${secondary}font-size:17px;font-weight:400;line-height:28px;overflow-wrap:break-word;">${escapeHtml(message)}</td></tr>
<tr><td style="padding:0 0 24px;"><a href="${escapeHtml(actionLink)}" style="display:block;background:#d1d1d1;border-radius:8px;padding:13px 12px;${font}color:#111111;font-size:13px;font-weight:500;line-height:18px;letter-spacing:0.13px;text-align:center;text-decoration:none;">${action}</a></td></tr>
<tr><td style="padding:0 0 24px;${secondary}font-size:15px;font-weight:400;line-height:22px;">${ignore}</td></tr>
<tr><td style="padding:0 0 24px;${caption}">Need help? Contact <a href="mailto:support@vidra.app" style="color:#b8b8b8;text-decoration:none;">support@vidra.app</a>.</td></tr>
<tr><td style="padding:0;height:24px;vertical-align:top;">
<table role="presentation" width="328" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:328px;table-layout:fixed;"><tr>
<td width="120" style="width:36.5853658537%;padding:0;vertical-align:top;${caption}"><a href="${escapeHtml(termsUrl)}" style="color:#b8b8b8;text-decoration:none;">Terms of service</a></td>
<td width="16" aria-hidden="true" style="width:4.8780487805%;padding:0;"></td>
<td width="116" style="width:35.3658536585%;padding:0;vertical-align:top;${caption}"><a href="${escapeHtml(privacyUrl)}" style="color:#b8b8b8;text-decoration:none;">Privacy policy</a></td>
<td width="16" aria-hidden="true" style="width:4.8780487805%;padding:0;"></td>
<td width="60" style="width:18.2926829268%;padding:0;vertical-align:top;${caption}"><a href="${escapeHtml(helpUrl)}" style="color:#b8b8b8;text-decoration:none;">Help</a></td>
</tr></table>
</td></tr>
</table>
</td></tr></table>
</td></tr></table>
</body>
</html>`;
  const text = ['Vidra', subject, message, `${action}:\n${actionLink}`, ignore, help,
    `Terms of service: ${termsUrl}\nPrivacy policy: ${privacyUrl}\nHelp: ${helpUrl}`].join('\n\n');
  return { subject, html, text };
}
