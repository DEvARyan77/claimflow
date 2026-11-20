package com.claimflow.claims.entity;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** One entry in a claim's review history. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ReviewNote {

    public enum Action { APPROVE, REJECT, REQUEST_INFO, INFO_ADDED, NOTE }

    private Action action;
    private String note;
    private String byUserId;
    private String byName;
    private String byRole;
    private LocalDateTime at;
}
