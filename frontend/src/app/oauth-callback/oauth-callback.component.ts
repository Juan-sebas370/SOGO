import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-oauth-callback',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:12px;font-family:'Poppins',sans-serif;">
    <p *ngIf="!error">Iniciando sesión…</p>
    <ng-container *ngIf="error">
      <p>No fue posible completar el inicio de sesión ({{ error }}).</p>
      <a routerLink="/">Volver al login</a>
    </ng-container>
  </div>
  `
})
export class OAuthCallbackComponent implements OnInit {
  error = '';

  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const token = params.get('token');
    const role = params.get('role');
    const username = params.get('username');

    if (!token) {
      this.error = params.get('oauthError') || 'token faltante';
      return;
    }

    localStorage.setItem('sogo_token', token);
    localStorage.setItem('sogo_role', role || '');
    localStorage.setItem('sogo_username', username || '');
    this.router.navigate(['/dashboard']);
  }
}
