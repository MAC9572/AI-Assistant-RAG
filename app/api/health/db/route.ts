import { pool } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(){

try{
    const result =await pool.query("select now() as current_time");
    return NextResponse.json({
        success :true,
        message : "Database Connected Successfully",
        currentTime :result.rows[0].current_time
    })
}
catch(error){
    console.log('Database connection failed', error);
    return NextResponse.json({
        success:false,
        message :"Database Connection Failed",
    },{
        status :500,
    })
}
}