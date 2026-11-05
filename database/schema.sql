SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(50) NOT NULL,
  permissions JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admins (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(50) NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  organization VARCHAR(100) NULL,
  note VARCHAR(500) NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  all_venues TINYINT(1) NOT NULL DEFAULT 0,
  venue_ids JSON NOT NULL,
  notice_enabled TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_admins_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_codes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_login_codes_phone_created (phone, created_at),
  INDEX idx_login_codes_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS venues (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  township VARCHAR(50) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  image_url VARCHAR(500) NULL,
  safety_note TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_venues_township_sort (township, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS venue_profiles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  venue_id BIGINT UNSIGNED NOT NULL UNIQUE,
  registration_date DATE NULL,
  religion VARCHAR(50) NULL,
  category VARCHAR(50) NULL,
  manager VARCHAR(50) NULL,
  phone VARCHAR(30) NULL,
  approval_authority VARCHAR(150) NULL,
  credit_code VARCHAR(50) NULL,
  address VARCHAR(255) NULL,
  summary TEXT NULL,
  extra JSON NOT NULL,
  state VARCHAR(32) NOT NULL DEFAULT 'draft',
  published TINYINT(1) NOT NULL DEFAULT 0,
  submitted_at DATETIME NULL,
  town_note VARCHAR(500) NULL,
  town_reviewed_at DATETIME NULL,
  county_note VARCHAR(500) NULL,
  county_reviewed_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_profiles_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personnel (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  venue_id BIGINT UNSIGNED NOT NULL UNIQUE,
  members JSON NOT NULL,
  state VARCHAR(32) NOT NULL DEFAULT 'draft',
  published TINYINT(1) NOT NULL DEFAULT 0,
  submitted_at DATETIME NULL,
  town_note VARCHAR(500) NULL,
  town_reviewed_at DATETIME NULL,
  county_note VARCHAR(500) NULL,
  county_reviewed_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_personnel_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS safety_articles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  cover_url VARCHAR(500) NULL,
  content MEDIUMTEXT NOT NULL,
  author_name VARCHAR(50) NULL,
  author_role VARCHAR(32) NULL,
  publish_unit VARCHAR(100) NULL,
  state VARCHAR(32) NOT NULL DEFAULT 'draft',
  published TINYINT(1) NOT NULL DEFAULT 0,
  submitted_at DATETIME NULL,
  town_note VARCHAR(500) NULL,
  town_reviewed_at DATETIME NULL,
  county_note VARCHAR(500) NULL,
  county_reviewed_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_safety_public (state, published, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS safety_article_venues (
  article_id BIGINT UNSIGNED NOT NULL,
  venue_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (article_id, venue_id),
  INDEX idx_safety_venues_venue (venue_id),
  CONSTRAINT fk_safety_venues_article FOREIGN KEY (article_id) REFERENCES safety_articles(id) ON DELETE CASCADE,
  CONSTRAINT fk_safety_venues_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS news_categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS news_articles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  summary VARCHAR(500) NULL,
  cover_url VARCHAR(500) NULL,
  content MEDIUMTEXT NOT NULL,
  author_name VARCHAR(50) NULL,
  published TINYINT(1) NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_news_public (published, created_at),
  INDEX idx_news_category (category_id),
  CONSTRAINT fk_news_category FOREIGN KEY (category_id) REFERENCES news_categories(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notices (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  cover_url VARCHAR(500) NULL,
  content MEDIUMTEXT NOT NULL,
  author_name VARCHAR(50) NULL,
  published TINYINT(1) NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_notices_public (kind, published, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notice_reads (
  notice_id BIGINT UNSIGNED NOT NULL,
  admin_id BIGINT UNSIGNED NOT NULL,
  read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notice_id, admin_id),
  CONSTRAINT fk_notice_reads_notice FOREIGN KEY (notice_id) REFERENCES notices(id) ON DELETE CASCADE,
  CONSTRAINT fk_notice_reads_admin FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bills (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  venue_id BIGINT UNSIGNED NOT NULL,
  bill_month CHAR(7) NOT NULL,
  income DECIMAL(14,2) NOT NULL DEFAULT 0,
  expense DECIMAL(14,2) NOT NULL DEFAULT 0,
  previous_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  current_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  state VARCHAR(32) NOT NULL DEFAULT 'draft',
  published TINYINT(1) NOT NULL DEFAULT 0,
  submitted_at DATETIME NULL,
  town_note VARCHAR(500) NULL,
  town_reviewed_at DATETIME NULL,
  county_note VARCHAR(500) NULL,
  county_reviewed_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bills_venue_month (venue_id, bill_month),
  INDEX idx_bills_public (venue_id, bill_month, state, published),
  CONSTRAINT fk_bills_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bill_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bill_id BIGINT UNSIGNED NOT NULL,
  venue_id BIGINT UNSIGNED NOT NULL,
  occurred_on DATE NOT NULL,
  kind VARCHAR(16) NOT NULL,
  summary VARCHAR(100) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_bill_items_bill_date (bill_id, occurred_on),
  INDEX idx_bill_items_venue_date (venue_id, occurred_on),
  CONSTRAINT fk_bill_items_bill FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE,
  CONSTRAINT fk_bill_items_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS operation_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id BIGINT UNSIGNED NULL,
  admin_name VARCHAR(50) NULL,
  module VARCHAR(50) NOT NULL,
  target VARCHAR(200) NULL,
  action VARCHAR(100) NOT NULL,
  ip VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_logs_admin_time (admin_id, created_at),
  INDEX idx_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO roles (id, code, name, permissions) VALUES
  (1, 'county', '县级管理员', JSON_ARRAY('dashboard:view','venues:view','venues:edit','venues:delete','venues:review','venues:publish','personnel:view','personnel:edit','personnel:review','personnel:publish','safety:view','safety:edit','safety:delete','safety:review','safety:publish','news:view','news:edit','news:delete','news:publish','notices:view','notices:edit','notices:delete','notices:publish','finance:view','finance:edit','finance:delete','finance:review','finance:publish')),
  (2, 'town', '镇级管理员', JSON_ARRAY('dashboard:view','venues:view','venues:review','venues:publish','personnel:view','personnel:review','personnel:publish','safety:view','news:view','notices:view','finance:view','finance:review','finance:publish')),
  (3, 'venue', '场所管理员', JSON_ARRAY('dashboard:view','venues:view','venues:edit','personnel:view','personnel:edit','safety:view','safety:edit','safety:publish','news:view','notices:view','finance:view','finance:edit')),
  (999, 'super', '系统管理员', JSON_ARRAY('*'))
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO admins (phone, name, role_id, organization, all_venues, venue_ids)
SELECT '15224499331', '系统管理员', 999, '系统', 1, JSON_ARRAY()
WHERE NOT EXISTS (SELECT 1 FROM admins);
