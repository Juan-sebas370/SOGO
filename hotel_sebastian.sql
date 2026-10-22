-- MySQL dump 10.13  Distrib 8.0.38, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: hotel_sebastian
-- ------------------------------------------------------
-- Server version	8.0.39

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `contactos`
--

DROP TABLE IF EXISTS `contactos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contactos` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `asunto` varchar(200) NOT NULL,
  `categoria` varchar(50) DEFAULT NULL,
  `email` varchar(120) NOT NULL,
  `estado` varchar(30) DEFAULT NULL,
  `fecha_creacion` datetime DEFAULT CURRENT_TIMESTAMP,
  `fecha_modificacion` datetime(6) DEFAULT NULL,
  `fecha_respuesta` datetime(6) DEFAULT NULL,
  `mensaje` text NOT NULL,
  `nombre` varchar(120) NOT NULL,
  `prioridad` varchar(20) DEFAULT NULL,
  `respuesta` text,
  `telefono` varchar(30) DEFAULT NULL,
  `respondido_por` bigint DEFAULT NULL,
  `usuario_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FK1avre7enkcc1m2t2kta186ox9` (`respondido_por`),
  KEY `FKs2956ewen2qc2sqihww7qou5l` (`usuario_id`),
  CONSTRAINT `FK1avre7enkcc1m2t2kta186ox9` FOREIGN KEY (`respondido_por`) REFERENCES `empleados` (`id`),
  CONSTRAINT `FKs2956ewen2qc2sqihww7qou5l` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `empleados`
--

DROP TABLE IF EXISTS `empleados`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `empleados` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `activo` tinyint(1) DEFAULT '1',
  `apellido` varchar(120) DEFAULT NULL,
  `cargo` varchar(100) NOT NULL,
  `datos_bancarios` varchar(300) DEFAULT NULL,
  `departamento` varchar(50) DEFAULT NULL,
  `email` varchar(120) NOT NULL,
  `fecha_contratacion` date NOT NULL,
  `fecha_creacion` datetime DEFAULT CURRENT_TIMESTAMP,
  `fecha_modificacion` datetime(6) DEFAULT NULL,
  `fecha_terminacion` date DEFAULT NULL,
  `nombre` varchar(120) NOT NULL,
  `numero_empleado` varchar(20) DEFAULT NULL,
  `salario` decimal(12,2) DEFAULT NULL,
  `telefono` varchar(30) DEFAULT NULL,
  `turno` varchar(50) DEFAULT NULL,
  `usuario_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK_6fdpo2x5rmegfbngre7xb3yoh` (`email`),
  KEY `FKf5la9sef5mevf72dun7f2rxu4` (`usuario_id`),
  CONSTRAINT `FKf5la9sef5mevf72dun7f2rxu4` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `habitacion_imagenes`
--

DROP TABLE IF EXISTS `habitacion_imagenes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `habitacion_imagenes` (
  `habitacion_id` bigint NOT NULL,
  `imagenes` varchar(255) DEFAULT NULL,
  KEY `FKqkt2ddpjpbooglc7lymytdhr2` (`habitacion_id`),
  CONSTRAINT `FKqkt2ddpjpbooglc7lymytdhr2` FOREIGN KEY (`habitacion_id`) REFERENCES `habitaciones` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `habitacion_servicios`
--

DROP TABLE IF EXISTS `habitacion_servicios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `habitacion_servicios` (
  `habitacion_id` bigint NOT NULL,
  `servicios` varchar(255) DEFAULT NULL,
  KEY `FKjwivo6jmis4ox6cr04kwt0ley` (`habitacion_id`),
  CONSTRAINT `FKjwivo6jmis4ox6cr04kwt0ley` FOREIGN KEY (`habitacion_id`) REFERENCES `habitaciones` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `habitaciones`
--

DROP TABLE IF EXISTS `habitaciones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `habitaciones` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `bano` bit(1) DEFAULT NULL,
  `capacidad` int DEFAULT NULL,
  `climatizacion` bit(1) DEFAULT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `estado` varchar(255) DEFAULT NULL,
  `minibar` bit(1) DEFAULT NULL,
  `numero` varchar(255) DEFAULT NULL,
  `precio_noche` double DEFAULT NULL,
  `television` bit(1) DEFAULT NULL,
  `tipo` varchar(255) DEFAULT NULL,
  `wifi` bit(1) DEFAULT NULL,
  `piso` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `metodos_pago`
--

DROP TABLE IF EXISTS `metodos_pago`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `metodos_pago` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `activo` tinyint(1) DEFAULT '1',
  `comision_fija` decimal(10,2) DEFAULT NULL,
  `comision_porcentaje` decimal(5,2) DEFAULT NULL,
  `descripcion` varchar(200) DEFAULT NULL,
  `fecha_creacion` datetime DEFAULT CURRENT_TIMESTAMP,
  `fecha_modificacion` datetime(6) DEFAULT NULL,
  `icono_url` varchar(300) DEFAULT NULL,
  `nombre` varchar(50) NOT NULL,
  `requiere_verificacion` tinyint(1) DEFAULT '0',
  `tiempo_confirmacion` varchar(50) DEFAULT NULL,
  `tipo` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK_d69ifwea3k50xlwa2lgghqtia` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pagos`
--

DROP TABLE IF EXISTS `pagos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pagos` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `estado` varchar(50) NOT NULL,
  `fecha_creacion` datetime DEFAULT CURRENT_TIMESTAMP,
  `fecha_modificacion` datetime(6) DEFAULT NULL,
  `fecha_pago` datetime(6) DEFAULT NULL,
  `monto` decimal(10,2) NOT NULL,
  `numero_transaccion` varchar(100) DEFAULT NULL,
  `referencia_banco` varchar(100) DEFAULT NULL,
  `metodo_pago_id` bigint DEFAULT NULL,
  `reserva_id` bigint NOT NULL,
  `usuario_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FK2wxxn0u28jwprfqh2t0u5gvsc` (`metodo_pago_id`),
  KEY `FKrd490715qtq2imjqrn0rwyhsl` (`reserva_id`),
  KEY `FKnv3skx0qnku57yljq0bu88oot` (`usuario_id`),
  CONSTRAINT `FK2wxxn0u28jwprfqh2t0u5gvsc` FOREIGN KEY (`metodo_pago_id`) REFERENCES `metodos_pago` (`id`),
  CONSTRAINT `FKnv3skx0qnku57yljq0bu88oot` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `FKrd490715qtq2imjqrn0rwyhsl` FOREIGN KEY (`reserva_id`) REFERENCES `reservas` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `paquetes`
--

DROP TABLE IF EXISTS `paquetes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `paquetes` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `activo` tinyint(1) DEFAULT '1',
  `capacidad_maxima` int DEFAULT NULL,
  `descripcion` text,
  `descuento_porcentaje` int DEFAULT NULL,
  `disponible` tinyint(1) DEFAULT '1',
  `fecha_creacion` datetime DEFAULT CURRENT_TIMESTAMP,
  `fecha_fin` date DEFAULT NULL,
  `fecha_inicio` date DEFAULT NULL,
  `fecha_modificacion` datetime(6) DEFAULT NULL,
  `imagen_url` varchar(300) DEFAULT NULL,
  `incluye_servicios` text,
  `noches_minimas` int DEFAULT NULL,
  `nombre` varchar(150) NOT NULL,
  `precio_por_noche` decimal(10,2) DEFAULT NULL,
  `precio_total` decimal(12,2) NOT NULL,
  `servicios_incuidos_ids` varchar(500) DEFAULT NULL,
  `tipo` varchar(50) DEFAULT NULL,
  `validez_meses` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `promociones`
--

DROP TABLE IF EXISTS `promociones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `promociones` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `activo` tinyint(1) DEFAULT '1',
  `aplicable_habitaciones` tinyint(1) DEFAULT '1',
  `aplicable_servicios` tinyint(1) DEFAULT '1',
  `codigo` varchar(50) NOT NULL,
  `descripcion` varchar(300) DEFAULT NULL,
  `fecha_creacion` datetime DEFAULT CURRENT_TIMESTAMP,
  `fecha_fin` date NOT NULL,
  `fecha_inicio` date NOT NULL,
  `fecha_modificacion` datetime(6) DEFAULT NULL,
  `minimo_reserva` decimal(10,2) DEFAULT NULL,
  `porcentaje_descuento` int DEFAULT NULL,
  `tipo_descuento` varchar(20) DEFAULT NULL,
  `usos_actuales` int DEFAULT NULL,
  `usos_limitados` int DEFAULT NULL,
  `valor_descuento` decimal(10,2) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK_fy1j1ox2d9jnv5cqvxl00bqav` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `reserva_habitaciones`
--

DROP TABLE IF EXISTS `reserva_habitaciones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reserva_habitaciones` (
  `reserva_id` bigint NOT NULL,
  `habitacion_id` bigint DEFAULT NULL,
  KEY `FKjfn49pus79y8u0se9reion6rt` (`reserva_id`),
  CONSTRAINT `FKjfn49pus79y8u0se9reion6rt` FOREIGN KEY (`reserva_id`) REFERENCES `reservas` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `reservas`
--

DROP TABLE IF EXISTS `reservas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reservas` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `codigo_pais` varchar(255) DEFAULT NULL,
  `estado` varchar(255) DEFAULT NULL,
  `fecha_creacion` datetime(6) DEFAULT NULL,
  `fecha_ingreso` date DEFAULT NULL,
  `fecha_modificacion` datetime(6) DEFAULT NULL,
  `fecha_salida` date DEFAULT NULL,
  `habitacion_id` bigint DEFAULT NULL,
  `huespedes` int DEFAULT NULL,
  `noches` int DEFAULT NULL,
  `nombre_huesped` varchar(255) DEFAULT NULL,
  `numero_documento` varchar(255) DEFAULT NULL,
  `observaciones` varchar(255) DEFAULT NULL,
  `pais` varchar(255) DEFAULT NULL,
  `precio_noche` double DEFAULT NULL,
  `precio_total` double DEFAULT NULL,
  `telefono_contacto` varchar(255) DEFAULT NULL,
  `tipo_documento` varchar(255) DEFAULT NULL,
  `usuario_id` bigint DEFAULT NULL,
  `apellido_huesped` varchar(255) DEFAULT NULL,
  `email_contacto` varchar(255) DEFAULT NULL,
  `espacio` varchar(255) DEFAULT NULL,
  `modo_espacio` varchar(255) DEFAULT NULL,
  `ninos10` int DEFAULT NULL,
  `ninos11` int DEFAULT NULL,
  `ninos3` int DEFAULT NULL,
  `temporada` varchar(255) DEFAULT NULL,
  `tipo_reserva` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `usuarios`
--

DROP TABLE IF EXISTS `usuarios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuarios` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `activo` bit(1) DEFAULT NULL,
  `apellido` varchar(255) DEFAULT NULL,
  `cedula_identidad` varchar(255) DEFAULT NULL,
  `ciudad` varchar(255) DEFAULT NULL,
  `codigo_pais` varchar(255) DEFAULT NULL,
  `direccion` varchar(255) DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `fecha_registro` datetime(6) DEFAULT NULL,
  `nombre` varchar(255) DEFAULT NULL,
  `pais` varchar(255) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `reset_token` varchar(255) DEFAULT NULL,
  `reset_token_expiry` datetime(6) DEFAULT NULL,
  `rol` varchar(255) DEFAULT NULL,
  `telefono` varchar(255) DEFAULT NULL,
  `tipo_documento` varchar(255) DEFAULT NULL,
  `ultima_conexion` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK_kfsp0s1tflm1cwlj8idhqsad0` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-29 10:04:04
