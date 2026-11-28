const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/me', authController.getCurrentCustomer);
router.get('/admin/me', authController.getCurrentAdmin);

module.exports = router;
