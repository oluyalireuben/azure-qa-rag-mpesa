import 'dotenv/config'
import fs from 'fs'
import { client, connectToMongoDB, vectorCollection } from './mongodbConnection.js'
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { CharacterTextSplitter } from 'langchain/text_splitter';
import { AzureOpenAIEmbeddings } from '@langchain/openai'
//import vector store instance
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb'
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity'
const credentials = new DefaultAzureCredential();
const azureADTokenProvider = getBearerTokenProvider(
  credentials,
  "https://cognitiveservices.azure.com/.default"
);
// Recreate __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a splitter
const rawSplitter = new CharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 0
});

//create new embedding model instance
const azOpenEmbedding = new AzureOpenAIEmbeddings({
    azureADTokenProvider,
    azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
    azureOpenAIApiEmbeddingsDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_EMBEDDING_NAME, 
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
    azureOpenAIBasePath: "https://eastus2.api.cognitive.microsoft.com/openai/deployments"
});


// Get all file names
const folderPath = path.join(__dirname, '/docs');

function getCreateFileNameArray(folderPath) {
    return new Promise((resolve, reject) => {
        fs.readdir(folderPath, (err, files) => {
            if (err) {
                console.error('Error reading directory:', err);
                reject(err);
                return;
            }

            // Filter out only files (ignoring directories)
            const fileNames = files.filter(file => {
                const fullPath = path.join(folderPath, file);
                return fs.lstatSync(fullPath).isFile();
            });

            // Resolve with an array of file names
            resolve(fileNames.map(file => `docs/${file}`)); // Resolving with relative paths
        });
    });
}

async function getRawDoc(filePath) {
    // Create new PDF loader
    const loader = new PDFLoader(filePath);
    // Raw content
    const rawDoc = await loader.load();           
    // Print raw content (first 5 entries)
    console.log(rawDoc.slice(0, 5));
    return rawDoc;
}

const returnSplittedContent = async () => {
    const splitDocs = []; // To hold the split documents

    // Get the list of files
    const listOfFiles = await getCreateFileNameArray(folderPath);
    
    // Use for...of to await each file processing
    for (const pathOfFile of listOfFiles) {
        const rawDoc = await getRawDoc(pathOfFile); // Await the raw document
        const splittedContent = await rawSplitter.splitDocuments(rawDoc); // Await the splitting
        splitDocs.push(...splittedContent); // Add the split documents to the array
    }

    return splitDocs; // Return the array of split documents
}

// Call the function and handle the result with await

const storeToCosmosVectorStore = async () => {
  try {
        const documents = await returnSplittedContent()

        //create store instance
        const store = await MongoDBAtlasVectorSearch.fromDocuments(
            documents,
            azOpenEmbedding,
            {
                collection: vectorCollection,
                indexName: "myrag_index",
                textKey: "text",
                embeddingKey: "embedding",
              }
        )

        if(!store){
            console.log('Something wrong happened while creating store or getting store!')
            return false
        }

        console.log('Done creating/getting and uploading to store.')
        return true

   } catch (e) {
        console.log(`This error occurred: ${e}`)
        return false
   }
    
}

console.log(await storeToCosmosVectorStore() ? 'Successfully uploaded the embedded documents ':'Failed to upload the documents ')
