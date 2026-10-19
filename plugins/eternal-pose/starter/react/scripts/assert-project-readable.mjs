import { constants } from "node:fs";
import process from "node:process";
import console from "node:console";
import { createHash } from "node:crypto";
import { lstat, open, readdir } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const identity = stat => ({dev:String(stat.dev),ino:String(stat.ino),type:stat.isDirectory()?"directory":stat.isFile()?"file":"other"});
const same = (a,b) => a?.dev===b?.dev && a?.ino===b?.ino && a?.type===b?.type;
const busy = () => Object.assign(new Error("project.transaction-in-progress: project is not a clean stable generation"),{code:"transaction-in-progress"});
async function stat(path) { try{return await lstat(path,{bigint:true});}catch(error){if(error.code==="ENOENT")return null;throw error;} }
async function ancestors(path) {
 const result=[];let current=parse(path).root;
 for(const part of path.slice(current.length).split("/").filter(Boolean)){
  current=join(current,part);const value=await stat(current);
  if(!value || !value.isDirectory() || value.isSymbolicLink())throw busy();
  result.push([current,identity(value)]);
 }
 return result;
}
async function file(path) {
 const chain=await ancestors(dirname(path));
 const before=await stat(path);
 if(!before?.isFile() || before.isSymbolicLink())throw busy();
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try {
  if(!same(identity(before),identity(await handle.stat({bigint:true}))))throw busy();
  const bytes=await handle.readFile();
  for(const [ancestor,previous] of chain){
   const current=await stat(ancestor);
   if(!current || !same(previous,identity(current)))throw busy();
  }
  const after=await stat(path);
  if(!after || !same(identity(before),identity(after)) || before.mtimeNs!==after.mtimeNs || before.ctimeNs!==after.ctimeNs)throw busy();
  return {bytes,identity:identity(after),hash:createHash("sha256").update(bytes).digest("hex")};
 }finally{await handle.close();}
}
async function guard(target) {
 const lock=join(dirname(target),".laugh-tale-writer-"+createHash("sha256").update(target).digest("hex"));
 if(await stat(lock)||await stat(lock+".recovery"))throw busy();
 let count=0;
 for(const directory of [dirname(target),target]) {
  const directoryStat=await stat(directory);
  if(!directoryStat)continue;
  if(!directoryStat.isDirectory()||directoryStat.isSymbolicLink())throw busy();
  for(const name of await readdir(directory)) {
   if(!name.startsWith(".laugh-tale-transaction-"))continue;
   const record=await file(join(directory,name));
   let value;try{value=JSON.parse(record.bytes.toString("utf8"));}catch{throw busy();}
   if(!same(record.identity,value?.self))throw busy();
   if(value.target===target)count++;
   else if(directory===target||typeof value.target!=="string")throw busy();
  }
 }
 if(count)throw busy();
}
export async function assertProjectReadable(projectDir) {
 const root=resolve(projectDir);
 try {
  await guard(root);
  const chain=await ancestors(root), before=await stat(root);
  const paths=["eternal-pose.json","package.json","package-lock.json","src/trip-content/trip-input.json","src/trip-content/place-resolutions.json"];
  const snapshots=new Map();
  for(const path of paths)snapshots.set(path,await file(join(root,path)));
  for(const [path,previous] of snapshots){
   const current=await file(join(root,path));
   if(!same(current.identity,previous.identity)||current.hash!==previous.hash)throw busy();
  }
  await guard(root);
  for(const [path,previous] of chain){const current=await stat(path);if(!current||!same(previous,identity(current)))throw busy();}
  const after=await stat(root);
  if(!after||before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs)throw busy();
 }catch{throw busy();}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{await assertProjectReadable(process.cwd());}catch(error){console.error(error.message);process.exitCode=1;}
}
