import { bootstrapApplication } from '@angular/platform-browser';
import { importProvidersFrom } from '@angular/core';
import { AppComponent } from './app/app.component';
import { provideRouter } from '@angular/router';
import { routes } from './app/app-routing.module';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { AuthInterceptor } from './app/auth.interceptor';
import { NotifyInterceptor } from './app/shared/toast/notify.interceptor';

bootstrapApplication(AppComponent, {
  providers: [
    importProvidersFrom(HttpClientModule),
    provideRouter(routes),
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    // Avisos de éxito o error de lo que se guarda (esquina superior derecha)
    { provide: HTTP_INTERCEPTORS, useClass: NotifyInterceptor, multi: true },
  ]
}).catch(err => console.error(err));
