const pool = require('../config/db');

// POST /api/marks — teacher records marks
const addMarks = async (req, res) => {
  const { classId, examName, records } = req.body;
  // records = [{ studentId, score, maxScore }]

  if (!classId || !examName || !records?.length) {
    return res.status(400).json({ error: 'classId, examName, and records are required.' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const record of records) {
        await client.query(
          `INSERT INTO marks (class_id, student_id, exam_name, score, max_score, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (class_id, student_id, exam_name)
           DO UPDATE SET score = EXCLUDED.score, max_score = EXCLUDED.max_score, recorded_by = EXCLUDED.recorded_by`,
          [classId, record.studentId, examName, record.score, record.maxScore || 100, req.user.id]
        );
      }

      await client.query('COMMIT');
      res.status(201).json({ message: 'Marks recorded successfully.' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Add marks error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

// GET /api/marks/class/:classId — teacher sees all marks for a class
const getClassMarks = async (req, res) => {
  const { classId } = req.params;

  try {
    const result = await pool.query(
      `SELECT m.*, u.name AS student_name
       FROM marks m
       JOIN users u ON m.student_id = u.id
       WHERE m.class_id = $1
       ORDER BY m.exam_name, u.name`,
      [classId]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
};

// GET /api/marks/student/me — student sees their own marks
const getMyMarks = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, c.name AS class_name, c.subject
       FROM marks m
       JOIN classes c ON m.class_id = c.id
       WHERE m.student_id = $1
       ORDER BY m.recorded_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = { addMarks, getClassMarks, getMyMarks };
