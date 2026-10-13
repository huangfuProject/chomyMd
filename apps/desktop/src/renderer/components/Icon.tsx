const paths = {
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
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
