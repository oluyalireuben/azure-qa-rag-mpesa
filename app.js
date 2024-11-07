import 'dotenv/config'
import { client, connectToMongoDB, vectorCollection } from './mongodbConnection.js'
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb'
import express, { urlencoded } from 'express'
import { AzureChatOpenAI, AzureOpenAIEmbeddings } from '@langchain/openai'
//Import for Azure Managed Identitiy
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity'
//bring in different langchain resources
import { ChatPromptTemplate } from '@langchain/core/prompts'
//to get text from AI Message we bring the text parser
import { StringOutputParser } from '@langchain/core/output_parsers'
//bring in a langchain runnable sequence
import { RunnableSequence, RunnableMap } from '@langchain/core/runnables'

//bring in stream
import { Readable } from 'stream'
//bring in Document from langchain to help us convert doc references
import { Document } from 'langchain/document'

//connect to mongodb
await connectToMongoDB()
//create an instance of the express web server
const app = express()
const azCredentials = new DefaultAzureCredential()
const azTokenProvider = getBearerTokenProvider(
    azCredentials,
    "https://cognitiveservices.azure.com/.default"
)

//string output parser instance
const outPutParser = new StringOutputParser()

//middleware
app.use(express.static('public'))
app.set('view engine','ejs')
app.use(express.json())
app.use(express.urlencoded({extended:false}))

const PORT = process.env.PORT || 5003

//create root endpoint
app.get(process.env.BASE_URL, (req,res) => {
    res.render('index')
})

//Method 1: Using API Keys
/*


//CREATE LLM instance
const llm = new AzureChatOpenAI({
    model: 'gpt-4o',
    temperature: 0,
    maxTokens: undefined,
    maxRetries: 2,
    azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
    azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
    azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION
})

//invoke Azure OpenAI Chat
app.post(`${process.env.BASE_URL}/chat/invoke`, async (req,res)=>{
    //request body data
    const {system_msg, human_msg} = req.body

    //check for inputs
    if(!system_msg || !human_msg){
        return res.status(400).json(
            {
                message:'No system or human message.'
            }
        )
    }

   try{
     //continue with the rest of the code, to invoke chat
     const aiMsg = await llm.invoke([
        ["system", system_msg],
        ["human", human_msg]
        ])

        //log the AI message chunk
        console.log(aiMsg)

        res.status(201).json({
            message:'Translated successfully.',
            output: aiMsg.content
        })
   }catch(e){
    return res.status(500).json({
        message:'An error occurred while invoking the LLM.',
        error: e
    })
   }finally{
    console.log("LLM invocation done successfully.")
   }
})*/

//CHAT COMPLETION 
//METHOD 2: Recommended - Azure Managed Identity
const llm = new AzureChatOpenAI({
    azTokenProvider,
    azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
    azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION
})

//Embeddings Instance
//create new embedding model instance
const azOpenEmbedding = new AzureOpenAIEmbeddings({
    azTokenProvider,
    azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
    azureOpenAIApiEmbeddingsDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_EMBEDDING_NAME, 
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
    azureOpenAIBasePath: "https://eastus2.api.cognitive.microsoft.com/openai/deployments"
});


//without a runnable sequence
//not good for complex chains
app.post(`${process.env.BASE_URL}/az-openai/chat`, async (req,res) => {
    //check for human message
    const { chatMsg } = req.body

    if(!chatMsg) return res.status(201).json({
        message:'Hey, you didn\'t send anything.'
    })

   //put the code in an error-handler
   try{
        //create a prompt template format template
        const prompt = ChatPromptTemplate.fromMessages(
            [
                ["system", `You are a French-to-English translator that detects if a message isn't in French. If it's not, you respond, "This is not French." Otherwise, you translate it to English.`],
                ["human", `${chatMsg}`]
            ]
        )

        //console.log( ["human", `${chatMsg}`])

        const chain = prompt.pipe(llm).pipe(outPutParser)
        //chain result
        let result = await chain.invoke()
        //check and give appropriate return statement
        return res.status(201).json(
            {
                message:'Successful translation.',
                response: result
            }
        )
   }catch(e){
        //deliver a 500 error response
        return res.status(500).json(
            {
                message:'Failed to send request.',
                error:e
            }
        )
   }

})

//chat with a runnable sequence
app.post(`${process.env.BASE_URL}/az-openai/runnable-sequence/chat`, async (req,res) => {
    //check for human message
    const { chatMsg } = req.body

    if(!chatMsg) return res.status(201).json({
        message:'Hey, you didn\'t send anything.'
    })

   //put the code in an error-handler
   try{
        //create a prompt template format template
        const prompt = ChatPromptTemplate.fromMessages(
            [
                ["system", `You are a French-to-English translator that detects if a message isn't in French. If it's not, you respond, "This is not French." Otherwise, you translate it to English.`],
                ["human", `${chatMsg}`]
            ]
        )

        //runnable chain
        const chain = RunnableSequence.from([prompt, llm, outPutParser])

        //chain result
        let result = await chain.invoke()


        //check and give appropriate return statement
        return res.status(201).json(
            {
                message:'Successful translation.',
                response: result
            }
        )
   }catch(e){
        //deliver a 500 error response
        return res.status(500).json(
            {
                message:'Failed to send request.',
                error:e
            }
        )
   }

})

//chat with a runnable sequence having a stream
//helps with responses that are long
app.post(`${process.env.BASE_URL}/az-openai/runnable-sequence/stream/chat`, async (req,res) => {
    //check for human message
    const { chatMsg } = req.body

    if(!chatMsg) return res.status(201).json({
        message:'Hey, you didn\'t send anything.'
    })

   //put the code in an error-handler
   try{
        //create a prompt template format template
        const prompt = ChatPromptTemplate.fromMessages(
            [
                ["system", `You are a French-to-English translator that detects if a message isn't in French. If it's not, you respond, "This is not French." Otherwise, you translate it to English.`],
                ["human", `${chatMsg}`]
            ]
        )

        //runnable chain
        const chain = RunnableSequence.from([prompt, llm, outPutParser])

        //chain result
        let result_stream = await chain.stream()

        //set response headers
        res.setHeader('Content-Type','application/json')
        res.setHeader('Transfer-Encoding','chunked')
    
        //create readable stream
        const readable = Readable.from(result_stream)

        res.status(201).write(`{"message": "Successful translation.", "response": "`);

        readable.on('data', (chunk) => {
            // Convert chunk to string and write it
            res.write(`${chunk}`);
        });
    
        readable.on('end', () => {
            // Close the JSON response properly
            res.write('" }');
            res.end();
        });
    
        readable.on('error', (err) => {
            console.error("Stream error:", err);
            res.status(500).json({ message: "Translation failed.", error: err.message });
        });
   }catch(e){
        //deliver a 500 error response
        return res.status(500).json(
            {
                message:'Failed to send request.',
                error:e
            }
        )
   }

})

//Stream response
app.post(`${process.env.BASE_URL}/az-openai/runnable-sequence/stream/chat`, async (req,res) => {
    //check for human message
    const { chatMsg } = req.body

    if(!chatMsg) return res.status(201).json({
        message:'Hey, you didn\'t send anything.'
    })

   //put the code in an error-handler
   try{
        //create a prompt template format template
        const prompt = ChatPromptTemplate.fromMessages(
            [
                ["system", `You are a French-to-English translator that detects if a message isn't in French. If it's not, you respond, "This is not French." Otherwise, you translate it to English.`],
                ["human", `${chatMsg}`]
            ]
        )

        //runnable chain
        const chain = RunnableSequence.from([prompt, llm, outPutParser])

        //chain result
        let result_stream = await chain.stream()

        //set response headers
        res.setHeader('Content-Type','application/json')
        res.setHeader('Transfer-Encoding','chunked')
    
        //create readable stream
        const readable = Readable.from(result_stream)

        res.status(201).write(`{"message": "Successful translation.", "response": "`);

        readable.on('data', (chunk) => {
            // Convert chunk to string and write it
            res.write(`${chunk}`);
        });
    
        readable.on('end', () => {
            // Close the JSON response properly
            res.write('" }');
            res.end();
        });
    
        readable.on('error', (err) => {
            console.error("Stream error:", err);
            res.status(500).json({ message: "Translation failed.", error: err.message });
        });
   }catch(e){
        //deliver a 500 error response
        return res.status(500).json(
            {
                message:'Failed to send request.',
                error:e
            }
        )
   }

})

//RAG Endpoints
//create the vector store instance
const mongoDbVectorStore = new MongoDBAtlasVectorSearch(
    azOpenEmbedding,
    {
        collection: vectorCollection,
        indexName: "myrag_index",
        textKey: "text",
        embeddingKey: "embedding",
      }
)

//retrieve relevant documents
app.post(`${process.env.BASE_URL}/az-openai/runnable-sequence/retrieval`, async (req,res) => {
   
    //check for human message
    const { chatMsgQ } = req.body

    if(!chatMsgQ) return res.status(201).json({
        message:'Hey, you didn\'t send anything.'
    })

   //put the code in an error-handler
  try{
        //create retriever
        const retriever = mongoDbVectorStore.asRetriever()
        const convertDocsToString = (documents) => {
            return documents.map((aDocument) => {
                // Check if aDocument is an instance of Document
                if (aDocument instanceof Document && typeof aDocument.pageContent === 'string') {
                    return `<doc>\n${aDocument.pageContent}\n</doc>`;
                } else {
                    // Handle invalid documents or missing 'pageContent'
                    console.warn("Invalid or missing 'pageContent' in document:", aDocument);
                    return `<doc>\nNo valid content available.\n</doc>`;
                }
            }).join("\n");
        };
       

        //runnable chain
        const chain = RunnableSequence.from([(input) => input.chatMsg, retriever, convertDocsToString])

        //chain result
        let result_ = await chain.invoke({chatMsg: chatMsgQ})

         //check and give appropriate return statement
         return res.status(201).json(
            {
                message:'Successful retrieval.',
                response: result_
            }
        )
       
   }catch(err){
        //deliver a 500 error response
        return res.status(500).json(
            {
                message:'Failed to send request.',
                error:err.message || err.toString()
            }
        )
   }

})


//synthesize and augment responses
app.post(`${process.env.BASE_URL}/az-openai/runnable-sequence/stream/rag/chat`, async (req,res) => {
   
    //check for human message
    const { chatMsgQ } = req.body

    if(!chatMsgQ) return res.status(201).json({
        message:'Hey, you didn\'t send anything.'
    })

   //put the code in an error-handler
  try{
        //create retriever
        const retriever = mongoDbVectorStore.asRetriever()
        const convertDocsToString = (documents) => {
            return documents.map((aDocument) => {
                // Check if aDocument is an instance of Document
                if (aDocument instanceof Document && typeof aDocument.pageContent === 'string') {
                    return `<doc>\n${aDocument.pageContent.slice(0, 200)}\n</doc>`;
                } else {
                    // Handle invalid documents or missing 'pageContent'
                    console.warn("Invalid or missing 'pageContent' in document:", aDocument);
                    return `<doc>\nNo valid content available.\n</doc>`;
                }
            }).join("\n");
        };

        const TEMPLATE_STRING = `
            You are an assistant for Safaricom MPESA, helping with MPESA business setup.
            <context>
                {context}
            </context>
            Question: {chatMsg}
            Answer based on context. If unsure, say "I do not know."
        `;


        //create a prompt template format template
        const prompt = ChatPromptTemplate.fromTemplate(TEMPLATE_STRING)

         //runnable chain
         const chain = RunnableSequence.from([(input) => input.chatMsg, retriever, convertDocsToString])

        //call all runnable objects
        const retrievalChain = RunnableSequence.from([
            {
            context: chain,
            chatMsg: (input) => input.chatMsg
            },
            prompt,
            llm,
            new StringOutputParser()
        ])

       

        //chain result
        let result_stream = await retrievalChain.invoke({chatMsg: chatMsgQ})

         // Send a successful status code first
        res.setHeader('Content-Type', 'text/plain')
        res.status(201)
    
        //create readable stream
        const readable = Readable.from(result_stream)

        // Stream each chunk as raw text
        readable.on('data', (chunk) => {
            res.write(chunk.toString());
            res.flushHeaders();
        });
    
        readable.on('end', () => {
            res.end();
        });
        
        readable.on('error', (err) => {
            console.error("Stream error:", err);
            res.status(500).end("Error streaming data");
        });
       
   }catch(err){
        //deliver a 500 error response
        return res.status(500).json(
            {
                message:'Failed to send request.',
                error:err.message || err.toString()
            }
        )
   }

})



//call server listener
app.listen(PORT, ()=> console.log(`App listening on PORT: ${PORT}...`))