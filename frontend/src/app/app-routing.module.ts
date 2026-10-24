import { Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { OAuthCallbackComponent } from './oauth-callback/oauth-callback.component';
import { ResetRequestComponent } from './reset-request/reset-request.component';
import { ResetComponent } from './reset/reset.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { accountingReady } from './accounting/accounting.guard';
import { DashboardHomeComponent } from './dashboard-home/dashboard-home.component';
import { DashboardProfileComponent } from './dashboard-profile/dashboard-profile.component';
import { ReservationsListComponent } from './reservations/reservations-list/reservations-list.component';
import { ReservationFormComponent } from './reservations/reservation-form/reservation-form.component';
import { ReservationDetailComponent } from './reservations/reservation-detail/reservation-detail.component';
import { InvoiceListComponent } from './billing/invoice-list/invoice-list.component';
import { InvoiceNewComponent } from './billing/invoice-new/invoice-new.component';
import { InvoiceDetailComponent } from './billing/invoice-detail/invoice-detail.component';
import { InvoicePrintComponent } from './billing/invoice-print/invoice-print.component';
import { BillingSettingsComponent } from './billing/billing-settings/billing-settings.component';
import { billingPermission } from './billing/billing.guard';
import { InvoiceReportsComponent } from './billing/invoice-reports/invoice-reports.component';
import { TraPanelComponent } from './tra/tra-panel/tra-panel.component';
import { TraRegistrationComponent } from './tra/tra-registration/tra-registration.component';
import { TraSummaryComponent } from './tra/tra-summary/tra-summary.component';
import { TraDetailComponent } from './tra/tra-detail/tra-detail.component';
import { TraConfigComponent } from './tra/tra-config/tra-config.component';
import { LodgingListComponent } from './lodging/lodging-list/lodging-list.component';
import { CheckinFormComponent } from './lodging/checkin-form/checkin-form.component';
import { CheckoutFormComponent } from './lodging/checkout-form/checkout-form.component';
import { LodgingConfirmComponent } from './lodging/lodging-confirm/lodging-confirm.component';
import { authGuard } from './auth.guard';
import { moduleGuard } from './module.guard';
import { AccessDeniedComponent } from './access-denied/access-denied.component';

export const routes: Routes = [
  { path: '', component: LoginComponent },
  { path: 'oauth-callback', component: OAuthCallbackComponent },
  { path: 'reset-request', component: ResetRequestComponent },
  { path: 'reset',         component: ResetComponent },
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [authGuard],
    canActivateChild: [moduleGuard],
    children: [
      { path: '',                       component: DashboardHomeComponent },
      { path: 'profile',                component: DashboardProfileComponent },
      { path: 'reservations',           component: ReservationsListComponent },
      { path: 'reservations/new',       component: ReservationFormComponent },
      { path: 'reservations/:id',       component: ReservationDetailComponent },
      { path: 'reservations/:id/edit',  component: ReservationFormComponent },
      // Configuración
      { path: 'settings',                loadComponent: () => import('./settings/hotel/hotel.component').then(c => c.HotelComponent) },
      { path: 'settings/security',       loadComponent: () => import('./settings/security/security.component').then(c => c.SecurityComponent) },
      { path: 'settings/taxes',          redirectTo: 'billing/settings', pathMatch: 'full' },
      { path: 'settings/payroll',        loadComponent: () => import('./settings/payroll-params/payroll-params.component').then(c => c.PayrollParamsComponent) },
      { path: 'settings/lodging',        loadComponent: () => import('./settings/lodging/lodging.component').then(c => c.LodgingComponent) },
      { path: 'settings/goals',          canActivate: [accountingReady], loadComponent: () => import('./settings/goals/goals.component').then(c => c.GoalsComponent) },
      { path: 'settings/notifications',  loadComponent: () => import('./settings/notifications/notifications.component').then(c => c.NotificationsComponent) },
      { path: 'settings/audit',          canActivate: [accountingReady], loadComponent: () => import('./settings/audit/audit.component').then(c => c.AuditComponent) },
      // Acceso denegado
      { path: 'access-denied', component: AccessDeniedComponent },
      // Usuarios y Roles (acceso según el permiso «Ver» de Usuarios)
      { path: 'users',                   loadComponent: () => import('./users/user-list/user-list.component').then(c => c.UserListComponent) },
      { path: 'users/search',            loadComponent: () => import('./users/search/search.component').then(c => c.UserSearchComponent) },
      { path: 'users/new',               loadComponent: () => import('./users/user-new/user-new.component').then(c => c.UserNewComponent) },
      { path: 'users/roles',             loadComponent: () => import('./users/roles/roles.component').then(c => c.RolesComponent) },
      { path: 'users/status',            loadComponent: () => import('./users/status/status.component').then(c => c.StatusComponent) },
      { path: 'users/passwords',         loadComponent: () => import('./users/passwords/passwords.component').then(c => c.PasswordsComponent) },
      { path: 'users/activity',          loadComponent: () => import('./users/activity/activity.component').then(c => c.ActivityComponent) },
      { path: 'users/reports',           loadComponent: () => import('./users/users-report/users-report.component').then(c => c.UsersReportComponent) },
      { path: 'users/export',            loadComponent: () => import('./users/export/export.component').then(c => c.UsersExportComponent) },
      { path: 'users/:id',               loadComponent: () => import('./users/user-detail/user-detail.component').then(c => c.UserDetailComponent) },
      // Reportes
      { path: 'reports',                      canActivate: [accountingReady], loadComponent: () => import('./reports/general/general.component').then(c => c.GeneralComponent) },
      { path: 'reports/occupancy',            canActivate: [accountingReady], loadComponent: () => import('./reports/occupancy/occupancy.component').then(c => c.OccupancyComponent) },
      { path: 'reports/reservations',         canActivate: [accountingReady], loadComponent: () => import('./reports/reservations-report/reservations-report.component').then(c => c.ReservationsReportComponent) },
      { path: 'reports/financial',            canActivate: [accountingReady], loadComponent: () => import('./reports/financial/financial.component').then(c => c.FinancialComponent) },
      { path: 'reports/inventory',            canActivate: [accountingReady], loadComponent: () => import('./reports/inventory-report/inventory-report.component').then(c => c.InventoryReportComponent) },
      { path: 'reports/indicators',           canActivate: [accountingReady], loadComponent: () => import('./reports/indicators/indicators.component').then(c => c.IndicatorsComponent) },
      { path: 'reports/filter',               canActivate: [accountingReady], loadComponent: () => import('./reports/filter/filter.component').then(c => c.FilterComponent) },
      { path: 'reports/charts',               canActivate: [accountingReady], loadComponent: () => import('./reports/charts-page/charts-page.component').then(c => c.ChartsPageComponent) },
      { path: 'reports/scheduled',            canActivate: [accountingReady], loadComponent: () => import('./reports/scheduled/scheduled.component').then(c => c.ScheduledComponent) },
      // Inventarios
      { path: 'inventory',                    loadComponent: () => import('./inventory/inventory-list/inventory-list.component').then(c => c.InventoryListComponent) },
      { path: 'inventory/dotacion',           loadComponent: () => import('./inventory/dotacion/dotacion.component').then(c => c.DotacionComponent) },
      { path: 'inventory/search',             loadComponent: () => import('./inventory/search/search.component').then(c => c.SearchComponent) },
      { path: 'inventory/products/new',       loadComponent: () => import('./inventory/product-form/product-form.component').then(c => c.ProductFormComponent) },
      { path: 'inventory/products/:id',       loadComponent: () => import('./inventory/product-form/product-form.component').then(c => c.ProductFormComponent) },
      { path: 'inventory/entries',            loadComponent: () => import('./inventory/entries/entries.component').then(c => c.EntriesComponent) },
      { path: 'inventory/exits',              loadComponent: () => import('./inventory/exits/exits.component').then(c => c.ExitsComponent) },
      { path: 'inventory/adjustments',        loadComponent: () => import('./inventory/adjustments/adjustments.component').then(c => c.AdjustmentsComponent) },
      { path: 'inventory/alerts',             loadComponent: () => import('./inventory/alerts/alerts.component').then(c => c.AlertsComponent) },
      { path: 'inventory/reports',            loadComponent: () => import('./inventory/reports/reports.component').then(c => c.ReportsComponent) },
      { path: 'inventory/export',             loadComponent: () => import('./inventory/export/export.component').then(c => c.ExportComponent) },
      // Contabilidad
      { path: 'messages',                   loadComponent: () => import('./messages/messages.component').then(c => c.MessagesComponent) },
      { path: 'accounting',                 redirectTo: 'accounting/income', pathMatch: 'full' },
      { path: 'accounting/income',          canActivate: [accountingReady], loadComponent: () => import('./accounting/income/income.component').then(c => c.IncomeComponent) },
      { path: 'accounting/expense',         canActivate: [accountingReady], loadComponent: () => import('./accounting/expense/expense.component').then(c => c.ExpenseComponent) },
      { path: 'accounting/movement',        canActivate: [accountingReady], loadComponent: () => import('./accounting/movement/movement.component').then(c => c.MovementComponent) },
      { path: 'accounting/movements',       canActivate: [accountingReady], loadComponent: () => import('./accounting/movements/movements.component').then(c => c.MovementsComponent) },
      { path: 'accounting/books',           canActivate: [accountingReady], loadComponent: () => import('./accounting/books/books.component').then(c => c.BooksComponent) },
      { path: 'accounting/ledger',          canActivate: [accountingReady], loadComponent: () => import('./accounting/ledger/ledger.component').then(c => c.LedgerComponent) },
      { path: 'accounting/balance',         canActivate: [accountingReady], loadComponent: () => import('./accounting/balance/balance.component').then(c => c.BalanceComponent) },
      { path: 'accounting/statements',      canActivate: [accountingReady], loadComponent: () => import('./accounting/statements/statements.component').then(c => c.StatementsComponent) },
      { path: 'accounting/indicators',      canActivate: [accountingReady], loadComponent: () => import('./accounting/indicators/indicators.component').then(c => c.IndicatorsComponent) },
      { path: 'accounting/integration',     canActivate: [accountingReady], loadComponent: () => import('./accounting/integration/integration.component').then(c => c.IntegrationComponent) },
      { path: 'accounting/export',          canActivate: [accountingReady], loadComponent: () => import('./accounting/export/export.component').then(c => c.ExportComponent) },
      { path: 'accounting/accounts',        canActivate: [accountingReady], loadComponent: () => import('./accounting/accounts/accounts.component').then(c => c.AccountsComponent) },
      // Nómina y Restaurante se cargan bajo demanda para no inflar el bundle inicial
      // Nómina
      { path: 'payroll',                                   redirectTo: 'payroll/employees', pathMatch: 'full' },
      { path: 'payroll/employees',                         loadComponent: () => import('./payroll/employees/employees.component').then(c => c.EmployeesComponent) },
      { path: 'payroll/employees/new',                     loadComponent: () => import('./payroll/employee-form/employee-form.component').then(c => c.EmployeeFormComponent) },
      { path: 'payroll/employees/:id',                     loadComponent: () => import('./payroll/employee-form/employee-form.component').then(c => c.EmployeeFormComponent) },
      { path: 'payroll/liquidation',                       loadComponent: () => import('./payroll/liquidation/liquidation.component').then(c => c.LiquidationComponent) },
      { path: 'payroll/liquidation/:runId/:employeeId',    loadComponent: () => import('./payroll/liquidation/employee-deductions.component').then(c => c.EmployeeDeductionsComponent) },
      { path: 'payroll/payslips',                          loadComponent: () => import('./payroll/payslips/payslips.component').then(c => c.PayslipsComponent) },
      { path: 'payroll/runs',                              loadComponent: () => import('./payroll/runs/runs.component').then(c => c.RunsComponent) },
      { path: 'payroll/history',                           loadComponent: () => import('./payroll/history/history.component').then(c => c.HistoryComponent) },
      { path: 'payroll/reports',                           loadComponent: () => import('./payroll/payroll-report/payroll-report.component').then(c => c.PayrollReportComponent) },
      { path: 'payroll/costs',                             loadComponent: () => import('./payroll/payroll-costs/payroll-costs.component').then(c => c.PayrollCostsComponent) },
      // Restaurante: desactivado. El hospedaje no vende comidas ni bebidas; presta la cocina
      // con su dotación (Inventarios › Dotación de la casa). Ver restaurant/ para retomar el código.
      // Facturación
      { path: 'billing',                component: InvoiceListComponent,     canActivate: [billingPermission('Consultar facturas')] },
      { path: 'billing/new',            component: InvoiceNewComponent,      canActivate: [billingPermission('Generar factura')] },
      { path: 'billing/reports',        component: InvoiceReportsComponent,  canActivate: [billingPermission('Generar reportes')] },
      { path: 'billing/settings',       component: BillingSettingsComponent, canActivate: [billingPermission('Configurar integración')] },
      { path: 'billing/:id',            component: InvoiceDetailComponent,   canActivate: [billingPermission('Consultar facturas')] },
      { path: 'billing/:id/corregir',   component: InvoiceNewComponent,      canActivate: [billingPermission('Validar datos fiscales')] },
      // TRA (:id = id de la reserva: la TRA cuelga de ella)
      { path: 'tra',                component: TraPanelComponent },
      { path: 'tra/config',         component: TraConfigComponent },
      { path: 'tra/:id',            component: TraDetailComponent },
      { path: 'tra/:id/registro',   component: TraRegistrationComponent },
      { path: 'tra/:id/resumen',    component: TraSummaryComponent },
      // Alojamiento
      { path: 'lodging',                        component: LodgingListComponent },
      { path: 'lodging/rates',                  loadComponent: () => import('./lodging/rates/rates.component').then(c => c.RatesComponent) },
      // :id = id de la reserva (la estadía es parte de la reserva)
      { path: 'lodging/recepcion',              loadComponent: () => import('./lodging/front-desk/front-desk.component').then(c => c.FrontDeskComponent) },
      { path: 'lodging/checkin',                redirectTo: 'lodging/recepcion', pathMatch: 'full' },
      { path: 'lodging/:id/checkin',            component: CheckinFormComponent },
      { path: 'lodging/:id/checkin-confirm',    component: LodgingConfirmComponent, data: { kind: 'checkin' } },
      { path: 'lodging/:id/checkout',           component: CheckoutFormComponent },
      { path: 'lodging/:id/checkout-confirm',   component: LodgingConfirmComponent, data: { kind: 'checkout' } },
    ]
  },
  // Impresión / PDF de una factura: fuera del layout del dashboard para imprimir solo la factura
  { path: 'facturas/:id/imprimir', component: InvoicePrintComponent, canActivate: [authGuard, billingPermission('Descargar y enviar')] },
  { path: '**', redirectTo: '' }
];
