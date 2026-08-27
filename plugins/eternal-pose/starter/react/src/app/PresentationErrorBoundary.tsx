import { Component, type ComponentType, type ReactNode } from "react";

import type { FatalErrorViewProps } from "../controllers/presentation-contract";

interface PresentationErrorBoundaryProps {
  FatalError: ComponentType<FatalErrorViewProps>;
  children: ReactNode;
}

interface PresentationErrorBoundaryState {
  failed: boolean;
}

export class PresentationErrorBoundary extends Component<
  PresentationErrorBoundaryProps,
  PresentationErrorBoundaryState
> {
  state: PresentationErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): PresentationErrorBoundaryState {
    return { failed: true };
  }

  private retry = (): void => {
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) {
      return this.props.children;
    }

    const { FatalError } = this.props;
    return <FatalError model={{ kind: "render" }} actions={{ retry: this.retry }} />;
  }
}
