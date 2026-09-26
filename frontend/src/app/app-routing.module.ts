import { Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { OAuthCallbackComponent } from './oauth-callback/oauth-callback.component';
import { ResetRequestComponent } from './reset-request/reset-request.component';
import { ResetComponent } from './reset/reset.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { DashboardHomeComponent } from './dashboard-home/dashboard-home.component';
import { DashboardProfileComponent } from './dashboard-profile/dashboard-profile.component';
import { ReservationsListComponent } from './reservations/reservations-list/reservations-list.component';
import { ReservationFormComponent } from './reservations/reservation-form/reservation-form.component';
import { ReservationDetailComponent } from './reservations/reservation-detail/reservation-detail.component';
import { SettingsComponent } from './settings/settings.component';
import { UserListComponent } from './users/user-list/user-list.component';
import { UserFormComponent } from './users/user-form/user-form.component';
import { RolesComponent } from './users/roles/roles.component';
import { RolePermissionsComponent } from './users/role-permissions/role-permissions.component';
import { AuditLogComponent } from './users/audit-log/audit-log.component';
import { ReportsDashboardComponent } from './reports/reports-dashboard/reports-dashboard.component';
import { ReportGeneratorComponent } from './reports/report-generator/report-generator.component';
import { ReportsStatsComponent } from './reports/reports-stats/reports-stats.component';
import { ProductListComponent } from './inventory/product-list/product-list.component';
import { ProductFormComponent } from './inventory/product-form/product-form.component';
import { InventoryEntryComponent } from './inventory/inventory-entry/inventory-entry.component';
import { InventoryReportsComponent } from './inventory/inventory-reports/inventory-reports.component';
import { InventoryAlertsComponent } from './inventory/inventory-alerts/inventory-alerts.component';
import { VoucherListComponent } from './accounting/voucher-list/voucher-list.component';
import { VoucherFormComponent } from './accounting/voucher-form/voucher-form.component';
import { JournalComponent } from './accounting/journal/journal.component';
import { IncomeStatementComponent } from './accounting/income-statement/income-statement.component';
import { AccountingReportsComponent } from './accounting/accounting-reports/accounting-reports.component';
import { PayrollListComponent } from './payroll/payroll-list/payroll-list.component';
import { PayrollNewComponent } from './payroll/payroll-new/payroll-new.component';
import { PayrollLiquidationComponent } from './payroll/payroll-liquidation/payroll-liquidation.component';
import { PayrollPreviewComponent } from './payroll/payroll-preview/payroll-preview.component';
import { PayrollConfirmComponent } from './payroll/payroll-confirm/payroll-confirm.component';
import { OrderListComponent } from './restaurant/order-list/order-list.component';
import { OrderFormComponent } from './restaurant/order-form/order-form.component';
import { OrderDetailComponent } from './restaurant/order-detail/order-detail.component';
import { TablesComponent } from './restaurant/tables/tables.component';
import { RestaurantReportsComponent } from './restaurant/restaurant-reports/restaurant-reports.component';
import { InvoiceListComponent } from './billing/invoice-list/invoice-list.component';
import { InvoiceFormComponent } from './billing/invoice-form/invoice-form.component';
import { InvoiceDetailComponent } from './billing/invoice-detail/invoice-detail.component';
import { InvoiceSendComponent } from './billing/invoice-send/invoice-send.component';
import { InvoiceReportsComponent } from './billing/invoice-reports/invoice-reports.component';
import { TraPanelComponent } from './tra/tra-panel/tra-panel.component';
import { TraRegistrationComponent } from './tra/tra-registration/tra-registration.component';
import { TraSummaryComponent } from './tra/tra-summary/tra-summary.component';
import { TraDetailComponent } from './tra/tra-detail/tra-detail.component';
import { TraConfigComponent } from './tra/tra-config/tra-config.component';
import { LodgingListComponent } from './lodging/lodging-list/lodging-list.component';
import { CheckinFormComponent } from './lodging/checkin-form/checkin-form.component';
import { CheckinConfirmComponent } from './lodging/checkin-confirm/checkin-confirm.component';
import { CheckoutFormComponent } from './lodging/checkout-form/checkout-form.component';
import { CheckoutConfirmComponent } from './lodging/checkout-confirm/checkout-confirm.component';
import { authGuard } from './auth.guard';
import { roleGuard } from './role.guard';
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
    children: [
      { path: '',                       component: DashboardHomeComponent },
      { path: 'profile',                component: DashboardProfileComponent },
      { path: 'reservations',           component: ReservationsListComponent },
      { path: 'reservations/new',       component: ReservationFormComponent },
      { path: 'reservations/:id',       component: ReservationDetailComponent },
      { path: 'reservations/:id/edit',  component: ReservationFormComponent },
      // Configuración
      { path: 'settings', component: SettingsComponent },
      // Acceso denegado
      { path: 'access-denied', component: AccessDeniedComponent },
      // Usuarios y Roles (solo Administrador)
      { path: 'users',                                  component: UserListComponent,        canActivate: [roleGuard(['Administrador'])] },
      { path: 'users/list',                             component: UserListComponent,        canActivate: [roleGuard(['Administrador'])] },
      { path: 'users/new',                              component: UserFormComponent,        canActivate: [roleGuard(['Administrador'])] },
      { path: 'users/:id',                              component: UserFormComponent,        canActivate: [roleGuard(['Administrador'])] },
      { path: 'users/:id/edit',                         component: UserFormComponent,        canActivate: [roleGuard(['Administrador'])] },
      { path: 'users/roles',                            component: RolesComponent,           canActivate: [roleGuard(['Administrador'])] },
      { path: 'users/roles/:id/permissions',            component: RolePermissionsComponent, canActivate: [roleGuard(['Administrador'])] },
      { path: 'users/audit',                            component: AuditLogComponent,        canActivate: [roleGuard(['Administrador'])] },
      // Reportes
      { path: 'reports',                component: ReportsDashboardComponent },
      { path: 'reports/generator',      component: ReportGeneratorComponent },
      { path: 'reports/stats',          component: ReportsStatsComponent },
      // Inventarios
      { path: 'inventory',                          component: ProductListComponent },
      { path: 'inventory/products',                 component: ProductListComponent },
      { path: 'inventory/products/new',             component: ProductFormComponent },
      { path: 'inventory/products/:id',             component: ProductFormComponent },
      { path: 'inventory/products/:id/edit',        component: ProductFormComponent },
      { path: 'inventory/entry',                    component: InventoryEntryComponent },
      { path: 'inventory/reports',                  component: InventoryReportsComponent },
      { path: 'inventory/alerts',                   component: InventoryAlertsComponent },
      // Contabilidad
      { path: 'accounting',                            component: VoucherListComponent },
      { path: 'accounting/vouchers',                   component: VoucherListComponent },
      { path: 'accounting/vouchers/new',               component: VoucherFormComponent },
      { path: 'accounting/vouchers/:id',               component: VoucherListComponent },
      { path: 'accounting/vouchers/:id/edit',          component: VoucherFormComponent },
      { path: 'accounting/journal',                    component: JournalComponent },
      { path: 'accounting/books',                      component: JournalComponent },
      { path: 'accounting/income-statement',           component: IncomeStatementComponent },
      { path: 'accounting/reports',                    component: AccountingReportsComponent },
      // Nómina
      { path: 'payroll',                           component: PayrollListComponent },
      { path: 'payroll/new',                       component: PayrollNewComponent },
      { path: 'payroll/:id',                       component: PayrollLiquidationComponent },
      { path: 'payroll/:id/liquidation',           component: PayrollLiquidationComponent },
      { path: 'payroll/:id/preview',               component: PayrollPreviewComponent },
      { path: 'payroll/:id/confirm',               component: PayrollConfirmComponent },
      // Restaurante
      { path: 'restaurant',                       component: OrderListComponent },
      { path: 'restaurant/orders',                component: OrderListComponent },
      { path: 'restaurant/orders/new',            component: OrderFormComponent },
      { path: 'restaurant/orders/:id',            component: OrderDetailComponent },
      { path: 'restaurant/orders/:id/edit',       component: OrderFormComponent },
      { path: 'restaurant/tables',                component: TablesComponent },
      { path: 'restaurant/reports',               component: RestaurantReportsComponent },
      // Facturación
      { path: 'billing',                component: InvoiceListComponent },
      { path: 'billing/new',            component: InvoiceFormComponent },
      { path: 'billing/reports',        component: InvoiceReportsComponent },
      { path: 'billing/:id',            component: InvoiceDetailComponent },
      { path: 'billing/:id/edit',       component: InvoiceFormComponent },
      { path: 'billing/:id/send',       component: InvoiceSendComponent },
      // TRA (:id = id de la reserva: la TRA cuelga de ella)
      { path: 'tra',                component: TraPanelComponent },
      { path: 'tra/config',         component: TraConfigComponent },
      { path: 'tra/:id',            component: TraDetailComponent },
      { path: 'tra/:id/registro',   component: TraRegistrationComponent },
      { path: 'tra/:id/resumen',    component: TraSummaryComponent },
      // Alojamiento
      { path: 'lodging',                        component: LodgingListComponent },
      { path: 'lodging/checkin',                component: CheckinFormComponent },
      { path: 'lodging/:id',                    component: LodgingListComponent },
      { path: 'lodging/:id/checkin',            component: CheckinFormComponent },
      { path: 'lodging/:id/checkin-confirm',    component: CheckinConfirmComponent },
      { path: 'lodging/:id/checkout',           component: CheckoutFormComponent },
      { path: 'lodging/:id/checkout-confirm',   component: CheckoutConfirmComponent },
    ]
  },
  { path: '**', redirectTo: '' }
];
