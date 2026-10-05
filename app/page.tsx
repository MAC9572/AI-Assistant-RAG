"use client"
import { useEffect, useState, type ChangeEvent } from "react";
type uploadResponse ={
  success :boolean,
  message :string,
  document?:{
    id :string,
    file_name :string,
    file_url :string,
    created_At :string
  }
}

export default function Home() {
  const[selectedFile, setSelectedFile] =useState<File | null>(null)
  const[uploading, isUploading] =useState(false);
  const [message, setMessage] =useState("");
  const [documents, setDocuments] =useState<{id :string; file_name:string;}[]>([]);
  const [selectedDocuments, setSelectedDocuments] =useState('')
  const [question, setQuestion] =useState('');
  const [answer, setAnswer] =useState('');
  const [sources, setSources] =useState<{
    pageNumber :number | null;
    similarity : number;
    context :string
  }[]>([]);
  const [asking, setAsking] =useState(false);
  const [askMessage, setAskMessage] =useState("");
  useEffect(()=>{
      const loadDocuments =async()=>{
        try{
          const response = await fetch("/api/documents");
          const data = await response.json();
          if(!response.ok){
              throw new Error(data.message || "Failed to load documents")
          }
          console.log(data.document);
          setDocuments(data.document);
          if(data.document.length > 0){
           setSelectedDocuments(data.document[0].id);
          }
        }catch(error){
          console.log("Failed to load documents", error)
        }
      }
      loadDocuments();
   },[])
  const handleFileChange =(event:ChangeEvent<HTMLInputElement>)=>{
   const selectedFile = event.target.files?.[0];
   if(!selectedFile){
    return
   }
   if(selectedFile.type !=="application/pdf"){
    setMessage("Please select a PDF File");
    setSelectedFile(null);
    return;
   }
   setSelectedFile(selectedFile);
   setMessage("");
  }
  const handleUpload = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if(!selectedFile){
       setMessage("please select a PDF File");
       return;
    }
    try {
      isUploading(true);
      setMessage("");
    const formData =new FormData();
    formData.append("file", selectedFile)
    
    const response = await fetch("/api/documents/upload",{
      method :"POST",
      body : formData
    })
    const data = await response.json();
    if(!response.ok){
      throw new Error(data.message || "Upload Failed")
    } 
    const documentId = data.document?.id;

if (!documentId) {
  throw new Error("Document ID was not returned after upload");
}
setMessage("PDF uploaded. Processing document...");
const processResponse = await fetch("/api/documents/process",{
  method :"POST",
  headers:{
    "Content-Type" : "application/json"
  },
  body :JSON.stringify({
    documentId,
  }),
});
const processData = await processResponse.json();
if (!processResponse.ok) {
  throw new Error(
    processData.message || "Failed to process document"
  );
}
    setMessage("PDF Processed. Generating Embeddings...")

   const embedResponse = await fetch(
  "/api/documents/embed",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      documentId,
    }),
  }
);

const embedData = await embedResponse.json();

if (!embedResponse.ok) {
  throw new Error(
    embedData.message ||
      "Failed to generate embeddings"
  );
}
    setMessage(
  "PDF uploaded, processed and embedded successfully"
);
      setSelectedFile(null);
    }catch(error){
      console.log("Upload error", error)
      setMessage(error instanceof Error ? error.message : "Something went wrong")
    } finally {
      isUploading(false)
   } };
   
   const handleAsk = async()=>{
    if(!selectedDocuments){
      setAskMessage("Please select a document");
      return;
    }
    if(!question.trim){
      setAskMessage("Please enter a question");
      return;
    }
    try{
      setAsking(true);
      setAskMessage("");
      setAnswer("");
      setSources([]);

      const response = await fetch("/api/ask",{
         method :"POST",
         headers:{
          "Content-Type" :"application/json",
         },
         body :JSON.stringify({
          documentId :selectedDocuments,
          question :question
         }),
      });
      const data = await response.json();
      if(!response.ok || !data.success){
         throw new Error(
             data.message || "Failed to get answer"
         );
      }
      console.log(data.answer)
      setAnswer(data.answer);
      setSources(data.sources || []);
    } catch(error){
      console.log("Ask error :", error);
      setAskMessage(
        error instanceof Error ? error.message : String(error)
      );
    } finally{
      setAsking(false)
    }
   }
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-3xl font-bold text-black">AI Knowledge Assistant</h1>
              <p className="mt-2 text-gray-600">Upload the documents and ask questions using RAG.</p>
              <div className="mt-8 grid gap-6 md:grid-cols-3">
                <div className="rounded-lg bg-white p-6 shadow">
                  <h2 className="text-lg font-semibold text-black">Documents</h2>
                  <p className="mt-2 text-sm text-gray-600">Upload and manage your documents.</p>
                  <form onSubmit={handleUpload}
                  className="mt-5 space-y-4"
                  >
                    <input type ="file"
                    accept="application/pdf"
                    onChange={handleFileChange}
                    className="block w-full rounded-lg border border-gray-300 p-2 text-sm text-gray-600" />
                  {selectedFile &&(
                    <p className="text-sm text-gray-600"> Selected: {selectedFile.name}</p>
                  )}
                  <button
                  type ="submit"
                  disabled ={!selectedFile || uploading}
                  className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed"
                  >{uploading ?"Uploading" :"Upload PDF"}</button>
                  {message && 
                  <p className="text-sm text-gray-700">{message}</p>}
                  </form>
                </div>
                <div className="mt-2 rounded-lg bg-white p-6 shadow">
                  <h2 className="text-lg font-semibold text-black">Ask Questions</h2>
                  <p className="mt-2 text-sm text-gray-600">Ask questions about your uploaded documents</p>
                    <div className="mt-5">
    <label className="mb-2 block text-sm font-medium text-gray-700">
      Select Document
    </label> 
    <select
     value ={selectedDocuments}
     onChange={(event)=>setSelectedDocuments(event.target.value)}
           className="w-full rounded-lg border border-gray-300 p-2 text-sm text-gray-500">
            <option value=""> Select a Document</option>
          {documents.map((document)=>(
            <option
            key ={document.id}
            value={document.id}
            >{document.file_name}</option>
          ))}
    </select>
    </div>
      <div className="mt-4">
    <label className="mb-2 block text-sm font-medium text-gray-700">
      Question
    </label>
    <textarea
    value={question}
    onChange={(e)=>setQuestion(e.target.value)}
    placeholder="Tell me about the purchase date of your bills?"
    rows={3}
    className="w-full resize-none rounded-lg border border-gray-300 p-2 text-sm text-gray-600"
    />
</div>              
{/*Ask Button */}
<button
 type ="button"
 onClick={handleAsk}
 disabled={
 asking || !selectedDocuments || !question.trim()
 }
className="mt-4 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
>{asking ? "Thinking..." :"Ask Question"}
</button>  
{/*Error/ status */}
{askMessage && (
  <p className="mt-2 text-red-500">{askMessage}</p>
)}
                </div>
                {answer && (
  <div className="mt-8 rounded-lg bg-white p-6 shadow">
    <h2 className="text-lg font-semibold text-black">
      Answer
    </h2>

    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-gray-700">
      {answer}
    </p>
  </div>
)}
                <div className="mt-2 rounded-lg bg-white p-6 shadow">
                  <h2 className="text-lg font-semibold text-black">Sources</h2>
                  <p className="mt-2 text-sm text-gray-600">See the documents to generate each answer</p>
                  {sources.length >0 && (
                    <div className="mt-4 space-y-3">
                      {sources.map((source,index)=>(
                        <div key={index}
                        className="rounded-lg border border-gray-200 p-3"
                        >
                          <div className="flex justify-between">
                            <span className="text-sm font-medium text-gray-800">
                              Page {source.pageNumber ?? "unknown"}
                            </span>
                           <span className="text-xs text-gray-500">
                             similarity :{" "}
                             {source.similarity.toFixed(3)}
                           </span>
                          </div>

                             <textarea
                             value ={source.context}
                             readOnly
                             rows={3}
                             className="w-full resize-none overflow-y-auto rounded-lg border border-gray-300 bg-gray-50 p-3 text-sm leading-6 text-gray-700 focus:outline-none">
                             </textarea>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
      </div>
    </main>
  );
}
