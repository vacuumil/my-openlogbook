import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

/** One heading style for every section, so each screen opens with what it is for. */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-3 sm:mb-4">
    <div className="min-w-0">
      <h1 className="text-lg sm:text-2xl font-black tracking-tight text-avionics-text">{title}</h1>
      {description && <p className="mt-0.5 text-xs sm:text-sm text-avionics-muted">{description}</p>}
    </div>
    {actions}
  </div>
);
