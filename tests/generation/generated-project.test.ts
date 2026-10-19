import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { readFileSync, rmSync, writeFileSync, symlinkSync, mkdirSync, lstatSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test } from "vitest";
import { completeV2Project, snapshotTree, repoRoot, write, readJson, type ValidationResult, type ProjectPackage, type ProjectLock } from "./generated-project-v2-fixture.js";
const {validateTripProject}=await import(pathToFileURL(join(repoRoot,"plugins/eternal-pose/scripts/validate-trip-project.mjs")).href) as {validateTripProject:(root:string,mode:string)=>Promise<ValidationResult>};
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
async function fixture() { const result = await completeV2Project(); roots.push(result.parent); return result; }
test("validates v2 entrypoints and canonical ledger without running commands or writing source", async () => {
 const {root}=await fixture(); const before=snapshotTree(root);
 const result=await validateTripProject(root,"local");
 expect(result.counts.errors).toBe(0); expect(snapshotTree(root)).toEqual(before);
 expect(result).not.toHaveProperty("commands");
});
test("redacted staging metadata is not parsed as empty JSON and candidate identity is still checked", async () => {
 const {root}=await fixture();
 write(root,".laugh-tale-local-candidates.json",'{"schemaVersion":1,"packages":[]}');
 write(root,".laugh-tale-staged-consumer.json",'{"schemaVersion":1}');
 const before=snapshotTree(root);
 const local=await validateTripProject(root,"local");
 expect(local.findings.filter(item=>item.code==="scan.malformed-code")).toEqual([]);
 const prior=process.env.ETERNAL_POSE_CANDIDATE_ATTESTATION;
 process.env.ETERNAL_POSE_CANDIDATE_ATTESTATION=join(root,".laugh-tale-local-candidates.json");
 try {
  const candidate=await validateTripProject(root,"candidate");
  expect(candidate.findings).toContainEqual(expect.objectContaining({code:"project.candidate-attestation-invalid"}));
 } finally { if(prior===undefined)delete process.env.ETERNAL_POSE_CANDIDATE_ATTESTATION;else process.env.ETERNAL_POSE_CANDIDATE_ATTESTATION=prior; }
 expect(snapshotTree(root)).toEqual(before);
});
test.each([".cache/config.js", "src/.cache/config.js", "src/dist/config.js", "src/coverage/config.js", "src/test-results/config.js", "src/playwright-report/config.js", "src/node_modules/config.js", "src/.git/config.js"])("publication analysis includes source path %s", async path => {
 const {root}=await fixture();
 write(root,path,'export const apiKey = "synthetic-review-credential";');
 const before=snapshotTree(root);
 const result=await validateTripProject(root,"local");
 expect(result.findings).toContainEqual(expect.objectContaining({severity:"error",code:"credential.generic-secret",path}));
 if(path.includes(".cache/"))expect(result.findings).toContainEqual(expect.objectContaining({code:"artifact.cache",path}));
 expect(snapshotTree(root)).toEqual(before);
});
test("static Validate requires the generated preflight implementation",async()=>{
 const {root}=await fixture();rmSync(join(root,"scripts/assert-project-readable.mjs"));
 const result=await validateTripProject(root,"local");
 expect(result.findings).toContainEqual(expect.objectContaining({severity:"error",code:"project.missing-file",path:"scripts/assert-project-readable.mjs"}));
});
test("root dependency and Git metadata trees remain outside source analysis",async()=>{
 const {root}=await fixture();
 for(const directory of ["node_modules",".git"])write(root,directory+"/config.js",'export const apiKey = "synthetic-review-credential";');
 expect((await validateTripProject(root,"local")).counts.errors).toBe(0);
});
test.each(["local","candidate","registry"])("null Trip has mode-specific readiness in %s", async mode => {
 const {root}=await fixture(); const result=await validateTripProject(root,mode);
 expect(result.findings).toContainEqual(expect.objectContaining({code:"trip-content.missing",severity:mode==="local"?"warning":"error"}));
});
test.each([
 ["ledger tamper","src/trip-content/place-resolutions.json",(v: {entries:unknown[];packages:Record<string,string>})=>{v.entries.push({ownerId:"foreign"});},"project.provenance-mismatch"],
 ["manifest package drift","eternal-pose.json",(v: {entries:unknown[];packages:Record<string,string>})=>{for(const name of Object.keys(v.packages))v.packages[name]="2.0.1";},"project.package-version-drift"],
] as const)("rejects %s",async (_name,path,mutate,code)=>{
 const {root}=await fixture(); const value=readJson<{entries:unknown[];packages:Record<string,string>}>(join(root,path));mutate(value);write(root,path,JSON.stringify(value));
 expect((await validateTripProject(root,"registry")).findings).toContainEqual(expect.objectContaining({code,severity:"error"}));
});
test("rejects undeclared presentation entry and mismatched copy locale",async()=>{
 const {root}=await fixture();
 write(root,"src/app/App.tsx",'import { presentation } from "../presentation/other";');
 write(root,"src/presentation/copy/catalog.ts",'export const locale = "fr-FR";');
 const result=await validateTripProject(root,"local");
 expect(result.findings).toContainEqual(expect.objectContaining({code:"project.presentation-entry-mismatch"}));
 expect(result.findings).toContainEqual(expect.objectContaining({code:"project.copy-locale-mismatch"}));
});
test.each(["file:../core.tgz","link:../core","workspace:*","git+https://example.invalid/core.git","^2.0.0"])("registry rejects %s",async spec=>{
 const {root}=await fixture();const path=join(root,"package.json");const value=readJson<ProjectPackage>(path);value.dependencies["@laugh-tale-island/core"]=spec;writeFileSync(path,JSON.stringify(value));
 expect((await validateTripProject(root,"registry")).findings).toContainEqual(expect.objectContaining({code:"project.invalid-package-specifier"}));
});
test.each(["prepared","committed"])("refuses %s journal without mutation",async phase=>{
 const {root}=await fixture();write(root,".laugh-tale-transaction-test",JSON.stringify({phase}));const before=snapshotTree(root);
 const result=await validateTripProject(root,"local");expect(result.findings).toEqual([expect.objectContaining({code:"project.transaction-in-progress",severity:"error"})]);expect(snapshotTree(root)).toEqual(before);
});
test("CLI accepts exactly one absolute root and known mode",()=>{
 const result=spawnSync(process.execPath,[join(repoRoot,"plugins/eternal-pose/scripts/validate-trip-project.mjs"),"relative","--mode","local"],{encoding:"utf8"});
 expect(result.status).toBe(1);expect(result.stdout).toContain("ETERNAL_POSE_VALIDATION_RESULT ");
});

function archive(name: string) {
 const body=Buffer.from(JSON.stringify({name,version:"2.0.0"}));const header=Buffer.alloc(512);
 header.write("package/package.json");header.write(body.length.toString(8).padStart(11,"0")+"\0",124);header[156]=48;
 return gzipSync(Buffer.concat([header,body,Buffer.alloc(512-body.length%512),Buffer.alloc(1024)]));
}
test.each(["correct","digest","size","name","version","missing","symlink","directory","archive-identity"])("candidate attestation: %s",async mutation=>{
 const {root,parent}=await fixture(); const pkg=readJson<ProjectPackage>(join(root,"package.json"));const lock=readJson<ProjectLock>(join(root,"package-lock.json"));
 const packages=["core","react","adapters","testing"].map(short=>{
  const name="@laugh-tale-island/"+short,path=join(parent,short+".tgz"),bytes=archive(mutation==="archive-identity"&&short==="core"?"@foreign/core":name);writeFileSync(path,bytes);
  const section=short==="testing"?"devDependencies":"dependencies";pkg[section][name]="file:"+path;lock.packages[""][section][name]="file:"+path;lock.packages["node_modules/"+name].resolved="file:"+path;
  return {name,version:"2.0.0",archive:path,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")};
 });
 if(mutation==="digest")packages[0].sha256="0".repeat(64);
 if(mutation==="size")packages[0].bytes++;
 if(mutation==="name")packages[0].name="@foreign/core";
 if(mutation==="version")packages[0].version="2.0.1";
 if(mutation==="symlink"){const path=packages[0].archive;writeFileSync(path+".actual",readFileSync(path));rmSync(path);symlinkSync(path+".actual",path);}
 write(root,"package.json",JSON.stringify(pkg));write(root,"package-lock.json",JSON.stringify(lock));
 const path=join(parent,"attestation.json");if(mutation==="directory")mkdirSync(path);else writeFileSync(path,JSON.stringify({schemaVersion:1,packages}));
 const previous=process.env.ETERNAL_POSE_CANDIDATE_ATTESTATION;
 try{if(mutation==="missing")delete process.env.ETERNAL_POSE_CANDIDATE_ATTESTATION;else process.env.ETERNAL_POSE_CANDIDATE_ATTESTATION=path;
  const result=await validateTripProject(root,"candidate");expect(result.findings.some(item=>item.code==="project.candidate-attestation-invalid")).toBe(mutation!=="correct");
 }finally{if(previous===undefined)delete process.env.ETERNAL_POSE_CANDIDATE_ATTESTATION;else process.env.ETERNAL_POSE_CANDIDATE_ATTESTATION=previous;}
});
test.each(["local","candidate","registry"])("%s never reads either provider credential",async mode=>{
 const {root}=await fixture();const environment=process.env;
 try{process.env=new Proxy(environment,{get(target,key):unknown{if(key==="ETERNAL_POSE_GOOGLE_PLACES_API_KEY"||key==="VITE_GOOGLE_MAPS_API_KEY")throw new Error("credential read");return Reflect.get(target,key) as unknown;}});
  const result=await validateTripProject(root,mode);expect(result.findings).toContainEqual(expect.objectContaining({code:"provider.google-key.unverified",severity:"warning"}));
 }finally{process.env=environment;}
});
test("registry rejects a non-npmjs lock URL",async()=>{
 const {root}=await fixture();const lock=readJson<ProjectLock>(join(root,"package-lock.json"));lock.packages["node_modules/@laugh-tale-island/core"].resolved="https://example.invalid/core.tgz";write(root,"package-lock.json",JSON.stringify(lock));
 expect((await validateTripProject(root,"registry")).findings).toContainEqual(expect.objectContaining({code:"project.non-registry-resolution"}));
});

test.each(["clean","prepared","committed","parent","symlink","malformed","multiple","installed-links"])("artifact preflight: %s",async state=>{
 const {root,parent}=await fixture();
 const journal=(path:string,target=root)=>{writeFileSync(path,"{}");const s=lstatSync(path);writeFileSync(path,JSON.stringify({phase:state,target,self:{dev:String(s.dev),ino:String(s.ino),type:"file"}}));};
 const path=join(root,".laugh-tale-transaction-test");
 if(["prepared","committed"].includes(state))journal(path);
 if(state==="parent")journal(join(parent,".laugh-tale-transaction-parent"));
 if(state==="malformed")writeFileSync(path,"{");
 if(state==="multiple"){journal(path);journal(path+"-other");}
 if(state==="symlink")symlinkSync(join(root,"package.json"),path);
 if(state==="installed-links"){mkdirSync(join(root,"node_modules/.bin"),{recursive:true});symlinkSync("../../package.json",join(root,"node_modules/.bin/example"));}
 const result=spawnSync(process.execPath,[join(root,"scripts/assert-project-readable.mjs")],{cwd:root,encoding:"utf8"});
 expect(result.status,result.stderr).toBe(["clean","installed-links"].includes(state)?0:1);
 if(!["clean","installed-links"].includes(state))expect((await validateTripProject(root,"local")).findings).toEqual([expect.objectContaining({code:"project.transaction-in-progress"})]);
});
test("static Validate rejects a journal injected during its stable read",async()=>{
 const {root}=await fixture();
 const module=join(repoRoot,"plugins/eternal-pose/scripts/validate-trip-project.mjs");
 const code=`import fs from 'node:fs/promises';import sync from 'node:fs';import {syncBuiltinESMExports} from 'node:module';let injected=false;const original=fs.open;fs.open=async(...args)=>{const handle=await original(...args);if(!injected&&String(args[0]).endsWith('/eternal-pose.json')){injected=true;sync.writeFileSync(${JSON.stringify(join(root,".laugh-tale-transaction-midread"))},'{}');}return handle;};syncBuiltinESMExports();const {validateTripProject}=await import(${JSON.stringify(module)});console.log(JSON.stringify(await validateTripProject(${JSON.stringify(root)},'local')));`;
 const result=spawnSync(process.execPath,["--input-type=module","-e",code],{encoding:"utf8"});expect(result.status,result.stderr).toBe(0);expect((JSON.parse(result.stdout) as ValidationResult).findings).toEqual([expect.objectContaining({code:"project.transaction-in-progress"})]);
});
test("artifact preflight refuses a file ancestor replaced by a symlink during its second read",async()=>{
 const {root}=await fixture(), directory=join(root,"src/trip-content");
 const code=`import fs from 'node:fs/promises';import sync from 'node:fs';import {syncBuiltinESMExports} from 'node:module';const original=fs.open;let reads=0;fs.open=async(...args)=>{const handle=await original(...args);if(String(args[0]).endsWith('/place-resolutions.json')&&++reads===2){const read=handle.readFile.bind(handle);handle.readFile=async(...arguments_)=>{const bytes=await read(...arguments_);sync.renameSync(${JSON.stringify(directory)},${JSON.stringify(directory+".displaced")});sync.symlinkSync(${JSON.stringify(directory+".displaced")},${JSON.stringify(directory)});return bytes;};}return handle;};syncBuiltinESMExports();const {assertProjectReadable}=await import(${JSON.stringify(join(root,"scripts/assert-project-readable.mjs"))});try{await assertProjectReadable(${JSON.stringify(root)});console.log('accepted');}catch(error){console.error(error.code);process.exitCode=1;}`;
 const result=spawnSync(process.execPath,["--input-type=module","-e",code],{encoding:"utf8"});
 expect(result.status,result.stdout+result.stderr).toBe(1);
 expect(result.stderr).toContain("transaction-in-progress");
});
test("static Validate executes with filesystem mutation and process spawning disabled",async()=>{
 const {root}=await fixture();const before=snapshotTree(root);const module=join(repoRoot,"plugins/eternal-pose/scripts/validate-trip-project.mjs");
 const code=`import fs from 'node:fs';import promises from 'node:fs/promises';import child from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';const deny=()=>{throw new Error('forbidden mutation/spawn')};for(const name of ['mkdir','mkdtemp','writeFile','appendFile','rename','unlink','rm','rmdir','copyFile','symlink']){if(promises[name])promises[name]=deny;if(fs[name])fs[name]=deny;if(fs[name+'Sync'])fs[name+'Sync']=deny;}for(const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])child[name]=deny;syncBuiltinESMExports();const {validateTripProject}=await import(${JSON.stringify(module)});console.log(JSON.stringify(await validateTripProject(${JSON.stringify(root)},'local')));`;
 const result=spawnSync(process.execPath,["--input-type=module","-e",code],{encoding:"utf8"});expect(result.status,result.stderr).toBe(0);expect((JSON.parse(result.stdout) as ValidationResult).counts.errors).toBe(0);expect(snapshotTree(root)).toEqual(before);
});
test("static Validate reachable module graph has no child-process import",()=>{
 const queue=[join(repoRoot,"plugins/eternal-pose/scripts/validate-trip-project.mjs")],seen=new Set<string>(),imports=new Set<string>();
 while(queue.length){const path=queue.pop()!;if(seen.has(path))continue;seen.add(path);const source=readFileSync(path,"utf8");
  for(const match of source.matchAll(/(?:from\s*|import\s*\(\s*|require\s*\(\s*|new URL\(\s*)["']([^"']+)["']/g)){
   const spec=match[1];imports.add(spec);if(spec.startsWith(".")&&/\.(?:mjs|cjs|js)$/.test(spec))queue.push(resolve(dirname(path),spec));
  }
 }
 expect([...imports]).not.toContain("node:child_process");expect([...imports]).not.toContain("child_process");
 expect([...seen].some(path=>path.endsWith("publication-analysis.mjs"))).toBe(true);
});
