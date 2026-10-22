import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastsComponent } from './shared/toast/toasts.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastsComponent],
  template: `<div class="app"><div class="main"><router-outlet></router-outlet></div></div><app-toasts></app-toasts>`
})
export class AppComponent {}
