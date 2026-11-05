// Producción: reemplaza a environment.ts al compilar con `ng build`.
// La API usa la dirección de Render: el plan de Render solo trae 2 dominios propios gratis
// (los usan la API de la página web y sogo-web). Si se agrega uno más, cambiar a
// https://sogo-api.hospedajesebastianfilandia.com y actualizar la redirección de Google.
export const environment = { apiRoot: 'https://sogo-api-1kq4.onrender.com' };
