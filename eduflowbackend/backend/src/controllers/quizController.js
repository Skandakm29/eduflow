const pool = require('../config/db');

// GET /api/quizzes/:id
const getQuizById = async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch quiz and join with material to get class_id for authorization
    const result = await pool.query(
      `SELECT q.id, q.material_id, q.title, q.questions, q.created_at, m.class_id
       FROM quizzes q
       JOIN materials m ON q.material_id = m.id
       WHERE q.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quiz not found.' });
    }

    const quiz = result.rows[0];

    // Authorization check
    if (req.user.role === 'teacher') {
      const classCheck = await pool.query(
        'SELECT id FROM classes WHERE id = $1 AND teacher_id = $2',
        [quiz.class_id, req.user.id]
      );
      if (classCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    } else {
      const enrollmentCheck = await pool.query(
        'SELECT id FROM class_enrollments WHERE class_id = $1 AND student_id = $2',
        [quiz.class_id, req.user.id]
      );
      if (enrollmentCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied. You are not enrolled in this class.' });
      }
    }

    res.json(quiz);
  } catch (err) {
    console.error('Get quiz error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

// POST /api/quizzes/:id/submit
const submitQuizAttempt = async (req, res) => {
  const { id } = req.params;
  const { answers } = req.body; // Expects array of answers e.g. ["A", "B", "C", ...]

  if (!answers || !Array.isArray(answers)) {
    return res.status(400).json({ error: 'Answers array is required.' });
  }

  try {
    const result = await pool.query(
      `SELECT q.id, q.questions, q.title, m.class_id
       FROM quizzes q
       JOIN materials m ON q.material_id = m.id
       WHERE q.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quiz not found.' });
    }

    const quiz = result.rows[0];
    const questions = typeof quiz.questions === 'string' ? JSON.parse(quiz.questions) : quiz.questions;

    // Check student enrollment
    const enrollmentCheck = await pool.query(
      'SELECT id FROM class_enrollments WHERE class_id = $1 AND student_id = $2',
      [quiz.class_id, req.user.id]
    );
    if (enrollmentCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied. You are not enrolled in this class.' });
    }

    // Evaluate answers
    let score = 0;
    const total = questions.length;
    const results = questions.map((q, idx) => {
      // Standardize user's answer (some systems send option letter, others option index)
      const userAnswer = (answers[idx] || '').trim().toUpperCase();
      const correctAnswer = (q.answer || '').trim().toUpperCase();
      const isCorrect = userAnswer === correctAnswer;

      if (isCorrect) {
        score += 1;
      }

      return {
        question: q.question,
        options: q.options,
        correctAnswer,
        userAnswer,
        isCorrect,
        explanation: q.explanation
      };
    });

    // Record the attempt
    const attemptResult = await pool.query(
      `INSERT INTO quiz_attempts (quiz_id, student_id, score, total, answers)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, req.user.id, score, total, JSON.stringify(answers)]
    );

    res.status(201).json({
      message: 'Quiz submitted successfully.',
      attempt: attemptResult.rows[0],
      score,
      total,
      results
    });
  } catch (err) {
    console.error('Submit quiz error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

// GET /api/quizzes/:id/attempts
const getQuizAttempts = async (req, res) => {
  const { id } = req.params;

  try {
    const quizResult = await pool.query(
      `SELECT q.id, m.class_id
       FROM quizzes q
       JOIN materials m ON q.material_id = m.id
       WHERE q.id = $1`,
      [id]
    );

    if (quizResult.rows.length === 0) {
      return res.status(404).json({ error: 'Quiz not found.' });
    }

    const quiz = quizResult.rows[0];
    let result;

    if (req.user.role === 'teacher') {
      // Teacher authorization check
      const classCheck = await pool.query(
        'SELECT id FROM classes WHERE id = $1 AND teacher_id = $2',
        [quiz.class_id, req.user.id]
      );
      if (classCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      // Fetch all attempts for this quiz
      result = await pool.query(
        `SELECT qa.id, qa.score, qa.total, qa.attempted_at, u.name AS student_name, u.email AS student_email
         FROM quiz_attempts qa
         JOIN users u ON qa.student_id = u.id
         WHERE qa.quiz_id = $1
         ORDER BY qa.attempted_at DESC`,
        [id]
      );
    } else {
      // Student fetches their own attempts
      result = await pool.query(
        `SELECT id, score, total, attempted_at
         FROM quiz_attempts
         WHERE quiz_id = $1 AND student_id = $2
         ORDER BY attempted_at DESC`,
        [id, req.user.id]
      );
    }

    res.json(result.rows);
  } catch (err) {
    console.error('Get attempts error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = { getQuizById, submitQuizAttempt, getQuizAttempts };
