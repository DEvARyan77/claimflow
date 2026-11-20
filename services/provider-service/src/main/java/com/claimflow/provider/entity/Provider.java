package com.claimflow.provider.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "providers")
@Data
@NoArgsConstructor
public class Provider {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Unique hospital ID used by insurers (like India's ROHINI ID), so a hospital can't be added twice. */
    @Column(nullable = false, unique = true)
    private String registrationNumber;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String city;

    /** One hospital, many specializations; a Set ignores duplicates. Stored in its own table. */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "provider_specializations", joinColumns = @JoinColumn(name = "provider_id"))
    @Column(name = "specialization")
    private Set<String> specializations = new HashSet<>();

    /** In-network = the hospital has an agreement with the insurer. Out-of-network claims are rejected. */
    private Boolean inNetwork;

    @PrePersist
    void setDefaults() {
        if (inNetwork == null) inNetwork = true;
    }
}
