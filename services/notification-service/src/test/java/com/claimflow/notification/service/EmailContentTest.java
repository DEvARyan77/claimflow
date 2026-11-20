package com.claimflow.notification.service;

import com.claimflow.events.AccountEvent;
import com.claimflow.events.ClaimEvent;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class EmailContentTest {

    @SuppressWarnings("unchecked")
    private static EmailSender sender(String override) {
        return new EmailSender(mock(ObjectProvider.class), "", "key", "noreply@test.in", "ClaimFlow", override, "https://app.test/");
    }

    private static ClaimEvent event(String status, String reason) {
        return new ClaimEvent("c1", "CLM-2026-000042", "p1", "h1", new BigDecimal("450000"), status, reason, null);
    }

    @Test
    void reviewMessagesUseIndianRupeeFormat() {
        assertThat(NotificationListener.buildMessage(event("UNDER_REVIEW", null)))
                .contains("claim CLM-2026-000042 of ₹4,50,000").contains("review");
        assertThat(NotificationListener.buildMessage(event("INFO_REQUESTED", "More information needed: Upload the discharge summary")))
                .contains("Upload the discharge summary.").doesNotContain("More information needed:");
    }

    @Test
    void recipientsSkipDemoDomainsAndDuplicates() {
        EmailSender s = sender("");
        assertThat(s.isEnabled()).isTrue();
        assertThat(s.recipients("Dev@Gmail.com", "dev@gmail.com", "rahul@claimflow.dev", "x@example.com", null, "alt@yahoo.in"))
                .containsExactly("dev@gmail.com", "alt@yahoo.in");
        assertThat(s.appUrl()).isEqualTo("https://app.test");
    }

    @Test
    void overrideSendsEverythingToOneAddress() {
        assertThat(sender("demo@inbox.in").recipients("a@b.in", "c@d.in")).containsExactly("demo@inbox.in");
    }

    @Test
    void accountEmails() {
        var reset = AccountEmailListener.mailFor(new AccountEvent("PASSWORD_RESET", "a@b.in", null, "Dev Aryan", "POLICYHOLDER", "https://app/reset?t=1"));
        assertThat(reset.link()).isEqualTo("https://app/reset?t=1");
        assertThat(reset.message()).contains("30 minutes");
        var staff = AccountEmailListener.mailFor(new AccountEvent("STAFF_CREATED", "o@b.in", null, "Neha", "OFFICER", "https://app/login"));
        assertThat(staff.subject()).contains("claims officer");
        assertThat(AccountEmailListener.mailFor(new AccountEvent("UNKNOWN", "a@b.in", null, null, null, null))).isNull();
    }
}
