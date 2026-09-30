import type { ReactNode } from 'react';

type IconProps = { size?: number; strokeWidth?: number };

function Svg({ size = 22, strokeWidth = 2, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const BackIcon = (p: IconProps) => <Svg size={24} {...p}><path d="M15 18l-6-6 6-6" /></Svg>;
export const ChevronRight = (p: IconProps) => <Svg size={20} {...p}><path d="M9 18l6-6-6-6" /></Svg>;
export const HomeIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" /></Svg>
);
export const MoreIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></Svg>
);
export const PlusIcon = (p: IconProps) => <Svg size={20} strokeWidth={2.2} {...p}><path d="M12 5v14" /><path d="M5 12h14" /></Svg>;
export const ListIcon = (p: IconProps) => (
  <Svg {...p}><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></Svg>
);
export const GlassIcon = (p: IconProps) => (
  <Svg {...p}><path d="M7 7h10v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" /><path d="M7 11h10" /><path d="M9 3h6" /></Svg>
);
export const BreweryIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 21h18" /><path d="M5 21V10l7-5 7 5v11" /><path d="M10 21v-6h4v6" /></Svg>
);
export const PourIcon = (p: IconProps) => <Svg {...p}><path d="M6 3h12l-2 18H8z" /><path d="M6.5 8h11" /></Svg>;
export const PencilIcon = (p: IconProps) => (
  <Svg size={18} {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></Svg>
);
export const PrintIcon = (p: IconProps) => (
  <Svg size={18} {...p}><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v7H6z" /></Svg>
);
export const ScreenIcon = (p: IconProps) => (
  <Svg size={18} {...p}><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></Svg>
);
export const ReorderIcon = (p: IconProps) => (
  <Svg size={18} {...p}><path d="M7 4v16" /><path d="M3 8l4-4 4 4" /><path d="M17 20V4" /><path d="M13 16l4 4 4-4" /></Svg>
);
export const UpIcon = (p: IconProps) => <Svg size={20} {...p}><path d="M18 15l-6-6-6 6" /></Svg>;
export const DownIcon = (p: IconProps) => <Svg size={20} {...p}><path d="M6 9l6 6 6-6" /></Svg>;
export const TrashIcon = (p: IconProps) => (
  <Svg size={18} {...p}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /></Svg>
);
export const CloseIcon = (p: IconProps) => <Svg {...p}><path d="M6 6l12 12" /><path d="M18 6L6 18" /></Svg>;
export const SearchIcon = (p: IconProps) => <Svg size={18} {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Svg>;
export const CheckIcon = (p: IconProps) => <Svg size={16} strokeWidth={2.6} {...p}><path d="M5 12l5 5L20 7" /></Svg>;
export const MugIcon = (p: IconProps) => (
  <Svg size={20} {...p}>
    <path d="M6 8h10v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" />
    <path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16" />
    <path d="M6 8c0-2 1.5-4 4-4 1 0 1.5.5 2 1 .5-.5 1.5-1 2.5-1C16 4 16 6 16 8" />
  </Svg>
);
export const UploadIcon = (p: IconProps) => (
  <Svg size={18} {...p}><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></Svg>
);
export const ImageIcon = (p: IconProps) => (
  <Svg size={28} strokeWidth={1.6} {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></Svg>
);
