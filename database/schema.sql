-- =====================================================================
-- Employee Daily Task Management System
-- MySQL Schema
-- =====================================================================

CREATE DATABASE IF NOT EXISTS employee_app
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE employee_app;

-- ---------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  role_name   VARCHAR(50) NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  is_deleted  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_roles_role_name (role_name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- departments
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
  id               INT PRIMARY KEY AUTO_INCREMENT,
  department_name  VARCHAR(100) NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_departments_department_name (department_name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- employees
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employees (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  employee_code   VARCHAR(50) NOT NULL,
  name            VARCHAR(150) NOT NULL,
  email           VARCHAR(255) NOT NULL,
  role_id         INT NOT NULL,
  department_id   INT NOT NULL,
  designation     VARCHAR(100),
  joining_date    DATE,
  phone           VARCHAR(20),
  profile_image   VARCHAR(255),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_employees_employee_code (employee_code),
  UNIQUE KEY uq_employees_email (email),
  KEY idx_employees_role_id (role_id),
  KEY idx_employees_department_id (department_id),
  CONSTRAINT fk_employees_role
    FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_employees_department
    FOREIGN KEY (department_id) REFERENCES departments(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  client_name  VARCHAR(255) NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'Active',
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  is_deleted   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_clients_client_name (client_name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  client_id       INT NOT NULL,
  project_code    VARCHAR(50) NOT NULL,
  project_name    VARCHAR(255) NOT NULL,
  start_date      DATE,

  
  end_date        DATE,
  project_status  VARCHAR(50) NOT NULL DEFAULT 'Active',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_projects_project_code (project_code),
  KEY idx_projects_client_id (client_id),
  CONSTRAINT fk_projects_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- activities
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activities (
  id             INT PRIMARY KEY AUTO_INCREMENT,
  activity_name  VARCHAR(100) NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  is_deleted     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_activities_activity_name (activity_name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- daily_tasks
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_tasks (
  id                 INT PRIMARY KEY AUTO_INCREMENT,
  employee_id        INT NOT NULL,
  client_id          INT NOT NULL,
  project_id         INT NOT NULL,
  activity_id        INT NOT NULL,
  hours_spent        DECIMAL(4,2) NOT NULL,
  start_time         TIME,
  end_time           TIME,
  ip_address         VARCHAR(45),
  task_title         VARCHAR(255) NOT NULL,
  description        TEXT,
  task_date          DATE NOT NULL,
  submission_status  VARCHAR(20) NOT NULL DEFAULT 'Submitted',
  remarks            TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  is_deleted         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_daily_tasks_employee_id (employee_id),
  KEY idx_daily_tasks_client_id (client_id),
  KEY idx_daily_tasks_project_id (project_id),
  KEY idx_daily_tasks_activity_id (activity_id),
  KEY idx_daily_tasks_task_date (task_date),
  KEY idx_daily_tasks_employee_date (employee_id, task_date),
  CONSTRAINT fk_daily_tasks_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_daily_tasks_client
    FOREIGN KEY (client_id) REFERENCES clients(id),
  CONSTRAINT fk_daily_tasks_project
    FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_daily_tasks_activity
    FOREIGN KEY (activity_id) REFERENCES activities(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- email_logs
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_logs (
  id             INT PRIMARY KEY AUTO_INCREMENT,
  email_to       VARCHAR(255) NOT NULL,
  subject        VARCHAR(255) NOT NULL,
  email_type     VARCHAR(100) NOT NULL,
  status         VARCHAR(50) NOT NULL DEFAULT 'Pending',
  error_message  TEXT,
  sent_at        TIMESTAMP NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_email_logs_email_type (email_type),
  KEY idx_email_logs_status (status),
  KEY idx_email_logs_sent_at (sent_at)
) ENGINE=InnoDB;

-- =====================================================================
-- Seed data (master/lookup values)
-- =====================================================================

INSERT IGNORE INTO roles (role_name) VALUES
  ('Admin'),
  ('Employee');

INSERT IGNORE INTO departments (department_name) VALUES
  ('Development'),
  ('QA'),
  ('HR'),
  ('Support'),
  ('Management');

INSERT IGNORE INTO activities (activity_name) VALUES
  ('Development'),
  ('Bug Fixing'),
  ('Testing'),
  ('Meeting'),
  ('Deployment'),
  ('Code Review'),
  ('Documentation'),
  ('Research'),
  ('Support'),
  ('Client Discussion'),
  ('Planning'),
  ('Training');
