import { $prose } from "@milkdown/kit/utils";
import { Plugin } from "@milkdown/kit/prose/state";
export function selectionToolsPlugin(command: (value: string) => void) {
  return $prose(
    () =>
      new Plugin({
        view: (view) => {
          const host = view.dom.closest<HTMLElement>(".rich-editor");
          const tools = document.createElement("div");
          tools.className = "selection-tools";
          tools.setAttribute("role", "toolbar");
          tools.setAttribute("aria-label", "选中文字工具");
          tools.hidden = true;
          for (const [label, value] of [
            ["B", "bold"],
            ["I", "italic"],
            ["代码", "code"],
            ["链接", "link"],
          ]) {
            const button = document.createElement("button");
            button.textContent = label ?? "";
            button.onmousedown = (event) => event.preventDefault();
            button.onclick = () => command(value ?? "");
            tools.append(button);
          }
          host?.append(tools);
          const update = () => {
            const selection = view.state.selection;
            tools.hidden = selection.empty;
            if (selection.empty || !host) return;
            const position = view.coordsAtPos(selection.from);
            const rect = host.getBoundingClientRect();
            tools.style.top = Math.max(0, position.top - rect.top - 36) + "px";
            tools.style.left =
              Math.min(
                Math.max(0, position.left - rect.left),
                Math.max(0, host.clientWidth - 180),
              ) + "px";
          };
          return { update, destroy: () => tools.remove() };
        },
      }),
  );
}
