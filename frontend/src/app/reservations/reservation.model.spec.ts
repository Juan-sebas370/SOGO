import {
  Reservation, totalAmount, paidAmount, balance, paymentStatus, lodgingLabel, totalGuests, isInHouse, awaitsCheckIn,
  splitFullName, GUEST_PAYMENT_METHODS,
} from './reservation.model';

const res = (over: Partial<Reservation> = {}): Reservation => ({
  id: '1', code: 'RSV-2026-00001', guestName: 'Andrés Apache', firstName: 'Andrés', lastName: 'Apache',
  docType: 'Cédula de Ciudadanía', docNumber: '100266', phone: '3170755269', email: 'a@correo.com', city: 'Colombia - Pereira, Risaralda',
  reservationType: 'Individual', channel: 'Directo', lodgingType: 'Habitación', rooms: ['103'],
  adults: 2, children: 1, infants: 0, checkIn: '2026-10-22', checkOut: '2026-10-24', nights: 2, plan: 'Solo alojamiento',
  lodgingAmount: 220_000, extrasAmount: 30_000, payments: [], status: 'Confirmada', observations: '',
  createdAt: '2026-10-01T10:00', updatedAt: '2026-10-01T10:00', ...over,
});

describe('Reservas · valores y pagos', () => {
  it('el total suma alojamiento y servicios adicionales', () => {
    expect(totalAmount(res())).toBe(250_000);
  });

  it('el saldo descuenta los abonos y nunca es negativo', () => {
    const r = res({ payments: [{ date: '', method: 'Nequi', amount: 100_000, receipt: '' }] });
    expect(paidAmount(r)).toBe(100_000);
    expect(balance(r)).toBe(150_000);
    expect(balance(res({ payments: [{ date: '', method: 'Efectivo', amount: 900_000, receipt: '' }] }))).toBe(0);
  });

  it('estado de pago: pendiente, parcial y pagado', () => {
    expect(paymentStatus(res())).toBe('Pendiente');
    expect(paymentStatus(res({ payments: [{ date: '', method: 'Nequi', amount: 1, receipt: '' }] }))).toBe('Parcial');
    expect(paymentStatus(res({ payments: [{ date: '', method: 'Nequi', amount: 250_000, receipt: '' }] }))).toBe('Pagado');
  });

  it('los métodos de recepción no incluyen Wompi (solo entra por la web)', () => {
    expect(GUEST_PAYMENT_METHODS).not.toContain('Wompi');
    expect(GUEST_PAYMENT_METHODS).toContain('Nequi');
  });
});

describe('Reservas · alojamiento y huéspedes', () => {
  it('rotula el alojamiento según el tipo', () => {
    expect(lodgingLabel(res())).toBe('Hab. 103');
    expect(lodgingLabel(res({ rooms: ['101', '102'] }))).toBe('2 habitaciones');
    expect(lodgingLabel(res({ lodgingType: 'Piso', floor: 2 }))).toBe('Piso 2');
    expect(lodgingLabel(res({ lodgingType: 'Casa completa' }))).toBe('Casa completa');
  });

  it('una reserva sin habitación asignada lo dice (antes salía "0 habitaciones")', () => {
    expect(lodgingLabel(res({ rooms: [] }))).toBe('Sin habitación asignada');
  });

  it('cuenta adultos, niños y bebés', () => {
    expect(totalGuests(res({ adults: 2, children: 1, infants: 1 }))).toBe(4);
  });

  it('alojado = con check-in y sin check-out', () => {
    expect(isInHouse(res())).toBeFalse();
    expect(isInHouse(res({ checkedInAt: '2026-10-22T15:00' }))).toBeTrue();
    expect(isInHouse(res({ checkedInAt: '2026-10-22T15:00', checkedOutAt: '2026-10-24T11:00' }))).toBeFalse();
  });

  it('espera check-in solo si está confirmada o pendiente y no ha llegado', () => {
    expect(awaitsCheckIn(res())).toBeTrue();
    expect(awaitsCheckIn(res({ status: 'Pendiente' }))).toBeTrue();
    expect(awaitsCheckIn(res({ status: 'Cancelada' }))).toBeFalse();
    expect(awaitsCheckIn(res({ checkedInAt: '2026-10-22T15:00' }))).toBeFalse();
  });

  it('separa nombres y apellidos de un nombre completo', () => {
    expect(splitFullName('Juan Sebastián Pinilla Arcila')).toEqual(['Juan Sebastián', 'Pinilla Arcila']);
    expect(splitFullName('Andrés Apache')).toEqual(['Andrés', 'Apache']);
  });
});
