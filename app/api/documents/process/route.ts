import { pool } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";
import { ChunkText } from "@/lib/chunk-text";
import PDFParser from "pdf2json";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    // --------------------------------------------------
    // 1. Get document ID
    // --------------------------------------------------

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

    // --------------------------------------------------
    // 2. Get document metadata from PostgreSQL
    // --------------------------------------------------

    const result = await pool.query(
      `
      SELECT id, file_name, file_url
      FROM documents
      WHERE id = $1
      `,
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

    console.log("Processing document:", document.file_name);
    console.log("Stored file path:", document.file_url);

    // --------------------------------------------------
    // 3. Get correct Supabase Storage path
    // --------------------------------------------------
    //
    // file_url should ideally contain:
    //
    // 1791211948088-4241983205.pdf
    //
    // NOT the complete Supabase URL.
    //

    let filePath = document.file_url;

    if (filePath.includes("/storage/v1/object/")) {
      const marker = "/storage/v1/object/";

      filePath = filePath.substring(
        filePath.indexOf(marker) + marker.length
      );

      // Remove bucket name
      if (filePath.startsWith("documents/")) {
        filePath = filePath.substring("documents/".length);
      }
    }

    console.log("Supabase storage path:", filePath);

    // --------------------------------------------------
    // 4. Download PDF from Supabase Storage
    // --------------------------------------------------

    const { data, error } = await supabaseAdmin.storage
      .from("documents")
      .download(filePath);

    if (error) {
      console.error("PDF download failed:", error);

      return NextResponse.json(
        {
          success: false,
          message: "Failed to download PDF",
          error: error.message,
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
          message: "PDF file was not found",
        },
        {
          status: 404,
        }
      );
    }

    // --------------------------------------------------
    // 5. Convert Blob -> Buffer
    // --------------------------------------------------

    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log("PDF buffer size:", buffer.length);

    if (buffer.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "PDF file is empty",
        },
        {
          status: 400,
        }
      );
    }

    // --------------------------------------------------
    // 6. Extract PDF text using pdf2json
    // --------------------------------------------------

    const extractedPages = await extractPdfText(buffer);

    console.log("Number of PDF pages:", extractedPages.length);

    if (extractedPages.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "No pages found in PDF",
        },
        {
          status: 400,
        }
      );
    }

    // --------------------------------------------------
    // 7. Create chunks while preserving page numbers
    // --------------------------------------------------

    const allChunks: {
      text: string;
      pageNumber: number;
    }[] = [];

    for (const page of extractedPages) {
      if (!page.text.trim()) {
        continue;
      }

      const pageChunks = ChunkText(page.text);

      for (const chunk of pageChunks) {
        if (chunk.trim()) {
          allChunks.push({
            text: chunk,
            pageNumber: page.pageNumber,
          });
        }
      }
    }

    console.log("Total chunks:", allChunks.length);

    if (allChunks.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "No text could be extracted from PDF",
        },
        {
          status: 400,
        }
      );
    }

    console.log("First chunk:", allChunks[0]);

    // --------------------------------------------------
    // 8. Delete existing chunks
    // --------------------------------------------------

    await pool.query(
      `
      DELETE FROM document_chunks
      WHERE document_id = $1
      `,
      [document.id]
    );

    // --------------------------------------------------
    // 9. Insert chunks into document_chunks
    // --------------------------------------------------

    for (let i = 0; i < allChunks.length; i++) {
      const chunk = allChunks[i];

      console.log(
        `Inserting chunk ${i + 1}/${allChunks.length}, page ${chunk.pageNumber}`
      );

      await pool.query(
        `
        INSERT INTO document_chunks
        (
          document_id,
          context,
          page_number
        )
        VALUES ($1, $2, $3)
        `,
        [
          document.id,
          chunk.text,
          chunk.pageNumber,
        ]
      );
    }

    // --------------------------------------------------
    // 10. Return success
    // --------------------------------------------------

    return NextResponse.json({
      success: true,
      documentId: document.id,
      fileName: document.file_name,
      pages: extractedPages.length,
      totalCharacters: extractedPages.reduce(
        (total, page) => total + page.text.length,
        0
      ),
      totalChunks: allChunks.length,
      chunks: allChunks,
    });
  } catch (error) {
    console.error("PDF processing failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to process PDF",
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      {
        status: 500,
      }
    );
  }
}

// ======================================================
// PDF TEXT EXTRACTION
// ======================================================

type ExtractedPage = {
  pageNumber: number;
  text: string;
};

async function extractPdfText(
  buffer: Buffer
): Promise<ExtractedPage[]> {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();

    pdfParser.on("pdfParser_dataError", (error: any) => {
      console.error("pdf2json parsing error:", error);

      reject(
        error?.parserError ||
          error ||
          new Error("Failed to parse PDF")
      );
    });

    pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
      try {
        const pages = pdfData?.Pages || [];

        const extractedPages: ExtractedPage[] = pages.map(
          (page: any, pageIndex: number) => {
            const texts = page?.Texts || [];

            const pageText = texts
              .map((textItem: any) => {
                const runs = textItem?.R || [];

                return runs
                  .map((run: any) => {
                    const encodedText = run?.T || "";

                    try {
                      return decodeURIComponent(
                        encodedText
                      );
                    } catch {
                      return encodedText;
                    }
                  })
                  .join("");
              })
              .join(" ");

            return {
              pageNumber: pageIndex + 1,
              text: pageText.trim(),
            };
          }
        );

        resolve(extractedPages);
      } catch (error) {
        reject(error);
      }
    });

    pdfParser.parseBuffer(buffer);
  });
}