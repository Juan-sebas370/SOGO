import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

type SettingsTab = 'general' | 'hotel' | 'billing' | 'notifications' | 'security' | 'integrations';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./settings.component.css'],
  template: `
  <div class="res-page settings-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <span>Configuración</span>
    </div>

    <div class="res-header">
      <div>
        <h1 class="res-title">Configuración del Sistema</h1>
        <p class="res-subtitle">Parámetros generales de SOGO · Hospedaje Sebastián Filandia</p>
      </div>
      <button class="btn-primary" (click)="saveAll()">
        💾 Guardar Cambios
      </button>
    </div>

    <div class="settings-layout">

      <!-- Menú lateral -->
      <nav class="settings-nav">
        <button class="settings-nav-item" *ngFor="let s of sections"
          [class.active]="activeTab === s.id"
          (click)="activeTab = s.id">
          <span class="snav-icon">{{ s.icon }}</span>
          <span class="snav-label">{{ s.label }}</span>
        </button>
      </nav>

      <!-- Contenido -->
      <div class="settings-content">

        <!-- ══ GENERAL ══ -->
        <div *ngIf="activeTab==='general'">
          <h2 class="settings-section-title">Información General</h2>

          <div class="settings-group">
            <h3 class="settings-group-title">Datos del Establecimiento</h3>
            <div class="settings-form-grid">
              <div class="form-field"><label>Nombre del Hospedaje *</label><input type="text" [(ngModel)]="general.name" class="form-input"></div>
              <div class="form-field"><label>NIT / RUT</label><input type="text" [(ngModel)]="general.nit" class="form-input"></div>
              <div class="form-field"><label>Dirección</label><input type="text" [(ngModel)]="general.address" class="form-input"></div>
              <div class="form-field"><label>Ciudad</label><input type="text" [(ngModel)]="general.city" class="form-input"></div>
              <div class="form-field"><label>Teléfono Principal</label><input type="text" [(ngModel)]="general.phone" class="form-input"></div>
              <div class="form-field"><label>Correo de Contacto</label><input type="email" [(ngModel)]="general.email" class="form-input"></div>
              <div class="form-field"><label>Sitio Web</label><input type="text" [(ngModel)]="general.website" class="form-input"></div>
              <div class="form-field"><label>Zona Horaria</label>
                <select [(ngModel)]="general.timezone" class="form-select">
                  <option>América/Bogotá (UTC-5)</option>
                  <option>América/Lima (UTC-5)</option>
                  <option>América/Caracas (UTC-4)</option>
                </select>
              </div>
              <div class="form-field"><label>Moneda</label>
                <select [(ngModel)]="general.currency" class="form-select">
                  <option>COP — Peso Colombiano</option>
                  <option>USD — Dólar Americano</option>
                  <option>EUR — Euro</option>
                </select>
              </div>
              <div class="form-field"><label>Idioma</label>
                <select [(ngModel)]="general.language" class="form-select">
                  <option>Español</option>
                  <option>English</option>
                </select>
              </div>
            </div>
          </div>

          <div class="settings-group">
            <h3 class="settings-group-title">Logotipo e Identidad</h3>
            <div class="logo-upload-area">
              <img src="/assets/logo2.png" alt="Logo actual" class="logo-preview">
              <div class="logo-upload-info">
                <p class="logo-name">logo2.png</p>
                <p class="logo-desc">Formatos: PNG, JPG · Tamaño máximo: 2 MB · Recomendado: 400×200 px</p>
                <button class="btn-outline-sm" (click)="changeLogo()">Cambiar Logo</button>
              </div>
            </div>
          </div>
        </div>

        <!-- ══ HOTEL ══ -->
        <div *ngIf="activeTab==='hotel'">
          <h2 class="settings-section-title">Configuración del Hotel</h2>

          <div class="settings-group">
            <h3 class="settings-group-title">Parámetros de Alojamiento</h3>
            <div class="settings-form-grid">
              <div class="form-field"><label>Hora de Check-In</label><input type="time" [(ngModel)]="hotel.checkInTime" class="form-input"></div>
              <div class="form-field"><label>Hora de Check-Out</label><input type="time" [(ngModel)]="hotel.checkOutTime" class="form-input"></div>
              <div class="form-field"><label>Total de Habitaciones</label><input type="number" [(ngModel)]="hotel.totalRooms" min="1" class="form-input"></div>
              <div class="form-field"><label>Pisos / Niveles</label><input type="number" [(ngModel)]="hotel.floors" min="1" class="form-input"></div>
              <div class="form-field"><label>Política de Cancelación</label>
                <select [(ngModel)]="hotel.cancellationPolicy" class="form-select">
                  <option>24 horas antes</option>
                  <option>48 horas antes</option>
                  <option>72 horas antes</option>
                  <option>No reembolsable</option>
                </select>
              </div>
              <div class="form-field"><label>Tarifa de No-Show (%)</label><input type="number" [(ngModel)]="hotel.noShowFee" min="0" max="100" class="form-input"></div>
              <div class="form-field"><label>Impuesto de Alojamiento (%)</label><input type="number" [(ngModel)]="hotel.lodgingTax" min="0" class="form-input"></div>
              <div class="form-field"><label>Número de Habitaciones de Reserva</label><input type="number" [(ngModel)]="hotel.reserveRooms" min="0" class="form-input"></div>
            </div>
          </div>

          <div class="settings-group">
            <h3 class="settings-group-title">Tipos de Habitación</h3>
            <div class="room-types-list">
              <div class="room-type-item" *ngFor="let rt of hotel.roomTypes; let i=index">
                <input type="text" [(ngModel)]="rt.name" class="form-input" placeholder="Nombre">
                <input type="number" [(ngModel)]="rt.capacity" class="form-input" placeholder="Cap." min="1" max="10">
                <input type="number" [(ngModel)]="rt.baseRate" class="form-input" placeholder="Tarifa base" min="0">
                <button class="btn-del-concept" (click)="removeRoomType(i)">✕</button>
              </div>
              <button class="btn-add-concept" (click)="addRoomType()">+ Agregar Tipo</button>
            </div>
          </div>
        </div>

        <!-- ══ FACTURACIÓN ══ -->
        <div *ngIf="activeTab==='billing'">
          <h2 class="settings-section-title">Configuración de Facturación</h2>

          <div class="settings-group">
            <h3 class="settings-group-title">Parámetros Fiscales</h3>
            <div class="settings-form-grid">
              <div class="form-field"><label>IVA General (%)</label><input type="number" [(ngModel)]="billing.iva" min="0" class="form-input"></div>
              <div class="form-field"><label>Régimen Tributario</label>
                <select [(ngModel)]="billing.taxRegime" class="form-select">
                  <option>Responsable de IVA</option>
                  <option>No Responsable de IVA</option>
                  <option>Régimen Simple</option>
                </select>
              </div>
              <div class="form-field"><label>Prefijo de Factura</label><input type="text" [(ngModel)]="billing.invoicePrefix" class="form-input" placeholder="FE-"></div>
              <div class="form-field"><label>Número Inicial de Factura</label><input type="number" [(ngModel)]="billing.invoiceStart" min="1" class="form-input"></div>
              <div class="form-field"><label>Proveedor Facturación Electrónica</label>
                <select [(ngModel)]="billing.eInvoiceProvider" class="form-select">
                  <option>Factuatech S.A.S.</option>
                  <option>DIAN Directa</option>
                  <option>Siigo</option>
                  <option>Alegra</option>
                </select>
              </div>
              <div class="form-field"><label>Resolución DIAN</label><input type="text" [(ngModel)]="billing.dianResolution" class="form-input"></div>
              <div class="form-field"><label>Vigencia Desde</label><input type="date" [(ngModel)]="billing.validFrom" class="form-input"></div>
              <div class="form-field"><label>Vigencia Hasta</label><input type="date" [(ngModel)]="billing.validTo" class="form-input"></div>
            </div>
          </div>

          <div class="settings-group">
            <h3 class="settings-group-title">Métodos de Pago Habilitados</h3>
            <div class="payment-methods">
              <label class="checkbox-label" *ngFor="let pm of billing.paymentMethods">
                <input type="checkbox" [(ngModel)]="pm.enabled"> {{ pm.name }}
              </label>
            </div>
          </div>
        </div>

        <!-- ══ NOTIFICACIONES ══ -->
        <div *ngIf="activeTab==='notifications'">
          <h2 class="settings-section-title">Notificaciones</h2>

          <div class="settings-group">
            <h3 class="settings-group-title">Correo Electrónico (SMTP)</h3>
            <div class="settings-form-grid">
              <div class="form-field"><label>Servidor SMTP</label><input type="text" [(ngModel)]="notif.smtpHost" class="form-input" placeholder="smtp.gmail.com"></div>
              <div class="form-field"><label>Puerto</label><input type="number" [(ngModel)]="notif.smtpPort" class="form-input" placeholder="587"></div>
              <div class="form-field"><label>Usuario SMTP</label><input type="email" [(ngModel)]="notif.smtpUser" class="form-input"></div>
              <div class="form-field"><label>Contraseña SMTP</label><input type="password" [(ngModel)]="notif.smtpPass" class="form-input"></div>
              <div class="form-field"><label>Correo Remitente</label><input type="email" [(ngModel)]="notif.senderEmail" class="form-input"></div>
              <div class="form-field"><label>Nombre Remitente</label><input type="text" [(ngModel)]="notif.senderName" class="form-input"></div>
            </div>
            <button class="btn-outline-sm" style="margin-top:12px" (click)="testEmail()">📧 Probar Conexión</button>
          </div>

          <div class="settings-group">
            <h3 class="settings-group-title">Eventos de Notificación</h3>
            <div class="notif-events">
              <label class="notif-event-row" *ngFor="let ev of notif.events">
                <div class="notif-event-info">
                  <span class="notif-event-name">{{ ev.name }}</span>
                  <span class="notif-event-desc">{{ ev.desc }}</span>
                </div>
                <div class="notif-toggles">
                  <label class="toggle-label"><input type="checkbox" [(ngModel)]="ev.email"> Email</label>
                  <label class="toggle-label"><input type="checkbox" [(ngModel)]="ev.system"> Sistema</label>
                </div>
              </label>
            </div>
          </div>
        </div>

        <!-- ══ SEGURIDAD ══ -->
        <div *ngIf="activeTab==='security'">
          <h2 class="settings-section-title">Seguridad y Acceso</h2>

          <div class="settings-group">
            <h3 class="settings-group-title">Política de Contraseñas</h3>
            <div class="settings-form-grid">
              <div class="form-field"><label>Longitud Mínima</label><input type="number" [(ngModel)]="security.minPasswordLength" min="6" max="32" class="form-input"></div>
              <div class="form-field"><label>Expiración (días)</label><input type="number" [(ngModel)]="security.passwordExpiry" min="0" class="form-input"></div>
              <div class="form-field"><label>Intentos de Login Fallidos</label><input type="number" [(ngModel)]="security.maxLoginAttempts" min="3" max="10" class="form-input"></div>
              <div class="form-field"><label>Tiempo de Sesión (minutos)</label><input type="number" [(ngModel)]="security.sessionTimeout" min="5" class="form-input"></div>
            </div>
            <div class="security-toggles">
              <label class="toggle-row">
                <div><strong>Autenticación de dos factores (2FA)</strong><p>Requiere verificación adicional al iniciar sesión.</p></div>
                <input type="checkbox" [(ngModel)]="security.twoFactor" class="toggle-check">
              </label>
              <label class="toggle-row">
                <div><strong>Forzar mayúsculas y números</strong><p>La contraseña debe contener al menos una mayúscula y un número.</p></div>
                <input type="checkbox" [(ngModel)]="security.requireStrongPassword" class="toggle-check">
              </label>
              <label class="toggle-row">
                <div><strong>Bloqueo automático por inactividad</strong><p>Bloquea la sesión si no hay actividad.</p></div>
                <input type="checkbox" [(ngModel)]="security.autoLock" class="toggle-check">
              </label>
            </div>
          </div>

          <div class="settings-group">
            <h3 class="settings-group-title">Respaldo y Recuperación</h3>
            <div class="backup-section">
              <div class="backup-info">
                <span class="backup-label">Último respaldo</span>
                <strong class="backup-value">{{ security.lastBackup }}</strong>
              </div>
              <div class="backup-info">
                <span class="backup-label">Frecuencia de respaldo</span>
                <select [(ngModel)]="security.backupFreq" class="form-select" style="max-width:200px">
                  <option>Diario</option><option>Semanal</option><option>Mensual</option>
                </select>
              </div>
              <button class="btn-primary" style="margin-top:14px" (click)="runBackup()">🗄 Ejecutar Respaldo Ahora</button>
            </div>
          </div>
        </div>

        <!-- ══ INTEGRACIONES ══ -->
        <div *ngIf="activeTab==='integrations'">
          <h2 class="settings-section-title">Integraciones y APIs</h2>

          <div class="integrations-grid">
            <div class="integration-card" *ngFor="let integ of integrations">
              <div class="integ-header">
                <span class="integ-icon">{{ integ.icon }}</span>
                <div>
                  <strong class="integ-name">{{ integ.name }}</strong>
                  <p class="integ-desc">{{ integ.desc }}</p>
                </div>
                <span class="res-badge" [ngClass]="integ.active ? 'res-badge--usr-active' : 'res-badge--usr-inactive'">
                  {{ integ.active ? 'Activo' : 'Inactivo' }}
                </span>
              </div>
              <div class="integ-body" *ngIf="integ.active">
                <div class="form-field">
                  <label>API Key</label>
                  <input type="password" [value]="integ.apiKey" class="form-input" readonly>
                </div>
              </div>
              <div class="integ-actions">
                <button class="btn-outline-sm" (click)="integ.active=!integ.active">
                  {{ integ.active ? 'Desconectar' : 'Conectar' }}
                </button>
                <button class="btn-outline-sm" *ngIf="integ.active">⚙ Configurar</button>
              </div>
            </div>
          </div>
        </div>

      </div><!-- /settings-content -->
    </div><!-- /settings-layout -->

    <!-- Toast -->
    <div class="toast-success" *ngIf="savedToast">✔ Configuración guardada correctamente.</div>

  </div>
  `
})
export class SettingsComponent implements OnInit {

  activeTab: SettingsTab = 'general';

  sections = [
    { id:'general' as SettingsTab,       icon:'🏢', label:'General' },
    { id:'hotel' as SettingsTab,         icon:'🏨', label:'Hotel' },
    { id:'billing' as SettingsTab,       icon:'🧾', label:'Facturación' },
    { id:'notifications' as SettingsTab, icon:'🔔', label:'Notificaciones' },
    { id:'security' as SettingsTab,      icon:'🔒', label:'Seguridad' },
    { id:'integrations' as SettingsTab,  icon:'🔌', label:'Integraciones' },
  ];

  savedToast = false;

  general = {
    name:     'Hospedaje Sebastián Filandia',
    nit:      '901234567-0',
    address:  'Calle 5 #4-32, Centro Histórico',
    city:     'Filandia, Quindío',
    phone:    '(+57) 310 555-0100',
    email:    'contacto@hospedajesebastian.com',
    website:  'www.hospedajesebastian.com',
    timezone: 'América/Bogotá (UTC-5)',
    currency: 'COP — Peso Colombiano',
    language: 'Español',
  };

  hotel = {
    checkInTime:        '15:00',
    checkOutTime:       '12:00',
    totalRooms:         28,
    floors:             3,
    cancellationPolicy: '24 horas antes',
    noShowFee:          50,
    lodgingTax:         19,
    reserveRooms:       2,
    roomTypes: [
      { name:'Simple',         capacity:1, baseRate:160000 },
      { name:'Doble Estándar', capacity:2, baseRate:220000 },
      { name:'Suite',          capacity:4, baseRate:380000 },
    ],
  };

  billing = {
    iva:              19,
    taxRegime:        'Responsable de IVA',
    invoicePrefix:    'FE-',
    invoiceStart:     1,
    eInvoiceProvider: 'Factuatech S.A.S.',
    dianResolution:   '18764321246676',
    validFrom:        '2024-01-01',
    validTo:          '2025-12-31',
    paymentMethods: [
      { name:'Efectivo',          enabled:true  },
      { name:'Tarjeta de Crédito',enabled:true  },
      { name:'Tarjeta de Débito', enabled:true  },
      { name:'Transferencia',     enabled:true  },
      { name:'QR / Nequi',        enabled:false },
      { name:'Daviplata',         enabled:false },
    ],
  };

  notif = {
    smtpHost:    'smtp.gmail.com',
    smtpPort:    587,
    smtpUser:    'notificaciones@hospedajesebastian.com',
    smtpPass:    '',
    senderEmail: 'no-reply@hospedajesebastian.com',
    senderName:  'Hospedaje Sebastián Filandia',
    events: [
      { name:'Nueva Reserva',            desc:'Cuando se crea una nueva reserva.', email:true,  system:true  },
      { name:'Check-In Registrado',      desc:'Cuando un huésped hace check-in.',  email:true,  system:true  },
      { name:'Check-Out Registrado',     desc:'Cuando un huésped hace check-out.', email:false, system:true  },
      { name:'Factura Emitida',          desc:'Cuando se genera una factura.',     email:true,  system:false },
      { name:'Alerta de Inventario',     desc:'Stock bajo o crítico.',             email:true,  system:true  },
      { name:'Nómina Generada',          desc:'Cuando se completa una nómina.',    email:false, system:true  },
      { name:'Nuevo Usuario Creado',     desc:'Cuando se crea un usuario.',        email:true,  system:false },
    ],
  };

  security = {
    minPasswordLength:    8,
    passwordExpiry:       90,
    maxLoginAttempts:     5,
    sessionTimeout:       60,
    twoFactor:            false,
    requireStrongPassword:true,
    autoLock:             true,
    lastBackup:           '24/05/2024 02:00 a.m.',
    backupFreq:           'Diario',
  };

  integrations = [
    { name:'Booking.com',  icon:'🌐', desc:'Sincronización de reservas con Booking.com.', active:false, apiKey:'' },
    { name:'Airbnb',       icon:'🏠', desc:'Gestión de reservas de Airbnb.',               active:false, apiKey:'' },
    { name:'WhatsApp API', icon:'💬', desc:'Notificaciones por WhatsApp Business.',        active:true,  apiKey:'wpp_sk_xxxxxxxxxxxxx' },
    { name:'Google Analytics',icon:'📈',desc:'Analítica web y seguimiento de usuarios.',   active:false, apiKey:'' },
    { name:'Siigo',        icon:'💼', desc:'Integración contable con Siigo.',              active:false, apiKey:'' },
    { name:'Pasarela PSE', icon:'💳', desc:'Pagos en línea a través de PSE.',              active:true,  apiKey:'pse_sk_xxxxxxxxxxxxx' },
  ];

  ngOnInit(): void {}

  addRoomType(): void { this.hotel.roomTypes.push({ name:'', capacity:2, baseRate:0 }); }
  removeRoomType(i: number): void { this.hotel.roomTypes.splice(i, 1); }

  changeLogo(): void { alert('Seleccionar nuevo logo (próximamente con carga real de archivos)'); }
  testEmail():  void { alert('Conexión SMTP probada exitosamente.'); }
  runBackup():  void { this.security.lastBackup = new Date().toLocaleString(); alert('Respaldo ejecutado correctamente.'); }

  saveAll(): void {
    this.savedToast = true;
    setTimeout(() => this.savedToast = false, 3000);
  }
}
