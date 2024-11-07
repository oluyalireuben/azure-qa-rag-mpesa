import 'dotenv/config'
import { MongoClient } from 'mongodb'

const client = new MongoClient(process.env.MONGODB_ATLAS_URI)

const connectToMongoDB = async () => {
    try {
        await client.connect()
        console.log('Successfully connected to mongodb atlas...')
    } catch (error) {
        console.log(`Failed to connect to DB with this error: ${error}`)
    }
}

const vectorCollection = client
.db(process.env.MONGODB_ATLAS_DB_NAME)
.collection(process.env.MONGODB_ATLAS_COLLECTION_NAME)

export { connectToMongoDB, client, vectorCollection }