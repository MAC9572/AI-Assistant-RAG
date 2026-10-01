import { pool } from "@/lib/db";
import { gemini } from "@/lib/openai";
import { NextResponse } from "next/server";

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
     [JSON.stringify(queryEmbedding),documentId, 5]
);
 return NextResponse.json({
    success :true,
    question,
    results:result.rows
 });
}catch(error){
    console.log("Vector search failed", error);
    return NextResponse.json({
        success : false,
        message :error instanceof Error ? error.message : String(error)
    },{
        status :500
    });
}
}