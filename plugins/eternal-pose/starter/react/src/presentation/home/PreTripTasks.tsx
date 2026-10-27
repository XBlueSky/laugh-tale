import type { CompletionItemModel, HomeTaskModel, HomeViewProps } from "@laugh-tale-island/react";
import { catalog } from "../copy/catalog.js";

type TaskProps = { tasks: readonly HomeTaskModel[]; editableIds: readonly string[]; actions: HomeViewProps["actions"] };

function Completion({ item, editableIds, actions }: { item: CompletionItemModel } & Pick<TaskProps, "editableIds" | "actions">) {
  return <div className="oak-home-completion">
    {editableIds.includes(item.id) ? <label><input type="checkbox" checked={item.completed} onChange={event => actions.updateProgress({ kind: "completion", id: item.id, completed: event.currentTarget.checked })} />{item.title}</label> : <span>{item.title}</span>}
    <span className="oak-copy-secondary">{item.completed ? catalog.progress.complete : catalog.progress.pending}</span>
  </div>;
}

// Both Home task scopes share completion rendering, never itinerary ownership.
export function HomeTasks({ tasks, editableIds, actions }: TaskProps) {
  return <ul className="oak-home-tasks">{tasks.map(task => <li key={task.id} data-home-task-id={task.id}>
    <Completion item={task} editableIds={editableIds} actions={actions} />
    {task.note !== undefined && <p className="oak-home-task-note">{task.note}</p>}
    {task.children.length > 0 && <ol className="oak-home-task-children">{task.children.map(child => <li key={child.id} data-checklist-id={child.id}><Completion item={child} editableIds={editableIds} actions={actions} /></li>)}</ol>}
  </li>)}</ul>;
}

export function PreTripTasks(props: TaskProps) {
  const tasks = props.tasks.filter(task => task.scope === "pretrip");
  if (tasks.length === 0) return null;
  return <section className="oak-home-section" aria-label={catalog.home.tasks}>
    <h2>{catalog.home.tasks}</h2><HomeTasks {...props} tasks={tasks} />
  </section>;
}
