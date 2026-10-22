import { Room, summarizeRooms, bathroomLabel } from './room.model';

// Catálogo físico de la casa (vivienda turística en Filandia): 2 pisos que se
// alquilan por habitación, por piso completo o como casa completa. Alojamiento,
// Reservas y TRA leen las habitaciones de aquí. Al iniciar sesión, RoomService
// reemplaza estos datos con la tabla `habitaciones` (se conservan las fotos).
// Piso 1: 3 habitaciones · 8 personas · 3 camas dobles · 1 camarote
// Piso 2: 4 habitaciones · 12 personas · 4 camas dobles · 2 camarotes
// Casa completa: 7 habitaciones · 20 personas · 7 camas dobles · 3 camarotes
export const ROOMS: Room[] = [
  { id: 'r101', number: '101', floor: 1, type: 'Familiar', capacity: 4, beds: ['1 cama doble', '1 camarote'], bathroom: 'Privado',
    photos: ['assets/piso1/hab101.jpg'],
    pricePerNight: 120000, services: ['WiFi gratis', 'Agua caliente', 'Cocina equipada', 'Lavandería'],
    description: 'Habitación principal del piso 1 con cama doble y camarote. Baño privado, ideal para 4 personas en un ambiente acogedor.' },
  { id: 'r102', number: '102', floor: 1, type: 'Doble', capacity: 2, beds: ['1 cama doble'], bathroom: 'Compartido', sharesBathWith: '103',
    photos: ['assets/piso1/hab102.jpg'],
    pricePerNight: 75000, services: ['WiFi gratis'],
    description: 'Habitación simple con vista a la calle.' },
  { id: 'r103', number: '103', floor: 1, type: 'Doble', capacity: 2, beds: ['1 cama doble'], bathroom: 'Compartido', sharesBathWith: '102',
    photos: ['assets/piso1/hab103.jpg'],
    pricePerNight: 100000, services: ['WiFi gratis', 'Agua caliente', 'Cocina equipada', 'Lavandería'],
    description: 'Habitación doble con cama matrimonial. Comparte baño con la habitación 102. Ambiente tranquilo y acogedor.' },
  { id: 'r201', number: '201', floor: 2, type: 'Familiar', capacity: 4, beds: ['1 cama doble', '1 camarote'], bathroom: 'Privado',
    photos: ['assets/piso2/hab201.jpeg', 'assets/piso2/hab201-2.jpeg', 'assets/piso2/hab201-3.jpeg'],
    pricePerNight: 80000, services: ['WiFi gratis', 'Agua caliente', 'Cocina equipada', 'Lavandería'],
    description: 'Habitación con cama doble y camarote. Baño privado, ideal para 4 personas en un ambiente acogedor y tranquilo.' },
  { id: 'r202', number: '202', floor: 2, type: 'Doble', capacity: 2, beds: ['1 cama doble'], bathroom: 'Compartido', sharesBathWith: '203',
    photos: ['assets/piso2/hab202.jpeg', 'assets/piso2/hab202-2.jpeg', 'assets/piso2/hab202-3.jpeg'],
    pricePerNight: 110000, services: ['WiFi gratis', 'Agua caliente', 'Cocina equipada'],
    description: 'Habitación doble acogedora con cama matrimonial. Comparte baño con la habitación 203. Perfecta para parejas.' },
  { id: 'r203', number: '203', floor: 2, type: 'Doble', capacity: 2, beds: ['1 cama doble'], bathroom: 'Compartido', sharesBathWith: '202',
    photos: ['assets/piso2/hab203.jpg'],
    pricePerNight: 115000, services: ['WiFi gratis', 'Agua caliente', 'Cocina equipada', 'Lavandería'],
    description: 'Habitación doble con cama matrimonial y ambiente tranquilo. Comparte baño con la habitación 202. Vistas al entorno cafetero.' },
  { id: 'r204', number: '204', floor: 2, type: 'Familiar', capacity: 4, beds: ['1 cama doble', '1 camarote'], bathroom: 'Privado',
    photos: ['assets/piso2/hab204.jpg'],
    pricePerNight: 80000, services: ['WiFi gratis', 'Agua caliente', 'Cocina equipada', 'Lavandería'],
    description: 'Habitación con cama doble y camarote. Baño privado, ideal para 4 personas en un ambiente acogedor y tranquilo.' },
];

export const FLOORS = [...new Set(ROOMS.map(r => r.floor))].sort();

export const roomsOnFloor = (floor: number): string[] => ROOMS.filter(r => r.floor === floor).map(r => r.number);

export const roomByNumber = (n: string): Room | undefined => ROOMS.find(r => r.number === n);

/** Totales de un grupo de habitaciones (piso o casa): capacidad y camas. */
export function summaryOf(numbers: string[]): { capacity: number; doubleBeds: number; bunkBeds: number } {
  const { capacity, doubleBeds, bunkBeds } = summarizeRooms(ROOMS.filter(r => numbers.includes(r.number)));
  return { capacity, doubleBeds, bunkBeds };
}

/** "1 cama doble + 1 camarote · baño Privado" / "1 cama doble · baño Compartido con 103" */
export function roomDescription(r: Room): string {
  return `${r.beds.join(' + ')} · baño ${bathroomLabel(r)}`;
}
