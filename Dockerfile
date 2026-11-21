# syntax=docker/dockerfile:1
# One Dockerfile builds any backend service: docker compose passes MODULE=patient-service, claims-service, ...

# ---------- 1) Build the jar ----------
FROM maven:3.9-eclipse-temurin-21 AS build
ARG MODULE
WORKDIR /workspace

# Copy the poms first so Maven's download step is cached between builds
COPY pom.xml .
COPY common/claimflow-events/pom.xml common/claimflow-events/pom.xml
COPY services/eureka-server/pom.xml services/eureka-server/pom.xml
COPY services/config-server/pom.xml services/config-server/pom.xml
COPY services/api-gateway/pom.xml services/api-gateway/pom.xml
COPY services/auth-service/pom.xml services/auth-service/pom.xml
COPY services/patient-service/pom.xml services/patient-service/pom.xml
COPY services/provider-service/pom.xml services/provider-service/pom.xml
COPY services/claims-service/pom.xml services/claims-service/pom.xml
COPY services/payment-service/pom.xml services/payment-service/pom.xml
COPY services/notification-service/pom.xml services/notification-service/pom.xml
COPY services/policy-assistant-service/pom.xml services/policy-assistant-service/pom.xml

COPY common common
COPY services services

# -pl = only this module, -am = plus what it depends on (claimflow-events)
RUN --mount=type=cache,target=/root/.m2 \
    mvn -q -B -pl services/${MODULE} -am package -DskipTests \
 && cp services/${MODULE}/target/${MODULE}-*.jar /workspace/app.jar

# ---------- 2) Small runtime image ----------
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/app.jar app.jar
ENV JAVA_OPTS="-Xms64m -Xmx256m"
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
