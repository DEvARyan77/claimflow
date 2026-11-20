package com.claimflow.notification.repository;

import com.claimflow.notification.entity.Notification;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface NotificationRepository extends MongoRepository<Notification, String> {

    List<Notification> findByPatientIdOrderBySentAtDesc(String patientId);

    List<Notification> findAllByOrderBySentAtDesc();
}
