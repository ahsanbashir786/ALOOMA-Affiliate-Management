"use client";

import { createContext, useContext } from "react";
import type { PanelFocus } from "./creator-panel";

/** One side panel for the three things that link together: a creator, a product and a video. Open any of them from anywhere. */
export const PanelCtx = createContext<{ open: (username: string, focus?: PanelFocus) => void; openProduct: (key: string) => void; openVideo: (id: string) => void }>({ open: () => {}, openProduct: () => {}, openVideo: () => {} });
export const useCreatorPanel = () => useContext(PanelCtx);
