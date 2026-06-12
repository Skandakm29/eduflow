-- Run this file once to set up your database
-- Command: psql -U postgres -d eduflow -f src/config/schema.sql

-- Users table (both teachers and students)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('teacher', 'student')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Classes (a teacher creates a class, students join it)
CREATE TABLE IF NOT EXISTS classes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  subject VARCHAR(100),
  teacher_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  join_code VARCHAR(10) UNIQUE NOT NULL, -- students use this to join
  created_at TIMESTAMP DEFAULT NOW()
);

-- Which students belong to which class
CREATE TABLE IF NOT EXISTS class_enrollments (
  id SERIAL PRIMARY KEY,
  class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(class_id, student_id) -- a student can't join the same class twice
);

-- Study materials uploaded by teachers
CREATE TABLE IF NOT EXISTS materials (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  uploaded_by INTEGER REFERENCES users(id),
  file_path VARCHAR(500),          -- where the PDF is stored on disk
  raw_text TEXT,                   -- extracted text from PDF
  ai_summary TEXT,                 -- Claude-generated summary
  created_at TIMESTAMP DEFAULT NOW()
);

-- Attendance records
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status VARCHAR(10) CHECK (status IN ('present', 'absent', 'late')),
  marked_by INTEGER REFERENCES users(id), -- teacher who marked it
  UNIQUE(class_id, student_id, date)      -- one record per student per day per class
);

-- Marks / grades
CREATE TABLE IF NOT EXISTS marks (
  id SERIAL PRIMARY KEY,
  class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  exam_name VARCHAR(100) NOT NULL,
  score DECIMAL(5,2),
  max_score DECIMAL(5,2) DEFAULT 100,
  recorded_by INTEGER REFERENCES users(id),
  recorded_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(class_id, student_id, exam_name)
);

-- AI-generated quizzes
CREATE TABLE IF NOT EXISTS quizzes (
  id SERIAL PRIMARY KEY,
  material_id INTEGER REFERENCES materials(id) ON DELETE CASCADE,
  title VARCHAR(200),
  questions JSONB NOT NULL,  -- stores array of {question, options, answer} as JSON
  created_at TIMESTAMP DEFAULT NOW()
);

-- Student quiz attempts
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id SERIAL PRIMARY KEY,
  quiz_id INTEGER REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER,
  total INTEGER,
  answers JSONB,   -- student's submitted answers
  attempted_at TIMESTAMP DEFAULT NOW()
);
