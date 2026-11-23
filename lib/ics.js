// Arquivo de agenda (.ics, RFC 5545) com os pagamentos: abre no Calendário do iPhone/Mac, no Outlook
// e pode ser importado no Google Agenda. Cada parcela vira um evento de dia inteiro com dois avisos.

const money = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const ymd = (iso) => iso.replace(/-/g, '');
const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function nextDay(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
// Linhas de no máximo 75 bytes; a continuação começa com espaço.
function fold(line) {
  if (Buffer.byteLength(line) <= 75) return line;
  const parts = [];
  let cur = '', len = 0, limit = 75;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (len + n > limit) { parts.push(cur); cur = ''; len = 0; limit = 74; }
    cur += ch;
    len += n;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

export const paymentTitle = (p, vendorName) => `Pagar ${vendorName ? `${vendorName}: ` : ''}${p.description || 'pagamento'} (${money(p.amount)})`;

export function paymentDetails(p, { vendorName, appUrl } = {}) {
  return [
    vendorName && `Fornecedor: ${vendorName}`,
    `Valor: ${money(p.amount)}`,
    p.method && `Forma de pagamento: ${p.method}`,
    p.notes && `Observações: ${p.notes}`,
    appUrl && `\nDepois de pagar, marque como pago no BRIDEx: ${appUrl}/#/orcamento?pagamentos`,
  ].filter(Boolean).join('\n');
}

// payments: [{ id, description, amount, dueDate, method, notes, _updated }]; vendors: Map id → nome.
export function paymentsCalendar(payments, { vendors = new Map(), appUrl = '', name = 'Pagamentos do casamento' } = {}) {
  const now = stamp(Date.now());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BRIDEx//Pagamentos//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(name)}`];
  for (const p of payments) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dueDate || '')) continue;
    const vendorName = vendors.get(p.vendorId) || '';
    const title = paymentTitle(p, vendorName);
    lines.push(
      'BEGIN:VEVENT',
      `UID:pagamento-${p.id}@bridex`,
      `DTSTAMP:${now}`,
      ...(p._updated ? [`LAST-MODIFIED:${stamp(p._updated)}`] : []),
      `DTSTART;VALUE=DATE:${ymd(p.dueDate)}`,
      `DTEND;VALUE=DATE:${ymd(nextDay(p.dueDate))}`,
      `SUMMARY:${esc(title)}`,
      `DESCRIPTION:${esc(paymentDetails(p, { vendorName, appUrl }))}`,
      'TRANSP:TRANSPARENT',
      // Evento de dia inteiro: o aviso conta a partir da meia-noite do dia do vencimento.
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`Amanhã: ${title}`)}`, 'TRIGGER:-PT15H', 'END:VALARM', // véspera, 9h
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`Hoje: ${title}`)}`, 'TRIGGER:PT9H', 'END:VALARM', // no dia, 9h
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
