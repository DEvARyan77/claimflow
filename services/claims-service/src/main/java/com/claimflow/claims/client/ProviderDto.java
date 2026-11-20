package com.claimflow.claims.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class ProviderDto {
    private Long id;
    private String name;
    private Boolean inNetwork;
}
