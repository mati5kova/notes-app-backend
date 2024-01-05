const router = require('express').Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const jwtGenerator = require('../utils/jwtGenerator');
const authorization = require('../middleware/authorization');

//register
router.post('/register', async (req, res) => {
    try {
        //destrukturiramo request
        const { firstName, lastName, email, password, confirmPassword } = req.body;

        //preverimo če že obstaja account
        const user = await pool.query('SELECT user_id FROM t_users WHERE user_email = $1', [email]);
        if (user.rows.length !== 0) {
            return res.status(401).json('User already exists');
        }

        //bcrypt geslo
        const saltRound = 10;
        const salt = await bcrypt.genSalt(saltRound);
        const bcryptPassword = await bcrypt.hash(password, salt);

        //insert user v db
        const newUser = await pool.query(
            'INSERT INTO t_users (user_firstname, user_lastname, user_email, user_password) VALUES($1, $2, $3, $4) RETURNING user_id',
            [firstName, lastName, email, bcryptPassword]
        );

        //ustvari jwt token
        const token = jwtGenerator(newUser.rows[0].user_id);
        res.json({ token });
    } catch (error) {
        console.log(error.message);
        res.status(500).json('Server Error');
    }
});

//login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        //pogledamo če user obstaja
        const user = await pool.query('SELECT user_id, user_password FROM t_users WHERE user_email=$1', [email]);
        if (user.rows.length === 0) {
            return res.status(403).json("User doesn't exist");
        }
        //bycriptamo geslo, preverimo v db
        const validPassword = await bcrypt.compare(password, user.rows[0].user_password);
        if (!validPassword) {
            return res.status(401).json('Password or email is incorrect');
        }

        //damo uporabniku jwttoken
        const token = jwtGenerator(user.rows[0].user_id);
        res.json({ token });
    } catch (error) {
        console.log(error.message);
        res.status(500).json('Server Error');
    }
});

router.get('/is-verify', authorization, async (req, res) => {
    try {
        res.json(true);
    } catch (error) {
        console.log(error.message);
        res.status(500).json('Server Error');
    }
});
module.exports = router;
