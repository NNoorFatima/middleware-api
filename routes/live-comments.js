const express = require('express');
const router  = express.Router();
const connectDb = require('../db');

// POST /live-comments
// body: { liveID: "LV001", userID: "users._id", content: "..." }
// Also pushes the comment _id into live.liveComments array
router.post('/', async (req, res) => {
    try {
        const db = await connectDb();
        const { liveID, userID, content } = req.body;

        if (!liveID || !content) {
            return res.status(400).json({ success: false, error: 'liveID and content required' });
        }

        const count    = await db.collection('liveComments').countDocuments();
        const commentID = 'CM' + String(count + 1).padStart(3, '0');

        const result = await db.collection('liveComments').insertOne({
            commentID,
            liveID,      // streamID of the live session this comment belongs to
            userID,      // users._id of the commenter
            content,
            timestamp: new Date(),
        });

        const commentOid = result.insertedId.toString();

        // Push comment _id into live.liveComments array
        await db.collection('live').updateOne(
            { streamID: liveID },
            { $push: { liveComments: commentOid } }
        );

        res.json({ success: true, commentID, _id: commentOid });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /live-comments/:liveID — all comments for a live session, oldest first
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
