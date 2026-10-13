const paths = {
  tree: "M3 3h14v5H3zM8 10h13v5H8zM8 17h13v4H8zM3 7h2v12h3v2H3z",
  search: "M10 3a7 7 0 1 0 0 14a7 7 0 1 0 0-14M15 15l6 6",
  outline:
    "M3 4h4v4H3zM10 4h11v4H10zM3 10h4v4H3zM10 10h11v4H10zM3 16h4v4H3zM10 16h11v4H10z",
  sidebar: "M3 3h18v18H3zM15 3v18",
  chevrons: "M8 9l4-4 4 4M8 15l4 4 4-4",
  menu: "M4 6h16M4 12h16M4 18h16",
  new: "M12 4v16M4 12h16",
  open: "M3 7V5h6l2 2h10v13H3zM3 10h18",
  save: "M5 3h12l4 4v14H3V3zM7 3v6h10V3M7 21v-8h10v8",
  settings: "M4 6h16M4 12h16M4 18h16M8 4v4M15 10v4M10 16v4",
  tools: "M5 5h14M12 5v14M8 19h8",
};
export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      className="ui-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={name === "tree" || name === "outline" ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={name === "tree" || name === "outline" ? "0" : "1.65"}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
