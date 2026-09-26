export type RoomStatus = 'Disponible' | 'Ocupada' | 'Reservada' | 'En limpieza' | 'Mantenimiento';

export interface Room {
  id:             string;
  number:         string;
  floor:          number;
  type:           string;
  capacity:       number;     // personas: 2 por cama doble y 2 por camarote
  doubleBeds:     number;
  bunkBeds:       number;
  privateBath:    boolean;
  sharesBathWith?: string;    // habitación con la que comparte baño
}

export interface RoomWithStatus extends Room {
  status: RoomStatus;
}
