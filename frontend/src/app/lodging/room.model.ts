export type RoomStatus = 'Disponible' | 'Ocupada' | 'Reservada' | 'En limpieza' | 'Mantenimiento';

export interface Room {
  id:       string;
  number:   string;
  floor:    number;
  type:     string;
  capacity: number;
}

export interface RoomWithStatus extends Room {
  status: RoomStatus;
}
