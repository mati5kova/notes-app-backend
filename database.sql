CREATE DATABASE notesapp;

\c notesapp;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE t_users(
  user_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_firstname VARCHAR(255) NOT NULL,
  user_lastname VARCHAR(255) NOT NULL,
  user_email VARCHAR(255) NOT NULL UNIQUE,
  user_password VARCHAR(255) NOT NULL
);

CREATE TABLE t_notes(
  note_id SERIAL PRIMARY KEY,
  user_id UUID,
  title TEXT NOT NULL,
  content TEXT NULL,
  last_update TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES t_users(user_id)
);

CREATE TABLE t_attachments(
    attachment_id SERIAL PRIMARY KEY,
    user_id UUID,
    note_id INTEGER,
    file_name TEXT NULL,
    FOREIGN KEY (note_id) REFERENCES t_notes(note_id),
    FOREIGN KEY (user_id) REFERENCES t_users(user_id)
);

/* INSERT INTO users (user_name, user_email, user_password) VALUES ('Matevž', 'matevz', 'kthl8822'); */