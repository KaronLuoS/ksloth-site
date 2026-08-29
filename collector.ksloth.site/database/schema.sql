-- schema.sql
-- Run once to set up the database:  mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS collector_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE collector_db;

-- ── pageviews ────────────────────────────────────────────────────────
-- One row per page load.
CREATE TABLE IF NOT EXISTS pageviews (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  url             VARCHAR(2048) NOT NULL,
  type            VARCHAR(32) NOT NULL DEFAULT 'pageview',
  -- Static data (collected after page load)
  cookies_enabled  BOOLEAN NULL,
  js_allowed       BOOLEAN NULL,
  images_allowed   BOOLEAN NULL, 
  css_allowed      BOOLEAN NULL,
  user_agent      VARCHAR(512),
  viewport_width  SMALLINT UNSIGNED,
  viewport_height SMALLINT UNSIGNED,
  referrer        VARCHAR(2048),
  client_timestamp BIGINT,
  server_timestamp DATETIME NOT NULL,
  client_ip       VARCHAR(45),
  session_id      VARCHAR(36) NOT NULL,
  payload         JSON,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_server_ts (server_timestamp),
  INDEX idx_session   (session_id),
  INDEX idx_url_ts    (url(255), server_timestamp)
) ENGINE=InnoDB;

-- ── events ───────────────────────────────────────────────────────────
-- Everything from the collector's activity tracking (mouse, keyboard,
-- scroll, idle, lifecycle) and any custom collector.track() calls.
CREATE TABLE IF NOT EXISTS events (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id       VARCHAR(36) NOT NULL,
  event_name       VARCHAR(128) NOT NULL,
  event_category   VARCHAR(128),
  event_data       JSON,
  url              VARCHAR(2048),
  server_timestamp DATETIME NOT NULL,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_session    (session_id),
  INDEX idx_event_name (event_name),
  INDEX idx_server_ts  (server_timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── errors ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS errors (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_id       VARCHAR(36) NOT NULL,
    error_message    VARCHAR(1024),
    error_source     VARCHAR(2048),
    error_line       INT UNSIGNED,
    error_column     INT UNSIGNED,
    stack_trace      TEXT,
    url              VARCHAR(2048),
    user_agent       VARCHAR(512),
    server_timestamp DATETIME NOT NULL,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_session   (session_id),
    INDEX idx_server_ts (server_timestamp),
    INDEX idx_message   (error_message(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── performance ──────────────────────────────────────────────────────
-- Navigation Timing per pageview.
CREATE TABLE IF NOT EXISTS performance (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_id          VARCHAR(36) NOT NULL,
    url                 VARCHAR(2048),
    ttfb                FLOAT,
    dom_content_loaded  FLOAT,
    dom_complete        FLOAT,
    load_time           FLOAT,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_session   (session_id),
    INDEX idx_server_ts (server_timestamp),
    INDEX idx_url_ts    (url(255), server_timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Sessions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
    session_id       VARCHAR(36) PRIMARY KEY,
    first_page       VARCHAR(2048),
    last_page        VARCHAR(2048),
    page_count       SMALLINT UNSIGNED DEFAULT 1,
    start_time       DATETIME NOT NULL,
    last_activity    DATETIME NOT NULL,
    duration_seconds INT UNSIGNED DEFAULT 0,
    referrer         VARCHAR(2048),
    user_agent       VARCHAR(512),

    INDEX idx_start_time    (start_time),
    INDEX idx_last_activity (last_activity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── users ────────────────────────────────────────────────────────────
-- Dashboard login accounts — NOT analytics visitors. No relationship
-- to the tables above.
CREATE TABLE IF NOT EXISTS users (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email          VARCHAR(255) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    display_name   VARCHAR(128),
    role           ENUM('owner', 'admin', 'viewer') NOT NULL DEFAULT 'viewer',
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login     DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

