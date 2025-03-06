import { useEffect, useState } from "react";

export function useFetchData(
  fetchFunction,
  dependencies = [],
  autoRefresh = false,
  intervalTime = 5000
) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetchFunction();
      if (response) {
        setData(response);
      }
    } catch (err) {
      setError(err.message || "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const performFetch = async () => {
      if (isMounted) await fetchData();
    };

    performFetch();

    let interval;
    if (autoRefresh) {
      interval = setInterval(performFetch, intervalTime);
    }

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, dependencies);

  return {
    data,
    setData,
    loading,
    error,
    refetch: fetchData, // Add this line to return the refetch function
  };
}
