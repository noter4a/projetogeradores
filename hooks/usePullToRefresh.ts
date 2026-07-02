import { useCallback, useEffect, useRef, useState } from 'react';

const PULL_THRESHOLD = 72;
const MAX_PULL = 120;

export function usePullToRefresh(onRefresh: () => Promise<void>, disabled = false) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [statusText, setStatusText] = useState('');
  const startY = useRef(0);
  const pulling = useRef(false);
  const pullDistanceRef = useRef(0);

  const getScrollTop = () => {
    const main = document.querySelector('main');
    return main?.scrollTop ?? window.scrollY;
  };

  const reset = useCallback(() => {
    pulling.current = false;
    startY.current = 0;
    pullDistanceRef.current = 0;
    setPullDistance(0);
    if (!refreshing) setStatusText('');
  }, [refreshing]);

  const triggerRefresh = useCallback(async () => {
    setRefreshing(true);
    setStatusText('Atualizando…');
    setPullDistance(56);
    try {
      await onRefresh();
      setStatusText('Dados atualizados');
    } catch {
      setStatusText('Falha ao atualizar');
    } finally {
      setTimeout(() => {
        setRefreshing(false);
        reset();
      }, 600);
    }
  }, [onRefresh, reset]);

  useEffect(() => {
    if (disabled) return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing || getScrollTop() > 4) return;
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current || refreshing) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) {
        setPullDistance(0);
        setStatusText('');
        return;
      }
      if (getScrollTop() > 4) {
        reset();
        return;
      }
      e.preventDefault();
      const dist = Math.min(delta * 0.55, MAX_PULL);
      pullDistanceRef.current = dist;
      setPullDistance(dist);
      setStatusText(dist >= PULL_THRESHOLD ? 'Solte para atualizar' : 'Puxe para atualizar');
    };

    const onTouchEnd = async () => {
      if (!pulling.current || refreshing) return;
      if (pullDistanceRef.current >= PULL_THRESHOLD) {
        await triggerRefresh();
      } else {
        reset();
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [disabled, refreshing, reset, triggerRefresh]);

  return { pullDistance, refreshing, statusText };
}
