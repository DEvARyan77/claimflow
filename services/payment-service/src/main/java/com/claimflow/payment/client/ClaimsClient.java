package com.claimflow.payment.client;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "claims-service")
public interface ClaimsClient {

    @PostMapping("/claims/{id}/mark-paid")
    void markPaid(@PathVariable("id") String claimId, @RequestBody MarkPaidRequest request);

    record MarkPaidRequest(String paymentReference) {
    }
}
