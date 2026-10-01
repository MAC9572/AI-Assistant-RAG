import { pool } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { ChunkText } from "@/lib/chunk-text";
export const runtime = "nodejs";

export async function POST(request:Request){

try{
    const body = await request.json();
    const documentId =body.documentId;
    if(!documentId){
        return NextResponse.json({
            success :false,
            message :"Document Id is required"
        },{
            status :400
        })
    }
    //Get the Document MetaData
    const result = await pool.query(
        `SELECT id, file_name, file_url
        FROM documents
        WHERE id =$1`,
        [documentId]
    );
    if(result.rows.length===0){
        return NextResponse.json({
          success :false,
          message :"Document not found"
        },{
            status :404
        })
    }
    const document = result.rows[0];

    //2. Download PDF from Supabase storage
      const {data,error} = await supabaseAdmin.storage.from("documents")
      .download(document.file_url);

      if(error){
        console.error("PDF download failed", error);
        return NextResponse.json({
            success :false,
            message :"Failed to download PDF",
        },{
            status :500
        })
      }
      //3. convert blob to buffer
      const arrayBuffer = await data.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      //4. Extract PDF text
      const pdfData = new PDFParse({data :uint8Array});
      const info = await pdfData.getInfo();
      const text = await pdfData.getText({
       pageJoiner: "\n---PAGE_{page_number}---\n",
      });
      //split extracted text into chunks
      const chunks = ChunkText(text.text)
      console.log("Number of chunks:", chunks.length);
      console.log("First chunk:", chunks[0]);

      //remove old chunks if document is processed again
      await pool.query(
        `DELETE from document_chunks
        where document_id =$1`,
        [document.id]
      );
      //store chunks in document_chunks
      for(let i=0; i<chunks.length;i++){
          console.log("Inserting chunk:", i);
        await pool.query(
            `INSERT INTO document_chunks
            (document_id, context, page_number)
            VALUES ($1, $2, $3)`,
            [document.id, chunks[i], i+1]
        );
      }

      return NextResponse.json({
        status :200,
        documentId :document.id,
        fileName :document.file_name,
        pages :info.total,
        text :text.text,
        totalCharacters : text.text.length,
        totalChunks: chunks.length,
        chunks,
      }) 
}catch(error){
    console.log("PDF processing failed",error);
    return NextResponse.json({
        success :false,
        message :"Failed to process PDF", 
    },{
        status :500
    })
}
}