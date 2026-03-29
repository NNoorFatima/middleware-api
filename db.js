// db.js
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI; 
const dbName = process.env.DB_NAME || 'aiva_db';

let client;
let db;

async function connectDb() {
    if (!db) {
        client = new MongoClient(uri, { useUnifiedTopology: true });
        await client.connect();
        db = client.db(dbName);
        console.log('[DEBUG] MongoDB connected');
    }
    return db;
}

module.exports = connectDb;