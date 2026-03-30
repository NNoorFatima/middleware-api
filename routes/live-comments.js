const express    = require('express');
const router     = express.Router();
const connectDb  = require('../db');
const { ObjectId } = require('mongodb');

// POST /live-comments
// body: { liveID: "<live _id string>", userID: "users._id", content: "..." }
// liveID is the MongoDB _id of the live session (string)
// Pushes the new comment's _id into live.liveComments array
router.post('/', async (req, res) => {
    try {
        const db = await connectDb();
        const { liveID, userID, content } = req.body;

        if (!liveID || !content) {
            return res.status(400).json({ success: false, error: 'liveID and content required' });
        }

        const result = await db.collection('liveComments').insertOne({
            liveID,      // = live._id string of the live session this comment belongs to
            userID,      // = users._id of the commenter
            content,
            timestamp: new Date(),
        });

        const commentMongoId = result.insertedId.toString();

        // Push this comment's _id string into live.liveComments array
        await db.collection('live').updateOne(
            { _id: new ObjectId(liveID) },
            { $push: { liveComments: commentMongoId } }
        );

        res.json({ success: true, _id: commentMongoId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /live-comments/:liveID — all comments for a live session (liveID = live._id string)
router.get('/:liveID', async (req, res) => {
    try {
        const db = await connectDb();
        const comments = await db.collection('liveComments')
            .find({ liveID: req.params.liveID })
            .sort({ timestamp: 1 })
            .toArray();

        res.json(comments.map(c => ({ ...c, _id: c._id.toString() })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
