package com.claimflow.auth;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.util.TimeZone;

/** Accounts and login. The gateway checks the tokens this service signs. */
@SpringBootApplication
@EnableFeignClients
@EnableScheduling
public class AuthServiceApplication {
    public static void main(String[] args) {
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"));
        SpringApplication.run(AuthServiceApplication.class, args);
    }
}
