import { useState, useEffect } from "react";

export function useFetchData(
  fetchFunction,
  dependencies = [],
  autoRefresh = false,
  intervalTime = 5000
) {
  const [data, setData] = useState([]); // Inicializa con un array vacío en lugar de undefined
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetchFunction();
        if (isMounted && response) {
          setData(response);
        }
      } catch (err) {
        if (isMounted) setError(err.message || "Error desconocido");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();

    let interval;
    if (autoRefresh) {
      interval = setInterval(fetchData, intervalTime);
    }

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, dependencies);

  return { data, setData, loading, error };
}
