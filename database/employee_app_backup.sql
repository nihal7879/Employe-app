-- --------------------------------------------------------
-- Host:                         127.0.0.1
-- Server version:               10.4.32-MariaDB - mariadb.org binary distribution
-- Server OS:                    Win64
-- HeidiSQL Version:             12.5.0.6677
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


-- Dumping database structure for employee_app
CREATE DATABASE IF NOT EXISTS `employee_app` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;
USE `employee_app`;

-- Dumping structure for table employee_app.activities
CREATE TABLE IF NOT EXISTS `activities` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `activity_name` varchar(100) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_activities_activity_name` (`activity_name`)
) ENGINE=InnoDB AUTO_INCREMENT=37 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table employee_app.activities: ~12 rows (approximately)
INSERT INTO `activities` (`id`, `activity_name`, `is_active`, `is_deleted`, `created_at`, `updated_at`) VALUES
	(1, 'Development', 1, 0, '2026-05-21 05:34:38', '2026-05-21 05:34:38'),
	(2, 'Bug Fixing', 1, 0, '2026-05-21 05:34:38', '2026-05-21 05:34:38'),
	(3, 'Testing', 1, 0, '2026-05-21 05:34:38', '2026-05-21 05:34:38'),
	(4, 'Meeting', 1, 0, '2026-05-21 05:34:38', '2026-05-21 05:34:38'),
	(5, 'Deployment', 1, 0, '2026-05-21 05:34:38', '2026-05-21 05:34:38'),
	(6, 'Code Review', 1, 0, '2026-05-21 05:34:38', '2026-05-21 05:34:38'),
	(7, 'Documentation', 1, 0, '2026-05-21 05:34:38', '2026-05-21 05:34:38'),
	(8, 'Research', 1, 0, '2026-05-21 05:34:38', '2026-05-21 05:34:38'),
	(9, 'Support', 1, 0, '2026-05-21 05:34:38', '2026-05-21 05:34:38'),
	(10, 'Client Discussion', 1, 0, '2026-05-21 05:34:38', '2026-05-21 05:34:38'),
	(11, 'Planning', 1, 0, '2026-05-21 05:34:38', '2026-05-21 05:34:38'),
	(12, 'Training', 1, 0, '2026-05-21 05:34:38', '2026-05-21 05:34:38');

-- Dumping structure for table employee_app.clients
CREATE TABLE IF NOT EXISTS `clients` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `client_name` varchar(255) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'Active',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_clients_client_name` (`client_name`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table employee_app.clients: ~3 rows (approximately)
INSERT INTO `clients` (`id`, `client_name`, `status`, `is_active`, `is_deleted`, `created_at`, `updated_at`) VALUES
	(1, 'Sundaram', 'Active', 1, 0, '2026-05-21 06:12:54', '2026-05-21 06:12:54'),
	(2, 'Adfactor', 'Active', 1, 0, '2026-05-21 06:12:54', '2026-05-21 07:03:03'),
	(3, 'Strategy', 'Active', 1, 0, '2026-05-21 06:12:54', '2026-05-21 06:12:54');

-- Dumping structure for table employee_app.daily_tasks
CREATE TABLE IF NOT EXISTS `daily_tasks` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `client_id` int(11) DEFAULT NULL,
  `project_id` int(11) DEFAULT NULL,
  `activity_id` int(11) DEFAULT NULL,
  `hours_spent` decimal(4,2) NOT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `task_title` varchar(255) NOT NULL,
  `assigned_by` varchar(255) DEFAULT NULL,
  `reference` varchar(255) DEFAULT NULL,
  `is_break` tinyint(1) NOT NULL DEFAULT 0,
  `description` text DEFAULT NULL,
  `task_date` date NOT NULL,
  `submission_status` varchar(20) NOT NULL DEFAULT 'Submitted',
  `remarks` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_daily_tasks_employee_id` (`employee_id`),
  KEY `idx_daily_tasks_client_id` (`client_id`),
  KEY `idx_daily_tasks_project_id` (`project_id`),
  KEY `idx_daily_tasks_activity_id` (`activity_id`),
  KEY `idx_daily_tasks_task_date` (`task_date`),
  KEY `idx_daily_tasks_employee_date` (`employee_id`,`task_date`),
  CONSTRAINT `fk_daily_tasks_activity` FOREIGN KEY (`activity_id`) REFERENCES `activities` (`id`),
  CONSTRAINT `fk_daily_tasks_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`),
  CONSTRAINT `fk_daily_tasks_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`),
  CONSTRAINT `fk_daily_tasks_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table employee_app.daily_tasks: ~12 rows (approximately)
INSERT INTO `daily_tasks` (`id`, `employee_id`, `client_id`, `project_id`, `activity_id`, `hours_spent`, `start_time`, `end_time`, `ip_address`, `task_title`, `assigned_by`, `reference`, `is_break`, `description`, `task_date`, `submission_status`, `remarks`, `is_active`, `is_deleted`, `created_at`, `updated_at`) VALUES
	(1, 3, 1, 2, 1, 2.00, '10:00:00', '11:35:00', '::1', 'test', NULL, NULL, 0, 'test', '2026-05-21', 'Submitted', NULL, 0, 1, '2026-05-21 06:17:44', '2026-05-21 07:58:30'),
	(2, 1, 2, 3, 2, 2.00, '11:32:00', '14:32:00', '::1', 'test', NULL, NULL, 0, 'test', '2026-05-21', 'Submitted', NULL, 1, 0, '2026-05-21 09:03:02', '2026-05-21 09:03:02'),
	(3, 3, 2, 3, 2, 0.75, '11:00:00', '11:45:00', '::1', 'test', NULL, NULL, 0, 'test', '2026-05-22', 'Submitted', NULL, 0, 1, '2026-05-22 09:08:30', '2026-05-22 09:12:55'),
	(4, 3, 2, 3, 2, 1.00, '01:00:00', '02:00:00', '::1', 'test', NULL, NULL, 0, '', '2026-05-22', 'Submitted', NULL, 0, 1, '2026-05-22 09:19:55', '2026-05-22 09:28:37'),
	(5, 3, 2, 3, 2, 1.00, '01:00:00', '02:00:00', '::1', 'test', NULL, NULL, 0, 'test', '2026-05-22', 'Submitted', NULL, 0, 1, '2026-05-22 09:29:31', '2026-05-22 09:30:38'),
	(6, 3, 2, 3, 2, 1.00, '01:00:00', '02:00:00', '127.0.0.1', 'test', NULL, 'test', 0, 'test', '2026-05-22', 'Submitted', NULL, 0, 1, '2026-05-22 09:57:52', '2026-05-22 09:58:11'),
	(7, 3, 2, 3, 2, 1.00, '01:00:00', '02:00:00', '127.0.0.1', 'test', NULL, 'test', 0, 'The NIFTY block\'s strategyMap array is never closed — the last strategy entry ends with } but the ] to close the array is missing before the outer }:', '2026-05-22', 'Submitted', NULL, 0, 1, '2026-05-22 09:58:32', '2026-05-22 10:19:28'),
	(8, 3, 2, 3, 2, 0.00, '01:00:00', '01:00:00', '127.0.0.1', 'test', NULL, 'test', 0, 'The NIFTY block\'s strategyMThe NIFTY block\'s strategyMap array is never closed — the last strategy entry ends with } but the ] to close the array is missing before the outer }:ap array is never closed — the last strategy entry ends with } but the ] to close the array is missing before the outer }:The NIFTY block\'s strategyMap array is never closed — the last strategy entry ends with } but the ] to close the array is missing before the outer }:', '2026-05-22', 'Submitted', NULL, 0, 1, '2026-05-22 09:59:11', '2026-05-22 10:19:25'),
	(9, 3, 2, 3, 1, 2.00, '09:00:00', '11:00:00', '127.0.0.1', 'Api integration in pricespy', 'nirav', NULL, 0, 'test', '2026-05-22', 'Submitted', NULL, 1, 0, '2026-05-22 10:21:26', '2026-05-22 10:21:26'),
	(10, 3, 3, 4, 1, 2.25, '11:00:00', '13:15:00', '127.0.0.1', 'test', 'nirav', NULL, 0, 'test', '2026-05-22', 'Submitted', NULL, 1, 0, '2026-05-22 10:22:08', '2026-05-22 10:22:08'),
	(11, 3, 1, 2, 5, 2.75, '14:00:00', '16:45:00', '127.0.0.1', 'test', NULL, NULL, 0, 'test', '2026-05-22', 'Submitted', NULL, 0, 1, '2026-05-22 10:23:17', '2026-05-22 11:17:32'),
	(12, 3, 1, 1, 1, 2.00, '14:00:00', '16:00:00', '127.0.0.1', 'test', NULL, NULL, 0, 'test', '2026-05-22', 'Submitted', NULL, 1, 0, '2026-05-22 11:18:32', '2026-05-22 11:18:32');

-- Dumping structure for table employee_app.departments
CREATE TABLE IF NOT EXISTS `departments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `department_name` varchar(100) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_departments_department_name` (`department_name`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table employee_app.departments: ~5 rows (approximately)
INSERT INTO `departments` (`id`, `department_name`, `is_active`, `is_deleted`, `created_at`, `updated_at`) VALUES
	(1, 'Development', 1, 0, '2026-05-21 05:34:38', '2026-05-21 05:34:38'),
	(2, 'QA', 1, 0, '2026-05-21 05:34:38', '2026-05-21 05:34:38'),
	(3, 'HR', 1, 0, '2026-05-21 05:34:38', '2026-05-21 05:34:38'),
	(4, 'Support', 1, 0, '2026-05-21 05:34:38', '2026-05-21 05:34:38'),
	(5, 'Management', 1, 0, '2026-05-21 05:34:38', '2026-05-21 05:34:38');

-- Dumping structure for table employee_app.email_logs
CREATE TABLE IF NOT EXISTS `email_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email_to` varchar(255) NOT NULL,
  `subject` varchar(255) NOT NULL,
  `email_type` varchar(100) NOT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'Pending',
  `error_message` text DEFAULT NULL,
  `sent_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_email_logs_email_type` (`email_type`),
  KEY `idx_email_logs_status` (`status`),
  KEY `idx_email_logs_sent_at` (`sent_at`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table employee_app.email_logs: ~11 rows (approximately)
INSERT INTO `email_logs` (`id`, `email_to`, `subject`, `email_type`, `status`, `error_message`, `sent_at`, `created_at`) VALUES
	(1, 'nirav.mehta@millicent.in', 'Your Daily Task Report — 2026-05-21', 'Daily Summary', 'Sent', NULL, '2026-05-21 06:30:03', '2026-05-21 06:30:00'),
	(2, ' nihal@millicent.in', 'Your Daily Task Report — 2026-05-21', 'Daily Summary', 'Sent', NULL, '2026-05-21 06:30:06', '2026-05-21 06:30:03'),
	(3, 'nihal@millicent.inb', 'Reminder: submit your daily tasks — 2026-05-21', 'Reminder', 'Sent', NULL, '2026-05-21 12:30:03', '2026-05-21 12:30:00'),
	(4, 'nihal@millicent.in', 'Your tasks yesterday — 2026-05-21', 'Daily Summary', 'Failed', 'connect EHOSTUNREACH 192.178.211.109:587', NULL, '2026-05-22 04:36:55'),
	(5, 'nihal@millicent.inb', 'Your tasks yesterday — 2026-05-21', 'Daily Summary', 'Sent', NULL, '2026-05-22 04:37:00', '2026-05-22 04:36:56'),
	(6, 'nihal@millicent.inbb', 'Your Daily Task Report — 2026-05-22', 'Daily Summary', 'Sent', NULL, '2026-05-22 06:30:03', '2026-05-22 06:30:00'),
	(7, 'nihal@millicent.in', 'Your Daily Task Report — 2026-05-22', 'Daily Summary', 'Sent', NULL, '2026-05-22 06:30:06', '2026-05-22 06:30:03'),
	(8, 'nihal@millicent.inbb', 'Reminder: submit your daily tasks — 2026-05-22', 'Reminder', 'Sent', NULL, '2026-05-22 12:30:04', '2026-05-22 12:30:00'),
	(9, 'nihal@millicent.in', 'Your Daily Task Report — 2026-05-22', 'Daily Summary', 'Failed', 'connect EHOSTUNREACH 192.178.211.109:587', NULL, '2026-05-22 20:57:32'),
	(10, 'nihal@millicent.in', 'Team Daily Summary — 2026-05-22', 'Daily Summary', 'Failed', 'connect EHOSTUNREACH 192.178.211.109:587', NULL, '2026-05-22 20:57:32'),
	(11, 'nihal@millicent.in', 'Weekly Summary 2026-05-18 → 2026-05-25', 'Weekly Summary', 'Failed', 'connect EHOSTUNREACH 192.178.211.109:587', NULL, '2026-05-25 04:30:11');

-- Dumping structure for table employee_app.employees
CREATE TABLE IF NOT EXISTS `employees` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_code` varchar(50) NOT NULL,
  `name` varchar(150) NOT NULL,
  `email` varchar(255) NOT NULL,
  `role_id` int(11) NOT NULL,
  `department_id` int(11) NOT NULL,
  `designation` varchar(100) DEFAULT NULL,
  `joining_date` date DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `profile_image` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_employees_employee_code` (`employee_code`),
  UNIQUE KEY `uq_employees_email` (`email`),
  KEY `idx_employees_role_id` (`role_id`),
  KEY `idx_employees_department_id` (`department_id`),
  CONSTRAINT `fk_employees_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`),
  CONSTRAINT `fk_employees_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table employee_app.employees: ~2 rows (approximately)
INSERT INTO `employees` (`id`, `employee_code`, `name`, `email`, `role_id`, `department_id`, `designation`, `joining_date`, `phone`, `profile_image`, `is_active`, `is_deleted`, `created_at`, `updated_at`) VALUES
	(1, 'ADMIN-001', 'Nirav Mehta', 'nihal@millicent.inbb', 1, 5, 'Founder', NULL, NULL, NULL, 1, 0, '2026-05-21 05:42:07', '2026-05-22 12:13:05'),
	(3, 'EMP-001', 'Test Employee', 'nihal@millicent.in', 2, 1, 'Developer', NULL, NULL, NULL, 1, 0, '2026-05-21 06:06:33', '2026-05-22 12:13:09');

-- Dumping structure for table employee_app.knex_migrations
CREATE TABLE IF NOT EXISTS `knex_migrations` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) DEFAULT NULL,
  `batch` int(11) DEFAULT NULL,
  `migration_time` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table employee_app.knex_migrations: ~2 rows (approximately)
INSERT INTO `knex_migrations` (`id`, `name`, `batch`, `migration_time`) VALUES
	(1, '20260522093000_add_assigned_by_reference_to_daily_tasks.ts', 1, '2026-05-22 09:32:54'),
	(2, '20260522154500_add_is_break_to_daily_tasks.ts', 2, '2026-05-22 10:54:46');

-- Dumping structure for table employee_app.knex_migrations_lock
CREATE TABLE IF NOT EXISTS `knex_migrations_lock` (
  `index` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `is_locked` int(11) DEFAULT NULL,
  PRIMARY KEY (`index`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table employee_app.knex_migrations_lock: ~1 rows (approximately)
INSERT INTO `knex_migrations_lock` (`index`, `is_locked`) VALUES
	(1, 0);

-- Dumping structure for table employee_app.projects
CREATE TABLE IF NOT EXISTS `projects` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `client_id` int(11) NOT NULL,
  `project_code` varchar(50) NOT NULL,
  `project_name` varchar(255) NOT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `project_status` varchar(50) NOT NULL DEFAULT 'Active',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_projects_project_code` (`project_code`),
  KEY `idx_projects_client_id` (`client_id`),
  CONSTRAINT `fk_projects_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table employee_app.projects: ~5 rows (approximately)
INSERT INTO `projects` (`id`, `client_id`, `project_code`, `project_name`, `start_date`, `end_date`, `project_status`, `is_active`, `is_deleted`, `created_at`, `updated_at`) VALUES
	(1, 1, 'SUN-001', 'E-Class', NULL, NULL, 'Active', 1, 0, '2026-05-21 06:13:53', '2026-05-21 06:13:53'),
	(2, 1, 'SUN-002', 'E-Class\r\n  Dashboard', NULL, NULL, 'Active', 1, 0, '2026-05-21 06:13:53', '2026-05-21 06:13:53'),
	(3, 2, 'ADF-001', 'Kalki', NULL, NULL, 'Active', 1, 0, '2026-05-21 06:13:53', '2026-05-21 06:14:28'),
	(4, 3, 'STR-001', 'pricespy', NULL, NULL, 'Active', 1, 0, '2026-05-21 06:13:53', '2026-05-21 06:14:37'),
	(5, 3, 'STR-002', 'Trade\r\n  Mirror', NULL, NULL, 'Active', 1, 0, '2026-05-21 06:13:53', '2026-05-21 06:13:53');

-- Dumping structure for table employee_app.roles
CREATE TABLE IF NOT EXISTS `roles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `role_name` varchar(50) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_role_name` (`role_name`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table employee_app.roles: ~2 rows (approximately)
INSERT INTO `roles` (`id`, `role_name`, `is_active`, `is_deleted`, `created_at`, `updated_at`) VALUES
	(1, 'Admin', 1, 0, '2026-05-21 05:34:38', '2026-05-21 05:34:38'),
	(2, 'Employee', 1, 0, '2026-05-21 05:34:38', '2026-05-21 05:34:38');

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
