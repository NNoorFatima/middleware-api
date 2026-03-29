const express = require('express');
const router = express.Router();
const connectDb = require('../db');

// POST /inventory
// If the seller already has an inventory, products are added to it.
// If not, a new inventory is created, the seller's inventory field is updated.
// In both cases the inventory's products array is kept in sync.
router.post('/', async (req, res) => {
    try {
        const db = await connectDb();
        const { sellerID, products } = req.body;

        if (!sellerID || !Array.isArray(products) || products.length === 0) {
            return res.status(400).json({ success: false, error: 'sellerID and a non-empty products array are required' });
        }

        const now = new Date();

        // Build product documents — inventoryID filled in below
        const buildDocs = (inventoryID) => products.map(p => ({
            inventoryID,
            name:          p.name          || '',
            price:         parseFloat(p.price)         || 0,
            stockQuantity: parseInt(p.stockQuantity)   || 0,
            imageURL:      p.imageURL      || '',
            description:   p.description  || '',
            category:      p.category     || '',
            createdAt:     now,
        }));

        // Check if seller already has an inventory
        const existing = await db.collection('inventory').findOne({ sellerID });

        let inventoryID;

        if (existing) {
            // ── Seller already has an inventory — just append products ──
            inventoryID = existing._id.toString();

            const prodResult = await db.collection('products').insertMany(buildDocs(inventoryID));

            // Push new product IDs into the inventory's products array
            const newIds = Object.values(prodResult.insertedIds).map(id => id.toString());
            await db.collection('inventory').updateOne(
                { _id: existing._id },
                { $push: { products: { $each: newIds } } }
            );

            return res.json({ success: true, inventoryID, productsInserted: prodResult.insertedCount });

        } else {
            // ── No inventory yet — create one ──
            const invResult = await db.collection('inventory').insertOne({
                sellerID,
                products: [],
                createdAt: now,
            });
            inventoryID = invResult.insertedId.toString();

            const prodResult = await db.collection('products').insertMany(buildDocs(inventoryID));

            // Set the inventory's products array to the inserted IDs
            const newIds = Object.values(prodResult.insertedIds).map(id => id.toString());
            await db.collection('inventory').updateOne(
                { _id: invResult.insertedId },
                { $set: { products: newIds } }
            );

            // Update the seller's inventory reference
            await db.collection('sellers').updateOne(
                { sellerID },
                { $set: { inventory: inventoryID } }
            );

            return res.json({ success: true, inventoryID, productsInserted: prodResult.insertedCount });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /inventory/:sellerID — get inventory with full product objects populated
router.get('/:sellerID', async (req, res) => {
    try {
        const db = await connectDb();
        const inventory = await db.collection('inventory').findOne({ sellerID: req.params.sellerID });
        if (!inventory) return res.status(404).json({ error: 'No inventory found for this seller' });

        // Fetch all products belonging to this inventory
        const products = await db.collection('products')
            .find({ inventoryID: inventory._id.toString() })
            .toArray();

        res.json({
            ...inventory,
            _id: inventory._id.toString(),
            products: products.map(p => ({ ...p, _id: p._id.toString() })),
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
