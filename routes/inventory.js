const express    = require('express');
const router     = express.Router();
const connectDb  = require('../db');
const { ObjectId } = require('mongodb');

// Helper: resolve users._id string → seller document
// sellerID in sellers collection is stored as ObjectId (ref to users._id)
async function findSellerByUserId(db, userMongoId) {
    let seller = null;
    try {
        seller = await db.collection('sellers').findOne({ sellerID: new ObjectId(userMongoId) });
    } catch (e) {}
    // Fallback for legacy string-stored sellerID
    if (!seller) seller = await db.collection('sellers').findOne({ sellerID: userMongoId });
    return seller;
}

// POST /inventory
// body: { sellerID: "<users._id string>", products: [...] }
// inventory.sellerID = sellers.sellerID = users._id
// sellers.inventory  = inventory._id (ObjectId)
router.post('/', async (req, res) => {
    try {
        const db = await connectDb();
        const { sellerID, products } = req.body;

        if (!sellerID || !Array.isArray(products) || products.length === 0) {
            return res.status(400).json({ success: false, error: 'sellerID and a non-empty products array are required' });
        }

        // Resolve users._id → seller doc to get sellers._id
        const seller = await findSellerByUserId(db, sellerID);
        if (!seller) {
            return res.status(404).json({ success: false, error: 'Seller not found for this user ID' });
        }

        const now = new Date();

        // Build product documents — inventoryID is inventory._id (ObjectId ref)
        const buildDocs = (inventoryOid) => products.map(p => ({
            inventoryID:   inventoryOid,             // ObjectId ref to inventory._id
            name:          p.name         || '',
            price:         parseFloat(p.price)       || 0,
            stockQuantity: parseInt(p.stockQuantity) || 0,
            imageURL:      p.imageURL     || '',
            description:   p.description || '',
            category:      p.category    || '',
            createdAt:     now,
        }));

        // Check if seller already has an inventory (match by sellers.sellerID = users._id)
        const existing = await db.collection('inventory').findOne({ sellerID: seller.sellerID });

        let inventoryID;

        if (existing) {
            // Seller already has an inventory — append products
            inventoryID = existing._id.toString();

            const prodResult = await db.collection('products').insertMany(buildDocs(existing._id));

            const newIds = Object.values(prodResult.insertedIds).map(id => id.toString());
            await db.collection('inventory').updateOne(
                { _id: existing._id },
                { $push: { products: { $each: newIds } } }
            );

            return res.json({ success: true, inventoryID, productsInserted: prodResult.insertedCount });

        } else {
            // No inventory yet — create one
            // inventory.sellerID = sellers._id (ObjectId)
            const invResult = await db.collection('inventory').insertOne({
                sellerID: seller.sellerID,   // users._id (same as sellers.sellerID)
                products: [],
                createdAt: now,
            });
            inventoryID = invResult.insertedId.toString();

            const prodResult = await db.collection('products').insertMany(buildDocs(invResult.insertedId));

            const newIds = Object.values(prodResult.insertedIds).map(id => id.toString());
            await db.collection('inventory').updateOne(
                { _id: invResult.insertedId },
                { $set: { products: newIds } }
            );

            // Update sellers.inventory = inventory._id (ObjectId)
            await db.collection('sellers').updateOne(
                { _id: seller._id },
                { $set: { inventory: invResult.insertedId } }
            );

            return res.json({ success: true, inventoryID, productsInserted: prodResult.insertedCount });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /inventory/:sellerID — get inventory with full product objects populated
// :sellerID = users._id string (aiva_mongo_id from WordPress)
router.get('/:sellerID', async (req, res) => {
    try {
        const db = await connectDb();

        // Resolve users._id → seller doc → sellers._id
        const seller = await findSellerByUserId(db, req.params.sellerID);
        if (!seller) return res.status(404).json({ error: 'Seller not found' });

        // Find inventory by sellers.sellerID (= users._id)
        const inventory = await db.collection('inventory').findOne({ sellerID: seller.sellerID });
        if (!inventory) return res.status(404).json({ error: 'No inventory found for this seller' });

        // Fetch all products belonging to this inventory
        // inventoryID stored as ObjectId — match directly, with string fallback for legacy docs
        let products = await db.collection('products')
            .find({ inventoryID: inventory._id })
            .toArray();
        if (!products.length) {
            products = await db.collection('products')
                .find({ inventoryID: inventory._id.toString() })
                .toArray();
        }

        res.json({
            ...inventory,
            _id:      inventory._id.toString(),
            sellerID: inventory.sellerID.toString(),
            products: products.map(p => ({
                ...p,
                _id:         p._id.toString(),
                inventoryID: p.inventoryID?.toString() ?? '',
            })),
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
