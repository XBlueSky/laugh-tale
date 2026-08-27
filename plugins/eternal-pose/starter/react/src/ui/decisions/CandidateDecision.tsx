import { useId, useMemo, useState } from "react";

import type {
  CandidateGroup,
  CandidateMapOverride,
  CandidateOption,
  CandidatePreviewRequest,
} from "@laugh-tale/core";
import { useCandidateDecision } from "@laugh-tale/react";

export interface CandidateDecisionProps {
  group: CandidateGroup;
  label: string;
  sequenceNumber: number;
  committedOptionId?: string;
  mapPreviewRequest?: CandidatePreviewRequest;
  onMapOverrideChange: (override: CandidateMapOverride | null) => void;
  onCommit: (groupId: string, optionId: string) => void;
  onLocateOption: (optionId: string) => void;
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

export function CandidateDecision({
  group,
  label,
  sequenceNumber,
  committedOptionId,
  mapPreviewRequest,
  onMapOverrideChange,
  onCommit,
  onLocateOption,
}: CandidateDecisionProps) {
  const radioName = `candidate-decision-${useId().replaceAll(":", "")}`;
  const [announcement, setAnnouncement] = useState("");
  const committedOption = group.options.find(({ id }) => id === committedOptionId);
  const numberedGroup = useMemo<CandidateGroup>(
    () => ({
      ...group,
      options: group.options.map((option, index) => ({
        ...option,
        title: candidateOptionLabel(sequenceNumber, index, option),
      })),
    }),
    [group, sequenceNumber],
  );
  const decision = useCandidateDecision({
    group,
    overrideGroup: numberedGroup,
    ...(committedOptionId === undefined ? {} : { committedOptionId }),
    ...(mapPreviewRequest === undefined ? {} : { mapPreviewRequest }),
    onMapOverrideChange,
    onConfirm: (optionId) => {
      const option = group.options.find(({ id }) => id === optionId);
      onCommit(group.id, optionId);
      setAnnouncement(`已選擇 ${option?.title ?? ""}`);
    },
  });
  const expanded = decision.open;
  const draftOptionId = decision.draftOptionId;

  const triggerLabel =
    group.mode === "browse"
      ? `${expanded ? "收合" : "查看"} ${label} 候選`
      : expanded
        ? `收合 ${label}`
        : committedOption === undefined
          ? `比較 ${label}`
          : `重新比較 ${label}`;

  return (
    <section
      className="candidate-decision"
      data-candidate-mode={group.mode}
      data-expanded={expanded ? "true" : "false"}
    >
      <div className="candidate-decision__summary">
        <div>
          <strong>{label}</strong>
          {group.mode === "single" && committedOption !== undefined ? (
            <p className="candidate-decision__committed">
              {expanded ? "目前已選" : "已選"} · {committedOption.title}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="candidate-decision__trigger"
          aria-label={triggerLabel}
          data-touch-target="44"
          {...decision.getTriggerProps()}
        >
          {triggerLabel}
        </button>
      </div>

      {group.mode === "single" ? (
        <fieldset className="candidate-decision__options" hidden={!expanded}>
          <legend>{label}</legend>
          {group.options.map((option, index) => {
            const optionLabel = candidateOptionLabel(sequenceNumber, index, option);
            return (
              <label key={`candidate:${option.id}`} className="candidate-decision__option">
                <input
                  ref={decision.registerOption(option.id)}
                  type="radio"
                  name={radioName}
                  value={option.id}
                  checked={draftOptionId === option.id}
                  onChange={() => {
                    decision.previewOption(option.id);
                    if (hasCoordinates(option)) {
                      onLocateOption(option.id);
                    }
                  }}
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
              onClick={decision.closeComparison}
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
              onClick={decision.confirmDraft}
            >
              確認
            </button>
          </div>
        </fieldset>
      ) : null}

      {group.mode === "browse" ? (
        <ul
          className="candidate-decision__browse-list"
          aria-label={label}
          hidden={!expanded}
        >
          {group.options.map((option, index) => {
            const optionLabel = candidateOptionLabel(sequenceNumber, index, option);
            return (
              <li key={`browse-candidate:${option.id}`}>
                {hasCoordinates(option) ? (
                  <button
                    ref={decision.registerOption(option.id)}
                    type="button"
                    data-touch-target="44"
                    aria-label={`定位 ${optionLabel}`}
                    onClick={() => onLocateOption(option.id)}
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
