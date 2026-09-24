// Un color/ícono por caso concreto (no solo por categoría amplia): "Check-out
// pendiente" y "Reserva en revisión" antes compartían el mismo ícono
// 'reservation' pese a tener urgencia totalmente distinta.
export type NotificationIcon = 'checkout' | 'cleaning' | 'maintenance' | 'review' | 'inventory' | 'billing';
export type NotificationLevel = 'Alta' | 'Media' | 'Baja';

export interface AppNotification {
  icon:   NotificationIcon;
  level:  NotificationLevel;
  label:  string;
  detail: string;
  link:   string;
}
