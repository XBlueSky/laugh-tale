import { useId, useState } from "react";

import type { CandidateOption } from "@laugh-tale-island/core";

import type {
  CandidateViewModel,
  ExperienceActions,
  ExperienceBindings,
  MapVisualProfile,
} from "../../controllers/presentation-contract";

export interface CandidateDecisionProps {
  model: CandidateViewModel;
  binding: NonNullable<ExperienceBindings["candidate"]>;
  actions: Pick<
    ExperienceActions,
    | "openCandidate"
    | "closeCandidate"
    | "previewCandidate"
    | "confirmCandidate"
  >;
  candidateTitle?: MapVisualProfile["candidateTitle"];
}

function optionLetter(index: number): string {
  let remaining = index + 1;
  let output = "";
  while (remaining > 0) {
    remaining -= 1;
    output = String.fromCharCode(65 + (remaining % 26)) + output;
    remaining = Math.floor(remaining / 26);
  }
  return output;
}

export function candidateOptionLabel(
  sequenceNumber: number,
  index: number,
  option: Pick<CandidateOption, "title">,
): string {
  return `${sequenceNumber}${optionLetter(index)} · ${option.title}`;
}

function hasCoordinates(option: CandidateOption): boolean {
  const coordinates = option.place?.coordinates;
  return (
    coordinates !== undefined &&
    Number.isFinite(coordinates.lat) &&
    coordinates.lat >= -90 &&
    coordinates.lat <= 90 &&
    Number.isFinite(coordinates.lng) &&
    coordinates.lng >= -180 &&
    coordinates.lng <= 180
  );
}

function CandidateDecisionGroup({
  model,
  binding,
  actions,
  candidateTitle = candidateOptionLabel,
}: CandidateDecisionProps) {
  const radioName = `candidate-decision-${useId().replaceAll(":", "")}`;
  const [announcement, setAnnouncement] = useState("");
  const {
    group,
    sourceNode,
    sequenceNumber,
    committedOptionId,
    open,
    draftOptionId,
  } = model;
  const committedOption = group.options.find(({ id }) => id === committedOptionId);
  const triggerLabel =
    group.mode === "browse"
      ? `${open ? "收合" : "查看"} ${sourceNode.title} 候選`
      : open
        ? `收合 ${sourceNode.title}`
        : committedOption === undefined
          ? `比較 ${sourceNode.title}`
          : `重新比較 ${sourceNode.title}`;

  return (
    <section
      className="candidate-decision"
      data-candidate-mode={group.mode}
      data-expanded={open ? "true" : "false"}
    >
      <div className="candidate-decision__summary">
        <div>
          <strong>{sourceNode.title}</strong>
          {group.mode === "single" && committedOption !== undefined ? (
            <p className="candidate-decision__committed">
              {open ? "目前已選" : "已選"} · {committedOption.title}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="candidate-decision__trigger"
          aria-label={triggerLabel}
          data-touch-target="44"
          {...binding.getTriggerProps()}
        >
          {triggerLabel}
        </button>
      </div>

      {group.mode === "single" ? (
        <fieldset className="candidate-decision__options" hidden={!open}>
          <legend>{sourceNode.title}</legend>
          {group.options.map((option, index) => {
            const optionLabel = candidateTitle(sequenceNumber, index, option);
            return (
              <label key={`candidate:${option.id}`} className="candidate-decision__option">
                <input
                  ref={binding.registerOption(option.id)}
                  type="radio"
                  name={radioName}
                  value={option.id}
                  checked={draftOptionId === option.id}
                  onChange={() => actions.previewCandidate(option.id)}
                />
                <span>{optionLabel}</span>
                {hasCoordinates(option) ? null : (
                  <small className="candidate-decision__location-state">尚未定位</small>
                )}
              </label>
            );
          })}
          <div className="candidate-decision__actions">
            <button
              type="button"
              data-touch-target="44"
              aria-label="取消候選比較"
              onClick={actions.closeCandidate}
            >
              取消
            </button>
            <button
              type="button"
              data-touch-target="44"
              disabled={draftOptionId === undefined}
              aria-label={
                draftOptionId === undefined
                  ? "確認候選選擇"
                  : `確認選擇 ${group.options.find(({ id }) => id === draftOptionId)?.title ?? ""}`
              }
              onClick={() => {
                const option = group.options.find(({ id }) => id === draftOptionId);
                actions.confirmCandidate();
                setAnnouncement(`已選擇 ${option?.title ?? ""}`);
              }}
            >
              確認
            </button>
          </div>
        </fieldset>
      ) : null}

      {group.mode === "browse" ? (
        <ul
          className="candidate-decision__browse-list"
          aria-label={sourceNode.title}
          hidden={!open}
        >
          {group.options.map((option, index) => {
            const optionLabel = candidateTitle(sequenceNumber, index, option);
            return (
              <li key={`browse-candidate:${option.id}`}>
                {hasCoordinates(option) ? (
                  <button
                    ref={binding.registerOption(option.id)}
                    type="button"
                    data-touch-target="44"
                    aria-label={`定位 ${optionLabel}`}
                    onClick={() => actions.previewCandidate(option.id)}
                  >
                    {optionLabel}
                  </button>
                ) : (
                  <span>{optionLabel} · 尚未定位</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      <span
        className="candidate-decision__status"
        role="status"
        aria-label="候選選擇狀態"
        aria-live="polite"
      >
        {announcement}
      </span>
    </section>
  );
}

export function CandidateDecision(props: CandidateDecisionProps) {
  return <CandidateDecisionGroup key={props.model.group.id} {...props} />;
}
