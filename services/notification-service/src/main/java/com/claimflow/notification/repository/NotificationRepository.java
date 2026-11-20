package com.claimflow.notification.repository;

import com.claimflow.notification.entity.Notification;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    List<Notification> findByPatientIdOrderBySentAtDesc(Long patientId);

    List<Notification> findAllByOrderBySentAtDesc();
}
