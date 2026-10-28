export type Rect = { x: number; y: number; width: number; height: number };

export type StyleKey =
  | 'display'
  | 'position'
  | 'width'
  | 'height'
  | 'margin'
  | 'padding'
  | 'color'
  | 'background'
  | 'border'
  | 'borderRadius'
  | 'font'
  | 'lineHeight'
  | 'textAlign'
  | 'zIndex';

export type FrameworkInfo = {
  kind: 'react' | 'angular';
  components: string[];
  sourceFile: string | null;
};

export type Capture = {
  page: {
    url: string;
    title: string;
    viewport: { width: number; height: number };
    scroll: { x: number; y: number };
    devicePixelRatio: number;
  };
  target: {
    tag: string;
    selector: string;
    readablePath: string;
    domPath: string;
    classes: string[];
    selectedText: string;
    visibleText: string;
    rect: Rect;
  };
  html: string;
  a11y: { role: string | null; name: string | null };
  styles: Record<StyleKey, string>;
  nearby: { text: string[]; elements: string[]; ancestors: string[] };
  framework: FrameworkInfo | null;
};
