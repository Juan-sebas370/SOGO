// =====================================================
// Integración contable: convierte lo que registran los módulos en asientos.
// Es determinista: cada registro de origen tiene una clave (sourceKey), así que
// integrar dos veces no duplica nada. El servidor guarda el resultado en la base
// de datos (crea, actualiza conservando el número o anula lo que ya no existe).
// Solo se integra desde la fecha de inicio de la contabilidad en SOGO; lo
// anterior entra con los saldos iniciales.
// =====================================================

import { Entry, EntryKind, EntryLine, EntryStatus, Origin } from './accounting.model';
import { cashAccount } from './accounting-config';
import { Reservation } from '../reservations/reservation.model';
import { Invoice, InvoiceLine, isValidInvoice, lineNet, computeTotals } from '../billing/invoice.model';
import { Charge } from '../billing/charge.service';
import { PayLine, PayrollRun, extrasTotal, transportOf, bonusTotal, legalDeductions, periodLabel } from '../payroll/payroll.model';
import { Movement, Product } from '../inventory/inventory.model';
import { parsePlace, isColombia } from '../shared/colombia';

export interface ModuleData {
  reservations: Reservation[];
  invoices:     Invoice[];
  charges:      Charge[];
  runs:         { run: PayrollRun; lines: PayLine[] }[];
  inventory:    Movement[];
  stock:        Product[];
  mapping:      Record<string, string>;
  taxFor:       (category: string, foreignNonResident?: boolean) => { kind: 'IVA' | 'INC'; rate: number };
}

export interface ReviewItem { key: string; module: Origin; title: string; detail: string; action: 'map' | 'payroll'; category?: string; amount?: number; }

/** Asiento calculado de un módulo (sin id ni número: los asigna el servidor). */
export type IntegratedDraft = Omit<Entry, 'id' | 'number' | 'createdBy'>;

export interface IntegrationResult {
  entries:    IntegratedDraft[];
  duplicates: string[];              // registros omitidos por estar ya contabilizados desde otro módulo
  review:     ReviewItem[];
}

const round = Math.round;
/** Anticipos de reservas: 28101501 Depósitos de reservas de habitaciones (plan de cuentas del contador). */
const DEPOSITS = '28101501';
const taxAccount = (kind: 'IVA' | 'INC') => kind === 'IVA' ? '240805' : '249505';
const line = (account: string, debit: number, credit: number, detail = '', third = ''): EntryLine => ({ account, detail, third, debit: round(debit), credit: round(credit) });

/** Centro de costo de los asientos automáticos: lo de la estadía a Alojamiento; nómina y lo demás a Administración. */
const CC_ALOJAMIENTO = 'CC-01', CC_ADMIN = 'CC-03';
const ccOf = (origin: Origin) => origin === 'Reservas' || origin === 'Alojamiento' || origin === 'Facturación' ? CC_ALOJAMIENTO : CC_ADMIN;

function draft(p: { key: string; ref: string; kind: EntryKind; at: string; concept: string; third: string; thirdDoc?: string; origin: Origin; category?: string; method?: string; lines: EntryLine[]; status?: EntryStatus; supports?: string[]; cc?: string }): IntegratedDraft {
  const cc = p.cc ?? ccOf(p.origin);
  return {
    kind: p.kind, date: p.at.slice(0, 10), time: p.at.slice(11, 16) || '00:00', concept: p.concept, third: p.third, thirdDoc: p.thirdDoc || undefined,
    category: p.category, method: p.method,
    lines: p.lines.filter(l => l.debit || l.credit).map(l => ({ ...l, costCenter: l.costCenter ?? cc })), origin: p.origin, sourceKey: p.key, sourceRef: p.ref,
    status: p.status ?? 'Contabilizado',
    supports: p.supports ?? [], observations: '',
  };
}

export function buildIntegration(d: ModuleData, from: string, today: string): IntegrationResult {
  const out: IntegratedDraft[] = [];
  const duplicates: string[] = [];
  const review: ReviewItem[] = [];
  const inRange = (date: string) => date >= from && date <= today;
  const chargesOf = (reservationId: string) => d.charges.filter(c => c.reservationId === reservationId);
  const chargeTotal = (c: Charge) => { const base = c.quantity * c.unitValue; return base + round(base * d.taxFor(c.category).rate); };

  // ── Reservas: anticipos, causación del ingreso y cobros ──
  d.reservations.forEach(r => {
    const valid = d.invoices.filter(i => i.reservationId === r.id && isValidInvoice(i)).sort((a, b) => a.issuedAt!.localeCompare(b.issuedAt!));
    const inv = valid[valid.length - 1];
    // El ingreso se causa con la factura; mientras Facturación no guarde en la base de datos,
    // con el check-out (la estadía terminada es el servicio prestado)
    const stayAt = !inv && r.status === 'Finalizada' ? (r.checkedOutAt ?? `${r.checkOut}T12:00`) : undefined;
    const accruedAt = inv?.issuedAt?.slice(0, 16) ?? stayAt ?? '9999';
    const payments = [...r.payments].sort((a, b) => a.date.localeCompare(b.date));

    payments.forEach((p, i) => {
      if (!inRange(p.date.slice(0, 10))) return;
      const afterAccrual = p.date >= accruedAt;
      out.push(draft({
        key: `res-pay-${r.id}-${p.receipt || i}`, ref: r.code, kind: afterAccrual ? 'Cobro' : 'Ingreso', at: p.date,
        concept: `${afterAccrual ? 'Pago de cuenta' : 'Anticipo reserva'} ${r.code}`, third: r.guestName, thirdDoc: r.docNumber, origin: 'Reservas',
        category: 'Alojamiento', method: p.method, supports: p.receipt ? [`Recibo ${p.receipt}`] : [],
        lines: [line(cashAccount(p.method), p.amount, 0, p.method, r.guestName), line(afterAccrual ? '130505' : DEPOSITS, 0, p.amount, r.code, r.guestName)],
      }));
    });

    // Causación de la estadía al check-out (alojamiento o pasadía + otros servicios sin consumo registrado)
    if (stayAt && inRange(stayAt.slice(0, 10))) {
      const foreign = r.docType === 'Pasaporte' && !isColombia(parsePlace(r.city).country);
      const category = r.nights === 0 ? 'Eventos y pasadías' : 'Alojamiento';
      const tax = d.taxFor(category, foreign);
      const lodging = round(r.lodgingAmount), lodgingTax = round(lodging * tax.rate);
      const others = Math.max(0, round(r.extrasAmount - chargesOf(r.id).reduce((s, c) => s + c.quantity * c.unitValue, 0)));
      const otherTax = d.taxFor('Otro');
      const othersTax = round(others * otherTax.rate);
      const total = lodging + lodgingTax + others + othersTax;
      if (total > 0) {
        out.push(draft({
          key: `stay-${r.id}`, ref: r.code, kind: 'Venta', at: stayAt, concept: `${category === 'Alojamiento' ? 'Estadía' : 'Pasadía'} ${r.code} · check-out`,
          third: r.guestName, thirdDoc: r.docNumber, origin: 'Alojamiento', category,
          lines: [
            line('130505', total, 0, r.code, r.guestName),
            line(d.mapping[category] || (category === 'Alojamiento' ? '414005' : '41409595'), 0, lodging, `${category} · ${r.nights} noche${r.nights === 1 ? '' : 's'}`, r.guestName),
            line(taxAccount(tax.kind), 0, lodgingTax, `${tax.kind} ${round(tax.rate * 100)}%`),
            line(d.mapping['Otro'] || '41409595', 0, others, 'Servicios adicionales', r.guestName),
            line(taxAccount(otherTax.kind), 0, othersTax, `${otherTax.kind} ${round(otherTax.rate * 100)}%`),
          ],
        }));
        // Los anticipos recibidos antes del check-out se cruzan contra la cuenta por cobrar
        const owed = total + chargesOf(r.id).filter(c => c.date <= stayAt.slice(0, 10)).reduce((s, c) => s + chargeTotal(c), 0);
        const paidBefore = payments.filter(p => p.date < stayAt).reduce((s, p) => s + p.amount, 0);
        const apply = Math.min(owed, paidBefore);
        if (apply > 0) out.push(draft({
          key: `stay-apply-${r.id}`, ref: r.code, kind: 'Ajuste', at: stayAt, concept: `Aplicación de anticipos · ${r.code}`, third: r.guestName,
          origin: 'Alojamiento', lines: [line(DEPOSITS, apply, 0, r.code), line('130505', 0, apply, r.code)],
        }));
      }
    }

    // Facturas (cuando Facturación guarde en la base de datos, el ingreso se causa con ellas)
    d.invoices.filter(i => i.reservationId === r.id && i.issuedAt && i.dianStatus !== 'Borrador' && inRange(i.issuedAt.slice(0, 10))).forEach(i => {
      const posted: InvoiceLine[] = [];
      i.lines.filter(l => l.included).forEach(l => {
        if (l.chargeId && d.charges.some(c => c.id === l.chargeId)) {
          // El consumo se contabiliza desde Alojamiento, no desde la factura
          duplicates.push(`${i.number} · ${l.description} (${d.mapping[d.charges.find(c => c.id === l.chargeId)!.category] ? 'ya contabilizado desde Alojamiento' : 'se contabiliza desde Alojamiento al asignar su cuenta'})`);
        } else posted.push(l);
      });
      if (!posted.length) return;
      const lines: EntryLine[] = [];
      let receivable = 0;
      posted.forEach(l => {
        const net = lineNet(l), tax = round(net * l.taxRate);
        lines.push(line(d.mapping[l.category] || '41409595', 0, net, l.description, r.guestName));
        if (tax) lines.push(line(taxAccount(l.taxKind), 0, tax, `${l.taxKind} ${round(l.taxRate * 100)}%`));
        receivable += net + tax;
      });
      lines.unshift(line('130505', receivable, 0, i.number, i.buyer.name));
      out.push(draft({
        key: `inv-${i.id}`, ref: i.number, kind: 'Venta', at: i.issuedAt!, concept: `Factura ${i.number} · ${r.code}`, third: i.buyer.name,
        origin: 'Facturación', category: 'Alojamiento', lines, supports: [`${i.number}.pdf`], status: i.annulment ? 'Anulado' : 'Contabilizado',
      }));
      if (i === inv) {
        const paidBefore = payments.filter(p => p.date < i.issuedAt!.slice(0, 16)).reduce((s, p) => s + p.amount, 0);
        const apply = Math.min(computeTotals(i.lines).total, paidBefore);
        if (apply > 0) out.push(draft({
          key: `inv-apply-${i.id}`, ref: i.number, kind: 'Ajuste', at: i.issuedAt!, concept: `Aplicación de anticipos · ${i.number}`, third: i.buyer.name,
          origin: 'Facturación', lines: [line(DEPOSITS, apply, 0, r.code), line('130505', 0, apply, i.number)],
        }));
      }
    });
  });

  // ── Alojamiento: consumos cargados a la estadía (lavandería, daños y faltantes...) ──
  d.charges.forEach(c => {
    if (!inRange(c.date)) return;
    const r = d.reservations.find(x => x.id === c.reservationId);
    const acc = d.mapping[c.category];
    const base = c.quantity * c.unitValue;
    if (!acc) {
      if (!review.some(x => x.key === `map-${c.category}`)) {
        review.push({ key: `map-${c.category}`, module: 'Alojamiento', title: 'Cuenta contable no configurada', action: 'map', category: c.category, amount: base,
          detail: `La categoría «${c.category}» (Alojamiento · ${c.description}) no tiene cuenta de ingreso asignada.` });
      }
      return;
    }
    const tax = d.taxFor(c.category);
    const t = round(base * tax.rate);
    out.push(draft({
      key: `charge-${c.id}`, ref: r?.code ?? '', kind: 'Venta', at: `${c.date}T12:00`, concept: `${c.description} · ${r?.code ?? ''}`, third: r?.guestName ?? '', thirdDoc: r?.docNumber,
      origin: 'Alojamiento', category: c.category,
      lines: [line('130505', base + t, 0, c.detail), line(acc, 0, base, c.description), line(taxAccount(tax.kind), 0, t, `${tax.kind} ${round(tax.rate * 100)}%`)],
    }));
  });

  // ── Nómina ─────────────────────────────────────────
  d.runs.forEach(({ run, lines: pl }) => {
    if (run.payDate < from) return;
    const sum = (f: (l: PayLine) => number) => pl.reduce((s, l) => s + f(l), 0);
    const salary = sum(l => l.earnings.filter(e => e.kind === 'salary').reduce((s, e) => s + e.value, 0));
    const legal = sum(legalDeductions), authorized = sum(l => l.totalDeductions) - legal, net = sum(l => l.net);
    // Lo que se debe a cada entidad (descuento al empleado + aporte del empleador), en su cuenta del plan
    const ded = (concept: string) => sum(l => l.deductions.filter(x => x.concept === concept).reduce((s, x) => s + x.value, 0));
    const health = ded('Salud') + sum(l => l.employer.health ?? 0);
    const pension = ded('Pensión') + ded('Fondo de solidaridad pensional') + sum(l => l.employer.pension);
    const arl = sum(l => l.employer.arl);
    const parafiscales = sum(l => l.employer.ccf + (l.employer.sena ?? 0) + (l.employer.icbf ?? 0));
    const embargos = ded('Embargo judicial');
    const prov = (k: 'cesantias' | 'intereses' | 'vacaciones' | 'prima' | 'dotacion') => sum(l => l.provisions[k] ?? 0);
    const er = (f: (l: PayLine) => number) => sum(f);
    const status: EntryStatus = run.status === 'Borrador' ? 'Provisional' : run.status === 'Anulada' ? 'Anulado' : 'Contabilizado';
    const label = periodLabel(run.period).toLowerCase();
    out.push(draft({
      key: `payroll-${run.id}`, ref: `Nómina ${label}`, kind: 'Causación', at: `${run.payDate}T${(run.confirmedAt ?? run.createdAt).slice(11, 16) || '08:00'}`,
      concept: `Causación nómina ${label}`, third: 'Empleados', origin: 'Nómina', category: 'Nómina', status,
      lines: [
        line('520506', salary, 0, 'Sueldos'), line('520515', sum(extrasTotal), 0, 'Horas extra y recargos'),
        line('520527', sum(transportOf), 0, 'Auxilio de transporte'), line('520548', sum(bonusTotal), 0, 'Bonificaciones'),
        // Aportes del empleador, cada uno en su cuenta (el empleado los paga por deducción)
        line('520569', er(l => l.employer.health ?? 0), 0, 'Aporte salud (EPS)'), line('520570', er(l => l.employer.pension), 0, 'Aporte pensión'),
        line('520568', arl, 0, 'Aporte ARP'), line('520572', er(l => l.employer.ccf), 0, 'Aporte caja de compensación'),
        line('520575', er(l => l.employer.icbf ?? 0), 0, 'Aporte ICBF'), line('520578', er(l => l.employer.sena ?? 0), 0, 'Aporte SENA'),
        // Provisión de prestaciones
        line('520530', prov('cesantias'), 0, 'Cesantías'), line('520533', prov('intereses'), 0, 'Intereses sobre cesantías'),
        line('520536', prov('prima'), 0, 'Prima de servicios'), line('520539', prov('vacaciones'), 0, 'Vacaciones'),
        line('520551', prov('dotacion'), 0, 'Dotación'),
        line('250505', 0, net, 'Neto a pagar'),
        line('237005', 0, health, 'Salud (EPS)'), line('238030', 0, pension, 'Pensión y fondo de solidaridad'),
        line('237006', 0, arl, 'ARL'), line('237010', 0, parafiscales, 'Caja de compensación, SENA e ICBF'),
        line('237025', 0, embargos, 'Embargos judiciales'), line('237095', 0, authorized - embargos, 'Préstamos, libranzas y otros descuentos'),
        line('261005', 0, prov('cesantias'), 'Cesantías'), line('261010', 0, prov('intereses'), 'Intereses sobre cesantías'),
        line('261015', 0, prov('vacaciones'), 'Vacaciones'), line('261020', 0, prov('prima'), 'Prima de servicios'),
        line('261095', 0, prov('dotacion'), 'Dotación'),
      ],
    }));
    if (run.status === 'Borrador') review.push({ key: `payroll-${run.id}`, module: 'Nómina', title: `Nómina de ${label} en borrador`, action: 'payroll',
      detail: 'Se integró como causación provisional. Queda contabilizada cuando se confirme la liquidación en el módulo de Nómina.' });
    // Pago por Nequi: cada transferencia registrada es un egreso de bancos
    Object.entries(run.payments ?? {}).forEach(([employeeId, p]) => {
      if (run.status === 'Anulada' || !inRange(p.paidAt.slice(0, 10))) return;
      const who = pl.find(l => l.employeeId === employeeId)?.name ?? 'Empleado';
      out.push(draft({
        key: `payroll-pay-${run.id}-${employeeId}`, ref: `Nómina ${label}`, kind: 'Pago', at: p.paidAt, concept: `Pago nómina ${label} · ${who}`, third: who,
        origin: 'Nómina', category: 'Nómina', method: 'Nequi', supports: [`Nequi ${p.reference}`],
        lines: [line('250505', p.amount, 0, 'Salarios por pagar', who), line('1110', 0, p.amount, `Nequi ${p.reference}`, who)],
      }));
    });
  });

  // ── Inventarios: todo movimiento con valor pasa por 143505 ──
  // Compras contra proveedores; salidas al gasto según motivo y categoría; pérdidas y ajustes
  // negativos a pérdidas; ajustes positivos y donaciones a recuperaciones; inventario inicial al capital.
  const categoryOf = new Map(d.stock.map(p => [p.id, p.category]));
  const exitAccount = (reason: string, category: string) =>
    ['Pérdida', 'Vencimiento', 'Baja', 'Daño'].includes(reason) ? '531095'
    // (el hospedaje no vende productos: no hay costo de ventas de inventario)
    : category === 'Papelería' ? '529530' : category === 'Mantenimiento' ? '524515' : '529525';
  d.inventory.filter(m => inRange(m.date)).forEach(m => {
    const lines: EntryLine[] = [];
    m.lines.forEach(l => {
      const v = Math.abs(round(l.qty * l.unitCost));
      if (!v) return;
      const cat = categoryOf.get(l.productId) ?? '';
      const counter = m.kind === 'Salida' ? exitAccount(m.reason, cat)
        : m.kind === 'Ajuste' ? (l.reason === 'Conteo inicial' ? '311505' : l.qty < 0 ? '531095' : '425050')
        : m.kind === 'Inicial' ? '311505'           // existencias iniciales: aporte, no deuda con proveedores
        : m.reason === 'Compra' ? '220505'
        : m.reason === 'Devolución' ? exitAccount('Consumo interno', cat) : '425050';
      if (l.qty > 0) lines.push(line('143505', v, 0, `${l.code} +${l.qty}`), line(counter, 0, v, l.name));
      else lines.push(line(counter, v, 0, l.name), line('143505', 0, v, `${l.code} ${l.qty}`));
    });
    if (!lines.length) return;
    out.push(draft({
      // Entradas causan la compra (NC); salidas y ajustes son notas de consumo o ajuste
      key: `stock-${m.id}`, ref: m.number, kind: m.kind === 'Entrada' || m.kind === 'Inicial' ? 'Causación' : 'Ajuste',
      at: `${m.date}T${m.time}`, concept: `${m.kind === 'Inicial' ? 'Inventario inicial' : m.kind} · ${m.reason}${m.supplier ? ' · ' + m.supplier : m.area ? ' · ' + m.area : ''}`,
      third: m.supplier || m.deliveredTo || '', origin: 'Inventarios', category: m.kind === 'Entrada' && m.reason === 'Compra' ? 'Compras' : undefined,
      supports: m.invoice ? [m.invoice] : [], lines,
      // Lo que va a las habitaciones o a recepción es costo del alojamiento; el resto, de administración
      cc: m.area === 'Alojamiento' || m.area === 'Recepción' ? CC_ALOJAMIENTO : CC_ADMIN,
    }));
  });

  return { entries: out, duplicates, review };
}
