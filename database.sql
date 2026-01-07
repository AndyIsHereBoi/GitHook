-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Host: 
-- Generation Time: Jan 07, 2026 at 08:40 AM
-- Server version: 10.9.8-MariaDB-1:10.9.8+maria~ubu2004
-- PHP Version: 8.3.29

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

CREATE TABLE `cookies` (
  `usernumber` int(11) NOT NULL,
  `cookie` varchar(15) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `hooks` (
  `hookId` varchar(36) NOT NULL,
  `ownerNumber` int(11) NOT NULL,
  `timesRan` bigint(20) NOT NULL DEFAULT 0,
  `timesFailed` bigint(20) NOT NULL DEFAULT 0,
  `requestHeaders` text NOT NULL DEFAULT '{}',
  `requestBody` text NOT NULL DEFAULT '{}',
  `requestMethod` set('post','patch','delete','get','') NOT NULL DEFAULT 'post',
  `lastRanAt` bigint(20) NOT NULL DEFAULT 0,
  `lastEditedAt` text NOT NULL DEFAULT '0',
  `customName` text NOT NULL DEFAULT 'Custom Name',
  `requestUrl` text NOT NULL DEFAULT 'https://example...'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- example row
INSERT INTO `hooks` (`hookId`, `ownerNumber`, `timesRan`, `timesFailed`, `requestHeaders`, `requestBody`, `requestMethod`, `lastRanAt`, `lastEditedAt`, `customName`, `requestUrl`) VALUES
('327f0001-150b-4318-9ad5-08ba7311403c', 1, 0, 0, '{\"Authorization\":\"Bearer xxxxx\"}', '{\"signal\":\"restart\"}', 'post', 0, '1687754075268', 'Restart GitHook Webserver', 'https://xxxxxxxxx/api/client/servers/a38e98c8/power'),


CREATE TABLE `users` (
  `usernumber` int(11) NOT NULL,
  `username` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `hooks`
  ADD PRIMARY KEY (`hookId`),
  ADD UNIQUE KEY `secret` (`hookId`);

ALTER TABLE `users`
  ADD PRIMARY KEY (`usernumber`);

ALTER TABLE `users`
  MODIFY `usernumber` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=120;
COMMIT;
