import { pool } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";
import { ChunkText } from "@/lib/chunk-text";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const documentId = body.documentId;

    if (!documentId) {
      return NextResponse.json(
        {
          success: false,
          message: "Document Id is required",
        },
        {
          status: 400,
        }
      );
    }

    // 1. Get document metadata
    const result = await pool.query(
      `SELECT id, file_name, file_url
       FROM documents
       WHERE id = $1`,
      [documentId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Document not found",
        },
        {
          status: 404,
        }
      );
    }

    const document = result.rows[0];

    // 2. Download PDF from Supabase Storage
    const { data, error } = await supabaseAdmin.storage
      .from("documents")
      .download(document.file_url);

    if (error) {
      console.error("PDF download failed:", error);

      return NextResponse.json(
        {
          success: false,
          message: "Failed to download PDF",
        },
        {
          status: 500,
        }
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          success: false,
          message: "PDF file is empty",
        },
        {
          status: 500,
        }
      );
    }

    // 3. Convert Blob -> Buffer
    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log("PDF buffer size:", buffer.length);

    // 4. Extract PDF text
    const { PDFParse } = await import("pdf-parse");

    const pdfData = new PDFParse({
      data: buffer,
    });

    const info = await pdfData.getInfo();

    const text = await pdfData.getText({
      pageJoiner: "\n---PAGE_{page_number}---\n",
    });

    console.log("PDF pages:", info.total);
    console.log("Extracted text length:", text.text.length);

    if (!text.text.trim()) {
      return NextResponse.json(
        {
          success: false,
          message: "No text could be extracted from the PDF",
        },
        {
          status: 400,
        }
      );
    }

    // 5. Split extracted text into chunks
    const chunks = ChunkText(text.text);

    console.log("Number of chunks:", chunks.length);
    console.log("First chunk:", chunks[0]);

    // 6. Remove old chunks if document is processed again
    await pool.query(
      `DELETE FROM document_chunks
       WHERE document_id = $1`,
      [document.id]
    );

    // 7. Store chunks
    for (let i = 0; i < chunks.length; i++) {
      console.log("Inserting chunk:", i);

      await pool.query(
        `INSERT INTO document_chunks
        (document_id, context, page_number)
        VALUES ($1, $2, $3)`,
        [document.id, chunks[i], i + 1]
      );
    }

    // 8. Response
    return NextResponse.json({
      success: true,
      documentId: document.id,
      fileName: document.file_name,
      pages: info.total,
      totalCharacters: text.text.length,
      totalChunks: chunks.length,
    });
  } catch (error) {
    console.error("PDF processing failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to process PDF",
      },
      {
        status: 500,
      }
    );
  }
}