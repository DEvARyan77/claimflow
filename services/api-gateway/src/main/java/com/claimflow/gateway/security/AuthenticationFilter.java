package com.claimflow.gateway.security;

import com.claimflow.security.JwtCodec;
import com.claimflow.security.JwtCodec.UserClaims;
import com.claimflow.security.Roles;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Runs before every route:
 *  1. removes any X-User-* headers the caller sent (only the gateway may set them)
 *  2. checks the "Authorization: Bearer <token>" login token
 *  3. asks AccessRules whether this role may call this path
 *  4. forwards the request with X-User-Id / X-User-Role / X-Patient-Id / X-Provider-Id added
 */
@Component
public class AuthenticationFilter implements GlobalFilter, Ordered {

    private final JwtCodec jwt;

    public AuthenticationFilter(@Value("${claimflow.auth.jwt-secret}") String secret) {
        this.jwt = new JwtCodec(secret);
    }

    @Override
    public int getOrder() {
        return -100;   // before routing
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        if (request.getMethod() == HttpMethod.OPTIONS) {
            return chain.filter(exchange);   // CORS pre-flight
        }
        String path = request.getPath().pathWithinApplication().value();
        String method = request.getMethod().name();

        UserClaims user = bearer(request).flatMap(jwt::verify).orElse(null);
        return switch (AccessRules.decide(method, path, user)) {
            case NOT_FOUND -> reject(exchange, HttpStatus.NOT_FOUND, "Not found");
            case LOGIN_REQUIRED -> reject(exchange, HttpStatus.UNAUTHORIZED, "Please sign in");
            case FORBIDDEN -> reject(exchange, HttpStatus.FORBIDDEN, "You don't have access to this");
            case ALLOW -> chain.filter(exchange.mutate().request(withUserHeaders(request, user)).build());
        };
    }

    private static java.util.Optional<String> bearer(ServerHttpRequest request) {
        String header = request.getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
        return header != null && header.startsWith("Bearer ")
                ? java.util.Optional.of(header.substring(7).trim())
                : java.util.Optional.empty();
    }

    private static ServerHttpRequest withUserHeaders(ServerHttpRequest request, UserClaims user) {
        return request.mutate().headers(h -> {
            // never trust these from outside
            h.remove(Roles.HEADER_USER_ID);
            h.remove(Roles.HEADER_ROLE);
            h.remove(Roles.HEADER_NAME);
            h.remove(Roles.HEADER_PATIENT_ID);
            h.remove(Roles.HEADER_PROVIDER_ID);
            if (user == null) return;
            h.set(Roles.HEADER_USER_ID, user.userId());
            h.set(Roles.HEADER_ROLE, user.role());
            // header values must be ASCII; names can have any letter, so they travel URL-encoded
            if (user.name() != null) h.set(Roles.HEADER_NAME, URLEncoder.encode(user.name(), StandardCharsets.UTF_8));
            if (user.patientId() != null) h.set(Roles.HEADER_PATIENT_ID, user.patientId());
            if (user.providerId() != null) h.set(Roles.HEADER_PROVIDER_ID, user.providerId());
        }).build();
    }

    private static Mono<Void> reject(ServerWebExchange exchange, HttpStatus status, String message) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(status);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        byte[] body = ("{\"status\":" + status.value() + ",\"message\":\"" + message + "\"}").getBytes(StandardCharsets.UTF_8);
        DataBuffer buffer = response.bufferFactory().wrap(body);
        return response.writeWith(Mono.just(buffer));
    }
}
