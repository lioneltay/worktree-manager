import { render } from "ink";
import React from "react";
import { App } from "./App.js";

export function launchTui(): void {
  render(<App />, {
    incrementalRendering: true,
    alternateScreen: true,
  });
}
