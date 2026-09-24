export type StayStatus = 'En hospedaje' | 'Por salir' | 'Check-In' | 'Check-Out' | 'Finalizado';

export interface Stay {
  id:             string;
  reservationCode: string;
  guestName:      string;
  roomNumber:     string;
  roomType:       string;
  checkInDate:    string;   // YYYY-MM-DD
  checkInTime:    string;   // HH:mm
  checkOutDate:   string;   // YYYY-MM-DD
  checkOutTime?:  string;
  estimatedCheckOut: string;
  nights:         number;
  guests:         number;
  plan:           string;
  docNumber:      string;
  status:         StayStatus;
  observations:   string;
  paymentMethod?: string;
  additionalCharges?: number;
  totalAmount?:   number;
}
