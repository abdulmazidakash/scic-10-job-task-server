require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
let db, tasksCollection, usersCollection;

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
async function connectDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db('taskManager');
  tasksCollection = db.collection('tasks');
  usersCollection = db.collection('users');
  console.log('Connected to MongoDB');
}

// WebSocket
io.on('connection', (socket) => {
  console.log('Client connected');
  socket.on('disconnect', () => console.log('Client disconnected'));
});

// Routes
app.post('/users', async (req, res) => {
  try {
    const { uid, email, name } = req.body;
    const existingUser = await usersCollection.findOne({ uid });
    
    if (existingUser) return res.status(200).json({ message: 'User exists' });
    
    await usersCollection.insertOne({ 
      uid, 
      email, 
      name, 
      createdAt: new Date() 
    });
    res.status(201).json({ message: 'User created' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/tasks', async (req, res) => {
  try {
    const { uid } = req.query;
    const tasks = await tasksCollection.find({ uid })
      .sort({ category: 1, position: 1 })
      .toArray();
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/tasks', async (req, res) => {
  try {
    const task = { 
      ...req.body, 
      position: Date.now(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await tasksCollection.insertOne(task);
    io.emit('taskUpdated', result.ops[0]);
    res.status(201).json(result.ops[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = {
      ...req.body,
      updatedAt: new Date()
    };
    
    const result = await tasksCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );
    
    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    io.emit('taskUpdated', { _id: id, ...updateData });
    res.json({ message: 'Task updated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await tasksCollection.deleteOne({ _id: new ObjectId(id) });
    io.emit('taskDeleted', id);
    res.json({ message: 'Task deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update the POST /tasks endpoint
app.post('/tasks', async (req, res) => {
	try {
	  const { uid, title } = req.body;
	  
	  // Validate required fields
	  if (!uid) return res.status(400).json({ message: 'User ID (uid) is required' });
	  if (!title) return res.status(400).json({ message: 'Title is required' });
  
	  const task = {
		...req.body,
		position: await tasksCollection.countDocuments({ uid, category: req.body.category || 'To-Do' }),
		createdAt: new Date(),
		updatedAt: new Date()
	  };
  
	  // Insert and retrieve the new task
	  const result = await tasksCollection.insertOne(task);
	  const insertedTask = await tasksCollection.findOne({ _id: result.insertedId });
  
	  io.emit('taskUpdated', insertedTask);
	  res.status(201).json(insertedTask);
	} catch (error) {
	  console.error('Task creation error:', error);
	  res.status(500).json({ message: 'Server error', error: error.message });
	}
  });
  
  // Update the PUT /tasks/:id endpoint
  app.put('/tasks/:id', async (req, res) => {
	try {
	  const { id } = req.params;
	  const updateData = {
		...req.body,
		updatedAt: new Date()
	  };
  
	  // Add ObjectId conversion
	  const result = await tasksCollection.updateOne(
		{ _id: new ObjectId(id) },
		{ $set: updateData }
	  );
  
	  if (result.modifiedCount === 0) {
		return res.status(404).json({ message: 'Task not found' });
	  }
  
	  // Return the updated document
	  const updatedTask = await tasksCollection.findOne({ _id: new ObjectId(id) });
	  io.emit('taskUpdated', updatedTask);
	  res.json(updatedTask);
	} catch (error) {
	  console.error('Update error:', error);
	  res.status(500).json({ message: 'Server error', error: error.message });
	}
  });

// Start Server
connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});