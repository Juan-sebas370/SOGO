# Backend de SOGO (Spring Boot, Java 17). Se construye en Render con render.yaml.

# 1. Compilación
FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B clean package -DskipTests

# 2. Ejecución
FROM eclipse-temurin:17-jre-alpine
RUN adduser -D sogo
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
RUN chown -R sogo /app
USER sogo

# Render asigna el puerto con la variable PORT (application.properties: server.port=${PORT:8081})
EXPOSE 8081

# Hora de Colombia: el servidor está en UTC y SOGO usa la fecha del sistema (después de las 7 p. m. sería "mañana").
# 512 MB en el plan gratis: heap limitado y el recolector de basura más liviano.
ENV JAVA_TOOL_OPTIONS="-Duser.timezone=America/Bogota -XX:MaxRAMPercentage=70 -XX:+UseSerialGC -Xss512k -XX:TieredStopAtLevel=1"

CMD ["java", "-jar", "app.jar"]
