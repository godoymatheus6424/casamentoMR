// Envio de e-mails transacionais pela API da Resend (https://resend.com).
// Sem RESEND_API_KEY / MAIL_FROM configurados, o conteúdo é apenas registrado no log do servidor.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function sendMail({ to, subject, text, html }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) {
    console.log(`\n[e-mail NÃO enviado: configure RESEND_API_KEY e MAIL_FROM]\nPara: ${to}\nAssunto: ${subject}\n${text}\n`);
    return false;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      console.error(`Falha ao enviar e-mail (${r.status}):`, (await r.text().catch(() => '')).slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.error('Falha ao enviar e-mail:', e.message);
    return false;
  }
}

// Layout simples e compatível com clientes de e-mail.
export function emailLayout({ title, intro, buttonText, buttonUrl, outro }) {
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f8f5f0;font-family:Arial,Helvetica,sans-serif;color:#2b2622">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px">
      <tr><td style="font-family:Georgia,serif;font-size:26px;color:#a8646f;padding-bottom:12px">${esc(title)}</td></tr>
      <tr><td style="font-size:15px;line-height:1.6;padding-bottom:24px">${esc(intro)}</td></tr>
      ${buttonUrl ? `<tr><td style="padding-bottom:24px"><a href="${esc(buttonUrl)}" style="display:inline-block;background:#a8646f;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:999px">${esc(buttonText)}</a></td></tr>` : ''}
      ${outro ? `<tr><td style="font-size:13px;line-height:1.6;color:#7b7068">${esc(outro)}</td></tr>` : ''}
    </table>
  </td></tr></table></body></html>`;
  const text = [title, '', intro, buttonUrl ? `\n${buttonText}: ${buttonUrl}\n` : '', outro || ''].join('\n');
  return { html, text };
}
