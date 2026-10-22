# =====================================================================
# Inicia el backend de SOGO (puerto 8081).
# Pide SIEMPRE la clave del usuario de MySQL `sogo_user` (no la de root) y
# la pasa solo a este proceso: no queda guardada en ningún archivo.
#
# Uso (desde cualquier terminal de PowerShell):
#   & "C:\Users\JUAN SEBASTIAN\OneDrive\Desktop\Proyecto SOGO\SOGO\backend\iniciar.ps1"
# =====================================================================
Set-Location -Path $PSScriptRoot

$ocupado = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue
if ($ocupado) {
    Write-Host "El puerto 8081 ya está en uso: el backend de SOGO probablemente ya está encendido en otra terminal." -ForegroundColor Yellow
    return
}

# SOGO siempre entra con sogo_user: si en esta terminal quedó DB_USERNAME de otro proyecto
# (p. ej. hotel_user de la página web), no se usa
$env:DB_USERNAME = 'sogo_user'
Remove-Item Env:DB_URL -ErrorAction SilentlyContinue

# Siempre se pregunta: una clave equivocada de un intento anterior no se reutiliza
$segura = Read-Host -Prompt "Clave de MySQL para sogo_user (la del script 03, no la de root)" -AsSecureString
$env:DB_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))

if (-not $env:DB_PASSWORD) {
    Write-Host "No escribiste ninguna clave. Vuelve a ejecutar el script." -ForegroundColor Yellow
    return
}

# Se muestra todo en pantalla y se guarda una copia en arranque.log para revisar errores
mvn spring-boot:run 2>&1 | Tee-Object -FilePath "$PSScriptRoot\arranque.log"

$log = Get-Content "$PSScriptRoot\arranque.log" -Raw -ErrorAction SilentlyContinue
Remove-Item Env:DB_PASSWORD -ErrorAction SilentlyContinue
if ($log -match "Access denied for user 'sogo_user'") {
    Write-Host ""
    Write-Host "La clave de sogo_user no es correcta. Vuelve a ejecutar el script y escribe la clave del usuario sogo_user." -ForegroundColor Red
} elseif ($log -match "Communications link failure|Connection refused") {
    Write-Host ""
    Write-Host "MySQL no está encendido. Ábrelo (servicio MySQL80) y vuelve a ejecutar el script." -ForegroundColor Red
} elseif ($log -match "Port 8081 was already in use") {
    Write-Host ""
    Write-Host "El puerto 8081 está ocupado: cierra la otra terminal donde está el backend." -ForegroundColor Red
}
