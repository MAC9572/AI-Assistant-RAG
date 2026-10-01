import { Pool } from "pg";
const connectionString =process.env.DATABASE_URL;

if(!connectionString){
    throw new Error('DATABASE_URL is not configured');
}

export const pool =new Pool({
   connectionString,
   max: 10,
   idleTimeoutMillis:30_000,
   connectionTimeoutMillis:50_000
})