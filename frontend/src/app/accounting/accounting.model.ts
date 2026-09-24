export type VoucherType   = 'ING' | 'EGR' | 'PAG' | 'FAC' | 'NOM';
export type VoucherStatus = 'Publicado' | 'En proceso' | 'En revisión' | 'Anulado';

export interface AccountLine {
  account:     string;   // código
  accountName: string;
  debit:       number;
  credit:      number;
}

export interface Voucher {
  id:          string;
  number:      string;       // ING-000123
  type:        VoucherType;
  date:        string;
  concept:     string;
  third:       string;
  debit:       number;
  credit:      number;
  status:      VoucherStatus;
  lines:       AccountLine[];
  tercero:     string;
  numDoc:      string;
  centro:      string;
  observations:string;
}

export interface Account {
  code: string;
  name: string;
  type: 'Activo' | 'Pasivo' | 'Patrimonio' | 'Ingreso' | 'Gasto' | 'Costo';
}

export interface JournalEntry {
  date:         string;
  voucher:      string;
  concept:      string;
  account:      string;
  accountName:  string;
  description:  string;
  debit:        number;
  credit:       number;
}
