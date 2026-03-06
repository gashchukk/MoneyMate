export interface Transaction {
  id: number;
  user_id: number;
  account_id: number;
  external_tx_id?: string | null;
  time: number;
  description?: string | null;
  amount: number;
  currency_code: number;
  mcc: number | null;
  source: string;
  category?: string | null;
  created_at: number;
}

export interface Account {
  id: number;
  name: string;
  type: string;
  source: string;
  balance?: number;
  currency_code: number;
}
