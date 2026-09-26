import { Room } from './room.model';

// Catálogo físico de la casa (vivienda turística en Filandia): 2 pisos que se
// alquilan por habitación, por piso completo o como casa completa. Es la única
// fuente de habitaciones: Alojamiento, Reservas y TRA la leen de aquí.
export const ROOMS: Room[] = [
  { id: 'r101', number: '101', floor: 1, type: 'Familiar', capacity: 4, doubleBeds: 1, bunkBeds: 1, privateBath: true },
  { id: 'r102', number: '102', floor: 1, type: 'Doble',    capacity: 2, doubleBeds: 1, bunkBeds: 0, privateBath: false, sharesBathWith: '103' },
  { id: 'r103', number: '103', floor: 1, type: 'Doble',    capacity: 2, doubleBeds: 1, bunkBeds: 0, privateBath: false, sharesBathWith: '102' },
  { id: 'r201', number: '201', floor: 2, type: 'Familiar', capacity: 4, doubleBeds: 1, bunkBeds: 1, privateBath: true },
  { id: 'r202', number: '202', floor: 2, type: 'Doble',    capacity: 2, doubleBeds: 1, bunkBeds: 0, privateBath: false, sharesBathWith: '203' },
  { id: 'r203', number: '203', floor: 2, type: 'Doble',    capacity: 2, doubleBeds: 1, bunkBeds: 0, privateBath: false, sharesBathWith: '202' },
  { id: 'r204', number: '204', floor: 2, type: 'Familiar', capacity: 4, doubleBeds: 1, bunkBeds: 1, privateBath: true },
];

export const FLOORS = [...new Set(ROOMS.map(r => r.floor))].sort();

export const roomsOnFloor = (floor: number): string[] => ROOMS.filter(r => r.floor === floor).map(r => r.number);

export const roomByNumber = (n: string): Room | undefined => ROOMS.find(r => r.number === n);

/** Totales de un grupo de habitaciones (piso o casa): capacidad y camas. */
export function summaryOf(numbers: string[]): { capacity: number; doubleBeds: number; bunkBeds: number } {
  const rooms = ROOMS.filter(r => numbers.includes(r.number));
  return {
    capacity:   rooms.reduce((s, r) => s + r.capacity, 0),
    doubleBeds: rooms.reduce((s, r) => s + r.doubleBeds, 0),
    bunkBeds:   rooms.reduce((s, r) => s + r.bunkBeds, 0),
  };
}

/** "Cama doble + camarote · baño privado" / "Cama doble · comparte baño con la 103" */
export function roomDescription(r: Room): string {
  const beds = [r.doubleBeds && `${r.doubleBeds > 1 ? r.doubleBeds + ' camas dobles' : 'Cama doble'}`,
                r.bunkBeds && `${r.bunkBeds > 1 ? r.bunkBeds + ' camarotes' : 'camarote'}`].filter(Boolean).join(' + ');
  return `${beds} · ${r.privateBath ? 'baño privado' : `comparte baño con la ${r.sharesBathWith}`}`;
}
