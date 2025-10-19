// src/hooks/useDebounce.jsx
import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Hook para debounce de valores
 * Siguiendo el patrón de tus hooks existentes
 */
export const useDebounce = (value, delay = 500, options = {}) => {
  const {
    leading = false, // Ejecutar inmediatamente en el primer cambio
    trailing = true, // Ejecutar después del delay
    maxWait = null, // Tiempo máximo de espera
  } = options;

  const [debouncedValue, setDebouncedValue] = useState(value);
  const timeoutRef = useRef(null);
  const maxTimeoutRef = useRef(null);
  const lastCallTimeRef = useRef(0);
  const lastInvokeTimeRef = useRef(0);
  const lastArgsRef = useRef(value);

  useEffect(() => {
    lastArgsRef.current = value;
    const currentTime = Date.now();

    // Si es leading y es la primera llamada
    if (leading && currentTime - lastInvokeTimeRef.current >= delay) {
      setDebouncedValue(value);
      lastInvokeTimeRef.current = currentTime;
      return;
    }

    // Limpiar timeout anterior
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Configurar timeout para trailing
    if (trailing) {
      timeoutRef.current = setTimeout(() => {
        setDebouncedValue(lastArgsRef.current);
        lastInvokeTimeRef.current = Date.now();
      }, delay);
    }

    // Manejar maxWait si está configurado
    if (maxWait && !maxTimeoutRef.current) {
      maxTimeoutRef.current = setTimeout(() => {
        setDebouncedValue(lastArgsRef.current);
        lastInvokeTimeRef.current = Date.now();

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        maxTimeoutRef.current = null;
      }, maxWait);
    }

    lastCallTimeRef.current = currentTime;

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (maxTimeoutRef.current) {
        clearTimeout(maxTimeoutRef.current);
        maxTimeoutRef.current = null;
      }
    };
  }, [value, delay, leading, trailing, maxWait]);

  // Función para cancelar el debounce pendiente
  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (maxTimeoutRef.current) {
      clearTimeout(maxTimeoutRef.current);
      maxTimeoutRef.current = null;
    }
  }, []);

  // Función para ejecutar inmediatamente
  const flush = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (maxTimeoutRef.current) {
      clearTimeout(maxTimeoutRef.current);
      maxTimeoutRef.current = null;
    }
    setDebouncedValue(lastArgsRef.current);
    lastInvokeTimeRef.current = Date.now();
  }, []);

  return {
    debouncedValue,
    cancel,
    flush,
    isPending: timeoutRef.current !== null,
  };
};

/**
 * Hook para debounce de funciones
 */
export const useDebouncedCallback = (
  callback,
  delay = 500,
  dependencies = []
) => {
  const timeoutRef = useRef(null);

  const debouncedCallback = useCallback(
    (...args) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay, ...dependencies]
  );

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const flush = useCallback(
    (...args) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      callback(...args);
    },
    [callback]
  );

  // Cleanup en desmontaje
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    debouncedCallback,
    cancel,
    flush,
    isPending: timeoutRef.current !== null,
  };
};

/**
 * Hook simple de debounce (versión más básica)
 */
export const useSimpleDebounce = (value, delay = 500) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};
