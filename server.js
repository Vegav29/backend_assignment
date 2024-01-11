const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const Fingerprint = require('fingerprintjs2');

const app = express();
const port = 3000;

const mongoUrl = 'mongodb+srv://bj:bj@cluster0.q48qwbs.mongodb.net/?retryWrites=true&w=majority'; 
const dbName = 'contacts';
const collectionName = 'contacts';

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '')));

let client;
let db;

async function connectToMongo() {
    client = new MongoClient(mongoUrl, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
        },
    });

    try {
        await client.connect();
        db = client.db(dbName);
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('Error connecting to MongoDB:', err);
        throw err;
    }
}

// Start the server after the MongoDB connection is established
connectToMongo()
    .then(() => {
        app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
        });
    })
    .catch((err) => {
        console.error('Unable to start the server:', err);
    });

async function findContactByFingerprint(fingerprint) {
    if (!db) {
        console.error('MongoDB connection not established');
        return Promise.reject(new Error('MongoDB connection not established'));
    }

    return db.collection(collectionName).findOne({ fingerprint: fingerprint });
}

async function createPrimaryContact(fingerprint) {
    const contact = {
        _id: uuidv4(),
        fingerprint,
        linkPrecedence: 'primary',
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    await db.collection(collectionName).insertOne(contact);
    return contact;
}

async function createSecondaryContact(primaryContactId, fingerprint) {
    const contact = {
        _id: uuidv4(),
        linkedId: primaryContactId,
        fingerprint,
        linkPrecedence: 'secondary',
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    await db.collection(collectionName).insertOne(contact);
    return contact;
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '', 'index.html'));
});
app.post('/identify', async (req, res) => {
    const { fingerprint, email, phoneNumber } = req.body;

    if (!fingerprint) {
        return res.status(400).json({ error: 'Fingerprint not provided' });
    }

    const existingContact = await findContactByFingerprint(fingerprint);

    if (!existingContact) {
        // Create a new "primary" contact
        const newContact = await createPrimaryContact(fingerprint, email, phoneNumber);
        console.log('New Primary Contact Created:', newContact);
        res.status(200).json({
            primaryContactId: newContact._id,
            fingerprint: newContact.fingerprint,
            emails: [newContact.email],
            phoneNumbers: [newContact.phoneNumber],
            secondaryContactIds: [],
        });
    } else {
        // Create a new "secondary" contact
        const newSecondaryContact = await createSecondaryContact(existingContact._id, fingerprint, email, phoneNumber);

        // Fetch existing secondary contacts
        const secondaryContacts = await db.collection(collectionName)
            .find({ linkedId: existingContact._id, linkPrecedence: 'secondary' })
            .toArray();

        const secondaryContactIds = secondaryContacts.map(contact => contact._id || '');
        const emails = [existingContact.email, newSecondaryContact.email];
        const phoneNumbers = [existingContact.phoneNumber, newSecondaryContact.phoneNumber];

        res.status(200).json({
            primaryContactId: existingContact._id,
            fingerprint: existingContact.fingerprint,
            emails,
            phoneNumbers,
            secondaryContactIds: [newSecondaryContact._id, ...secondaryContactIds],
        });
    }
});


async function createPrimaryContact(fingerprint, email, phoneNumber) {
    const contact = {
        _id: uuidv4(),
        fingerprint,
        email,
        phoneNumber,
        linkPrecedence: 'primary',
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    await db.collection(collectionName).insertOne(contact);
    return contact;
}

async function createSecondaryContact(primaryContactId, fingerprint, email, phoneNumber) {
    const contact = {
        _id: uuidv4(),
        linkedId: primaryContactId,
        fingerprint,
        email,
        phoneNumber,
        linkPrecedence: 'secondary',
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    await db.collection(collectionName).insertOne(contact);
    return contact;
}


process.on('SIGINT', async () => {
    if (client) {
        await client.close();
        console.log('MongoDB connection closed');
    }
    process.exit();
});
