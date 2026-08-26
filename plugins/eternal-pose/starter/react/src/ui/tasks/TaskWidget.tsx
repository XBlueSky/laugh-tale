import { ChevronDown, ChevronUp, ListChecks, X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import type { TripTask } from "../../trip-core/model";
import {
  checklistCompletionKey,
  taskCompletionKey,
} from "../../trip-core/progress";

export interface TaskWidgetProps {
  dayTitle: string;
  tasks: readonly TripTask[];
  completedIds: ReadonlySet<string>;
  onCompletedChange: (id: string, completed: boolean) => void;
}

export function TaskWidget({
  dayTitle,
  tasks,
  completedIds,
  onCompletedChange,
}: TaskWidgetProps) {
  const generatedId = useId().replaceAll(":", "");
  const titleId = `day-task-dialog-title-${generatedId}`;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [modalUnavailable, setModalUnavailable] = useState(false);
  const [expandedTaskIds, setExpandedTaskIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    return () => {
      if (dialog?.open && typeof dialog.close === "function") {
        dialog.close();
      }
    };
  }, []);

  const openDialog = (): void => {
    const dialog = dialogRef.current;
    if (dialog === null || dialog.open) {
      return;
    }
    if (typeof dialog.showModal !== "function") {
      setModalUnavailable(true);
      return;
    }
    try {
      dialog.showModal();
      setModalUnavailable(false);
    } catch {
      setModalUnavailable(true);
    }
  };

  const closeDialog = (): void => {
    const dialog = dialogRef.current;
    if (dialog?.open && typeof dialog.close === "function") {
      dialog.close();
    }
    triggerRef.current?.focus();
  };

  const handleBackdrop = (event: ReactMouseEvent<HTMLDialogElement>): void => {
    if (event.target === event.currentTarget) {
      closeDialog();
    }
  };

  const toggleTask = (taskId: string): void => {
    setExpandedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  return (
    <section className="task-widget" data-surface="day-tasks">
      <button
        ref={triggerRef}
        type="button"
        className="task-widget__trigger icon-control"
        aria-label={`開啟 ${dayTitle} 當日事項`}
        data-touch-target="44"
        onClick={openDialog}
      >
        <ListChecks aria-hidden="true" size={19} strokeWidth={1.8} />
      </button>

      {modalUnavailable ? (
        <span
          className="task-widget__unsupported"
          role="status"
          aria-label={`無法開啟 ${dayTitle} 當日事項`}
        >
          此瀏覽器無法開啟當日事項。
        </span>
      ) : null}

      {/* Native dialog backdrops dispatch their pointer click to the dialog itself. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={dialogRef}
        className="task-widget__dialog"
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClick={handleBackdrop}
      >
        <section className="task-widget__dialog-surface">
          <header className="task-widget__dialog-header">
            <h2 id={titleId}>{dayTitle} 當日事項</h2>
            <button
              type="button"
              className="icon-control"
              aria-label="關閉當日事項"
              data-touch-target="44"
              onClick={closeDialog}
            >
              <X aria-hidden="true" size={19} strokeWidth={1.8} />
            </button>
          </header>

          <ul className="task-widget__list">
            {tasks.map((task, taskIndex) => {
              const taskKey = taskCompletionKey(task.id);
              const children = task.children ?? [];
              const canDisclose = children.length >= 2;
              const expanded = expandedTaskIds.has(task.id);
              const childrenId = `day-task-children-${generatedId}-${taskIndex}`;
              return (
                <li key={`day-task:${task.id}`} className="task-widget__item">
                  <div className="task-widget__item-primary">
                    <label>
                      <input
                        type="checkbox"
                        checked={completedIds.has(taskKey)}
                        onChange={(event) =>
                          onCompletedChange(taskKey, event.currentTarget.checked)
                        }
                      />
                      <span>{task.title}</span>
                    </label>
                    {canDisclose ? (
                      <button
                        type="button"
                        className="icon-control task-widget__disclosure"
                        aria-label={`${expanded ? "隱藏" : "顯示"} ${task.title} 子項`}
                        aria-controls={childrenId}
                        aria-expanded={expanded}
                        data-touch-target="44"
                        onClick={() => toggleTask(task.id)}
                      >
                        {expanded ? (
                          <ChevronUp aria-hidden="true" size={18} strokeWidth={1.8} />
                        ) : (
                          <ChevronDown aria-hidden="true" size={18} strokeWidth={1.8} />
                        )}
                      </button>
                    ) : null}
                  </div>
                  {task.note === undefined ? null : (
                    <p className="task-widget__note">{task.note}</p>
                  )}
                  {children.length === 0 ? null : (
                    <ul
                      id={childrenId}
                      className="task-widget__children"
                      hidden={canDisclose && !expanded}
                    >
                      {children.map((child) => {
                        const childKey = checklistCompletionKey(child.id);
                        return (
                          <li key={`day-task-child:${child.id}`}>
                            <label>
                              <input
                                type="checkbox"
                                checked={completedIds.has(childKey)}
                                onChange={(event) =>
                                  onCompletedChange(childKey, event.currentTarget.checked)
                                }
                              />
                              <span>{child.title}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </dialog>
    </section>
  );
}
