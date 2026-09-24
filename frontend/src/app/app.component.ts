import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<div class="app"><div class="main"><router-outlet></router-outlet></div></div>`
})
export class AppComponent {}
