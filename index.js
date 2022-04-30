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

app.post('/participants', async (req, res) => {
    const { error } = userSchema.validate(req.body);
    if (error) {
        res.status(422).send(error.details.message);
        return;
    }
    const client = new MongoClient(process.env.DB_URL);
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
        res.status(201);
    } catch (err) {
        res.status(500).send(err);
    } finally {
        await client.close();
    }
}
);

app.get('/participants', async (req, res) => {
    const client = new MongoClient(process.env.DB_URL);
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







