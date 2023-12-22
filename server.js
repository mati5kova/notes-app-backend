const express = require('express');
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

io.on('connection', (socket) => {
    console.log('New client connected', socket.id);

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });

    // Handle note update event
    socket.on('note_updated', (data) => {
        const { noteId } = data;
        // Emit update to clients
        io.emit(`note_${noteId}_updated`, noteId);
    });
});

server.listen(5000, () => {
    console.log('server running on port ' + 5000);
});
