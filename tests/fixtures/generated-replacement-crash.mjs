import { replaceGeneratedProject } from "../../scripts/replace-generated-project.mjs";
const [request, phase] = process.argv.slice(2);
await replaceGeneratedProject(JSON.parse(request), { async beforeMutation(event) {
  if (event.phase === phase) {
    process.send({ paused: true });
    await new Promise(resolve => process.once("message", resolve));
  }
} });
process.disconnect();
