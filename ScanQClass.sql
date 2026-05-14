-- MySQL dump 10.13  Distrib 9.2.0, for macos15.2 (arm64)
--
-- Host: localhost    Database: ScanQClass
-- ------------------------------------------------------
-- Server version	9.2.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `Attendance`
--

DROP TABLE IF EXISTS `Attendance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Attendance` (
  `id_attendance` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `id_teacher` int NOT NULL,
  `id_course` int NOT NULL,
  `date` datetime DEFAULT NULL,
  `status` enum('present','absent','late','justified') DEFAULT 'present',
  `justified_by` int DEFAULT NULL,
  `justified_at` datetime DEFAULT NULL,
  `justification_text` text,
  `id_session` int DEFAULT NULL,
  `justification_image` varchar(255) DEFAULT NULL,
  `justification_status` enum('PENDING','APPROVED','REJECTED') DEFAULT NULL,
  `justification_ai_result` varchar(50) DEFAULT NULL,
  `justification_ai_score` decimal(5,2) DEFAULT NULL,
  `justification_ai_comment` text,
  PRIMARY KEY (`id_attendance`),
  KEY `user_id` (`user_id`),
  KEY `id_teacher` (`id_teacher`),
  KEY `id_course` (`id_course`),
  KEY `idx_attendance_session` (`id_session`),
  CONSTRAINT `attendance_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`),
  CONSTRAINT `attendance_ibfk_2` FOREIGN KEY (`id_teacher`) REFERENCES `Info_Teacher` (`id_teacher`),
  CONSTRAINT `attendance_ibfk_3` FOREIGN KEY (`id_course`) REFERENCES `Course` (`id_course`)
) ENGINE=InnoDB AUTO_INCREMENT=408 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Attendance`
--

LOCK TABLES `Attendance` WRITE;
/*!40000 ALTER TABLE `Attendance` DISABLE KEYS */;
/*!40000 ALTER TABLE `Attendance` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Attendance_Session`
--

DROP TABLE IF EXISTS `Attendance_Session`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Attendance_Session` (
  `id_session` int NOT NULL AUTO_INCREMENT,
  `id_course` int NOT NULL,
  `id_teacher` int NOT NULL,
  `id_schedule` int NOT NULL,
  `date` date NOT NULL,
  `status` enum('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
  `opened_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `closed_at` datetime DEFAULT NULL,
  `closed_by` int DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_session`),
  UNIQUE KEY `uq_att_session_course_schedule_date` (`id_course`,`id_schedule`,`date`),
  KEY `idx_att_session_teacher_date` (`id_teacher`,`date`),
  KEY `idx_att_session_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Attendance_Session`
--

LOCK TABLES `Attendance_Session` WRITE;
/*!40000 ALTER TABLE `Attendance_Session` DISABLE KEYS */;
/*!40000 ALTER TABLE `Attendance_Session` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Course`
--

DROP TABLE IF EXISTS `Course`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Course` (
  `id_course` int NOT NULL AUTO_INCREMENT,
  `id_subject` int DEFAULT NULL,
  `name_subject` varchar(80) NOT NULL,
  `id_section` int DEFAULT NULL,
  PRIMARY KEY (`id_course`),
  KEY `fk_course_subject` (`id_subject`),
  KEY `fk_course_section` (`id_section`),
  CONSTRAINT `fk_course_section` FOREIGN KEY (`id_section`) REFERENCES `Section` (`id_section`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_course_subject` FOREIGN KEY (`id_subject`) REFERENCES `Subject` (`id_subject`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Course`
--

LOCK TABLES `Course` WRITE;
/*!40000 ALTER TABLE `Course` DISABLE KEYS */;
/*!40000 ALTER TABLE `Course` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Course_check_backup`
--

DROP TABLE IF EXISTS `Course_check_backup`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Course_check_backup` (
  `id_course` int NOT NULL DEFAULT '0',
  `check_in` datetime DEFAULT NULL,
  `check_out` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Course_check_backup`
--

LOCK TABLES `Course_check_backup` WRITE;
/*!40000 ALTER TABLE `Course_check_backup` DISABLE KEYS */;
INSERT INTO `Course_check_backup` VALUES (3,NULL,NULL),(5,NULL,NULL),(6,NULL,NULL),(10,NULL,NULL),(11,NULL,NULL),(12,NULL,NULL),(13,NULL,NULL),(14,NULL,NULL),(15,NULL,NULL);
/*!40000 ALTER TABLE `Course_check_backup` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Course_Schedule`
--

DROP TABLE IF EXISTS `Course_Schedule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Course_Schedule` (
  `id_schedule` int NOT NULL AUTO_INCREMENT,
  `id_course` int NOT NULL,
  `day_of_week` enum('Lunes','Martes','Miercoles','Jueves','Viernes','Sabado') NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  PRIMARY KEY (`id_schedule`),
  KEY `id_course` (`id_course`),
  CONSTRAINT `course_schedule_ibfk_1` FOREIGN KEY (`id_course`) REFERENCES `Course` (`id_course`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=32 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Course_Schedule`
--

LOCK TABLES `Course_Schedule` WRITE;
/*!40000 ALTER TABLE `Course_Schedule` DISABLE KEYS */;
/*!40000 ALTER TABLE `Course_Schedule` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Course_Section`
--

DROP TABLE IF EXISTS `Course_Section`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Course_Section` (
  `id` int NOT NULL AUTO_INCREMENT,
  `id_course` int NOT NULL,
  `id_section` int NOT NULL,
  `teacher_user_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_course_section` (`id_course`,`id_section`,`teacher_user_id`),
  KEY `fk_cs_section` (`id_section`),
  KEY `fk_cs_teacher` (`teacher_user_id`),
  CONSTRAINT `fk_cs_course` FOREIGN KEY (`id_course`) REFERENCES `Course` (`id_course`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_cs_section` FOREIGN KEY (`id_section`) REFERENCES `Section` (`id_section`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_cs_teacher` FOREIGN KEY (`teacher_user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Course_Section`
--

LOCK TABLES `Course_Section` WRITE;
/*!40000 ALTER TABLE `Course_Section` DISABLE KEYS */;
/*!40000 ALTER TABLE `Course_Section` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Dt_info`
--

DROP TABLE IF EXISTS `Dt_info`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Dt_info` (
  `id_info` int NOT NULL AUTO_INCREMENT,
  `name` varchar(80) NOT NULL,
  `lastname` varchar(80) NOT NULL,
  `birthdate` datetime DEFAULT NULL,
  `phone` varchar(15) DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  PRIMARY KEY (`id_info`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `dt_info_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=632 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Dt_info`
--

LOCK TABLES `Dt_info` WRITE;
/*!40000 ALTER TABLE `Dt_info` DISABLE KEYS */;
INSERT INTO `Dt_info` VALUES (630,'Administrador','Principal',NULL,NULL,662);
/*!40000 ALTER TABLE `Dt_info` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Enrollment`
--

DROP TABLE IF EXISTS `Enrollment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Enrollment` (
  `id_enrollment` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `id_course` int NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_enrollment`),
  UNIQUE KEY `uniq_enrollment` (`user_id`,`id_course`),
  KEY `id_course` (`id_course`),
  CONSTRAINT `enrollment_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`),
  CONSTRAINT `enrollment_ibfk_2` FOREIGN KEY (`id_course`) REFERENCES `Course` (`id_course`)
) ENGINE=InnoDB AUTO_INCREMENT=1131 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Enrollment`
--

LOCK TABLES `Enrollment` WRITE;
/*!40000 ALTER TABLE `Enrollment` DISABLE KEYS */;
/*!40000 ALTER TABLE `Enrollment` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Grade`
--

DROP TABLE IF EXISTS `Grade`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Grade` (
  `id_grade` int NOT NULL AUTO_INCREMENT,
  `name_grade` varchar(20) NOT NULL,
  PRIMARY KEY (`id_grade`),
  UNIQUE KEY `name_grade` (`name_grade`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Grade`
--

LOCK TABLES `Grade` WRITE;
/*!40000 ALTER TABLE `Grade` DISABLE KEYS */;
INSERT INTO `Grade` VALUES (1,'1'),(2,'2'),(3,'3'),(4,'4'),(5,'5'),(6,'6');
/*!40000 ALTER TABLE `Grade` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Info_Student`
--

DROP TABLE IF EXISTS `Info_Student`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Info_Student` (
  `id_student` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `student_code` varchar(30) NOT NULL,
  `id_section` int NOT NULL,
  `average` decimal(5,2) DEFAULT NULL,
  `status` enum('regular','irregular') DEFAULT 'regular',
  `id_sex` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_student`),
  UNIQUE KEY `user_id` (`user_id`),
  UNIQUE KEY `student_code` (`student_code`),
  KEY `fk_student_sex` (`id_sex`),
  KEY `idx_student_code` (`student_code`),
  KEY `idx_student_section` (`id_section`),
  CONSTRAINT `fk_student_section` FOREIGN KEY (`id_section`) REFERENCES `Section` (`id_section`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_student_sex` FOREIGN KEY (`id_sex`) REFERENCES `Sex` (`id_sex`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_student_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=605 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Info_Student`
--

LOCK TABLES `Info_Student` WRITE;
/*!40000 ALTER TABLE `Info_Student` DISABLE KEYS */;
/*!40000 ALTER TABLE `Info_Student` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Info_Teacher`
--

DROP TABLE IF EXISTS `Info_Teacher`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Info_Teacher` (
  `id_teacher` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `id_course` int NOT NULL,
  `pdf_file_id` int DEFAULT NULL,
  PRIMARY KEY (`id_teacher`),
  KEY `user_id` (`user_id`),
  KEY `id_course` (`id_course`),
  KEY `fk_it_pdf` (`pdf_file_id`),
  CONSTRAINT `fk_it_pdf` FOREIGN KEY (`pdf_file_id`) REFERENCES `PdfFiles` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `info_teacher_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`),
  CONSTRAINT `info_teacher_ibfk_2` FOREIGN KEY (`id_course`) REFERENCES `Course` (`id_course`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Info_Teacher`
--

LOCK TABLES `Info_Teacher` WRITE;
/*!40000 ALTER TABLE `Info_Teacher` DISABLE KEYS */;
/*!40000 ALTER TABLE `Info_Teacher` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `title` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `type` varchar(50) DEFAULT 'general',
  `is_read` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_notifications_user` (`user_id`),
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=88 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `PdfFiles`
--

DROP TABLE IF EXISTS `PdfFiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `PdfFiles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `filename` varchar(255) NOT NULL,
  `mime_type` varchar(50) NOT NULL,
  `file_data` longblob NOT NULL,
  `uploaded_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `id_course` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_pdf_course` (`id_course`),
  CONSTRAINT `fk_pdf_course` FOREIGN KEY (`id_course`) REFERENCES `Course` (`id_course`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `PdfFiles`
--

LOCK TABLES `PdfFiles` WRITE;
/*!40000 ALTER TABLE `PdfFiles` DISABLE KEYS */;
/*!40000 ALTER TABLE `PdfFiles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Rols`
--

DROP TABLE IF EXISTS `Rols`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Rols` (
  `id_rol` int NOT NULL AUTO_INCREMENT,
  `name_rol` varchar(20) NOT NULL,
  PRIMARY KEY (`id_rol`),
  UNIQUE KEY `name_rol` (`name_rol`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Rols`
--

LOCK TABLES `Rols` WRITE;
/*!40000 ALTER TABLE `Rols` DISABLE KEYS */;
INSERT INTO `Rols` VALUES (1,'admin'),(3,'student'),(2,'teacher');
/*!40000 ALTER TABLE `Rols` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Section`
--

DROP TABLE IF EXISTS `Section`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Section` (
  `id_section` int NOT NULL AUTO_INCREMENT,
  `id_grade` int NOT NULL,
  `id_group` int NOT NULL,
  `id_turn` int NOT NULL,
  `name` varchar(30) NOT NULL,
  PRIMARY KEY (`id_section`),
  UNIQUE KEY `name` (`name`),
  UNIQUE KEY `uq_section_combo` (`id_grade`,`id_group`,`id_turn`),
  KEY `fk_section_group` (`id_group`),
  KEY `fk_section_turn` (`id_turn`),
  CONSTRAINT `fk_section_grade` FOREIGN KEY (`id_grade`) REFERENCES `Grade` (`id_grade`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_section_group` FOREIGN KEY (`id_group`) REFERENCES `SGroups` (`id_group`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_section_turn` FOREIGN KEY (`id_turn`) REFERENCES `Turn` (`id_turn`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=76 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Section`
--

LOCK TABLES `Section` WRITE;
/*!40000 ALTER TABLE `Section` DISABLE KEYS */;
INSERT INTO `Section` VALUES (2,1,1,1,'A11'),(3,1,1,2,'A21'),(4,1,2,1,'B11'),(5,1,2,2,'B21'),(6,1,3,1,'C11'),(7,1,3,2,'C21'),(8,1,4,1,'D11'),(9,1,4,2,'D21'),(10,1,5,1,'E11'),(11,1,5,2,'E21'),(13,1,6,1,'F11'),(14,1,6,2,'F21'),(15,2,1,1,'A12'),(16,2,1,2,'A22'),(17,2,2,1,'B12'),(18,2,2,2,'B22'),(19,2,3,1,'C12'),(20,2,3,2,'C22'),(21,2,4,1,'D12'),(22,2,4,2,'D22'),(23,2,5,1,'E12'),(24,2,5,2,'E22'),(25,2,6,1,'F12'),(26,2,6,2,'F22'),(27,3,1,1,'A13'),(28,3,1,2,'A23'),(29,3,2,1,'B13'),(30,3,2,2,'B23'),(31,3,3,1,'C13'),(32,3,3,2,'C23'),(33,3,4,1,'D13'),(34,3,4,2,'D23'),(35,3,5,1,'E13'),(36,3,5,2,'E23'),(37,3,6,1,'F13'),(38,3,6,2,'F23'),(39,3,7,1,'G13'),(40,4,1,1,'A14'),(41,4,1,2,'A24'),(42,4,2,1,'B14'),(43,4,2,2,'B24'),(44,4,3,1,'C14'),(45,4,3,2,'C24'),(46,4,4,1,'D14'),(47,4,4,2,'D24'),(48,4,5,1,'E14'),(49,4,5,2,'E24'),(50,4,6,1,'F14'),(51,4,6,2,'F24'),(52,5,1,1,'A15'),(53,5,1,2,'A25'),(54,5,2,1,'B15'),(55,5,2,2,'B25'),(56,5,3,1,'C15'),(57,5,3,2,'C25'),(58,5,4,1,'D15'),(59,5,4,2,'D25'),(60,5,5,1,'E15'),(61,5,5,2,'E25'),(62,5,6,1,'F15'),(63,5,6,2,'F25'),(64,6,1,1,'A16'),(65,6,1,2,'A26'),(66,6,2,1,'B16'),(67,6,2,2,'B26'),(68,6,3,1,'C16'),(69,6,3,2,'C26'),(70,6,4,1,'D16'),(71,6,4,2,'D26'),(72,6,5,1,'E16'),(73,6,5,2,'E26'),(74,6,6,1,'F16'),(75,6,6,2,'F26');
/*!40000 ALTER TABLE `Section` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `before_insert_section` BEFORE INSERT ON `Section` FOR EACH ROW BEGIN
  DECLARE groupName VARCHAR(5);
  DECLARE turnId INT;
  DECLARE gradeId INT;

  SELECT name_group INTO groupName FROM SGroups WHERE id_group = NEW.id_group;
  SET turnId = NEW.id_turn;
  SET gradeId = NEW.id_grade;

  SET NEW.name = CONCAT(groupName, turnId, gradeId);
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `Sex`
--

DROP TABLE IF EXISTS `Sex`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Sex` (
  `id_sex` int NOT NULL AUTO_INCREMENT,
  `name_sex` varchar(10) NOT NULL,
  `name_abbreviation` varchar(5) NOT NULL,
  PRIMARY KEY (`id_sex`),
  UNIQUE KEY `name_sex` (`name_sex`),
  UNIQUE KEY `name_abbreviation` (`name_abbreviation`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Sex`
--

LOCK TABLES `Sex` WRITE;
/*!40000 ALTER TABLE `Sex` DISABLE KEYS */;
INSERT INTO `Sex` VALUES (1,'Femenino','F'),(2,'Masculino','M');
/*!40000 ALTER TABLE `Sex` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `SGroups`
--

DROP TABLE IF EXISTS `SGroups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `SGroups` (
  `id_group` int NOT NULL AUTO_INCREMENT,
  `name_group` varchar(2) NOT NULL,
  PRIMARY KEY (`id_group`),
  UNIQUE KEY `name_group` (`name_group`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `SGroups`
--

LOCK TABLES `SGroups` WRITE;
/*!40000 ALTER TABLE `SGroups` DISABLE KEYS */;
INSERT INTO `SGroups` VALUES (1,'A'),(2,'B'),(3,'C'),(4,'D'),(5,'E'),(6,'F'),(7,'G');
/*!40000 ALTER TABLE `SGroups` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Subject`
--

DROP TABLE IF EXISTS `Subject`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Subject` (
  `id_subject` int NOT NULL AUTO_INCREMENT,
  `name_subject` varchar(100) NOT NULL,
  PRIMARY KEY (`id_subject`),
  UNIQUE KEY `name_subject` (`name_subject`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Subject`
--

LOCK TABLES `Subject` WRITE;
/*!40000 ALTER TABLE `Subject` DISABLE KEYS */;
/*!40000 ALTER TABLE `Subject` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `TeacherCourseDoc`
--

DROP TABLE IF EXISTS `TeacherCourseDoc`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `TeacherCourseDoc` (
  `id` int NOT NULL AUTO_INCREMENT,
  `id_teacher` int NOT NULL,
  `id_course` int NOT NULL,
  `id_pdf` int NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_tcd` (`id_teacher`,`id_course`,`id_pdf`),
  KEY `fk_tcd_course` (`id_course`),
  KEY `fk_tcd_pdf` (`id_pdf`),
  CONSTRAINT `fk_tcd_course` FOREIGN KEY (`id_course`) REFERENCES `Course` (`id_course`) ON DELETE CASCADE,
  CONSTRAINT `fk_tcd_pdf` FOREIGN KEY (`id_pdf`) REFERENCES `PdfFiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tcd_teacher` FOREIGN KEY (`id_teacher`) REFERENCES `Info_Teacher` (`id_teacher`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `TeacherCourseDoc`
--

LOCK TABLES `TeacherCourseDoc` WRITE;
/*!40000 ALTER TABLE `TeacherCourseDoc` DISABLE KEYS */;
/*!40000 ALTER TABLE `TeacherCourseDoc` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Turn`
--

DROP TABLE IF EXISTS `Turn`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Turn` (
  `id_turn` int NOT NULL AUTO_INCREMENT,
  `name_turn` varchar(20) NOT NULL,
  PRIMARY KEY (`id_turn`),
  UNIQUE KEY `name_turn` (`name_turn`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Turn`
--

LOCK TABLES `Turn` WRITE;
/*!40000 ALTER TABLE `Turn` DISABLE KEYS */;
INSERT INTO `Turn` VALUES (3,'Honorifica'),(1,'Matutino'),(2,'Vespertino');
/*!40000 ALTER TABLE `Turn` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Users`
--

DROP TABLE IF EXISTS `Users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(150) NOT NULL,
  `password` varchar(255) NOT NULL,
  `level` int DEFAULT '3',
  `reset_token_hash` varchar(64) DEFAULT NULL,
  `reset_token_expires` datetime DEFAULT NULL,
  `must_change_password` tinyint(1) NOT NULL DEFAULT '0',
  `is_super_admin` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `level` (`level`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`level`) REFERENCES `Rols` (`id_rol`)
) ENGINE=InnoDB AUTO_INCREMENT=664 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Users`
--

LOCK TABLES `Users` WRITE;
/*!40000 ALTER TABLE `Users` DISABLE KEYS */;
INSERT INTO `Users` VALUES (662,'admin@sems.udg.mx','$2b$10$h4fj7C7oIlWjUd5y.0MXyuP9qdP7w8D.w8etou.a1.731SrnHMepK',1,NULL,NULL,0,1);
/*!40000 ALTER TABLE `Users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-05-13 22:39:40
