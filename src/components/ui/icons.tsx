import type { ComponentProps } from "react";

/**
 * Line icons (1.5px stroke on a 24px grid) that take the text colour. They
 * replace emoji, which render differently on every phone. Decorative by
 * default; pass `title` when an icon stands alone.
 */
type IconProps = Omit<ComponentProps<"svg">, "children"> & { title?: string };

function Icon({ title, className = "h-4 w-4", children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {children}
    </svg>
  );
}

export const MapPinIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Icon>
);

export const ClockIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const CheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 12l5 5 9-10" />
  </Icon>
);

export const ShieldCheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" />
    <path d="M9 12l2 2 4-4" />
  </Icon>
);

const p = (d: string) => <path d={d} />;

/** Icon for a role tab, chosen by its label. Unknown labels fall back to a plain dot. */
export function TabIcon({ label, className = "h-6 w-6" }: { label: string; className?: string }) {
  const shapes: Record<string, React.ReactNode> = {
    Home: p("M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"),
    Bookings: p("M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4zM14 6v12"),
    Tours: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M15.5 8.5l-2 5-5 2 2-5z" />
      </>
    ),
    Plan: p("M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"),
    Messages: p("M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-5 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"),
    Packages: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M15.5 8.5l-2 5-5 2 2-5z" />
      </>
    ),
    Revenue: p("M7 5h7a3.5 3.5 0 0 1 0 7H7M7 9h9M7 5v14M7 12.5h4"),
    Scan: (
      <>
        <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
        <path d="M4 12h16" />
      </>
    ),
    Badge: p("M6 4h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM9 9h6M9 13h6M9 16h3"),
    Analytics: p("M5 20V10M12 20V4M19 20v-7"),
    Approvals: p("M5 12l5 5 9-10"),
    Reviews: p("M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"),
    Content: p("M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"),
  };
  const shape = shapes[label];
  return (
    <Icon className={className}>
      {shape ?? <circle cx="12" cy="12" r="3" />}
    </Icon>
  );
}
