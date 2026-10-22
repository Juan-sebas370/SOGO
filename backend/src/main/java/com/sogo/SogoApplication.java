package com.sogo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling   // respaldos automáticos (RespaldoService)
public class SogoApplication {
    public static void main(String[] args) {
        SpringApplication.run(SogoApplication.class, args);
    }
}
