import { logoTile, esc } from '../shared/documents';
import { fmtMoney } from '../reservations/reservation-format';
import { PayLine, PayrollRun, periodEnd, periodLabel, periodStart, PROVISION_RATES, EMPLOYER_RATES, nequiFmt } from './payroll.model';

/** YYYY-MM-DD → "15/02/2024" */
export function dmy(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** YYYY-MM-DDTHH:mm → "28/09/2026 09:40" */
export const stampOf = (iso: string) => `${dmy(iso)} ${iso.slice(11, 16)}`.trim();

/** Comprobante de pago de nómina (representación imprimible). */
export function payslipHtml(run: PayrollRun, line: PayLine, number: string, issuer: { name: string; nit: string; address: string; city: string }): string {
  const rows = (items: { concept: string; detail?: string; calc?: string; value: number }[]) =>
    items.map(i => `<tr><td>${esc(i.concept)}${i.detail ? ' · ' + esc(i.detail) : ''}</td><td class="r">${fmtMoney(i.value)}</td></tr>`).join('');
  const pay = run.payments?.[line.employeeId];
  const receipt = pay?.receipt;
  return `
  <header data-own-letterhead><div style="display:flex;gap:14px;align-items:center">${logoTile(62)}<div><h1>${esc(issuer.name)}</h1><div class="muted">NIT ${esc(issuer.nit)} · ${esc(issuer.address)} · ${esc(issuer.city)}</div></div></div>
  <div class="brand">COMPROBANTE DE PAGO DE NÓMINA<br>${esc(number)}
  <div class="muted" style="font-size:12px;font-weight:400">Período ${dmy(periodStart(run.period))} – ${dmy(periodEnd(run.period))}<br>Fecha de pago ${dmy(run.payDate)}</div></div></header>
  <p><strong>${esc(line.name)}</strong> · CC ${esc(line.docNumber)} · ${esc(line.code)}<br>${esc(line.position)} · ${esc(line.area)} · ${esc(line.contractType)}<br>
  Salario base ${fmtMoney(line.baseSalary)} · ${line.days} días · ${line.weeklyHours} h/semana</p>
  <h2>Devengados</h2><table><tbody>${rows(line.earnings)}<tr class="total"><td>Total devengado</td><td class="r">${fmtMoney(line.totalEarnings)}</td></tr></tbody></table>
  <h2>Deducciones</h2><table><tbody>${rows(line.deductions.map(d => ({ concept: d.concept, detail: d.calc, value: d.value })))}
  <tr class="total"><td>Total deducciones</td><td class="r">${fmtMoney(line.totalDeductions)}</td></tr></tbody></table>
  <table><tbody><tr class="total"><td>NETO A PAGAR</td><td class="r">${fmtMoney(line.net)}</td></tr></tbody></table>
  <p><strong>${pay ? `Pagado por Nequi ${esc(nequiFmt(pay.to))} · referencia ${esc(pay.reference)} · ${esc(stampOf(pay.paidAt))} · ${esc(pay.paidBy)}` : `Se paga por ${esc(line.account)} · pago pendiente`}</strong></p>
  <p class="muted">Aportes del empleador (no se descuentan): salud, pensión ${Math.round(EMPLOYER_RATES.pension * 1000) / 10}%, ARL, caja de compensación, SENA e ICBF.
  Provisión de prestaciones: cesantías ${(PROVISION_RATES.cesantias * 100).toLocaleString('es-CO', { maximumFractionDigits: 2 })} %, intereses, prima, vacaciones y dotación.</p>
  <p style="margin-top:60px;display:flex;justify-content:space-between"><span>______________________<br>Firma del empleador</span><span>${receipt ? `<img src="${receipt.signature}" alt="" style="max-height:70px;max-width:220px;display:block">` : '______________________'}<br>Recibí conforme · ${esc(receipt?.name ?? line.name)}${receipt ? ' · ' + esc(stampOf(receipt.at)) : ''}</span></p>
  <p class="muted">${esc(periodLabel(run.period))}</p>`;
}
