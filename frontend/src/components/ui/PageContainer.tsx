import React from 'react';

interface Props {
  children: React.ReactNode;
  className?: string;
}

/** Standard authenticated page width for all screens. */
export default function PageContainer({ children, className = '' }: Props) {
  return (
    <div className={`w-full max-w-[1680px] mx-auto ${className}`}>
      {children}
    </div>
  );
}
