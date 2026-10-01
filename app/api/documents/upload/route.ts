import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

const MAX_FILE_SIZE =10*1024*1024; //10mb
export async function POST(req :Request){
try{
const formData = await req.formData();
const file =formData.get("file");
if(!(file instanceof File)){
    return NextResponse.json({
        success :"false",
        message :"please upload a PDF File"
    },{
        status :400
    }
)} 
if(file.type !=="application/pdf"){
      return NextResponse.json({
        success :"false",
        message :"Only PDF files are allowed"
      },{
        status :400
      }
)}
if(file.size >MAX_FILE_SIZE){
return NextResponse.json({
        success :"false",
        message :"File must be less than 10 MB"
      },{
        status :400
      }
)}

const newFileName = file.name.replace(/[^a-zA-Z0-9._-]/g,"_")
const filePath =`${Date.now()}-${newFileName}`;
const fileBuffer =Buffer.from(await file.arrayBuffer());
const {error: uploadError} =await supabaseAdmin.storage.from('documents')
.upload(filePath, fileBuffer,{
    contentType :"application/Pdf",
    upsert :false,
})
if(uploadError){
    console.log("supabase upload failed", uploadError);
    return NextResponse.json({
        success :false,
        message :"Failed to upload file to storage",
    },{
        status :500
    })
} 
const result =await pool.query(
    `INSERT INTO documents (file_name, file_url)
    values($1,$2)
    RETURNING id, file_name, file_url, created_At`,
     [file.name, filePath]
);
return NextResponse.json({
   success :true,
   message :"PDF Uploaded Successfully",
   document : result.rows[0]
},{
    status :201
}) 
}catch(error){
console.log("PDF Upload failed",error);
return NextResponse.json({
    success :false,
    message :"something went wrong"
},{
    status :500
})
}}