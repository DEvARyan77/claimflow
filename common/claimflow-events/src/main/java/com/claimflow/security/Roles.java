package com.claimflow.security;

/**
 * Who can sign in, and the headers the gateway adds after checking the token.
 * Services read these headers; the gateway removes any copies sent by the browser, so they can be trusted.
 */
public final class Roles {

    public static final String POLICYHOLDER = "POLICYHOLDER"; // files and tracks own claims
    public static final String HOSPITAL = "HOSPITAL";         // raises cashless claims for admitted patients
    public static final String OFFICER = "OFFICER";           // reviews flagged claims
    public static final String ADMIN = "ADMIN";               // manages policies, hospitals, staff

    public static final String HEADER_USER_ID = "X-User-Id";
    public static final String HEADER_ROLE = "X-User-Role";
    public static final String HEADER_NAME = "X-User-Name";
    public static final String HEADER_PATIENT_ID = "X-Patient-Id";
    public static final String HEADER_PROVIDER_ID = "X-Provider-Id";

    private Roles() {
    }

    public static boolean isStaff(String role) {
        return OFFICER.equals(role) || ADMIN.equals(role);
    }
}
