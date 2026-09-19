export type Tool =
  | "select"
  | "hand"
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "line"
  | "arrow"
  | "freedraw"
  | "text"
  | "eraser";

export interface ElementStyle {
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
}

export const DEFAULT_STYLE: ElementStyle = {
  strokeColor: "#1e1e1e",
  fillColor: "transparent",
  strokeWidth: 2,
};

interface BaseElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style: ElementStyle;
  isDeleted: boolean;
}

export interface ShapeElement extends BaseElement {
  type: "rectangle" | "ellipse" | "diamond";
}

export interface LinearElement extends BaseElement {
  type: "line" | "arrow";
  points: [number, number][];
}

export interface FreedrawElement extends BaseElement {
  type: "freedraw";
  points: [number, number][];
}

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  fontSize: number;
}

export type CanvasElement =
  | ShapeElement
  | LinearElement
  | FreedrawElement
  | TextElement;

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}
