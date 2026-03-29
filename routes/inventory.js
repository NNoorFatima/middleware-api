const express = require('express');
const router = express.Router();
const connectDb = require('../db');

// POST /inventories — create one inventory + bulk-insert all its products
router.post('/', async (req, res) => {
    try {
        const db = await connectDb();
        const { sellerID, products } = req.body;

        if (!sellerID || !Array.isArray(products) || products.length === 0) {
            return res.status(400).json({ success: false, error: 'sellerID and a non-empty products array are required' });
        }

        const now = new Date();

        // Create the inventory record — MongoDB generates its _id as inventoryID
        const invResult = await db.collection('inventory').insertOne({ sellerID, createdAt: now });
        const inventoryID = invResult.insertedId.toString();

        // Build product documents (no client-supplied IDs needed)
        const productDocs = products.map(p => ({
            inventoryID,
            name:          p.name          || '',
            price:         parseFloat(p.price)         || 0,
            stockQuantity: parseInt(p.stockQuantity)   || 0,
            imageURL:      p.imageURL      || '',
            description:   p.description  || '',
            category:      p.category     || '',
            createdAt:     now,
        }));

        const prodResult = await db.collection('products').insertMany(productDocs);

        res.json({ success: true, inventoryID, productsInserted: prodResult.insertedCount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /inventories/:sellerID — all inventories for a seller
router.get('/:sellerID', async (req, res) => {
    try {
        const db = await connectDb();
        const inventories = await db.collection('inventories')
            .find({ sellerID: req.params.sellerID })
            .toArray();
        res.json(inventories.map(i => ({ ...i, _id: i._id.toString() })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
