
const pool = require('../config/db');
const pdfParse = require('pdf-parse');
const fs = require('fs');

const callClaude = async (prompt) => {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Groq API error');
  return data.choices[0].message.content;
};

const uploadMaterial = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  const { classId, title } = req.body;
  if (!classId || !title) return res.status(400).json({ error: 'classId and title are required.' });
  try {
    const dataBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(dataBuffer);
    const rawText = pdfData.text;
    if (!rawText || rawText.trim().length < 100) return res.status(400).json({ error: 'PDF appears empty or unreadable.' });
    const truncatedText = rawText.slice(0, 8000);
    const summaryPrompt = `You are a study assistant. Summarize the following study material clearly for students.\n\nFormat:\n**Overview:** (2-3 sentences)\n**Key Concepts:** (bullet points)\n**Important Points:** (bullet points)\n\nMaterial:\n${truncatedText}`;
    const aiSummary = await callClaude(summaryPrompt);
    const result = await pool.query(
      `INSERT INTO materials (title, class_id, uploaded_by, file_path, raw_text, ai_summary) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title, classId, req.user.id, req.file.path, rawText, aiSummary]
    );
    res.status(201).json({ message: 'Material uploaded and summarized.', material: result.rows[0] });
  } catch (err) {
    console.error('Upload error:', err);
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupErr) {
        console.error('Failed to delete file on processing failure:', cleanupErr);
      }
    }
    res.status(500).json({ error: 'Failed to process material: ' + err.message });
  }
};

const generateQuiz = async (req, res) => {
  const { id } = req.params;
  const { numQuestions = 5 } = req.body;
  try {
    const matResult = await pool.query('SELECT * FROM materials WHERE id = $1', [id]);
    if (matResult.rows.length === 0) return res.status(404).json({ error: 'Material not found.' });
    const truncatedText = matResult.rows[0].raw_text.slice(0, 6000);
    const quizPrompt = `Generate ${numQuestions} multiple choice questions from this material.\n\nReturn ONLY a valid JSON array, no other text:\n[\n  {\n    "question": "question text",\n    "options": ["A. opt1", "B. opt2", "C. opt3", "D. opt4"],\n    "answer": "A",\n    "explanation": "why this is correct"\n  }\n]\n\nMaterial:\n${truncatedText}`;
    const rawResponse = await callClaude(quizPrompt);
    const jsonMatch = rawResponse.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (!jsonMatch) throw new Error("Could not find a valid JSON array in model response");
    const questions = JSON.parse(jsonMatch[0]);
    const quizResult = await pool.query(
      `INSERT INTO quizzes (material_id, title, questions) VALUES ($1, $2, $3) RETURNING *`,
      [id, `Quiz: ${matResult.rows[0].title}`, JSON.stringify(questions)]
    );
    res.status(201).json(quizResult.rows[0]);
  } catch (err) {
    console.error('Quiz error:', err);
    res.status(500).json({ error: 'Failed to generate quiz: ' + err.message });
  }
};

const getClassMaterials = async (req, res) => {
  const { classId } = req.params;
  try {
    const result = await pool.query(
      `SELECT m.id, m.title, m.ai_summary, m.created_at, u.name AS uploaded_by
       FROM materials m JOIN users u ON m.uploaded_by = u.id
       WHERE m.class_id = $1 ORDER BY m.created_at DESC`,
      [classId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
};

const getMaterialById = async (req, res) => {
  const { id } = req.params;
  try {
    const matResult = await pool.query('SELECT * FROM materials WHERE id = $1', [id]);
    if (matResult.rows.length === 0) return res.status(404).json({ error: 'Not found.' });
    const quizzes = await pool.query('SELECT id, title, created_at FROM quizzes WHERE material_id = $1', [id]);
    const material = matResult.rows[0];
    delete material.raw_text;
    res.json({ ...material, quizzes: quizzes.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = { uploadMaterial, generateQuiz, getClassMaterials, getMaterialById };
