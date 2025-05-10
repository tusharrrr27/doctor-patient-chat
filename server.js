// Enhancing the chat with features: 
// 2. Video Call (WebRTC) 
// 4. File Upload 
// 6. Appointment Scheduling 
// 7. Status Indicators 
// 10. Notifications

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const multer = require('multer');
const fs = require('fs');

const rooms = {};

// File upload setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage });

app.use(express.static(path.join(__dirname, "public")));

// Endpoint for file upload
app.post('/upload', upload.single('file'), (req, res) => {
    res.json({ fileUrl: `/uploads/${req.file.filename}` });
});

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('joinRoom', ({ role, roomId, name }) => {
        if (!rooms[roomId]) {
            rooms[roomId] = { patients: [], doctors: [], messages: [], appointments: [] };
        }

        socket.join(roomId);
        socket.role = role;
        socket.name = name;
        socket.roomId = roomId;

        if (role === 'patient') rooms[roomId].patients.push(socket.id);
        if (role === 'doctor') rooms[roomId].doctors.push(socket.id);

        socket.to(roomId).emit('statusUpdate', { userId: socket.id, status: 'online', name });

        io.to(roomId).emit('userJoined', { userId: socket.id, role, name });
        socket.emit('previousMessages', rooms[roomId].messages);
    });

    socket.on('sendMessage', ({ roomId, message, senderId, senderRole, senderName, fileUrl, isVideo }) => {
        const newMessage = { senderId, senderRole, message, timestamp: new Date(), senderName, fileUrl, isVideo };
        rooms[roomId].messages.push(newMessage);
        io.to(roomId).emit('newMessage', newMessage);
        socket.to(roomId).emit('notify', `${senderName} sent a message.`);
    });

    socket.on('startCall', ({ roomId, senderName }) => {
        socket.to(roomId).emit('incomingCall', { caller: senderName });
    });

    socket.on('scheduleAppointment', ({ roomId, doctor, patient, time }) => {
        rooms[roomId].appointments.push({ doctor, patient, time });
        io.to(roomId).emit('appointmentScheduled', { doctor, patient, time });
    });

    socket.on('typing', () => {
        socket.to(socket.roomId).emit('userTyping', { userId: socket.id, name: socket.name });
    });

    socket.on('disconnect', () => {
        const { roomId, name } = socket;
        if (roomId && rooms[roomId]) {
            rooms[roomId].patients = rooms[roomId].patients.filter(id => id !== socket.id);
            rooms[roomId].doctors = rooms[roomId].doctors.filter(id => id !== socket.id);
            socket.to(roomId).emit('userLeft', { userId: socket.id, name });
            socket.to(roomId).emit('statusUpdate', { userId: socket.id, status: 'offline', name });
        }
    });
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
