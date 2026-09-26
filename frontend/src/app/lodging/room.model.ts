export type RoomStatus = 'Disponible' | 'Ocupada' | 'Reservada' | 'En limpieza' | 'En mantenimiento' | 'Fuera de servicio';
// Estados que el personal asigna a mano; los demás se derivan de las reservas
export type ManualRoomStatus = 'En limpieza' | 'En mantenimiento' | 'Fuera de servicio';
export type BathroomType = 'Privado' | 'Compartido';

export interface Room {
  id:              string;
  number:          string;
  floor:           number;
  type:            string;
  capacity:        number;
  beds:            string[];      // "1 cama doble", "1 camarote"...
  bathroom:        BathroomType;
  sharesBathWith?: string;        // número de la habitación con la que comparte baño
  pricePerNight:   number;        // tarifa base "desde"
  description:     string;
  services:        string[];
  photos:          string[];      // rutas bajo assets/; la primera es la portada
}

export interface RoomWithStatus extends Room {
  status: RoomStatus;
}

/** Totales de un grupo de habitaciones (un piso o la casa completa). */
export interface RoomGroupSummary {
  rooms:       number;
  capacity:    number;
  doubleBeds:  number;
  bunkBeds:    number;
  pricePerNight: number;
}

export function summarizeRooms(rooms: Room[]): RoomGroupSummary {
  const count = (kind: string) => rooms.flatMap(r => r.beds)
    .filter(b => b.endsWith(kind))
    .reduce((s, b) => s + parseInt(b, 10), 0);
  return {
    rooms: rooms.length,
    capacity: rooms.reduce((s, r) => s + r.capacity, 0),
    doubleBeds: count('cama doble') + count('camas dobles'),
    bunkBeds: count('camarote') + count('camarotes'),
    pricePerNight: rooms.reduce((s, r) => s + r.pricePerNight, 0),
  };
}

/** "Privado" · "Compartido con 103" */
export function bathroomLabel(r: Room): string {
  return r.bathroom === 'Compartido' && r.sharesBathWith ? `Compartido con ${r.sharesBathWith}` : r.bathroom;
}
