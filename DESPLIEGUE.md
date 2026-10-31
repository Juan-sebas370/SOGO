# Despliegue de SOGO

SOGO y la página web no se conectan entre sí: las dos usan **la misma base de Aiven**.

```text
hospedajesebastianfilandia.com           → página web (Render, ya desplegada)
sogo.hospedajesebastianfilandia.com      → sogo-web (Render, sitio estático)
sogo-api.hospedajesebastianfilandia.com  → sogo-api (Render, Docker)
                 hospedaje-sebastian-api y sogo-api → misma base en Aiven
```

> **Nunca cargues la base local en Aiven:** borrarías las reservas y los usuarios reales.
> Aiven es la base oficial; solo se le agrega lo de SOGO.

## 1. Antes de empezar

Reemplaza `HOST`, `PUERTO` y `BASE` con los datos de Aiven → *Connection information*
(la base suele llamarse `defaultdb`; `hotel-sebastian` es el nombre del servicio).

Saca un respaldo y guárdalo **fuera del repositorio** (tiene datos personales):

```bash
mysqldump -h HOST -P PUERTO -u avnadmin -p --ssl-mode=REQUIRED --single-transaction --set-gtid-purged=OFF BASE > respaldo-antes-de-sogo.sql
```

Revisa la configuración y el espacio disponible:

```sql
SELECT @@sql_require_primary_key, @@log_bin_trust_function_creators;
SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 1) AS MB FROM information_schema.tables WHERE table_schema = DATABASE();
```

## 2. Preparar Aiven

1. En *Advanced configuration*, activa `log_bin_trust_function_creators`. Sin esto no se crean los
   triggers (error 1419) y las reservas de la web quedarían sin código ni huésped.
2. Crea el usuario `sogo_user` en *Users*, con clave nueva. Luego dale solo permisos de datos:

   ```sql
   GRANT SELECT, INSERT, UPDATE, DELETE ON `BASE`.* TO 'sogo_user'@'%';
   ```

## 3. Aplicar los scripts

Hazlo en un horario sin reservas. Los archivos están en `database/produccion/` y se generan con
`node database/generar-paquete-produccion.mjs`.

```bash
mysql -h HOST -P PUERTO -u avnadmin -p --ssl-mode=REQUIRED --default-character-set=utf8mb4 BASE < database/produccion/0_revision_previa.sql
```

Cada consulta de esa revisión debe volver vacía. Si alguna trae filas, **detente** y corrígelas.

```bash
mysql -h HOST -P PUERTO -u avnadmin -p --ssl-mode=REQUIRED --default-character-set=utf8mb4 BASE < database/produccion/1_estructura_sogo.sql
```

El archivo `1_estructura_sogo.sql` se ejecuta **una sola vez**. Si falla a mitad, no lo repitas:
restaura el respaldo y revisa el error.

Después, comprueba que la página sigue funcionando.

## 4. Crear los servicios en Render

En Render: **New → Blueprint** → repositorio `SOGO` (usa `render.yaml`). Te pedirá:

| Variable | Valor |
|---|---|
| `DB_URL` | `jdbc:mysql://HOST:PUERTO/BASE?sslMode=REQUIRED&serverTimezone=America/Bogota&characterEncoding=UTF-8` |
| `DB_USERNAME` | `sogo_user` |
| `DB_PASSWORD` | la clave del paso 2 |
| `RESEND_API_KEY` | una clave de Resend (el dominio ya está verificado para la web) |
| `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` | credenciales de Google (paso 6) |

`JWT_SECRET` la genera Render. **No uses la misma de la página web.**

## 5. Conectar el dominio en Cloudflare

1. En cada servicio de Render: *Settings → Custom Domains*. Agrega
   `sogo.hospedajesebastianfilandia.com` en `sogo-web` y `sogo-api.hospedajesebastianfilandia.com` en `sogo-api`.
2. En Cloudflare → *DNS*, crea estos registros en modo **DNS only** (nube gris) hasta que Render emita el certificado:

| Tipo | Nombre | Destino |
|---|---|---|
| CNAME | `sogo` | dirección `.onrender.com` de `sogo-web` |
| CNAME | `sogo-api` | dirección `.onrender.com` de `sogo-api` |

## 6. Configurar Google

En Google Cloud → *Credentials*, autoriza esta dirección de redirección:

`https://sogo-api.hospedajesebastianfilandia.com/login/oauth2/code/google`

## 7. Crear el administrador

1. Abre `database/produccion/2_administrador.sql` y pon el correo real (buzón al que tengas acceso).
2. Ejecútalo como en el paso 3.
3. Abre el enlace que imprime y define la contraseña (vale 24 horas).

## 8. Comprobar

- [ ] Una reserva hecha en la página aparece en SOGO con su código `RSV-...`.
- [ ] Una reserva hecha en SOGO bloquea esa habitación en la página.
- [ ] Un cliente de la página no puede entrar a SOGO ("sin acceso a SOGO").
- [ ] Pago, check-in, factura y comprobante quedan registrados.
- [ ] El correo de recuperación de contraseña llega.
- [ ] Fechas y horas en hora de Colombia, también después de las 7 p. m.
- [ ] Ingreso con Google.

## Limitaciones conocidas

**Plan gratis de Render** (`sogo-api`, se cambia con `plan:` en `render.yaml`):

- Se duerme sin uso: no corren respaldos, reportes automáticos ni alertas, y la primera visita tarda.
- Pierde los archivos al reiniciar: los respaldos de **Configuración › Auditoría y respaldos** hay que
  descargarlos o sacarlos con `mysqldump`.

**Aiven gratis (1 GB):** los soportes contables se guardan dentro de la base. Vigila el espacio.

**Página web:**

- Corre en UTC. Sus reservas se ven en SOGO con `fecha_creacion` 5 horas adelante hasta agregar
  `-Duser.timezone=America/Bogota` en su Dockerfile.
- En su `render.yaml`, `RESERVAS_HABILITADAS` está en `false`: cámbialo a `true` al abrir las reservas.
- Una reserva `NO_PRESENTADA` sigue bloqueando la habitación en la página, aunque en SOGO ya no ocupa.

**DIAN y TRA:** se manejan a mano. SOGO emite la factura y registra el CUFE; la TRA se reporta en la
plataforma del MinCIT y se registra el número.
