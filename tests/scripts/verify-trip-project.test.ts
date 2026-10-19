import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync, type Stats } from "node:fs";
import { lstat as lstatPath, mkdtemp as mkdtempPath, realpath as realpathPath } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test } from "vitest";
import { completeV2Project, snapshotTree, write, repoRoot, type ValidationResult } from "../generation/generated-project-v2-fixture.js";
interface CommandResult {command:string;exitCode:number}
interface Operations {
 spawnSync?:(command:string,args:string[],options:{cwd:string;env:NodeJS.ProcessEnv;shell:false})=>{status:number|null};
 lstat?:(path:string)=>Promise<Stats>;mkdtemp?:(prefix:string)=>Promise<string>;realpath?:(path:string)=>Promise<string>;
 beforeTempMutation?:(event:{phase:string;path:string;validationDir:string})=>void;
 importModule?:()=>Promise<unknown>;
}
const {verifyTripProject}=await import(pathToFileURL(join(repoRoot,"plugins/eternal-pose/scripts/verify-trip-project.mjs")).href) as {verifyTripProject:(root:string,mode:string,operations?:Operations)=>Promise<ValidationResult&{commands:CommandResult[];failedCommand:CommandResult|null}>};
const {snapshotTree: snapshotInventory}=await import(pathToFileURL(join(repoRoot,"plugins/eternal-pose/lib/path-safety.mjs")).href) as {snapshotTree:(root:string)=>Promise<unknown>};
const temporaryRoots:string[]=[];
afterEach(()=>{for(const root of temporaryRoots.splice(0))rmSync(root,{recursive:true,force:true});});
async function fixture(){
 const f=await completeV2Project();temporaryRoots.push(f.parent);
 // Owned minimal dependency inventory; command doubles below replace only npm
 // execution, never installation ownership checks.
 for(const name of ["core","react","adapters","testing"]){
  const root=join(f.root,"node_modules/@laugh-tale-island",name);mkdirSync(root,{recursive:true});
  writeFileSync(join(root,"package.json"),JSON.stringify({name:"@laugh-tale-island/"+name,version:"2.0.0"}));
 }
 mkdirSync(join(f.root,"node_modules/.bin"),{recursive:true});mkdirSync(join(f.root,"node_modules/owned-tools"));
 for(const name of ["vitest","tsc","eslint","vite"]){
  const path=join(f.root,"node_modules/owned-tools",name+".mjs");writeFileSync(path,"#!/usr/bin/env node\nprocess.exit(0);\n");chmodSync(path,0o755);
  symlinkSync("../owned-tools/"+name+".mjs",join(f.root,"node_modules/.bin",name));
 }
 return f;
}
function successfulGateRunner(){return ()=>({status:0});}
const gates=["npm test","npm run type-check","npm run lint","npm run test:experience","npm run test:a11y","npm run build"];
test("Verify refuses an escaping installed-tool link before executing it", async () => {
 const {root,parent}=await fixture();
 const external=join(parent,"external-vitest.mjs"), marker=join(parent,"external-executed");
 writeFileSync(external,`#!/usr/bin/env node\nimport {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},'executed');process.exit(13);\n`);chmodSync(external,0o755);
 rmSync(join(root,"node_modules/.bin/vitest"));symlinkSync(external,join(root,"node_modules/.bin/vitest"));
 const before=snapshotTree(root);
 const result=await verifyTripProject(root,"local");
 expect(existsSync(marker)).toBe(false);
 expect(result.findings).toContainEqual(expect.objectContaining({code:"project.invalid-installed-dependencies"}));
 expect(result.commands).toEqual([]);
 expect(snapshotTree(root)).toEqual(before);
});
test.each(["missing-install","outward-root","outward-package","package-name","package-version","bin-directory"])("Verify refuses %s before any installed command",async mutation=>{
 const {root,parent}=await fixture();const modules=join(root,"node_modules");
 if(mutation==="missing-install")rmSync(modules,{recursive:true});
 if(mutation==="outward-root"){renameSync(modules,join(parent,"external-modules"));symlinkSync(join(parent,"external-modules"),modules,"dir");}
 if(mutation==="outward-package"){const path=join(modules,"@laugh-tale-island/core");renameSync(path,join(parent,"external-core"));symlinkSync(join(parent,"external-core"),path,"dir");}
 if(mutation==="package-name"||mutation==="package-version")writeFileSync(join(modules,"@laugh-tale-island/core/package.json"),JSON.stringify({name:mutation==="package-name"?"@foreign/core":"@laugh-tale-island/core",version:mutation==="package-version"?"2.1.0":"2.0.0"}));
 if(mutation==="bin-directory"){renameSync(join(modules,".bin"),join(parent,"external-bin"));symlinkSync(join(parent,"external-bin"),join(modules,".bin"),"dir");}
 const before=await snapshotInventory(root);
 let commands=0;
 const result=await verifyTripProject(root,"local",{spawnSync:()=>{commands++;return {status:0};}});
 expect(commands).toBe(0);expect(result.commands).toEqual([]);
 expect(result.findings).toContainEqual(expect.objectContaining({code:"project.invalid-installed-dependencies"}));
 expect(await snapshotInventory(root)).toEqual(before);
});
test.each(["package","tool","bin-directory"])("Verify refuses %s substitution between commands",async mutation=>{
 const {root}=await fixture();let commands=0;
 const result=await verifyTripProject(root,"local",{spawnSync:()=>{
  commands++;
  if(mutation==="package"){const path=join(root,"node_modules/@laugh-tale-island/core/package.json");const bytes=readFileSync(path);renameSync(path,path+".old");writeFileSync(path,bytes);}
  if(mutation==="tool"){const path=join(root,"node_modules/owned-tools/tsc.mjs");const bytes=readFileSync(path);renameSync(path,path+".old");writeFileSync(path,bytes);}
  if(mutation==="bin-directory"){const path=join(root,"node_modules/.bin");renameSync(path,path+".old");mkdirSync(path);for(const name of ["vitest","tsc","eslint","vite"])symlinkSync("../owned-tools/"+name+".mjs",join(path,name));}
  return {status:0};
 }});
 expect(commands).toBe(1);expect(result.commands).toEqual([{command:"npm test",exitCode:0}]);
 expect(result.findings).toContainEqual(expect.objectContaining({code:"project.invalid-installed-dependencies"}));
});
test("Verify runs six gates in order with owned outputs and an allowlisted environment",async()=>{
 const {root}=await fixture();const before=snapshotTree(root);const dirs:string[]=[];
 const result=await verifyTripProject(root,"local",{spawnSync:(_command,args,options)=>{
  expect(options.shell).toBe(false);expect(options.cwd).toBe(root);
  expect(options.env).not.toHaveProperty("ETERNAL_POSE_GOOGLE_PLACES_API_KEY");
  expect(options.env).not.toHaveProperty("VITE_GOOGLE_MAPS_API_KEY");
  for(const key of ["OUT","CACHE","ENV"]){const path=options.env["ETERNAL_POSE_VALIDATION_"+key+"_DIR"]!;expect(path.startsWith(root)).toBe(false);expect(existsSync(path)).toBe(true);dirs.push(path);}
  return {status:0};
 }});
 expect(result.commands).toEqual(gates.map(command=>({command,exitCode:0})));
 expect(result.counts.errors).toBe(0);expect(snapshotTree(root)).toEqual(before);
 for(const dir of dirs)expect(existsSync(dir)).toBe(false);
});
test.each(gates)("stops after failed gate %s",async gate=>{
 const {root}=await fixture();const result=await verifyTripProject(root,"local",{spawnSync:(_command:string,args:string[])=>({status:"npm "+args.join(" ")===gate?7:0})});
 expect(result.failedCommand).toEqual({command:gate,exitCode:7});expect(result.commands).toHaveLength(gates.indexOf(gate)+1);
});
test.each(gates)("rejects a writer spanning %s even when the command succeeds",async gate=>{
 const {root}=await fixture();const result=await verifyTripProject(root,"local",{spawnSync:(_command:string,args:string[])=>{
  if("npm "+args.join(" ")===gate)write(root,".laugh-tale-transaction-paused","{}");return {status:0};
 }});
 expect(result.findings).toContainEqual(expect.objectContaining({code:"project.transaction-in-progress"}));
 expect(result.commands).toHaveLength(gates.indexOf(gate));
});
test("rejects a completed generation replacement between command guards",async()=>{
 const {root}=await fixture();const result=await verifyTripProject(root,"local",{spawnSync:()=>{
  write(root,"eternal-pose.json",readFileSync(join(root,"eternal-pose.json"),"utf8")+" ");return {status:0};
 }});
 expect(result.findings).toContainEqual(expect.objectContaining({code:"project.transaction-in-progress"}));expect(result.commands).toEqual([]);
});
  test("provisionally owns a new temp root before the first identity read and preserves uncertainty", async () => {
    const { root } = await fixture();
    let validationDir: string | undefined;
    let failed = false;

    const result = await verifyTripProject(root, "local", {
      mkdtemp: async (prefix) => {
        validationDir = await mkdtempPath(prefix);
        temporaryRoots.push(validationDir);
        return validationDir;
      },
      lstat: async (path) => {
        if (!failed && basename(path).startsWith("eternal-pose-validation-")) {
          failed = true;
          throw new Error("injected first identity read failure");
        }
        return lstatPath(path);
      },
    });

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "project.validation-ownership-failed" }),
      expect.objectContaining({ code: "project.validation-cleanup-failed" }),
    ]));
    expect(validationDir).toBeDefined();
    expect(readdirSync(validationDir!)).toEqual([]);
  });

  test("preserves both paths when acquisition races with a replacement", async () => {
    const { root } = await fixture();
    let replacementDir: string | undefined;
    let displacedDir: string | undefined;

    const result = await verifyTripProject(root, "local", {
      realpath: async (path) => {
        if (replacementDir === undefined && basename(path).startsWith("eternal-pose-validation-")) {
          replacementDir = path;
          displacedDir = `${path}-displaced`;
          temporaryRoots.push(replacementDir, displacedDir);
          renameSync(path, displacedDir);
          mkdirSync(path);
          writeFileSync(join(path, "foreign.txt"), "preserve\n");
        }
        return realpathPath(path);
      },
    });

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "project.validation-ownership-failed" }),
      expect.objectContaining({ code: "project.validation-cleanup-failed" }),
    ]));
    expect(readFileSync(join(replacementDir!, "foreign.txt"), "utf8")).toBe("preserve\n");
    expect(readdirSync(displacedDir!)).toEqual([]);
  });

  test("refuses recursive cleanup when an owned validation root is replaced", async () => {
    const { root } = await fixture();
    let replacementDir: string | undefined;
    let displacedDir: string | undefined;

    const result = await verifyTripProject(root, "local", {
      spawnSync: successfulGateRunner(),
      importModule: () => Promise.resolve({ tripContentReadiness: { hasTripContent: true } }),
      beforeTempMutation: ({ phase, validationDir }) => {
        if (phase !== "validation-cleanup" || replacementDir !== undefined) return;
        replacementDir = validationDir;
        displacedDir = `${validationDir}-displaced`;
        temporaryRoots.push(replacementDir, displacedDir);
        renameSync(validationDir, displacedDir);
        mkdirSync(validationDir);
        writeFileSync(join(validationDir, "foreign.txt"), "preserve\n");
      },
    });

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "project.validation-cleanup-failed" }),
    ]));
    expect(readFileSync(join(replacementDir!, "foreign.txt"), "utf8")).toBe("preserve\n");
    expect(readdirSync(displacedDir!).some((name) => name.startsWith(".laugh-tale-incomplete-"))).toBe(true);
  });

  test("detects a child-command replacement race and preserves foreign state", async () => {
    const { root } = await fixture();
    let replacementDir: string | undefined;
    let displacedDir: string | undefined;

    const result = await verifyTripProject(root, "local", {
      spawnSync: ((_command, _arguments, options) => {
        if (replacementDir === undefined) {
          const environment = options.env;
          replacementDir = dirname(environment.ETERNAL_POSE_VALIDATION_OUT_DIR!);
          displacedDir = `${replacementDir}-displaced`;
          temporaryRoots.push(replacementDir, displacedDir);
          renameSync(replacementDir, displacedDir);
          mkdirSync(replacementDir);
          writeFileSync(join(replacementDir, "foreign.txt"), "preserve\n");
        }
        return { status: 0 };
      }),
    });

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "project.validation-failure" }),
      expect.objectContaining({ code: "project.validation-cleanup-failed" }),
    ]));
    expect(readFileSync(join(replacementDir!, "foreign.txt"), "utf8")).toBe("preserve\n");
  });
