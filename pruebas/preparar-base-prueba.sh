#!/usr/bin/env bash
# =====================================================================
# SOGO · Prepara desde cero la base de datos de PRUEBA (MySQL en el puerto 3307).
# Nunca toca la base real (3306). Deja en pantalla el token del administrador de prueba.
#
#   Uso:  bash pruebas/preparar-base-prueba.sh
#   Requisitos: un mysqld de prueba escuchando en 127.0.0.1:3307 con root sin clave.
# =====================================================================
set -euo pipefail

PORT="${QA_DB_PORT:-3307}"
[ "$PORT" = "3306" ] && { echo "No se prepara la base real (3306)."; exit 1; }

MYSQL="${MYSQL_BIN:-/c/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL() { "$MYSQL" -uroot -h127.0.0.1 -P"$PORT" --default-character-set=utf8mb4 "$@"; }

SQL -e "DROP DATABASE IF EXISTS hotel_sebastian; CREATE DATABASE hotel_sebastian CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
SQL hotel_sebastian < "$ROOT/hotel_sebastian.sql"                       # tablas que crea la página web
for f in $(ls "$ROOT/database" | grep -E '^(0[1-9]|1[0-9]|2[0-9])' | grep -v -E '^(01b|22)_' | sort); do
  SQL hotel_sebastian < "$ROOT/database/$f" > /dev/null                # 01b es reparación manual; 22 es verificación
done
SQL -e "ALTER USER 'sogo_user'@'localhost' IDENTIFIED BY 'Admin123'"          # clave solo de este MySQL de prueba
SQL hotel_sebastian < "$ROOT/pruebas/datos/habitaciones_prueba.sql"     # habitaciones (en producción las crea la web)
SQL hotel_sebastian < "$ROOT/database/04_datos_habitaciones.sql" > /dev/null

# Administrador de prueba: el enlace que entrega el script 05 trae el token para fijar su clave
TOKEN=$(SQL -N hotel_sebastian < "$ROOT/database/05_crear_administrador.sql" | grep -o 'token=[0-9a-f-]*' | cut -d= -f2)
echo "QA_RESET_TOKEN=$TOKEN"
