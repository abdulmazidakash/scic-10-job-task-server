require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb'); // MongoDB client and ObjectId for document IDs
const http = require('http');
const { Server } = require('socket.io'); // Socket.io for real-time communication
const cors = require('cors'); // CORS middleware for handling cross-origin requests

const app = express();
const server = http.createServer(app); // Create an HTTP server using Express

// Configure Socket.io with CORS settings
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173' ||'https://scic-10-job-task.web.app', // Allow requests from this origin
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Allowed HTTP methods
  },
});

const PORT = process.env.PORT || 5000; // Server port
const MONGO_URI = process.env.MONGO_URI; // MongoDB connection URI
let db, tasksCollection, usersCollection; // MongoDB collections

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse incoming JSON requests

// Database Connection
async function connectDB() {
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect(); // Connect to MongoDB
    db = client.db('taskManager'); // Use the 'taskManager' database
    tasksCollection = db.collection('tasks'); // Reference the 'tasks' collection
    usersCollection = db.collection('users'); // Reference the 'users' collection
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1); // Exit the process if the database connection fails
  }
}

// WebSocket Connection
io.on('connection', (socket) => {
  console.log('Client connected');
  socket.on('disconnect', () => console.log('Client disconnected'));
});

// Routes

/**
 * Create a new user if they don't already exist.
 * POST /users
 */
app.post('/users', async (req, res) => {
  try {
    const { uid, email, name } = req.body;

    // Check if the user already exists
    const existingUser = await usersCollection.findOne({ uid });
    if (existingUser) {
      return res.status(200).json({ message: 'User exists' });
    }

    // Insert the new user
    await usersCollection.insertOne({
      uid,
      email,
      name,
      createdAt: new Date(),
    });
    res.status(201).json({ message: 'User created' });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * Fetch all tasks for a specific user.
 * GET /tasks?uid=<user_id>
 */
app.get('/tasks', async (req, res) => {
  try {
    const { uid } = req.query;

    // Validate user ID
    if (!uid) {
      return res.status(400).json({ message: 'User ID (uid) is required' });
    }

    // Fetch tasks sorted by category and position
    const tasks = await tasksCollection
      .find({ uid })
      .sort({ category: 1, position: 1 })
      .toArray();
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * Create a new task.
 * POST /tasks
 */
app.post('/tasks', async (req, res) => {
  try {
    const { uid, title, category } = req.body;

    // Validate required fields
    if (!uid) {
      return res.status(400).json({ message: 'User ID (uid) is required' });
    }
    if (!title) {
      return res.status(400).json({ message: 'Title is required' });
    }

    // Calculate the position for the new task
    const position = await tasksCollection.countDocuments({
      uid,
      category: category || 'To-Do',
    });

    // Create the task object
    const task = {
      ...req.body,
      position,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Insert the task into the database
    const result = await tasksCollection.insertOne(task);
    const insertedTask = await tasksCollection.findOne({
      _id: result.insertedId,
    });

    // Emit a WebSocket event to notify all clients
    io.emit('taskCreated', insertedTask);
    res.status(201).json(insertedTask);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * Update an existing task.
 * PUT /tasks/:id
 */

app.put('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log("Task ID to Update:", id); // Debugging

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid task ID" });
    }

    // `_id` remove
    const { _id, ...updateData } = req.body;
    
    updateData.updatedAt = new Date(); //time update

    const result = await tasksCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: "Task not found or no changes made" });
    }

    const updatedTask = await tasksCollection.findOne({ _id: new ObjectId(id) });

    io.emit("taskUpdated", updatedTask);
    res.json(updatedTask);
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});


/**
 * Delete a task.
 * DELETE /tasks/:id
 */
app.delete('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Delete the task from the database
    await tasksCollection.deleteOne({ _id: new ObjectId(id) });

    // Emit a WebSocket event to notify all clients
    io.emit('taskDeleted', id);
    res.json({ message: 'Task deleted' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Start the server
connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});

app.get('/', async(req, res)=>{
  res.send(`server running on ${PORT}`)
})