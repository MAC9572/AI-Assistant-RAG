
import { pool } from "@/lib/db";
import { gemini } from "@/lib/openai";
import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";

export async function POST(request:Request){

try{
    const body = await request.json();
    const{documentId, question} =body;
    if(!documentId || !question){
       return NextResponse.json({
        success :false,
        message :"Document Id and question are required"
       },{
        status :400
       })
    }
     console.log("Retrieving chunks...");
  console.log("Document ID:", documentId);
  console.log("Question:", question);

    //create embedding for user question
    const embeddingResponse = await gemini.models.embedContent({
        model: "gemini-embedding-2",
        contents :question,
        config :{
            outputDimensionality :1536,
        }
    });
    const queryEmbedding =embeddingResponse.embeddings?.[0].values;
    console.log("Embedding length", queryEmbedding?.length);
    //search similar chunks
    const result =await pool.query(
        `select * from match_document_chunks(
        $1::vector,
        $2::uuid,
        $3
    ) `,
     [JSON.stringify(queryEmbedding),documentId, 3]
);
const chunks =result.rows;
if(chunks.length===0){
    return NextResponse.json({
        success :false,
        message :"No relevant information found",
        answer :null,
        sources :[]
    })
}
//3. create context from retrieved chunks
const context =chunks.map((chunk,index)=>`[
  Source ${index +1} - Page ${chunk.page_number}]\n${chunk.context}
`
).join('\n\n')

//4 . Ask LLM to answer the retrieved context
const response = await gemini.models.generateContent({
    model :"gemini-3.5-flash-lite",
    contents:[
        {
            role :"user",
            parts:[
                {
                    text : `
You are an AI assistant that answers questions
using the provided document context.

Rules:
- Answer only using the provided context.
- If the answer cannot be found in the context,
  say that the information is not available in
  the document.
- Do not invent information.
- Keep the answer clear and concise.
Document Context: 
${context}
Question : 
${question}`
                },
            ],
        }
                
            ]
});
const answer = response.text ?? "";
    
//Return answer and choices
const sources = chunks.map((chunk)=>({
    pageNumber: chunk.page_number,
    similarity: chunk.similarity,
    context:   chunk.context,
}));
return NextResponse.json({
    success :true,
    question,
    answer,
    sources,
})
}catch(error){
    console.log("RAG request failed", error);
    return NextResponse.json({
        success :false,
        message :error instanceof Error? error.message : String(error),
    },
{status :500})
}}
