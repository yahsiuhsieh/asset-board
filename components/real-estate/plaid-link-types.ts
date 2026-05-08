export interface PlaidLinkAccount {
  id?: string;
  account_id?: string;
}

export interface PlaidLinkMetadata {
  accounts?: PlaidLinkAccount[];
}

export interface PlaidLinkHandler {
  open: () => void;
}

export interface PlaidLinkConfig {
  token: string;
  receivedRedirectUri?: string;
  onSuccess: (publicToken: string | null, metadata: PlaidLinkMetadata) => void;
  onExit: (error: { display_message?: string; error_message?: string } | null) => void;
}

declare global {
  interface Window {
    Plaid?: {
      create: (config: PlaidLinkConfig) => PlaidLinkHandler;
    };
  }
}
