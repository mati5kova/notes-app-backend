const router = require('express').Router();
const pool = require('../db');
const authorization = require('../middleware/authorization');

router.get('/info', authorization, async (req, res) => {
    try {
        const user = await pool.query('SELECT user_firstname, user_lastname, user_email FROM t_users WHERE user_id=$1', [req.user.id]);
        res.json(user.rows[0]);
    } catch (error) {
        console.log(error.message);
        res.status(500).json('Server Error');
    }
});

module.exports = router;
