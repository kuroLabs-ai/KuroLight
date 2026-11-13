import React from 'react';

export const SectionHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-[10px] font-bold uppercase tracking-wider text-obsidian-textMut mb-2">
    {children}
  </h3>
);
