export interface Account {
  id: string;
  username: string;
  account_type: "Offline" | "Microsoft";
  avatar_url: string | null;
  skin_path: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  is_active: boolean;
}

export type AccountType = "Offline" | "Microsoft";