import { ArrowRight } from "lucide-react";
import type { CompletionCountModel, HomeViewProps } from "@laugh-tale-island/react";
import { catalog } from "../copy/catalog.js";
import { HomeTasks } from "./PreTripTasks.js";

export function HomeProgress({ progress }: { progress: CompletionCountModel }) {
  return <p className="oak-copy-secondary oak-home-progress">{catalog.progress.completedOfTotal.replace("{completed}", String(progress.completed)).replace("{total}", String(progress.total))}</p>;
}

export function DayIndex({ model, actions }: HomeViewProps) {
  return <section className="oak-home-section oak-home-days" aria-label={catalog.home.days}>
    <h2>{catalog.home.days}</h2>
    <ol className="oak-home-day-index">{model.days.map(day => {
      const tasks = model.tasks.filter(task => task.scope === "day" && task.dayId === day.id);
      return <li key={day.id} data-home-day-id={day.id} aria-current={day.effective ? "true" : undefined}>
        <div className="oak-home-day-heading">
          <div className="oak-home-day-copy">
            <div className="oak-home-day-meta"><span className="oak-home-day-ordinal">{catalog.experience.dayOfTrip.replace("{ordinal}", String(day.ordinal))}</span><time dateTime={day.date}>{day.date}</time>{day.effective && <span className="oak-home-day-selected">{catalog.status.selected}</span>}</div>
            <h3>{day.title}</h3>
            {day.summary !== undefined && <p className="oak-home-day-summary">{day.summary}</p>}
            <HomeProgress progress={day.progress} />
          </div>
          {model.capabilities.openExperienceDayIds.includes(day.id) && <button type="button" className="oak-control oak-home-day-open" aria-label={`${catalog.home.openDay} · ${catalog.experience.dayOfTrip.replace("{ordinal}", String(day.ordinal))}`} title={`${catalog.home.openDay} · ${catalog.experience.dayOfTrip.replace("{ordinal}", String(day.ordinal))}`} onClick={() => actions.openExperience(day.id)}><ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" /></button>}
        </div>
        {tasks.length > 0 && <div className="oak-home-day-utility"><p className="oak-type-label">{catalog.facts.checklist}</p><HomeTasks tasks={tasks} editableIds={model.capabilities.progress.completionIds} actions={actions} /></div>}
      </li>;
    })}</ol>
  </section>;
}
