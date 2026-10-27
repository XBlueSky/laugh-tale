import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { gunzipSync } from "node:zlib";
import { lstat, readdir } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readProjectFileSet } from "../lib/atomic-publication.mjs";
import { readRegularFile } from "../lib/path-safety.mjs";
import { scanPublicationSnapshot } from "../lib/publication-analysis.mjs";
import { parseTripProjectManifest, assertManifestMatchesLedger, ETERNAL_POSE_PACKAGE_NAMES } from "../lib/project-manifest-v2.mjs";
import { parseTripProjectInputV2 } from "../lib/trip-project-input-v2.mjs";
import { parsePlaceResolutionLedger } from "../lib/place-resolution-ledger.mjs";
import { loadRecipeV2Catalog } from "../lib/recipe-v2.mjs";

const modes = ["local", "candidate", "registry"];
const exact = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const roots = ["README.md", "AGENTS.md", "CLAUDE.md", ".env.example", ".gitignore", "package.json", "package-lock.json", "eternal-pose.json", "docs/trip-experience-contract.md", "scripts/assert-project-readable.mjs", "src/app/App.tsx", "src/main.tsx", "src/trip-content/trip-input.json", "src/trip-content/place-resolutions.json", "src/trip-content/trip.ts"];
const scripts = ["test", "type-check", "lint", "test:experience", "test:a11y", "build"];
// Only root dependency installation and Git metadata are outside project source.
// Nested names and cache/build output still require publication analysis.
const skippedRootEntries = new Set(["node_modules", ".git"]);
export const finding = (code, path, message, severity = "error") => ({ severity, code, path, message });
export function summarize(mode, findings) {
 const sorted = [...findings].sort((a,b)=>a.path.localeCompare(b.path)||a.code.localeCompare(b.code));
 return { mode, counts: { errors: sorted.filter(f=>f.severity==="error").length, warnings: sorted.filter(f=>f.severity==="warning").length }, findings: sorted };
}
export function parseArguments(args) {
 let root=null, mode=null;
 for(let i=0;i<args.length;i++) {
  if(args[i]==="--mode" && mode===null) mode=args[++i];
  else if(args[i]==="--root" && root===null) root=args[++i];
  else if(!args[i].startsWith("--") && root===null) root=args[i];
  else return null;
 }
 return typeof root==="string" && isAbsolute(root) && modes.includes(mode) ? {root:resolve(root),mode}:null;
}
export function invalidArgumentsResult() { return summarize(null,[finding("project.invalid-arguments",".","Expected one absolute project root and --mode local|candidate|registry.")]); }
export function transactionFinding() { return finding("project.transaction-in-progress",".","Project transaction or file generation changed; retry after the writer finishes."); }
const object = value => value!==null && typeof value==="object" && !Array.isArray(value);

/** Capture all owned source bytes through the journal-aware reader before parsing anything.
 * Dependency trees may contain npm's executable symlinks and are intentionally outside this inventory. */
export async function projectSnapshot(root) {
 await readProjectFileSet({projectDir:root,paths:[]});
 const paths=[], privateFiles=[];
 async function visit(directory,prefix="") {
  for(const name of (await readdir(directory)).sort()) {
   if(prefix==="" && skippedRootEntries.has(name)) continue;
   if(name.startsWith(".laugh-tale-")) { privateFiles.push(prefix+name); continue; }
   if(name.startsWith(".env") && name!==".env.example") { privateFiles.push(prefix+name); continue; }
   const path=join(directory,name), relative=prefix+name, stats=await lstat(path);
   if(stats.isSymbolicLink()) throw new Error("Project source cannot contain symbolic links.");
   if(stats.isDirectory()) await visit(path,relative+"/");
   else if(stats.isFile()) paths.push(relative);
   else throw new Error("Project source must contain regular files.");
  }
 }
 await visit(root);
 const files=await readProjectFileSet({projectDir:root,paths});
 for(const path of privateFiles) files.set(path,Buffer.alloc(0));
 const hash=createHash("sha256");
 for(const [name,bytes] of files) {
  const stat=await lstat(join(root,name),{bigint:true});
  hash.update(name).update("\0").update(bytes).update("\0").update([stat.dev,stat.ino,stat.mtimeNs,stat.ctimeNs].join(":"));
 }
 return {files,hash:hash.digest("hex"),redactedPaths:new Set(privateFiles)};
}
async function candidateArtifacts(root, manifest, pkg, lock, findings) {
 try {
  const path=process.env.ETERNAL_POSE_CANDIDATE_ATTESTATION;
  if(typeof path!=="string" || !isAbsolute(path)) throw new Error("Candidate attestation must be an absolute regular JSON file.");
  const record=JSON.parse((await readRegularFile(path)).bytes.toString("utf8"));
  if(record.schemaVersion!==1 || !Array.isArray(record.packages) || record.packages.length!==4) throw new Error("Candidate attestation must contain exactly four packages.");
  const seen=new Set();
  for(const name of ETERNAL_POSE_PACKAGE_NAMES) {
   const matches=record.packages.filter(item=>item.name===name); const item=matches[0];
   if(matches.length!==1 || item.version!==manifest.packages[name] || !isAbsolute(item.archive) || !item.archive.endsWith(".tgz") || seen.has(item.archive)) throw new Error("Candidate package identity mismatch.");
   seen.add(item.archive);
   const section=name.endsWith("/testing")?"devDependencies":"dependencies";
   const spec=pkg[section]?.[name], entry=lock.packages?.["node_modules/"+name];
   if(typeof spec!=="string" || !spec.startsWith("file:") || resolve(root,spec.slice(5))!==item.archive) throw new Error("Candidate specifier must name its attested archive.");
   const file=await readRegularFile(item.archive);
   if(file.bytes.length!==item.bytes || file.hash!==item.sha256) throw new Error("Candidate archive size or SHA-256 mismatch.");
   const archive=gunzipSync(file.bytes,{maxOutputLength:64*1024*1024});
   const packageManifests=[];
   for(let offset=0;offset+512<=archive.length;) {
    const header=archive.subarray(offset,offset+512);
    if(header.every(byte=>byte===0))break;
    const name=header.subarray(0,100).toString("utf8").replace(/\0.*$/s,"");
    const size=Number.parseInt(header.subarray(124,136).toString("ascii").replace(/\0.*$/s,"").trim(),8);
    if(!Number.isSafeInteger(size)||size<0||offset+512+size>archive.length)throw new Error("Invalid candidate archive.");
    if(name==="package/package.json") {
     if(header[156]!==0&&header[156]!==48)throw new Error("Candidate manifest must be a regular file.");
     packageManifests.push(JSON.parse(archive.subarray(offset+512,offset+512+size).toString("utf8")));
    }
    offset+=512+Math.ceil(size/512)*512;
   }
   if(packageManifests.length!==1||packageManifests[0].name!==name||packageManifests[0].version!==item.version)throw new Error("Candidate archive package name/version mismatch.");
   if(entry?.version!==item.version || typeof entry.resolved!=="string" || !entry.resolved.startsWith("file:") || resolve(root,entry.resolved.slice(5))!==item.archive) throw new Error("Candidate lock identity mismatch.");
   if(item.integrity!==undefined && (entry.integrity!==item.integrity || item.integrity!=="sha512-"+createHash("sha512").update(file.bytes).digest("base64"))) throw new Error("Candidate integrity mismatch.");
  }
 } catch(error) { findings.push(finding("project.candidate-attestation-invalid","package.json",error.message)); }
}
export async function validateTripProject(rootDir,mode) {
 if(typeof rootDir!=="string" || !isAbsolute(rootDir) || !modes.includes(mode)) return invalidArgumentsResult();
 const root=resolve(rootDir), findings=[];
 let snapshot;
 try { snapshot=await projectSnapshot(root); }
 catch(error) { return summarize(mode,[error.code==="transaction-in-progress"?transactionFinding():finding("project.invalid-source",".",error.message)]); }
 const {files}=snapshot;
 const text=path=>files.get(path)?.toString("utf8")??"";
 for(const path of roots) if(!files.has(path)) findings.push(finding("project.missing-file",path,"Required project file is missing."));
 const parse=(path,parser=value=>value,code="project.invalid-json")=>{
  if(!files.has(path))return null;
  try{return parser(JSON.parse(text(path)));}catch(error){findings.push(finding(code,path,error.message));return null;}
 };
 const manifest=parse("eternal-pose.json",parseTripProjectManifest,"project.invalid-manifest");
 const input=parse("src/trip-content/trip-input.json",parseTripProjectInputV2,"project.invalid-trip-input");
 const pkg=parse("package.json",value=>value,"project.invalid-package-json"),lock=parse("package-lock.json");
 const ledger=parse("src/trip-content/place-resolutions.json",value=>{
  if(manifest)assertManifestMatchesLedger(manifest,value);
  return input?parsePlaceResolutionLedger(value,input):value;
 },"project.provenance-mismatch");
 void ledger;
 if(object(pkg)) {
  if(!object(pkg.scripts)) findings.push(finding("project.invalid-scripts","package.json","Scripts must be an object."));
  for(const script of scripts) {
   if(typeof pkg.scripts?.[script]!=="string" || !pkg.scripts[script].trim()) findings.push(finding("project.missing-script","package.json","Required script missing: "+script));
   if(pkg.scripts?.["pre"+script]!=="node scripts/assert-project-readable.mjs") findings.push(finding("project.missing-read-preflight","package.json","Required transaction preflight missing: "+script));
  }
  for(const [script,path] of [["test:experience","generated-experience.contract.test.tsx"],["test:a11y","generated-accessibility.contract.test.tsx"]]) {
   if(pkg.scripts?.[script]!=="vitest run src/app/"+path || !files.has("src/app/"+path)) findings.push(finding("project.missing-contract-suite","package.json","Generated contract suite missing: "+script));
  }
  const sections=["dependencies","devDependencies","optionalDependencies","peerDependencies"];
  for(const name of ETERNAL_POSE_PACKAGE_NAMES) {
   const expected=name.endsWith("/testing")?"devDependencies":"dependencies";
   const locations=sections.filter(section=>object(pkg[section])&&Object.hasOwn(pkg[section],name));
   if(!locations.includes(expected)) findings.push(finding("project.missing-package-dependency","package.json","Missing package: "+name));
   if(locations.some(section=>section!==expected)) findings.push(finding("project.misplaced-package-dependency","package.json","Misplaced package: "+name));
   const spec=pkg[expected]?.[name];
   if(mode!=="candidate" && (typeof spec!=="string" || !exact.test(spec))) findings.push(finding("project.invalid-package-specifier","package.json","An exact semver is required for "+name));
   if(mode!=="candidate" && manifest && spec!==manifest.packages[name]) findings.push(finding("project.package-version-drift","package.json","Package version differs from eternal-pose.json: "+name));
   const entry=lock?.packages?.["node_modules/"+name];
   if(!object(lock) || lock.lockfileVersion!==3 || lock.packages?.[""]?.[expected]?.[name]!==spec || !entry || entry.link || (manifest && entry.version!==manifest.packages[name])) findings.push(finding("project.lock-identity-mismatch","package-lock.json","Lock identity differs for "+name));
  }
  for(const section of sections) for(const name of Object.keys(object(pkg[section])?pkg[section]:{})) if(name.startsWith("@laugh-tale-island/")&&!ETERNAL_POSE_PACKAGE_NAMES.includes(name)) findings.push(finding("project.misplaced-package-dependency","package.json","Unsupported internal package: "+name));
  if(lock?.name!==pkg.name || lock?.version!==pkg.version || lock?.packages?.[""]?.name!==pkg.name || lock?.packages?.[""]?.version!==pkg.version) findings.push(finding("project.lock-identity-mismatch","package-lock.json","Root lock identity differs."));
  if(pkg.devDependencies?.["axe-core"]!=="4.11.0" || lock?.packages?.[""]?.devDependencies?.["axe-core"]!=="4.11.0" || lock?.packages?.["node_modules/axe-core"]?.version!=="4.11.0") findings.push(finding("project.axe-version-mismatch","package-lock.json","axe-core must remain exactly 4.11.0."));
  if(mode==="candidate"&&manifest&&lock) await candidateArtifacts(root,manifest,pkg,lock,findings);
 } else if(files.has("package.json") && !findings.some(item=>item.code==="project.invalid-package-json")) findings.push(finding("project.invalid-package-shape","package.json","Package must be an object."));
 if(object(lock?.packages)) for(const [path,entry] of Object.entries(lock.packages)) if(path.includes("node_modules/@laugh-tale-island/")) {
  if(!ETERNAL_POSE_PACKAGE_NAMES.some(name=>path==="node_modules/"+name)) findings.push(finding("project.lock-identity-mismatch","package-lock.json","Unexpected internal lock package."));
  if(mode==="registry" && (typeof entry?.resolved!=="string" || !entry.resolved.startsWith("https://registry.npmjs.org/"))) findings.push(finding("project.non-registry-resolution","package-lock.json","Internal package resolution must use npmjs."));
 }
 if(manifest) {
  try {
   const catalog=await loadRecipeV2Catalog(fileURLToPath(new URL("../recipes-v2",import.meta.url)));
   const recipe=catalog.get(manifest.recipe.id).manifest.presentation;
   for(const path of [recipe.entry,...recipe.css,recipe.copy.output]) if(!files.has("src/presentation/"+path)) findings.push(finding("project.presentation-entry-mismatch","src/presentation/"+path,"Declared presentation file is missing."));
   for(const path of recipe.assets) if(![...files.keys()].some(name=>name.startsWith("src/presentation/"+path+"/"))) findings.push(finding("project.presentation-entry-mismatch","src/presentation/"+path,"Declared asset root is missing."));
   const imported=[...text("src/app/App.tsx").matchAll(/from\s*["']([^"']*presentation[^"']*)["']/g)].map(match=>match[1]);
   const approved=["../presentation","../presentation/index","../presentation/index.js","../presentation/index.ts"];
   if(!imported.length||imported.some(path=>!approved.includes(path))) findings.push(finding("project.presentation-entry-mismatch","src/app/App.tsx","App must consume the declared presentation entry."));
  }catch(error){findings.push(finding("project.presentation-entry-mismatch","eternal-pose.json",error.message));}
 }
 const catalogs=[...files.keys()].filter(path=>/^src\/presentation\/.*(?:^|\/)catalog\.ts$/.test(path));
 if(catalogs.length!==1 || catalogs[0]!=="src/presentation/copy/catalog.ts") findings.push(finding("project.copy-catalog-mismatch","src/presentation","Exactly one materialized copy/catalog.ts is required."));
 if(input) {
  const locale=/export\s+const\s+locale\s*=\s*["']([^"']+)["']/.exec(text("src/presentation/copy/catalog.ts"))?.[1];
  if(locale!==(input.trip?.locale??input.setupLocale)) findings.push(finding("project.copy-locale-mismatch","src/presentation/copy/catalog.ts","Catalog locale must equal authored locale."));
  if(input.trip===null) findings.push(finding("trip-content.missing","src/trip-content/trip-input.json","Setup Required: trip content is not configured.",mode==="local"?"warning":"error"));
 }
 for(const [path,bytes] of files) if(path.startsWith("src/")) {
  if(/(?:^|\/)(?:en\.json|zh-Hant\.json|catalog-schema\.json|resolve-copy\.ts)$/.test(path)) findings.push(finding("project.private-copy-input",path,"Private copy input must not be published."));
  if(/\b(?:navigator|window\.navigator)\s*(?:\.\s*(?:language|languages)|\[\s*["']languages?["']\s*\])/.test(bytes.toString("utf8"))) findings.push(finding("project.browser-locale",path,"Browser locale must not replace authored locale."));
 }
 // Readiness is informational; neither credential is inspected by static validation.
 findings.push(finding("provider.google-key.unverified",".env.local","Browser map readiness is checked when the app runs.","warning"));
 try {
  findings.push(...await scanPublicationSnapshot(root, files, {redactedPaths:snapshot.redactedPaths}));
  const after=await projectSnapshot(root);
  if(after.hash!==snapshot.hash)return summarize(mode,[transactionFinding()]);
 }catch(error){return summarize(mode,[error.code==="transaction-in-progress"?transactionFinding():finding("project.validation-failure",".",error.message)]);}
 return summarize(mode,findings);
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
 const request=parseArguments(process.argv.slice(2));
 const result=request?await validateTripProject(request.root,request.mode):invalidArgumentsResult();
 console.log("ETERNAL_POSE_VALIDATION_RESULT "+JSON.stringify(result));
 if(result.counts.errors)process.exitCode=1;
}
