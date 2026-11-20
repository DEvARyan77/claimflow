package com.claimflow.auth.controller;

import com.claimflow.auth.dto.AuthDtos.*;
import com.claimflow.auth.service.AuthService;
import com.claimflow.security.Roles;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * /auth/register, /auth/login, /auth/forgot-password, /auth/reset-password: open to everyone.
 * Everything else needs a signed-in user: the gateway checks the token and sends X-User-Id / X-User-Role.
 * /auth/users/** is admin-only (also enforced by the gateway). /auth/internal/** is never exposed by the gateway.
 */
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService auth;

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public LoginResponse register(@Valid @RequestBody RegisterRequest request) {
        return auth.register(request);
    }

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        return auth.login(request);
    }

    @PostMapping("/forgot-password")
    public Message forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        auth.forgotPassword(request);
        return new Message("If that email has an account, a reset link is on its way (to your main and alternate email).");
    }

    @PostMapping("/reset-password")
    public LoginResponse resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        return auth.resetPassword(request);
    }

    @GetMapping("/me")
    public UserView me(@RequestHeader(value = Roles.HEADER_USER_ID, required = false) String userId) {
        return UserView.of(auth.me(userId));
    }

    @PatchMapping("/me")
    public UserView updateMe(@RequestHeader(value = Roles.HEADER_USER_ID, required = false) String userId,
                             @Valid @RequestBody UpdateMeRequest request) {
        return UserView.of(auth.updateMe(userId, request));
    }

    @PostMapping("/me/password")
    public Message changePassword(@RequestHeader(value = Roles.HEADER_USER_ID, required = false) String userId,
                                  @Valid @RequestBody ChangePasswordRequest request) {
        auth.changePassword(userId, request);
        return new Message("Password changed. We've emailed you a confirmation.");
    }

    // ---------- admin ----------

    @GetMapping("/users")
    public List<UserView> users() {
        return auth.listUsers().stream().map(UserView::of).toList();
    }

    @PostMapping("/users")
    @ResponseStatus(HttpStatus.CREATED)
    public UserView createStaff(@Valid @RequestBody CreateStaffRequest request) {
        return UserView.of(auth.createStaff(request));
    }

    @PatchMapping("/users/{id}/active")
    public UserView setActive(@RequestHeader(value = Roles.HEADER_USER_ID, required = false) String adminId,
                              @PathVariable String id, @RequestBody SetActiveRequest request) {
        return UserView.of(auth.setActive(adminId, id, request.active()));
    }

    // ---------- internal (service to service) ----------

    @GetMapping("/internal/patients/{patientId}/account")
    public UserView accountForPatient(@PathVariable String patientId) {
        return UserView.of(auth.accountForPatient(patientId));
    }
}
