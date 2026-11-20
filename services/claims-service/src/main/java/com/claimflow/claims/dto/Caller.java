package com.claimflow.claims.dto;

import com.claimflow.security.Roles;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

/**
 * Who is calling, from the X-User-* headers the gateway adds after checking the login token.
 * Internal calls (another service, or tests) come without headers: role is then null.
 */
public record Caller(String userId, String role, String name, String patientId, String providerId) {

    public static Caller of(String userId, String role, String name, String patientId, String providerId) {
        String decoded = name == null ? null : URLDecoder.decode(name, StandardCharsets.UTF_8);
        return new Caller(userId, role, decoded, patientId, providerId);
    }

    public boolean isInternal() {
        return role == null;
    }

    public boolean isPolicyholder() {
        return Roles.POLICYHOLDER.equals(role);
    }

    public boolean isHospital() {
        return Roles.HOSPITAL.equals(role);
    }

    public boolean isStaff() {
        return Roles.isStaff(role);
    }
}
