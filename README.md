# SOGO
# SOGO

Proyecto SOGO - Software de Gestión Operativa para Hospedajes

## Sprint 1 - Resumen

Objetivo: Entregar la base funcional mínima de SOGO: scaffolds frontend/backend, módulo de autenticación (login, logout, recuperación de contraseña) y mockup del panel principal.

Duración propuesta: 2 semanas (2026-07-22 → 2026-08-04)

Contenido creado en este commit:
- Scaffold mínimo del backend en `backend/` (Spring Boot - endpoints de autenticación).
- Mockup frontend estático en `frontend-mockup/` (HTML/CSS/JS) que consume los endpoints de autenticación.

Instrucciones rápidas:

- Backend: entrar a `SOGO/backend` y construir con Maven (requiere JDK + Maven):

```powershell
cd SOGO/backend
mvn package
mvn spring-boot:run
```

Notas de desarrollo backend:
- La API de autenticación ahora devuelve un JWT que debes incluir en la cabecera `Authorization: Bearer <token>` para acceder a endpoints protegidos como `/api/dashboard-summary`.
- Token y expiración están controlados por `app.jwt.secret` y `app.jwt.expiration-minutes` en `application.properties`.
- Para pruebas locales se usa una base H2 en memoria. Para producción configura MySQL en `application.properties`.

- Frontend mockup: abrir `SOGO/frontend-mockup/index.html` en el navegador. El mockup realiza llamadas a `http://localhost:8080/api/auth`.

Notas:
- El scaffold backend es intencionalmente ligero para facilitar pruebas locales; en desarrollo posterior se puede integrar Spring Security, JWT real y envío de correos (Mailtrap) para la recuperación de contraseña.
- Si prefieres que cree el proyecto Angular real con `ng new`, indícalo y lo genero (requiere Node.js + Angular CLI).
