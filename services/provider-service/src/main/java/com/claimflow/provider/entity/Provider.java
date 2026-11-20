package com.claimflow.provider.entity;

import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.HashSet;
import java.util.Set;

/** A hospital, stored in the "providers" collection of provider_db. */
@Document("providers")
@Data
@NoArgsConstructor
public class Provider {

    @Id
    private String id;

    /** Unique hospital ID used by insurers (like India's ROHINI ID), so a hospital can't be added twice. */
    @Indexed(unique = true)
    private String registrationNumber;

    private String name;

    private String city;

    /**
     * One hospital, many specializations. In PostgreSQL this needed its own table;
     * in MongoDB it is simply an array inside the hospital document.
     */
    private Set<String> specializations = new HashSet<>();

    /** In-network = the hospital has an agreement with the insurer. Out-of-network claims are rejected. */
    private Boolean inNetwork;
}
