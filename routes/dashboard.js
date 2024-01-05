const router = require('express').Router();
const pool = require('../db');
const authorization = require('../middleware/authorization');
const bcrypt = require('bcrypt');

router.get('/info', authorization, async (req, res) => {
    try {
        const user = await pool.query('SELECT user_firstname, user_lastname, user_email FROM t_users WHERE user_id=$1', [req.user.id]);
        res.json(user.rows[0]);
    } catch (error) {
        console.log(error.message);
        res.status(500).json('Server Error');
    }
});

router.post('/change-credentials', authorization, async (req, res) => {
    const { currentPassword, newPassword, repeatPassword } = req.body;
    //če sta nova passworda enaka
    if (newPassword !== repeatPassword) {
        return res.json({ msg: 'Passwords do not match' });
    }
    try {
        //preverimo če je trenutno geslo pravo
        const current = await pool.query('SELECT user_password FROM t_users WHERE user_id=$1', [req.user.id]);
        const validPassword = await bcrypt.compare(currentPassword, current.rows[0].user_password);
        if (validPassword === false) {
            return res.json({ msg: 'Password incorrect' });
        }

        const samePassword = await bcrypt.compare(newPassword, current.rows[0].user_password);
        if (samePassword === true) {
            return res.json({ msg: "New password can't be your old password" });
        }

        //bcryptamo novo geslo
        const saltRound = 10;
        const salt = await bcrypt.genSalt(saltRound);
        const bcryptPassword = await bcrypt.hash(newPassword, salt);
        //updatamo polje
        const updated = await pool.query('UPDATE t_users SET user_password=$1 WHERE user_id=$2', [bcryptPassword, req.user.id]);
        if (updated.rowCount === 0) {
            return res.status(500).json({ msg: 'Failed to update password' });
        }

        res.json({ msg: 'Password updated' });
    } catch (error) {
        console.log(error.message);
        res.status(500).json('Server Error');
    }
});

module.exports = router;
