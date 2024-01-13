const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();
const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const cors = require('cors');

const io = new Server(server, {
    cors: {
        origin: '*',
    },
});

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

function checkValidSource(jwtToken) {
    try {
        jwt.verify(jwtToken, process.env.JWTSECRET);
        return true;
    } catch (error) {
        return false;
    }
}

io.on('connection', (socket) => {
    console.log('New client connected', socket.id);

    socket.on('disconnect', () => {
        console.log('Client disconnected', socket.id);
    });

    socket.on('note_updated', (data) => {
        const { noteId, token } = data;
        if (checkValidSource(token)) {
            socket.broadcast.emit(`note_${noteId}_updated`, noteId);
        }
    });

    socket.on('note_deleted', (data) => {
        const { noteId, token } = data;
        if (checkValidSource(token)) {
            socket.broadcast.emit(`note_${noteId}_deleted`, noteId);
        }
    });

    socket.on('note_shared', (data) => {
        const { user_email, noteId, token } = data;
        if (checkValidSource(token)) {
            socket.broadcast.emit(`note_shared_with_${user_email}`, noteId);
        }
    });

    socket.on('note_shared_permission_change', (data) => {
        const { user_email, noteId, editing_permission, token } = data;
        if (checkValidSource(token)) {
            socket.broadcast.emit(`note_shared_permission_change_${noteId}_${user_email}`, editing_permission);
        }
    });

    socket.on('share_removed', (data) => {
        const { user_email, noteId, token } = data;
        if (checkValidSource(token)) {
            socket.broadcast.emit(`share_removed_with_${user_email}`, noteId);
        }
    });
});

server.listen(5000, () => {
    console.log('server running on port ' + 5000);
});
