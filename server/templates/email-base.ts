interface EmailBaseOptions {
  title: string;
  body: string;
  footerText?: string;
}

export function emailBase({ title, body, footerText }: EmailBaseOptions): string {
  const footer = footerText || "You received this email from Table Salt Restaurant Management.";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background: #f3f4f6; font-family: Arial, Helvetica, sans-serif; }
    .wrapper { padding: 40px 16px; }
    .card { background: #ffffff; border-radius: 12px; max-width: 580px; margin: 0 auto; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.08); }
    .header { background: #1e293b; padding: 24px 32px; text-align: center; }
    .header-logo { font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px; }
    .header-logo span { color: #60a5fa; }
    .content { padding: 32px; color: #1e293b; font-size: 15px; line-height: 1.6; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 32px; text-align: center; color: #94a3b8; font-size: 12px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="header-logo">Table <span>Salt</span></div>
      </div>
      <div class="content">
        ${body}
      </div>
      <div class="footer">
        <p style="margin:0 0 6px;">© Table Salt Restaurant Management</p>
        <p style="margin:0;">${footer}</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}
