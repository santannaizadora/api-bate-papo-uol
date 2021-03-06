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

const client = new MongoClient(process.env.DB_URL);
client.connect();
const db = client.db(process.env.DB_NAME);
const participantsCollection = db.collection('participants');
const messagesCollection = db.collection('messages');

const userSchema = joi.object({
    name: joi.string().required()
});

const messageSchema = joi.object({
    to: joi.string().min(1).required(),
    text: joi.string().min(1).required(),
    type: joi.string().valid("message", "private_message").required()
});

app.post('/participants', async (req, res) => {
    const { error } = userSchema.validate(req.body);
    if (error) {
        res.status(422).send(error.details.message);
        return;
    }
    try {
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
    }
}
);

app.get('/participants', async (req, res) => {
    try {
        const participants = await participantsCollection.find({}).toArray();
        res.status(200).send(participants);
    } catch (err) {
        res.status(500).send(err);
    }

});

app.post('/messages', async (req, res) => {
    const { error } = messageSchema.validate(req.body);
    if (error) {
        res.status(422).send(error.details.message);
        return;
    }
    try {
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
    }
});

app.get('/messages', async (req, res) => {
    try {
        const query = req.query;
        const limit = query.limit ? parseInt(query.limit) : 0;
        const user = await participantsCollection.findOne({ name: req.headers.user });
        if (!user) {
            res.status(409).send('User not found');
            return;
        }
        const messages = await messagesCollection
            .find({ $or: [{ to: 'Todos' }, { from: req.headers.user }, { to: req.headers.user }, { type: 'message' }] })
            .sort({ _id: -1 })
            .limit(limit)
            .toArray();
        res.status(200).send(messages.reverse());
    } catch (err) {
        res.status(500).send(err);
    }
});

app.post('/status', async (req, res) => {
    try {
        const user = await participantsCollection.findOne({ name: req.headers.user });
        if (!user) {
            res.status(404).send('User not found');
            return;
        }
        await participantsCollection.updateOne({ name: req.headers.user }, { $set: { lastStatus: Date.now() } });
        res.status(201).send('');
    } catch (err) {
        res.status(500).send(err);
    }
});

app.delete('/messages/:ID', async (req, res) => {
    const user = await participantsCollection.findOne({ name: req.headers.user });
    try {
        const message = await messagesCollection.findOne({ _id: ObjectId(req.params.ID) });
        if (!message) {
            res.status(404).send('Message not found');
            return;
        }
        if (message.from !== user.name) {
            res.status(401).send('You are not the owner of this message');
            return;
        }
        await messagesCollection.deleteOne({ _id: ObjectId(req.params.ID) });
        res.status(200).send('');
    } catch (err) {
        res.status(500).send(err);
    }
});

app.put('/messages/:ID', async (req, res) => {
    const { error } = messageSchema.validate(req.body);
    const user = await participantsCollection.findOne({ name: req.headers.user });
    if(!user) {
        res.status(404).send('User not found');
        return;
    }
    try {
        const message = await messagesCollection.findOne({ _id: ObjectId(req.params.ID) });
        console.log(message);
        if (!message) {
            res.status(404).send('Message not found');
            return;
        }
        if (message.from !== user.name) {
            res.status(401).send('You are not the owner of this message');
            return;
        }
        if (error) {
            res.status(422).send(error.details.message);
            return;
        }
        await messagesCollection.updateOne({ _id: ObjectId(req.params.ID) }, { $set: { text: req.body.text} });
        res.status(200).send('');
    } catch (err) {
        res.status(500).send(err);
    }
});


async function deleteUsers() {
    try {
        const users = await participantsCollection.find({}).toArray();
        const now = Date.now();
        const usersToDelete = users.filter(user => now - user.lastStatus > 10000);
        if (usersToDelete.length > 0) {
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
}

setInterval(deleteUsers, 15000);
