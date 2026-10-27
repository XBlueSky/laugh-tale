import { catalog } from "../copy/catalog.js";
import type { NodeRowProps } from "./ItineraryTimeline.js";
import { NodeNavigation, NodeSelection, SelectedNodeDetails } from "./PrimaryRow.js";
import { SemanticMark } from "./SemanticMark.js";
import { ownerStateAttributes } from "./StatusRegion.js";

export function BaseRow(props: NodeRowProps) {
  return <li className="oak-row oak-base-row" data-role="base" data-owner-id={props.node.ownerId} {...ownerStateAttributes(props.node.states)}>
    <div className="oak-base-anchor"><SemanticMark node={props.node} /><span>{catalog.roles.base}</span></div>
    <div className="oak-support-summary oak-base-summary"><NodeSelection {...props} /><NodeNavigation {...props} /></div>
    <SelectedNodeDetails {...props} />
  </li>;
}
