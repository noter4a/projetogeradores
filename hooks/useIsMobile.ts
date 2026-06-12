import { useState, useEffect } from 'react';

/**
 * Custom hook that tracks whether the viewport is mobile-sized (< 768px).
 * Replaces duplicated useState + resize listener patterns across components.
 */
export const useIsMobile = (breakpoint = 768): boolean => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);

  return isMobile;
};
