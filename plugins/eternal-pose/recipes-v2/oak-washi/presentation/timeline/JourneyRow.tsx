import { catalog } from "../copy/catalog.js";
import type { NodeRowProps } from "./ItineraryTimeline.js";
import { NodeNavigation, NodeSelection, SelectedNodeDetails } from "./PrimaryRow.js";
import { SemanticMark } from "./SemanticMark.js";
import { ownerStateAttributes } from "./StatusRegion.js";

export function JourneyRow(props: NodeRowProps) {
  return <li className="oak-row oak-journey-row" data-role="journey" data-owner-id={props.node.ownerId} {...ownerStateAttributes(props.node.states)}>
    <div className="oak-journey-heading"><SemanticMark node={props.node} /><span>{catalog.roles.journey}</span></div>
    <div className="oak-support-summary"><NodeSelection {...props} /><NodeNavigation {...props} /></div>
    <SelectedNodeDetails {...props} />
  </li>;
}
