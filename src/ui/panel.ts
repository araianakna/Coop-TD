// Shared ornate panel chrome (gold-bordered dark parchment/stone frame with
// corner ornaments) reused by the shop, fusion, and end-screen components so
// the "premium fantasy UI" border treatment stays consistent everywhere.

export interface PanelOptions {
  /** Extra class(es) applied to the outer frame, e.g. for panel-specific width/placement. */
  className?: string;
  /** Optional header banner text rendered above the body. */
  title?: string;
}

export interface Panel {
  root: HTMLElement;
  /** The content area — append your component's DOM here. */
  body: HTMLElement;
  header?: HTMLElement;
}

export function createPanel(opts: PanelOptions = {}): Panel {
  const root = document.createElement("div");
  root.className = "rw-panel" + (opts.className ? ` ${opts.className}` : "");

  for (const corner of ["tl", "tr", "bl", "br"]) {
    const c = document.createElement("span");
    c.className = `rw-panel-corner rw-panel-corner-${corner}`;
    root.appendChild(c);
  }

  const inner = document.createElement("div");
  inner.className = "rw-panel-inner";
  root.appendChild(inner);

  let header: HTMLElement | undefined;
  if (opts.title) {
    header = document.createElement("div");
    header.className = "rw-panel-header";
    const titleEl = document.createElement("span");
    titleEl.className = "rw-panel-title";
    titleEl.textContent = opts.title;
    header.appendChild(titleEl);
    inner.appendChild(header);
  }

  const body = document.createElement("div");
  body.className = "rw-panel-body";
  inner.appendChild(body);

  return { root, body, header };
}
