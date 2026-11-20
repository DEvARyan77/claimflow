package com.claimflow.notification.controller;

import com.claimflow.notification.entity.Notification;
import com.claimflow.notification.repository.NotificationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationRepository notificationRepository;

    @GetMapping
    public List<Notification> getAll() {
        return notificationRepository.findAllByOrderBySentAtDesc();
    }

    @GetMapping("/patient/{patientId}")
    public List<Notification> getByPatient(@PathVariable Long patientId) {
        return notificationRepository.findByPatientIdOrderBySentAtDesc(patientId);
    }
}
