import { Component } from '@angular/core';

@Component({
  selector: 'app-dashboard-profile',
  standalone: true,
  styleUrls: ['./dashboard-profile.component.css'],
  template: `
  <section class="dash-card">
    <h2 class="dash-card-title">Perfil</h2>
    <p class="dash-card-text">Información de la sesión con la que iniciaste sesión en SOGO.</p>
    <div class="dash-profile-fields">
      <div>
        <span class="dash-card-label">Usuario</span>
        <span class="dash-card-value">{{ username }}</span>
      </div>
      <div>
        <span class="dash-card-label">Rol</span>
        <span class="dash-card-value">{{ role }}</span>
      </div>
    </div>
  </section>
  `
})
export class DashboardProfileComponent {
  username = localStorage.getItem('sogo_username') || 'Usuario';
  role = localStorage.getItem('sogo_role') || 'Sin rol asignado';
}
