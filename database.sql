
\c notesapp;
CREATE DATABASE notesapp;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE t_users(
  user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_firstname VARCHAR(255) NOT NULL,
  user_lastname VARCHAR(255) NOT NULL,
  user_email VARCHAR(255) NOT NULL UNIQUE,
  user_password VARCHAR(255) NOT NULL,
  CONSTRAINT unique_user_id UNIQUE (user_id),
  CONSTRAINT unique_user_email UNIQUE (user_email)
);

CREATE TABLE t_notes(
  note_id SERIAL PRIMARY KEY,
  user_id UUID,
  title TEXT NOT NULL,
  subject TEXT NULL,
  content TEXT NULL,
  note_version INTEGER DEFAULT 1,
  last_update TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES t_users(user_id)
);

CREATE TABLE t_attachments(
    attachment_id SERIAL PRIMARY KEY,
    note_id INTEGER,
    file_name TEXT NULL,
    file_extension TEXT NULL,
    file_original_name TEXT NULL,
    FOREIGN KEY (note_id) REFERENCES t_notes(note_id)
);

CREATE TABLE t_shared_notes(
    share_id SERIAL PRIMARY KEY,
    note_id INTEGER,
    shared_by UUID,
    shared_with UUID,
    editing_permission INTEGER NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (note_id) REFERENCES t_notes(note_id),
    FOREIGN KEY (shared_by) REFERENCES t_users(user_id),
    FOREIGN KEY (shared_with) REFERENCES t_users(user_id)
);

/* 0: owner   1: samo gleda    2:lahko edita */