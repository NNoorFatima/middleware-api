require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_URI; // MongoDB connection string
const client = new MongoClient(uri);
const dbName = process.env.DB_NAME || "aiva_db";

async function connectDb() {
    if (!client.isConnected()) await client.connect();
    return client.db(dbName);
}

// Example endpoint: insert a user
app.post('/users', async (req, res) => {
    try {
        const db = await connectDb();
        const result = await db.collection('users').insertOne(req.body);
        res.json({ success: true, id: result.insertedId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Example endpoint: get user by email
app.get('/users/:email', async (req, res) => {
    try {
        const db = await connectDb();
        const user = await db.collection('users').findOne({ email: req.params.email });
        res.json(user || {});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));