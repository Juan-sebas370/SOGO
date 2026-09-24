export type InvoiceStatus = 'Pagada' | 'Pendiente' | 'Anulada' | 'Rechazada';

export interface InvoiceConcept {
  description: string;
  quantity:    number;
  unitValue:   number;
  total:       number;
}

export interface Invoice {
  id:             string;
  number:         string;         // FE-000162
  // Cliente
  clientName:     string;
  docType:        string;
  docNumber:      string;
  email:          string;
  phone:          string;
  // Factura
  issueDate:      string;
  dueDate:        string;
  paymentMethod:  string;
  concepts:       InvoiceConcept[];
  subtotal:       number;
  iva:            number;
  total:          number;
  observations:   string;
  status:         InvoiceStatus;
  // Electrónica
  cufe:           string;
  techProvider:   string;
  dianResolution: string;
  sentAt?:        string;
  // Eventos
  events:         { label: string; date: string }[];
}
