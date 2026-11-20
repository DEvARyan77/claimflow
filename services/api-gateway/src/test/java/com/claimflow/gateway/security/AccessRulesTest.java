package com.claimflow.gateway.security;

import com.claimflow.gateway.security.AccessRules.Decision;
import com.claimflow.security.JwtCodec.UserClaims;
import org.junit.jupiter.api.Test;

import static com.claimflow.gateway.security.AccessRules.Decision.*;
import static com.claimflow.gateway.security.AccessRules.decide;
import static org.assertj.core.api.Assertions.assertThat;

class AccessRulesTest {

    private static final UserClaims RAHUL = new UserClaims("u1", "POLICYHOLDER", "Rahul", "r@x", "p-rahul", null);
    private static final UserClaims APOLLO = new UserClaims("u2", "HOSPITAL", "Apollo", "a@x", null, "h-apollo");
    private static final UserClaims OFFICER = new UserClaims("u3", "OFFICER", "Neha", "o@x", null, null);
    private static final UserClaims ADMIN = new UserClaims("u4", "ADMIN", "Asha", "ad@x", null, null);

    @Test
    void publicPathsNeedNoLogin() {
        assertThat(decide("POST", "/auth/login", null)).isEqualTo(ALLOW);
        assertThat(decide("POST", "/auth/register", null)).isEqualTo(ALLOW);
        assertThat(decide("POST", "/auth/forgot-password", null)).isEqualTo(ALLOW);
        assertThat(decide("GET", "/auth/login", null)).isEqualTo(LOGIN_REQUIRED);
    }

    @Test
    void everythingElseNeedsALogin() {
        assertThat(decide("GET", "/claims/patient/p-rahul", null)).isEqualTo(LOGIN_REQUIRED);
        assertThat(decide("GET", "/providers", null)).isEqualTo(LOGIN_REQUIRED);
        assertThat(decide("GET", "/auth/me", null)).isEqualTo(LOGIN_REQUIRED);
    }

    @Test
    void internalEndpointsAreHiddenEvenFromAdmins() {
        assertThat(decide("POST", "/patients/p-rahul/used-amount", ADMIN)).isEqualTo(NOT_FOUND);
        assertThat(decide("POST", "/claims/c1/mark-paid", ADMIN)).isEqualTo(NOT_FOUND);
        assertThat(decide("GET", "/auth/internal/patients/p1/account", ADMIN)).isEqualTo(NOT_FOUND);
        assertThat(decide("POST", "/patients/enrol", null)).isEqualTo(NOT_FOUND);
        assertThat(decide("POST", "/policies/fraud-review", OFFICER)).isEqualTo(NOT_FOUND);
    }

    @Test
    void policyholderSeesOnlyOwnData() {
        assertThat(decide("GET", "/claims/patient/p-rahul", RAHUL)).isEqualTo(ALLOW);
        assertThat(decide("GET", "/claims/patient/p-priya", RAHUL)).isEqualTo(FORBIDDEN);
        assertThat(decide("GET", "/patients/p-rahul", RAHUL)).isEqualTo(ALLOW);
        assertThat(decide("GET", "/patients/p-priya", RAHUL)).isEqualTo(FORBIDDEN);
        assertThat(decide("PATCH", "/patients/p-rahul/profile", RAHUL)).isEqualTo(ALLOW);
        assertThat(decide("PATCH", "/patients/p-priya/profile", RAHUL)).isEqualTo(FORBIDDEN);
        assertThat(decide("GET", "/notifications/patient/p-priya", RAHUL)).isEqualTo(FORBIDDEN);
        assertThat(decide("GET", "/payments/patient/p-rahul", RAHUL)).isEqualTo(ALLOW);
    }

    @Test
    void policyholderCannotDoStaffWork() {
        assertThat(decide("GET", "/claims", RAHUL)).isEqualTo(FORBIDDEN);
        assertThat(decide("GET", "/claims/review-queue", RAHUL)).isEqualTo(FORBIDDEN);
        assertThat(decide("POST", "/claims/c1/review", RAHUL)).isEqualTo(FORBIDDEN);
        assertThat(decide("GET", "/patients", RAHUL)).isEqualTo(FORBIDDEN);
        assertThat(decide("POST", "/patients", RAHUL)).isEqualTo(FORBIDDEN);
        assertThat(decide("GET", "/auth/users", RAHUL)).isEqualTo(FORBIDDEN);
        assertThat(decide("POST", "/claims", RAHUL)).isEqualTo(ALLOW);
    }

    @Test
    void hospitalSeesOnlyOwnHospital() {
        assertThat(decide("GET", "/claims/provider/h-apollo", APOLLO)).isEqualTo(ALLOW);
        assertThat(decide("GET", "/claims/provider/h-max", APOLLO)).isEqualTo(FORBIDDEN);
        assertThat(decide("GET", "/payments/provider/h-max", APOLLO)).isEqualTo(FORBIDDEN);
        assertThat(decide("GET", "/patients/by-policy/POL1001", APOLLO)).isEqualTo(ALLOW);
        assertThat(decide("GET", "/patients/p-rahul", APOLLO)).isEqualTo(FORBIDDEN);
        assertThat(decide("POST", "/claims", APOLLO)).isEqualTo(ALLOW);
        assertThat(decide("POST", "/claims/c1/review", APOLLO)).isEqualTo(FORBIDDEN);
    }

    @Test
    void officerReviewsButDoesNotManage() {
        assertThat(decide("GET", "/claims/review-queue", OFFICER)).isEqualTo(ALLOW);
        assertThat(decide("POST", "/claims/c1/review", OFFICER)).isEqualTo(ALLOW);
        assertThat(decide("GET", "/claims/patient/p-anyone", OFFICER)).isEqualTo(ALLOW);
        assertThat(decide("POST", "/claims", OFFICER)).isEqualTo(FORBIDDEN);
        assertThat(decide("POST", "/patients", OFFICER)).isEqualTo(FORBIDDEN);
        assertThat(decide("POST", "/auth/users", OFFICER)).isEqualTo(FORBIDDEN);
        assertThat(decide("GET", "/notifications", OFFICER)).isEqualTo(FORBIDDEN);
    }

    @Test
    void adminManages() {
        assertThat(decide("POST", "/auth/users", ADMIN)).isEqualTo(ALLOW);
        assertThat(decide("PATCH", "/auth/users/u9/active", ADMIN)).isEqualTo(ALLOW);
        assertThat(decide("POST", "/patients", ADMIN)).isEqualTo(ALLOW);
        assertThat(decide("POST", "/providers", ADMIN)).isEqualTo(ALLOW);
        assertThat(decide("GET", "/claims/stats", ADMIN)).isEqualTo(ALLOW);
    }

    @Test
    void unknownPathsAreDenied() {
        Decision d = decide("GET", "/secret/stuff", ADMIN);
        assertThat(d).isEqualTo(NOT_FOUND);
        assertThat(decide("DELETE", "/claims/c1", ADMIN)).isEqualTo(FORBIDDEN);   // known path, method not allowed
    }
}
