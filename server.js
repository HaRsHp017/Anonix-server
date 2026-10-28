
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const connectDB = require("./db");
const Message = require("./models/Message");

const app = express();

app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://anonix-six.vercel.app",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("User Connected:", socket.id);

  // Join room and load chat history
  socket.on("join_room", async (roomName) => {
    try {
      // Leave any previous chat rooms first
      for (const room of socket.rooms) {
        if (room !== socket.id && room !== roomName) {
          await socket.leave(room);

          io.to(room).emit("room_users", {
            room,
            count: io.sockets.adapter.rooms.get(room)?.size || 0,
          });
        }
      }

      await socket.join(roomName);

      // Broadcast updated online count
      io.to(roomName).emit("room_users", {
        room: roomName,
        count: io.sockets.adapter.rooms.get(roomName)?.size || 0,
      });

      // Load the latest 100 messages in chronological order
      const messages = await Message.find({ room: roomName })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

      socket.emit("message_history", messages.reverse());

      console.log(`${socket.id} joined room ${roomName}`);
    } catch (error) {
      console.error("History load failed:", error.message);
    }
  });

  // Save message and broadcast it
  socket.on("send_message", async (data) => {
    try {
      console.log("Received message:", data);

      const savedMessage = await Message.create({
        room: data.room,
        user: data.user,
        text: data.text,
        time: data.time,
      });

      console.log("Message saved:", savedMessage._id);

      io.to(data.room).emit("receive_message", savedMessage);
    } catch (error) {
      console.error("Message save failed:", error.message);
    }
  });

  // Update counts when a user disconnects
  socket.on("disconnecting", () => {
    for (const room of socket.rooms) {
      if (room === socket.id) continue;

      const count = Math.max(
        0,
        (io.sockets.adapter.rooms.get(room)?.size || 1) - 1
      );

      io.to(room).emit("room_users", {
        room,
        count,
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
  });
});

// Start server only after MongoDB connects
connectDB()
  .then(() => {
    server.listen(process.env.PORT || 5000, () => {
      console.log("Server Running on 5000");
    });
  })
  .catch((error) => {
    console.error("Server startup failed:", error.message);
  });
