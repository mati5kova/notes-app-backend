const express = require('express');
const app = express();
const cors = require('cors');

//middleware
app.use(express.json());
app.use(cors());

//routes//
app.use('/auth', require('./routes/jwtAuth'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/notes', require('./routes/notes'));

//
app.get('/', (req, res) => {
    res.json('server up');
});

app.listen(5000, () => {
    console.log('server running on port ' + 5000);
});
