import { pool } from "@/lib/db";
import { gemini } from "@/lib/openai";
import { NextResponse } from "next/server";

export async function POST(request :Request){
    try{
        const body = await request.json();
        const documentId = body.documentId;
        if(!documentId){
            return NextResponse.json({
                success :false,
                message : "Document ID is required"
            },{
                status :400
            })
        }
        const result = await pool.query(
            `SELECT id, context FROM document_chunks
               WHERE document_id =$1
               AND embedding IS NULL
               ORDER BY created_at`,
               [documentId]
        );
        if(result.rows.length==0){
            return NextResponse.json({
                success :false,
                message :"No chunks found",
            },{
               status :404,
            });
        }
        for(const chunk of result.rows){
    console.log("API key exists:", !!process.env.OPENAI_API_KEY);
  console.log("Chunk ID:", chunk.id);
  console.log("Context length:", chunk.context.length);

            //Generate embedding
        const response = await gemini.models.embedContent({
            model :"gemini-embedding-2",
            contents :chunk.context,
            config : {
                outputDimensionality:1536,
            }
        });
        const embedding = response.embeddings?.[0].values;
          console.log("Embedding length:", embedding?.length);
        console.log("Generated embedding for chunk", chunk.id);
//        
        //SAVE EMBEEDING
          await pool.query(
            `UPDATE document_chunks 
            SET embedding =$1
            WHERE id =$2
            `,
            [JSON.stringify(embedding),chunk.id]
          )
        }
        return NextResponse.json({
            success :true,
            documentId,
            totalChunks :result.rows.length,
        });
    }
    catch(error){
        console.error("Embedding generation failed",error)
        return NextResponse.json({
            success :false,
            message:String(error),
            error : JSON.stringify(error, Object.getOwnPropertyNames(error)),
        },{
            status:500
        })
    }
}
