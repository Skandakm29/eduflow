const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { getQuizById, submitQuizAttempt, getQuizAttempts } = require('../controllers/quizController');

router.use(authenticate);

router.get('/:id', getQuizById);
router.post('/:id/submit', submitQuizAttempt);
router.get('/:id/attempts', getQuizAttempts);

module.exports = router;
