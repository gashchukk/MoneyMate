import { useState, useEffect, useCallback } from 'react';
import type { NBURate } from '@/constants/displayCurrencies';

const NBU_URL = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json';

/**
 * NBU cross-rates (UAH per 1 unit of foreign). Used to show all balances in system currency.
 */
export function useNbuRates() {
  const [allRates, setAllRates] = useState<Record<string, number>>({});
  const [allRatesList, setAllRatesList] = useState<NBURate[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(NBU_URL);
      const data: NBURate[] = await res.json();
      if (!Array.isArray(data)) return;
      const map: Record<string, number> = {};
      data.forEach(r => {
        map[r.cc] = r.rate;
      });
      setAllRates(map);
      setAllRatesList(data);
    } catch {
      /* keep previous */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { allRates, allRatesList, refresh };
}
