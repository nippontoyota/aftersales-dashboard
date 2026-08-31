function base(children: React.ReactNode) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-[18px] w-[18px]" aria-hidden="true">
      {children}
    </svg>
  );
}

export const RevenueIcon = () =>
  base(
    <>
      <path d="M3 15l4.5-5 3 3L16.5 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.5 6H16.5V10" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );

export const WrenchIcon = () =>
  base(
    <path
      d="M14.7 6.3a3.5 3.5 0 0 1-4.6 4.6l-4.8 4.8a1.5 1.5 0 0 1-2.1-2.1l4.8-4.8a3.5 3.5 0 0 1 4.6-4.6l-2.3 2.3 1.1 1.1 2.3-2.3z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );

export const TargetIcon = () =>
  base(
    <>
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="3.5" />
      <circle cx="10" cy="10" r="0.6" fill="currentColor" />
    </>
  );

export const PercentIcon = () =>
  base(
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="14" cy="14" r="2" />
      <path d="M15 5L5 15" strokeLinecap="round" />
    </>
  );

export const SparkleIcon = () =>
  base(<path d="M10 3l1.3 4.2L15.5 8.5l-4.2 1.3L10 14l-1.3-4.2L4.5 8.5l4.2-1.3L10 3z" strokeLinejoin="round" />);

export const StorefrontIcon = () =>
  base(
    <>
      <path d="M3.5 8.5V16h13V8.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 5.5l1-2h13l1 2M2.5 5.5a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );

export const BellIcon = () =>
  base(
    <>
      <path d="M5 8a5 5 0 0 1 10 0c0 3.5 1.2 4.8 1.2 4.8H3.8S5 11.5 5 8z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.3 15.5a1.8 1.8 0 0 0 3.4 0" strokeLinecap="round" />
    </>
  );
