import joi from 'joi';
import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from "mongodb";
import dayjs from 'dayjs';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.listen(5000);

const userSchema = joi.object({
    name: joi.string().min(1).required()
});

const client = new MongoClient(process.env.DB_URL);

app.post('/participants', async (req, res) => {
    const { error } = userSchema.validate(req.body);
    if (error) {
        res.status(422).send(error.details.message);
        return;
    }
    try {
        await client.connect();
        const db = client.db(process.env.DB_NAME);
        const participantsCollection = db.collection('participants');
        const messagesCollection = db.collection('messages');
        const user = await participantsCollection.findOne({ name: req.body.name });
        if (user) {
            res.status(409).send('User already exists');
            return;
        }
        const message = {
            from: req.body.name,
            to: 'Todos',
            text: 'entra na sala...',
            type: 'status',
            time: dayjs().format('YYYY-MM-DD HH:mm:ss:SSS')
        }

        await participantsCollection.insertOne({ name: req.body.name, lastStatus: Date.now() });
        await messagesCollection.insertOne(message);
        res.status(201).send('');
    } catch (err) {
        res.status(500).send(err);
    } finally {
        await client.close();
    }
}
);

app.get('/participants', async (req, res) => {
    try {
        await client.connect();
        const db = client.db(process.env.DB_NAME);
        const participantsCollection = db.collection('participants');
        const participants = await participantsCollection.find({}).toArray();
        res.status(200).send(participants);
    } catch (err) {
        res.status(500).send(err);
    }
    finally {
        await client.close();
    }
});

const messageSchema = joi.object({
    to: joi.string().min(1).required(),
    text: joi.string().min(1).required(),
    type: joi.string().valid("message", "private_message").required()
});

app.post('/messages', async (req, res) => {
    const { error } = messageSchema.validate(req.body);
    if (error) {
        res.status(422).send(error.details.message);
        return;
    }
    try {
        await client.connect();
        const db = client.db(process.env.DB_NAME);
        const participantsCollection = db.collection('participants');
        const messagesCollection = db.collection('messages');
        const user = await participantsCollection.findOne({ name: req.body.from });
        if (user) {
            res.status(409);
            return;
        }
        const message = {
            from: req.headers.user,
            to: req.body.to,
            text: req.body.text,
            type: req.body.type,
            time: dayjs().format('YYYY-MM-DD HH:mm:ss:SSS')
        }
        await messagesCollection.insertOne(message);
        res.status(201).send('');
    } catch (err) {
        res.status(500).send(err);
    } finally {
        await client.close();
    }
});

app.get('/messages', async (req, res) => {
    try {
        await client.connect();
        const db = client.db(process.env.DB_NAME);
        const messagesCollection = db.collection('messages');
        const participantsCollection = db.collection('participants');
        const query = req.query;
        const limit = query.limit ? parseInt(query.limit) : 0;
        const user = await participantsCollection.findOne({ name: req.headers.user });
        if (!user) {
            res.status(409).send('User not found');
            return;
        }
        const messages = await messagesCollection
            .find({ $or: [{ to: 'Todos' }, { from: req.headers.user }, { to: req.headers.user }, {type: 'message'}] })
            .sort({ _id: -1 })
            .limit(limit)
            .toArray();
        res.status(200).send(messages.reverse());
    } catch (err) {
        res.status(500).send(err);
    }
    finally {
        await client.close();
    }
});

app.post('/status', async (req, res) => {
    try {
        await client.connect();
        const db = client.db(process.env.DB_NAME);
        const participantsCollection = db.collection('participants');
        const user = await participantsCollection.findOne({ name: req.headers.user });
        console.log(user);
        if (!user) {
            res.status(404).send('User not found');
            return;
        }
        await participantsCollection.updateOne({ name: req.headers.user }, { $set: { lastStatus: Date.now() } });
        res.status(201).send('');
    } catch (err) {
        res.status(500).send(err);
    }
    finally {
        await client.close();
    }
});

async function deleteUsers() {
    try {
        await client.connect();
        const db = client.db(process.env.DB_NAME);
        const participantsCollection = db.collection('participants');
        const messagesCollection = db.collection('messages');
        const users = await participantsCollection.find({}).toArray();
        const now = Date.now();
        const usersToDelete = users.filter(user => now - user.lastStatus > 10000);
        if(usersToDelete.length > 0) {
        await participantsCollection.deleteMany({ name: { $in: usersToDelete.map(user => user.name) } });
        await messagesCollection.insertMany(usersToDelete.map(user => {
            return {
                from: user.name,
                to: 'Todos',
                text: 'saiu da sala...',
                type: 'status',
                time: dayjs().format('YYYY-MM-DD HH:mm:ss:SSS')
            }
        }
        ));
        }
    } catch (err) {
        console.log(err);
    }
    finally {
        await client.close();
    }
}
setInterval(deleteUsers, 15000);
