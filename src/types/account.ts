export type AccountType = "Offline" | "Microsoft" | "ThirdParty";

export interface Account {
  id: string;
  username: string;
  account_type: AccountType;
  avatar_url: string | null;
  skin_path: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  is_active: boolean;
  /** 外置登录认证服务器地址（仅 ThirdParty 账号） */
  auth_server?: string | null;
}
