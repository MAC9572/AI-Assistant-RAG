import { ChunkText } from "./chunk-text";

export type PageChunk ={
    context :string,
    pageNumber :number;
};

export function ChunkPages(text :string):PageChunk[]{
   const pages =text.split(/---PAGE_(\d+)---/);
   const chunks :PageChunk[]=[];
   for(let i =1; i<pages.length; i+=2){
    const pageNumber = Number(pages[i]);
    const pageText = pages[i+1]
    const pageChunks = ChunkText(pageText)
    for(const chunk of pageChunks){
        chunks.push({
            context :chunk,
            pageNumber,
        });
    }
   }
   return chunks;
}