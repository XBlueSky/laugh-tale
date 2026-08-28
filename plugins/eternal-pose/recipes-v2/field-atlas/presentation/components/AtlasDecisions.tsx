import { useId, useState } from "react";

import type { CandidateOption, ShoppingStatus } from "@laugh-tale-island/core";

import type {
  CandidateViewModel,
  ExperienceActions,
  ExperienceBindings,
  MapVisualProfile,
  ShoppingViewModel,
} from "../../controllers/presentation-contract";

interface AtlasCandidateDecisionProps {
  model: CandidateViewModel;
  binding: NonNullable<ExperienceBindings["candidate"]>;
  actions: Pick<
    ExperienceActions,
    "openCandidate" | "closeCandidate" | "previewCandidate" | "confirmCandidate"
  >;
  candidateTitle: MapVisualProfile["candidateTitle"];
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

export function AtlasCandidateDecision({
  model,
  binding,
  actions,
  candidateTitle,
}: AtlasCandidateDecisionProps) {
  const radioName = `atlas-candidate-${useId().replaceAll(":", "")}`;
  const [announcement, setAnnouncement] = useState("");
  const committed = model.group.options.find(
    ({ id }) => id === model.committedOptionId,
  );
  const triggerLabel =
    model.group.mode === "browse"
      ? `${model.open ? "Hide" : "View"} ${model.sourceNode.title} candidates`
      : model.open
        ? `Hide ${model.sourceNode.title} candidates`
        : committed === undefined
          ? `Compare ${model.sourceNode.title}`
          : `Compare ${model.sourceNode.title} again`;

  return (
    <section
      className="atlas-decision candidate-decision"
      data-contract-surface="candidate"
      data-candidate-mode={model.group.mode}
      data-expanded={model.open ? "true" : "false"}
      data-committed-owner-id={model.committedOptionId}
      aria-label="Candidate decision"
    >
      <header className="atlas-decision__header">
        <span className="atlas-key">OPTIONS</span>
        <div>
          <strong>{model.sourceNode.title}</strong>
          {model.group.mode === "single" && committed !== undefined ? (
            <p>{model.open ? "Currently selected" : "Selected"} · {committed.title}</p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={triggerLabel}
          data-contract-action="candidate-toggle"
          data-touch-target="44"
          {...binding.getTriggerProps()}
        >
          {triggerLabel}
        </button>
      </header>

      {model.group.mode === "single" ? (
        <fieldset className="atlas-decision__options" hidden={!model.open}>
          <legend>{model.sourceNode.title}</legend>
          {model.group.options.map((option, index) => {
            const label = candidateTitle(model.sequenceNumber, index, option);
            return (
              <label key={option.id} className="atlas-decision__option">
                <input
                  ref={binding.registerOption(option.id)}
                  type="radio"
                  name={radioName}
                  value={option.id}
                  aria-label={label}
                  data-contract-owner="candidate-option"
                  data-owner-id={option.id}
                  checked={model.draftOptionId === option.id}
                  onChange={() => actions.previewCandidate(option.id)}
                />
                <span className="stop-number">{label.slice(0, label.indexOf(" ·"))}</span>
                <span>{option.title}</span>
                {hasCoordinates(option) ? null : <small>Location unavailable</small>}
              </label>
            );
          })}
          <div className="atlas-decision__actions">
            <button
              type="button"
              data-touch-target="44"
              data-contract-action="candidate-cancel"
              aria-label="Cancel candidate comparison"
              onClick={actions.closeCandidate}
            >
              Cancel
            </button>
            <button
              type="button"
              data-touch-target="44"
              data-contract-action="candidate-commit"
              disabled={model.draftOptionId === undefined}
              aria-label={
                model.draftOptionId === undefined
                  ? "Confirm candidate selection"
                  : `Confirm ${model.group.options.find(({ id }) => id === model.draftOptionId)?.title ?? ""}`
              }
              onClick={() => {
                const option = model.group.options.find(
                  ({ id }) => id === model.draftOptionId,
                );
                actions.confirmCandidate();
                setAnnouncement(`Selected ${option?.title ?? ""}`);
              }}
            >
              Confirm
            </button>
          </div>
        </fieldset>
      ) : null}

      {model.group.mode === "browse" ? (
        <ul aria-label={model.sourceNode.title} hidden={!model.open}>
          {model.group.options.map((option, index) => {
            const label = candidateTitle(model.sequenceNumber, index, option);
            return (
              <li key={option.id}>
                {hasCoordinates(option) ? (
                  <button
                    ref={binding.registerOption(option.id)}
                    type="button"
                    data-contract-owner="candidate-option"
                    data-owner-id={option.id}
                    data-touch-target="44"
                    aria-label={`Locate ${label}`}
                    onClick={() => actions.previewCandidate(option.id)}
                  >
                    {label}
                  </button>
                ) : (
                  <span>{label} · Location unavailable</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      <span className="atlas-visually-hidden" role="status" aria-live="polite">
        {announcement}
      </span>
    </section>
  );
}

const shoppingOptions: readonly { value: ShoppingStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "purchased", label: "Purchased" },
  { value: "unavailable", label: "Unavailable" },
  { value: "skipped", label: "Skipped" },
];

interface AtlasShoppingDecisionProps {
  model: ShoppingViewModel;
  onChange: ExperienceActions["setShoppingStatus"];
}

export function AtlasShoppingDecision({
  model,
  onChange,
}: AtlasShoppingDecisionProps) {
  return (
    <section
      className="atlas-decision atlas-shopping"
      data-surface="shopping-progress"
      aria-label={`${model.node.title} shopping list`}
    >
      <header className="atlas-decision__header">
        <span className="atlas-key">SUPPLY</span>
        <h3>{model.node.title}</h3>
      </header>
      <ul>
        {model.node.payload.items.map((item) => (
          <li key={item.id} data-shopping-item={item.id}>
            <span>{item.title}</span>
            <select
              aria-label={`${item.title} shopping status`}
              data-touch-target="44"
              value={model.statuses[item.id] ?? item.initialStatus ?? "pending"}
              onChange={(event) =>
                onChange(item.id, event.currentTarget.value as ShoppingStatus)
              }
            >
              {shoppingOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </section>
  );
}
