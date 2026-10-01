import { pool } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(){
    try{
        const result = await pool.query(
          `SELECT id, file_name from documents ORDER BY created_at DESC `
        );
        return NextResponse.json({
            success :true,
            document :result.rows,
        })
    } catch(error){
        console.log("Failed to load documents:",error);
        return NextResponse.json({
            success :false,
            message :"Failed to load documents"
        },{
            status :500
        })
    }

}