package com.claimflow.gateway.security;

import com.claimflow.security.JwtCodec.UserClaims;
import org.springframework.util.AntPathMatcher;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.claimflow.security.Roles.*;

/**
 * Who may call what, in one table. Plain Java (no Spring), so every rule is unit-tested.
 *
 * - PUBLIC paths need no login.
 * - INTERNAL paths are only for service-to-service calls (Feign, inside the network) and are hidden here.
 * - Everything else must match a rule; anything not listed is refused (deny by default).
 * - {pid} in a pattern must be the caller's own patient id, {hid} the caller's own hospital id
 *   (staff roles in OWNER_EXEMPT can see everyone's).
 */
public final class AccessRules {

    public enum Decision { ALLOW, LOGIN_REQUIRED, FORBIDDEN, NOT_FOUND }

    private record Rule(String method, String pattern, Set<String> roles) {
    }

    private static final Set<String> ANY = Set.of(POLICYHOLDER, HOSPITAL, OFFICER, ADMIN);
    private static final Set<String> STAFF = Set.of(OFFICER, ADMIN);
    private static final Set<String> OWNER_EXEMPT = STAFF;

    private static final List<Rule> PUBLIC = List.of(
            new Rule("POST", "/auth/login", null),
            new Rule("POST", "/auth/register", null),
            new Rule("POST", "/auth/forgot-password", null),
            new Rule("POST", "/auth/reset-password", null),
            new Rule("POST", "/auth/google", null),
            new Rule("GET", "/auth/social-config", null),
            // sign-up can read the details off a policy document before the account exists
            new Rule("POST", "/policies/extract-profile", null));

    private static final List<String> INTERNAL = List.of(
            "/auth/internal/**",
            "/patients/enrol",
            "/patients/*/used-amount",
            "/claims/*/mark-paid",
            "/policies/fraud-review");

    private static final List<Rule> RULES = List.of(
            // own account
            new Rule("GET", "/auth/me", ANY),
            new Rule("PATCH", "/auth/me", ANY),
            new Rule("POST", "/auth/me/password", ANY),
            // staff accounts
            new Rule("*", "/auth/users", Set.of(ADMIN)),
            new Rule("*", "/auth/users/**", Set.of(ADMIN)),

            // policies and policyholders
            new Rule("GET", "/patients", STAFF),
            new Rule("POST", "/patients", Set.of(ADMIN)),
            new Rule("GET", "/patients/by-policy/*", Set.of(HOSPITAL, OFFICER, ADMIN)),
            new Rule("GET", "/patients/{pid}", Set.of(POLICYHOLDER, OFFICER, ADMIN)),
            new Rule("PATCH", "/patients/{pid}/profile", Set.of(POLICYHOLDER)),

            // hospitals
            new Rule("GET", "/providers", ANY),
            new Rule("GET", "/providers/*", ANY),
            new Rule("POST", "/providers", Set.of(ADMIN)),
            new Rule("PATCH", "/providers/*", Set.of(ADMIN)),

            // claims (claims-service also checks that a claim belongs to the caller)
            new Rule("POST", "/claims", Set.of(POLICYHOLDER, HOSPITAL)),
            new Rule("GET", "/claims", STAFF),
            new Rule("GET", "/claims/review-queue", STAFF),
            new Rule("GET", "/claims/stats", STAFF),
            new Rule("GET", "/claims/patient/{pid}", Set.of(POLICYHOLDER, OFFICER, ADMIN)),
            new Rule("GET", "/claims/provider/{hid}", Set.of(HOSPITAL, OFFICER, ADMIN)),
            new Rule("GET", "/claims/*", ANY),
            new Rule("POST", "/claims/*/review", STAFF),
            new Rule("POST", "/claims/*/info", Set.of(POLICYHOLDER, HOSPITAL)),

            // payments
            new Rule("GET", "/payments", STAFF),
            new Rule("GET", "/payments/patient/{pid}", Set.of(POLICYHOLDER, OFFICER, ADMIN)),
            new Rule("GET", "/payments/provider/{hid}", Set.of(HOSPITAL, OFFICER, ADMIN)),
            new Rule("GET", "/payments/claim/*", ANY),

            // notifications
            new Rule("GET", "/notifications", Set.of(ADMIN)),
            new Rule("GET", "/notifications/patient/{pid}", Set.of(POLICYHOLDER, OFFICER, ADMIN)),

            // policy assistant
            new Rule("GET", "/policies", ANY),
            new Rule("GET", "/policies/**", ANY),
            new Rule("POST", "/policies/ask", ANY),
            new Rule("POST", "/policies/precheck", ANY),
            new Rule("POST", "/policies/extract-profile", ANY),
            new Rule("POST", "/policies", Set.of(POLICYHOLDER, ADMIN)),
            new Rule("DELETE", "/policies/*", Set.of(POLICYHOLDER, ADMIN)));

    private static final AntPathMatcher MATCHER = new AntPathMatcher();

    private AccessRules() {
    }

    public static boolean isPublic(String method, String path) {
        return PUBLIC.stream().anyMatch(r -> methodMatches(r, method) && MATCHER.match(r.pattern(), path));
    }

    public static boolean isInternal(String path) {
        return INTERNAL.stream().anyMatch(p -> MATCHER.match(p, path));
    }

    /** user is null when there was no valid token. */
    public static Decision decide(String method, String path, UserClaims user) {
        if (isInternal(path)) return Decision.NOT_FOUND;
        if (isPublic(method, path)) return Decision.ALLOW;
        if (user == null) return Decision.LOGIN_REQUIRED;

        boolean pathKnown = false;
        for (Rule rule : RULES) {
            if (!MATCHER.match(rule.pattern(), path)) continue;
            pathKnown = true;
            if (!methodMatches(rule, method)) continue;
            if (!rule.roles().contains(user.role())) return Decision.FORBIDDEN;
            return ownsPath(rule.pattern(), path, user) ? Decision.ALLOW : Decision.FORBIDDEN;
        }
        return pathKnown ? Decision.FORBIDDEN : Decision.NOT_FOUND;
    }

    private static boolean ownsPath(String pattern, String path, UserClaims user) {
        if (OWNER_EXEMPT.contains(user.role()) || !pattern.contains("{")) return true;
        Map<String, String> vars = MATCHER.extractUriTemplateVariables(pattern, path);
        String pid = vars.get("pid");
        String hid = vars.get("hid");
        if (pid != null && !pid.equals(user.patientId())) return false;
        return hid == null || hid.equals(user.providerId());
    }

    private static boolean methodMatches(Rule rule, String method) {
        return "*".equals(rule.method()) || rule.method().equalsIgnoreCase(method);
    }
}
