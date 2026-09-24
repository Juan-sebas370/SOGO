export type TraStatus = 'Generada' | 'Anulada' | 'Pendiente';

export interface Tra {
  id:               string;
  code:             string;         // TRA-00045
  reservationCode:  string;         // RES-00078
  // Datos del Huésped
  fullName:         string;
  docType:          string;
  docNumber:        string;
  firstName:        string;
  lastName:         string;
  nationality:      string;
  birthDate:        string;
  countryOfResidence: string;
  cityOfResidence:  string;
  travelReason:     string;
  transport:        string;
  company:          string;
  // Datos del Alojamiento
  roomNumber:       string;
  roomType:         string;
  checkInDate:      string;
  checkInTime:      string;
  checkOutDate:     string;
  checkOutTime:     string;
  nights:           number;
  guests:           number;
  plan:             string;
  // Datos adicionales
  travelPurpose:    string;
  residenceCountry: string;
  age:              string;
  // Estado
  status:           TraStatus;
  observations:     string;
  generatedAt:      string;
  generatedBy:      string;
}
